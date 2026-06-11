ALTER TABLE "RegularTraining" ADD COLUMN IF NOT EXISTS "temporaryHostId" TEXT;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RegularTraining_temporaryHostId_fkey'
  ) THEN
    ALTER TABLE "RegularTraining" ADD CONSTRAINT "RegularTraining_temporaryHostId_fkey"
      FOREIGN KEY ("temporaryHostId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
