CREATE TABLE IF NOT EXISTS "FeedbackActivity" (
  "id"         TEXT NOT NULL,
  "feedbackId" TEXT NOT NULL,
  "clientId"   TEXT NOT NULL,
  "type"       TEXT NOT NULL,
  "note"       TEXT,
  "loggedById" TEXT NOT NULL,
  "loggedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FeedbackActivity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FeedbackActivity_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "Feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FeedbackActivity_clientId_fkey"   FOREIGN KEY ("clientId")   REFERENCES "Client"("id")   ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FeedbackActivity_loggedById_fkey" FOREIGN KEY ("loggedById") REFERENCES "User"("id")     ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "FeedbackActivity_feedbackId_idx" ON "FeedbackActivity"("feedbackId");
CREATE INDEX IF NOT EXISTS "FeedbackActivity_clientId_idx"   ON "FeedbackActivity"("clientId");
