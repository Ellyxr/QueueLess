/**
 * MOCK-ONLY student vendor application state, plus a mock admin review queue.
 * There is no `VendorApplication`, document/file storage, bank-account model,
 * or admin review/contract-verification endpoint on the backend yet (see
 * artifacts/api-server/AddressMe.md). This module simulates the full
 * application -> admin review -> contract -> payment-verification pipeline
 * in localStorage, shared between the student profile card and the admin
 * "Vendor applications" page, so both sides of the flow can be built and
 * reviewed ahead of that backend work. Swap for real API calls once the
 * endpoints exist.
 */

export type VendorPlanId = "1m" | "6m" | "1y";

export const VENDOR_PLANS: Record<
  VendorPlanId,
  { label: string; months: number; price: number; promo?: string }
> = {
  "1m": { label: "1 month", months: 1, price: 40 },
  "6m": { label: "6 months", months: 6, price: 150, promo: "5 + 1 month free" },
  "1y": { label: "1 year", months: 12, price: 200, promo: "11 + 1 month free" },
};

export type VendorApplicationStatus =
  | "not_applied"
  | "pending_review"
  | "rejected"
  | "awaiting_contract"
  | "contract_submitted"
  | "contract_rejected"
  | "payment_processing"
  | "payment_failed"
  | "active";

export interface VendorApplicationState {
  userId: string;
  studentName: string;
  studentEmail: string;
  status: VendorApplicationStatus;
  businessName: string;
  foodCategory: string;
  /** Small resized data URL — never rendered to anyone but the owning student and admins. */
  validIdPhoto: string | null;
  idSelfiePhoto: string | null;
  bankAccountNumber: string;
  bankAccountHolderName: string;
  planId: VendorPlanId | null;
  termsAccepted: boolean;
  rejectionReason: string | null;
  /** Set when admin approves the application; contract must be returned before this passes. */
  contractDueAt: string | null;
  signedContractPhoto: string | null;
  contractRejectionReason: string | null;
  paymentFailureReason: string | null;
  submittedAt: string | null;
}

const CONTRACT_WINDOW_DAYS = 7;
const REGISTRY_KEY = "queueless-vendor-applications";

function emptyState(userId: string, studentName: string, studentEmail: string): VendorApplicationState {
  return {
    userId,
    studentName,
    studentEmail,
    status: "not_applied",
    businessName: "",
    foodCategory: "",
    validIdPhoto: null,
    idSelfiePhoto: null,
    bankAccountNumber: "",
    bankAccountHolderName: "",
    planId: null,
    termsAccepted: false,
    rejectionReason: null,
    contractDueAt: null,
    signedContractPhoto: null,
    contractRejectionReason: null,
    paymentFailureReason: null,
    submittedAt: null,
  };
}

function getCurrentUser(): { id: string; fullName?: string; email?: string } | null {
  const stored = localStorage.getItem("user");
  if (!stored) return null;
  try {
    const user = JSON.parse(stored) as { id?: string; fullName?: string; email?: string };
    return user.id ? { id: user.id, fullName: user.fullName, email: user.email } : null;
  } catch {
    return null;
  }
}

function readRegistry(): Record<string, VendorApplicationState> {
  const stored = localStorage.getItem(REGISTRY_KEY);
  if (!stored) return {};
  try {
    return JSON.parse(stored) as Record<string, VendorApplicationState>;
  } catch {
    return {};
  }
}

function writeRegistry(registry: Record<string, VendorApplicationState>): void {
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
}

export function getVendorApplication(): VendorApplicationState {
  const user = getCurrentUser();
  if (!user) return emptyState("", "", "");
  const registry = readRegistry();
  return registry[user.id] ?? emptyState(user.id, user.fullName || "Student", user.email || "");
}

function setVendorApplication(next: VendorApplicationState): void {
  const registry = readRegistry();
  registry[next.userId] = next;
  writeRegistry(registry);
}

/** Admin-facing: every application that has been submitted at least once. */
export function listVendorApplications(): VendorApplicationState[] {
  return Object.values(readRegistry())
    .filter((application) => application.status !== "not_applied")
    .sort((a, b) => (b.submittedAt || "").localeCompare(a.submittedAt || ""));
}

export function submitVendorApplication(
  input: Omit<
    VendorApplicationState,
    | "userId"
    | "studentName"
    | "studentEmail"
    | "status"
    | "rejectionReason"
    | "contractDueAt"
    | "signedContractPhoto"
    | "contractRejectionReason"
    | "paymentFailureReason"
    | "submittedAt"
  >,
): void {
  const current = getVendorApplication();
  setVendorApplication({
    ...current,
    ...input,
    status: "pending_review",
    rejectionReason: null,
    submittedAt: new Date().toISOString(),
  });
}

function contractDeadline(): string {
  return new Date(Date.now() + CONTRACT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/** Admin: approves the application and starts the 7-day wet-ink contract window. */
export function approveVendorApplication(userId: string): void {
  const registry = readRegistry();
  const application = registry[userId];
  if (!application) return;
  setVendorApplication({
    ...application,
    status: "awaiting_contract",
    contractDueAt: contractDeadline(),
    rejectionReason: null,
  });
}

/** Admin: rejects the application outright, before any contract stage. */
export function rejectVendorApplication(userId: string, reason: string): void {
  const registry = readRegistry();
  const application = registry[userId];
  if (!application) return;
  setVendorApplication({ ...application, status: "rejected", rejectionReason: reason });
}

/** Student: uploads the scanned, signed contract within the 7-day window. */
export function submitSignedContract(signedContractPhoto: string): void {
  const current = getVendorApplication();
  setVendorApplication({
    ...current,
    signedContractPhoto,
    status: "contract_submitted",
    contractRejectionReason: null,
  });
}

/** Admin: the scanned contract is illegible/incomplete — reopens the upload window. */
export function rejectSignedContract(userId: string, reason: string): void {
  const registry = readRegistry();
  const application = registry[userId];
  if (!application) return;
  setVendorApplication({
    ...application,
    status: "awaiting_contract",
    contractDueAt: contractDeadline(),
    contractRejectionReason: reason,
    signedContractPhoto: null,
  });
}

/**
 * Admin: verifies the signed contract and kicks off the subscription charge.
 * Moves to `payment_processing` immediately, then resolves to `active` or
 * `payment_failed` shortly after — standing in for the real payment-provider
 * webhook round trip (see `subscriptions.service.ts` on the backend, which
 * already does this for already-active vendors).
 */
export function verifyContractAndCharge(userId: string): void {
  const registry = readRegistry();
  const application = registry[userId];
  if (!application) return;
  setVendorApplication({ ...application, status: "payment_processing", paymentFailureReason: null });

  window.setTimeout(() => {
    const latest = readRegistry()[userId];
    if (!latest || latest.status !== "payment_processing") return;
    const succeeded = Math.random() > 0.15;
    setVendorApplication(
      succeeded
        ? { ...latest, status: "active", paymentFailureReason: null }
        : {
            ...latest,
            status: "payment_failed",
            paymentFailureReason: "The bank declined the subscription charge. Confirm the account details and retry.",
          },
    );
  }, 1600);
}

/** Student: retries the subscription charge after a failed attempt. */
export function retryVendorPayment(): void {
  const current = getVendorApplication();
  if (current.status !== "payment_failed") return;
  verifyContractAndCharge(current.userId);
}

export function isContractOverdue(application: VendorApplicationState): boolean {
  if (application.status !== "awaiting_contract" || !application.contractDueAt) return false;
  return new Date(application.contractDueAt).getTime() < Date.now();
}
