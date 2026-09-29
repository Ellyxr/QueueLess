import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasabuyStatusBadge } from "./pasabuy-status-badge";
import {
  getVendorOrderPasabuy,
  verifyVendorPickupCode,
  type PasabuyVendorOrderInfo,
} from "./pasabuy-api";

/**
 * Vendor-facing Pasabuy summary for an order, backed by the real
 * `GET /pasabuy/vendor/orders/:orderId` + `POST .../verify-pickup` endpoints.
 * The vendor enters the 6-digit code the deliverer shows them in person.
 */
export function PasabuyVendorCard({ orderId }: { orderId: string }) {
  const [info, setInfo] = useState<PasabuyVendorOrderInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [code, setCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);

  const refresh = () => {
    getVendorOrderPasabuy(orderId)
      .then((data) => {
        setInfo(data);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load Pasabuy info."))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    setIsLoading(true);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  if (isLoading) {
    return (
      <div className="mt-2 flex items-center gap-2 rounded-2xl border border-border/80 bg-secondary/30 p-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading Pasabuy info...
      </div>
    );
  }

  if (!info?.pasabuy) {
    return null;
  }

  const { pasabuy } = info;
  const canVerify = pasabuy.status === "PAID" && pasabuy.paymentStatus === "PAID" && !pasabuy.pickupVerifiedAt;

  const handleVerify = async () => {
    if (code.trim().length !== 6 || isVerifying) return;
    setIsVerifying(true);
    setError(null);
    try {
      await verifyVendorPickupCode(orderId, code.trim());
      setVerified(true);
      setCode("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify that code.");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="mt-2 space-y-1.5 rounded-2xl border border-border/80 bg-secondary/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          {pasabuy.deliverer ? "Deliverer Assigned" : "Pasabuy Order"}
        </span>
        <PasabuyStatusBadge status={pasabuy.status} />
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Deliverer</span>
        <span className="font-medium text-foreground">{pasabuy.deliverer?.fullName || "Unassigned"}</span>
      </div>

      {pasabuy.pickupCode && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Pickup code on file</span>
          <span className="font-mono font-medium text-foreground">{pasabuy.pickupCode}</span>
        </div>
      )}

      {canVerify && (
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center gap-2">
            <Input
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="6-digit code"
              maxLength={6}
              className="text-sm"
            />
            <Button
              type="button"
              size="sm"
              className="shrink-0 rounded-full"
              disabled={code.length !== 6 || isVerifying}
              onClick={handleVerify}
            >
              {isVerifying ? "Verifying..." : "Verify Pickup"}
            </Button>
          </div>
          {error && <p className="text-[11px] text-destructive">{error}</p>}
        </div>
      )}

      {verified && (
        <p className="text-[11px] font-medium text-emerald-600">Pickup verified — ready for the deliverer.</p>
      )}
      {pasabuy.pickupVerifiedAt && !verified && (
        <p className="text-[11px] text-muted-foreground">Pickup was already verified.</p>
      )}
    </div>
  );
}
