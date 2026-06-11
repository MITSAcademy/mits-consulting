-- Add activityType, sessionTookPlace, cancellationReason to CallLog
ALTER TABLE "CallLog" ADD COLUMN IF NOT EXISTS "activityType" TEXT;
ALTER TABLE "CallLog" ADD COLUMN IF NOT EXISTS "sessionTookPlace" BOOLEAN;
ALTER TABLE "CallLog" ADD COLUMN IF NOT EXISTS "cancellationReason" TEXT;
