ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "bot_blocked" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "users_bot_blocked_idx" ON "users" ("bot_blocked");
