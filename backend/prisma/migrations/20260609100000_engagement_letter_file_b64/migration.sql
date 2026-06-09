-- Store uploaded engagement letter PDF as base64 in DB (no ephemeral disk dependency)
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "engagementLetterFileB64" TEXT;
