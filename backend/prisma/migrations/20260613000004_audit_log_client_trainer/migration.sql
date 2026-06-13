-- Add clientId and trainerId to AuditLog for per-entity activity feeds
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "clientId"  TEXT;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "trainerId" TEXT;

-- Indexes for per-client and per-trainer activity queries
CREATE INDEX IF NOT EXISTS "AuditLog_clientId_createdAt_idx"  ON "AuditLog" ("clientId",  "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AuditLog_trainerId_createdAt_idx" ON "AuditLog" ("trainerId", "createdAt" DESC);
