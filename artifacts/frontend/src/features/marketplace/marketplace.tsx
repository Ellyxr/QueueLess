import {
  ArrowRight,
  Bell,
  ChevronRight,
  Clock3,
  MapPin,
  Search,
  ShoppingBag,
  Sparkles,
  Star,
  UserCircle2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const categories = [
  "Pizza",
  "Burgers",
  "Sushi",
  "Salads",
  "Noodles",
  "Bakery",
  "Coffee",
  "Desserts",
  "Healthy",
  "BBQ",
  "Vegan",
  "Wraps",
  "Pasta",
  "Thai",
  "Mexican",
  "Korean",
  "Seafood",
  "Bubble Tea",
  "Sandwiches",
  "Breakfast",
  "Ice Cream",
  "Snacks",
  "Chicken",
  "Rice Bowls",
  "Smoothies",
];

const featuredVendors = [
  {
    name: "North Loop Kitchen",
    eta: "18-22 min",
    rating: 4.9,
    type: "Community kitchen",
  },
  {
    name: "Sunset Bowl Co.",
    eta: "12-18 min",
    rating: 4.8,
    type: "Healthy picks",
  },
  {
    name: "Harbor Bites",
    eta: "20-25 min",
    rating: 4.7,
    type: "Student favorite",
  },
  {
    name: "Wild Ember Grill",
    eta: "14-20 min",
    rating: 4.9,
    type: "Chef specials",
  },
];

const localVendors = [
  {
    name: "Elm Street Cafe",
    eta: "8-12 min",
    rating: 4.8,
    type: "Coffee & snacks",
  },
  {
    name: "Cinder Flatbread",
    eta: "16-22 min",
    rating: 4.9,
    type: "Fresh oven",
  },
  {
    name: "Bamboo Lane",
    eta: "15-20 min",
    rating: 4.7,
    type: "Vegan & rice bowls",
  },
  { name: "Old Town Deli", eta: "10-15 min", rating: 4.7, type: "Sandwiches" },
];

function FoodCardSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-[20px] border border-border bg-card p-3 shadow-sm",
        compact && "p-2.5",
      )}
    >
      <div className="animate-pulse">
        <div className="mb-3 h-24 rounded-[16px] bg-muted" />
        <div className="mb-2 h-3 w-20 rounded-full bg-muted" />
        <div className="h-4 w-32 rounded-full bg-muted" />
        <div className="mt-4 flex items-center justify-between">
          <div className="h-3 w-16 rounded-full bg-muted" />
          <div className="h-3 w-14 rounded-full bg-muted" />
        </div>
      </div>
    </div>
  );
}

function VendorCard({
  name,
  eta,
  rating,
  type,
}: {
  name: string;
  eta: string;
  rating: number;
  type: string;
}) {
  return (
    <Card className="overflow-hidden border-card-border/80 bg-card/90 shadow-sm backdrop-blur-sm">
      <CardContent className="p-0">
        <div className="flex items-center justify-between border-b border-border/80 px-4 py-3">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
              {type}
            </p>
            <p className="mt-1 text-base font-semibold tracking-[-0.04em] text-card-foreground">
              {name}
            </p>
          </div>
          <span className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-secondary-foreground">
            <Star className="h-3 w-3 fill-current" />
            {rating}
          </span>
        </div>

        <div className="space-y-3 p-4">
          <div className="grid grid-cols-2 gap-2">
            <FoodCardSkeleton compact />
            <FoodCardSkeleton compact />
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Clock3 className="h-3.5 w-3.5" />
              <span>{eta}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 rounded-full px-3 py-1.5 text-xs"
            >
              View menu
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function MarketplacePage({
  username = "Jamie",
  isLoggedIn = true,
}: {
  username?: string;
  isLoggedIn?: boolean;
}) {
  return (
    <main className="mx-auto w-full max-w-[1440px] px-4 pb-14 pt-4 sm:px-6 lg:px-10">
      <div className="rounded-[28px] border border-border/80 bg-background/80 p-3 shadow-sm backdrop-blur-sm sm:p-4">
        <section className="mt-6 space-y-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Good afternoon
              </p>
              <h1 className="mt-3 text-4xl font-extrabold tracking-[-0.07em] text-foreground sm:text-5xl lg:text-[4rem]">
                Hello, {username}
              </h1>
            </div>

            <div className="flex items-center gap-2 rounded-full border border-border bg-secondary/60 px-3 py-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4 text-primary" />
              <span>National University - Laguna</span>
            </div>
          </div>

          <Card className="overflow-hidden border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-secondary/80 shadow-md">
            <CardContent className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-lg">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Limited time
                </p>
                <h2 className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-foreground sm:text-3xl">
                  Free delivery on campus orders over $20
                </h2>
              </div>

              <div className="flex items-center gap-3">
                <div className="rounded-full bg-background/80 px-3 py-1.5 text-sm font-medium text-foreground shadow-sm">
                  Use code{" "}
                  <span className="font-semibold text-primary">CAMPUS10</span>
                </div>
                <Button className="gap-2 rounded-full px-4 py-2">
                  Shop now
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Categories
              </p>
              <h3 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-foreground">
                Browse food
              </h3>
            </div>
            <Button
              variant="ghost"
              className="gap-1.5 rounded-full text-sm text-muted-foreground hover:bg-secondary"
            >
              View all
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {categories.map((category, index) => (
              <button
                key={category}
                type="button"
                className={cn(
                  "group rounded-[20px] border border-border bg-card p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md",
                  index % 2 === 0 ? "bg-secondary/50" : "bg-card",
                )}
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-lg text-primary">
                  {category.charAt(0)}
                </div>
                <p className="text-sm font-medium text-card-foreground">
                  {category}
                </p>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-10 grid gap-6 md:grid-cols-2">
          <div>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Featured
                </p>
                <h3 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-foreground">
                  Campus favorites
                </h3>
              </div>
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div className="space-y-4">
              {featuredVendors.map((vendor) => (
                <VendorCard key={vendor.name} {...vendor} />
              ))}
            </div>
          </div>

          <div>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Local picks
                </p>
                <h3 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-foreground">
                  Quick bites
                </h3>
              </div>
              <span className="rounded-full bg-secondary px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-secondary-foreground">
                24/7
              </span>
            </div>
            <div className="space-y-4">
              {localVendors.map((vendor) => (
                <VendorCard key={vendor.name} {...vendor} />
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
