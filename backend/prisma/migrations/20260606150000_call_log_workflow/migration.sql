-- CallLog: schedule-call + punch-in/out + feedback workflow.
-- All columns nullable + idempotent. Existing rows default to status='completed'
-- so they continue to appear in history exactly as before.
ALTER TABLE "CallLog" ADD COLUMN IF NOT EXISTS "status"         TEXT NOT NULL DEFAULT 'completed';
ALTER TABLE "CallLog" ADD COLUMN IF NOT EXISTS "scheduledFor"   TIMESTAMP(3);
ALTER TABLE "CallLog" ADD COLUMN IF NOT EXISTS "actualStartAt"  TIMESTAMP(3);
ALTER TABLE "CallLog" ADD COLUMN IF NOT EXISTS "actualEndAt"    TIMESTAMP(3);
ALTER TABLE "CallLog" ADD COLUMN IF NOT EXISTS "feedback"       TEXT;

CREATE INDEX IF NOT EXISTS "CallLog_byId_status_scheduledFor_idx" ON "CallLog"("byId", "status", "scheduledFor");
