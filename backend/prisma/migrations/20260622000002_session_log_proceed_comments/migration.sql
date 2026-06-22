-- SessionLog: payment proceed flag + comments column
ALTER TABLE "SessionLog" ADD COLUMN IF NOT EXISTS "proceed"  TEXT;
ALTER TABLE "SessionLog" ADD COLUMN IF NOT EXISTS "comments" TEXT;
