-- Human-readable sequential IDs for Client and Trainer.
-- These are display/reference numbers (C-0001, T-0001) used by the team
-- in messages and spreadsheets. The CUID remains the primary key.
-- Populated via sequences so existing rows get unique numbers automatically.

CREATE SEQUENCE IF NOT EXISTS "client_seq_id_seq" START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS "trainer_seq_id_seq" START WITH 1 INCREMENT BY 1;

ALTER TABLE "Client"  ADD COLUMN "seqId" INTEGER;
ALTER TABLE "Trainer" ADD COLUMN "seqId" INTEGER;

-- Back-fill existing rows in creation order
UPDATE "Client"  SET "seqId" = sub.rn FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt" ASC) AS rn FROM "Client"
) sub WHERE "Client".id = sub.id;

UPDATE "Trainer" SET "seqId" = sub.rn FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt" ASC) AS rn FROM "Trainer"
) sub WHERE "Trainer".id = sub.id;

-- Advance sequence past the max back-filled value
SELECT setval('"client_seq_id_seq"',  COALESCE((SELECT MAX("seqId") FROM "Client"),  0) + 1, false);
SELECT setval('"trainer_seq_id_seq"', COALESCE((SELECT MAX("seqId") FROM "Trainer"), 0) + 1, false);

-- Default to next sequence value for future inserts
ALTER TABLE "Client"  ALTER COLUMN "seqId" SET DEFAULT nextval('"client_seq_id_seq"');
ALTER TABLE "Trainer" ALTER COLUMN "seqId" SET DEFAULT nextval('"trainer_seq_id_seq"');

-- Unique constraint so no two clients/trainers share a number
CREATE UNIQUE INDEX "Client_seqId_key"  ON "Client"("seqId");
CREATE UNIQUE INDEX "Trainer_seqId_key" ON "Trainer"("seqId");
