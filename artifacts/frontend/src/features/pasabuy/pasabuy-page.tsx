import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { ArrowLeft } from "lucide-react";
import { PasabuyBanner } from "./pasabuy-banner";
import { PasabuyFlowPanel } from "./pasabuy-flow-panel";
import { PasabuyStatusBadge } from "./pasabuy-status-badge";
import {
  listMyRequests,
  subscribeToPasabuyChanges,
  type PasabuyRequestRecord,
} from "./pasabuy-mock-store";

function MyPasabuyList() {
  const [requests, setRequests] = useState<PasabuyRequestRecord[]>(() => listMyRequests());

  useEffect(() => subscribeToPasabuyChanges(() => setRequests(listMyRequests())), []);

  if (requests.length === 0) {
    return (
      <p className="rounded-2xl border border-border/80 bg-secondary/30 p-4 text-sm text-muted-foreground">
        You have no Pasabuy requests or deliveries yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {requests.map((request) => (
        <Link
          key={request.id}
          href={`/pasabuy/${request.id}`}
          className="flex items-center justify-between gap-3 rounded-2xl border border-border/80 bg-card/90 p-4 shadow-sm transition-colors hover:bg-secondary/30"
        >
          <div>
            <p className="text-sm font-medium text-foreground">{request.order.items}</p>
            <p className="mt-1 text-xs text-muted-foreground">Pasabuy #{request.reference}</p>
          </div>
          <PasabuyStatusBadge status={request.status} />
        </Link>
      ))}
    </div>
  );
}

export default function PasabuyPage() {
  const params = useParams<{ id?: string }>();

  if (params.id) {
    return (
      <main className="mx-auto w-full max-w-[720px] px-4 pb-14 pt-8 sm:px-6">
        <Link href="/pasabuy" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Pasabuy
        </Link>
        <PasabuyFlowPanel requestId={params.id} />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1000px] px-4 pb-14 pt-8 sm:px-6">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Pasabuy</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-foreground">Your Pasabuy</h1>

      <section className="mt-6">
        <MyPasabuyList />
      </section>

      <PasabuyBanner />
    </main>
  );
}
