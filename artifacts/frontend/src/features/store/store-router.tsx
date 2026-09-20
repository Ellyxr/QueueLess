import { useState } from "react";
import StorePage from "./storepage";
import { useVendorStorefront } from "./use-vendor-storefront";

export function StoreRouter() {
  const [vendorId] = useState<string | null>(() =>
    window.location.pathname.split("/").filter(Boolean).at(-1) ?? null,
  );
  const { storeData, isNotFound, isFavoriteBusy, handleToggleFavorite } =
    useVendorStorefront(vendorId);

  if (!vendorId || isNotFound) {
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
