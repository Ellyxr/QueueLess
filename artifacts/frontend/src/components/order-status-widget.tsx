import { io } from "socket.io-client";
import { getOrderHelpEligibility } from "@/features/refunds/refund-eligibility";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, CookingPot, Grip, LifeBuoy, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import {
  getTrackedOrderIds,
  ORDER_TRACKING_CHANGED_EVENT,
  startOrderTracking,
  stopTrackingOrder,
} from "@/features/orders/order-tracking";
import {
  AUTH_STATE_CHANGED_EVENT,
  confirmOrderPickup,
  hasReviewedOrder,
  contactVendor,
  createPaymentCheckout,
  fetchWithAuth,
  getOrderStatus,
  pingGroupOrder,
  type OrderStatusResponse,
} from "@/features/auth/api";
import { RefundRequestDialog } from "@/features/refunds/refund-request-dialog";
import { PasabuyOrderEntry } from "@/features/pasabuy/pasabuy-order-entry";
import { formatCountdown, formatSlotLabel } from "@/features/orders/preorder-format";
import { PreorderManage } from "@/features/orders/preorder-manage";
import { ReviewPrompt } from "@/features/reviews/review-prompt";

const REFUND_HIDDEN_STATUSES = new Set(["PENDING", "CANCELLED"]);
const POLL_INTERVAL_MS = 8000;

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  PAID: "Paid",
  SCHEDULED: "Scheduled",
  UNCOLLECTED: "Uncollected",
  COOKING: "Preparing",
  OUT_FOR_DELIVERY: "Out for delivery",
  READY_FOR_PICKUP: "Ready for pickup",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const STATUS_SUBTEXT: Record<string, string> = {
  PENDING: "Vendor hasn't confirmed your order yet",
  PAID: "Payment received; waiting for vendor acceptance",
  SCHEDULED: "Payment received; the vendor starts on your pre-order before pickup",
  UNCOLLECTED: "This pre-order was ready but not collected in time",
  COOKING: "Your order is being prepared",
  OUT_FOR_DELIVERY: "Your order is on its way",
  READY_FOR_PICKUP: "Your order is ready — come grab it",
  COMPLETED: "This order is complete",
  CANCELLED: "This order was cancelled",
};

const STATUS_DOT_CLASS: Record<string, string> = {
  PENDING: "bg-slate-400 shadow-slate-300/60",
  PAID: "bg-blue-500 shadow-blue-300/60",
  SCHEDULED: "bg-violet-500 shadow-violet-300/60",
  UNCOLLECTED: "bg-destructive shadow-destructive/40",
  COOKING: "bg-amber-400 shadow-amber-300/60",
  OUT_FOR_DELIVERY: "bg-amber-400 shadow-amber-300/60",
  READY_FOR_PICKUP: "bg-amber-400 shadow-amber-300/60",
  COMPLETED: "bg-emerald-500 shadow-emerald-300/60",
  CANCELLED: "bg-destructive shadow-destructive/40",
};

const STATUS_PILL_CLASS: Record<string, string> = {
  PENDING: "bg-slate-500/10 text-slate-600",
  PAID: "bg-blue-500/10 text-blue-600",
  SCHEDULED: "bg-violet-500/10 text-violet-600",
  UNCOLLECTED: "bg-destructive/10 text-destructive",
  COOKING: "bg-amber-500/10 text-amber-600",
  OUT_FOR_DELIVERY: "bg-amber-500/10 text-amber-600",
  READY_FOR_PICKUP: "bg-amber-500/10 text-amber-600",
  COMPLETED: "bg-emerald-500/10 text-emerald-600",
  CANCELLED: "bg-destructive/10 text-destructive",
};

const TERMINAL_STATUSES = new Set(["COMPLETED", "CANCELLED", "UNCOLLECTED"]);

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

const CARD_TOP_OFFSET = 96;
const CARD_STACK_GAP = 16;
const CARD_HEIGHT_ESTIMATE = 230;
const MINIMIZED_TOP_OFFSET = 96;
const MINIMIZED_STACK_GAP = 12;
const MINIMIZED_HEIGHT_ESTIMATE = 44;
const DRAG_CLICK_THRESHOLD_PX = 4;
const WIDGET_STATE_KEY = "queueless.orderWidget.state";

type WidgetSide = "left" | "right";
type WidgetUiState = { minimized: boolean; x: number; y: number; side: WidgetSide };

