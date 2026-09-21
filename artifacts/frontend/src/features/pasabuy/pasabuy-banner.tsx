import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { ChevronRight, MapPin, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { PasabuyStatusBadge } from "./pasabuy-status-badge";
import { PasabuyAcceptDialog } from "./pasabuy-accept-dialog";
import { PasabuyEligibilityGate } from "./pasabuy-eligibility-gate";
import {
  getCurrentUserId,
  listOpenRequests,
  subscribeToPasabuyChanges,
  type PasabuyRequestRecord,
} from "./pasabuy-mock-store";
import { getEligibility, isEligibleToDeliver } from "./pasabuy-eligibility";

export function PasabuyBanner() {
  const [, setLocation] = useLocation();
  const [requests, setRequests] = useState<PasabuyRequestRecord[]>(() => listOpenRequests());
  const [acceptTarget, setAcceptTarget] = useState<PasabuyRequestRecord | null>(null);
  const [showGateFor, setShowGateFor] = useState<string | null>(null);
  const [, forceRefresh] = useState(0);

  useEffect(() => subscribeToPasabuyChanges(() => setRequests(listOpenRequests())), []);

  if (requests.length === 0) return null;

  const scrollable = requests.length > 3;
  const currentUserId = getCurrentUserId();

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
                  Pasabuy #{request.reference}
                </p>
                <PasabuyStatusBadge status={request.status} />
              </div>

              <p className="text-sm font-semibold text-foreground">{request.order.items}</p>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Store className="h-3.5 w-3.5 shrink-0" /> {request.order.vendorName}
              </p>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" /> {request.deliveryLocation}
              </p>

              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Requester: {request.requesterName}</span>
                <div className="text-right">
                  <span className="font-semibold text-foreground">₱{request.fee}</span>
                  <p className="text-[10px] text-muted-foreground">Charged once accepted</p>
                </div>
              </div>

              {showGateFor === request.id && !isEligibleToDeliver(getEligibility()) ? (
                <PasabuyEligibilityGate
                  onEligible={(eligible) => {
                    if (eligible) forceRefresh((n) => n + 1);
                  }}
                />
              ) : (
                <Button
                  className="w-full rounded-full"
                  disabled={request.requesterUserId === currentUserId}
                  onClick={() => {
                    if (isEligibleToDeliver(getEligibility())) {
                      setAcceptTarget(request);
                    } else {
                      setShowGateFor(request.id);
                    }
                  }}
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
          onAccepted={(updated) => {
            setAcceptTarget(null);
            setLocation(`/pasabuy/${updated.id}`);
          }}
        />
      )}
    </section>
  );
}
