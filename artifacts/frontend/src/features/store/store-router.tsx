import { useEffect, useState } from "react";
import { getVendorStorefront, type VendorStorefront } from "@/features/auth/api";
import StorePage, { type StorePageProps } from "./storepage";

function toStorePage(vendor: VendorStorefront): StorePageProps {
  const categories = new Map<string, StorePageProps["categories"][number]["items"]>();

  for (const product of vendor.products ?? []) {
    const categoryName = product.category?.trim() || "Menu";
    const items = categories.get(categoryName) ?? [];
    items.push({
      image:
        "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80",
      name: product.name,
      flavorProfile: product.description || "Freshly prepared",
      price: Number(product.price),
    });
    categories.set(categoryName, items);
  }

  return {
    storeName: vendor.name,
      description: vendor.description,
      campusLocation: vendor.campusLocation,
    rating: 0,
    eta: "15-20 min",
    storeType:
      vendor.vendorType === "STUDENT" ? "Student vendor" : "Campus vendor",
    bannerImage:
      "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80",
    avatarInitial: vendor.name.charAt(0).toUpperCase() || "S",
    categories: Array.from(categories, ([categoryName, items]) => ({
      categoryName,
      items,
    })),
  };
}

export function StoreRouter() {
  const [storeData, setStoreData] = useState<StorePageProps | null>(null);
  const [isNotFound, setIsNotFound] = useState(false);

  useEffect(() => {
    const vendorId = window.location.pathname.split("/").filter(Boolean).at(-1);

    if (!vendorId) {
      setIsNotFound(true);
      return;
    }

    getVendorStorefront(vendorId)
      .then((vendor) => setStoreData(toStorePage(vendor)))
      .catch(() => setIsNotFound(true));
  }, []);

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

  return <StorePage {...storeData} />;
}
