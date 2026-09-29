import { useEffect, useState } from "react";
import { Percent, Store } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { listActiveDeals, type ActiveDeal, type VendorTypeFilter } from "@/features/auth/api";

const DEALS_POLL_INTERVAL_MS = 30_000;

function discountedPrice(deal: ActiveDeal): number {
  const price = deal.product.price;
  return deal.discountType === "PERCENTAGE"
    ? price * (1 - deal.discountValue / 100)
    : Math.max(price - deal.discountValue, 0);
}

export function DealsBanner({ vendorType }: { vendorType: VendorTypeFilter }) {
  const [deals, setDeals] = useState<ActiveDeal[]>([]);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      listActiveDeals(vendorType)
        .then((data) => {
          if (!cancelled) setDeals(data);
        })
        .catch(() => {
          if (!cancelled) setDeals([]);
        });
    };
    refresh();
    const timer = window.setInterval(refresh, DEALS_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [vendorType]);

  if (deals.length === 0) return null;

  const scrollable = deals.length > 3;

  return (
    <section className="mt-8">
      <div className="mb-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Hot right now</p>
        <h3 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-foreground">Deals</h3>
      </div>

      <div
        className={cn(
          "gap-3",
          scrollable ? "flex overflow-x-auto pb-2" : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
        )}
      >
        {deals.map((deal) => (
          <Card
            key={deal.id}
            className={cn(
              "overflow-hidden border-border/80 bg-card/90 shadow-sm",
              scrollable && "w-[240px] shrink-0",
            )}
          >
            <div className="relative h-32 w-full">
              <img
                src={deal.product.imageUrl || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80"}
                alt={deal.product.name}
                className="h-full w-full object-cover"
              />
              <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-destructive px-2.5 py-1 text-[11px] font-bold text-destructive-foreground shadow">
                <Percent className="h-3 w-3" />
                {deal.discountType === "PERCENTAGE" ? `${Number(deal.discountValue)}% OFF` : `₱${Number(deal.discountValue)} OFF`}
              </span>
            </div>
            <CardContent className="space-y-1.5 p-3">
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Store className="h-3 w-3 shrink-0" /> {deal.vendor.businessName || deal.vendor.name}
              </p>
              <p className="truncate text-sm font-semibold text-foreground">{deal.product.name}</p>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-foreground">
                  ₱{discountedPrice(deal).toLocaleString("en-PH", { maximumFractionDigits: 2 })}
                </span>
                <span className="text-xs text-muted-foreground line-through">
                  ₱{Number(deal.product.price).toLocaleString("en-PH")}
                </span>
              </div>
              {deal.triggerType !== "NONE" && (
                <p className="text-[10px] text-muted-foreground">
                  {deal.triggerType === "MIN_QUANTITY" ? `Min. ${deal.triggerValue} qty` : `Min. ₱${deal.triggerValue} order`}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
