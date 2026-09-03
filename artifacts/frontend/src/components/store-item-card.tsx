import { useState } from "react";
import { motion } from "framer-motion";
import { Heart, Plus, Star } from "lucide-react";
import { addCartItem } from "@/features/cart/cart";

interface StoreItemCardProps {
  image: string;
  name: string;
  flavorProfile: string;
  price: number;
  storeName?: string;
}

export function StoreItemCard({
  image,
  name,
  flavorProfile,
  price,
  storeName = "North Loop Kitchen",
}: StoreItemCardProps) {
  const [isFavorited, setIsFavorited] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  const handleAddToCart = () => {
    if (isAdding) return;

    setIsAdding(true);
    addCartItem({ image, name, price, storeName });

    // Find the cart button in the AppShell.
    const cart = document.querySelector(
      "[data-cart-target]"
    ) as HTMLElement | null;

    if (!cart) {
      setIsAdding(false);
      return;
    }

    const card = document.querySelector(
      `[data-product="${CSS.escape(name)}"]`
    ) as HTMLElement | null;

    if (!card) {
      setIsAdding(false);
      return;
    }

    const cardRect = card.getBoundingClientRect();
    const cartRect = cart.getBoundingClientRect();

    // Create a temporary flying item.
    const flyingItem = document.createElement("div");

    flyingItem.style.position = "fixed";
    flyingItem.style.left = `${cardRect.left + cardRect.width / 2}px`;
    flyingItem.style.top = `${cardRect.top + 70}px`;
    flyingItem.style.width = "36px";
    flyingItem.style.height = "36px";
    flyingItem.style.borderRadius = "9999px";
    flyingItem.style.backgroundImage = `url("${image}")`;
    flyingItem.style.backgroundSize = "cover";
    flyingItem.style.backgroundPosition = "center";
    flyingItem.style.zIndex = "9999";
    flyingItem.style.pointerEvents = "none";
    flyingItem.style.boxShadow =
      "0 8px 24px rgba(0, 0, 0, 0.18)";

    document.body.appendChild(flyingItem);

    const animation = flyingItem.animate(
      [
        {
          transform: "translate(-50%, -50%) scale(1)",
          opacity: 1,
          offset: 0,
        },
        {
          transform: "translate(-50%, -50%) scale(1.15)",
          opacity: 1,
          offset: 0.2,
        },
        {
          transform: `translate(
            calc(-50% + ${cartRect.left + cartRect.width / 2 - (cardRect.left + cardRect.width / 2)}px),
            calc(-50% + ${cartRect.top + cartRect.height / 2 - (cardRect.top + 70)}px)
          ) scale(0.35)`,
          opacity: 0.15,
          offset: 1,
        },
      ],
      {
        duration: 650,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "forwards",
      }
    );

    animation.finished
      .catch(() => {})
      .finally(() => {
        flyingItem.remove();
        setIsAdding(false);

        // Give the cart a small feedback animation.
        cart.animate(
          [
            { transform: "scale(1)" },
            { transform: "scale(1.15)" },
            { transform: "scale(1)" },
          ],
          {
            duration: 250,
            easing: "ease-out",
          }
        );
      });
  };

  return (
    <motion.div
      data-product={name}
      initial={false}
      animate={{
        scale: isAdding ? 0.985 : 1,
      }}
      transition={{
        duration: 0.25,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="group overflow-hidden rounded-[20px] border border-border bg-background shadow-sm transition-[border-color,box-shadow] duration-300 ease-out hover:border-primary hover:shadow-md"
    >
      {/* Product image */}
      <div className="h-28 w-full overflow-hidden">
        <img
          src={image}
          alt={name}
          className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
        />
      </div>

      <div className="p-3">
        {/* Product information */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold tracking-[-0.04em] text-foreground">
              {name}
            </p>

            {/* Fixed-height description area */}
            <div className="relative mt-1 h-[42px] overflow-hidden">
              <p className="text-[11px] leading-[14px] text-muted-foreground">
                {flavorProfile}
              </p>

              {/* White fade at the bottom when content overflows */}
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-background via-background/90 to-transparent"
                aria-hidden="true"
              />
            </div>
          </div>

          <span className="shrink-0 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">
            ₱{price.toLocaleString("en-PH")}
          </span>
        </div>

        {/* Fixed position because description above has fixed height */}
        <div className="mt-2 flex h-4 items-center justify-between text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          <span>Popular</span>

          <span className="flex items-center gap-1">
            <Star className="h-3 w-3 fill-current text-amber-400" />
            4.8
          </span>
        </div>

        {/* Actions */}
        <div className="mt-3 flex h-9 items-center justify-between">
          <button
            type="button"
            onClick={() => setIsFavorited((current) => !current)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-all duration-200 hover:bg-destructive/10 hover:text-destructive active:scale-90"
            aria-label={
              isFavorited
                ? `Remove ${name} from favorites`
                : `Add ${name} to favorites`
            }
          >
            <Heart
              className={`h-4 w-4 transition-all duration-300 ${
                isFavorited
                  ? "fill-destructive text-destructive scale-110"
                  : ""
              }`}
            />
          </button>

          <motion.button
            type="button"
            onClick={handleAddToCart}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.94 }}
            transition={{
              duration: 0.2,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="group/cart relative flex h-9 items-center gap-1.5 overflow-hidden rounded-full bg-primary px-3 text-primary-foreground shadow-sm transition-shadow duration-300 hover:shadow-md"
            aria-label={`Add ${name} to cart`}
          >
            <Plus className="h-4 w-4 shrink-0 transition-transform duration-300 group-hover/cart:rotate-90" />

            <span className="grid grid-cols-[0fr] transition-[grid-template-columns] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/cart:grid-cols-[1fr]">
              <span className="overflow-hidden whitespace-nowrap text-xs font-medium">
                Add to Cart
              </span>
            </span>
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}