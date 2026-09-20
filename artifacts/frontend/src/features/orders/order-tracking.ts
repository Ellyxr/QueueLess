export const ORDER_TRACKING_CHANGED_EVENT = "queueless-order-tracking-changed";
const ORDER_TRACKING_STORAGE_KEY_PREFIX = "queueless-active-order";
export const MAX_TRACKED_ORDERS = 4;

function getOrderTrackingStorageKey(): string | null {
  const storedUser = localStorage.getItem("user");
  if (!storedUser) return null;

  try {
    const user = JSON.parse(storedUser) as { id?: string; email?: string };
    const userKey = user.id || user.email;
    return userKey ? `${ORDER_TRACKING_STORAGE_KEY_PREFIX}:${userKey}` : null;
  } catch {
    return null;
  }
}

function readTrackedOrderIds(storageKey: string): string[] {
  const stored = localStorage.getItem(storageKey);
  if (!stored) return [];

  try {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) return parsed.filter((id): id is string => typeof id === "string");
    // Legacy format: a single order id stored as a plain string.
    return typeof parsed === "string" ? [parsed] : [];
  } catch {
    // Legacy format: localStorage.setItem stored the raw order id, not JSON.
    return [stored];
  }
}

function writeTrackedOrderIds(storageKey: string, ids: string[]): void {
  localStorage.setItem(storageKey, JSON.stringify(ids));
  window.dispatchEvent(new Event(ORDER_TRACKING_CHANGED_EVENT));
}

export function getTrackedOrderIds(): string[] {
  const storageKey = getOrderTrackingStorageKey();
  if (!storageKey) return [];
  return readTrackedOrderIds(storageKey);
}

export function canTrackNewOrder(): boolean {
  return getTrackedOrderIds().length < MAX_TRACKED_ORDERS;
}

/** Starts tracking an order. Returns false (without storing it) if the buyer already has MAX_TRACKED_ORDERS being tracked. */
export function startOrderTracking(orderId: string): boolean {
  const storageKey = getOrderTrackingStorageKey();
  if (!storageKey) return false;

  const current = readTrackedOrderIds(storageKey);
  if (current.includes(orderId)) return true;
  if (current.length >= MAX_TRACKED_ORDERS) return false;

  writeTrackedOrderIds(storageKey, [...current, orderId]);
  return true;
}

export function stopTrackingOrder(orderId: string): void {
  const storageKey = getOrderTrackingStorageKey();
  if (!storageKey) return;

  const current = readTrackedOrderIds(storageKey);
  writeTrackedOrderIds(storageKey, current.filter((id) => id !== orderId));
}

export function clearOrderTracking(): void {
  const storageKey = getOrderTrackingStorageKey();
  if (!storageKey) return;

  localStorage.removeItem(storageKey);
  window.dispatchEvent(new Event(ORDER_TRACKING_CHANGED_EVENT));
}
