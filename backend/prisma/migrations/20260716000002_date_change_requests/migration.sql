-- CreateTable
CREATE TABLE "DateChangeRequest" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "requestedByName" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "proposedDate1" TEXT,
    "proposedDate2" TEXT,
    "linkedPaymentId" TEXT,
    "screenshotBase64" TEXT,
    "summary30d" TEXT,
    "mitaliF15d" TEXT,
    "bhavneetF15d" TEXT,
    "lastSessionDate" TEXT,
    "issueDetail" TEXT,
    "leverageScreenshot" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "approvedById" TEXT,
    "approvedByName" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DateChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DateChangeRequest_clientId_idx" ON "DateChangeRequest"("clientId");
CREATE INDEX "DateChangeRequest_status_idx" ON "DateChangeRequest"("status");
CREATE INDEX "DateChangeRequest_requestedById_idx" ON "DateChangeRequest"("requestedById");

-- AddForeignKey
ALTER TABLE "DateChangeRequest" ADD CONSTRAINT "DateChangeRequest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
