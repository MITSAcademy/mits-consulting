ALTER TABLE "RegularTraining" ADD COLUMN IF NOT EXISTS "coordinatorFlagged" BOOLEAN NOT NULL DEFAULT false;
