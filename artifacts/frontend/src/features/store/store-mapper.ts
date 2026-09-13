import type { VendorStorefront } from "@/features/auth/api";
import type { StorePageProps } from "./storepage";

type StoreCategory = StorePageProps["categories"][number];

export function sortCategoriesByOrder(
  categories: StoreCategory[],
  order?: string[] | null,
): StoreCategory[] {
  if (!order || order.length === 0) return categories;
  const rank = new Map(order.map((name, index) => [name, index]));
  return [...categories].sort((a, b) => {
    const rankA = rank.has(a.categoryName) ? rank.get(a.categoryName)! : Number.MAX_SAFE_INTEGER;
    const rankB = rank.has(b.categoryName) ? rank.get(b.categoryName)! : Number.MAX_SAFE_INTEGER;
    return rankA - rankB;
  });
}

export function formatAveragePrepTime(vendor: VendorStorefront): string {
  const prepTimes = (vendor.products ?? [])
    .map((product) => product.preparationTimeMinutes)
    .filter((minutes): minutes is number => typeof minutes === "number" && minutes > 0);

  if (prepTimes.length === 0) return "New store";

  const average = Math.round(
    prepTimes.reduce((sum, minutes) => sum + minutes, 0) / prepTimes.length,
  );
  return `~${average} min`;
}

export function toStorePageProps(vendor: VendorStorefront): StorePageProps {
  const categories = new Map<string, StoreCategory["items"]>();

  for (const product of vendor.products ?? []) {
    const categoryName = product.category?.trim() || "Menu";
    const items = categories.get(categoryName) ?? [];
    items.push({
      id: product.id,
      vendorId: vendor.id,
      image:
        "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80",
      name: product.name,
      flavorProfile: product.description || "Freshly prepared",
      price: Number(product.price),
    });
    categories.set(categoryName, items);
  }

  const orderedCategories = sortCategoriesByOrder(
    Array.from(categories, ([categoryName, items]) => ({ categoryName, items })),
    vendor.categoryOrder,
  );

  return {
    storeName: vendor.name,
    description: vendor.description,
    campusLocation: vendor.campusLocation,
    favoritesCount: vendor.favoritesCount ?? 0,
    isFavorited: vendor.isFavoritedByMe ?? false,
    eta: formatAveragePrepTime(vendor),
    storeType:
      vendor.vendorType === "STUDENT" ? "Student vendor" : "Campus vendor",
    bannerImage:
      "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80",
    avatarInitial: vendor.name.charAt(0).toUpperCase() || "S",
    categories: orderedCategories,
  };
}
