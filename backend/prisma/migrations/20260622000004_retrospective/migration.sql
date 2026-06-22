CREATE TABLE IF NOT EXISTS "Retrospective" (
  "id"          TEXT NOT NULL,
  "sourceType"  TEXT NOT NULL,
  "sourceId"    TEXT,
  "clientName"  TEXT NOT NULL,
  "trainerName" TEXT,
  "removedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "removedById" TEXT,
  "reason"      TEXT,
  "ownerId"     TEXT,
  "comments"    TEXT,
  "sessionDate" TEXT,
  CONSTRAINT "Retrospective_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Retrospective_removedAt_idx" ON "Retrospective"("removedAt");
CREATE INDEX IF NOT EXISTS "Retrospective_sourceType_idx" ON "Retrospective"("sourceType");

ALTER TABLE "Retrospective" ADD CONSTRAINT "Retrospective_removedById_fkey"
  FOREIGN KEY ("removedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Retrospective" ADD CONSTRAINT "Retrospective_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
