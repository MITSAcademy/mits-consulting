-- Add raisedById and raisedByName to IssueTracker so we can show who raised each issue.
-- coordinatorName was already stored but not returned; this pairs nicely with it.

ALTER TABLE "IssueTracker"
  ADD COLUMN IF NOT EXISTS "raisedById"   TEXT,
  ADD COLUMN IF NOT EXISTS "raisedByName" TEXT;
