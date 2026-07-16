-- Add regularTrainingId FK to SessionLog
ALTER TABLE "SessionLog" ADD COLUMN IF NOT EXISTS "regularTrainingId" TEXT;
ALTER TABLE "SessionLog"
  ADD CONSTRAINT "SessionLog_regularTrainingId_fkey"
  FOREIGN KEY ("regularTrainingId")
  REFERENCES "RegularTraining"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "SessionLog_regularTrainingId_idx" ON "SessionLog"("regularTrainingId");

-- Add trainerId FK to Payment
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "trainerId" TEXT;
ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_trainerId_fkey"
  FOREIGN KEY ("trainerId")
  REFERENCES "Trainer"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "Payment_trainerId_idx" ON "Payment"("trainerId");
