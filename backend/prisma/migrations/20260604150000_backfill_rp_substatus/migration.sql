-- Backfill: every existing SaleClosing / SaleWon client without a sub-status
-- gets defaulted to 'RP' (the entry state Roshni works from). Mirrors the new
-- auto-set on positive-demo handoff so the existing 16 clients show up under
-- RP, not Triage, after this deploy.
UPDATE "Client"
SET "saleClosingSubStatus" = 'RP',
    "saleClosingSubStatusAt" = NOW()
WHERE "lifecycle" IN ('SaleClosing', 'SaleWon')
  AND "saleClosingSubStatus" IS NULL;
