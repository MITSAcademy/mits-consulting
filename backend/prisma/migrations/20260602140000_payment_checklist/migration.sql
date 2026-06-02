-- Payment-terms checklist (Roshni's close-call walkthrough).
-- JSON array of items so we can evolve the structure without a migration.
ALTER TABLE "Client" ADD COLUMN "paymentChecklist" JSONB;
ALTER TABLE "Client" ADD COLUMN "paymentChecklistCompletedAt" TEXT;
