import type { VendorScheduledOrder } from "@/features/auth/api";
import { formatSlotLabel } from "@/features/orders/preorder-format";

/** Read-only list for the vendor's Scheduled (paid, waiting to be released) and Uncollected pre-order tabs. */
export function PreorderQueuePanel({
  kind,
  orders,
  isLoading,
}: {
  kind: "SCHEDULED" | "UNCOLLECTED";
  orders: VendorScheduledOrder[];
  isLoading: boolean;
}) {
  if (isLoading) return <div className="p-8 text-center text-sm text-muted-foreground">Loading pre-orders...</div>;

  if (orders.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        {kind === "SCHEDULED"
          ? "No scheduled pre-orders. Paid pre-orders wait here until it is time to prepare them."
          : "No uncollected pre-orders."}
      </div>
    );
  }

  return (
    <ul>
      {orders.map((order) => (
        <li key={order.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 px-4 py-4 last:border-b-0">
          <div>
            <p className="text-sm font-semibold text-foreground">
              #{order.orderReference}
              {kind === "UNCOLLECTED" && (
                <span className="ml-2 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-destructive">
                  Uncollected
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {order.customerName ?? "Student"} · ₱{order.total}
            </p>
          </div>
          <p className="min-w-0 flex-1 truncate text-sm text-foreground">
            {order.items.map((item) => `${item.name} (x${item.quantity})`).join(", ")}
          </p>
          <div className="text-right text-xs">
            {order.scheduledPickupAt && (
              <p className="font-medium text-violet-600">Pickup {formatSlotLabel(order.scheduledPickupAt)}</p>
            )}
            {kind === "SCHEDULED" && order.queueReleaseAt && (
              <p className="text-muted-foreground">Joins live queue {formatSlotLabel(order.queueReleaseAt)}</p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
