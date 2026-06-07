-- Add stageEnteredAt to Client + backfill existing rows with createdAt::date
-- so the demo-team report's aging analysis works on day one.
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "stageEnteredAt" TEXT;

UPDATE "Client"
SET "stageEnteredAt" = TO_CHAR("createdAt", 'YYYY-MM-DD')
WHERE "stageEnteredAt" IS NULL;