// Per-session UI state (closed + dragged position) so the widget keeps its
// place while navigating between pages.
function readWidgetState(orderId: string): WidgetUiState {
  try {
    const all = JSON.parse(sessionStorage.getItem(WIDGET_STATE_KEY) || "{}");
    const saved = all[orderId];
    if (saved) {
      return {
        minimized: Boolean(saved.minimized),
        x: Number(saved.x) || 0,
        y: Number(saved.y) || 0,
        side: saved.side === "left" ? "left" : "right",
      };
    }
  } catch {
    // storage unavailable or corrupt; fall through to defaults
  }
  return { minimized: false, x: 0, y: 0, side: "right" };
}

function writeWidgetState(orderId: string, state: WidgetUiState) {
  try {
    const all = JSON.parse(sessionStorage.getItem(WIDGET_STATE_KEY) || "{}");
    all[orderId] = state;
    sessionStorage.setItem(WIDGET_STATE_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}

const SEEN_READY_EVENTS_KEY = "queueless:seen-ready-event-ids";
const BUZZER_SOUND_ENABLED_KEY = "queueless:buzzer-sound-enabled";
const READY_BUZZER_MAX_AGE_MS = 2 * 60 * 1000;
const MAX_SEEN_READY_EVENTS = 200;

export function OrderStatusWidget() {
  const [orderIds, setOrderIds] = useState<string[]>(getTrackedOrderIds);
  const [readyAlert, setReadyAlert] = useState<{
    orderId: string;
    message: string;
  } | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(
    () =>
      typeof window !== "undefined" &&
      window.localStorage?.getItem(BUZZER_SOUND_ENABLED_KEY) === "true",
  );
  const [soundNeedsInteraction, setSoundNeedsInteraction] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const soundEnabledRef = useRef(
    typeof window !== "undefined" &&
      window.localStorage?.getItem(BUZZER_SOUND_ENABLED_KEY) === "true",
  );

  const enableBuzzerSound = async () => {
    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as typeof window & {
          webkitAudioContext?: typeof AudioContext;
        }).webkitAudioContext;

      if (!AudioContextClass) {
        setSoundNeedsInteraction(true);
        return;
      }

      audioContextRef.current ??= new AudioContextClass();
      const context = audioContextRef.current;
      if (context.state === "suspended") {
        await context.resume();
      }

      soundEnabledRef.current = true;
      localStorage.setItem(BUZZER_SOUND_ENABLED_KEY, "true");
      setSoundEnabled(true);
      setSoundNeedsInteraction(false);
    } catch {
      setSoundNeedsInteraction(true);
    }
  };

  const muteBuzzerSound = () => {
    soundEnabledRef.current = false;
    localStorage.setItem(BUZZER_SOUND_ENABLED_KEY, "false");
    setSoundEnabled(false);
  };

  useEffect(() => {
    const refreshOrderIds = () => setOrderIds(getTrackedOrderIds());
    window.addEventListener(ORDER_TRACKING_CHANGED_EVENT, refreshOrderIds);
    window.addEventListener(AUTH_STATE_CHANGED_EVENT, refreshOrderIds);
    return () => {
      window.removeEventListener(ORDER_TRACKING_CHANGED_EVENT, refreshOrderIds);
      window.removeEventListener(AUTH_STATE_CHANGED_EVENT, refreshOrderIds);
    };
  }, []);

  useEffect(() => {
    type ReadyOrder = {
      eventId: string;
      orderId: string;
      orderReference: string;
      status: string;
      readyAt: string;
      vendor: {
        id: string;
        name: string;
        pickupLocation?: string | null;
      };
      pickupRole?: string;
    };

    type RecoveryResponse = {
      serverTime: string;
      orders: ReadyOrder[];
    };

    let socket: ReturnType<typeof io> | null = null;
    let disposed = false;
    const tabId = crypto.randomUUID();

    const readSeenIds = (): string[] => {
      try {
        const value: unknown = JSON.parse(
          localStorage.getItem(SEEN_READY_EVENTS_KEY) ?? "[]",
        );
        return Array.isArray(value)
          ? value.filter((id): id is string => typeof id === "string")
          : [];
      } catch {
        return [];
      }
    };

    const rememberEvent = (eventId: string): boolean => {
      const seen = readSeenIds();
      if (seen.includes(eventId)) return false;

      const updated = [...seen, eventId].slice(-MAX_SEEN_READY_EVENTS);
      try {
        localStorage.setItem(SEEN_READY_EVENTS_KEY, JSON.stringify(updated));
      } catch {
        // Continue with in-memory deduplication if storage is unavailable.
      }
      return true;
    };

    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("queueless-ready-buzzer")
        : null;
    const tabSeenIds = new Set<string>();

    channel?.addEventListener("message", (event: MessageEvent) => {
      const data = event.data as
        | { type?: string; eventId?: string; tabId?: string }
        | undefined;

      if (
        data?.type === "ready-seen" &&
        data.eventId &&
        data.tabId !== tabId
      ) {
        tabSeenIds.add(data.eventId);
      }
    });

    const markSeen = (eventId: string): boolean => {
      if (tabSeenIds.has(eventId)) return false;

      const isNew = rememberEvent(eventId);
      if (!isNew) return false;

      tabSeenIds.add(eventId);
      channel?.postMessage({ type: "ready-seen", eventId, tabId });
      return true;
    };

    
    const playBuzzer = async (): Promise<boolean> => {
      if (!soundEnabledRef.current) return false;

      try {
        const AudioContextClass =
          window.AudioContext ||
          (window as typeof window & {
            webkitAudioContext?: typeof AudioContext;
          }).webkitAudioContext;

        if (!AudioContextClass) {
          setSoundNeedsInteraction(true);
          return false;
        }

        audioContextRef.current ??= new AudioContextClass();
        const context = audioContextRef.current;

        if (context.state === "suspended") {
          await context.resume();
        }

        const notes = [
          { frequency: 880, start: 0, duration: 0.35 },
          { frequency: 880, start: 0.4, duration: 0.3 },
        ];

        for (const note of notes) {
          const oscillator = context.createOscillator();
          const gain = context.createGain();

          oscillator.type = "square";
          oscillator.frequency.value = note.frequency;

          const startTime = context.currentTime + note.start;
          const endTime = startTime + note.duration;

          gain.gain.setValueAtTime(0, startTime);
          gain.gain.linearRampToValueAtTime(0.08, startTime + 0.015);
          gain.gain.setValueAtTime(0.08, endTime - 0.015);
          gain.gain.linearRampToValueAtTime(0, endTime);

          oscillator.connect(gain);
          gain.connect(context.destination);

          oscillator.start(startTime);
          oscillator.stop(endTime);

          oscillator.onended = () => {
            oscillator.disconnect();
            gain.disconnect();
          };
        }

        setSoundNeedsInteraction(false);
        return true;
      } catch {
        setSoundNeedsInteraction(true);
        return false;
      }
    };


    const showReadyAlert = (order: ReadyOrder) => {
      const vendorName = order.vendor.name;
      const pickupLocation = order.vendor.pickupLocation;

      const location = pickupLocation
        ?.replace(new RegExp(`^${vendorName},?\\s*`, "i"), "")
        .trim();

      setReadyAlert({
        orderId: order.orderId,
        message: `Your order from ${vendorName}${
          location ? ` at ${location}` : ""
        } is ready for pickup.`,
      });
    };

    const processReadyOrder = (
      order: ReadyOrder,
      options: { allowBuzzer: boolean },
    ) => {
      if (
        disposed ||
        order.status !== "READY_FOR_PICKUP" ||
        !order.eventId ||
        !order.orderId
      ) {
        return;
      }

      if (!markSeen(order.eventId)) return;

      showReadyAlert(order);

      if (options.allowBuzzer && soundEnabledRef.current) {
        void playBuzzer();
      } else if (options.allowBuzzer && !soundEnabledRef.current) {
        setSoundNeedsInteraction(false);
      }
    };

    const recoverReadyOrders = async () => {
      try {
        const result = await fetchWithAuth<RecoveryResponse>(
          "/orders/ready-for-pickup",
        );

        if (disposed) return;

        const serverTime = Date.parse(result.serverTime);

        for (const order of result.orders) {
          const readyAt = Date.parse(order.readyAt);
          const age = serverTime - readyAt;

          processReadyOrder(order, {
            allowBuzzer:
              Number.isFinite(serverTime) &&
              Number.isFinite(readyAt) &&
              age >= 0 &&
              age <= READY_BUZZER_MAX_AGE_MS,
          });
        }
      } catch {
        // Recovery failure must not break the socket connection.
      }
    };

    // BUG-006: rebuild the widget list from the server after a reconnect,
    // reload or new login, so in-progress orders (placed or joined as a
    // group member) reappear even if local tracking was lost.
    const restoreActiveOrders = async () => {
      if (!localStorage.getItem("token")) return;
      try {
        const result = await fetchWithAuth<{ orders: Array<{ id: string }> }>("/orders/active");
        if (disposed) return;
        for (const order of result.orders) {
          if (!startOrderTracking(order.id)) break; // widget slots are full
        }
      } catch {
        // Offline or not a student: keep whatever is already tracked.
      }
    };

    const handleOnline = () => {
      void restoreActiveOrders();
    };

    const connectSocket = () => {
      const token = localStorage.getItem("token");

      if (!token) {
        socket?.disconnect();
        socket = null;
        return;
      }

      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
      const socketUrl = import.meta.env.VITE_SOCKET_URL;

      const socketOrigin = socketUrl
        ? socketUrl.replace(/\/+$/, "")
        : apiBaseUrl
          ? new URL(apiBaseUrl, window.location.origin).origin
          : "http://localhost:5000";

      if (socket) {
        socket.auth = { token };
        if (!socket.connected) socket.connect();
        return;
      }

      socket = io(`${socketOrigin}/realtime`, {
        auth: { token },
        transports: ["websocket", "polling"],
      });

      // Fires on the first connect and after every reconnect.
      socket.on("realtime.ready", () => {
        void recoverReadyOrders();
        void restoreActiveOrders();
      });

      socket.on("order.ready", (payload: ReadyOrder) => {
        processReadyOrder(payload, { allowBuzzer: true });
      });
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === BUZZER_SOUND_ENABLED_KEY) {
        soundEnabledRef.current = event.newValue === "true";
        setSoundEnabled(soundEnabledRef.current);
      }
    };

    connectSocket();
    void restoreActiveOrders();
    window.addEventListener(AUTH_STATE_CHANGED_EVENT, connectSocket);
    window.addEventListener("storage", handleStorage);
    window.addEventListener("online", handleOnline);

    return () => {
      disposed = true;
      window.removeEventListener(AUTH_STATE_CHANGED_EVENT, connectSocket);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("online", handleOnline);
      socket?.disconnect();
      channel?.close();
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        void audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  if (!orderIds.length && !readyAlert) return null;

  return (
    <>

      {readyAlert && (
        <div
          role="alert"
          aria-live="assertive"
          className="pointer-events-auto fixed left-1/2 top-5 z-[100] flex w-[min(92vw,420px)] -translate-x-1/2 items-center gap-3 rounded-2xl border border-emerald-500/30 bg-card p-4 shadow-2xl"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-xl">
            🔔
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground">Order ready!</p>
            <p className="text-sm text-muted-foreground">
              {readyAlert.message}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setReadyAlert(null)}
            aria-label="Dismiss order ready alert"
            className="rounded-full p-1 text-muted-foreground hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {orderIds.map((orderId, index) => (
        <TrackedOrderCard
          key={orderId}
          orderId={orderId}
          stackIndex={index}
          soundEnabled={soundEnabled}
          soundNeedsInteraction={soundNeedsInteraction}
          onEnableSound={enableBuzzerSound}
          onMuteSound={muteBuzzerSound}
        />
      ))}
    </>
  );
}

