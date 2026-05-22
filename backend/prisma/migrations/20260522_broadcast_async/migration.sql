ALTER TABLE "broadcast_log"
  ADD COLUMN IF NOT EXISTS "total_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'processing',
  ADD COLUMN IF NOT EXISTS "error" TEXT,
  ADD COLUMN IF NOT EXISTS "finished_at" TIMESTAMP(3);

UPDATE "broadcast_log" SET "status" = 'completed' WHERE "status" = 'processing' AND "created_at" < NOW() - INTERVAL '1 hour';
