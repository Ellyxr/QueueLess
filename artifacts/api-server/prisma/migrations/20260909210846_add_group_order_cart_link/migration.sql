/*
  Warnings:

  - A unique constraint covering the columns `[groupOrderId,userId]` on the table `carts` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "carts" ADD COLUMN     "groupOrderId" UUID,
ADD COLUMN     "orderId" UUID;

-- CreateIndex
CREATE INDEX "carts_groupOrderId_idx" ON "carts"("groupOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "carts_groupOrderId_userId_key" ON "carts"("groupOrderId", "userId");

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_groupOrderId_fkey" FOREIGN KEY ("groupOrderId") REFERENCES "group_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
