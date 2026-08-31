import { Star } from "lucide-react";

interface MarketplacePromoCardProps {
  title: string;
  storeName: string;
  rating: number;
  price: number;
  image: string;
}

export function MarketplacePromoCard({
  title,
  storeName,
  rating,
  price,
  image,
}: MarketplacePromoCardProps) {
  return (
    <div className="relative overflow-hidden rounded-[28px] border border-border/80 bg-card shadow-md">
      <img src={image} alt={title} className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/35 to-black/10" />

      <div className="relative z-10 flex min-h-[260px] flex-col justify-between p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-white/80 backdrop-blur-sm">
            Vendor pick
          </span>

          <div className="flex items-center gap-1 rounded-full bg-background/15 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
            <Star className="h-3.5 w-3.5 fill-current" />
            {rating.toFixed(1)}
          </div>
        </div>

        <div className="flex items-end justify-between gap-4">
          <div className="max-w-[70%]">
            <p className="text-xs uppercase tracking-[0.18em] text-white/70">
              {storeName}
            </p>
            <h3 className="mt-2 text-3xl font-semibold tracking-[-0.06em] text-white sm:text-4xl">
              {title}
            </h3>
          </div>

          <div className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-right backdrop-blur-sm">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/70">
              From
            </p>
            <p className="mt-1 text-xl font-semibold text-white">
              ₱{price.toLocaleString("en-PH")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
