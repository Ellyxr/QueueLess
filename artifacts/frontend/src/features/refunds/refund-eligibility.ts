const ACCEPT_TIMEOUT_MS = 5 * 60 * 1000;
const CONTACT_TIMEOUT_MS = 2 * 60 * 1000;
type OrderTiming = {
  status: string;
  paidAt: string | null;
  buyerContactPingAt: string | null;
  estimatedReadyAt?: string | null;
};
export function getOrderHelpEligibility(order: OrderTiming, now: number) {
  const elapsed = (date: string | null | undefined, duration: number) =>
    Boolean(date) && now - new Date(date!).getTime() >= duration;
  const terminal = order.status === "COMPLETED" || order.status === "CANCELLED";
  const vendorNotAccepted =
    order.status === "PAID" && elapsed(order.paidAt, ACCEPT_TIMEOUT_MS);
  const vendorUnresponsive =
    !terminal && elapsed(order.buyerContactPingAt, CONTACT_TIMEOUT_MS);
  const waitingExpired =
    !terminal && Boolean(order.paidAt) && elapsed(order.estimatedReadyAt, 0);
  return {
    vendorNotAccepted,
    vendorUnresponsive,
    contactAvailable: !terminal && (vendorNotAccepted || waitingExpired),
  };
}
