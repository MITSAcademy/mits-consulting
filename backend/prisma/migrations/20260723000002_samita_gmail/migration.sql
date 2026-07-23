-- Set Samita's gmailAddress so CC emails actually reach her.
-- Previously only her seed email (samita@mitssolution.com) was set;
-- gmailAddress was null, so notify() and CC logic silently fell back
-- to the seed address which may not be her working inbox.

UPDATE "User"
SET "gmailAddress" = 'samita@mitssolution.com',
    "email"        = 'samita@mitssolution.com'
WHERE "id" = 'u-samita';
