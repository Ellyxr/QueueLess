export const ORDER_TRACKING_CHANGED_EVENT = "queueless-order-tracking-changed";
const ORDER_TRACKING_STORAGE_KEY_PREFIX = "queueless-active-order";
const MOCK_COUNTDOWN_SECONDS = 15 * 60;

export interface MockOrderTracking {
  startedAt: number;
  durationSeconds: number;
  waitingTime: number | null;
}

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

export function startMockOrderTracking(waitingTime: number | null): void {
  const tracking: MockOrderTracking = {
    startedAt: Date.now(),
    durationSeconds: MOCK_COUNTDOWN_SECONDS,
    waitingTime,
  };
  const storageKey = getOrderTrackingStorageKey();
  if (!storageKey) return;

  localStorage.setItem(storageKey, JSON.stringify(tracking));
  window.dispatchEvent(new Event(ORDER_TRACKING_CHANGED_EVENT));
}

export function getMockOrderTracking(): MockOrderTracking | null {
  try {
    const storageKey = getOrderTrackingStorageKey();
    if (!storageKey) return null;

    const stored = localStorage.getItem(storageKey);
    return stored ? (JSON.parse(stored) as MockOrderTracking) : null;
  } catch {
    return null;
  }
}
