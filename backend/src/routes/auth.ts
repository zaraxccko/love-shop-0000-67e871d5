import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { validateInitData, isAdminTgId, isModeratorTgId } from "../auth/telegram.js";

const InitDataSchema = z.object({ initData: z.string().min(10).max(8192) });

export async function authRoutes(app: FastifyInstance) {
  /**
   * POST /api/auth/telegram
   * body: { initData: "<string from window.Telegram.WebApp.initData>" }
   * returns: { token, user }
   */
  app.post("/auth/telegram", async (req, reply) => {
    const parsed = InitDataSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "bad_request" });

    const tgUser = validateInitData(parsed.data.initData);
    if (!tgUser) return reply.code(401).send({ error: "invalid_init_data" });

    const tgId = BigInt(tgUser.id);
    const isAdmin = isAdminTgId(tgId);
    const isModerator = isModeratorTgId(tgId);

    const user = await prisma.user.upsert({
      where: { tgId },
      create: {
        tgId,
        username: tgUser.username,
        firstName: tgUser.first_name,
        lastName: tgUser.last_name,
        photoUrl: tgUser.photo_url,
        lang: tgUser.language_code === "en" ? "en" : "ru",
        isAdmin,
      },
      update: {
        username: tgUser.username,
        firstName: tgUser.first_name,
        lastName: tgUser.last_name,
        photoUrl: tgUser.photo_url,
        isAdmin,
      },
    });

    if (user.isBanned) {
      return reply.code(403).send({ error: "banned" });
    }

    const token = await reply.jwtSign({ tgId: tgId.toString() }, { expiresIn: "30d" });

    return {
      token,
      user: {
        tgId: user.tgId.toString(),
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        photoUrl: user.photoUrl,
        lang: user.lang,
        balanceUSD: user.balanceUSD,
        isAdmin: user.isAdmin,
        isModerator,
      },
    };
  });
}
