-- Migration: session_coordination
-- Adds session-coordination columns to TrainingSession and creates IssueTracker table.

-- -------- TrainingSession new columns --------
ALTER TABLE "TrainingSession"
  ADD COLUMN "delayReason"         TEXT,
  ADD COLUMN "timezone"            TEXT,
  ADD COLUMN "sessionType"         TEXT,
  ADD COLUMN "checklist"           JSONB,
  ADD COLUMN "trainerFeedbackJson" JSONB,
  ADD COLUMN "clientFeedbackJson"  JSONB;

-- -------- IssueTracker table --------
CREATE TABLE "IssueTracker" (
  "id"               TEXT         NOT NULL,
  "date"             TEXT         NOT NULL,
  "coordinatorId"    TEXT,
  "coordinatorName"  TEXT,
  "clientId"         TEXT,
  "trainerId"        TEXT,
  "title"            TEXT         NOT NULL,
  "description"      TEXT,
  "status"           TEXT         NOT NULL DEFAULT 'Open',
  "resolutionNotes"  TEXT,
  "closedById"       TEXT,
  "closedAt"         TIMESTAMP,
  "createdAt"        TIMESTAMP    NOT NULL DEFAULT NOW(),
  "updatedAt"        TIMESTAMP    NOT NULL DEFAULT NOW(),

  CONSTRAINT "IssueTracker_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IssueTracker_clientId_fkey"  FOREIGN KEY ("clientId")  REFERENCES "Client"("id")  ON DELETE SET NULL,
  CONSTRAINT "IssueTracker_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE SET NULL,
  CONSTRAINT "IssueTracker_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id")  ON DELETE SET NULL
);

CREATE INDEX "IssueTracker_status_idx"        ON "IssueTracker"("status");
CREATE INDEX "IssueTracker_coordinatorId_idx" ON "IssueTracker"("coordinatorId");
CREATE INDEX "IssueTracker_date_idx"          ON "IssueTracker"("date");
