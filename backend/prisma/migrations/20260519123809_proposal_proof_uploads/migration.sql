-- CreateEnum
CREATE TYPE "ConfirmationKind" AS ENUM ('Audio', 'Screenshot');

-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN     "confirmationKind" "ConfirmationKind",
ADD COLUMN     "confirmationUrl" TEXT,
ADD COLUMN     "skillMatrixUrl" TEXT;
