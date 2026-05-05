import "dotenv/config";

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") throw new Error(`Missing env: ${name}`);
  return v;
}

export const env = {
  port: Number(process.env.PORT ?? 3000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  databaseUrl: req("DATABASE_URL"),
  corsOrigin: (process.env.CORS_ORIGIN ?? "*").split(",").map((s) => s.trim()),
  jwtSecret: req("JWT_SECRET"),
  telegramBotToken: req("TELEGRAM_BOT_TOKEN"),
  adminTgIds: (process.env.ADMIN_TG_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => BigInt(s)),
  moderatorTgIds: (process.env.MODERATOR_TG_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => BigInt(s)),
  webappUrl: req("WEBAPP_URL"),
  ordersNotifyChatId: process.env.ORDERS_NOTIFY_CHAT_ID
    ? Number(process.env.ORDERS_NOTIFY_CHAT_ID)
    : undefined,
  uploadDir: process.env.UPLOAD_DIR ?? "/data/uploads",
  publicUploadUrl: req("PUBLIC_UPLOAD_URL"),
};
