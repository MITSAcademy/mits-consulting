-- AlterEnum
ALTER TYPE "Lifecycle" ADD VALUE 'FeedbackPending';

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "holdCheckBackOn" TEXT,
ADD COLUMN     "holdReason" TEXT,
ADD COLUMN     "holdResumeFromStage" TEXT,
ADD COLUMN     "holdSince" TEXT,
ADD COLUMN     "postDemoFeedbackAt" TEXT,
ADD COLUMN     "postDemoFeedbackBy" TEXT,
ADD COLUMN     "postDemoFeedbackNote" TEXT,
ADD COLUMN     "skillMatrixSentAt" TEXT,
ADD COLUMN     "skillMatrixSentById" TEXT;

-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN     "mustHaveSkills" JSONB,
ADD COLUMN     "softSkills" JSONB,
ADD COLUMN     "trainerNotifiedAt" TEXT,
ADD COLUMN     "trainerNotifiedById" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "gmailAddress" TEXT,
ADD COLUMN     "googleCalendarConnectedAt" TIMESTAMP(3),
ADD COLUMN     "googleId" TEXT,
ADD COLUMN     "googleRefreshToken" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "smtpAppPassword" TEXT,
ADD COLUMN     "smtpConfiguredAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "User_gmailAddress_key" ON "User"("gmailAddress");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

