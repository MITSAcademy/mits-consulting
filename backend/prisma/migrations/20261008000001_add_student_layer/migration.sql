-- Student layer: public signups from mitsedge.com, their OTPs, and their purchases.
-- Entirely additive — no existing table is touched.

CREATE TABLE "Student" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT,
    "googleSub" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudentOtp" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentOtp_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudentPurchase" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "courseId" INTEGER NOT NULL,
    "courseTitle" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "gateway" TEXT NOT NULL DEFAULT 'payglocal',
    "merchantTxnId" TEXT NOT NULL,
    "gatewayRef" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentPurchase_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Student_email_key" ON "Student"("email");
CREATE UNIQUE INDEX "Student_googleSub_key" ON "Student"("googleSub");
CREATE INDEX "Student_createdAt_idx" ON "Student"("createdAt");

CREATE INDEX "StudentOtp_studentId_purpose_idx" ON "StudentOtp"("studentId", "purpose");

CREATE UNIQUE INDEX "StudentPurchase_merchantTxnId_key" ON "StudentPurchase"("merchantTxnId");
CREATE INDEX "StudentPurchase_studentId_createdAt_idx" ON "StudentPurchase"("studentId", "createdAt");
CREATE INDEX "StudentPurchase_status_idx" ON "StudentPurchase"("status");

ALTER TABLE "StudentOtp" ADD CONSTRAINT "StudentOtp_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentPurchase" ADD CONSTRAINT "StudentPurchase_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
