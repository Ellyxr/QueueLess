-- US-066: reviews can be reported, and hidden/restored by an admin.

-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "reportedReviewId" UUID;

-- AlterTable
ALTER TABLE "order_reviews" ADD COLUMN     "hiddenAt" TIMESTAMPTZ(6),
ADD COLUMN     "hiddenByUserId" UUID,
ADD COLUMN     "hiddenReason" VARCHAR(500);

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reportedReviewId_fkey" FOREIGN KEY ("reportedReviewId") REFERENCES "order_reviews"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_reviews" ADD CONSTRAINT "order_reviews_hiddenByUserId_fkey" FOREIGN KEY ("hiddenByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

