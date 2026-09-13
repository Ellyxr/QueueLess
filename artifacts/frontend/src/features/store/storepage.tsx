import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Clock,
  GripVertical,
  Pencil,
  Star,
  X,
  MapPinHouseIcon,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StoreItemCard } from "@/components/store-item-card";

interface MenuItem {
  id: string;
  vendorId?: string;
  image: string;
  name: string;
  flavorProfile: string;
  price: number;
}

interface StoreCategory {
  categoryName: string;
  items: MenuItem[];
}

export interface StorePageProps {
  storeName: string;
  description?: string | null;
  campusLocation?: string | null;
  favoritesCount: number;
  isFavorited?: boolean;
  onToggleFavorite?: () => void;
  isFavoriteBusy?: boolean;
  eta: string;
  storeType: string;
  bannerImage: string;
  avatarInitial: string;
  categories: StoreCategory[];
  editable?: boolean;
  onReorderCategories?: (order: string[]) => void;
  onSaveStoreDetails?: (details: {
    name: string;
    description: string;
  }) => void | Promise<void>;
}

export default function StorePage({
  storeName,
  description,
  campusLocation,
  favoritesCount,
  isFavorited = false,
  onToggleFavorite,
  isFavoriteBusy = false,
  eta,
  storeType,
  bannerImage,
  avatarInitial,
  categories,
  editable = false,
  onReorderCategories,
  onSaveStoreDetails,
}: StorePageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [orderedCategories, setOrderedCategories] = useState(categories);
  const dragIndex = useRef<number | null>(null);
  const dragOverIndex = useRef<number | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [nameDraft, setNameDraft] = useState(storeName);
  const [descriptionDraft, setDescriptionDraft] = useState(description || "");
  const [isSavingDetails, setIsSavingDetails] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsLoading(false), 500);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    setOrderedCategories(categories);
  }, [categories]);

  useEffect(() => {
    setNameDraft(storeName);
    setDescriptionDraft(description || "");
  }, [storeName, description]);

  const handleDragStart = (index: number) => {
    dragIndex.current = index;
    setDraggingIndex(index);
  };

  const handleDragEnter = (index: number) => {
    if (dragIndex.current === null || dragIndex.current === index) return;
    dragOverIndex.current = index;
    setOrderedCategories((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex.current!, 1);
      next.splice(index, 0, moved);
      dragIndex.current = index;
      return next;
    });
  };

  const handleDragEnd = () => {
    dragIndex.current = null;
    dragOverIndex.current = null;
    setDraggingIndex(null);
    onReorderCategories?.(
      orderedCategories.map((category) => category.categoryName),
    );
  };

  const handleBack = () => {
    window.history.back();
  };

  if (isLoading) {
    return (
      <main className="min-h-dvh bg-background">
        <div className="flex min-h-dvh items-center justify-center">
          <div className="text-center text-muted-foreground">
            Loading store...
          </div>
        </div>
      </main>
    );
  }

  const hasMenu =
    orderedCategories.length > 0 &&
    orderedCategories.some((c) => c.items.length > 0);

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

            <div className="w-full max-w-xl text-center">
              {isEditingDetails ? (
                <div className="flex flex-col items-center gap-3">
                  <input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    placeholder="Store name"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-center text-2xl font-bold tracking-[-0.06em] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 sm:text-3xl"
                  />
                  <textarea
                    value={descriptionDraft}
                    onChange={(e) => setDescriptionDraft(e.target.value)}
                    placeholder="Tell buyers about your store"
                    rows={3}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setIsEditingDetails(false);
                        setNameDraft(storeName);
                        setDescriptionDraft(description || "");
                      }}
                      className="gap-1.5 rounded-full"
                    >
                      <X className="h-3.5 w-3.5" />
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={isSavingDetails || !nameDraft.trim()}
                      onClick={async () => {
                        setIsSavingDetails(true);
                        try {
                          await onSaveStoreDetails?.({
                            name: nameDraft.trim(),
                            description: descriptionDraft.trim(),
                          });
                          setIsEditingDetails(false);
                        } catch {
                          // keep the edit form open so the vendor can retry
                        } finally {
                          setIsSavingDetails(false);
                        }
                      }}
                      className="gap-1.5 rounded-full"
                    >
                      <Check className="h-3.5 w-3.5" />
                      {isSavingDetails ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-center gap-2">
                    <h1 className="text-3xl font-bold tracking-[-0.06em] text-foreground sm:text-4xl">
                      {storeName}
                    </h1>
                    {editable && onSaveStoreDetails && (
                      <button
                        type="button"
                        onClick={() => setIsEditingDetails(true)}
                        className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                        aria-label="Edit store name and description"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                    {onToggleFavorite ? (
                      <button
                        type="button"
                        onClick={onToggleFavorite}
                        disabled={isFavoriteBusy}
                        aria-pressed={isFavorited}
                        aria-label={
                          isFavorited
                            ? "Remove from favorites"
                            : "Add to favorites"
                        }
                        className={`flex items-center gap-1.5 rounded-full px-3 py-1 transition-colors disabled:opacity-60 ${
                          isFavorited
                            ? "bg-amber-400/15"
                            : "bg-secondary/60 hover:bg-secondary"
                        }`}
                      >
                        <Star
                          className={`h-4 w-4 ${isFavorited ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`}
                        />
                        <span className="text-sm font-semibold text-foreground">
                          {favoritesCount}
                        </span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-1.5 rounded-full bg-secondary/60 px-3 py-1">
                        <Star
                          className={`h-4 w-4 ${favoritesCount > 0 ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`}
                        />
                        <span className="text-sm font-semibold text-foreground">
                          {favoritesCount}
                        </span>
                      </div>
                    )}

                    <span className="text-sm text-muted-foreground">•</span>

                    <div className="flex items-center gap-1.5">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        {eta}
                      </span>
                    </div>

                    <span className="text-sm text-muted-foreground">•</span>

                    <span className="text-sm text-muted-foreground">
                      {storeType}
                    </span>
                  </div>
                  {description && (
                    <p className="mx-auto mt-4 p-6 max-w-xl text-sm rounded-sm bg-gray-100 text-muted-foreground">
                      {description}
                    </p>
                  )}
                  <p className="mt-2 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <MapPinHouseIcon className="h-4 w-4 shrink-0" />
                    <span>{campusLocation || "No Location"}</span>
                  </p>
                </>
              )}
            </div>
          </div>

          {!hasMenu ? (
            <div className="my-12 flex flex-col items-center justify-center rounded-[24px] border border-border/80 bg-card/50 py-16 text-center backdrop-blur-sm">
              <p className="text-lg font-medium text-foreground">
                Menu coming soon
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                This store doesn't have items available yet.
              </p>
            </div>
          ) : (
            <div className="space-y-10 py-8">
              {editable && (
                <div className="rounded-full border border-dashed border-primary/40 bg-primary/5 px-4 py-2 text-center text-xs font-medium text-primary">
                  Drag a category by its grip handle to reorder your menu
                </div>
              )}
              {orderedCategories.map(
                (category, index) =>
                  category.items.length > 0 && (
                    <section
                      key={category.categoryName}
                      draggable={editable}
                      onDragStart={() => handleDragStart(index)}
                      onDragEnter={() => handleDragEnter(index)}
                      onDragOver={(e) => e.preventDefault()}
                      onDragEnd={handleDragEnd}
                      className={
                        editable
                          ? `rounded-2xl transition-opacity ${draggingIndex === index ? "opacity-50" : ""}`
                          : undefined
                      }
                    >
                      <div className="mb-4 flex items-center gap-2">
                        {editable && (
                          <GripVertical className="h-5 w-5 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing" />
                        )}
                        <div>
                          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                            {category.categoryName}
                          </p>
                          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-foreground">
                            {category.categoryName}
                          </h2>
                        </div>
                      </div>

                      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-2">
                        {category.items.map((item) => (
                          <StoreItemCard
                            key={item.id}
                            id={item.id}
                            vendorId={item.vendorId}
                            image={item.image}
                            name={item.name}
                            flavorProfile={item.flavorProfile}
                            price={item.price}
                            storeName={storeName}
                          />
                        ))}
                      </div>
                    </section>
                  ),
              )}
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
  favoritesCount: 4,
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
  favoritesCount: 12,
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
          id: "Honey Cinnamon Latte",
          image:
            "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=800&q=80",
          name: "Honey Cinnamon Latte",
          flavorProfile: "Sweet, warm, smooth",
          price: 125,
        },
        {
          id: "Iced Caramel Macchiato",
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
  favoritesCount: 27,
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
          id: "Margherita Flatbread",
          image:
            "https://images.unsplash.com/photo-1548365328-9f547fb9587c?auto=format&fit=crop&w=800&q=80",
          name: "Margherita Flatbread",
          flavorProfile: "Herby, cheesy, oven-fired",
          price: 170,
        },
        {
          id: "Truffle Mushroom Slice",
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
          id: "Garlic Breadsticks",
          image:
            "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=800&q=80",
          name: "Garlic Breadsticks",
          flavorProfile: "Crispy, aromatic, buttery",
          price: 95,
        },
        {
          id: "Roasted Vegetables",
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
