-- Authoritative team email update — per Vaibhav (2026-06-04).
-- Sets both email and gmailAddress to the real @mitssolution.com address
-- so any code path (notify(), CC list, sender override) hits the right inbox.
--
-- Roshni / Mitali / Bhavneet / Kashish / Muskan / Vaibhav / Samita are
-- already correct from earlier migrations + seed. This locks down the
-- remaining five.

-- Anjali (also overrides the best-guess from the previous migration so it's
-- explicit + auditable here).
UPDATE "User"
SET "email" = 'anjali.maini@mitssolution.com',
    "gmailAddress" = 'anjali.maini@mitssolution.com'
WHERE "id" = 'u-anjali';

-- Taran
UPDATE "User"
SET "email" = 'tarkau@mitssolution.com',
    "gmailAddress" = 'tarkau@mitssolution.com'
WHERE "id" = 'u-taran';

-- Aman (Amandeep Kaur)
UPDATE "User"
SET "email" = 'amandeep.kaur@mitssolution.com',
    "gmailAddress" = 'amandeep.kaur@mitssolution.com'
WHERE "id" = 'u-aman';

-- Areena (Accounts)
UPDATE "User"
SET "email" = 'areena.beri@mitssolution.com',
    "gmailAddress" = 'areena.beri@mitssolution.com'
WHERE "id" = 'u-areena';

-- Malika (Payment processor)
UPDATE "User"
SET "email" = 'malika.gupta@mitssolution.com',
    "gmailAddress" = 'malika.gupta@mitssolution.com'
WHERE "id" = 'u-malika';

-- Ashok (Accounts). Personal gmail account — NOT a @mitssolution.com address,
-- so we only update `email` (used by notify() for outbound) and leave
-- `gmailAddress` null since that field is reserved for Google Workspace SSO
-- identities and is domain-locked to @mitssolution.com.
UPDATE "User"
SET "email" = 'ashokaggarwal504@gmail.com'
WHERE "id" = 'u-ashok';
