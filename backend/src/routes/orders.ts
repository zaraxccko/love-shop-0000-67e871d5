import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../auth/middleware.js";
import { notifyOrdersChat } from "../bot.js";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Терпимая схема: фронт может слать строку либо как { productId } либо как { product: {...} }.
// Подарки могут не иметь priceUSD/variantId. Главное — валидное qty и хоть какой-то идентификатор товара.
const CartLineSchema = z
  .object({
    productId: z.string().optional(),
    product: z.any().optional(),
    productName: z.any().optional(),
    qty: z.number().int().positive().max(99),
    variantId: z.string().optional(),
    districtSlug: z.string().nullish(),
    stashType: z.string().nullish(),
    priceUSD: z.number().nonnegative().nullish(),
    isGift: z.boolean().optional(),
  })
  .passthrough()
  .superRefine((item, ctx) => {
    const productId = item.productId ?? item.product?.id;
    if (!productId || typeof productId !== "string") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "product_id_required", path: ["productId"] });
    }
  });

const CreateOrderSchema = z.object({
  totalUSD: z.number().nonnegative().max(1000000),
  items: z.array(CartLineSchema).min(1).max(50),
  delivery: z.boolean(),
  deliveryAddress: z.string().max(500).nullish(),
  crypto: z.string().nullish(),
  payAddress: z.string().nullish(),
  promoCode: z.string().min(1).max(64).nullish(),
});

