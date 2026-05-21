-- CreateEnum
CREATE TYPE "DemoStatus" AS ENUM ('Scheduled', 'Done', 'Cancelled', 'Rescheduled');

-- CreateTable
CREATE TABLE "Demo" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "trainerId" TEXT,
    "scheduledDate" TEXT,
    "scheduledTimeIst" TEXT,
    "actualDate" TEXT,
    "actualTimeIst" TEXT,
    "outcome" TEXT,
    "feedback" TEXT,
    "nextSteps" TEXT,
    "status" "DemoStatus" NOT NULL DEFAULT 'Scheduled',
    "conductedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Demo_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Demo" ADD CONSTRAINT "Demo_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Demo" ADD CONSTRAINT "Demo_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Demo" ADD CONSTRAINT "Demo_conductedById_fkey" FOREIGN KEY ("conductedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
