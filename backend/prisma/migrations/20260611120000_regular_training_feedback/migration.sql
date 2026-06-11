ALTER TABLE "RegularTraining" ADD COLUMN IF NOT EXISTS "lastClientFeedback" TEXT;
ALTER TABLE "RegularTraining" ADD COLUMN IF NOT EXISTS "lastTrainerFeedback" TEXT;
ALTER TABLE "RegularTraining" ADD COLUMN IF NOT EXISTS "lastSessionDate" TEXT;
ALTER TABLE "RegularTraining" ADD COLUMN IF NOT EXISTS "weeklySessionCount" INTEGER;
