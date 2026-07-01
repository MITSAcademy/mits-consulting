-- Add Mohini Behal as sales_closer (same role as Roshni) to cover during Roshni's leave
-- Temporary password: Mohini@2026 (she should change after first login)
INSERT INTO "User" (id, name, email, "passwordHash", role, active, "createdAt")
VALUES (
  'u-mohini',
  'Mohini Behal',
  'mohini.behal@mitssolution.com',
  '$2b$10$ME.k2p1TM47sspoPbBIcXOCjIM4MypKH/2KI3ME1YAZM7HmAwdQHi',
  'sales_closer',
  true,
  NOW()
)
ON CONFLICT (id) DO UPDATE SET role = 'sales_closer', active = true;
