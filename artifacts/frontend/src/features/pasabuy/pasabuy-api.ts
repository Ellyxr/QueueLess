/**
 * Real API-backed data layer for the Pasabuy feature (replaces the former
 * `pasabuy-mock-store.ts`). All state now lives server-side in
 * `artifacts/api-server/src/pasabuy/*` — nothing here touches localStorage
 * for request state (the student-ID-photo preview convenience in
 * `pasabuy-eligibility.ts` is the one deliberate exception, and it never
 * claims to be a re-fetchable server field).
 *
 * There is no websocket/socket.io client anywhere else in this frontend
 * (confirmed by search), so "live updates" here use polling, matching the
 * existing pattern in `components/order-status-widget.tsx`.
 */

import { fetchWithAuth } from "@/features/auth/api";

export type PasabuyStatus =
  | "PENDING"
  | "ACCEPTED"
  | "AWAITING_PAYMENT"
  | "PAID"
  | "PICKUP_READY"
  | "PICKED_UP"
  | "IN_PROGRESS"
  | "DELIVERED"
  | "COMPLETED"
  | "CANCELLED"
  | "EXPIRED"
  | "PAYMENT_EXPIRED"
  | "DISPUTED";

export type PasabuyPaymentStatus =
  | "NOT_CHARGED"
  | "AWAITING_PAYMENT"
  | "PAID"
  | "PAYMENT_FAILED"
  | "PAYMENT_EXPIRED"
  | "REFUNDED";

export type PasabuyFeeTier = "IN_CAMPUS" | "OUTSIDE_CAMPUS";

export const OUTSIDE_CAMPUS_RADIUS_METERS = 270;

/** Polling interval for the request detail/list views. Mirrors order-status-widget.tsx's POLL_INTERVAL_MS. */
export const PASABUY_POLL_INTERVAL_MS = 6000;

export interface PasabuyOrderInfo {
  orderId: string;
  reference: string;
  items: string;
  vendorName: string;
  pickupLocation: string;
}

/* ---------------------------------------------------------------------- */
/* Profile / eligibility                                                   */
/* ---------------------------------------------------------------------- */

