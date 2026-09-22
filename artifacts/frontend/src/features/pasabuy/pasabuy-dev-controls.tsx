import { useState } from "react";
import { FastForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { devAdvance, type PasabuyRequestRecord } from "./pasabuy-mock-store";
import { pasabuyStatusLabel } from "./pasabuy-status-badge";

const NEXT_STATUS: Partial<Record<PasabuyRequestRecord["status"], PasabuyRequestRecord["status"]>> = {
  OPEN: "AWAITING_PAYMENT",
  AWAITING_PAYMENT: "PAID",
  PAID: "PICKUP_READY",
  PICKUP_READY: "PICKED_UP",
  PICKED_UP: "DELIVERED",
  DELIVERED: "COMPLETED",
};

/**
 * SINGLE mock-only control for stepping a Pasabuy request through its states
 * without a real backend or a second logged-in user to play the other role.
 *
 * Every other Pasabuy component only reads/writes through `pasabuy-mock-store.ts`
 * using the same transitions a real user would trigger (accept / pickup / deliver
 * / confirm receipt). This is the one place that fakes "the other side" so a
 * solo tester can reach every UI state. Delete this component (and its one
 * usage in `pasabuy-flow-panel.tsx`) once the endpoints listed in
 * `artifacts/api-server/AddressMe.md` exist.
 */
export function PasabuyDevControls({
  request,
  onAdvanced,
}: {
  request: PasabuyRequestRecord;
  onAdvanced: (request: PasabuyRequestRecord) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const nextStatus = NEXT_STATUS[request.status];
  if (!nextStatus) return null;

  return (
    <div className="space-y-1.5 rounded-2xl border border-dashed border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <FastForward className="h-3.5 w-3.5 shrink-0" />
          <span>Dev preview — simulates the next step until the real flow is wired up.</span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0 rounded-full"
          onClick={() => {
            try {
              onAdvanced(devAdvance(request.id));
              setError(null);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not advance this request.");
            }
          }}
        >
          Skip to: {pasabuyStatusLabel(nextStatus)}
        </Button>
      </div>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
