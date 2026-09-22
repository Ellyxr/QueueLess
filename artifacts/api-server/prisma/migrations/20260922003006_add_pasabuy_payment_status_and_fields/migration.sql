-- CreateEnum
CREATE TYPE "PasabuyPaymentStatus" AS ENUM ('NOT_CHARGED', 'AWAITING_PAYMENT', 'PAID', 'PAYMENT_FAILED', 'PAYMENT_EXPIRED', 'REFUNDED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PasabuyStatus" ADD VALUE 'AWAITING_PAYMENT';
ALTER TYPE "PasabuyStatus" ADD VALUE 'PICKUP_READY';
ALTER TYPE "PasabuyStatus" ADD VALUE 'PICKED_UP';
ALTER TYPE "PasabuyStatus" ADD VALUE 'COMPLETED';
ALTER TYPE "PasabuyStatus" ADD VALUE 'EXPIRED';
ALTER TYPE "PasabuyStatus" ADD VALUE 'PAYMENT_EXPIRED';
ALTER TYPE "PasabuyStatus" ADD VALUE 'DISPUTED';

-- AlterTable
ALTER TABLE "pasabuy_profiles" ADD COLUMN     "studentIdPhotoUrl" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "pasabuy_requests" ADD COLUMN     "expiresAt" TIMESTAMPTZ(6),
ADD COLUMN     "paymentDeadline" TIMESTAMPTZ(6),
ADD COLUMN     "paymentStatus" "PasabuyPaymentStatus" NOT NULL DEFAULT 'NOT_CHARGED',
ADD COLUMN     "pickupCode" TEXT,
ADD COLUMN     "termsAcceptedAt" TIMESTAMPTZ(6);
