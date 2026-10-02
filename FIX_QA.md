# fix-qa: portal fixes and QueueLess wallet

This patch is based on the supplied `queueless-fix-qa-source.zip`. Apply it on `fix-qa`; it does not implement or restore the stashed US-051 changes.

## Changes

- Product/extra Add/Edit modal: maximum height follows the dynamic viewport; the content scrolls inside the dialog.
- Vendor account: the owner can load their own pending/suspended storefront. Buyers still see only ACTIVE vendors.
- Buyer support: order reports default to ORDER, show full order IDs, and accept a pasted order ID. Existing backend ownership checks remain authoritative.
- Order help: eligibility updates every second. Contact vendor and Request refund appear for overdue paid orders, including expired preparation estimates. The backend still determines refund eligibility. Existing automatic cancellation/refund scheduling remains enabled.
- Wallet: cash-in through PayMongo, persisted PHP balance, ledger history, and food payment using that balance. Existing card/GCash/QR Ph methods remain available, including a switch back from wallet checkout.

## Scope and mode

The current PayMongo integration only accepts sandbox secret keys. The wallet is explicitly labeled **sandbox / test funds**. This patch is a demo implementation, not a release of real-money stored-value accounts. It does not add withdrawals, transfers, or cash-in refunds; food refunds return funds to the wallet. Cash-in refunds are rejected by food-refund endpoints to prevent refunding deposited funds without debiting the wallet.

Never credit the wallet from a browser redirect, an admin balance edit, or local storage. Signed webhook processing retrieves the checkout/payment from PayMongo and checks the stored reference, currency, amount, paid status, and session before crediting.

## API contract

All wallet endpoints require a buyer JWT. They operate on the authenticated user's records.

| Method/path (under `/api/v1`) | Request | Response |
| --- | --- | --- |
| GET `/wallet` | — | `{ balance: "100.00", currency: "PHP", mode: "SANDBOX" }` |
| GET `/wallet/entries?page=1` | Positive page; 20 entries/page | `{ items, total, page, limit }` |
| POST `/wallet/topups` | `Idempotency-Key` header; `{ "amount": "100.00" }` | `{ paymentId, amount, status, checkoutUrl, idempotentReplay }` |
| GET `/wallet/topups/:id` | Cash-in payment UUID | `{ id, status, amount }` |
| GET `/wallet/purchases/:id` | Payment-share UUID | `{ paymentShareId, amount, currency, status, orderId, orderStatus }` |
| POST `/wallet/pay` | `Idempotency-Key`; `{ "paymentShareId": "UUID" }` | `{ paymentId, orderId, status: "SUCCEEDED", provider: "WALLET", idempotentReplay }` |

Cash-in amount is a decimal string, PHP 20–10,000 inclusive, with no more than two decimal places. A key cannot be reused for a different amount/share. Wallet payment uses the persisted `PaymentShare.amountDue`; client totals are never accepted.

Ledger entries include `id`, `type` (`TOPUP`, `PURCHASE`, `REFUND`), signed `amount`, `balanceAfter`, payment/refund reference, and timestamp. The database rejects updates/deletes to ledger entries. Balance and ledger changes, payment/share state, and audit records commit together. Serializable transactions retry database conflicts; order locks coordinate wallet checkout with PayMongo checkout/webhook processing. Late external payment after wallet payment goes through the existing automatic refund path.

An uncertain/provider-failed cash-in checkout is kept reserved rather than blindly creating another session for the same key. Check the cash-in/payment and balance before starting another intent. A verified late webhook can still complete that reservation.

## Apply: first three steps (PowerShell, repo root)

1. Verify branch and patch file:

```powershell
if ((git branch --show-current) -ne "fix-qa") { throw "Switch to fix-qa first." }
if (git status --porcelain) { throw "Preserve existing changes before applying this patch." }
$patch = Join-Path $env:USERPROFILE "Downloads\fix-qa-portals-wallet.patch"
if (-not (Test-Path $patch)) { throw "Download fix-qa-portals-wallet.patch first." }
```

