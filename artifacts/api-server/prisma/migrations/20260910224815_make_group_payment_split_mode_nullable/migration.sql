-- AlterTable
ALTER TABLE "group_orders" ALTER COLUMN "paymentSplitMode" DROP NOT NULL,
ALTER COLUMN "paymentSplitMode" DROP DEFAULT;
