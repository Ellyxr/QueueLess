import { useEffect, useRef, useState } from "react";
import { ChevronDown, CookingPot, Grip, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import {
  getTrackedOrderIds,
  ORDER_TRACKING_CHANGED_EVENT,
  stopTrackingOrder,
} from "@/features/orders/order-tracking";
import {
  AUTH_STATE_CHANGED_EVENT,
  confirmOrderPickup,
  getOrderStatus,
  pingGroupOrder,
  type OrderStatusResponse,
} from "@/features/auth/api";

const POLL_INTERVAL_MS = 8000;

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  PAID: "Paid",
  COOKING: "Preparing",
  OUT_FOR_DELIVERY: "Out for delivery",
  READY_FOR_PICKUP: "Ready for pickup",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const STATUS_SUBTEXT: Record<string, string> = {
  PENDING: "Vendor hasn't confirmed your order yet",
  PAID: "Vendor confirmed your order",
  COOKING: "Your order is being prepared",
  OUT_FOR_DELIVERY: "Your order is on its way",
  READY_FOR_PICKUP: "Your order is ready — come grab it",
  COMPLETED: "This order is complete",
  CANCELLED: "This order was cancelled",
};

const STATUS_DOT_CLASS: Record<string, string> = {
  PENDING: "bg-slate-400 shadow-slate-300/60",
  PAID: "bg-blue-500 shadow-blue-300/60",
  COOKING: "bg-amber-400 shadow-amber-300/60",
  OUT_FOR_DELIVERY: "bg-amber-400 shadow-amber-300/60",
  READY_FOR_PICKUP: "bg-amber-400 shadow-amber-300/60",
  COMPLETED: "bg-emerald-500 shadow-emerald-300/60",
  CANCELLED: "bg-destructive shadow-destructive/40",
};

const STATUS_PILL_CLASS: Record<string, string> = {
  PENDING: "bg-slate-500/10 text-slate-600",
  PAID: "bg-blue-500/10 text-blue-600",
  COOKING: "bg-amber-500/10 text-amber-600",
  OUT_FOR_DELIVERY: "bg-amber-500/10 text-amber-600",
  READY_FOR_PICKUP: "bg-amber-500/10 text-amber-600",
  COMPLETED: "bg-emerald-500/10 text-emerald-600",
  CANCELLED: "bg-destructive/10 text-destructive",
};

const TERMINAL_STATUSES = new Set(["COMPLETED", "CANCELLED"]);

// Stretch variants: squish in the "closing" axis first, then pop open the other.
const widgetVariants = {
  hidden: {
    scaleX: 0.4,
    scaleY: 0.7,
    opacity: 0,
    originX: 1,
    originY: 0,
  },
  visible: {
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
    originX: 1,
    originY: 0,
    transition: {
      duration: 0.38,
      ease: [0.34, 1.56, 0.64, 1] as const,
      scaleX: { duration: 0.28, ease: [0.34, 1.56, 0.64, 1] as const },
      scaleY: { duration: 0.38, delay: 0.04, ease: [0.34, 1.56, 0.64, 1] as const },
      opacity: { duration: 0.15 },
    },
  },
  exit: {
    scaleX: 0.3,
    scaleY: 0.6,
    opacity: 0,
    originX: 1,
    originY: 0,
    transition: {
      duration: 0.25,
      ease: [0.4, 0, 0.2, 1] as const,
      scaleX: { duration: 0.2 },
      scaleY: { duration: 0.25, delay: 0.04 },
      opacity: { duration: 0.15, delay: 0.1 },
    },
  },
};

const tabVariants = {
  hidden: { scaleX: 0.4, opacity: 0, originX: 1 },
  visible: {
    scaleX: 1,
    opacity: 1,
    originX: 1,
    transition: {
      duration: 0.32,
      ease: [0.34, 1.56, 0.64, 1] as const,
      opacity: { duration: 0.15 },
    },
  },
  exit: {
    scaleX: 0.4,
    opacity: 0,
    originX: 1,
    transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] as const },
  },
};

const CARD_TOP_OFFSET = 96; // top-24
const CARD_STACK_GAP = 16;
const CARD_HEIGHT_ESTIMATE = 230;
const MINIMIZED_TOP_OFFSET = 96;
const MINIMIZED_STACK_GAP = 12;
const MINIMIZED_HEIGHT_ESTIMATE = 112;

