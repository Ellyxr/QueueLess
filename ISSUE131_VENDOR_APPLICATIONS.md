# Issue #131 — student vendor application backend

## Scope

This patch adds the backend application/review/contract/billing pipeline to the supplied `issue131-source.zip`. It reuses ImageKit private uploads, SubscriptionPlan/VendorSubscription/Payment and the existing signed PayMongo webhook. It does not connect the existing frontend localStorage mocks or deploy the API.

Approval and contract verification do not authorize direct debit from a bank account. Bank data is supplied for manual verification; payment happens through an authorized PayMongo checkout returned by verify/retry. The payer must open and complete it. No billing happens at application submission or initial approval. Activation is atomic with subscription/payment state in the verified webhook. The existing PayMongo sandbox restriction remains in force.

## Runtime configuration

Keep the existing ImageKit and PayMongo environment settings. Add to the API `.env` and Render API Environment:

```dotenv
VENDOR_APPLICATION_ENCRYPTION_KEY=<base64 of exactly 32 random bytes>
```

Generate a value locally in PowerShell (do not paste it into chat or commit it):

```powershell
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
[Convert]::ToBase64String($bytes)
```

Keep the same key across restarts/deployments and back it up securely. There is no key-rotation tool in this patch. Losing/changing it prevents reading stored bank data. Missing/invalid configuration rejects submissions; no plaintext fallback.

ImageKit uploads are server-side, marked private, and use `/vendor-application-documents`. Configure private-content delivery to reject unsigned access (including transformation bypasses). Confirm an unsigned URL cannot retrieve each test image before using actual identification documents. Signed URLs last five minutes. Existing ImageKit client-upload authentication is not used for this workflow.

## Applying and checking

From a clean checkout of the supplied source, create `issue-131-be`, then check/apply `issue131-vendor-applications.patch`. Stop the API first on Windows before generating the Prisma client.

```powershell
& {
    pnpm --dir artifacts/api-server exec prisma validate
    if ($LASTEXITCODE -ne 0) { throw "Schema validation failed." }
    pnpm --dir artifacts/api-server prisma:generate
    if ($LASTEXITCODE -ne 0) { throw "Client generation failed." }
    pnpm --dir artifacts/api-server build
    if ($LASTEXITCODE -ne 0) { throw "Build failed." }
    pnpm --dir artifacts/api-server typecheck
    if ($LASTEXITCODE -ne 0) { throw "Typecheck failed." }
    pnpm --dir artifacts/api-server lint
    if ($LASTEXITCODE -ne 0) { throw "Lint failed." }
    node --test artifacts/api-server/test/vendor-applications-regression.cjs
    if ($LASTEXITCODE -ne 0) { throw "Application regression failed." }
    git diff --check
    if ($LASTEXITCODE -ne 0) { throw "Diff check failed." }
}
```

Use a staging database. Run `pnpm --dir artifacts/api-server exec prisma migrate deploy`, check its exit code, then `prisma migrate status`. Migration `20261005100000_student_vendor_applications` adds application/document tables, relations, live-application uniqueness and three application-enabled plans. Prices are PHP 40/150/200 for 1/6/12 calendar months, clamped at month ends. Existing plans/vendors/subscriptions are not backfilled or overwritten. Application quote and term duration are snapshotted when submitted.

Start the API with `pnpm --dir artifacts/api-server exec nest start --watch`; avoid the dev script's automatic migration hook during checks.

## API contract

All paths below are under `/api/v1`; JWTs are mandatory. BUYER represents the student role. ADMIN-only accounts cannot submit. Ownership is taken from JWT, never request `studentUserId`. Inactive/archived accounts are rejected by the existing JWT strategy and rechecked before billing/activation.

| Method | Path | Body / result |
|---|---|---|
| GET | `/vendors/applications/plans` | Persisted application-enabled plans and IDs |
| GET | `/vendors/applications/terms` | Required terms version `student-vendor-v1` and billing notice; frontend must display the approved full terms |
| POST | `/vendors/applications/documents` | Multipart `file` + `kind`: `VALID_ID`, `ID_SELFIE`, `SIGNED_CONTRACT`; returns `{id, kind}` |
| GET | `/vendors/applications/documents/:id` | Owner-only five-minute signed URL; no-store |
| POST | `/vendors/applications` | Submission JSON below |
| GET | `/vendors/applications/mine` | Latest own application or null, overdue flag, initial linked subscription and `hasActiveSubscription` |
| POST | `/vendors/applications/:id/contract` | `{ "documentId": "UUID" }` |
| POST | `/vendors/applications/:id/retry-payment` | Resume reserved checkout after failure; returns `{application, checkout}` |
| GET | `/admin/vendor-applications` | Paginated `{items,total,page,limit,totalPages}`; optional `status`, positive `page`, `limit` 1–100 |
| GET | `/admin/vendor-applications/:id` | Safe review details and document IDs |
| GET | `/admin/vendor-applications/documents/:id` | Audited admin access to an attached private document; five-minute URL |
| GET | `/admin/vendor-applications/:id/bank-details` | Audited admin-only decrypted `{accountNumber,holderName}`; no-store |
| PATCH | `/admin/vendor-applications/:id` | `{ "action": "APPROVE" }` or `{ "action": "REJECT", "reason": "..." }` |
| PATCH | `/admin/vendor-applications/:id/reject-contract` | `{ "reason": "..." }` |
| PATCH | `/admin/vendor-applications/:id/verify-contract` | Returns `{application,checkout}`; student must complete `checkout.checkoutUrl` |

