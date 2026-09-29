AvrilMatanguihan, Mashoge

## TopicHweader

## Student Vendor Subscription (US-XXX) — Backend Prerequisites

The full application → admin review → contract → billing pipeline for student vendors is built frontend-only against mock/local state (`localStorage`, shared between the student and admin views via `vendor-application.ts`), since none of it exists on the backend yet. Below is what's built, and what's needed to replace the mocks with real calls.

### UI already built (frontend-only, mocked)

- **Student profile — "Become a vendor" card** (`artifacts/frontend/src/features/profile/vendor-application-card.tsx`)
  - Application form: business/stall name, food category, valid-ID upload, selfie-holding-ID upload, bank account number + holder name, subscription plan picker, T&Cs checkbox, gray "billed only after approval/verification/signed contract" notice.
  - Terms & Conditions modal (`vendor-terms-dialog.tsx`) — scrollable legal text (prohibited items, ID/bank verification, contract requirement, informal-stall/no-BIR disclaimer, billing/refund terms); "I agree" button stays disabled until the student scrolls to the bottom.
  - Status views per application state (see state list below), including a countdown on the contract window and a "Retry payment" action.
- **Admin portal — "Vendor applications" page** (`artifacts/frontend/src/features/admin/admin-vendor-applications.tsx`), added as a new tab in `admin-shell.tsx` and route `/admin/vendor-applications`:
  - Table of all submitted applications with student name/email, business, plan, status badge, submitted date, and an overdue-contract flag.
  - Filter bar by status (pending review / awaiting contract / contract submitted / payment processing / payment failed / active / rejected).
  - Detail dialog showing the submitted valid-ID photo, holding-ID selfie, bank details, and (once submitted) the signed contract scan.
  - Actions: approve application (starts the 7-day contract window) / reject application with a reason; reject a submitted contract scan with a reason (reopens the upload window); verify contract & trigger the subscription charge.
- **Subscription plans hardcoded in the frontend** (`vendor-application.ts` → `VENDOR_PLANS`): 1 month/₱40, 6 months/₱150 ("5 + 1 month free" promo), 1 year/₱200 ("11 + 1 month free" promo) — these need to become real `SubscriptionPlan` rows (see schema gap below) so pricing isn't duplicated between frontend and backend.

### Application/verification states implemented (mocked end to end)

- `not_applied` — no application on file yet; shows the "Apply to be a student vendor" button.
- `pending_review` — submitted, waiting on an admin decision.
- `rejected` — admin rejected the application outright, with a reason shown to the student.
- `awaiting_contract` — approved; 7-day wet-ink contract window is running (shows days remaining, or an overdue banner once the window passes).
- `contract_submitted` — student uploaded the signed contract scan; waiting on admin verification.
- `contract_rejected` — admin found the scan illegible/incomplete; reopens `awaiting_contract` with a reason and a fresh 7-day window.
- `payment_processing` — admin verified the contract and triggered the subscription charge; both the student card and the admin table poll/spin while this resolves (mocked as a ~1.6s delay, standing in for the real payment-provider round trip).
- `payment_failed` — the mocked charge failed; student sees a reason and a "Retry payment" button.
- `active` — success state; subscription is active and the student is a verified vendor.

### Already available on the backend — reuse, don't duplicate

- `Vendor` model with `status: VendorStatus` (`ACTIVE | SUSPENDED | PENDING_APPROVAL`) and `vendorType: VendorType` (`SAMPALOC_LANE | STUDENT`) — `PENDING_APPROVAL` exists but nothing sets it today.
- `SubscriptionPlan` / `VendorSubscription` / `Payment` (`purpose = SUBSCRIPTION`) models and the `subscriptions` module (`subscriptions.service.ts`) already handle plan selection, PayMongo checkout, and expiry sweep — but `subscribe()` currently requires `vendor.status === ACTIVE` up front, i.e. it assumes the vendor already exists and is approved.
- `admin/dto/admin-vendor.dto.ts` (`ListAdminVendorsDto`, `UpdateAdminVendorStatusDto`) plus `admin.controller.ts` already let an admin change a vendor's status with a reason — this is the natural place to hang approve/reject, but there's no application object to review yet.
- `AuditRecord` — generic actor/action/before/after audit trail, already used for admin actions; the application review/approval steps below should write to it too.