export async function orderRoutes(app: FastifyInstance) {
  /**
   * POST /api/orders — оформить заказ.
   * Без баланса: просто создаём запись со статусом "awaiting".
   * Защита от дублей: если последний awaiting-заказ юзера создан < 5 сек назад с тем же total — возвращаем его.
   */
  app.post("/orders", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = CreateOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      req.log.warn({ issues: parsed.error.flatten(), body: req.body }, "order validation failed");
      return reply.code(400).send({ error: "validation_failed", details: parsed.error.flatten() });
    }

    const data = parsed.data;
    if (data.delivery && !data.deliveryAddress?.toString().trim()) {
      return reply.code(400).send({ error: "delivery_address_required" });
    }

    const snapshotItems = data.items.map((item: any) => ({
      ...item,
      productId: item.productId ?? item.product?.id,
      productName: item.productName ?? item.product?.name,
      priceUSD: item.priceUSD ?? 0,
    }));

    const recentSame = await prisma.order.findFirst({
      where: {
        userTgId: req.user!.tgId,
        status: "awaiting",
        totalUSD: data.totalUSD,
        delivery: data.delivery,
        createdAt: { gte: new Date(Date.now() - 5_000) },
      },
      orderBy: { createdAt: "desc" },
    });
    if (recentSame) {
      return reply.code(200).send(serialize(recentSame));
    }

    const user = await prisma.user.findUnique({ where: { tgId: req.user!.tgId } });
    if (!user) return reply.code(401).send({ error: "unauthorized" });

    // ---- Promo code (optional). Validate + redeem atomically.
    let appliedPromo: { code: string; discountPct: number; discountUSD: number } | null = null;
    let finalTotalUSD = data.totalUSD;
    let promoIdToRedeem: string | null = null;

    if (data.promoCode) {
      const code = data.promoCode.trim().toUpperCase();
      const promo = await prisma.promoCode.findUnique({ where: { code } });
      if (!promo || !promo.active) {
        return reply.code(400).send({ error: "promo_not_found" });
      }
      const used = await prisma.promoRedemption.findUnique({
        where: {
          promoId_userTgId: { promoId: promo.id, userTgId: user.tgId },
        },
      }).catch(() => null);
      if (used) return reply.code(409).send({ error: "promo_already_used" });

      const discountUSD = Math.round(data.totalUSD * promo.discountPct) / 100;
      finalTotalUSD = Math.max(0, Math.round((data.totalUSD - discountUSD) * 100) / 100);
      promoIdToRedeem = promo.id;
      appliedPromo = { code: promo.code, discountPct: promo.discountPct, discountUSD: Math.round(discountUSD * 100) / 100 };
    }

    try {
      const order = await prisma.$transaction(async (tx) => {
        const created = await tx.order.create({
          data: {
            userTgId: user.tgId,
            totalUSD: finalTotalUSD,
            items: snapshotItems as any,
            delivery: data.delivery,
            deliveryAddress: data.deliveryAddress ?? undefined,
            crypto: data.crypto ?? undefined,
            payAddress: data.payAddress ?? undefined,
            status: "awaiting",
          },
        });
        if (promoIdToRedeem && appliedPromo) {
          // Unique (promoId, userTgId) — race-safe.
          await tx.promoRedemption.create({
            data: {
              promoId: promoIdToRedeem,
              userTgId: user.tgId,
              orderId: created.id,
              discountPct: appliedPromo.discountPct,
            },
          });
        }
        return created;
      });

      try {
        const who = user.username ? `@${user.username}` : user.firstName ?? `tg:${order.userTgId}`;
        const itemsArr = Array.isArray(order.items) ? (order.items as any[]) : [];
        const itemsCount = itemsArr.length;
        const itemsLines = itemsArr.slice(0, 20).map((it: any) => {
          const nameRaw = it?.productName ?? it?.product?.name ?? it?.name ?? it?.productId ?? "Товар";
          const name = typeof nameRaw === "string" ? nameRaw : nameRaw?.ru ?? nameRaw?.en ?? "Товар";
          const variant = it?.variantId || it?.product?.weight || "";
          const qty = Number(it?.qty ?? 1);
          return `• ${escapeHtml(String(name))}${variant ? ` (${escapeHtml(String(variant))})` : ""} ×${qty}`;
        }).join("\n");
        const cryptoLine = order.crypto ? ` (${order.crypto})` : "";
        const promoLine = appliedPromo
          ? `\n🎟️ промокод: ${appliedPromo.code} (-${appliedPromo.discountPct}% / -$${appliedPromo.discountUSD.toFixed(2)})`
          : "";
        const text =
          `🛒 <b>Новая заявка на заказ</b> #${order.id}\n` +
          `👤 ${who}\n` +
          `💰 $${order.totalUSD.toFixed(2)}${cryptoLine}\n` +
          `📦 позиций: ${itemsCount}` +
          (itemsLines ? `\n${itemsLines}` : "") +
          (order.delivery ? `\n🚚 доставка: ${order.deliveryAddress ?? "—"}` : "") +
          promoLine;
        notifyOrdersChat(text).catch((err) =>
          req.log.error({ err }, "notifyOrdersChat failed for new order")
        );
      } catch (err) {
        req.log.error({ err }, "failed to build admin notification");
      }

      return serialize(order);
    } catch (e: any) {
      if (e?.code === "P2002" && String(e?.meta?.target ?? "").includes("promo")) {
        return reply.code(409).send({ error: "promo_already_used" });
      }
      req.log.error({ err: e, body: req.body }, "failed to create order");
      return reply.code(500).send({ error: "internal", message: String(e?.message ?? e) });
    }
  });

  /** GET /api/orders/me — мои заказы */
  app.get("/orders/me", { preHandler: requireAuth }, async (req) => {
    const list = await prisma.order.findMany({
      where: { userTgId: req.user!.tgId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return list.map(serialize);
  });
}

export function serialize(o: any) {
  const photos: string[] = Array.isArray(o.confirmPhotoUrls) && o.confirmPhotoUrls.length
    ? o.confirmPhotoUrls
    : (o.confirmPhotoUrl ? [o.confirmPhotoUrl] : []);
  return {
    id: o.id,
    createdAt: o.createdAt.toISOString(),
    totalUSD: o.totalUSD,
    items: o.items,
    delivery: o.delivery,
    deliveryAddress: o.deliveryAddress ?? undefined,
    status: o.status,
    crypto: o.crypto ?? undefined,
    payAddress: o.payAddress ?? undefined,
    confirmPhoto: photos[0],
    confirmPhotos: photos,
    confirmText: o.confirmText ?? undefined,
    confirmedAt: o.confirmedAt?.toISOString(),
  };
}
