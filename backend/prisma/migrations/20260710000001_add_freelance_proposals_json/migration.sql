-- Add multi-trainer proposals JSON array to FreelanceRequirement
ALTER TABLE "FreelanceRequirement" ADD COLUMN IF NOT EXISTS "proposals" JSONB;