function TrackedOrderCard({
  orderId,
  stackIndex,
  soundEnabled,
  soundNeedsInteraction,
  onEnableSound,
  onMuteSound,
}: {
  orderId: string;
  stackIndex: number;
  soundEnabled: boolean;
  soundNeedsInteraction: boolean;
  onEnableSound: () => Promise<void>;
  onMuteSound: () => void;
}) {

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const [order, setOrder] = useState<OrderStatusResponse | null>(null);
  // After pickup is confirmed, show the review prompt until the student has reviewed.
  const [reviewState, setReviewState] = useState<"unknown" | "needed" | "done">("unknown");
  const completedByViewer = order?.status === "COMPLETED" && order.viewerRole !== "MEMBER";
  useEffect(() => {
    if (!completedByViewer) return;
    let cancelled = false;
    hasReviewedOrder(orderId).then((reviewed) => {
      if (!cancelled) setReviewState(reviewed ? "done" : "needed");
    });
    return () => {
      cancelled = true;
    };
  }, [completedByViewer, orderId]);
  const [initialUi] = useState(() => readWidgetState(orderId));
  const [isMinimized, setIsMinimized] = useState(initialUi.minimized);
  const [side, setSide] = useState<WidgetSide>(initialUi.side);
  const [isDragActive, setIsDragActive] = useState(false);
  const isMinimizedRef = useRef(isMinimized);
  isMinimizedRef.current = isMinimized;
  const [isItemsExpanded, setIsItemsExpanded] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isPinging, setIsPinging] = useState(false);
  const [pingSent, setPingSent] = useState(false);
  const [isRefundDialogOpen, setIsRefundDialogOpen] = useState(false);
  const [refundMessage, setRefundMessage] = useState<string | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [dragOffset2d, setDragOffset2d] = useState({ x: initialUi.x, y: initialUi.y });
  const wrapperRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    rect: DOMRect;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    writeWidgetState(orderId, { minimized: isMinimized, x: dragOffset2d.x, y: dragOffset2d.y, side });
  }, [orderId, isMinimized, dragOffset2d, side]);

  // Attach to whichever screen edge the widget is currently closest to.
  const snapToNearestSide = () => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    const center = rect.left + rect.width / 2;
    setSide(center < window.innerWidth / 2 ? "left" : "right");
    setDragOffset2d((current) => ({ x: 0, y: current.y }));
  };
  const snapRef = useRef(snapToNearestSide);
  snapRef.current = snapToNearestSide;

  const minimize = () => {
    snapToNearestSide();
    setIsMinimized(true);
  };

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
        .catch((error: unknown) => {
          if (cancelled) return;
          // BUG-006: only drop the widget when the order is really gone (404).
          // Offline, server errors and an expired session keep it; the next
          // poll or reconnect recovers it.
          if ((error as { status?: number } | null)?.status === 404) {
            stopTrackingOrder(orderId);
          }
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
      const d = drag.current;
      if (!d) return;
      const dx = event.clientX - d.startX;
      const dy = event.clientY - d.startY;
      if (!d.moved && Math.hypot(dx, dy) < DRAG_CLICK_THRESHOLD_PX) return;
      if (!d.moved) setIsDragActive(true);
      d.moved = true;
      // Keep the widget fully inside the viewport.
      const clampedDx = Math.min(Math.max(dx, -d.rect.left), window.innerWidth - d.rect.right);
      const clampedDy = Math.min(Math.max(dy, -d.rect.top), window.innerHeight - d.rect.bottom);
      setDragOffset2d({ x: d.originX + clampedDx, y: d.originY + clampedDy });
    };
    const stopDragging = () => {
      if (drag.current?.moved) {
        // The click that follows a drag must not toggle the widget.
        suppressClick.current = true;
        setIsDragActive(false);
        if (isMinimizedRef.current) snapRef.current();
        window.setTimeout(() => {
          suppressClick.current = false;
        }, 0);
      }
      drag.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
    };
  }, []);

  const startDrag = (event: React.PointerEvent) => {
    if (!wrapperRef.current) return;
    drag.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: dragOffset2d.x,
      originY: dragOffset2d.y,
      rect: wrapperRef.current.getBoundingClientRect(),
      moved: false,
    };
  };

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

  const handlePayShare = async () => {
    if (!order?.myPaymentShare || isPaying) return;
    setIsPaying(true);
    setPayError(null);
    try {
      const checkout = await createPaymentCheckout(order.myPaymentShare.id);
      window.location.href = checkout.checkoutUrl;
    } catch (error) {
      setPayError(error instanceof Error ? error.message : "Could not start checkout.");
      setIsPaying(false);
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
  const paymentCountdown =
    order.isPreorder && order.status === "PENDING" && order.reservationExpiresAt
      ? formatCountdown(order.reservationExpiresAt, now)
      : null;
  const reservationExpired =
    order.isPreorder && order.status === "PENDING" && Boolean(order.reservationExpiresAt) && paymentCountdown === null;
  let subtext = STATUS_SUBTEXT[order.status] || "";
  if (order.isPreorder && order.status === "PENDING") {
    subtext = reservationExpired
      ? "Reservation expired — this pre-order is being released"
      : "Awaiting payment to reserve your pickup time";
  } else if (order.status === "CANCELLED" && order.cancellationReason === "RESERVATION_EXPIRED") {
    subtext = "Cancelled: the reservation expired before payment";
  }
  const dotClass = STATUS_DOT_CLASS[order.status] || "bg-blue-500 shadow-blue-300/60";
  const pillClass = STATUS_PILL_CLASS[order.status] || "bg-blue-500/10 text-blue-600";

  const baseTop = isMinimized
    ? MINIMIZED_TOP_OFFSET + stackIndex * (MINIMIZED_HEIGHT_ESTIMATE + MINIMIZED_STACK_GAP)
    : CARD_TOP_OFFSET + stackIndex * (CARD_HEIGHT_ESTIMATE + CARD_STACK_GAP);

  return (
    <div
      ref={wrapperRef}
      className={`pointer-events-none fixed z-40 touch-none ${side === "left" ? "left-0" : "right-0"} ${isDragActive ? "" : "transition-transform duration-300"}`}
      style={{ top: baseTop, transform: `translate(${dragOffset2d.x}px, ${dragOffset2d.y}px)` }}
    >
    <AnimatePresence mode="wait" initial={false}>
      {isMinimized ? (
        <motion.button
          key="minimized"
          type="button"
          className={`group pointer-events-auto relative flex h-11 w-14 cursor-grab items-center justify-center overflow-hidden border border-border/80 px-4 ${side === "left" ? "rounded-r-2xl border-l-0" : "rounded-l-2xl border-r-0"} bg-card/95 shadow-xl backdrop-blur-md transition-[width] duration-300 hover:w-24 active:cursor-grabbing`}
          onPointerDown={startDrag}
          onClick={() => {
            if (!suppressClick.current) setIsMinimized(false);
          }}
          aria-label="Expand order status"
          variants={tabVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <span
            className={`absolute top-1.5 h-2 w-2 rounded-full transition-all duration-300 ${side === "left" ? "right-2 group-hover:right-3" : "left-2 group-hover:left-3"} ${dotClass}`}
          />
          <CookingPot className="h-5 w-5 text-muted-foreground transition-opacity duration-200 group-hover:opacity-0" />
          <span className={`absolute whitespace-nowrap ${side === "left" ? "left-3" : "left-8"} font-mono text-[11px] font-semibold text-foreground opacity-0 transition-opacity duration-200 group-hover:opacity-100`}>
            {label}
          </span>
        </motion.button>
      ) : (
        <motion.aside
          key="expanded"
          className={`pointer-events-auto w-[230px] ${side === "left" ? "ml-4" : "mr-4"} select-none overflow-y-auto rounded-[24px] border border-border/80 bg-card/95 p-4 shadow-2xl backdrop-blur-md`}
          style={{ maxHeight: `calc(100vh - ${baseTop + 16}px)` }}
          aria-label="Order status"
          variants={widgetVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          
          <div
            className="flex cursor-grab items-center justify-between active:cursor-grabbing"
            onPointerDown={startDrag}
          >
            <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <Grip className="h-3.5 w-3.5" /> Order status
            </span>
            <button
              type="button"
              className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                if (isTerminal) {
                  stopTrackingOrder(orderId);
                } else {
                  minimize();
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

          {order.isPreorder && order.scheduledPickupAt && !isTerminal && (
            <div className="mt-3 text-center">
              <p className="text-sm font-semibold text-foreground">{formatSlotLabel(order.scheduledPickupAt)}</p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Pre-order pickup</p>
            </div>
          )}

          {paymentCountdown && (
            <div className="mt-3 rounded-xl bg-amber-500/10 px-3 py-2 text-center">
              <p className="font-mono text-xl font-semibold tracking-[0.06em] text-amber-600">{paymentCountdown}</p>
              <p className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-amber-600/80">Pay within to keep your time</p>
            </div>
          )}

          {order.estimatedWaitMinutes !== null && !isTerminal && !order.isPreorder && (
            <div className="mt-3 text-center">
              <p className="font-mono text-2xl font-semibold tracking-[0.06em] text-foreground">
                ~{order.estimatedWaitMinutes} min
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Estimated wait
              </p>
            </div>
          )}

          {order.status === "PENDING" &&
            order.myPaymentShare &&
            order.myPaymentShare.status === "PENDING" &&
            !reservationExpired && (
            <div className="mt-3 space-y-1.5">
              <button
                type="button"
                onClick={handlePayShare}
                disabled={isPaying}
                className="w-full rounded-full bg-primary py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {isPaying
                  ? "Redirecting to checkout..."
                  : `Pay my share (₱${order.myPaymentShare.amountDue})`}
              </button>
              <a href={`/wallet?paymentShareId=${encodeURIComponent(order.myPaymentShare.id)}&orderId=${encodeURIComponent(orderId)}`} className="block rounded-full border border-border py-2 text-center text-xs font-semibold">Pay with QueueLess wallet</a>
              {payError && <p className="text-center text-[11px] text-destructive">{payError}</p>}
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

          {order.status === "PENDING" &&
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

          {order.isPreorder && order.viewerRole !== "MEMBER" && (
            <PreorderManage
              orderId={orderId}
              status={order.status}
              onChanged={() => getOrderStatus(orderId).then(setOrder).catch(() => {})}
            />
          )}

          {reviewState === "needed" && completedByViewer && (
            <ReviewPrompt orderId={orderId} onSubmitted={() => setReviewState("done")} />
          )}

          {!isTerminal && !order.isPreorder && (
            <div className="mt-3">
              <PasabuyOrderEntry
                orderStatus={order.status}
                fullWidth
                isPasabuyRequest={order.isPasabuyRequest}
                isPreorder={order.isPreorder}
                order={{
                  orderId: order.orderId,
                  reference: order.orderReference,
                  items: order.items.map((item) => `${item.name} x${item.quantity}`).join(", "),
                  vendorName: order.vendor.name,
                  pickupLocation: order.vendor.pickupLocation || order.vendor.campusLocation || "Vendor location",
                }}
              />
            </div>
          )}

          {!order.refund && getOrderHelpEligibility(order, now).contactAvailable && (
            <button type="button" disabled={isPinging || Boolean(order.buyerContactPingAt)} className="mt-3 w-full rounded-full border border-border py-2 text-xs font-semibold disabled:opacity-60" onClick={async () => {
              setIsPinging(true);
              try {
                await contactVendor(orderId);
                setOrder(await getOrderStatus(orderId));
                setRefundMessage("Vendor notified.");
              } catch (err) { setRefundMessage(err instanceof Error ? err.message : "Could not contact vendor."); }
              finally { setIsPinging(false); }
            }}>{order.buyerContactPingAt ? "Vendor contacted" : "Contact vendor"}</button>
          )}

          {!REFUND_HIDDEN_STATUSES.has(order.status) && !order.refund && (
            <button
              type="button"
              onClick={() => setIsRefundDialogOpen(true)}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full border border-border py-2 text-xs font-semibold text-foreground transition-colors hover:bg-secondary"
            >
              <LifeBuoy className="h-3.5 w-3.5" />
              {getOrderHelpEligibility(order, now).contactAvailable
                ? "Request refund"
                : "Need help with this order?"}
            </button>
          )}

          {refundMessage && (
            <p className="mt-2 text-center text-[11px] font-medium text-emerald-600">
              {refundMessage}
            </p>
          )}

          <RefundRequestDialog
            open={isRefundDialogOpen}
            onOpenChange={setIsRefundDialogOpen}
            orderId={orderId}
            order={{
              status: order.status,
              paidAt: order.paidAt,
              buyerContactPingAt: order.buyerContactPingAt,
            }}
            onSuccess={(message) => {
              setRefundMessage(message);
              window.setTimeout(() => setRefundMessage(null), 5000);
              getOrderStatus(orderId).then(setOrder).catch(() => {});
            }}
          />

          <div className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-secondary/30 p-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground">
                Buzzer sound
              </p>
              <p className="text-[10px] text-muted-foreground">
                {soundEnabled ? "Sound enabled" : "Sound muted"}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={soundEnabled}
              aria-label="Enable or mute order buzzer"
              onClick={() => {
                if (soundEnabled) {
                  onMuteSound();
                } else {
                  void onEnableSound();
                }
              }}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                soundEnabled ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  soundEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {soundNeedsInteraction && (
            <div
              role="status"
              className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3"
            >
              <p className="text-xs font-medium text-foreground">
                Buzzer sound is unavailable
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Your visual order alerts will still appear. Tap below to retry.
              </p>
              <button
                type="button"
                onClick={() => void onEnableSound()}
                className="mt-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary"
              >
                Retry sound
              </button>
            </div>
          )}

          <img
            src="/favicon.png"
            alt="QueueLess"
            className="mx-auto mt-3 h-7 w-7 object-contain"
          />

        </motion.aside>
      )}
    </AnimatePresence>
    </div>
  );
}