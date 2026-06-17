CREATE TABLE "UserFeatureFlag" (
  "userId"    TEXT NOT NULL,
  "flag"      TEXT NOT NULL,
  "enabled"   BOOLEAN NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserFeatureFlag_pkey" PRIMARY KEY ("userId","flag")
);
