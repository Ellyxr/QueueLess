import { Maximize2, Minimize2, X } from "lucide-react";
import StorePage from "@/features/store/storepage";
import { useVendorStorefront } from "@/features/store/use-vendor-storefront";

export function StorefrontPane({
  vendorId,
  isExpanded,
  onToggleExpand,
  onClose,
}: {
  vendorId: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onClose: () => void;
}) {
  const { storeData, isNotFound, isFavoriteBusy, handleToggleFavorite } =
    useVendorStorefront(vendorId);

  return (
    <div className="relative h-full bg-background">
      <div className="sticky top-0 z-30 flex items-center justify-end gap-2 border-b border-border bg-background px-4 py-2 shadow-sm">
        <button
          type="button"
          onClick={onToggleExpand}
          aria-label={isExpanded ? "Collapse storefront" : "Expand storefront"}
          className="rounded-full border border-border bg-background p-2 text-foreground shadow-sm transition-colors hover:bg-secondary"
        >
          {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close storefront"
          className="rounded-full border border-border bg-background p-2 text-foreground shadow-sm transition-colors hover:bg-secondary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {isNotFound ? (
        <div className="flex min-h-[50vh] items-center justify-center px-4 text-center">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Store not found</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This store may no longer be available.
            </p>
          </div>
        </div>
      ) : !storeData ? (
        <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
          Loading store...
        </div>
      ) : (
        <StorePage
          {...storeData}
          onToggleFavorite={handleToggleFavorite}
          isFavoriteBusy={isFavoriteBusy}
          onBack={onClose}
          hideBackButton
        />
      )}
    </div>
  );
}
