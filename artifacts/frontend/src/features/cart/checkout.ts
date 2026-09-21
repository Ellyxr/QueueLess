import {
  createOrder,
  createPaymentCheckout,
  fetchWithAuth,
  getOrderPaymentStatus,
} from "@/features/auth/api";
import { startOrderTracking } from "@/features/orders/order-tracking";

const CHECKOUT_QUEUE_STORAGE_KEY_PREFIX = "queueless-checkout-queue";

export interface CheckoutQueueState {
  /** Vendor ids still waiting to be ordered & paid for, in order. */
  vendorIds: string[];
  isPasabuyRequest: boolean;
}

function getCheckoutQueueStorageKey(): string | null {
  const storedUser = localStorage.getItem("user");
  if (!storedUser) return null;

  try {
    const user = JSON.parse(storedUser) as { id?: string; email?: string };
    const userKey = user.id || user.email;
    return userKey ? `${CHECKOUT_QUEUE_STORAGE_KEY_PREFIX}:${userKey}` : null;
  } catch {
    return null;
  }
}

export function getCheckoutQueue(): CheckoutQueueState | null {
  const storageKey = getCheckoutQueueStorageKey();
  if (!storageKey) return null;

  try {
    const stored = localStorage.getItem(storageKey);
    return stored ? (JSON.parse(stored) as CheckoutQueueState) : null;
  } catch {
    return null;
  }
}

export function setCheckoutQueue(state: CheckoutQueueState | null): void {
  const storageKey = getCheckoutQueueStorageKey();
  if (!storageKey) return;

  if (!state || state.vendorIds.length === 0) {
    localStorage.removeItem(storageKey);
  } else {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }
}

/**
 * Creates an order for one vendor's items (products must all belong to the
 * same vendor — the backend keeps one cart per vendor per buyer) and starts
 * a PayMongo checkout session for it.
 */
export async function createOrderForVendorItems(
  items: Array<{ productId: string; quantity: number }>,
  isPasabuyRequest: boolean,
): Promise<{ orderId: string; checkoutUrl: string }> {
  let activeCartId = "";
  for (const item of items) {
    const cartResponse: any = await fetchWithAuth("/carts/items", {
      method: "POST",
      body: JSON.stringify({
        productId: item.productId,
        quantity: item.quantity,
      }),
    });

    if (cartResponse?.cartId || cartResponse?.id) {
      activeCartId = cartResponse.cartId || cartResponse.id;
    }
  }

  if (!activeCartId) {
    throw new Error("Could not retrieve active cart ID.");
  }

  const order = await createOrder({
    cartId: activeCartId,
    isPasabuyRequest,
  });

  const orderId = order?.id;
  if (!orderId) {
    throw new Error("Order was created without an id.");
  }

  startOrderTracking(orderId);

  const paymentStatus = await getOrderPaymentStatus(orderId);
  const checkout = await createPaymentCheckout(paymentStatus.paymentShare.id);

  return { orderId, checkoutUrl: checkout.checkoutUrl };
}
