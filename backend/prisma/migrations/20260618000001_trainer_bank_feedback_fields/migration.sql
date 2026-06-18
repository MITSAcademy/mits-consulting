-- Trainer: structured bank detail fields
ALTER TABLE "Trainer" ADD COLUMN IF NOT EXISTS "bankHolderName"    TEXT;
ALTER TABLE "Trainer" ADD COLUMN IF NOT EXISTS "bankName"           TEXT;
ALTER TABLE "Trainer" ADD COLUMN IF NOT EXISTS "bankAccountNumber"  TEXT;
ALTER TABLE "Trainer" ADD COLUMN IF NOT EXISTS "bankIfscCode"       TEXT;
ALTER TABLE "Trainer" ADD COLUMN IF NOT EXISTS "bankBranchName"     TEXT;
ALTER TABLE "Trainer" ADD COLUMN IF NOT EXISTS "bankAccountType"    TEXT;
ALTER TABLE "Trainer" ADD COLUMN IF NOT EXISTS "bankChequeUrl"      TEXT;

-- Feedback: communication status + optional trainer link
ALTER TABLE "Feedback" ADD COLUMN IF NOT EXISTS "communicationStatus" TEXT;
ALTER TABLE "Feedback" ADD COLUMN IF NOT EXISTS "trainerId"           TEXT REFERENCES "Trainer"("id") ON DELETE SET NULL;
