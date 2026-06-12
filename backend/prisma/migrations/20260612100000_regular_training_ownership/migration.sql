ALTER TABLE "RegularTraining" ADD COLUMN IF NOT EXISTS "completedSessionCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "RegularTraining" ADD COLUMN IF NOT EXISTS "ownerTeam" TEXT NOT NULL DEFAULT 'demo_team';
ALTER TABLE "RegularTraining" ADD COLUMN IF NOT EXISTS "demoEscalationRequested" BOOLEAN NOT NULL DEFAULT false;

-- Back-fill completedSessionCount from existing TrainingSession rows
UPDATE "RegularTraining" rt
SET "completedSessionCount" = (
  SELECT COUNT(*) FROM "TrainingSession" ts
  WHERE ts."regularTrainingId" = rt.id AND ts.status = 'completed'
);

-- Auto-set ownerTeam for trainings that already have 4+ completed sessions
UPDATE "RegularTraining"
SET "ownerTeam" = 'coordinator_team'
WHERE "completedSessionCount" >= 4;
