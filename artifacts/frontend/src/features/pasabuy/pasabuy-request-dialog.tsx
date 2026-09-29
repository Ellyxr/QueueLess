import { useState } from "react";
import { CheckCircle2, Info, Loader2, MapPin } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PasabuyTerms } from "./pasabuy-terms";
import { pasabuyStatusLabel } from "./pasabuy-status-badge";
import {
  cancelRequest,
  createRequest,
  getCurrentPosition,
  type CreatedPasabuyRequest,
  type PasabuyOrderInfo,
} from "./pasabuy-api";
import { trackPasabuyRequest } from "./pasabuy-tracking";

type Coordinates = { latitude: number; longitude: number };

/**
 * The backend now computes the fee tier (in-campus/outside-campus) and the
 * ₱30/₱50 fee itself from real coordinates, checked against the vendor's
 * pickup location (rejecting anything more than 270m away) — there is no
 * client-side delivery-type picker anymore. This dialog captures the
 * dropoff location as a free-text label plus real coordinates from the
 * browser Geolocation API.
 */
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
  onCreated?: (request: CreatedPasabuyRequest) => void;
  onViewRequest?: (requestId: string) => void;
}) {
  const [dropoffLocation, setDropoffLocation] = useState("");
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedPasabuyRequest | null>(null);

  const reset = () => {
    setDropoffLocation("");
    setCoordinates(null);
    setIsLocating(false);
    setLocationError(null);
    setTermsAccepted(false);
    setIsSubmitting(false);
    setError(null);
    setCreated(null);
  };

  const handleShareLocation = async () => {
    setIsLocating(true);
    setLocationError(null);
    try {
      const position = await getCurrentPosition();
      setCoordinates(position);
    } catch (err) {
      setLocationError(err instanceof Error ? err.message : "Could not get your location.");
    } finally {
      setIsLocating(false);
    }
  };

  const canSubmit = termsAccepted && dropoffLocation.trim().length > 0 && coordinates !== null && !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit || !coordinates) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const record = await createRequest({
        orderId: order.orderId,
        dropoffLocation: dropoffLocation.trim(),
        dropoffLatitude: coordinates.latitude,
        dropoffLongitude: coordinates.longitude,
        termsAccepted: true,
      });
      trackPasabuyRequest(record.id, order.orderId);
      setCreated(record);
      onCreated?.(record);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create your Pasabuy request.");
    } finally {
      setIsSubmitting(false);
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
              <input
                value={dropoffLocation}
                onChange={(event) => setDropoffLocation(event.target.value)}
                placeholder="e.g. Dorm C, Room 214"
                maxLength={250}
                className="w-full rounded-xl border border-border bg-background p-3 text-sm outline-none"
              />

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full gap-1.5 rounded-full"
                onClick={handleShareLocation}
                disabled={isLocating}
              >
                {isLocating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <MapPin className="h-3.5 w-3.5" />
                )}
                {coordinates
                  ? "Location shared — tap to refresh"
                  : isLocating
                    ? "Getting your location..."
                    : "Share my current location"}
              </Button>

              {locationError && <p className="text-[11px] font-medium text-destructive">{locationError}</p>}
              {coordinates && !locationError && (
                <p className="text-[11px] text-muted-foreground">
                  Location captured ({coordinates.latitude.toFixed(5)}, {coordinates.longitude.toFixed(5)}).
                  Your delivery fee is calculated once you submit — it must be within{" "}
                  {"270"}m of the vendor's pickup point.
                </p>
              )}
              {!coordinates && !locationError && !isLocating && (
                <p className="text-[11px] text-muted-foreground">
                  We need your location to calculate the Pasabuy fee and confirm you're close enough
                  to the vendor.
                </p>
              )}
            </div>

            <div className="space-y-1.5 rounded-2xl border border-border/80 bg-secondary/30 p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Food order</span>
                <span className="font-medium text-emerald-600">Already paid</span>
              </div>
              <div className="flex items-center justify-between border-t border-border/80 pt-1.5">
                <span className="font-semibold text-foreground">Amount due now</span>
                <span className="font-semibold text-foreground">₱0</span>
              </div>
              <p className="flex items-start gap-1.5 pt-1 text-[11px] text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                You won't be charged yet. You'll pay the delivery fee only if a student accepts
                your Pasabuy request — the exact amount is confirmed on submit.
              </p>
            </div>

            <PasabuyTerms accepted={termsAccepted} onAcceptedChange={setTermsAccepted} />

            {error && <p className="text-xs text-destructive">{error}</p>}

            <DialogFooter>
              <Button onClick={handleSubmit} disabled={!canSubmit} className="rounded-full">
                {isSubmitting ? "Requesting..." : "Request Pasabuy"}
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
              <Row label="Order reference" value={created.id.slice(0, 8).toUpperCase()} />
              <Row label="Delivery location" value={created.dropoffLocation} />
              <Row
                label="Delivery zone"
                value={created.feeTier === "OUTSIDE_CAMPUS" ? "Outside campus" : "In campus"}
              />
              <Row label="Pasabuy fee" value={`₱${created.convenienceFee}`} />
              <Row label="Payment status" value="Not charged" />
              <Row label="Status" value={pasabuyStatusLabel(created.status)} />
            </div>

            <DialogFooter className="gap-2 sm:justify-between">
              <Button
                variant="outline"
                className="rounded-full"
                onClick={async () => {
                  try {
                    await cancelRequest(created.id, "Requester cancelled before a deliverer accepted");
                  } catch {
                    // ignore — the request view will reflect the real state on next load
                  }
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
