import { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/middleware.js";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { bot } from "../bot.js";

// ── Допустимые типы событий ─────────────────────────────────
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

export type UserEventType = (typeof EVENT_TYPES)[number];

const META: Record<UserEventType, { emoji: string; label: string }> = {
  start: { emoji: "🚀", label: "запустил бота" },
  lang_switch: { emoji: "🌐", label: "сменил язык" },
  bot_blocked: { emoji: "🚫", label: "заблокировал бота" },
  bot_unblocked: { emoji: "🔓", label: "разблокировал бота" },
  catalog_open: { emoji: "👀", label: "открыл каталог" },
  product_view: { emoji: "🛍", label: "посмотрел товар" },
  cart_add: { emoji: "➕", label: "в корзину" },
  cart_remove: { emoji: "➖", label: "убрал из корзины" },
  cart_clear: { emoji: "🧹", label: "очистил корзину" },
  checkout_open: { emoji: "💳", label: "перешёл к оформлению" },
};

const PayloadSchema = z.record(z.string(), z.unknown()).optional();
const InputSchema = z.object({
  type: z.enum(EVENT_TYPES),
  payload: PayloadSchema,
});

interface BufferedEvent {
  type: UserEventType;
  payload?: Record<string, unknown>;
  at: number;
}

// Буфер событий по юзерам, чтобы не флудить в чат админам.
const buffer = new Map<string, BufferedEvent[]>();
const userMetaCache = new Map<string, { username: string | null; firstName: string | null }>();

const FLUSH_INTERVAL_MS = 5_000;
const MAX_EVENTS_PER_USER_PER_FLUSH = 15;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function describe(type: UserEventType, payload?: Record<string, unknown>): string {
  if (!payload) return "";
  const p = payload as Record<string, any>;
  switch (type) {
    case "cart_add":
      return [p.name, p.grams ? `${p.grams}г` : null].filter(Boolean).join(" · ");
    case "cart_remove":
    case "product_view":
      return p.name ?? "";
    case "catalog_open":
      return p.citySlug ? `город: ${p.citySlug}` : "";
    case "checkout_open":
      return [
        p.itemsCount ? `позиций: ${p.itemsCount}` : null,
        p.delivery ? "🚚 доставка" : null,
      ].filter(Boolean).join(" · ");
    case "lang_switch":
      return p.lang ? `→ ${p.lang}` : "";
    case "bot_blocked":
      return p.reason ?? "";
    default:
      return "";
  }
}

function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

async function flush() {
  if (buffer.size === 0) return;
  const chatId = env.eventsNotifyChatId;
  if (!Number.isFinite(chatId)) return;

  const snapshot = new Map(buffer);
  buffer.clear();

  for (const [tgId, events] of snapshot) {
    if (events.length === 0) continue;

    // Подтягиваем метаданные юзера один раз, кешируем.
    let meta = userMetaCache.get(tgId);
    if (!meta) {
      try {
        const u = await prisma.user.findUnique({
          where: { tgId: BigInt(tgId) },
          select: { username: true, firstName: true },
        });
        meta = { username: u?.username ?? null, firstName: u?.firstName ?? null };
        userMetaCache.set(tgId, meta);
      } catch {
        meta = { username: null, firstName: null };
      }
    }

    const who = meta.username
      ? `@${escapeHtml(meta.username)}`
      : meta.firstName
        ? escapeHtml(meta.firstName)
        : `TG ${tgId}`;

    const head = `👤 <b>${who}</b> <code>${tgId}</code>`;
    const limited = events.slice(-MAX_EVENTS_PER_USER_PER_FLUSH);
    const truncated = events.length - limited.length;

    const lines = limited.map((e) => {
      const m = META[e.type];
      const detail = describe(e.type, e.payload);
      return `<code>${formatTime(e.at)}</code> ${m.emoji} ${m.label}${detail ? ` — ${escapeHtml(detail)}` : ""}`;
    });

    if (truncated > 0) lines.unshift(`<i>… ещё ${truncated} событий</i>`);

    const text = `${head}\n${lines.join("\n")}`;

    try {
      await bot.sendMessage(chatId, text, { parse_mode: "HTML", disable_web_page_preview: true });
    } catch (err: any) {
      const code = err?.response?.body?.error_code ?? err?.code;
      const desc = err?.response?.body?.description ?? err?.message;
      console.warn(`[events] notify chat failed: ${code ?? "?"} — ${desc}`);
    }
  }
}

let flushTimer: NodeJS.Timeout | null = null;
export function startEventsNotifier() {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    flush().catch((err) => console.warn(`[events] flush error: ${err?.message ?? err}`));
  }, FLUSH_INTERVAL_MS);
}

/** Прямой вызов из bot.ts / любого серверного кода — кладёт в буфер. */
export function logUserEvent(
  userTgId: bigint | number | string,
  type: UserEventType,
  payload?: Record<string, unknown>
): void {
  try {
    const key = String(userTgId);
    const list = buffer.get(key) ?? [];
    list.push({ type, payload, at: Date.now() });
    buffer.set(key, list);
  } catch (err: any) {
    console.warn(`[events] buffer push failed: ${err?.message ?? err}`);
  }
}

export async function eventsRoutes(app: FastifyInstance) {
  app.post("/me/events", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = InputSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    logUserEvent(req.user!.tgId.toString(), parsed.data.type, parsed.data.payload);
    return { ok: true };
  });
}
