-- Add Mohini Behal as sales_closer (same role as Roshni) to cover during Roshni's leave
-- No password — she logs in via Google SSO with mohini.behal@mitssolution.com
INSERT INTO "User" (id, name, email, "passwordHash", role, active, "createdAt")
VALUES (
  'u-mohini',
  'Mohini Behal',
  'mohini.behal@mitssolution.com',
  '',
  'sales_closer',
  true,
  NOW()
)
ON CONFLICT (id) DO UPDATE SET role = 'sales_closer', active = true, email = 'mohini.behal@mitssolution.com';
