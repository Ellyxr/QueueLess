-- US-058: unpaid preorders expire. reservationExpiresAt is set when a preorder
-- is created; past it, the reservation is cancelled with RESERVATION_EXPIRED.

-- AlterEnum
ALTER TYPE "CancellationReason" ADD VALUE 'RESERVATION_EXPIRED';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "reservationExpiresAt" TIMESTAMPTZ(6);
