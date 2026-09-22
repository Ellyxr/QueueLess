import type { VendorStorefront } from "@/features/auth/api";
import { EXTRA_CATEGORY } from "@/lib/product-extras";
import type { StorePageProps, StoreScheduleRow } from "./storepage";

type StoreCategory = StorePageProps["categories"][number];

const WEEKDAY_LABELS: Record<string, string> = {
  MONDAY: "Mon",
  TUESDAY: "Tue",
  WEDNESDAY: "Wed",
  THURSDAY: "Thu",
  FRIDAY: "Fri",
  SATURDAY: "Sat",
};

const WEEKDAY_ORDER = Object.keys(WEEKDAY_LABELS);

function formatTimeLabel(time: string): string {
  const [hourStr, minuteStr] = time.split(":");
  const hour24 = Number(hourStr);
  const minute = Number(minuteStr);
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${minute.toString().padStart(2, "0")} ${period}`;
}

function buildScheduleRows(
  days: Array<{
    dayOfWeek: string;
    isOpen?: boolean;
    isEnabled?: boolean;
    openTime: string | null;
    closeTime: string | null;
  }>,
): StoreScheduleRow[] {
  const byDay = new Map(days.map((day) => [day.dayOfWeek, day]));
  return WEEKDAY_ORDER.map((dayOfWeek) => {
    const entry = byDay.get(dayOfWeek);
    const isActive = entry ? (entry.isOpen ?? entry.isEnabled ?? false) : false;
    return {
      dayLabel: WEEKDAY_LABELS[dayOfWeek],
      isActive,
      hoursLabel:
        isActive && entry?.openTime && entry?.closeTime
          ? `${formatTimeLabel(entry.openTime)} – ${formatTimeLabel(entry.closeTime)}`
          : "Closed",
    };
  });
}

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
    .filter((product) => product.category !== EXTRA_CATEGORY)
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
    if (product.category === EXTRA_CATEGORY) continue;
    const categoryName = product.category?.trim() || "Menu";
    const items = categories.get(categoryName) ?? [];
    items.push({
      id: product.id,
      vendorId: vendor.id,
      image:
        product.imageUrl ||
        "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80",
      name: product.name,
      flavorProfile: product.description || "Freshly prepared",
      price: Number(product.price),
      extras: (product.eligibleExtras ?? []).map((extra) => ({
        id: extra.id,
        name: extra.name,
        price: Number(extra.price),
      })),
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
    isOpenNow: vendor.isOpenNow,
    nextAvailableLabel: vendor.nextAvailableLabel,
    availabilitySchedule:
      vendor.availabilityDays && vendor.availabilityDays.length > 0
        ? buildScheduleRows(vendor.availabilityDays)
        : undefined,
    preorderEnabled: vendor.preorderEnabled,
    preorderSchedule:
      vendor.preorderEnabled && vendor.preorderAvailability && vendor.preorderAvailability.length > 0
        ? buildScheduleRows(vendor.preorderAvailability)
        : undefined,
  };
}
