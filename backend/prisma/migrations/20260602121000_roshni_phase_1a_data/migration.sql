-- Roshni Phase 1a — data updates (split from the schema migration above so
-- Postgres can USE the newly-added 'account_manager' enum value). These all
-- target existing rows by id and are idempotent on re-run.

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
