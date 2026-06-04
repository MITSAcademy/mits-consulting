-- Ensure the MITS Workspace team rows exist in production. The earlier
-- 20260602120000_roshni_phase_1a migration only ran UPDATE statements,
-- so any team member who was never seeded into prod (Roshni, Mitali,
-- Bhavneet, Muskan, Kashish) never got a User row — and Google SSO bounces
-- them back to the login page with "No MITS portal account for ...".
--
-- This migration UPSERTs each one with the correct Workspace email so
-- the OAuth callback can find them by email.
--
-- passwordHash is a placeholder bcrypt for an unguessable random string —
-- nobody logs in with username/password for these accounts, only SSO.

INSERT INTO "User" (id, name, email, "passwordHash", role, "reportsToId", phone, active, "createdAt")
VALUES ('u-roshni', 'Roshni Seth', 'roshni.seth@mitssolution.com',
        '$2a$10$ssoOnlyPlaceholderHashzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzu',
        'sales_closer', 'u-vaibhav', '+91 62835 05780', true, NOW())
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  name = EXCLUDED.name,
  phone = EXCLUDED.phone,
  role = EXCLUDED.role,
  active = true;

INSERT INTO "User" (id, name, email, "passwordHash", role, "reportsToId", phone, active, "createdAt")
VALUES ('u-mitali', 'Mitali MITS', 'mitagg@mitssolution.com',
        '$2a$10$ssoOnlyPlaceholderHashzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzu',
        'manager', 'u-vaibhav', '+91 97795 30773', true, NOW())
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  name = EXCLUDED.name,
  phone = EXCLUDED.phone,
  role = EXCLUDED.role,
  active = true;

INSERT INTO "User" (id, name, email, "passwordHash", role, "reportsToId", phone, active, "createdAt")
VALUES ('u-bhavneet', 'Bhavneet MITS', 'bhavneet.kaur@mitssolution.com',
        '$2a$10$ssoOnlyPlaceholderHashzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzu',
        'lead', 'u-mitali', '+91 62833 24835', true, NOW())
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  name = EXCLUDED.name,
  phone = EXCLUDED.phone,
  role = EXCLUDED.role,
  active = true;

INSERT INTO "User" (id, name, email, "passwordHash", role, "reportsToId", active, "createdAt")
VALUES ('u-muskan', 'Muskan', 'muskan@mitssolution.com',
        '$2a$10$ssoOnlyPlaceholderHashzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzu',
        'account_manager', 'u-bhavneet', true, NOW())
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  name = EXCLUDED.name,
  role = EXCLUDED.role,
  active = true;

INSERT INTO "User" (id, name, email, "passwordHash", role, "reportsToId", active, "createdAt")
VALUES ('u-kashish', 'Kashish', 'kashish@mitssolution.com',
        '$2a$10$ssoOnlyPlaceholderHashzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzu',
        'account_manager', 'u-bhavneet', true, NOW())
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  name = EXCLUDED.name,
  role = EXCLUDED.role,
  active = true;
