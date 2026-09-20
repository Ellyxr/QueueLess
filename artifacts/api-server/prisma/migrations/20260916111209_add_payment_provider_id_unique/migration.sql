CREATE UNIQUE INDEX payments_providerpaymentid_key
ON payments ("providerPaymentId")
WHERE "providerPaymentId" IS NOT NULL;