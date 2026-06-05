-- Roshni close-out wizard — track each step's completion timestamp so the
-- UI can lock the next step until the previous is done. All additive +
-- nullable; existing rows stay valid.

ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "engagementLetterSentAt" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "paymentWaSentAt" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "mitaliIntroSentAt" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "employerName" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "employerCommitDate" TEXT;
