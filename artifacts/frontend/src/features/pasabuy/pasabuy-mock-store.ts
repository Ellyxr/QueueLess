/**
 * MOCK-ONLY data layer for the Pasabuy feature (US-053, frontend-only build).
 *
 * The real backend (`artifacts/api-server/src/pasabuy`) only supports profile,
 * browse, accept, pickup and deliver today — there is no create/complete/cancel/
 * dispute endpoint, no Pasabuy-fee-only payment endpoint, and the schema's
 * PasabuyStatus enum doesn't match this flow. See
 * `artifacts/api-server/AddressMe.md` for the full list of gaps.
 *
 * Payment model: the food order is paid at checkout as before (unaffected by
 * this file). The Pasabuy fee itself is only charged once a deliverer accepts
 * — see `payPasabuyFee` / `markPasabuyPaymentFailed`. Nothing here ever touches
 * the food order's payment.
 *
 * Everything in this file is isolated so it can be swapped for real API calls
 * (`@/features/auth/api`) without touching any component that only talks to the
 * exported functions below.
 */

export type PasabuyStatus =
  | "OPEN"
  | "ACCEPTED"
  | "AWAITING_PAYMENT"
  | "PAID"
  | "PICKUP_READY"
  | "PICKED_UP"
  | "DELIVERED"
  | "COMPLETED"
  | "CANCELLED"
  | "EXPIRED"
  | "PAYMENT_EXPIRED"
  | "DISPUTED";

/** Tracked separately from `PasabuyStatus` — see doc section 17: "Do not infer payment status solely from the delivery status." */
export type PasabuyPaymentStatus =
  | "NOT_CHARGED"
  | "AWAITING_PAYMENT"
  | "PAID"
  | "PAYMENT_FAILED"
  | "PAYMENT_EXPIRED"
  | "REFUNDED";

export type PasabuyDeliveryType = "IN_CAMPUS" | "OUTSIDE_CAMPUS";

export const PASABUY_FEE: Record<PasabuyDeliveryType, number> = {
  IN_CAMPUS: 30,
  OUTSIDE_CAMPUS: 50,
};

export const OUTSIDE_CAMPUS_RADIUS_METERS = 270;

export interface PasabuyOrderInfo {
  orderId: string;
  reference: string;
  items: string;
  vendorName: string;
  pickupLocation: string;
}

export interface PasabuyStatusEvent {
  status: PasabuyStatus;
  note: string;
  at: string;
}

export interface PasabuyRequestRecord {
  id: string;
  reference: string;
  status: PasabuyStatus;
  paymentStatus: PasabuyPaymentStatus;
  order: PasabuyOrderInfo;
  deliveryType: PasabuyDeliveryType;
  deliveryLocation: string;
  fee: number;
  requesterUserId: string;
  requesterName: string;
  delivererUserId: string | null;
  delivererName: string | null;
  pickupCode: string;
  termsAcceptedAt: string;
  disputeReason: string | null;
  history: PasabuyStatusEvent[];
  createdAt: string;
  expiresAt: string | null;
  acceptedAt: string | null;
  paymentDeadline: string | null;
  paidAt: string | null;
  pickupReadyAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
}

const STORAGE_KEY = "queueless-pasabuy-mock-v2";
export const PASABUY_CHANGED_EVENT = "queueless-pasabuy-changed";
const OPEN_REQUEST_TTL_MS = 15 * 60 * 1000;
const PAYMENT_WINDOW_MS = 5 * 60 * 1000;

function getCurrentUser(): { id: string; fullName: string } | null {
  const stored = localStorage.getItem("user");
  if (!stored) return null;
  try {
    const user = JSON.parse(stored) as { id?: string; fullName?: string; email?: string };
    if (!user.id) return null;
    return { id: user.id, fullName: user.fullName || user.email || "Student" };
  } catch {
    return null;
  }
}

function generatePickupCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function generateReference(): string {
  return `QL-${Math.floor(10000 + Math.random() * 89999)}`;
}

function readAll(): PasabuyRequestRecord[] {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return seedDemoRequests();
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? (parsed as PasabuyRequestRecord[]) : [];
  } catch {
    return [];
  }
}

function writeAll(records: PasabuyRequestRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  window.dispatchEvent(new Event(PASABUY_CHANGED_EVENT));
}

