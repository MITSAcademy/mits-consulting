-- Add index on SessionLog(trainerId, date) for trainer-scoped queries
CREATE INDEX IF NOT EXISTS "SessionLog_trainerId_date_idx" ON "SessionLog"("trainerId", "date");
