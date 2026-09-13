import { useEffect, useState } from "react";
import { favoriteVendor, getVendorStorefront, unfavoriteVendor } from "@/features/auth/api";
import StorePage, { type StorePageProps } from "./storepage";
import { toStorePageProps } from "./store-mapper";

export function StoreRouter() {
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [storeData, setStoreData] = useState<StorePageProps | null>(null);
  const [isNotFound, setIsNotFound] = useState(false);
  const [isFavoriteBusy, setIsFavoriteBusy] = useState(false);

  useEffect(() => {
    const id = window.location.pathname.split("/").filter(Boolean).at(-1);

    if (!id) {
      setIsNotFound(true);
      return;
    }

    setVendorId(id);
    getVendorStorefront(id)
      .then((vendor) => setStoreData(toStorePageProps(vendor)))
      .catch(() => setIsNotFound(true));
  }, []);

  const handleToggleFavorite = async () => {
    if (!vendorId || !storeData || isFavoriteBusy) return;
    setIsFavoriteBusy(true);
    const wasFavorited = storeData.isFavorited;
    setStoreData((prev) =>
      prev
        ? {
            ...prev,
            isFavorited: !wasFavorited,
            favoritesCount: prev.favoritesCount + (wasFavorited ? -1 : 1),
          }
        : prev,
    );
    try {
      const status = wasFavorited
        ? await unfavoriteVendor(vendorId)
        : await favoriteVendor(vendorId);
      setStoreData((prev) =>
        prev
          ? { ...prev, isFavorited: status.isFavoritedByMe, favoritesCount: status.favoritesCount }
          : prev,
      );
    } catch {
      setStoreData((prev) =>
        prev ? { ...prev, isFavorited: wasFavorited, favoritesCount: storeData.favoritesCount } : prev,
      );
    } finally {
      setIsFavoriteBusy(false);
    }
  };

  if (isNotFound) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">Store not found</h1>
          <p className="mt-2 text-muted-foreground">
            The store you&apos;re looking for doesn&apos;t exist.
          </p>
          <button
            type="button"
            onClick={() => (window.location.href = "/")}
            className="mt-6 rounded-full bg-primary px-6 py-2 font-medium text-primary-foreground hover:bg-primary/90"
          >
            Back to marketplace
          </button>
        </div>
      </main>
    );
  }

  if (!storeData) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading store...</div>
      </main>
    );
  }

  return (
    <StorePage
      {...storeData}
      onToggleFavorite={handleToggleFavorite}
      isFavoriteBusy={isFavoriteBusy}
    />
  );
}
