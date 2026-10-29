-- Buyer contact details captured at checkout.
--
-- Added as nullable, backfilled from the owning student (the best information
-- we have for purchases made before the checkout form collected these), then
-- made NOT NULL so every future payment carries them.

ALTER TABLE "StudentPurchase" ADD COLUMN "buyerName" TEXT;
ALTER TABLE "StudentPurchase" ADD COLUMN "buyerEmail" TEXT;
ALTER TABLE "StudentPurchase" ADD COLUMN "buyerPhone" TEXT;

UPDATE "StudentPurchase" p
SET "buyerName"  = COALESCE(s."name", 'Unknown'),
    "buyerEmail" = COALESCE(s."email", 'unknown@unknown'),
    "buyerPhone" = COALESCE(s."phone", 'unknown')
FROM "Student" s
WHERE s."id" = p."studentId"
  AND (p."buyerName" IS NULL OR p."buyerEmail" IS NULL OR p."buyerPhone" IS NULL);

-- Any purchase with no student row left (cascade should prevent this).
UPDATE "StudentPurchase"
SET "buyerName"  = COALESCE("buyerName", 'Unknown'),
    "buyerEmail" = COALESCE("buyerEmail", 'unknown@unknown'),
    "buyerPhone" = COALESCE("buyerPhone", 'unknown')
WHERE "buyerName" IS NULL OR "buyerEmail" IS NULL OR "buyerPhone" IS NULL;

ALTER TABLE "StudentPurchase" ALTER COLUMN "buyerName" SET NOT NULL;
ALTER TABLE "StudentPurchase" ALTER COLUMN "buyerEmail" SET NOT NULL;
ALTER TABLE "StudentPurchase" ALTER COLUMN "buyerPhone" SET NOT NULL;

CREATE INDEX "StudentPurchase_buyerEmail_idx" ON "StudentPurchase"("buyerEmail");
