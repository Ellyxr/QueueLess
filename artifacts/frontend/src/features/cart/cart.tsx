import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Clock3,
  MapPin,
  Minus,
  Plus,
  ShoppingBag,
  Trash2,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export interface CartOption {
  name: string;
  price: number;
}

export interface CartItem {
  id: string;
  storeName: string;
  name: string;
  image: string;
  price: number;
  quantity: number;
  options: CartOption[];
}

export const CART_CHANGED_EVENT = "queueless-cart-changed";
const CART_STORAGE_KEY_PREFIX = "queueless-cart";

function getCartStorageKey(): string | null {
  const storedUser = localStorage.getItem("user");
  if (!storedUser) return null;

  try {
    const user = JSON.parse(storedUser) as { id?: string; email?: string };
    const userKey = user.id || user.email;
    return userKey ? `${CART_STORAGE_KEY_PREFIX}:${userKey}` : null;
  } catch {
    return null;
  }
}

export function getCartItems(): CartItem[] {
  const storageKey = getCartStorageKey();
  if (!storageKey) return [];

  try {
    const storedCart = localStorage.getItem(storageKey);
    return storedCart ? (JSON.parse(storedCart) as CartItem[]) : [];
  } catch {
    return [];
  }
}

export function saveCartItems(items: CartItem[]) {
  const storageKey = getCartStorageKey();
  if (!storageKey) return;

  localStorage.setItem(storageKey, JSON.stringify(items));
  window.dispatchEvent(new Event(CART_CHANGED_EVENT));
}

export function addCartItem(
  item: Omit<CartItem, "id" | "quantity" | "options">,
) {
  const items = getCartItems();
  const existingItem = items.find(
    (cartItem) =>
      cartItem.name === item.name && cartItem.storeName === item.storeName,
  );

  if (existingItem) {
    existingItem.quantity += 1;
  } else {
    items.push({
      ...item,
      id: `${item.storeName}-${item.name}`,
      quantity: 1,
      options: [],
    });
  }

  saveCartItems(items);
}

export function cartItemTotal(item: CartItem) {
  return (
    (item.price +
      item.options.reduce((total, option) => total + option.price, 0)) *
    item.quantity
  );
}

const currency = (amount: number) => `₱${amount.toLocaleString("en-PH")}`;

