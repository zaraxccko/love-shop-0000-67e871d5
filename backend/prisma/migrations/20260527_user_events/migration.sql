CREATE TABLE IF NOT EXISTS "user_events" (
  "id" TEXT PRIMARY KEY,
  "user_tg_id" BIGINT NOT NULL,
  "type" TEXT NOT NULL,
  "payload" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_events_user_fk" FOREIGN KEY ("user_tg_id") REFERENCES "users"("tg_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "user_events_user_created_idx" ON "user_events" ("user_tg_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "user_events_type_created_idx" ON "user_events" ("type", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "user_events_created_idx" ON "user_events" ("created_at" DESC);