export interface PasabuyProfile {
  id: string;
  studentId: string;
  studentIdVerified: boolean;
  photoSubmitted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PasabuyProfileResponse {
  isComplete: boolean;
  studentIdVerified: boolean;
  profile: PasabuyProfile | null;
}

export function getPasabuyProfile(): Promise<PasabuyProfileResponse> {
  return fetchWithAuth("/pasabuy/profile");
}

export function upsertPasabuyProfile(studentId: string): Promise<PasabuyProfileResponse> {
  return fetchWithAuth("/pasabuy/profile", {
    method: "PUT",
    body: JSON.stringify({ studentId }),
  });
}

export interface UploadStudentIdPhotoResult {
  submitted: boolean;
  studentIdVerified: boolean;
}

export function uploadStudentIdPhoto(file: File): Promise<UploadStudentIdPhotoResult> {
  const form = new FormData();
  form.append("photo", file);
  return fetchWithAuth("/pasabuy/profile/student-id-photo", {
    method: "POST",
    body: form,
  });
}

/* ---------------------------------------------------------------------- */
/* Browse / list                                                           */
/* ---------------------------------------------------------------------- */

export interface PasabuyAvailableRequest {
  id: string;
  status: PasabuyStatus;
  itemDescription: string;
  pickupLocation: string;
  convenienceFee: string;
  feeTier: PasabuyFeeTier | null;
  deliveryDistanceMeters: number | null;
  expiresAt: string;
  createdAt: string;
  relatedOrder: {
    estimatedReadyAt: string | null;
    vendor: { id: string; businessName: string | null };
    items: Array<{ quantity: number; product: { id: string; name: string } }>;
  };
}

export function listOpenRequests(): Promise<PasabuyAvailableRequest[]> {
  return fetchWithAuth("/pasabuy/requests");
}

/* ---------------------------------------------------------------------- */
/* Request detail                                                          */
/* ---------------------------------------------------------------------- */

export interface PasabuyStatusEvent {
  status: PasabuyStatus;
  note: string | null;
  changedAt: string;
}

export interface PasabuyRequestDetail {
  id: string;
  requesterUserId: string;
  fulfillerUserId: string | null;
  status: PasabuyStatus;
  paymentStatus: PasabuyPaymentStatus;
  paymentDeadline: string | null;
  feeTier: PasabuyFeeTier | null;
  convenienceFee: string;
  deliveryDistanceMeters: number | null;
  pickupLocation: string;
  dropoffLocation: string;
  itemDescription: string;
  expiresAt: string;
  acceptedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
  payment: { id: string; status: string; amount: string } | null;
  /** Only non-null for the fulfiller once paymentStatus === 'PAID'. */
  pickupCode: string | null;
  statusHistory: PasabuyStatusEvent[];
}

export function getRequest(id: string): Promise<PasabuyRequestDetail> {
  return fetchWithAuth(`/pasabuy/requests/${id}`);
}

/* ---------------------------------------------------------------------- */
/* Create                                                                   */
/* ---------------------------------------------------------------------- */

export interface CreatePasabuyRequestInput {
  orderId: string;
  dropoffLocation: string;
  dropoffLatitude: number;
  dropoffLongitude: number;
  termsAccepted: boolean;
}

/** Raw Prisma `pasabuyRequest.create()` result — includes fee/tier fields the UI shows after creation. */
export interface CreatedPasabuyRequest {
  id: string;
  status: PasabuyStatus;
  paymentStatus: PasabuyPaymentStatus;
  requesterUserId: string;
  relatedOrderId: string;
  pickupLocation: string;
  dropoffLocation: string;
  dropoffLatitude: number;
  dropoffLongitude: number;
  feeTier: PasabuyFeeTier;
  deliveryDistanceMeters: number;
  convenienceFee: string;
  totalAmount: string;
  itemDescription: string;
  termsAcceptedAt: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export function createRequest(input: CreatePasabuyRequestInput): Promise<CreatedPasabuyRequest> {
  return fetchWithAuth("/pasabuy/requests", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/**
 * Wraps the browser Geolocation API in a promise with friendlier errors. Used
 * by the create-request dialog — the backend needs real dropoff coordinates
 * to compute the fee tier and enforce the 270m vendor-proximity rule.
 */
export function getCurrentPosition(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Your browser doesn't support location access."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(new Error("Location access was denied. Enable location permissions to request Pasabuy."));
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          reject(new Error("Your location could not be determined. Try again outdoors or with GPS on."));
        } else if (error.code === error.TIMEOUT) {
          reject(new Error("Getting your location timed out. Please try again."));
        } else {
          reject(new Error("Could not get your current location."));
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

/* ---------------------------------------------------------------------- */
/* Actions                                                                  */
/* ---------------------------------------------------------------------- */

export interface AcceptedPasabuyRequest {
  id: string;
  status: PasabuyStatus;
  requesterUserId: string;
  fulfillerUserId: string | null;
  itemDescription: string;
  convenienceFee: string;
  paymentStatus: PasabuyPaymentStatus;
  paymentDeadline: string | null;
  totalAmount: string;
  acceptedAt: string | null;
  createdAt: string;
}

export function acceptRequest(id: string): Promise<AcceptedPasabuyRequest> {
  return fetchWithAuth(`/pasabuy/requests/${id}/accept`, { method: "POST" });
}

export interface PasabuyCheckoutResponse {
  paymentId: string;
  pasabuyRequestId: string;
  amount: string;
  currency: string;
  status: string;
  checkoutSessionId: string | null;
  checkoutUrl: string | null;
  idempotentReplay: boolean;
}

/** Creates/reuses the fee-only PayMongo checkout session. The actual PAID transition happens asynchronously via webhook — callers should redirect to `checkoutUrl` and then poll `getRequest`. */
export function createFeeCheckout(id: string): Promise<PasabuyCheckoutResponse> {
  return fetchWithAuth(`/pasabuy/requests/${id}/checkout`, { method: "POST" });
}

export function markPickedUp(id: string): Promise<unknown> {
  return fetchWithAuth(`/pasabuy/requests/${id}/pickup`, { method: "POST" });
}

export function markDelivered(id: string): Promise<unknown> {
  return fetchWithAuth(`/pasabuy/requests/${id}/deliver`, { method: "POST" });
}

export function confirmReceipt(id: string): Promise<unknown> {
  return fetchWithAuth(`/pasabuy/requests/${id}/complete`, { method: "POST" });
}

/** Callable by requester or fulfiller. Always ends the request as CANCELLED — there is no "reopen to pool" behavior on the real backend. */
export function cancelRequest(id: string, reason: string): Promise<unknown> {
  return fetchWithAuth(`/pasabuy/requests/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function reportProblem(id: string, description: string): Promise<unknown> {
  return fetchWithAuth(`/pasabuy/requests/${id}/report`, {
    method: "POST",
    body: JSON.stringify({ description }),
  });
}

/* ---------------------------------------------------------------------- */
/* Vendor-facing                                                            */
/* ---------------------------------------------------------------------- */

export interface PasabuyVendorOrderInfo {
  orderId: string;
  orderStatus: string;
  isPreorder: boolean;
  pickupLocation: string | null;
  pasabuy: {
    id: string;
    status: PasabuyStatus;
    paymentStatus: PasabuyPaymentStatus;
    pickupCode: string | null;
    pickupVerifiedAt: string | null;
    deliverer: { id: string; fullName: string; studentIdVerified: boolean } | null;
  } | null;
}

export function getVendorOrderPasabuy(orderId: string): Promise<PasabuyVendorOrderInfo> {
  return fetchWithAuth(`/pasabuy/vendor/orders/${orderId}`);
}

export function verifyVendorPickupCode(orderId: string, code: string): Promise<unknown> {
  return fetchWithAuth(`/pasabuy/vendor/orders/${orderId}/verify-pickup`, {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

/* ---------------------------------------------------------------------- */
/* Current user helper (still reads localStorage — same source `fetchWithAuth`'s auth uses) */
/* ---------------------------------------------------------------------- */

export function getCurrentUserId(): string | null {
  const stored = localStorage.getItem("user");
  if (!stored) return null;
  try {
    return (JSON.parse(stored) as { id?: string }).id ?? null;
  } catch {
    return null;
  }
}
