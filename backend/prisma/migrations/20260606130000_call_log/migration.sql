-- CallLog table — lightweight call-tracking for account managers + lead.
-- Each row: who called, when, which client, kind (checkin/feedback/etc), outcome, notes.
CREATE TABLE IF NOT EXISTS "CallLog" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "byId" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'checkin',
  "outcome" TEXT,
  "durationMinutes" INTEGER,
  "notes" TEXT,
  "calledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CallLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CallLog_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CallLog_byId_fkey"     FOREIGN KEY ("byId")     REFERENCES "User"("id")   ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CallLog_clientId_calledAt_idx" ON "CallLog"("clientId", "calledAt");
CREATE INDEX IF NOT EXISTS "CallLog_byId_calledAt_idx"     ON "CallLog"("byId", "calledAt");
