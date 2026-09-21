import { cn } from "@/lib/utils";
import type { PasabuyPaymentStatus, PasabuyStatus } from "./pasabuy-mock-store";

const STATUS_LABELS: Record<PasabuyStatus, string> = {
  OPEN: "Waiting for deliverer",
  ACCEPTED: "Deliverer assigned",
  AWAITING_PAYMENT: "Awaiting payment",
  PAID: "Paid",
  PICKUP_READY: "Ready for pickup",
  PICKED_UP: "Picked up",
  DELIVERED: "Delivered",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
  PAYMENT_EXPIRED: "Payment expired",
  DISPUTED: "Problem reported",
};

const STATUS_CLASSES: Record<PasabuyStatus, string> = {
  OPEN: "bg-amber-500/10 text-amber-600",
  ACCEPTED: "bg-blue-500/10 text-blue-600",
  AWAITING_PAYMENT: "bg-orange-500/10 text-orange-600",
  PAID: "bg-emerald-500/10 text-emerald-600",
  PICKUP_READY: "bg-blue-500/10 text-blue-600",
  PICKED_UP: "bg-indigo-500/10 text-indigo-600",
  DELIVERED: "bg-emerald-500/10 text-emerald-600",
  COMPLETED: "bg-emerald-500/10 text-emerald-600",
  CANCELLED: "bg-slate-500/10 text-slate-600",
  EXPIRED: "bg-slate-500/10 text-slate-600",
  PAYMENT_EXPIRED: "bg-slate-500/10 text-slate-600",
  DISPUTED: "bg-destructive/10 text-destructive",
};

const PAYMENT_STATUS_LABELS: Record<PasabuyPaymentStatus, string> = {
  NOT_CHARGED: "Not charged",
  AWAITING_PAYMENT: "Payment required",
  PAID: "Pasabuy fee paid",
  PAYMENT_FAILED: "Payment failed",
  PAYMENT_EXPIRED: "Payment window expired",
  REFUNDED: "Refunded",
};

const PAYMENT_STATUS_CLASSES: Record<PasabuyPaymentStatus, string> = {
  NOT_CHARGED: "bg-secondary text-secondary-foreground",
  AWAITING_PAYMENT: "bg-orange-500/10 text-orange-600",
  PAID: "bg-emerald-500/10 text-emerald-600",
  PAYMENT_FAILED: "bg-destructive/10 text-destructive",
  PAYMENT_EXPIRED: "bg-slate-500/10 text-slate-600",
  REFUNDED: "bg-blue-500/10 text-blue-600",
};

export function pasabuyStatusLabel(status: PasabuyStatus): string {
  return STATUS_LABELS[status];
}

export function pasabuyPaymentStatusLabel(status: PasabuyPaymentStatus): string {
  return PAYMENT_STATUS_LABELS[status];
}

export function PasabuyStatusBadge({ status, className }: { status: PasabuyStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
        STATUS_CLASSES[status],
        className,
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export function PasabuyPaymentStatusBadge({ status, className }: { status: PasabuyPaymentStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
        PAYMENT_STATUS_CLASSES[status],
        className,
      )}
    >
      {PAYMENT_STATUS_LABELS[status]}
    </span>
  );
}
