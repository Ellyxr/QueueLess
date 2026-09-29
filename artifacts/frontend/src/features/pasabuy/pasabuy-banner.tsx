import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { ChevronRight, MapPin, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { PasabuyStatusBadge } from "./pasabuy-status-badge";
import { PasabuyAcceptDialog } from "./pasabuy-accept-dialog";
import { PasabuyEligibilityGate } from "./pasabuy-eligibility-gate";
import { listOpenRequests, PASABUY_POLL_INTERVAL_MS, type PasabuyAvailableRequest } from "./pasabuy-api";
import { getTermsAccepted, isEligibleToDeliver } from "./pasabuy-eligibility";
import { getPasabuyProfile } from "./pasabuy-api";

export function PasabuyBanner() {
  const [, setLocation] = useLocation();
  const [requests, setRequests] = useState<PasabuyAvailableRequest[]>([]);
  const [acceptTarget, setAcceptTarget] = useState<PasabuyAvailableRequest | null>(null);
  const [showGateFor, setShowGateFor] = useState<string | null>(null);
  const [, forceRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      // A 403 here means the browsing student's profile isn't verified yet —
      // simply keep showing no open requests rather than throwing.
      listOpenRequests()
        .then((data) => {
          if (!cancelled) setRequests(data);
        })
        .catch(() => {
          if (!cancelled) setRequests([]);
        });
    };
    refresh();
    const timer = window.setInterval(refresh, PASABUY_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  if (requests.length === 0) return null;

  const scrollable = requests.length > 3;

  return (
    <section className="mt-8">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Pasabuy</p>
          <h3 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-foreground">
            Students need a hand right now
          </h3>
        </div>
        <Link
          href="/pasabuy"
          className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          View all
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      <div
        className={cn(
          "gap-3",
          scrollable ? "flex overflow-x-auto pb-2" : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
        )}
      >
        {requests.map((request) => (
          <Card
            key={request.id}
            className={cn(
              "border-border/80 bg-card/90 shadow-sm",
              scrollable && "w-[280px] shrink-0",
            )}
          >
            <CardContent className="space-y-2.5 p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  Pasabuy #{request.id.slice(0, 8).toUpperCase()}
                </p>
                <PasabuyStatusBadge status={request.status} />
              </div>

              <p className="text-sm font-semibold text-foreground">{request.itemDescription}</p>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Store className="h-3.5 w-3.5 shrink-0" /> {request.relatedOrder.vendor.businessName || "Vendor"}
              </p>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" /> {request.pickupLocation}
              </p>

              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {request.feeTier === "OUTSIDE_CAMPUS" ? "Outside campus" : "In campus"}
                </span>
                <div className="text-right">
                  <span className="font-semibold text-foreground">₱{request.convenienceFee}</span>
                  <p className="text-[10px] text-muted-foreground">Charged once accepted</p>
                </div>
              </div>

              {showGateFor === request.id ? (
                <GatedAcceptButton
                  request={request}
                  onEligible={() => {
                    forceRefresh((n) => n + 1);
                    setShowGateFor(null);
                    setAcceptTarget(request);
                  }}
                />
              ) : (
                <Button
                  className="w-full rounded-full"
                  onClick={() => setShowGateFor(request.id)}
                >
                  Accept Pasabuy
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {acceptTarget && (
        <PasabuyAcceptDialog
          open
          onOpenChange={(open) => {
            if (!open) setAcceptTarget(null);
          }}
          request={acceptTarget}
          onAccepted={(updatedId) => {
            setAcceptTarget(null);
            setLocation(`/pasabuy/${updatedId}`);
          }}
        />
      )}
    </section>
  );
}

/**
 * Checks real eligibility before letting the accept dialog open; shows the
 * eligibility gate inline if the student isn't ready yet.
 */
function GatedAcceptButton({
  request,
  onEligible,
}: {
  request: PasabuyAvailableRequest;
  onEligible: () => void;
}) {
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPasabuyProfile()
      .then((profile) => {
        if (cancelled) return;
        if (isEligibleToDeliver(profile, getTermsAccepted())) {
          onEligible();
        } else {
          setChecked(true);
        }
      })
      .catch(() => {
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.id]);

  if (!checked) return null;

  return <PasabuyEligibilityGate onEligible={(eligible) => eligible && onEligible()} />;
}
