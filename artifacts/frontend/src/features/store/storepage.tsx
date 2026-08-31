import { useEffect, useState } from "react";
import { ArrowLeft, Clock, Star } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StoreItemCard } from "@/components/store-item-card";

interface MenuItem {
  image: string;
  name: string;
  flavorProfile: string;
  price: number;
}

interface StoreCategory {
  categoryName: string;
  items: MenuItem[];
}

interface StorePageProps {
  storeName: string;
  rating: number;
  eta: string;
  storeType: string;
  bannerImage: string;
  avatarInitial: string;
  categories: StoreCategory[];
}

export default function StorePage({
  storeName,
  rating,
  eta,
  storeType,
  bannerImage,
  avatarInitial,
  categories,
}: StorePageProps) {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsLoading(false), 500);
    return () => window.clearTimeout(timer);
  }, []);

  const handleBack = () => {
    window.history.back();
  };

  if (isLoading) {
    return (
      <main className="min-h-dvh bg-background">
        <div className="flex min-h-dvh items-center justify-center">
          <div className="text-center text-muted-foreground">Loading store...</div>
        </div>
      </main>
    );
  }

  const hasMenu = categories.length > 0 && categories.some((c) => c.items.length > 0);

  return (
    <main className="min-h-dvh bg-background">
      <div className="relative">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleBack}
          className="absolute left-4 top-4 z-20 rounded-full border border-border bg-background/80 text-foreground hover:bg-background md:left-6 md:top-6"
          aria-label="Go back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div className="relative h-64 w-full overflow-hidden bg-muted sm:h-72 md:h-80">
          <img
            src={bannerImage}
            alt={storeName}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
        </div>

        <div className="relative mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-10">
          <div className="flex flex-col items-center gap-6 -translate-y-1/2 pb-8">
            <Avatar className="h-28 w-28 border-4 border-background shadow-lg md:h-32 md:w-32">
              <AvatarImage src="" alt={storeName} />
              <AvatarFallback className="bg-primary text-2xl font-bold text-primary-foreground md:text-3xl">
                {avatarInitial}
              </AvatarFallback>
            </Avatar>

            <div className="text-center">
              <h1 className="text-3xl font-bold tracking-[-0.06em] text-foreground sm:text-4xl">
                {storeName}
              </h1>

              <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                <div className="flex items-center gap-1.5 rounded-full bg-secondary/60 px-3 py-1">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                  <span className="text-sm font-semibold text-foreground">{rating}</span>
                </div>

                <span className="text-sm text-muted-foreground">•</span>

                <div className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{eta}</span>
                </div>

                <span className="text-sm text-muted-foreground">•</span>

                <span className="text-sm text-muted-foreground">{storeType}</span>
              </div>
            </div>
          </div>

          {!hasMenu ? (
            <div className="my-12 flex flex-col items-center justify-center rounded-[24px] border border-border/80 bg-card/50 py-16 text-center backdrop-blur-sm">
              <p className="text-lg font-medium text-foreground">Menu coming soon</p>
              <p className="mt-2 text-sm text-muted-foreground">
                This store doesn't have items available yet.
              </p>
            </div>
          ) : (
            <div className="space-y-10 py-8">
              {categories.map((category) => (
                category.items.length > 0 && (
                  <section key={category.categoryName}>
                    <div className="mb-4">
                      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                        {category.categoryName}
                      </p>
                      <h2 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-foreground">
                        {category.categoryName}
                      </h2>
                    </div>

                    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-2">
                      {category.items.map((item) => (
                        <StoreItemCard
                          key={item.name}
                          image={item.image}
                          name={item.name}
                          flavorProfile={item.flavorProfile}
                          price={item.price}
                        />
                      ))}
                    </div>
                  </section>
                )
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

// Example store data with empty menu
export const emptyMenuStore: StorePageProps = {
  storeName: "Coming Soon Cafe",
  rating: 4.0,
  eta: "15-20 min",
  storeType: "Coffee & Snacks",
  bannerImage:
    "https://images.unsplash.com/photo-1511689534918-e1ffba33e330?auto=format&fit=crop&w=1200&q=80",
  avatarInitial: "C",
  categories: [],
};

// Example store data with 1 category
export const singleCategoryStore: StorePageProps = {
  storeName: "Elm Street Cafe",
  rating: 4.8,
  eta: "8-12 min",
  storeType: "Coffee & Snacks",
  bannerImage:
    "https://images.unsplash.com/photo-1511689534918-e1ffba33e330?auto=format&fit=crop&w=1200&q=80",
  avatarInitial: "E",
  categories: [
    {
      categoryName: "Beverages",
      items: [
        {
          image:
            "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=800&q=80",
          name: "Honey Cinnamon Latte",
          flavorProfile: "Sweet, warm, smooth",
          price: 125,
        },
        {
          image:
            "https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&w=800&q=80",
          name: "Iced Caramel Macchiato",
          flavorProfile: "Creamy, nutty, refreshing",
          price: 145,
        },
      ],
    },
  ],
};

// Example store data with 2 categories
export const dualCategoryStore: StorePageProps = {
  storeName: "Cinder Flatbread",
  rating: 4.9,
  eta: "16-22 min",
  storeType: "Fresh Oven",
  bannerImage:
    "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=1200&q=80",
  avatarInitial: "C",
  categories: [
    {
      categoryName: "Flatbreads",
      items: [
        {
          image:
            "https://images.unsplash.com/photo-1548365328-9f547fb9587c?auto=format&fit=crop&w=800&q=80",
          name: "Margherita Flatbread",
          flavorProfile: "Herby, cheesy, oven-fired",
          price: 170,
        },
        {
          image:
            "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80",
          name: "Truffle Mushroom Slice",
          flavorProfile: "Earthy, savory, rich",
          price: 185,
        },
      ],
    },
    {
      categoryName: "Sides",
      items: [
        {
          image:
            "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=800&q=80",
          name: "Garlic Breadsticks",
          flavorProfile: "Crispy, aromatic, buttery",
          price: 95,
        },
        {
          image:
            "https://images.unsplash.com/photo-1599888568694-13b8e9471fdb?auto=format&fit=crop&w=800&q=80",
          name: "Roasted Vegetables",
          flavorProfile: "Savory, charred, fresh",
          price: 110,
        },
      ],
    },
  ],
};