Submission example (JSON, uploaded document UUIDs, real persisted plan UUID):

```json
{
  "businessName": "Student food stall",
  "foodCategory": "Rice meals",
  "validIdDocumentId": "uploaded-valid-id-uuid",
  "idSelfieDocumentId": "uploaded-selfie-uuid",
  "bankAccountNumber": "1234567890",
  "bankAccountHolderName": "Student Name",
  "planId": "13100000-0000-4000-8000-000000000001",
  "termsAccepted": true,
  "termsVersion": "student-vendor-v1"
}
```

Account number: 6–34 digits. Images: JPEG/PNG only, 5 MB maximum, MIME + header signature validation. There is a 12-uploads-per-user/day application limit (application-level count, not a strict concurrent quota). No client data URLs or arbitrary external photo URLs are accepted. Upload ID ownership and document kind are checked at attachment. List/mine/detail responses never contain bank ciphertext, full bank number/holder, provider storage paths, file IDs or signed URLs. Admin lists include student name/email specifically for review. Audits exclude bank/photo data, signed URLs and user-entered rejection text.

## State and retry semantics

- Submission → PENDING_REVIEW. One live application per student, enforced by database partial unique index and per-user transaction lock.
- Approve → AWAITING_CONTRACT, deadline now + seven days. Reject → REJECTED with student-visible reason.
- Contract upload before deadline → CONTRACT_SUBMITTED. Wrong owner or wrong document kind rejected.
- Reject contract → CONTRACT_REJECTED with reason and fresh seven-day window; student can upload again directly from that state.
- At/after deadline without upload → CONTRACT_EXPIRED, audited by sweep or attempted late submission. User may reapply with new documents after REJECTED/CONTRACT_EXPIRED. Historical applications remain persisted.
- Verify → PAYMENT_PROCESSING; reserve PENDING vendor/subscription/payment using the server quote, then create checkout outside the database transaction.
- Repeat verify or payment retry resumes the same pending reservation. A cancelled checkout can be replaced after the existing expiry sweep confirms it has expired; price remains the application quote.
- Provider/session creation uncertainty preserves `CREATING` instead of blindly creating another checkout. PAYMENT_FAILED can expose this condition; repeating retry may return 409 while reserved. Support must reconcile provider/session state before any recovery. No automatic second charge is authorized.
- Verified paid webhook checks provider session/reference, paid payment, exact amount/currency. It atomically activates eligible pending student vendor + subscription + application, grants vendor role once and writes audit records. It never reactivates suspended vendors or inactive/archived owners. Ineligible/expired/late payment follows the existing automatic refund path.
- `ACTIVE` records successful initial onboarding. Subscription expiry remains governed by the existing subscription sweep, and `hasActiveSubscription` reflects the initial linked term. Renewals remain in the existing subscriptions API. This patch does not introduce a new universal subscription-based marketplace access policy.

Existing legacy vendors without applications continue using their existing approval/checkout paths. Admin direct vendor activation is blocked for enrolled applications until verified contract and active paid subscription are present.

## Frontend handoff

Replace localStorage reads/writes with these endpoints. Map uppercase API statuses to existing lowercase UI states; add CONTRACT_EXPIRED UI. Use persisted plan IDs/prices; never send client price or student ID. Upload images to the multipart document endpoint, then submit returned IDs. Fetch signed URLs only on document preview. Poll mine while awaiting payment with backoff (e.g. every 3–5 seconds while visible); refresh JWT/profile after activation to show the new vendor role.

Update the existing vendor terms and bank-account notice: remove the promise that a bank account number authorizes automatic deduction. Explain that verified applicants complete authorized payment checkout. Verification response contains a checkout URL intended for the applicant; the admin must not pay with their own funds. Frontend mock integration and visual tests are not included in this backend patch.

## Staging verification still required

Use synthetic images and test bank values, not actual IDs.

1. Run migration on staging; verify three plans and partial unique constraints. Check inactive users/unauthenticated/admin-only student calls and buyer admin calls are rejected.
2. Upload all three document types. Check owner preview works, unrelated buyer cannot view/attach, unsigned provider URL is blocked, and admin can only preview attached documents. Check audit of bank read contains no plaintext and lists are masked.
3. Submit application, approve, reject scan, resubmit, verify. Check timestamps, audit rows, quoted price and vendor still PENDING_APPROVAL. Repeat verify in parallel: one reservation/provider session. Check unsupported transitions and exact deadline expiry; ensure expiry creates no charge.
4. Complete PayMongo sandbox checkout through the signed webhook. Verify correct price/currency, paid payment, ACTIVE subscription/application/vendor and role; replay event and verify no repeated grant/activation. Attempt admin activation before payment; it must fail. Suspend vendor or archive owner before paid webhook; must not reactivate, and automatic refund must be reserved instead.
5. Expire checkout and retry: only one current pending/active subscription. Test provider uncertainty leaves a reserved session; do not clear reservation manually to bypass reconciliation. Verify late payment from cancelled/superseded subscription does not activate the current application and uses the existing refund handling.
6. Verify real PostgreSQL concurrency/rollback and ImageKit/PayMongo network behavior. The included mock tests do not prove these. Keep the earlier QR Ph provider-refund rejection/review limitation and intermittent database connectivity issue visible; this issue does not fix them.
