ALTER TABLE "RegularTraining" ADD COLUMN IF NOT EXISTS "defaultTimeIst" TEXT;
ALTER TABLE "RegularTraining" ADD COLUMN IF NOT EXISTS "lastSessionStatus" TEXT;
ALTER TABLE "RegularTraining" ADD COLUMN IF NOT EXISTS "lastSessionComment" TEXT;