2. Check:

```powershell
git apply --check --ignore-whitespace $patch
if ($LASTEXITCODE -ne 0) { throw "Patch check failed; stop here." }
```

3. Apply:

```powershell
git apply --ignore-whitespace $patch
if ($LASTEXITCODE -ne 0) { throw "Patch application failed; stop here." }
git status -sb
```

## Validate: next three steps

Stop the API terminal with Ctrl+C before generating Prisma Client on Windows. Do not use `pnpm dev` during this step; its predev hook deploys migrations automatically.

1. Schema and client:

```powershell
pnpm --dir artifacts/api-server exec prisma validate
if ($LASTEXITCODE -ne 0) { throw "Schema validation failed." }
pnpm --dir artifacts/api-server prisma:generate
if ($LASTEXITCODE -ne 0) { throw "Prisma generation failed." }
```

2. Backend build/checks and behavioral tests:

```powershell
pnpm --dir artifacts/api-server build
if ($LASTEXITCODE -ne 0) { throw "API build failed." }
pnpm --dir artifacts/api-server typecheck
if ($LASTEXITCODE -ne 0) { throw "API typecheck failed." }
pnpm --dir artifacts/api-server lint
if ($LASTEXITCODE -ne 0) { throw "API lint failed." }
node --test artifacts/api-server/test/wallet-regression.cjs
if ($LASTEXITCODE -ne 0) { throw "Wallet regression failed." }
pnpm --dir artifacts/api-server exec tsx --test ../frontend/test/refund-eligibility.test.ts
if ($LASTEXITCODE -ne 0) { throw "Timeout regression failed." }
```

3. Frontend checks:

```powershell
pnpm --dir artifacts/frontend typecheck
if ($LASTEXITCODE -ne 0) { throw "Frontend typecheck failed." }
pnpm --dir artifacts/frontend build
if ($LASTEXITCODE -ne 0) { throw "Frontend build failed." }
git diff --check
if ($LASTEXITCODE -ne 0) { throw "Diff check failed." }
```

## Staging migration and verification

Use a staging/test database, then run `pnpm --dir artifacts/api-server exec prisma migrate deploy` and `prisma migrate status`. There are two new migrations: enum addition, then wallet/ledger tables and immutability constraints. Existing balances start at zero; historical payments are not credited as wallet funds.

With API/frontend running and the existing PayMongo webhook configured:

1. Open Profile → QueueLess wallet. Cash in PHP 100 using PayMongo sandbox. The balance stays zero until the signed event is processed. Retry the same webhook: one credit/ledger entry only.
2. Choose QueueLess wallet in Cart. Confirm the server-provided amount due on the wallet page. Complete purchase; verify PAID order, WALLET/SUCCEEDED payment, correct debit, and remaining balance. Insufficient funds must leave the order pending, with the same share available after cash-in.
3. Verify refund returns funds once, concurrent real database purchases cannot overdraw, and a late PayMongo payment for a wallet-paid order is refunded. Check the ledger/audit rows and existing admin transaction/metric endpoints.
4. On small devices (320×480, 360×640, landscape 844×390), open Add/Edit Product; scroll to Save and back to Close. Verify pending vendor owner access and buyer exclusion. Submit an order report by pasted ID; another buyer's ID must be rejected. Check timeout actions while the dialog stays open.

## Validation performed here

- Prisma schema validation/client generation, API build/typecheck/lint, frontend typecheck/build, and patch whitespace check.
- 17 wallet behavioral tests and 6 timeout boundary tests pass.
- Wallet tests use an in-memory rollback/serialization harness. They do not verify PostgreSQL locks, migration execution, PayMongo network calls, or browser behavior.
- Browser visual testing was unavailable because no Chromium executable was installed.
- The existing frontend sourcemap-location and bundle-size warnings still appear; the build succeeds.

The patch is not committed, pushed, migrated, or deployed to your services. Complete staging verification before marking wallet QA complete.
