ALTER TABLE "RegularTraining" ADD COLUMN "temporaryHostId" TEXT;
ALTER TABLE "RegularTraining" ADD CONSTRAINT "RegularTraining_temporaryHostId_fkey"
  FOREIGN KEY ("temporaryHostId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
