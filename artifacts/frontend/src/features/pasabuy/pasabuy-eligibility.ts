/**
 * Deliverer eligibility = a verified Pasabuy profile (student ID number +
 * admin-reviewed photo, both stored server-side, see `pasabuy-api.ts`) plus
 * having accepted the Pasabuy Terms & Conditions.
 *
 * The backend has no endpoint for terms acceptance (it's only recorded
 * per-request via `termsAccepted` on create — there's no standalone
 * "deliverer terms" timestamp on `PasabuyProfile`), so that half stays a
 * lightweight local flag, same as before. The student ID verification half
 * now reflects whatever `GET /pasabuy/profile` returns — there is no
 * auto-verify shortcut anymore; verification happens by admin review after
 * a photo is uploaded.
 */

import type { PasabuyProfileResponse } from "./pasabuy-api";

function getCurrentUserId(): string | null {
  const stored = localStorage.getItem("user");
  if (!stored) return null;
  try {
    return (JSON.parse(stored) as { id?: string }).id ?? null;
  } catch {
    return null;
  }
}

function termsStorageKey(userId: string): string {
  return `queueless-pasabuy-terms-accepted:${userId}`;
}

export function getTermsAccepted(): boolean {
  const userId = getCurrentUserId();
  if (!userId) return false;
  return localStorage.getItem(termsStorageKey(userId)) === "true";
}

export function acceptPasabuyTerms(): void {
  const userId = getCurrentUserId();
  if (!userId) return;
  localStorage.setItem(termsStorageKey(userId), "true");
}

export function isEligibleToDeliver(
  profile: PasabuyProfileResponse | null,
  termsAccepted: boolean,
): boolean {
  return Boolean(profile?.studentIdVerified) && termsAccepted;
}
