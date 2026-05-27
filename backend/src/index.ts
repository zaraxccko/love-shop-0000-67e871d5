import Fastify from "fastify";
import cors from "@fastify/cors";

// ── Globally make BigInt JSON-safe (Prisma returns BigInt for tg ids).
// Without this, Fastify's default JSON serializer throws and the request
// silently fails — orders never reach the client, admin lists 500, etc.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(BigInt.prototype as any).toJSON = function () { return this.toString(); };
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { env } from "./env.js";
import { authRoutes } from "./routes/auth.js";
import { meRoutes } from "./routes/me.js";
import { catalogRoutes } from "./routes/catalog.js";
import { orderRoutes } from "./routes/orders.js";
import { adminRoutes } from "./routes/admin.js";
import { promoRoutes } from "./routes/promo.js";
import { eventsRoutes, startEventsNotifier } from "./routes/events.js";
import "./bot.js"; // запускает long-polling
import fs from "node:fs";

async function main() {
  fs.mkdirSync(env.uploadDir, { recursive: true });

  const app = Fastify({
    logger: {
      transport: env.nodeEnv === "development" ? { target: "pino-pretty" } : undefined,
    },
    bodyLimit: 25 * 1024 * 1024,
  });

  await app.register(cors, {
    origin: env.corsOrigin.includes("*") ? true : env.corsOrigin,
    credentials: true,
  });
  await app.register(jwt, { secret: env.jwtSecret });
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });

  // отдаём загруженные фото подтверждений (на случай если nginx не настроен)
  await app.register(fastifyStatic, {
    root: env.uploadDir,
    prefix: "/uploads/",
    decorateReply: false,
  });

  app.get("/api/health", async () => ({ ok: true, ts: Date.now() }));

  await app.register(
    async (api) => {
      await authRoutes(api);
      await meRoutes(api);
      await catalogRoutes(api);
      await orderRoutes(api);
      await adminRoutes(api);
      await promoRoutes(api);
      await eventsRoutes(api);
    },
    { prefix: "/api" }
  );

  startEventsPruneJob();

  await app.listen({ port: env.port, host: "0.0.0.0" });
  app.log.info(`API listening on :${env.port}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
