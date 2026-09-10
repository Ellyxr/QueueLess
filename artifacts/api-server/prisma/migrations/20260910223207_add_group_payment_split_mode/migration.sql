-- CreateEnum
CREATE TYPE "GroupPaymentSplitMode" AS ENUM ('ITEM_BASED', 'EQUAL', 'CUSTOM');

-- AlterTable
ALTER TABLE "group_orders" ADD COLUMN     "paymentSplitMode" "GroupPaymentSplitMode" NOT NULL DEFAULT 'ITEM_BASED';
