import { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { requireAuth } from "../auth/middleware.js";
import { isModeratorTgId } from "../auth/telegram.js";

export async function meRoutes(app: FastifyInstance) {
  app.get("/me", { preHandler: requireAuth }, async (req) => {
    const user = await prisma.user.findUnique({ where: { tgId: req.user!.tgId } });
    if (!user) return { error: "not_found" };
    return {
      tgId: user.tgId.toString(),
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      photoUrl: user.photoUrl,
      lang: user.lang,
      citySlug: user.citySlug,
      balanceUSD: user.balanceUSD,
      isAdmin: user.isAdmin,
      isModerator: isModeratorTgId(user.tgId),
    };
  });
}
