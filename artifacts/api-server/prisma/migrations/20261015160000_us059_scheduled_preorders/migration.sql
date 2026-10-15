-- US-059: paid preorders are held as SCHEDULED until queueReleaseAt, then a
-- job moves them into the vendor's live queue (PAID).

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'SCHEDULED';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "queueReleaseAt" TIMESTAMPTZ(6);
