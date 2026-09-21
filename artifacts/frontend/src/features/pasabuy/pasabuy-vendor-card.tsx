import { CheckCircle2 } from "lucide-react";
import { PasabuyStatusBadge } from "./pasabuy-status-badge";
import type { PasabuyRequestRecord } from "./pasabuy-mock-store";

/**
 * Read-only Pasabuy summary for a vendor's order queue. There's no vendor-facing
 * Pasabuy endpoint on the backend yet (see artifacts/api-server/AddressMe.md),
 * so this only renders from a request already loaded via the mock store.
 */
export function PasabuyVendorCard({ request }: { request: PasabuyRequestRecord }) {
  return (
    <div className="mt-2 space-y-1.5 rounded-2xl border border-border/80 bg-secondary/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          {request.delivererName ? "Deliverer Assigned" : "Pasabuy Order"}
        </span>
        <PasabuyStatusBadge status={request.status} />
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Requester</span>
        <span className="font-medium text-foreground">{request.requesterName}</span>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Deliverer</span>
        <span className="font-medium text-foreground">{request.delivererName || "Unassigned"}</span>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Pickup code</span>
        <span className="font-mono font-medium text-foreground">{request.pickupCode}</span>
      </div>
    </div>
  );
}
