ALTER TABLE "reports" ADD COLUMN "reportedPaymentId" UUID;

ALTER TABLE "reports" ADD CONSTRAINT "reports_reportedPaymentId_fkey"
  FOREIGN KEY ("reportedPaymentId") REFERENCES "payments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "reports_reportedPaymentId_idx" ON "reports"("reportedPaymentId");
