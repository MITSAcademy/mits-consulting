CREATE TABLE IF NOT EXISTS "RolePermission" (
  "id"          TEXT NOT NULL,
  "resource"    TEXT NOT NULL,
  "role"        TEXT NOT NULL,
  "allowed"     BOOLEAN NOT NULL DEFAULT true,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  "updatedById" TEXT,
  CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "RolePermission_resource_role_key" ON "RolePermission"("resource", "role");
CREATE INDEX IF NOT EXISTS "RolePermission_resource_idx" ON "RolePermission"("resource");
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
