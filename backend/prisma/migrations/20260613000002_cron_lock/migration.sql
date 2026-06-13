-- CronLock: atomic distributed lock for cron jobs (prevents double-fire on Render zero-downtime deploy)
CREATE TABLE "CronLock" (
    "key"       TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CronLock_pkey" PRIMARY KEY ("key")
);
