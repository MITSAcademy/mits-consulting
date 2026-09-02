-- Payment Sheet: manual "Days" override per trainer+week.
-- Additive + nullable: existing rows keep NULL and continue to derive Days
-- from the session logs, so no backfill and no behaviour change for old weeks.
ALTER TABLE "TrainerPayWeek" ADD COLUMN IF NOT EXISTS "daysOverride" DOUBLE PRECISION;
