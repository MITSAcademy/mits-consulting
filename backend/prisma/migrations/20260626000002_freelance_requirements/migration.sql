CREATE TABLE IF NOT EXISTS "FreelanceRequirement" (
  "id"              TEXT NOT NULL PRIMARY KEY,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "clientName"      TEXT NOT NULL,
  "skillRequired"   TEXT NOT NULL,
  "currentTrainer"  TEXT,
  "clientTimings"   TEXT,
  "trainersUsed"    TEXT,
  "trainerName"     TEXT,
  "trainerRecording" TEXT,
  "trainerTimings"  TEXT,
  "trainerPhone"    TEXT,
  "trainerEmail"    TEXT,
  "status"          TEXT NOT NULL DEFAULT 'Open',
  "priority"        TEXT NOT NULL DEFAULT 'Medium',
  "isEscalated"     BOOLEAN NOT NULL DEFAULT false,
  "flaggedById"     TEXT,
  "clientId"        TEXT,
  "lastUpdatedById" TEXT,
  CONSTRAINT "FreelanceRequirement_flaggedById_fkey" FOREIGN KEY ("flaggedById") REFERENCES "User"("id") ON DELETE SET NULL,
  CONSTRAINT "FreelanceRequirement_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL,
  CONSTRAINT "FreelanceRequirement_lastUpdatedById_fkey" FOREIGN KEY ("lastUpdatedById") REFERENCES "User"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "FreelanceRequirementComment" (
  "id"            TEXT NOT NULL PRIMARY KEY,
  "requirementId" TEXT NOT NULL,
  "authorId"      TEXT NOT NULL,
  "authorName"    TEXT NOT NULL,
  "body"          TEXT NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FreelanceRequirementComment_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "FreelanceRequirement"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "FreelanceRequirement_status_idx" ON "FreelanceRequirement"("status");
CREATE INDEX IF NOT EXISTS "FreelanceRequirement_createdAt_idx" ON "FreelanceRequirement"("createdAt");
