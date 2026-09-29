/**
 * Client-side bookkeeping for "which Pasabuy requests am I involved in" —
 * NOT a source of truth. The real backend has no `GET /pasabuy/requests/mine`
 * endpoint (only `/pasabuy/requests` for browsing others' open requests and
 * `/pasabuy/requests/:id` for a single request you're a participant in), so
 * there's no server-side way to list every Pasabuy request a student created
 * or accepted. This mirrors `features/orders/order-tracking.ts`'s pattern:
 * remember IDs locally so the UI knows what to poll, then always refetch the
 * authoritative state from `GET /pasabuy/requests/:id`.
 *
 * Caveat (left as-is, a product decision): if a student clears local storage
 * or opens the app on a different device, a Pasabuy request they created or
 * accepted there won't show up in "Your Pasabuy" here — there is no way to
 * recover it without a "mine" endpoint on the backend.
 */

export const PASABUY_TRACKING_CHANGED_EVENT = "queueless-pasabuy-tracking-changed";
const TRACKING_KEY_PREFIX = "queueless-pasabuy-tracking";
const ORDER_MAP_KEY_PREFIX = "queueless-pasabuy-order-map";
const MAX_TRACKED = 20;

function getUserKey(): string | null {
  const stored = localStorage.getItem("user");
  if (!stored) return null;
  try {
    const user = JSON.parse(stored) as { id?: string; email?: string };
    return user.id || user.email || null;
  } catch {
    return null;
  }
}

function trackingKey(): string | null {
  const userKey = getUserKey();
  return userKey ? `${TRACKING_KEY_PREFIX}:${userKey}` : null;
}

function orderMapKey(): string | null {
  const userKey = getUserKey();
  return userKey ? `${ORDER_MAP_KEY_PREFIX}:${userKey}` : null;
}

function readIds(key: string): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function writeIds(key: string, ids: string[]): void {
  localStorage.setItem(key, JSON.stringify(ids));
  window.dispatchEvent(new Event(PASABUY_TRACKING_CHANGED_EVENT));
}

export function getTrackedPasabuyRequestIds(): string[] {
  const key = trackingKey();
  if (!key) return [];
  return readIds(key);
}

/** Call when the current user creates or accepts a Pasabuy request. */
export function trackPasabuyRequest(requestId: string, orderId?: string): void {
  const key = trackingKey();
  if (key) {
    const current = readIds(key);
    if (!current.includes(requestId)) {
      writeIds(key, [requestId, ...current].slice(0, MAX_TRACKED));
    }
  }
  if (orderId) {
    const mapKey = orderMapKey();
    if (mapKey) {
      let map: Record<string, string> = {};
      try {
        map = JSON.parse(localStorage.getItem(mapKey) || "{}");
      } catch {
        map = {};
      }
      map[orderId] = requestId;
      localStorage.setItem(mapKey, JSON.stringify(map));
    }
  }
}

/** Best-effort lookup of the Pasabuy request created for a given order — only works if it was created on this device/browser. */
export function getTrackedRequestIdForOrder(orderId: string): string | null {
  const mapKey = orderMapKey();
  if (!mapKey) return null;
  try {
    const map = JSON.parse(localStorage.getItem(mapKey) || "{}") as Record<string, string>;
    return map[orderId] ?? null;
  } catch {
    return null;
  }
}

export function subscribeToPasabuyTrackingChanges(callback: () => void): () => void {
  window.addEventListener(PASABUY_TRACKING_CHANGED_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(PASABUY_TRACKING_CHANGED_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}
