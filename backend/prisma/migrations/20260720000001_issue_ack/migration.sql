ALTER TABLE "IssueTracker" ADD COLUMN IF NOT EXISTS "acknowledgedByMitaliAt" TIMESTAMP(3);
ALTER TABLE "IssueTracker" ADD COLUMN IF NOT EXISTS "acknowledgedBySamitaAt" TIMESTAMP(3);
ALTER TABLE "RegularTraining" ADD COLUMN IF NOT EXISTS "escalationDemoAckAt" TIMESTAMP(3);
