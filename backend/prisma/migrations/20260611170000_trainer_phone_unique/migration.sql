-- Step 1: Remove duplicate phoneDigits, keeping the trainer with the most activity
-- (highest count of linked clients/proposals/sessions). For ties, keep the oldest record.
WITH ranked AS (
  SELECT
    t.id,
    t."phoneDigits",
    (
      SELECT COUNT(*) FROM "Proposal" p WHERE p."trainerId" = t.id
    ) +
    (
      SELECT COUNT(*) FROM "TrainingSession" ts
        JOIN "RegularTraining" rt ON ts."regularTrainingId" = rt.id
        WHERE rt."trainerId" = t.id
    ) AS activity_score,
    ROW_NUMBER() OVER (
      PARTITION BY t."phoneDigits"
      ORDER BY (
        (SELECT COUNT(*) FROM "Proposal" p WHERE p."trainerId" = t.id) +
        (SELECT COUNT(*) FROM "TrainingSession" ts
           JOIN "RegularTraining" rt ON ts."regularTrainingId" = rt.id
           WHERE rt."trainerId" = t.id)
      ) DESC, t."createdAt" ASC
    ) AS rn
  FROM "Trainer" t
  WHERE t."phoneDigits" IS NOT NULL AND t."phoneDigits" <> ''
),
duplicates AS (
  SELECT id FROM ranked WHERE rn > 1
)
DELETE FROM "Trainer" WHERE id IN (SELECT id FROM duplicates);

-- Step 2: Create the partial unique index now that duplicates are gone
CREATE UNIQUE INDEX IF NOT EXISTS "Trainer_phoneDigits_unique"
  ON "Trainer" ("phoneDigits")
  WHERE "phoneDigits" IS NOT NULL AND "phoneDigits" <> '';
