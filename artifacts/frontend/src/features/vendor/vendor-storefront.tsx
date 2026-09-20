import { useEffect, useState } from 'react';
import { useRequireAuth } from '@/hooks/use-require-auth';
import {
  getMyVendor,
  getVendorStorefront,
  updateVendorStorefront,
  type VendorStorefront,
} from '@/features/auth/api';
import StorePage from '@/features/store/storepage';
import { toStorePageProps } from '@/features/store/store-mapper';

export default function VendorStorefrontPage() {
  useRequireAuth(['vendor', 'student_vendor', 'admin']);

  const [vendor, setVendor] = useState<VendorStorefront | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    getMyVendor()
      .then((vendorData) => getVendorStorefront(vendorData.id))
      .then(setVendor)
      .catch(() => setHasError(true))
      .finally(() => setIsLoading(false));
  }, []);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 2500);
  };

  const handleReorderCategories = async (order: string[]) => {
    if (!vendor) return;
    try {
      const updated = await updateVendorStorefront(vendor.id, { categoryOrder: order });
      setVendor((prev) => (prev ? { ...prev, categoryOrder: updated.categoryOrder } : prev));
      showToast('Category order saved.');
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : 'Unable to save category order.', 'error');
    }
  };

  const handleSaveStoreDetails = async (details: { name: string; description: string }) => {
    if (!vendor) return;
    try {
      const updated = await updateVendorStorefront(vendor.id, {
        name: details.name,
        description: details.description,
      });
      setVendor((prev) =>
        prev ? { ...prev, name: updated.name, description: updated.description } : prev,
      );
      showToast('Storefront details saved.');
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : 'Unable to save storefront details.', 'error');
      throw error;
    }
  };

  if (isLoading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading your storefront...</div>
      </main>
    );
  }

  if (hasError || !vendor) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">Storefront unavailable</h1>
          <p className="mt-2 text-muted-foreground">We couldn't load your storefront right now.</p>
        </div>
      </main>
    );
  }

  return (
    <div className="relative">
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 rounded-2xl px-4 py-3 text-sm font-medium shadow-xl backdrop-blur-md ${
            toast.type === 'success'
              ? 'border border-emerald-500/30 bg-emerald-950/80 text-emerald-200'
              : 'border border-destructive/30 bg-destructive/90 text-destructive-foreground'
          }`}
        >
          {toast.text}
        </div>
      )}
      <StorePage
        {...toStorePageProps(vendor)}
        editable
        onReorderCategories={handleReorderCategories}
        onSaveStoreDetails={handleSaveStoreDetails}
      />
    </div>
  );
}
