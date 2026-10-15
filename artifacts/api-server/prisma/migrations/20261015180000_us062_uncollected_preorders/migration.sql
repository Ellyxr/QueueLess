-- US-062: a ready preorder not collected within the grace period after its
-- pickup window is flagged UNCOLLECTED (terminal).

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'UNCOLLECTED';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "pickupWindowEndsAt" TIMESTAMPTZ(6);
