import { useEffect, useRef, useState } from "react";
import { CookingPot, Grip, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import {
  getMockOrderTracking,
  ORDER_TRACKING_CHANGED_EVENT,
  type MockOrderTracking,
} from "@/features/orders/mock-order-tracking";
import { AUTH_STATE_CHANGED_EVENT } from "@/features/auth/api";

// Stretch variants: squish in the "closing" axis first, then pop open the other.
// Expand: briefly squash vertically (scaleY → 0.85) while stretching wide (scaleX → 1.08), then settle.
// Collapse: mirror — squeeze wide first, then snap to the minimized tab.
const widgetVariants = {
  hidden: {
    scaleX: 0.4,
    scaleY: 0.7,
    opacity: 0,
    originX: 1, // anchor to right edge
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
      ease: [0.34, 1.56, 0.64, 1] as const, // spring-like overshoot
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

export function OrderStatusWidget() {
  const [tracking, setTracking] = useState<MockOrderTracking | null>(
    getMockOrderTracking,
  );
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const dragOffset = useRef({ x: 0, y: 0 });
  const isDragging = useRef(false);

  useEffect(() => {
    const refreshTracking = () => setTracking(getMockOrderTracking());
    window.addEventListener(ORDER_TRACKING_CHANGED_EVENT, refreshTracking);
    window.addEventListener(AUTH_STATE_CHANGED_EVENT, refreshTracking);
    return () => {
      window.removeEventListener(ORDER_TRACKING_CHANGED_EVENT, refreshTracking);
      window.removeEventListener(AUTH_STATE_CHANGED_EVENT, refreshTracking);
    };
  }, []);

  useEffect(() => {
    if (!tracking) return;

    const updateCountdown = () => {
      const elapsed = Math.floor((Date.now() - tracking.startedAt) / 1000);
      setRemainingSeconds(Math.max(0, tracking.durationSeconds - elapsed));
    };

    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [tracking]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!isDragging.current) return;
      setPosition({
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

  if (!tracking || remainingSeconds === null) return null;

  const isReady = remainingSeconds === 0;
  const minutes = Math.floor(remainingSeconds / 60).toString().padStart(2, "0");
  const seconds = (remainingSeconds % 60).toString().padStart(2, "0");

  return (
    <AnimatePresence mode="wait" initial={false}>
      {isMinimized ? (
        <motion.button
          key="minimized"
          type="button"
          className="group pointer-events-auto fixed right-0 top-1/2 z-40 flex h-28 w-14 -translate-y-1/2 items-center justify-center overflow-hidden rounded-l-2xl border border-r-0 border-border/80 bg-card/95 shadow-xl backdrop-blur-md transition-all duration-300 hover:w-24"
          onClick={() => setIsMinimized(false)}
          aria-label="Expand order status"
          variants={tabVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <span
            className={`absolute left-2 top-3 h-2.5 w-2.5 rounded-full transition-all duration-300 group-hover:left-3 ${
              isReady ? "bg-amber-400" : "bg-blue-500"
            }`}
          />
          <CookingPot className="h-5 w-5 text-muted-foreground transition-opacity duration-200 group-hover:opacity-0" />
          <span className="absolute left-8 whitespace-nowrap font-mono text-sm font-semibold text-foreground opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            {isReady ? "Ready" : `${minutes}:${seconds}`}
          </span>
        </motion.button>
      ) : (
        <motion.aside
          key="expanded"
          className="pointer-events-auto fixed right-4 top-24 z-40 w-[214px] select-none rounded-[24px] border border-border/80 bg-card/95 p-4 shadow-2xl backdrop-blur-md"
          style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
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
                x: event.clientX - position.x,
                y: event.clientY - position.y,
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
                setIsMinimized(true);
              }}
              onClick={(event) => {
                event.stopPropagation();
                setIsMinimized(true);
              }}
              aria-label="Close order status"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <span
              className={`h-4 w-4 rounded-full shadow-sm ${
                isReady ? "bg-amber-400 shadow-amber-300/60" : "bg-blue-500 shadow-blue-300/60"
              }`}
              aria-label={isReady ? "Ready" : "Preparing"}
            />
            <span className="text-sm font-semibold text-foreground">
              {isReady ? "Ready" : "Preparing"}
            </span>
          </div>

          <div className="mt-3 text-center">
            <p className="font-mono text-3xl font-semibold tracking-[0.06em] text-foreground">
              {isReady ? "00:00" : `${minutes}:${seconds}`}
            </p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Estimated wait
            </p>
          </div>

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