### Missing model — `VendorApplication`

Nothing exists to represent "a student applied to become a vendor." Needs a new model (something like):

- `studentUserId`, `businessName`, `foodCategory`
- `validIdPhotoUrl`, `idSelfiePhotoUrl` — real file storage, see below
- `bankAccountNumber`, `bankAccountHolderName` (consider whether these need encryption at rest — they're not just references, they're the fields the subscription charge will be drawn from)
- `planId` (`SubscriptionPlan` — the frontend currently hardcodes 3 plans: 1 month/₱40, 6 months/₱150 with a "5+1 month" promo framing, 1 year/₱200 with an "11+1 month" promo framing; these should become real `SubscriptionPlan` rows so pricing isn't duplicated between frontend and backend)
- `termsAcceptedAt` (timestamp, not just a boolean — for dispute/audit purposes)
- `status` enum matching the states already built in the frontend mock (see above): `PENDING_REVIEW → REJECTED | AWAITING_CONTRACT → CONTRACT_SUBMITTED → CONTRACT_REJECTED (loops back to AWAITING_CONTRACT) | PAYMENT_PROCESSING → ACTIVE | PAYMENT_FAILED (retry loops back to PAYMENT_PROCESSING)`
- `rejectionReason`, `contractRejectionReason`, `paymentFailureReason`
- `contractDueAt` (set on approval, `AWAITING_CONTRACT → now + 7 days`, reset on `CONTRACT_REJECTED`), `signedContractPhotoUrl`
- On reaching `ACTIVE`: creates/activates the `Vendor` row (flips `PENDING_APPROVAL → ACTIVE` or creates it), then calls into `subscriptions.service.subscribe()` to actually charge the selected plan — this is the "deducted from their bank account once approved, verified, and the contract is signed" requirement from the product spec, and it's why `subscribe()`'s `ACTIVE`-only precondition needs revisiting (either relax it, or make this the one caller allowed to create the vendor + subscription together in a transaction).

### Missing endpoints

- `POST /vendors/applications` — student submits a new application (the fields above).
- `GET /vendors/applications/mine` — student polls their own application status (the frontend mock currently polls `localStorage` every 500ms while `payment_processing`, and the admin table polls every 1s — replace both with a real push channel or shorter poll against this endpoint).
- `GET /admin/vendor-applications`, `PATCH /admin/vendor-applications/:id` — admin list/review queue with approve (→ `AWAITING_CONTRACT`, sets `contractDueAt`) / reject (→ `REJECTED`, with reason) actions. The admin UI for this now exists at `artifacts/frontend/src/features/admin/admin-vendor-applications.tsx` — it just has nothing real to call yet.
- `POST /vendors/applications/:id/contract` — student uploads the signed contract scan, moves `AWAITING_CONTRACT → CONTRACT_SUBMITTED`.
- `PATCH /admin/vendor-applications/:id/reject-contract` — admin flags the scan as illegible/incomplete with a reason, moves `CONTRACT_SUBMITTED → CONTRACT_REJECTED` (frontend then reopens `AWAITING_CONTRACT`).
- `PATCH /admin/vendor-applications/:id/verify-contract` — admin confirms the signed contract and triggers the subscription charge, moves `CONTRACT_SUBMITTED → PAYMENT_PROCESSING → ACTIVE` on success or `PAYMENT_FAILED` on failure (real version should be driven by the PayMongo webhook, not a fixed delay like the mock). Needs a way to flag/expire applications where `contractDueAt` passes without a submission.
- `POST /vendors/applications/:id/retry-payment` — student retries the subscription charge after `PAYMENT_FAILED`, moves back to `PAYMENT_PROCESSING`.

### File upload — no real storage exists anywhere in the app

There is no S3/object-storage integration or `Document`/`File` model in the schema. The only precedent (`pasabuy-student-id-card.tsx`) resizes images client-side into a data URL and keeps them in `localStorage` only — explicitly a stand-in, never sent to the backend. The vendor application needs at least 3 uploaded images (valid ID, selfie-with-ID, signed contract scan) that an admin must actually be able to view during review, which localStorage can't provide. This needs real storage (e.g. S3-compatible bucket + signed URLs) plus `validIdPhotoUrl` / `idSelfiePhotoUrl` / `signedContractPhotoUrl` columns before this feature can go past the mock.
