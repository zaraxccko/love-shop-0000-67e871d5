import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireAdminOrModerator } from "../auth/middleware.js";

// Допустимые типы событий — белый список, чтобы фронт не плодил мусор.
const EVENT_TYPES = [
  "start",
  "lang_switch",
  "bot_blocked",
  "bot_unblocked",
  "catalog_open",
  "product_view",
  "cart_add",
  "cart_remove",
  "cart_clear",
  "checkout_open",
] as const;

const PayloadSchema = z.record(z.string(), z.unknown()).optional();
const InputSchema = z.object({
  type: z.enum(EVENT_TYPES),
  payload: PayloadSchema,
});

/** Прямой запись события (для bot.ts и любого серверного кода). */
export async function logUserEvent(
  userTgId: bigint | number,
  type: (typeof EVENT_TYPES)[number],
  payload?: Record<string, unknown>
): Promise<void> {
  try {
    await prisma.userEvent.create({
      data: {
        userTgId: typeof userTgId === "bigint" ? userTgId : BigInt(userTgId),
        type,
        payload: (payload ?? null) as any,
      },
    });
  } catch (err: any) {
    // Не валим основной поток если FK ещё не существует / БД недоступна.
    console.warn(`[events] log failed tgId=${userTgId} type=${type}: ${err?.message ?? err}`);
  }
}

export async function eventsRoutes(app: FastifyInstance) {
  // ── Юзер: записать событие из webapp ───────────────────────
  app.post("/me/events", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = InputSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    await logUserEvent(req.user!.tgId, parsed.data.type, parsed.data.payload);
    return { ok: true };
  });

  // ── Админ: общая лента ─────────────────────────────────────
  app.get<{
    Querystring: { limit?: string; offset?: string; type?: string; tgId?: string };
  }>("/admin/events", { preHandler: requireAdminOrModerator }, async (req) => {
    const limit = Math.min(Number(req.query.limit ?? 100), 500);
    const offset = Math.max(0, Number(req.query.offset ?? 0));
    const type = req.query.type && (EVENT_TYPES as readonly string[]).includes(req.query.type)
      ? req.query.type
      : undefined;
    let userTgId: bigint | undefined;
    if (req.query.tgId) {
      try { userTgId = BigInt(req.query.tgId); } catch {}
    }

    const where: any = {};
    if (type) where.type = type;
    if (userTgId !== undefined) where.userTgId = userTgId;

    const [items, total] = await Promise.all([
      prisma.userEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          user: {
            select: { tgId: true, username: true, firstName: true, lastName: true },
          },
        },
      }),
      prisma.userEvent.count({ where }),
    ]);

    return {
      total,
      events: items.map((e) => ({
        id: e.id,
        type: e.type,
        payload: e.payload,
        createdAt: e.createdAt.toISOString(),
        user: {
          tgId: e.user.tgId.toString(),
          username: e.user.username,
          firstName: e.user.firstName,
          lastName: e.user.lastName,
        },
      })),
    };
  });

  // ── Админ: история конкретного юзера ───────────────────────
  app.get<{ Params: { tgId: string }; Querystring: { limit?: string } }>(
    "/admin/users/:tgId/events",
    { preHandler: requireAdminOrModerator },
    async (req, reply) => {
      let tgId: bigint;
      try { tgId = BigInt(req.params.tgId); } catch { return reply.code(400).send({ error: "bad_tg_id" }); }
      const limit = Math.min(Number(req.query.limit ?? 200), 500);
      const items = await prisma.userEvent.findMany({
        where: { userTgId: tgId },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      return {
        events: items.map((e) => ({
          id: e.id,
          type: e.type,
          payload: e.payload,
          createdAt: e.createdAt.toISOString(),
        })),
      };
    }
  );
}

/** Удаление событий старше 30 дней. Запускается раз в сутки. */
export async function pruneOldEvents(): Promise<void> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  try {
    const { count } = await prisma.userEvent.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    if (count > 0) console.log(`[events] pruned ${count} events older than 30d`);
  } catch (err: any) {
    console.warn(`[events] prune failed: ${err?.message ?? err}`);
  }
}

export function startEventsPruneJob() {
  // Первый запуск через 5 минут после старта, далее каждые 24 часа.
  setTimeout(() => {
    pruneOldEvents();
    setInterval(pruneOldEvents, 24 * 60 * 60 * 1000);
  }, 5 * 60 * 1000);
}
