-- Add Natasha as payment_processor (accountant).
-- Her role is to prepare the final bank sheet, primarily working off
-- Bhavneet's weekly trainer pay sheet. Shares the same access as Malika.
--
-- Update the email to Natasha's actual MITS Workspace address if different.

INSERT INTO "User" (id, name, email, "passwordHash", role, "reportsToId", active, "createdAt")
VALUES ('u-natasha', 'Natasha', 'natasha@mitssolution.com',
        '$2a$10$ssoOnlyPlaceholderHashzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzu',
        'payment_processor', 'u-vaibhav', true, NOW())
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  name  = EXCLUDED.name,
  role  = EXCLUDED.role,
  active = true;
