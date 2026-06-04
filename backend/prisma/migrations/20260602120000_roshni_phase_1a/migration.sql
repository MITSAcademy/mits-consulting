-- Roshni Phase 1a — schema-only changes.
-- All additive, all nullable. Existing rows remain valid.
--
-- IMPORTANT: this migration is intentionally schema-only. Postgres refuses to
-- USE a newly-added enum value inside the same transaction that added it
-- ("unsafe use of new value"). The role assignments + email/phone UPDATEs that
-- need the new enum value live in a separate follow-up migration so they
-- commit in their own transaction. Original P3009 fix.

-- 1. Role enum gains account_manager (Muskan, Kashish, etc.)
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'account_manager';

-- 2. User.sendAsAddress — outbound From: header override (for mc.sales@ Google Group)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sendAsAddress" TEXT;

-- 3. Client — Roshni sub-status overlay (RP / CP / C) on SaleClosing+SaleWon
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "saleClosingSubStatus" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "saleClosingSubStatusAt" TIMESTAMP;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "saleClosingSubStatusById" TEXT;

-- 4. Client — Roshni follow-up tracking
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "roshniNextCallOn" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "roshniLastContactAt" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "roshniLastContactOutcome" TEXT;

-- 5. Client — payment confirmation tracking (Phase 1b will populate)
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "paymentScreenshotUrl" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "paymentScreenshotReceivedAt" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "paymentConfirmationPostedAt" TEXT;

-- 6. Client — group rename audit + AM assignment
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "whatsappGroupRenamedAt" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "whatsappGroupRenamedBy" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "assignedAmId" TEXT;
