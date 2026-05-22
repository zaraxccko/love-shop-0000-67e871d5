ALTER TABLE "broadcast_log"
  ADD COLUMN IF NOT EXISTS "failure_breakdown" JSONB;
