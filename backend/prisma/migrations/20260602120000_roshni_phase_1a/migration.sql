-- Roshni Phase 1a: account_manager role + sub-status + follow-up + send-as columns.
-- All additive, all nullable. Existing rows remain valid.

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

-- 7. Update existing user records to real Workspace identities
-- Roshni — sales_closer
UPDATE "User"
SET "email" = 'roshni.seth@mitssolution.com',
    "name"  = 'Roshni Seth',
    "phone" = '+91 62835 05780'
WHERE "id" = 'u-roshni';

-- Mitali — manager
UPDATE "User"
SET "email" = 'mitagg@mitssolution.com',
    "name"  = 'Mitali MITS',
    "phone" = '+91 97795 30773'
WHERE "id" = 'u-mitali';

-- Bhavneet — lead, reports to Mitali
UPDATE "User"
SET "email" = 'bhavneet.kaur@mitssolution.com',
    "name"  = 'Bhavneet MITS',
    "phone" = '+91 62833 24835'
WHERE "id" = 'u-bhavneet';

-- Promote Muskan + Kashish to account_manager
UPDATE "User" SET "role" = 'account_manager' WHERE "id" IN ('u-muskan', 'u-kashish');

-- Set Roshni's send-as alias (mc.sales@ Google Group)
UPDATE "User" SET "sendAsAddress" = 'mc.sales@mitssolution.com' WHERE "id" = 'u-roshni';
