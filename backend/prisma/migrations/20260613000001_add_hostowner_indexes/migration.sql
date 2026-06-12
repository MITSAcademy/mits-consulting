-- Add composite indexes for team-scoped client queries
-- These support the coordinator dashboard and role-based client filtering

CREATE INDEX IF NOT EXISTS "Client_hostOwnerId_idx" ON "Client"("hostOwnerId");
CREATE INDEX IF NOT EXISTS "Client_hostOwnerId_lifecycle_idx" ON "Client"("hostOwnerId", "lifecycle");
