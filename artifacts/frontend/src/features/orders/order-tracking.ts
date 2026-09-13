export const ORDER_TRACKING_CHANGED_EVENT = "queueless-order-tracking-changed";
const ORDER_TRACKING_STORAGE_KEY_PREFIX = "queueless-active-order";

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

export function startOrderTracking(orderId: string): void {
  const storageKey = getOrderTrackingStorageKey();
  if (!storageKey) return;

  localStorage.setItem(storageKey, orderId);
  window.dispatchEvent(new Event(ORDER_TRACKING_CHANGED_EVENT));
}

export function getTrackedOrderId(): string | null {
  const storageKey = getOrderTrackingStorageKey();
  if (!storageKey) return null;

  return localStorage.getItem(storageKey);
}

export function clearOrderTracking(): void {
  const storageKey = getOrderTrackingStorageKey();
  if (!storageKey) return;

  localStorage.removeItem(storageKey);
  window.dispatchEvent(new Event(ORDER_TRACKING_CHANGED_EVENT));
}
