import { useEffect, useState } from "react";
import { favoriteVendor, getVendorStorefront, unfavoriteVendor } from "@/features/auth/api";
import type { StorePageProps } from "./storepage";
import { toStorePageProps } from "./store-mapper";

export function useVendorStorefront(vendorId: string | null) {
  const [storeData, setStoreData] = useState<StorePageProps | null>(null);
  const [isNotFound, setIsNotFound] = useState(false);
  const [isFavoriteBusy, setIsFavoriteBusy] = useState(false);

  useEffect(() => {
    setStoreData(null);
    setIsNotFound(false);

    if (!vendorId) return;

    let cancelled = false;

    getVendorStorefront(vendorId)
      .then((vendor) => {
        if (!cancelled) setStoreData(toStorePageProps(vendor));
      })
      .catch(() => {
        if (!cancelled) setIsNotFound(true);
      });

    return () => {
      cancelled = true;
    };
  }, [vendorId]);

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

  return { storeData, isNotFound, isFavoriteBusy, handleToggleFavorite };
}
