-- Backfill: every existing SaleClosing / SaleWon client without a salesOwner
-- gets assigned to Roshni. New clients flowing through /post-demo-feedback or
-- /stage will now auto-assign too (see clients.ts), but the existing 16
-- already in SaleClosing need a one-shot catch-up so they appear in her queue.
UPDATE "Client"
SET "salesOwnerId" = 'u-roshni'
WHERE "lifecycle" IN ('SaleClosing', 'SaleWon')
  AND "salesOwnerId" IS NULL;
