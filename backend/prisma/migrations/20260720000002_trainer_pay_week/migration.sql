CREATE TABLE IF NOT EXISTS "TrainerPayWeek" (
  "id" TEXT NOT NULL,
  "trainerId" TEXT NOT NULL,
  "weekStart" TEXT NOT NULL,
  "mitaliAckAt" TIMESTAMP(3),
  "bhavneetVerification" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrainerPayWeek_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TrainerPayWeek_trainerId_weekStart_key" ON "TrainerPayWeek"("trainerId", "weekStart");
CREATE INDEX IF NOT EXISTS "TrainerPayWeek_weekStart_idx" ON "TrainerPayWeek"("weekStart");