/** Demo data so the marketplace banner isn't empty on a fresh browser. Mock-only. */
function seedDemoRequests(): PasabuyRequestRecord[] {
  const now = Date.now();
  const seed: PasabuyRequestRecord[] = [
    {
      id: "seed-1",
      reference: "QL-10482",
      status: "OPEN",
      paymentStatus: "NOT_CHARGED",
      order: {
        orderId: "seed-order-1",
        reference: "QL-10482",
        items: "Chicken Rice + Iced Tea",
        vendorName: "North Loop Kitchen",
        pickupLocation: "NU Laguna — Sampaloc Lane",
      },
      deliveryType: "IN_CAMPUS",
      deliveryLocation: "In Campus — Dorm C, Room 214",
      fee: PASABUY_FEE.IN_CAMPUS,
      requesterUserId: "seed-user-1",
      requesterName: "Mia Santos",
      delivererUserId: null,
      delivererName: null,
      pickupCode: generatePickupCode(),
      termsAcceptedAt: new Date(now - 3 * 60 * 1000).toISOString(),
      disputeReason: null,
      history: [{ status: "OPEN", note: "Pasabuy request created", at: new Date(now - 3 * 60 * 1000).toISOString() }],
      createdAt: new Date(now - 3 * 60 * 1000).toISOString(),
      expiresAt: new Date(now + OPEN_REQUEST_TTL_MS - 3 * 60 * 1000).toISOString(),
      acceptedAt: null,
      paymentDeadline: null,
      paidAt: null,
      pickupReadyAt: null,
      pickedUpAt: null,
      deliveredAt: null,
      completedAt: null,
      cancelledAt: null,
    },
    {
      id: "seed-2",
      reference: "QL-10491",
      status: "OPEN",
      paymentStatus: "NOT_CHARGED",
      order: {
        orderId: "seed-order-2",
        reference: "QL-10491",
        items: "Beef Bulgogi Bowl",
        vendorName: "Seoul Bites",
        pickupLocation: "NU Laguna — Food Hub",
      },
      deliveryType: "OUTSIDE_CAMPUS",
      deliveryLocation: "Outside Campus — 120 Sampaloc St.",
      fee: PASABUY_FEE.OUTSIDE_CAMPUS,
      requesterUserId: "seed-user-2",
      requesterName: "Jay Cruz",
      delivererUserId: null,
      delivererName: null,
      pickupCode: generatePickupCode(),
      termsAcceptedAt: new Date(now - 60 * 1000).toISOString(),
      disputeReason: null,
      history: [{ status: "OPEN", note: "Pasabuy request created", at: new Date(now - 60 * 1000).toISOString() }],
      createdAt: new Date(now - 60 * 1000).toISOString(),
      expiresAt: new Date(now + OPEN_REQUEST_TTL_MS - 60 * 1000).toISOString(),
      acceptedAt: null,
      paymentDeadline: null,
      paidAt: null,
      pickupReadyAt: null,
      pickedUpAt: null,
      deliveredAt: null,
      completedAt: null,
      cancelledAt: null,
    },
  ];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
  return seed;
}

function appendHistory(record: PasabuyRequestRecord, status: PasabuyStatus, note: string): PasabuyRequestRecord["history"] {
  return [...record.history, { status, note, at: new Date().toISOString() }];
}

/**
 * Runs on every read: expires an OPEN request nobody accepted (no Pasabuy fee
 * was ever charged, so this never needs a refund — rule 4/7 in the payment doc),
 * and expires an AWAITING_PAYMENT request whose payment window passed (also no
 * charge, so it goes straight to CANCELLED rather than sitting in
 * PAYMENT_EXPIRED — rule 7, section 13's preferred behavior).
 */
function sweepExpirations(records: PasabuyRequestRecord[]): PasabuyRequestRecord[] {
  const now = Date.now();
  let changed = false;
  const next = records.map((record) => {
    if (record.status === "OPEN" && record.expiresAt && new Date(record.expiresAt).getTime() <= now) {
      changed = true;
      return {
        ...record,
        status: "EXPIRED" as const,
        history: appendHistory(record, "EXPIRED", "No deliverer accepted in time — no Pasabuy fee was charged"),
      };
    }
    if (
      record.status === "AWAITING_PAYMENT" &&
      record.paymentDeadline &&
      new Date(record.paymentDeadline).getTime() <= now
    ) {
      changed = true;
      return {
        ...record,
        status: "CANCELLED" as const,
        paymentStatus: "PAYMENT_EXPIRED" as const,
        cancelledAt: new Date().toISOString(),
        history: appendHistory(record, "PAYMENT_EXPIRED", "Payment window expired — deliverer assignment ended, no fee was charged"),
      };
    }
    return record;
  });
  if (changed) writeAll(next);
  return next;
}

