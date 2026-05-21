-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('Email', 'WhatsApp');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('Queued', 'Sent', 'Logged', 'Failed');

-- CreateTable
CREATE TABLE "OutboundMessage" (
    "id" TEXT NOT NULL,
    "kind" "MessageKind" NOT NULL,
    "templateId" TEXT,
    "toEmail" TEXT,
    "toPhone" TEXT,
    "toName" TEXT,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "clientId" TEXT,
    "trainerId" TEXT,
    "status" "MessageStatus" NOT NULL DEFAULT 'Queued',
    "provider" TEXT,
    "providerMessageId" TEXT,
    "errorText" TEXT,
    "sentById" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboundMessage_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
