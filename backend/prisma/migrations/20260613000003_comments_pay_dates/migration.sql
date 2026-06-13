-- Add payDate1, payDate2, leverageUntil, leverageNote columns to Client
ALTER TABLE "Client"
  ADD COLUMN IF NOT EXISTS "payDate1"     TEXT,
  ADD COLUMN IF NOT EXISTS "payDate2"     TEXT,
  ADD COLUMN IF NOT EXISTS "leverageUntil" TEXT,
  ADD COLUMN IF NOT EXISTS "leverageNote"  TEXT;

-- Create Comment table
CREATE TABLE IF NOT EXISTS "Comment" (
    "id"         TEXT NOT NULL,
    "clientId"   TEXT,
    "trainerId"  TEXT,
    "authorId"   TEXT,
    "authorName" TEXT NOT NULL,
    "body"       TEXT NOT NULL,
    "pinned"     BOOLEAN NOT NULL DEFAULT false,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- FK constraints
ALTER TABLE "Comment"
  ADD CONSTRAINT "Comment_clientId_fkey"  FOREIGN KEY ("clientId")  REFERENCES "Client"("id")  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "Comment_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "Comment_authorId_fkey"  FOREIGN KEY ("authorId")  REFERENCES "User"("id")    ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes for fast retrieval
CREATE INDEX IF NOT EXISTS "Comment_clientId_createdAt_idx"  ON "Comment"("clientId",  "createdAt");
CREATE INDEX IF NOT EXISTS "Comment_trainerId_createdAt_idx" ON "Comment"("trainerId", "createdAt");

-- Add assignedAm FK relation on Client
ALTER TABLE "Client"
  ADD CONSTRAINT "Client_assignedAmId_fkey"
  FOREIGN KEY ("assignedAmId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
