ALTER TABLE "RegularTraining" ADD COLUMN IF NOT EXISTS "temporaryHostId" TEXT;
ALTER TABLE "RegularTraining" ADD CONSTRAINT IF NOT EXISTS "RegularTraining_temporaryHostId_fkey" FOREIGN KEY ("temporaryHostId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
