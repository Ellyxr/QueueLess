import { useState } from "react";
import { CheckCircle2, Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PasabuyTerms } from "./pasabuy-terms";
import { pasabuyStatusLabel } from "./pasabuy-status-badge";
import {
  PASABUY_FEE,
  OUTSIDE_CAMPUS_RADIUS_METERS,
  cancelByRequester,
  createRequest,
  estimateMockDistanceMeters,
  type PasabuyDeliveryType,
  type PasabuyOrderInfo,
  type PasabuyRequestRecord,
} from "./pasabuy-mock-store";

export function PasabuyRequestDialog({
  open,
  onOpenChange,
  order,
  onCreated,
  onViewRequest,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: PasabuyOrderInfo;
  onCreated?: (request: PasabuyRequestRecord) => void;
  onViewRequest?: (requestId: string) => void;
}) {
  const [deliveryType, setDeliveryType] = useState<PasabuyDeliveryType>("IN_CAMPUS");
  const [address, setAddress] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<PasabuyRequestRecord | null>(null);

  const reset = () => {
    setDeliveryType("IN_CAMPUS");
    setAddress("");
    setTermsAccepted(false);
    setError(null);
    setCreated(null);
  };

  const distanceMeters = deliveryType === "OUTSIDE_CAMPUS" ? estimateMockDistanceMeters(address) : 0;
  const outOfRange = deliveryType === "OUTSIDE_CAMPUS" && address.trim().length > 0 && distanceMeters > OUTSIDE_CAMPUS_RADIUS_METERS;

  const canSubmit =
    termsAccepted &&
    (deliveryType === "IN_CAMPUS" || (address.trim().length > 0 && !outOfRange));

  const handleSubmit = () => {
    if (!canSubmit) return;
    setError(null);
    try {
      const record = createRequest({
        order,
        deliveryType,
        deliveryLocation:
          deliveryType === "IN_CAMPUS" ? "In Campus" : `Outside Campus — ${address.trim()}`,
      });
      setCreated(record);
      onCreated?.(record);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create your Pasabuy request.");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent>
        {!created ? (
          <>
            <DialogHeader>
              <DialogTitle>Request Pasabuy</DialogTitle>
              <DialogDescription>
                Another student will pick up and deliver this order for you.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2 rounded-2xl border border-border/80 bg-secondary/30 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Order
              </p>
              <p className="text-sm font-medium text-foreground">{order.items}</p>
              <p className="text-xs text-muted-foreground">{order.vendorName}</p>
              <p className="text-xs text-muted-foreground">Pickup: {order.pickupLocation}</p>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-foreground">Delivery location</p>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { type: "IN_CAMPUS" as const, label: "In-campus" },
                    { type: "OUTSIDE_CAMPUS" as const, label: "Outside campus" },
                  ]
                ).map((option) => (
                  <button
                    key={option.type}
                    type="button"
                    onClick={() => setDeliveryType(option.type)}
                    className={cn(
                      "rounded-xl border p-3 text-left text-sm transition-colors",
                      deliveryType === option.type ? "border-primary bg-primary/5" : "border-border",
                    )}
                  >
                    <p className="font-medium text-foreground">{option.label}</p>
                    <p className="text-xs text-muted-foreground">₱{PASABUY_FEE[option.type]}</p>
                  </button>
                ))}
              </div>

              {deliveryType === "OUTSIDE_CAMPUS" && (
                <div className="space-y-1.5">
                  <input
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    placeholder="Delivery address"
                    className="w-full rounded-xl border border-border bg-background p-3 text-sm outline-none"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Outside-campus delivery is available within {OUTSIDE_CAMPUS_RADIUS_METERS} meters of campus.
                  </p>
                  {outOfRange && (
                    <p className="text-[11px] font-medium text-destructive">
                      This address is about {distanceMeters}m from campus — outside the {OUTSIDE_CAMPUS_RADIUS_METERS}m
                      limit for Pasabuy delivery.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-1.5 rounded-2xl border border-border/80 bg-secondary/30 p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Food order</span>
                <span className="font-medium text-emerald-600">Already paid</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Pasabuy delivery ({deliveryType === "IN_CAMPUS" ? "in-campus" : "outside campus"})</span>
                <span className="font-medium text-foreground">₱{PASABUY_FEE[deliveryType]}</span>
              </div>
              <div className="flex items-center justify-between border-t border-border/80 pt-1.5">
                <span className="font-semibold text-foreground">Amount due now</span>
                <span className="font-semibold text-foreground">₱0</span>
              </div>
              <p className="flex items-start gap-1.5 pt-1 text-[11px] text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                You won't be charged yet. You'll pay only if a student accepts your Pasabuy request.
              </p>
            </div>

            <PasabuyTerms accepted={termsAccepted} onAcceptedChange={setTermsAccepted} />

            {error && <p className="text-xs text-destructive">{error}</p>}

            <DialogFooter>
              <Button onClick={handleSubmit} disabled={!canSubmit} className="rounded-full">
                Request Pasabuy
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                Pasabuy request created
              </DialogTitle>
              <DialogDescription>
                We're looking for a student to pick up your order. Your food has already been
                paid for — the Pasabuy fee hasn't been charged.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2 rounded-2xl border border-border/80 bg-secondary/30 p-3 text-sm">
              <Row label="Order reference" value={created.reference} />
              <Row label="Delivery location" value={created.deliveryLocation} />
              <Row label="Pasabuy fee" value={`₱${created.fee}`} />
              <Row label="Payment status" value="Not charged" />
              <Row label="Status" value={pasabuyStatusLabel(created.status)} />
              <Row label="Requester" value={created.requesterName} />
              <Row label="Deliverer" value="Unassigned" />
            </div>

            <DialogFooter className="gap-2 sm:justify-between">
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => {
                  cancelByRequester(created.id);
                  onOpenChange(false);
                  reset();
                }}
              >
                Cancel Request
              </Button>
              <Button
                onClick={() => {
                  const id = created.id;
                  onOpenChange(false);
                  reset();
                  onViewRequest?.(id);
                }}
                className="rounded-full"
              >
                View Pasabuy
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-xs font-medium text-foreground">{value}</span>
    </div>
  );
}
