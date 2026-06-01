-- One-time cleanup: close any sourcing request whose client has already moved
-- away from the recruiter flow (Dormant, Hold, InternalSearch, Churned, or back to
-- Lead-stages). Without this, Samita's "moved Srini to dormant" / "Shiva back to
-- Anjali" requests keep showing in Aman/Kanchan's queue forever.

UPDATE "SourcingRequest" sr
SET "status" = 'Closed'
FROM "Client" c
WHERE sr."clientId" = c.id
  AND sr."status" IN ('Open', 'Proposed')
  AND c."lifecycle" IN (
    'Dormant', 'Hold', 'InternalSearch', 'Churned',
    'Lead', 'IntakeSent', 'IntakeReceived'
  );
