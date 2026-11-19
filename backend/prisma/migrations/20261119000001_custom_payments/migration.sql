-- Custom-amount payments from mitsedge.com/pay, and the fixed-amount links staff
-- create for them. Entirely additive: no existing table is touched.
--
-- Deliberately separate from StudentPurchase: a custom payment is money
-- received for a stated purpose and must never enroll anyone in a course.

CREATE TABLE "PaymentLink" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "purpose" TEXT NOT NULL,
    "clientName" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomPayment" (
    "id" TEXT NOT NULL,
    "payerName" TEXT NOT NULL,
    "payerEmail" TEXT NOT NULL,
    "payerPhone" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "gateway" TEXT NOT NULL DEFAULT 'payglocal',
    "merchantTxnId" TEXT NOT NULL,
    "gatewayRef" TEXT,
    "linkId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentLink_token_key" ON "PaymentLink"("token");
CREATE INDEX "PaymentLink_createdAt_idx" ON "PaymentLink"("createdAt");

CREATE UNIQUE INDEX "CustomPayment_merchantTxnId_key" ON "CustomPayment"("merchantTxnId");
CREATE INDEX "CustomPayment_status_idx" ON "CustomPayment"("status");
CREATE INDEX "CustomPayment_payerEmail_idx" ON "CustomPayment"("payerEmail");
CREATE INDEX "CustomPayment_createdAt_idx" ON "CustomPayment"("createdAt");
CREATE INDEX "CustomPayment_linkId_idx" ON "CustomPayment"("linkId");

ALTER TABLE "CustomPayment" ADD CONSTRAINT "CustomPayment_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "PaymentLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;
