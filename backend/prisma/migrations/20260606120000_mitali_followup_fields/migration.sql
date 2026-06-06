-- Mitali's payment follow-up workspace fields.
-- followupNote/followupNoteAt: free-form per-client comment for her sheet.
-- lastFeedbackTakenAt: when she last took feedback from this client.
-- lastLeverageAskedAt:  when she last asked for testimonial/referral.
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "followupNote"          TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "followupNoteAt"        TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "lastFeedbackTakenAt"   TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "lastLeverageAskedAt"   TEXT;
