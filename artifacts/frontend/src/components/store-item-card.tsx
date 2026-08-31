import { useState } from "react";
import { Heart, Plus, Star } from "lucide-react";

interface StoreItemCardProps {
  image: string;
  name: string;
  flavorProfile: string;
  price: number;
}

export function StoreItemCard({
  image,
  name,
  flavorProfile,
  price,
}: StoreItemCardProps) {
  const [isFavorited, setIsFavorited] = useState(false);
  const [isHovering, setIsHovering] = useState(false);

  return (
    <div className="overflow-hidden rounded-[20px] border border-border bg-background shadow-sm">
      <img src={image} alt={name} className="h-28 w-full object-cover" />

      <div className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold tracking-[-0.04em] text-foreground">
              {name}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {flavorProfile}
            </p>
          </div>
          <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">
            ₱{price.toLocaleString("en-PH")}
          </span>
        </div>

        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          <span>Popular</span>
          <span className="flex items-center gap-1">
            <Star className="h-3 w-3 fill-current text-amber-400" />
            4.8
          </span>
        </div>

        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={() => setIsFavorited((current) => !current)}
            className="flex items-center justify-center text-muted-foreground transition-colors duration-300 hover:text-destructive"
            aria-label="Toggle favorite"
          >
            <Heart
              className={`h-4 w-4 transition-all duration-300 ${
                isFavorited ? "fill-destructive text-destructive" : ""
              }`}
            />
          </button>

          <button
            type="button"
            className="group relative flex h-9 items-center gap-1.5 rounded-full bg-primary px-3 text-primary-foreground shadow-sm transition-all duration-300 ease-out"
            aria-label="Add to cart"
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span className="grid grid-cols-[0fr] transition-all duration-300 ease-out group-hover:grid-cols-[1fr]">
              <span className="overflow-hidden whitespace-nowrap text-xs font-medium">
                Add to Cart
              </span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
