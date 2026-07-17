CREATE TABLE IF NOT EXISTS "FeedbackPunch" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "punchedById" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeedbackPunch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FeedbackPunch_clientId_punchedById_date_key" ON "FeedbackPunch"("clientId", "punchedById", "date");
CREATE INDEX IF NOT EXISTS "FeedbackPunch_clientId_idx" ON "FeedbackPunch"("clientId");
CREATE INDEX IF NOT EXISTS "FeedbackPunch_punchedById_idx" ON "FeedbackPunch"("punchedById");
CREATE INDEX IF NOT EXISTS "FeedbackPunch_date_idx" ON "FeedbackPunch"("date");

ALTER TABLE "FeedbackPunch" ADD CONSTRAINT "FeedbackPunch_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedbackPunch" ADD CONSTRAINT "FeedbackPunch_punchedById_fkey" FOREIGN KEY ("punchedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
