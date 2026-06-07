-- New tables for Mitali-team Regular Trainings + per-session tracking.
-- Two new tables, no changes to existing tables.
-- Gated at the route level behind FEATURES_REGULAR_CALLS env var.

CREATE TABLE IF NOT EXISTS "RegularTraining" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "clientId" TEXT,
  "trainerId" TEXT,
  "hostedByDefaultId" TEXT,
  "recordingAccountEmail" TEXT,
  "recordingAccountLabel" TEXT,
  "recordingFolderUrl" TEXT,
  "scheduleNotes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RegularTraining_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RegularTraining_clientId_fkey"           FOREIGN KEY ("clientId")          REFERENCES "Client"("id")  ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "RegularTraining_trainerId_fkey"          FOREIGN KEY ("trainerId")         REFERENCES "Trainer"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "RegularTraining_hostedByDefaultId_fkey"  FOREIGN KEY ("hostedByDefaultId") REFERENCES "User"("id")    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "RegularTraining_status_idx"            ON "RegularTraining"("status");
CREATE INDEX IF NOT EXISTS "RegularTraining_hostedByDefaultId_idx" ON "RegularTraining"("hostedByDefaultId");
CREATE INDEX IF NOT EXISTS "RegularTraining_clientId_idx"          ON "RegularTraining"("clientId");

CREATE TABLE IF NOT EXISTS "TrainingSession" (
  "id" TEXT NOT NULL,
  "regularTrainingId" TEXT NOT NULL,
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "hostedById" TEXT,
  "status" TEXT NOT NULL DEFAULT 'scheduled',
  "actualStartAt" TIMESTAMP(3),
  "actualEndAt" TIMESTAMP(3),
  "durationMinutes" INTEGER,
  "recordingUrl" TEXT,
  "feedback" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrainingSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TrainingSession_regularTrainingId_fkey" FOREIGN KEY ("regularTrainingId") REFERENCES "RegularTraining"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TrainingSession_hostedById_fkey"        FOREIGN KEY ("hostedById")        REFERENCES "User"("id")            ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "TrainingSession_regularTrainingId_scheduledFor_idx" ON "TrainingSession"("regularTrainingId", "scheduledFor");
CREATE INDEX IF NOT EXISTS "TrainingSession_hostedById_status_scheduledFor_idx" ON "TrainingSession"("hostedById", "status", "scheduledFor");
