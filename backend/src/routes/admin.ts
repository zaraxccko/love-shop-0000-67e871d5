import { FastifyInstance } from "fastify";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { prisma } from "../db.js";
import { requireAdmin } from "../auth/middleware.js";
import { env } from "../env.js";
import { broadcast, bot } from "../bot.js";
import { serializeProduct, serializeCategory } from "./catalog.js";
import { serialize as serializeOrder } from "./orders.js";

export async function adminRoutes(app: FastifyInstance) {
  // ============== AWAITING / HISTORY ==============

  app.get("/admin/awaiting", { preHandler: requireAdmin }, async () => {
    const orders = await prisma.order.findMany({
      where: { status: "awaiting" },
      orderBy: { createdAt: "desc" },
      include: { user: true },
    });
    return {
      orders: orders.map((o) => ({ ...serializeOrder(o), customer: customerOf(o.user) })),
      deposits: [],
    };
  });

  app.get<{ Querystring: { limit?: string; offset?: string } }>(
    "/admin/history",
    { preHandler: requireAdmin },
    async (req) => {
      const limit = Math.min(Number(req.query.limit ?? 50), 200);
      const offset = Number(req.query.offset ?? 0);
      const orders = await prisma.order.findMany({
        where: { status: { not: "awaiting" } },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: { user: true },
      });
      return {
        orders: orders.map((o) => ({ ...serializeOrder(o), customer: customerOf(o.user) })),
        deposits: [],
      };
    }
  );

  // ============== ORDER CONFIRM / CANCEL / EDIT / MESSAGE ==============

  /** POST /admin/orders/:id/confirm — multipart: photo (file, optional, repeatable), text (string, optional) */
  app.post<{ Params: { id: string } }>(
    "/admin/orders/:id/confirm",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const order = await prisma.order.findUnique({ where: { id: req.params.id } });
      if (!order) return reply.code(404).send({ error: "not_found" });

      const photoUrls: string[] = [];
      const photoPaths: string[] = [];
      let text: string | undefined;

      const parts = req.parts();
      for await (const part of parts) {
        if (part.type === "file" && (part.fieldname === "photo" || part.fieldname === "photos" || part.fieldname.startsWith("photo"))) {
          await fs.mkdir(env.uploadDir, { recursive: true });
          const ext = path.extname(part.filename || "") || ".jpg";
          const name = `${Date.now()}_${crypto.randomBytes(6).toString("hex")}${ext}`;
          const fullPath = path.join(env.uploadDir, name);
          const buf = await part.toBuffer();
          await fs.writeFile(fullPath, buf);
          photoUrls.push(`${env.publicUploadUrl.replace(/\/$/, "")}/${name}`);
          photoPaths.push(fullPath);
        } else if (part.type === "field" && part.fieldname === "text") {
          text = String(part.value).slice(0, 4000);
        }
      }

      const updated = await prisma.order.update({
        where: { id: order.id },
        data: {
          status: "completed",
          confirmPhotoUrl: photoUrls[0],
          confirmPhotoUrls: photoUrls,
          confirmText: text,
          confirmedAt: new Date(),
        },
      });

      try {
        const caption = `✅ Ваш заказ #${order.id} подтверждён.${text ? "\n\n" + text : ""}`;
        const fsSync = await import("node:fs");
        if (photoPaths.length > 1) {
          // Telegram media group: до 10 фото за раз, caption — на первом
          const media = photoPaths.slice(0, 10).map((p, i) => ({
            type: "photo" as const,
            media: fsSync.createReadStream(p) as any,
            caption: i === 0 ? caption : undefined,
          }));
          await bot.sendMediaGroup(Number(order.userTgId), media as any);
        } else if (photoPaths.length === 1) {
          await bot.sendPhoto(Number(order.userTgId), fsSync.createReadStream(photoPaths[0]), { caption });
        } else {
          await bot.sendMessage(Number(order.userTgId), caption);
        }
      } catch (e) {
        req.log.error({ err: e }, "failed to notify user about order confirm");
      }

      return serializeOrder(updated);
    }
  );

  app.post<{ Params: { id: string } }>(
    "/admin/orders/:id/cancel",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const order = await prisma.order.findUnique({ where: { id: req.params.id } });
      if (!order) return reply.code(404).send({ error: "not_found" });
      if (order.status === "cancelled") return reply.code(400).send({ error: "already_cancelled" });
      const updated = await prisma.order.update({
        where: { id: order.id },
        data: { status: "cancelled" },
      });
      try {
        await bot.sendMessage(Number(order.userTgId), `❌ Ваш заказ #${order.id} отклонён.`);
      } catch {}
      return serializeOrder(updated);
    }
  );

  /** PATCH /admin/orders/:id — изменить items / totalUSD / deliveryAddress */
  const PatchOrderSchema = z.object({
    totalUSD: z.number().nonnegative().max(1_000_000).optional(),
    items: z.array(z.any()).min(1).max(50).optional(),
    deliveryAddress: z.string().max(500).optional(),
  });
  app.patch<{ Params: { id: string } }>(
    "/admin/orders/:id",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const parsed = PatchOrderSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
      const order = await prisma.order.findUnique({ where: { id: req.params.id } });
      if (!order) return reply.code(404).send({ error: "not_found" });
      const updated = await prisma.order.update({
        where: { id: order.id },
        data: {
          totalUSD: parsed.data.totalUSD ?? undefined,
          items: parsed.data.items ? (parsed.data.items as any) : undefined,
          deliveryAddress: parsed.data.deliveryAddress ?? undefined,
        },
      });
      return serializeOrder(updated);
    }
  );

  /** POST /admin/orders/:id/message — отправить юзеру произвольное сообщение в Telegram */
  const MessageSchema = z.object({ text: z.string().min(1).max(4000) });
  app.post<{ Params: { id: string } }>(
    "/admin/orders/:id/message",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const parsed = MessageSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
      const order = await prisma.order.findUnique({ where: { id: req.params.id } });
      if (!order) return reply.code(404).send({ error: "not_found" });
      try {
        await bot.sendMessage(Number(order.userTgId), parsed.data.text);
        return { ok: true };
      } catch (e: any) {
        return reply.code(502).send({ error: "send_failed", message: String(e?.message ?? e) });
      }
    }
  );

  // ============== PRODUCTS CRUD ==============

  const optionalString = (max: number) =>
    z.preprocess((value) => {
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      return trimmed === "" ? undefined : trimmed;
    }, z.string().max(max).optional());

  const optionalImageUrl = z.preprocess((value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  }, z.string().max(2_000_000).refine((value) => {
    if (value.startsWith("data:image/")) return true;
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }, "Invalid image URL").optional());

  const ProductInput = z.object({
    name: z.union([z.string(), z.object({ ru: z.string(), en: z.string() })]),
    description: z.union([z.string(), z.object({ ru: z.string(), en: z.string() })]),
    category: z.string().min(1).max(64),
    priceTHB: z.number().nonnegative().optional(),
    thcMg: z.number().int().optional(),
    cbdMg: z.number().int().optional(),
    weight: optionalString(32),
    inStock: z.number().int().nonnegative().optional(),
    gradient: z.string().optional(),
    emoji: z.string().max(8).optional(),
    imageUrl: optionalImageUrl,
    featured: z.boolean().optional(),
    badge: z.any().optional(),
    cities: z.array(z.string()).max(100).optional(),
    districts: z.array(z.string()).max(500).optional(),
    variants: z
      .array(
        z.object({
          slug: z.string().min(1).max(32),
          grams: z.number().positive(),
          pricesByCountry: z.record(z.string(), z.number().nonnegative()),
          stashes: z
            .array(z.object({ districtSlug: z.string(), type: z.enum(["prikop", "klad", "magnit"]) }))
            .optional(),
          districts: z.array(z.string()).optional(),
        })
      )
      .optional(),
  });

  app.post("/admin/products", { preHandler: requireAdmin }, async (req, reply) => {
    const parsed = ProductInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { variants = [], ...data } = parsed.data;
    const created = await prisma.product.create({
      data: {
        ...data,
        name: data.name as any,
        description: data.description as any,
        cities: data.cities ?? [],
        districts: data.districts ?? [],
        variants: {
          create: variants.map((v) => ({
            slug: v.slug,
            grams: v.grams,
            pricesByCountry: v.pricesByCountry,
            stashes: (v.stashes ?? []) as any,
            districts: v.districts ?? [],
          })),
        },
      },
      include: { variants: true },
    });
    return serializeProduct(created);
  });

  app.put<{ Params: { id: string } }>(
    "/admin/products/:id",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const parsed = ProductInput.partial().safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
      const { variants, ...data } = parsed.data;
      const updated = await prisma.$transaction(async (tx) => {
        await tx.product.update({
          where: { id: req.params.id },
          data: { ...data, name: data.name as any, description: data.description as any },
        });
        if (variants) {
          await tx.variant.deleteMany({ where: { productId: req.params.id } });
          await tx.variant.createMany({
            data: variants.map((v) => ({
              productId: req.params.id,
              slug: v.slug,
              grams: v.grams,
              pricesByCountry: v.pricesByCountry as any,
              stashes: (v.stashes ?? []) as any,
              districts: v.districts ?? [],
            })),
          });
        }
        return tx.product.findUnique({ where: { id: req.params.id }, include: { variants: true } });
      });
      return serializeProduct(updated);
    }
  );

  app.delete<{ Params: { id: string } }>(
    "/admin/products/:id",
    { preHandler: requireAdmin },
    async (req) => {
      await prisma.product.delete({ where: { id: req.params.id } });
      return { ok: true };
    }
  );

  // ============== CATEGORIES CRUD ==============

  const CategoryInput = z.object({
    slug: z.string().min(1).max(64).regex(/^[a-z0-9_-]+$/i, "slug must be alphanumeric/_/-"),
    name: z.union([z.string(), z.object({ ru: z.string(), en: z.string() })]),
    emoji: z.string().max(8).optional(),
    gradient: z.string().max(64).optional(),
    sortOrder: z.number().int().optional(),
  });

  app.post("/admin/categories", { preHandler: requireAdmin }, async (req, reply) => {
    const parsed = CategoryInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { slug, name, emoji, gradient, sortOrder } = parsed.data;
    const created = await prisma.category.upsert({
      where: { slug },
      update: { name: name as any, emoji, gradient, sortOrder },
      create: { slug, name: name as any, emoji, gradient, sortOrder },
    });
    return serializeCategory(created);
  });

  app.put<{ Params: { slug: string } }>(
    "/admin/categories/:slug",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const parsed = CategoryInput.partial().safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
      const { name, emoji, gradient, sortOrder } = parsed.data;
      const updated = await prisma.category.update({
        where: { slug: req.params.slug },
        data: { name: name as any, emoji, gradient, sortOrder },
      });
      return serializeCategory(updated);
    }
  );

  app.delete<{ Params: { slug: string } }>(
    "/admin/categories/:slug",
    { preHandler: requireAdmin },
    async (req) => {
      await prisma.category.delete({ where: { slug: req.params.slug } });
      return { ok: true };
    }
  );

  // ============== USERS LIST ==============

  app.get<{ Querystring: { limit?: string; offset?: string } }>(
    "/admin/users",
    { preHandler: requireAdmin },
    async (req) => {
      const limit = Math.min(Number(req.query.limit ?? 100), 500);
      const offset = Number(req.query.offset ?? 0);

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
          select: {
            tgId: true,
            username: true,
            firstName: true,
            lastName: true,
            lang: true,
            citySlug: true,
            createdAt: true,
            _count: { select: { orders: true } },
          },
        }),
        prisma.user.count(),
      ]);

      return {
        users: users.map((u) => ({
          tgId: u.tgId.toString(),
          username: u.username,
          firstName: u.firstName,
          lastName: u.lastName,
          lang: u.lang,
          citySlug: u.citySlug,
          createdAt: u.createdAt.toISOString(),
          ordersCount: u._count.orders,
        })),
        total,
      };
    }
  );


  // ============== ANALYTICS ==============

  app.get("/admin/analytics", { preHandler: requireAdmin }, async () => {
    const now = new Date();
    const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
    const startOf7d = new Date(startOfToday); startOf7d.setDate(startOf7d.getDate() - 6);
    const startOf30d = new Date(startOfToday); startOf30d.setDate(startOf30d.getDate() - 29);

    const [users, ordersAll] = await Promise.all([
      prisma.user.findMany({ select: { tgId: true, createdAt: true } }),
      prisma.order.findMany({
        select: { id: true, totalUSD: true, status: true, createdAt: true, userTgId: true, items: true },
      }),
    ]);

    const paidLikeOrders = ordersAll.filter((o) => ["paid", "in_delivery", "completed", "awaiting"].includes(o.status));
    const confirmedOrders = ordersAll.filter((o) => o.status === "completed");
    const orderUsers = new Set(paidLikeOrders.map((o) => o.userTgId.toString()));
    const activeUserIds = new Set<string>(ordersAll.map((o) => o.userTgId.toString()));

    const totals = {
      users: users.length,
      activations: users.length,
      dau: countDistinctUsersSince(ordersAll, startOfToday),
      wau: countDistinctUsersSince(ordersAll, startOf7d),
      mau: countDistinctUsersSince(ordersAll, startOf30d),
      gmvUSD: round2(paidLikeOrders.reduce((sum, o) => sum + o.totalUSD, 0)),
      ordersToday: paidLikeOrders.filter((o) => o.createdAt >= startOfToday).length,
      avgCheckUSD: paidLikeOrders.length
        ? round2(paidLikeOrders.reduce((sum, o) => sum + o.totalUSD, 0) / paidLikeOrders.length)
        : 0,
      purchasesCount: confirmedOrders.length,
      purchasesUSD: round2(confirmedOrders.reduce((sum, o) => sum + o.totalUSD, 0)),
    };

    return {
      totals,
      funnel: {
        starts: users.length,
        captchaPassed: users.length,
        miniAppOpened: users.length,
        firstOrder: orderUsers.size,
      },
      depositsFunnel: { created: 0, paid: 0, confirmed: 0 },
      activations7d: buildDailySeries(startOf7d, 7, (a, b) => users.filter((u) => u.createdAt >= a && u.createdAt < b).length),
      dau7d: buildDailySeries(startOf7d, 7, (a, b) => {
        const set = new Set<string>();
        for (const o of ordersAll) if (o.createdAt >= a && o.createdAt < b) set.add(o.userTgId.toString());
        return set.size;
      }),
      topProducts: buildTopProducts(paidLikeOrders),
      sources: [
        { source: "telegram", users: users.length },
        { source: "buyers", users: orderUsers.size },
        { source: "active", users: activeUserIds.size },
      ],
    };
  });

  // ============== BROADCAST ==============

  // Принимаем как https URL, так и data:image/...;base64,...
  const imageSchema = z
    .string()
    .max(15_000_000)
    .refine(
      (v) => v.startsWith("data:image/") || /^https?:\/\//.test(v),
      "image must be https URL or data:image/..."
    );

  // Нормализуем URL кнопки: @username → https://t.me/username, t.me/... → https://t.me/...
  const normalizeButtonUrl = (raw: string): string | null => {
    const v = raw.trim();
    if (!v) return null;
    if (/^https?:\/\//i.test(v)) return v;
    if (/^tg:\/\//i.test(v)) return v;
    if (v.startsWith("@")) return `https://t.me/${v.slice(1)}`;
    if (/^t\.me\//i.test(v)) return `https://${v}`;
    return null;
  };

  const BroadcastSchema = z.object({
    segment: z.enum(["all", "active", "inactive"]).default("all"),
    text: z.string().min(1).max(4000),
    image: imageSchema.nullish(),
    button: z
      .object({ text: z.string().min(1).max(64), url: z.string().min(1).max(2048) })
      .nullish(),
  });

  app.post("/broadcast", { preHandler: requireAdmin }, async (req, reply) => {
    const parsed = BroadcastSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { segment, text, image, button } = parsed.data;

    let normalizedButton: { text: string; url: string } | null = null;
    if (button) {
      const url = normalizeButtonUrl(button.url);
      if (!url) return reply.code(400).send({ error: "invalid_button_url" });
      normalizedButton = { text: button.text, url };
    }

    // Если пришёл data: URL — сохраняем картинку в uploads и шлём публичный URL
    let imageForSend: string | undefined;
    if (image) {
      if (image.startsWith("data:image/")) {
        const m = image.match(/^data:image\/(\w+);base64,(.+)$/);
        if (!m) return reply.code(400).send({ error: "invalid_image_data_url" });
        const ext = m[1] === "jpeg" ? "jpg" : m[1];
        const buf = Buffer.from(m[2], "base64");
        await fs.mkdir(env.uploadDir, { recursive: true });
        const name = `bcast_${Date.now()}_${crypto.randomBytes(6).toString("hex")}.${ext}`;
        await fs.writeFile(path.join(env.uploadDir, name), buf);
        imageForSend = `${env.publicUploadUrl.replace(/\/$/, "")}/${name}`;
      } else {
        imageForSend = image;
      }
    }

    const where =
      segment === "active" ? { orders: { some: {} } }
      : segment === "inactive" ? { orders: { none: {} } }
      : {};
    const users = await prisma.user.findMany({ where, select: { tgId: true } });
    const recipients = users.map((u) => Number(u.tgId));

    const log = await prisma.broadcastLog.create({
      data: { segment, text, imageUrl: imageForSend, button: normalizedButton ?? undefined },
    });

    (async () => {
      console.log(`[broadcast] starting logId=${log.id}, recipients=${recipients.length}`);
      const result = await broadcast({
        recipients,
        text,
        imageUrl: imageForSend,
        button: normalizedButton,
      });
      console.log(`[broadcast] done logId=${log.id}, sent=${result.sent}, failed=${result.failed}`);
      await prisma.broadcastLog.update({
        where: { id: log.id },
        data: { sentCount: result.sent, failedCount: result.failed },
      });
    })().catch((e) => console.error("[broadcast] fatal:", e));

    return { queued: recipients.length, logId: log.id };
  });
}

function customerOf(u: any) {
  if (!u) return undefined;
  const name = u.firstName || u.lastName ? [u.firstName, u.lastName].filter(Boolean).join(" ") : undefined;
  return { tgId: u.tgId.toString(), name, username: u.username ?? undefined };
}

function round2(value: number) { return Math.round(value * 100) / 100; }

function buildDailySeries(startDate: Date, days: number, getValue: (a: Date, b: Date) => number) {
  return Array.from({ length: days }, (_, i) => {
    const a = new Date(startDate); a.setDate(startDate.getDate() + i); a.setHours(0, 0, 0, 0);
    const b = new Date(a); b.setDate(b.getDate() + 1);
    return { date: a.toISOString().slice(5, 10), value: getValue(a, b) };
  });
}

function countDistinctUsersSince(orders: { userTgId: bigint; createdAt: Date }[], from: Date) {
  const ids = new Set<string>();
  for (const o of orders) if (o.createdAt >= from) ids.add(o.userTgId.toString());
  return ids.size;
}

function buildTopProducts(orders: { items: any; totalUSD: number }[]) {
  const stats = new Map<string, { name: string; orders: number; gmvUSD: number }>();
  for (const order of orders) {
    const items = Array.isArray(order.items) ? order.items : [];
    for (const item of items) {
      const nameValue = item?.productName ?? item?.product?.name ?? item?.name;
      const name = typeof nameValue === "string" ? nameValue : nameValue?.ru ?? nameValue?.en ?? item?.productId ?? "Товар";
      const cur = stats.get(name) ?? { name, orders: 0, gmvUSD: 0 };
      cur.orders += Number(item?.qty ?? 1);
      cur.gmvUSD += Number(item?.priceUSD ?? 0) * Number(item?.qty ?? 1);
      stats.set(name, cur);
    }
  }
  return Array.from(stats.values())
    .sort((a, b) => b.orders - a.orders || b.gmvUSD - a.gmvUSD)
    .slice(0, 5)
    .map((it) => ({ ...it, gmvUSD: round2(it.gmvUSD) }));
}
