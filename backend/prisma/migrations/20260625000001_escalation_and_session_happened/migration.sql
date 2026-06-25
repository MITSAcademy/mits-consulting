-- Add escalation fields to RegularTraining (if not already present)
ALTER TABLE "RegularTraining" ADD COLUMN IF NOT EXISTS "escalationStatus" TEXT;
ALTER TABLE "RegularTraining" ADD COLUMN IF NOT EXISTS "escalationActionsTaken" TEXT;
ALTER TABLE "RegularTraining" ADD COLUMN IF NOT EXISTS "escalationFlaggedAt" TEXT;

-- Add sessionHappened to SessionLog
ALTER TABLE "SessionLog" ADD COLUMN IF NOT EXISTS "sessionHappened" BOOLEAN NOT NULL DEFAULT true;
