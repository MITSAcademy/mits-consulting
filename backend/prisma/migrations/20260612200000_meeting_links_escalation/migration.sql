-- MeetingLink repository
CREATE TABLE IF NOT EXISTS "MeetingLink" (
  "id"        TEXT NOT NULL PRIMARY KEY,
  "label"     TEXT NOT NULL,
  "platform"  TEXT NOT NULL,
  "url"       TEXT NOT NULL,
  "ownerId"   TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MeetingLink_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Trainer replacement reason on RegularTraining
ALTER TABLE "RegularTraining" ADD COLUMN IF NOT EXISTS "trainerReplacementReason" TEXT;

-- Issue escalation fields
ALTER TABLE "IssueTracker" ADD COLUMN IF NOT EXISTS "escalationLevel" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "IssueTracker" ADD COLUMN IF NOT EXISTS "escalatedAt" TIMESTAMP(3);
ALTER TABLE "IssueTracker" ADD COLUMN IF NOT EXISTS "escalationLog" TEXT;
CREATE INDEX IF NOT EXISTS "IssueTracker_escalationLevel_idx" ON "IssueTracker"("escalationLevel");
