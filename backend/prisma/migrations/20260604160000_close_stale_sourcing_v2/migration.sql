-- Backfill: close any Open/Proposed sourcing request whose client is already
-- past the recruiter step. Kanchan reported 12 stale open requests in her
-- bucket for clients Samita/Taran had already moved to TrainerMatched / etc.
-- The earlier 20260601100000_close_stale_sourcing migration only covered
-- Dormant/Hold/InternalSearch/Churned/Lead/IntakeSent/IntakeReceived. This
-- one extends to every lifecycle past WithRecruiters / VerificationPending.
UPDATE "SourcingRequest" sr
SET "status" = 'Closed'
FROM "Client" c
WHERE sr."clientId" = c.id
  AND sr."status" IN ('Open', 'Proposed')
  AND c."lifecycle" IN (
    'Dormant', 'Hold', 'InternalSearch', 'Churned',
    'Lead', 'IntakeSent', 'IntakeReceived',
    'TrainerMatched', 'DemoScheduled', 'DemoDone',
    'FeedbackPending', 'SaleClosing', 'SaleWon', 'Active',
    'LeverageGranted', 'Completed'
  );
