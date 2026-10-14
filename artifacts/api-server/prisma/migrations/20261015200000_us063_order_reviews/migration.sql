-- US-063: one review per picked-up order, rating 1-5, comment up to 1000 chars.

-- CreateTable
CREATE TABLE "order_reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "orderId" UUID NOT NULL,
    "reviewerUserId" UUID NOT NULL,
    "vendorId" UUID NOT NULL,
    "rating" SMALLINT NOT NULL,
    "comment" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "order_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_reviews_orderId_key" ON "order_reviews"("orderId");

-- CreateIndex
CREATE INDEX "order_reviews_vendorId_createdAt_idx" ON "order_reviews"("vendorId", "createdAt");

-- CreateIndex
CREATE INDEX "order_reviews_reviewerUserId_idx" ON "order_reviews"("reviewerUserId");

-- AddForeignKey
ALTER TABLE "order_reviews" ADD CONSTRAINT "order_reviews_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_reviews" ADD CONSTRAINT "order_reviews_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_reviews" ADD CONSTRAINT "order_reviews_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Rating range enforced by the database too (Prisma cannot express CHECK).
ALTER TABLE "order_reviews" ADD CONSTRAINT "order_reviews_rating_check" CHECK ("rating" BETWEEN 1 AND 5);