export default function CartPage() {
  const [items, setItems] = useState<CartItem[]>(getCartItems);
  const [delivery, setDelivery] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoApplied, setPromoApplied] = useState(false);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);

  useEffect(() => {
    const refreshCart = () => setItems(getCartItems());
    window.addEventListener(CART_CHANGED_EVENT, refreshCart);
    return () => window.removeEventListener(CART_CHANGED_EVENT, refreshCart);
  }, []);

  const subtotal = useMemo(
    () => items.reduce((total, item) => total + cartItemTotal(item), 0),
    [items],
  );
  const promoDiscount = promoApplied ? 10 : 0;
  const convenienceFee = items.length ? 5 : 0;
  const deliveryFee = delivery && items.length ? 35 : 0;
  const total = subtotal - promoDiscount + convenienceFee + deliveryFee;
  const storeName = items[0]?.storeName ?? "North Loop Kitchen";

  const updateQuantity = (id: string, change: number) => {
    const nextItems = items
      .map((item) =>
        item.id === id ? { ...item, quantity: item.quantity + change } : item,
      )
      .filter((item) => item.quantity > 0);
    setItems(nextItems);
    saveCartItems(nextItems);
  };

  const toggleOption = (id: string, option: CartOption) => {
    const nextItems = items.map((item) => {
      if (item.id !== id) return item;
      const hasOption = item.options.some(
        (current) => current.name === option.name,
      );
      return {
        ...item,
        options: hasOption
          ? item.options.filter((current) => current.name !== option.name)
          : [...item.options, option],
      };
    });
    setItems(nextItems);
    saveCartItems(nextItems);
  };

  const submitOrder = async () => {
    if (isSubmitting || !items.length) return;
    setIsSubmitting(true);
    await new Promise((resolve) => window.setTimeout(resolve, 700));
    setIsConfirmed(true);
    saveCartItems([]);
  };

  if (isConfirmed) {
    return (
      <main className="mx-auto flex min-h-[70dvh] w-full max-w-2xl items-center justify-center px-4 py-12">
        <section className="w-full rounded-[28px] border border-emerald-500/30 bg-card p-8 text-center shadow-md sm:p-12">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white">
            <Check className="h-8 w-8" />
          </div>
          <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-600">
            Order submitted
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-0.06em] text-foreground">
            Your food is on its way.
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
            {storeName} has received your order. Pick it up at the Student
            Center when it is ready.
          </p>
          <div className="mx-auto mt-8 max-w-sm rounded-2xl bg-secondary/60 p-4 text-left text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Order total</span>
              <strong>{currency(total)}</strong>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-muted-foreground">Estimated wait</span>
              <strong>12-18 min</strong>
            </div>
          </div>
          <Button
            className="mt-8 rounded-full"
            onClick={() => (window.location.href = "/")}
          >
            Continue browsing
          </Button>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
      <button
        type="button"
        onClick={() => window.history.back()}
        className="mb-7 flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to browsing
      </button>
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
            Checkout
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-0.06em] text-foreground sm:text-4xl">
            Ready when you are.
          </h1>
        </div>
        {!!items.length && (
          <div className="text-left sm:text-right">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground sm:justify-end">
              <MapPin className="h-4 w-4 text-primary" /> {storeName}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground sm:justify-end">
              <Clock3 className="h-3.5 w-3.5" /> Pickup at Student Center •
              12-18 min
            </p>
          </div>
        )}
      </div>

      {!items.length ? (
        <section className="rounded-3xl border border-dashed border-border bg-card/70 px-6 py-16 text-center">
          <ShoppingBag className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-4 text-xl font-semibold">Your cart is empty</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Add something delicious from a campus shop to get started.
          </p>
          <Button
            className="mt-6 rounded-full"
            onClick={() => (window.location.href = "/")}
          >
            Browse shops
          </Button>
        </section>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-4">
            <section className="rounded-3xl border border-border/80 bg-card p-4 shadow-sm sm:p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-semibold">Your order</h2>
                <span className="text-xs text-muted-foreground">
                  {items.reduce((sum, item) => sum + item.quantity, 0)} items
                </span>
              </div>
              <div className="divide-y divide-border/70">
                {items.map((item) => {
                  const isExpanded = expandedItem === item.id;
                  return (
                    <div key={item.id} className="py-4 first:pt-0 last:pb-0">
                      <div className="flex gap-3">
                        <img
                          src={item.image}
                          alt=""
                          className="h-16 w-16 rounded-xl object-cover"
                        />
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() =>
                            setExpandedItem(isExpanded ? null : item.id)
                          }
                        >
                          <p className="font-semibold text-foreground">
                            {item.name}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.options.length
                              ? item.options
                                  .map((option) => option.name)
                                  .join(", ")
                              : "Tap to customize"}
                          </p>
                        </button>
                        <div className="text-right">
                          <p className="font-semibold">
                            {currency(cartItemTotal(item))}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              updateQuantity(item.id, -item.quantity);
                            }}
                            className="mt-2 text-muted-foreground hover:text-destructive"
                            aria-label={`Remove ${item.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <div className="flex items-center rounded-full border border-border">
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.id, -1)}
                            className="flex h-8 w-8 items-center justify-center"
                            aria-label="Decrease quantity"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="w-7 text-center text-sm font-semibold">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.id, 1)}
                            className="flex h-8 w-8 items-center justify-center"
                            aria-label="Increase quantity"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedItem(isExpanded ? null : item.id)
                          }
                          className="flex items-center gap-1 text-xs font-semibold text-primary p-2 rounded-md hover:bg-primary/10 transition-colors duration-300 "
                        >
                          Edit options{" "}
                          <ChevronDown
                            className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          />
                        </button>
                      </div>
                      <div
                        className={`grid transition-all duration-500 ease-in-out ${
                          isExpanded
                            ? "mt-4 grid-rows-[1fr] opacity-100 translate-y-0"
                            : "mt-0 grid-rows-[0fr] opacity-0 -translate-y-4"
                        }`}
                      >
                        <div className="overflow-hidden">
                          <div className="rounded-xl bg-secondary/60 p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                              Extra options
                            </p>

                            {[
                              { name: "Extra Sauce", price: 15 },
                              { name: "Chili crisp", price: 10 },
                            ].map((option) => (
                              <label
                                key={option.name}
                                className="mt-3 flex cursor-pointer items-center justify-between text-sm"
                              >
                                <span>
                                  {option.name}{" "}
                                  <span className="text-muted-foreground">
                                    +{currency(option.price)}
                                  </span>
                                </span>

                                <input
                                  type="checkbox"
                                  checked={item.options.some(
                                    (current) => current.name === option.name,
                                  )}
                                  onChange={() => toggleOption(item.id, option)}
                                  className="h-4 w-4 accent-primary"
                                />
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          <div className="space-y-2 lg:sticky lg:top-28">
            {/* Request Pasabuy */}
            <button
              type="button"
              onClick={() => setDelivery(!delivery)}
              className={`group relative flex w-full items-center justify-between overflow-hidden rounded-[20px] border p-4 text-left hover:border hover:border-primary transition-colors duration-500 ${
                delivery
                  ? "border-primary bg-primary text-accent "
                  : "border-border bg-card hover:bg-primary/10"
              }`}
            >
              {/* Default state */}
              <span
                className={`flex items-center gap-3 transition-all duration-700 ease-in-out ${
                  delivery
                    ? "translate-x-full opacity-0"
                    : "translate-x-0 opacity-100"
                }`}
              >
                <Truck className="h-5 w-5 text-primary" />

                <span>
                  <strong className="block text-md">Request Pasabuy</strong>
                  <span className="text-xs opacity-80">
                    Estimated arrival in 25-35 min
                  </span>
                </span>
              </span>

              {/* Selected state */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-4">
                {/* Truck + trailing dots — slides in from left on active */}
                <span
                  className={`flex items-center gap-1.5 transition-all duration-700 ease-in-out ${
                    delivery
                      ? "translate-x-0 opacity-100"
                      : "-translate-x-full opacity-0"
                  }`}
                >
                  {/* Trailing dots beside the truck */}
                  <span className="flex items-end gap-[2px]">
                    <span className="mb-2 h-2 w-2 animate-bounce rounded-full bg-accent [animation-delay:0ms]" />
                    <span className="mb-1 h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:150ms]" />
                    <span className="mb-0 h-1 w-1 animate-bounce rounded-full bg-accent [animation-delay:300ms]" />
                  </span>
                  <Truck className="h-5 w-5 text-accent" />
                </span>

                {/* Selected text + price — slides in from right on active */}
                <span
                  className={`flex items-center gap-4 transition-all duration-700 ease-in-out ${
                    delivery
                      ? "translate-x-0 opacity-100"
                      : "translate-x-full opacity-0"
                  }`}
                >
                  <span className="text-right">
                    <strong className="block text-md">Pasabuy Requested</strong>
                    <span className="text-xs opacity-80">
                      Looking for runners...
                    </span>
                  </span>
                </span>
              </div>

              {/* Default price */}
              <span
                className={`ml-auto text-sm font-semibold transition-all duration-500 ease-in-out ${
                  delivery
                    ? "translate-x-4 opacity-0"
                    : "translate-x-0 opacity-100"
                }`}
              >
                +₱35
              </span>
            </button>

            {/* Promo code */}
            <div className="flex items-center rounded-[20px] border border-border bg-card px-4 py-1">
              <input
                value={promoCode}
                onChange={(event) => {
                  setPromoCode(event.target.value);
                  setPromoApplied(false);
                }}
                placeholder="Promo code"
                className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />

              <button
                type="button"
                onClick={() =>
                  setPromoApplied(promoCode.trim().toUpperCase() === "CAMPUS10")
                }
                className="px-2 py-2 text-xs font-bold text-primary"
              >
                Apply
              </button>
            </div>

            {/* Checkout / Order Summary */}
            <section className="h-fit rounded-3xl border border-border/80 bg-card p-5 shadow-sm">
              <h2 className="font-semibold">Order summary</h2>

              <div className="mt-5 space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Order amount</span>
                  <span>{currency(subtotal)}</span>
                </div>

                {promoApplied && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Promo code</span>
                    <span>-{currency(promoDiscount)}</span>
                  </div>
                )}

                <div className="flex justify-between">
                  <span className="text-muted-foreground">Convenience fee</span>
                  <span>{currency(convenienceFee)}</span>
                </div>

                {delivery && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Delivery fee</span>
                    <span>{currency(deliveryFee)}</span>
                  </div>
                )}
              </div>

              <div className="my-5 border-t border-border" />

              <div className="flex items-end justify-between">
                <span className="font-semibold">Total amount</span>

                <span className="text-2xl font-bold tracking-[-0.04em]">
                  {currency(total)}
                </span>
              </div>

              <Button
                type="button"
                disabled={isSubmitting}
                onClick={submitOrder}
                className="mt-5 w-full rounded-full"
              >
                {isSubmitting ? "Submitting..." : "Order Now"}
              </Button>

              <p className="mt-3 text-center text-[11px] text-muted-foreground">
                Your order is submitted securely to the shop.
              </p>
            </section>
          </div>
        </div>
      )}
    </main>
  );
}