export function OrderStatusWidget() {
  const [orderIds, setOrderIds] = useState<string[]>(getTrackedOrderIds);

  useEffect(() => {
    const refreshOrderIds = () => setOrderIds(getTrackedOrderIds());
    window.addEventListener(ORDER_TRACKING_CHANGED_EVENT, refreshOrderIds);
    window.addEventListener(AUTH_STATE_CHANGED_EVENT, refreshOrderIds);
    return () => {
      window.removeEventListener(ORDER_TRACKING_CHANGED_EVENT, refreshOrderIds);
      window.removeEventListener(AUTH_STATE_CHANGED_EVENT, refreshOrderIds);
    };
  }, []);

  if (!orderIds.length) return null;

  return (
    <>
      {orderIds.map((orderId, index) => (
        <TrackedOrderCard key={orderId} orderId={orderId} stackIndex={index} />
      ))}
    </>
  );
}

function TrackedOrderCard({ orderId, stackIndex }: { orderId: string; stackIndex: number }) {
  const [order, setOrder] = useState<OrderStatusResponse | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isItemsExpanded, setIsItemsExpanded] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isPinging, setIsPinging] = useState(false);
  const [pingSent, setPingSent] = useState(false);
  const [dragOffset2d, setDragOffset2d] = useState({ x: 0, y: 0 });
  const dragOffset = useRef({ x: 0, y: 0 });
  const isDragging = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const fetchStatus = () => {
      getOrderStatus(orderId)
        .then((status) => {
          if (cancelled) return;
          setOrder(status);
          if (TERMINAL_STATUSES.has(status.status)) {
            window.clearInterval(timer);
          }
        })
        .catch(() => {
          if (cancelled) return;
          stopTrackingOrder(orderId);
        });
    };

    fetchStatus();
    const timer = window.setInterval(fetchStatus, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [orderId]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!isDragging.current) return;
      setDragOffset2d({
        x: event.clientX - dragOffset.current.x,
        y: event.clientY - dragOffset.current.y,
      });
    };
    const stopDragging = () => {
      isDragging.current = false;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDragging);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDragging);
    };
  }, []);

  const handleCompleteOrder = async () => {
    if (isCompleting) return;
    setIsCompleting(true);
    try {
      await confirmOrderPickup(orderId);
      const status = await getOrderStatus(orderId);
      setOrder(status);
    } catch {
      // leave the widget as-is; the next poll will reconcile
    } finally {
      setIsCompleting(false);
    }
  };

  const handlePingOwner = async () => {
    if (!order?.groupOrder || isPinging) return;
    setIsPinging(true);
    try {
      await pingGroupOrder(order.groupOrder.id);
      setPingSent(true);
      window.setTimeout(() => setPingSent(false), 4000);
    } catch {
      // ignore — user can try again
    } finally {
      setIsPinging(false);
    }
  };

  if (!order) return null;

  const isTerminal = TERMINAL_STATUSES.has(order.status);
  const label = STATUS_LABELS[order.status] || order.status;
  const subtext = STATUS_SUBTEXT[order.status] || "";
  const dotClass = STATUS_DOT_CLASS[order.status] || "bg-blue-500 shadow-blue-300/60";
  const pillClass = STATUS_PILL_CLASS[order.status] || "bg-blue-500/10 text-blue-600";

  const baseTop = isMinimized
    ? MINIMIZED_TOP_OFFSET + stackIndex * (MINIMIZED_HEIGHT_ESTIMATE + MINIMIZED_STACK_GAP)
    : CARD_TOP_OFFSET + stackIndex * (CARD_HEIGHT_ESTIMATE + CARD_STACK_GAP);

  return (
    <AnimatePresence mode="wait" initial={false}>
      {isMinimized ? (
        <motion.button
          key="minimized"
          type="button"
          className="group pointer-events-auto fixed right-0 z-40 flex h-28 w-14 items-center justify-center overflow-hidden rounded-l-2xl border border-r-0 border-border/80 bg-card/95 shadow-xl backdrop-blur-md transition-all duration-300 hover:w-24"
          style={{ top: baseTop, transform: `translate(${dragOffset2d.x}px, ${dragOffset2d.y}px)` }}
          onClick={() => setIsMinimized(false)}
          aria-label="Expand order status"
          variants={tabVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <span
            className={`absolute left-2 top-3 h-2.5 w-2.5 rounded-full transition-all duration-300 group-hover:left-3 ${dotClass}`}
          />
          <CookingPot className="h-5 w-5 text-muted-foreground transition-opacity duration-200 group-hover:opacity-0" />
          <span className="absolute left-8 whitespace-nowrap font-mono text-[11px] font-semibold text-foreground opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            {label}
          </span>
        </motion.button>
      ) : (
        <motion.aside
          key="expanded"
          className="pointer-events-auto fixed right-4 z-40 w-[230px] select-none rounded-[24px] border border-border/80 bg-card/95 p-4 shadow-2xl backdrop-blur-md"
          style={{ top: baseTop, transform: `translate(${dragOffset2d.x}px, ${dragOffset2d.y}px)` }}
          aria-label="Order status"
          variants={widgetVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <div
            className="flex cursor-grab items-center justify-between active:cursor-grabbing"
            onPointerDown={(event) => {
              isDragging.current = true;
              dragOffset.current = {
                x: event.clientX - dragOffset2d.x,
                y: event.clientY - dragOffset2d.y,
              };
              event.currentTarget.setPointerCapture?.(event.pointerId);
            }}
          >
            <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <Grip className="h-3.5 w-3.5" /> Order status
            </span>
            <button
              type="button"
              className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              onPointerDown={(event) => {
                event.stopPropagation();
                if (isTerminal) {
                  stopTrackingOrder(orderId);
                } else {
                  setIsMinimized(true);
                }
              }}
              onClick={(event) => {
                event.stopPropagation();
                if (isTerminal) {
                  stopTrackingOrder(orderId);
                } else {
                  setIsMinimized(true);
                }
              }}
              aria-label={isTerminal ? "Dismiss order status" : "Minimize order status"}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <p className="mt-3 truncate text-sm font-semibold text-foreground">{order.vendor.name}</p>
          {order.vendor.campusLocation && (
            <p className="truncate text-[11px] text-muted-foreground">{order.vendor.campusLocation}</p>
          )}

          <div className="mt-2 flex items-center gap-2">
            <span className={`h-3 w-3 rounded-full shadow-sm ${dotClass}`} aria-hidden />
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${pillClass}`}>
              {label}
            </span>
          </div>

          <p className="mt-2 text-[11px] leading-4 text-muted-foreground">{subtext}</p>

          {order.items.length > 0 && (
            <div className="mt-3 rounded-2xl border border-border/80 bg-secondary/30">
              {order.items.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={() => setIsItemsExpanded((current) => !current)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left"
                  >
                    <span className="text-[11px] font-medium text-foreground">
                      {order.items.length} items
                    </span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isItemsExpanded ? "rotate-180" : ""}`}
                    />
                  </button>
                  {isItemsExpanded && (
                    <ul className="space-y-1 px-3 pb-2">
                      {order.items.map((item) => (
                        <li key={item.id} className="flex justify-between text-[11px] text-muted-foreground">
                          <span className="truncate pr-2">{item.name}</span>
                          <span>x{item.quantity}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <div className="flex justify-between px-3 py-2 text-[11px] text-muted-foreground">
                  <span className="truncate pr-2">{order.items[0].name}</span>
                  <span>x{order.items[0].quantity}</span>
                </div>
              )}
            </div>
          )}

          {order.estimatedWaitMinutes !== null && !isTerminal && (
            <div className="mt-3 text-center">
              <p className="font-mono text-2xl font-semibold tracking-[0.06em] text-foreground">
                ~{order.estimatedWaitMinutes} min
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Estimated wait
              </p>
            </div>
          )}

          {order.status === "READY_FOR_PICKUP" && order.canComplete && (
            <button
              type="button"
              onClick={handleCompleteOrder}
              disabled={isCompleting}
              className="mt-3 w-full rounded-full bg-primary py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {isCompleting ? "Completing..." : "Complete order"}
            </button>
          )}

          {order.orderType === "GROUP" &&
            order.viewerRole === "MEMBER" &&
            !order.canComplete && (
              <button
                type="button"
                onClick={handlePingOwner}
                disabled={isPinging}
                className="mt-3 w-full rounded-full border border-border py-2 text-xs font-semibold text-foreground transition-colors hover:bg-secondary disabled:opacity-60"
              >
                {pingSent ? "Owner notified" : isPinging ? "Pinging..." : "Ping owner"}
              </button>
            )}

          <img
            src="/favicon.svg"
            alt="QueueLess"
            className="mx-auto mt-3 h-7 w-7 object-contain"
          />
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