function getAllSwept(): PasabuyRequestRecord[] {
  return sweepExpirations(readAll());
}

function updateRecord(id: string, updater: (record: PasabuyRequestRecord) => PasabuyRequestRecord): PasabuyRequestRecord {
  const records = getAllSwept();
  let updated: PasabuyRequestRecord | null = null;
  const next = records.map((record) => {
    if (record.id !== id) return record;
    updated = updater(record);
    return updated;
  });
  if (!updated) throw new Error("Pasabuy request not found");
  writeAll(next);
  return updated;
}

export function subscribeToPasabuyChanges(callback: () => void): () => void {
  window.addEventListener(PASABUY_CHANGED_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(PASABUY_CHANGED_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function listOpenRequests(): PasabuyRequestRecord[] {
  const user = getCurrentUser();
  return getAllSwept()
    .filter((r) => r.status === "OPEN")
    .filter((r) => !user || r.requesterUserId !== user.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function getRequest(id: string): PasabuyRequestRecord | null {
  return getAllSwept().find((r) => r.id === id) || null;
}

/** Requests where the current user is either the requester or the assigned deliverer. */
export function listMyRequests(): PasabuyRequestRecord[] {
  const user = getCurrentUser();
  if (!user) return [];
  return getAllSwept()
    .filter((r) => r.requesterUserId === user.id || r.delivererUserId === user.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

const INACTIVE_STATUSES = new Set<PasabuyStatus>(["CANCELLED", "EXPIRED", "COMPLETED"]);

export function getActiveRequestForOrder(orderId: string): PasabuyRequestRecord | null {
  return getAllSwept().find((r) => r.order.orderId === orderId && !INACTIVE_STATUSES.has(r.status)) || null;
}

/**
 * Mock distance check for the 270m outside-campus rule. Deterministic per address
 * string so a demo can reliably show both the accepted and rejected path. Replace
 * with a real geolocation/distance API once one exists.
 */
export function estimateMockDistanceMeters(address: string): number {
  const trimmed = address.trim();
  if (!trimmed) return 0;
  let hash = 0;
  for (let i = 0; i < trimmed.length; i += 1) {
    hash = (hash * 31 + trimmed.charCodeAt(i)) % 1000;
  }
  return hash % 400;
}

export interface CreatePasabuyRequestInput {
  order: PasabuyOrderInfo;
  deliveryType: PasabuyDeliveryType;
  deliveryLocation: string;
}

/** Creates an OPEN request. Never charges anything — the food order is already paid, the Pasabuy fee isn't charged until a deliverer accepts. */
export function createRequest(input: CreatePasabuyRequestInput): PasabuyRequestRecord {
  const user = getCurrentUser();
  if (!user) throw new Error("You must be signed in to request Pasabuy");

  const now = new Date();
  const reference = input.order.reference || generateReference();
  const record: PasabuyRequestRecord = {
    id: crypto.randomUUID(),
    reference,
    status: "OPEN",
    paymentStatus: "NOT_CHARGED",
    order: input.order,
    deliveryType: input.deliveryType,
    deliveryLocation: input.deliveryLocation,
    fee: PASABUY_FEE[input.deliveryType],
    requesterUserId: user.id,
    requesterName: user.fullName,
    delivererUserId: null,
    delivererName: null,
    pickupCode: generatePickupCode(),
    termsAcceptedAt: now.toISOString(),
    disputeReason: null,
    history: [{ status: "OPEN", note: "Pasabuy request created — no fee charged yet", at: now.toISOString() }],
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + OPEN_REQUEST_TTL_MS).toISOString(),
    acceptedAt: null,
    paymentDeadline: null,
    paidAt: null,
    pickupReadyAt: null,
    pickedUpAt: null,
    deliveredAt: null,
    completedAt: null,
    cancelledAt: null,
  };

  writeAll([record, ...getAllSwept()]);
  return record;
}

/** Deliverer accepts: OPEN → ACCEPTED → AWAITING_PAYMENT (recorded as two history entries; the persisted status lands on AWAITING_PAYMENT, which starts the payment window). */
export function acceptRequest(id: string): PasabuyRequestRecord {
  const user = getCurrentUser();
  if (!user) throw new Error("You must be signed in to accept a Pasabuy request");

  return updateRecord(id, (record) => {
    if (record.status !== "OPEN") throw new Error("This Pasabuy request is no longer available");
    if (record.requesterUserId === user.id) throw new Error("You cannot accept your own Pasabuy request");
    const now = new Date();
    const withAccepted = appendHistory(
      { ...record, status: "ACCEPTED" },
      "ACCEPTED",
      "Pasabuy request accepted",
    );
    return {
      ...record,
      status: "AWAITING_PAYMENT",
      paymentStatus: "AWAITING_PAYMENT",
      delivererUserId: user.id,
      delivererName: user.fullName,
      acceptedAt: now.toISOString(),
      paymentDeadline: new Date(now.getTime() + PAYMENT_WINDOW_MS).toISOString(),
      history: [
        ...withAccepted,
        { status: "AWAITING_PAYMENT", note: "Requester must pay the Pasabuy fee to confirm", at: now.toISOString() },
      ],
    };
  });
}

/**
 * Simulates the Pasabuy-fee-only checkout. There's no real endpoint for this —
 * `createPaymentCheckout` in `@/features/auth/api` only charges an existing
 * `PaymentShare`, not an arbitrary Pasabuy fee (see AddressMe.md). Swap the body
 * of this function for a real call once one exists; callers only see success/failure.
 */
export function payPasabuyFee(id: string): PasabuyRequestRecord {
  return updateRecord(id, (record) => {
    if (record.status !== "AWAITING_PAYMENT") throw new Error("No Pasabuy payment is due right now");
    return {
      ...record,
      status: "PAID",
      paymentStatus: "PAID",
      paidAt: new Date().toISOString(),
      paymentDeadline: null,
      history: appendHistory(record, "PAID", "Pasabuy fee paid"),
    };
  });
}

export function markPasabuyPaymentFailed(id: string): PasabuyRequestRecord {
  return updateRecord(id, (record) => {
    if (record.status !== "AWAITING_PAYMENT") throw new Error("No Pasabuy payment is due right now");
    return {
      ...record,
      paymentStatus: "PAYMENT_FAILED",
      history: appendHistory(record, "AWAITING_PAYMENT", "Pasabuy payment attempt failed — the deliverer has not been confirmed"),
    };
  });
}

/** Simulates the vendor marking the order ready for the deliverer to grab. No real actor owns this in the frontend-only build. */
export function markPickupReady(id: string): PasabuyRequestRecord {
  return updateRecord(id, (record) => {
    if (record.status !== "PAID") throw new Error("Pasabuy fee hasn't been paid yet");
    return {
      ...record,
      status: "PICKUP_READY",
      pickupReadyAt: new Date().toISOString(),
      history: appendHistory(record, "PICKUP_READY", "Order ready for pickup"),
    };
  });
}

export function markPickedUp(id: string): PasabuyRequestRecord {
  return updateRecord(id, (record) => {
    if (record.status !== "PICKUP_READY") throw new Error("Order isn't ready for pickup yet");
    return {
      ...record,
      status: "PICKED_UP",
      pickedUpAt: new Date().toISOString(),
      history: appendHistory(record, "PICKED_UP", "Deliverer picked up the order"),
    };
  });
}

export function markDelivered(id: string): PasabuyRequestRecord {
  return updateRecord(id, (record) => {
    if (record.status !== "PICKED_UP") throw new Error("Order hasn't been picked up yet");
    return {
      ...record,
      status: "DELIVERED",
      deliveredAt: new Date().toISOString(),
      history: appendHistory(record, "DELIVERED", "Deliverer marked the order as delivered"),
    };
  });
}

export function confirmReceipt(id: string): PasabuyRequestRecord {
  return updateRecord(id, (record) => {
    if (record.status !== "DELIVERED") throw new Error("Nothing to confirm yet");
    return {
      ...record,
      status: "COMPLETED",
      completedAt: new Date().toISOString(),
      history: appendHistory(record, "COMPLETED", "Requester confirmed receipt"),
    };
  });
}

const REQUESTER_CANCELLABLE = new Set<PasabuyStatus>(["OPEN", "ACCEPTED", "AWAITING_PAYMENT", "PAID"]);

export function cancelByRequester(id: string): PasabuyRequestRecord {
  return updateRecord(id, (record) => {
    if (!REQUESTER_CANCELLABLE.has(record.status)) {
      throw new Error("This Pasabuy request can no longer be cancelled");
    }
    const note =
      record.paymentStatus === "PAID"
        ? "Cancelled by requester — Pasabuy fee was already paid; follow the existing refund policy"
        : "Cancelled by requester — no Pasabuy fee was charged";
    return {
      ...record,
      status: "CANCELLED",
      cancelledAt: new Date().toISOString(),
      history: appendHistory(record, "CANCELLED", note),
    };
  });
}

/** Deliverer backs out before payment is collected — releases the request back to the open pool instead of killing it. */
export function cancelByDeliverer(id: string): PasabuyRequestRecord {
  return updateRecord(id, (record) => {
    if (!["ACCEPTED", "AWAITING_PAYMENT"].includes(record.status)) {
      throw new Error("This delivery can no longer be cancelled");
    }
    return {
      ...record,
      status: "OPEN",
      paymentStatus: "NOT_CHARGED",
      delivererUserId: null,
      delivererName: null,
      acceptedAt: null,
      paymentDeadline: null,
      expiresAt: new Date(Date.now() + OPEN_REQUEST_TTL_MS).toISOString(),
      history: appendHistory(record, "OPEN", "Deliverer cancelled — request reopened, no fee was charged"),
    };
  });
}

const DISPUTABLE = new Set<PasabuyStatus>(["AWAITING_PAYMENT", "PAID", "PICKUP_READY", "PICKED_UP", "DELIVERED"]);

export function reportProblem(id: string, reason: string): PasabuyRequestRecord {
  return updateRecord(id, (record) => {
    if (!DISPUTABLE.has(record.status)) {
      throw new Error("This request can no longer be reported");
    }
    return {
      ...record,
      status: "DISPUTED",
      disputeReason: reason,
      history: appendHistory(record, "DISPUTED", `Problem reported: ${reason}`),
    };
  });
}

export function getCurrentUserId(): string | null {
  return getCurrentUser()?.id ?? null;
}

const TERMINAL_STATUSES = new Set<PasabuyStatus>(["COMPLETED", "CANCELLED", "EXPIRED", "PAYMENT_EXPIRED", "DISPUTED"]);

/**
 * Force-advances a request to its next status, bypassing the "must be the
 * assigned deliverer/requester" checks the real actions enforce (and, for
 * AWAITING_PAYMENT, the missing Pasabuy-fee payment endpoint). This exists so a
 * single logged-in tester can walk the whole lifecycle without a second
 * account, a real vendor, or the missing backend endpoints. See
 * `pasabuy-dev-controls.tsx`, the one component that calls this.
 */
export function devAdvance(id: string): PasabuyRequestRecord {
  return updateRecord(id, (record) => {
    if (TERMINAL_STATUSES.has(record.status)) {
      throw new Error("This request has no further steps");
    }
    const now = new Date().toISOString();
    switch (record.status) {
      case "OPEN": {
        const demoDelivererId = record.requesterUserId === "demo-deliverer" ? "demo-deliverer-2" : "demo-deliverer";
        return {
          ...record,
          status: "AWAITING_PAYMENT",
          paymentStatus: "AWAITING_PAYMENT",
          delivererUserId: demoDelivererId,
          delivererName: "Demo Deliverer",
          acceptedAt: now,
          paymentDeadline: new Date(Date.now() + PAYMENT_WINDOW_MS).toISOString(),
          history: [
            ...appendHistory({ ...record, status: "ACCEPTED" }, "ACCEPTED", "Pasabuy request accepted (dev skip)"),
            { status: "AWAITING_PAYMENT", note: "Requester must pay the Pasabuy fee (dev skip)", at: now },
          ],
        };
      }
      case "AWAITING_PAYMENT":
        return {
          ...record,
          status: "PAID",
          paymentStatus: "PAID",
          paidAt: now,
          paymentDeadline: null,
          history: appendHistory(record, "PAID", "Pasabuy fee paid (dev skip)"),
        };
      case "PAID":
        return {
          ...record,
          status: "PICKUP_READY",
          pickupReadyAt: now,
          history: appendHistory(record, "PICKUP_READY", "Order ready for pickup (dev skip)"),
        };
      case "PICKUP_READY":
        return {
          ...record,
          status: "PICKED_UP",
          pickedUpAt: now,
          history: appendHistory(record, "PICKED_UP", "Deliverer picked up the order (dev skip)"),
        };
      case "PICKED_UP":
        return {
          ...record,
          status: "DELIVERED",
          deliveredAt: now,
          history: appendHistory(record, "DELIVERED", "Deliverer marked the order delivered (dev skip)"),
        };
      case "DELIVERED":
        return {
          ...record,
          status: "COMPLETED",
          completedAt: now,
          history: appendHistory(record, "COMPLETED", "Requester confirmed receipt (dev skip)"),
        };
      default:
        throw new Error("This request has no further steps");
    }
  });
}
