ALTER TABLE "payments" ADD COLUMN "walletKey" TEXT;
CREATE UNIQUE INDEX "payments_payerUserId_walletKey_key" ON "payments"("payerUserId", "walletKey");
CREATE TABLE "wallets" (
 "userId" UUID PRIMARY KEY REFERENCES "users"("id") ON DELETE RESTRICT,
 "balance" DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK ("balance" >= 0),
 "updatedAt" TIMESTAMPTZ(6) NOT NULL
);
CREATE TABLE "wallet_entries" (
 "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 "userId" UUID NOT NULL REFERENCES "wallets"("userId") ON DELETE RESTRICT,
 "type" TEXT NOT NULL CHECK ("type" IN ('TOPUP','PURCHASE','REFUND')),
 "amount" DECIMAL(10,2) NOT NULL CHECK (("type" = 'PURCHASE' AND "amount" < 0) OR ("type" IN ('TOPUP','REFUND') AND "amount" > 0)),
 "balanceAfter" DECIMAL(10,2) NOT NULL CHECK ("balanceAfter" >= 0),
 "paymentId" UUID UNIQUE REFERENCES "payments"("id") ON DELETE RESTRICT,
 "refundId" UUID UNIQUE REFERENCES "refunds"("id") ON DELETE RESTRICT,
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK (("type" = 'REFUND' AND "refundId" IS NOT NULL AND "paymentId" IS NULL) OR ("type" IN ('TOPUP','PURCHASE') AND "paymentId" IS NOT NULL AND "refundId" IS NULL))
);
CREATE INDEX "wallet_entries_userId_createdAt_idx" ON "wallet_entries"("userId", "createdAt");
CREATE FUNCTION prevent_wallet_entry_changes() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Wallet ledger entries are immutable'; END $$;
CREATE TRIGGER wallet_entries_immutable BEFORE UPDATE OR DELETE ON "wallet_entries" FOR EACH ROW EXECUTE FUNCTION prevent_wallet_entry_changes();
