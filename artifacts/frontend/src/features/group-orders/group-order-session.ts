export const GROUP_ORDER_SESSION_CHANGED_EVENT = "queueless-group-order-session-changed";
const GROUP_ORDER_SESSION_STORAGE_KEY_PREFIX = "queueless-group-order-session";

export interface GroupOrderSession {
  groupOrderId: string;
  code: string;
  isOwner: boolean;
  vendorId: string | null;
  vendorName: string | null;
}

function getSessionStorageKey(): string | null {
  const storedUser = localStorage.getItem("user");
  if (!storedUser) return null;

  try {
    const user = JSON.parse(storedUser) as { id?: string; email?: string };
    const userKey = user.id || user.email;
    return userKey ? `${GROUP_ORDER_SESSION_STORAGE_KEY_PREFIX}:${userKey}` : null;
  } catch {
    return null;
  }
}

export function getGroupOrderSession(): GroupOrderSession | null {
  const storageKey = getSessionStorageKey();
  if (!storageKey) return null;

  try {
    const stored = localStorage.getItem(storageKey);
    return stored ? (JSON.parse(stored) as GroupOrderSession) : null;
  } catch {
    return null;
  }
}

export function setGroupOrderSession(session: GroupOrderSession): void {
  const storageKey = getSessionStorageKey();
  if (!storageKey) return;

  localStorage.setItem(storageKey, JSON.stringify(session));
  window.dispatchEvent(new Event(GROUP_ORDER_SESSION_CHANGED_EVENT));
}

export function clearGroupOrderSession(): void {
  const storageKey = getSessionStorageKey();
  if (!storageKey) return;

  localStorage.removeItem(storageKey);
  window.dispatchEvent(new Event(GROUP_ORDER_SESSION_CHANGED_EVENT));
}
