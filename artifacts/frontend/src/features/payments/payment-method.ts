export const PAYMENT_METHOD_CHANGED_EVENT = "queueless-payment-method-changed";
const PAYMENT_METHOD_STORAGE_KEY_PREFIX = "queueless-payment-method";

export type SavedPaymentMethodType = "card" | "gcash" | "grab_pay";

export interface SavedPaymentMethod {
  type: SavedPaymentMethodType;
  label: string;
  last4?: string;
  expiry?: string;
  accountHandle?: string;
  createdAt: string;
}

function getPaymentMethodStorageKey(): string | null {
  const storedUser = localStorage.getItem("user");
  if (!storedUser) return null;

  try {
    const user = JSON.parse(storedUser) as { id?: string; email?: string };
    const userKey = user.id || user.email;
    return userKey ? `${PAYMENT_METHOD_STORAGE_KEY_PREFIX}:${userKey}` : null;
  } catch {
    return null;
  }
}

export function getSavedPaymentMethod(): SavedPaymentMethod | null {
  const storageKey = getPaymentMethodStorageKey();
  if (!storageKey) return null;

  try {
    const stored = localStorage.getItem(storageKey);
    return stored ? (JSON.parse(stored) as SavedPaymentMethod) : null;
  } catch {
    return null;
  }
}

export function hasSavedPaymentMethod(): boolean {
  return getSavedPaymentMethod() !== null;
}

export function savePaymentMethod(method: Omit<SavedPaymentMethod, "createdAt">): void {
  const storageKey = getPaymentMethodStorageKey();
  if (!storageKey) return;

  const record: SavedPaymentMethod = { ...method, createdAt: new Date().toISOString() };
  localStorage.setItem(storageKey, JSON.stringify(record));
  window.dispatchEvent(new Event(PAYMENT_METHOD_CHANGED_EVENT));
}

export function removeSavedPaymentMethod(): void {
  const storageKey = getPaymentMethodStorageKey();
  if (!storageKey) return;

  localStorage.removeItem(storageKey);
  window.dispatchEvent(new Event(PAYMENT_METHOD_CHANGED_EVENT));
}
