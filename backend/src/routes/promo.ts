import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireAdmin } from "../auth/middleware.js";

/** Compute discounted total. */
export function applyPct(totalUSD: number, pct: number) {
  const discount = Math.round(totalUSD * pct) / 100;
  return {
    discountUSD: round2(discount),
    finalUSD: round2(Math.max(0, totalUSD - discount)),
  };
}
const round2 = (n: number) => Math.round(n * 100) / 100;

const normalize = (s: string) => s.trim().toUpperCase();

/**
 * Validate a promo code for the current user.
 * Does NOT redeem — only checks and returns the discount.
 * Redemption happens atomically inside POST /orders.
 */
export async function promoRoutes(app: FastifyInstance) {
  const ValidateSchema = z.object({
    code: z.string().min(1).max(64),
    totalUSD: z.number().nonnegative(),
  });

  app.post("/promo/validate", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = ValidateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "validation_failed" });

    const code = normalize(parsed.data.code);
    const promo = await prisma.promoCode.findUnique({ where: { code } });
    if (!promo || !promo.active) {
      return reply.code(404).send({ error: "promo_not_found" });
    }

    const used = await prisma.promoRedemption.findUnique({
      where: {
        promoId_userTgId: { promoId: promo.id, userTgId: req.user!.tgId },
      },
    }).catch(() => null);
    if (used) return reply.code(409).send({ error: "promo_already_used" });

    const { discountUSD, finalUSD } = applyPct(parsed.data.totalUSD, promo.discountPct);
    return {
      code: promo.code,
      discountPct: promo.discountPct,
      discountUSD,
      finalUSD,
    };
  });

  // ============== ADMIN CRUD ==============

  app.get("/admin/promo", { preHandler: requireAdmin }, async () => {
    const list = await prisma.promoCode.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { redemptions: true } } },
    });
    return list.map((p) => ({
      id: p.id,
      code: p.code,
      discountPct: p.discountPct,
      active: p.active,
      createdAt: p.createdAt.toISOString(),
      redemptions: p._count.redemptions,
    }));
  });

  const CreateSchema = z.object({
    code: z.string().min(2).max(64).regex(/^[A-Za-z0-9_-]+$/, "code must be alphanumeric"),
    discountPct: z.number().int().min(1).max(100),
    active: z.boolean().optional(),
  });

  app.post("/admin/promo", { preHandler: requireAdmin }, async (req, reply) => {
    const parsed = CreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    try {
      const created = await prisma.promoCode.create({
        data: {
          code: normalize(parsed.data.code),
          discountPct: parsed.data.discountPct,
          active: parsed.data.active ?? true,
        },
      });
      return { id: created.id, code: created.code, discountPct: created.discountPct, active: created.active };
    } catch (e: any) {
      if (e?.code === "P2002") return reply.code(409).send({ error: "code_exists" });
      throw e;
    }
  });

  app.patch<{ Params: { id: string } }>(
    "/admin/promo/:id",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const Schema = z.object({
        active: z.boolean().optional(),
        discountPct: z.number().int().min(1).max(100).optional(),
      });
      const parsed = Schema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
      const updated = await prisma.promoCode.update({
        where: { id: req.params.id },
        data: parsed.data,
      });
      return updated;
    }
  );

  app.delete<{ Params: { id: string } }>(
    "/admin/promo/:id",
    { preHandler: requireAdmin },
    async (req) => {
      await prisma.promoCode.delete({ where: { id: req.params.id } });
      return { ok: true };
    }
  );
}
