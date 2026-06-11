-- Partial unique index: phone digits must be unique across trainers, but NULLs are allowed.
-- PostgreSQL partial indexes (WHERE ... IS NOT NULL) permit multiple NULLs while still
-- blocking duplicate non-null phone numbers.
CREATE UNIQUE INDEX "Trainer_phoneDigits_unique"
  ON "Trainer" ("phoneDigits")
  WHERE "phoneDigits" IS NOT NULL AND "phoneDigits" <> '';
