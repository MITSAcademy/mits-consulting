-- AlterEnum
ALTER TYPE "Lifecycle" ADD VALUE 'Dormant';

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "dormantCheckBackOn" TEXT,
ADD COLUMN     "dormantReason" TEXT,
ADD COLUMN     "dormantResumeFromStage" TEXT,
ADD COLUMN     "dormantSince" TEXT;
