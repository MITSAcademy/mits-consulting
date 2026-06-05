-- Fix bouncing emails to team members.
--
-- Seed had everyone at `<firstname>@mits.local` placeholders. When users sign
-- in via Google SSO, the OAuth callback sets `gmailAddress` to their real
-- @mitssolution.com address but leaves the `email` field on its placeholder.
-- Anything that fell back to `email` (notify() when gmailAddress missing,
-- engagement-letter CC, etc.) would send to bad addresses.
--
-- Step 1 — for every user who has signed in via SSO (gmailAddress non-null
-- and looks like a real workspace email), copy gmailAddress → email.

UPDATE "User"
SET "email" = "gmailAddress"
WHERE "gmailAddress" IS NOT NULL
  AND "gmailAddress" LIKE '%@mitssolution.com'
  AND "email" LIKE '%@mits.local';

-- Step 2 — Anjali likely hasn't signed in via SSO yet (her gmailAddress is
-- still null), so the above no-op'd her row. Set her best-guess address per
-- the team note. If wrong, ssh into Render Shell after deploy and run:
--   UPDATE "User"
--     SET "email" = 'anjali.actual@mitssolution.com',
--         "gmailAddress" = 'anjali.actual@mitssolution.com'
--   WHERE "id" = 'u-anjali';

UPDATE "User"
SET "email" = 'anjali.maini@mitssolution.com',
    "gmailAddress" = COALESCE("gmailAddress", 'anjali.maini@mitssolution.com')
WHERE "id" = 'u-anjali'
  AND "email" LIKE '%@mits.local';
