import { useEffect, useRef, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Megaphone,
  Menu as MenuIcon,
  PackageCheck,
  ShoppingBag,
  Store,
  Plus,
  Pencil,
  Trash2,
  X,
  AlertCircle,
  CheckCircle2,
  Upload,
  Search,
  Eye,
  Send,
  Loader2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  ChartContainer,
  type ChartConfig,
} from '@/components/ui/chart';
import { Bar, BarChart } from 'recharts';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { createPortal } from 'react-dom';
import { useLocation } from 'wouter';
import { useRequireAuth } from '@/hooks/use-require-auth';
import {
  createProduct,
  deleteProduct,
  getVendorDashboard,
  getMyVendor,
  getVendorStorefront,
  getVendorOrderQueue,
  updateProduct,
  updateVendorStorefront,
  updateVendorPreorderAvailability,
  updateVendorAvailability,
  updateOrderStatus,
  payoutVendorBalance,
  uploadProductImage,
  type VendorProduct,
  type VendorDashboard,
  type VendorStorefront,
  type VendorQueueOrder,
  type Weekday,
} from '@/features/auth/api';
import { EXTRA_CATEGORY } from '@/lib/product-extras';
import { PasabuyVendorCard } from '@/features/pasabuy/pasabuy-vendor-card';
import { getActiveRequestForOrder } from '@/features/pasabuy/pasabuy-mock-store';

const weekSalesChartConfig: ChartConfig = {
  amount: {
    label: 'Sales',
    color: 'hsl(var(--primary-foreground))',
  },
};

interface Product {
  id: string;
  name: string;
  price: number;
  description: string;
  category: string;
  preparationTimeMinutes: number;
  image?: string;
  imageFileId?: string;
  isAvailable: boolean;
  eligibleExtraIds: string[];
}

interface PreorderDayState {
  isEnabled: boolean;
  openTime: string;
  closeTime: string;
}

interface StoreDayState {
  isOpen: boolean;
  openTime: string;
  closeTime: string;
}

const WEEKDAYS: Array<{ key: Weekday; label: string }> = [
  { key: 'MONDAY', label: 'Monday' },
  { key: 'TUESDAY', label: 'Tuesday' },
  { key: 'WEDNESDAY', label: 'Wednesday' },
  { key: 'THURSDAY', label: 'Thursday' },
  { key: 'FRIDAY', label: 'Friday' },
  { key: 'SATURDAY', label: 'Saturday' },
];

function createDefaultPreorderDays(): Record<Weekday, PreorderDayState> {
  return Object.fromEntries(
    WEEKDAYS.map(({ key }) => [key, { isEnabled: false, openTime: '09:00', closeTime: '17:00' }]),
  ) as Record<Weekday, PreorderDayState>;
}

function createDefaultStoreDays(): Record<Weekday, StoreDayState> {
  return Object.fromEntries(
    WEEKDAYS.map(({ key }) => [key, { isOpen: false, openTime: '09:00', closeTime: '17:00' }]),
  ) as Record<Weekday, StoreDayState>;
}

function getNextOrderStatus(
  order: VendorQueueOrder,
): { label: string; next: string } | null {
  switch (order.status) {
    case 'PENDING':
      // Payment is confirmed automatically by the PayMongo webhook once the
      // buyer pays — vendors have no manual action while an order is unpaid.
      return null;
    case 'PAID':
      return { label: 'Start Cooking', next: 'COOKING' };
    case 'COOKING':
      return order.isPasabuyRequest
        ? { label: 'Out for Delivery', next: 'OUT_FOR_DELIVERY' }
        : { label: 'Ready for Pickup', next: 'READY_FOR_PICKUP' };
    case 'OUT_FOR_DELIVERY':
    case 'READY_FOR_PICKUP':
      return { label: 'Mark Completed', next: 'COMPLETED' };
    default:
      return null;
  }
}

const CANCELLATION_REASONS: { value: string; label: string }[] = [
  { value: 'NOT_AVAILABLE', label: 'Not available' },
  { value: 'CUSTOMER_REQUEST', label: 'Customer request' },
  { value: 'CLOSING_EARLY', label: 'Closing early' },
  { value: 'OTHER', label: 'Other' },
];

export default function VendorPage({ username = 'Jordan' }: { username?: string }) {
  useRequireAuth(['vendor', 'student_vendor', 'admin']);
  const [, setLocation] = useLocation();

  // US-012 State Management
  const [products, setProducts] = useState<Product[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalKind, setModalKind] = useState<'product' | 'extra'>('product');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [extraSearch, setExtraSearch] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    description: '',
    category: '',
    preparationTime: '15',
    image: '',
    imageFileId: '',
    eligibleExtraIds: [] as string[],
  });
  const [imagePreview, setImagePreview] = useState<string>('');
  const [formErrors, setFormErrors] = useState<{ name?: string; price?: string; description?: string; preparationTime?: string }>({});
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [vendor, setVendor] = useState<VendorStorefront | null>(null);
  const [storefrontData, setStorefrontData] = useState({ name: '', description: '', campusLocation: '' });
  const [storefrontErrors, setStorefrontErrors] = useState<{ name?: string; description?: string; campusLocation?: string }>({});
  const [isStorefrontLoading, setIsStorefrontLoading] = useState(true);
  const [isStorefrontSaving, setIsStorefrontSaving] = useState(false);
  const [preorderEnabled, setPreorderEnabled] = useState(false);
  const [preorderSameAsStoreHours, setPreorderSameAsStoreHours] = useState(true);
  const [preorderDays, setPreorderDays] = useState<Record<Weekday, PreorderDayState>>(
    () => createDefaultPreorderDays(),
  );
  const [isPreorderSaving, setIsPreorderSaving] = useState(false);
  const [storeDays, setStoreDays] = useState<Record<Weekday, StoreDayState>>(
    () => createDefaultStoreDays(),
  );
  const [isAvailabilitySaving, setIsAvailabilitySaving] = useState(false);
  const [isProductSaving, setIsProductSaving] = useState(false);
  const [isProductDeleting, setIsProductDeleting] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [dashboard, setDashboard] = useState<VendorDashboard | null>(null);
  const [isPayoutDialogOpen, setIsPayoutDialogOpen] = useState(false);
  const [isPayoutLoading, setIsPayoutLoading] = useState(false);

  // US-017 State Management (Vendor Queue & Order Details)
  const [orderQueue, setOrderQueue] = useState<VendorQueueOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<VendorQueueOrder | null>(null);
  const [isQueueLoading, setIsQueueLoading] = useState(true);

  // US-018 State Management
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const isUpdatingStatusRef = useRef(false);
  const [cancelTarget, setCancelTarget] = useState<VendorQueueOrder | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelNote, setCancelNote] = useState('');

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleTransferOut = async () => {
    setIsPayoutLoading(true);
    try {
      const payout = await payoutVendorBalance(crypto.randomUUID());
      setDashboard((prev) => (prev ? { ...prev, ledgerBalance: '0.00' } : prev));
      showToast(`Transferred out ₱${Number(payout.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}.`, 'success');
      setIsPayoutDialogOpen(false);
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : 'Unable to process payout.', 'error');
    } finally {
      setIsPayoutLoading(false);
    }
  };

  useEffect(() => {
    getMyVendor()
      .then((vendorData) => {
        setVendor(vendorData);
        setStorefrontData({
          name: vendorData.name,
          description: vendorData.description || '',
          campusLocation: vendorData.campusLocation || '',
        });
        setPreorderEnabled(vendorData.preorderEnabled ?? false);
        setPreorderSameAsStoreHours(vendorData.preorderSameAsStoreHours ?? true);
        if (vendorData.preorderAvailability) {
          setPreorderDays((prev) => {
            const next = { ...prev };
            for (const day of vendorData.preorderAvailability!) {
              next[day.dayOfWeek] = {
                isEnabled: day.isEnabled,
                openTime: day.openTime ?? '09:00',
                closeTime: day.closeTime ?? '17:00',
              };
            }
            return next;
          });
        }
        if (vendorData.availabilityDays) {
          setStoreDays((prev) => {
            const next = { ...prev };
            for (const day of vendorData.availabilityDays!) {
              next[day.dayOfWeek] = {
                isOpen: day.isOpen,
                openTime: day.openTime ?? '09:00',
                closeTime: day.closeTime ?? '17:00',
              };
            }
            return next;
          });
        }
        return getVendorStorefront(vendorData.id);
      })
      .then((vendorData) => {
        if (vendorData) setProducts(vendorData.products?.map(toProduct) || []);
      })
      .catch((error: unknown) => showToast(error instanceof Error ? error.message : 'Unable to load storefront.', 'error'))
      .finally(() => setIsStorefrontLoading(false));

    getVendorDashboard()
      .then(setDashboard)
      .catch((error: unknown) =>
        showToast(error instanceof Error ? error.message : 'Unable to load dashboard.', 'error'),
      );

    // US-017: Fetch Incoming Order Queue
    getVendorOrderQueue()
      .then((data: any) => {
        const list = Array.isArray(data)
          ? data
          : Array.isArray(data?.orders)
          ? data.orders
          : Array.isArray(data?.data)
          ? data.data
          : [];
        setOrderQueue(list);
      })
      .catch((error: unknown) => {
        setOrderQueue([]);
        showToast(
          error instanceof Error ? error.message : 'Unable to load incoming order queue.',
          'error'
        );
      })
      .finally(() => {
        setIsQueueLoading(false); // Ito ang kulang na nagtatapos sa loading status!
      });
  }, []);

  // Poll the queue so a PayMongo webhook confirming payment flips an order
  // to "Paid" here without the vendor needing to refresh the page.
  useEffect(() => {
    const QUEUE_POLL_INTERVAL_MS = 8000;

    const refreshQueue = () => {
      getVendorOrderQueue()
        .then((data: unknown) => {
          const list: VendorQueueOrder[] = Array.isArray(data)
            ? data
            : Array.isArray((data as { orders?: unknown })?.orders)
            ? ((data as { orders: VendorQueueOrder[] }).orders)
            : Array.isArray((data as { data?: unknown })?.data)
            ? ((data as { data: VendorQueueOrder[] }).data)
            : [];
          setOrderQueue(list);
          setSelectedOrder((prev) =>
            prev ? list.find((order) => order.id === prev.id) ?? prev : prev,
          );
        })
        .catch(() => {
          // Silent — the next poll will retry, no need to spam the toast.
        });
    };

    const timer = window.setInterval(refreshQueue, QUEUE_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  const handleSaveStorefront = async (event: React.FormEvent) => {
    event.preventDefault();
    const errors: typeof storefrontErrors = {};
    if (!storefrontData.name.trim()) errors.name = 'Store name is required.';
    if (storefrontData.name.trim().length > 100) errors.name = 'Store name must be 100 characters or fewer.';
    if (storefrontData.description.length > 500) errors.description = 'Description must be 500 characters or fewer.';
    if (storefrontData.campusLocation.length > 255) errors.campusLocation = 'Location must be 255 characters or fewer.';
    setStorefrontErrors(errors);
    if (Object.keys(errors).length > 0 || !vendor) return;

    setIsStorefrontSaving(true);
    try {
      const updatedVendor = await updateVendorStorefront(vendor.id, {
        name: storefrontData.name.trim(),
        description: storefrontData.description.trim(),
        campusLocation: storefrontData.campusLocation.trim(),
      });
      setVendor(updatedVendor);
      setStorefrontData({
        name: updatedVendor.name,
        description: updatedVendor.description || '',
        campusLocation: updatedVendor.campusLocation || '',
      });
      showToast('Storefront updated successfully.');
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : 'Unable to update storefront.', 'error');
    } finally {
      setIsStorefrontSaving(false);
    }
  };

  const handleSavePreorderAvailability = async () => {
    if (!vendor || isPreorderSaving) return;

    if (!preorderSameAsStoreHours) {
      for (const { key, label } of WEEKDAYS) {
        const day = preorderDays[key];
        if (day.isEnabled && day.openTime >= day.closeTime) {
          showToast(`${label}'s close time must be after its open time.`, 'error');
          return;
        }
      }
    }

    setIsPreorderSaving(true);
    try {
      const updated = await updateVendorPreorderAvailability(vendor.id, {
        preorderEnabled,
        sameAsStoreHours: preorderSameAsStoreHours,
        days: preorderSameAsStoreHours
          ? undefined
          : WEEKDAYS.map(({ key }) => ({
              dayOfWeek: key,
              isEnabled: preorderDays[key].isEnabled,
              openTime: preorderDays[key].isEnabled ? preorderDays[key].openTime : null,
              closeTime: preorderDays[key].isEnabled ? preorderDays[key].closeTime : null,
            })),
      });
      setVendor((prev) =>
        prev
          ? {
              ...prev,
              preorderEnabled: updated.preorderEnabled,
              preorderSameAsStoreHours: updated.preorderSameAsStoreHours,
              preorderAvailability: updated.preorderAvailability,
            }
          : prev,
      );
      showToast('Preorder availability saved.');
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : 'Unable to save preorder availability.', 'error');
    } finally {
      setIsPreorderSaving(false);
    }
  };

  const handleSaveAvailability = async () => {
    if (!vendor || isAvailabilitySaving) return;

    for (const { key, label } of WEEKDAYS) {
      const day = storeDays[key];
      if (day.isOpen && day.openTime >= day.closeTime) {
        showToast(`${label}'s close time must be after its open time.`, 'error');
        return;
      }
    }

    setIsAvailabilitySaving(true);
    try {
      const updated = await updateVendorAvailability(vendor.id, {
        days: WEEKDAYS.map(({ key }) => ({
          dayOfWeek: key,
          isOpen: storeDays[key].isOpen,
          openTime: storeDays[key].isOpen ? storeDays[key].openTime : null,
          closeTime: storeDays[key].isOpen ? storeDays[key].closeTime : null,
        })),
      });
      setVendor((prev) => (prev ? { ...prev, availabilityDays: updated.availability } : prev));
      showToast('Store availability saved.');
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : 'Unable to save store availability.', 'error');
    } finally {
      setIsAvailabilitySaving(false);
    }
  };

  const toProduct = (product: VendorProduct): Product => ({
    id: product.id,
    name: product.name,
    price: Number(product.price),
    description: product.description || '',
    category: product.category || 'General',
    preparationTimeMinutes: product.preparationTimeMinutes ?? 15,
    image: product.imageUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80',
    imageFileId: product.imageFileId || undefined,
    isAvailable: product.isAvailable,
    eligibleExtraIds: product.eligibleExtras?.map((extra) => extra.id) ?? [],
  });

  const handleOpenModal = (product?: Product, kind: 'product' | 'extra' = 'product') => {
    if (product) {
      const resolvedKind = product.category === EXTRA_CATEGORY ? 'extra' : 'product';
      setModalKind(resolvedKind);
      setEditingProduct(product);
      setFormData({
        name: product.name,
        price: product.price.toString(),
        description: product.description,
        category: product.category || 'General',
        preparationTime: String(product.preparationTimeMinutes ?? 15),
        image: product.image || '',
        imageFileId: product.imageFileId || '',
        eligibleExtraIds: product.eligibleExtraIds,
      });
      setImagePreview(product.image || '');
    } else {
      setModalKind(kind);
      setEditingProduct(null);
      setFormData({
        name: '',
        price: '',
        description: '',
        category: kind === 'extra' ? EXTRA_CATEGORY : '',
        preparationTime: '15',
        image: '',
        imageFileId: '',
        eligibleExtraIds: [],
      });
      setImagePreview('');
    }
    setFormErrors({});
    setIsCategoryMenuOpen(false);
    setIsModalOpen(true);
  };

  // Handle Local File Upload from File Explorer / Gallery
  const [isUploadingImage, setIsUploadingImage] = useState(false);

const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;

  setIsUploadingImage(true);
  try {
    const { url, fileId } = await uploadProductImage(file);
    setFormData((prev) => ({ ...prev, image: url, imageFileId: fileId }));
    setImagePreview(url);
  } catch (error: unknown) {
    showToast(error instanceof Error ? error.message : 'Image upload failed.', 'error');
  } finally {
    setIsUploadingImage(false);
  }
};

  const validateForm = () => {
    const errors: { name?: string; price?: string; description?: string; preparationTime?: string } = {};
    if (!formData.name.trim()) errors.name = 'Product name is required';
    if (!formData.price.trim()) {
      errors.price = 'Price is required';
    } else if (isNaN(Number(formData.price)) || Number(formData.price) <= 0) {
      errors.price = 'Price must be a valid positive number';
    }
    if (!formData.description.trim()) errors.description = 'Description is required';
    if (!formData.preparationTime.trim()) {
      errors.preparationTime = 'Preparation time is required';
    } else if (
      !Number.isInteger(Number(formData.preparationTime)) ||
      Number(formData.preparationTime) < 1 ||
      Number(formData.preparationTime) > 180
    ) {
      errors.preparationTime = 'Enter a whole number of minutes between 1 and 180';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    const finalCategory =
      modalKind === 'extra'
        ? EXTRA_CATEGORY
        : formData.category.trim()
          ? formData.category.trim()
          : 'General';
    setIsProductSaving(true);
    try {
      const data = {
        name: formData.name.trim(),
        price: Number(formData.price),
        description: formData.description.trim(),
        category: finalCategory,
        preparationTimeMinutes: Number(formData.preparationTime),
        isAvailable: editingProduct ? editingProduct.isAvailable : true,
        imageUrl: formData.image || undefined,
        imageFileId: formData.imageFileId || undefined,
        ...(modalKind === 'product' ? { eligibleExtraIds: formData.eligibleExtraIds } : {}),
      };
      const savedProduct = editingProduct
        ? await updateProduct(editingProduct.id, data)
        : await createProduct(data);
      const mappedProduct = toProduct(savedProduct);
      setProducts((prev) =>
        editingProduct
          ? prev.map((product) =>
              product.id === editingProduct.id ? mappedProduct : product,
            )
          : [mappedProduct, ...prev],
      );
      showToast(
        modalKind === 'extra'
          ? editingProduct
            ? 'Extra updated successfully!'
            : 'New extra added to store!'
          : editingProduct
            ? 'Product updated successfully!'
            : 'New product added to store!',
      );
      setIsModalOpen(false);
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : 'Unable to save product.', 'error');
    } finally {
      setIsProductSaving(false);
    }
  };

  const handleToggleAvailability = async (product: Product) => {
    const nextAvailable = !product.isAvailable;
    setProducts((prev) =>
      prev.map((p) => (p.id === product.id ? { ...p, isAvailable: nextAvailable } : p)),
    );
    try {
      await updateProduct(product.id, {
        name: product.name,
        price: product.price,
        description: product.description,
        category: product.category,
        preparationTimeMinutes: product.preparationTimeMinutes,
        isAvailable: nextAvailable,
      });
      showToast(`${product.name} marked as ${nextAvailable ? 'available' : 'unavailable'}`);
    } catch (error: unknown) {
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, isAvailable: !nextAvailable } : p)),
      );
      showToast(error instanceof Error ? error.message : 'Unable to update availability.', 'error');
    }
  };

  const handleDeleteProduct = async () => {
    if (!deleteTargetId) return;
    const deletedId = deleteTargetId;
    setIsProductDeleting(true);
    try {
      await deleteProduct(deletedId);
      setProducts((prev) =>
        prev
          .filter((product) => product.id !== deletedId)
          .map((product) =>
            product.eligibleExtraIds.includes(deletedId)
              ? {
                  ...product,
                  eligibleExtraIds: product.eligibleExtraIds.filter((id) => id !== deletedId),
                }
              : product,
          ),
      );
      setDeleteTargetId(null);
      showToast('Deleted from menu');
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : 'Unable to delete item.', 'error');
    } finally {
      setIsProductDeleting(false);
    }
  };

  // US-018: Handle Order Status Update & Invalid Transition Feedback
  const applyOrderStatusUpdate = async (
    orderId: string,
    newStatus: string,
    extra?: { cancellationReason?: string; cancellationNote?: string },
  ) => {
    if (isUpdatingStatusRef.current) return;
    const currentOrder = orderQueue.find((o) => o.id === orderId);
    if (currentOrder?.status === newStatus) return;

    isUpdatingStatusRef.current = true;
    setIsUpdatingStatus(true);
    try {
      await updateOrderStatus(orderId, newStatus, extra as any);
      showToast(`Order status updated to ${newStatus}`);

      const impliesPaid = newStatus !== 'PENDING' && newStatus !== 'CANCELLED';
      setOrderQueue((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? { ...o, status: newStatus, ...(impliesPaid ? { paymentStatus: 'PAID' } : {}) }
            : o
        )
      );
      setSelectedOrder((prev) =>
        prev && prev.id === orderId
          ? { ...prev, status: newStatus, ...(impliesPaid ? { paymentStatus: 'PAID' } : {}) }
          : prev
      );
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : 'Invalid status transition.', 'error');
    } finally {
      isUpdatingStatusRef.current = false;
      setIsUpdatingStatus(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!cancelTarget || !cancelReason) return;
    await applyOrderStatusUpdate(cancelTarget.id, 'CANCELLED', {
      cancellationReason: cancelReason,
      ...(cancelReason === 'OTHER' ? { cancellationNote: cancelNote.trim() } : {}),
    });
    if (cancelReason === 'NOT_AVAILABLE' && cancelTarget.items) {
      const affectedProductIds = new Set(
        cancelTarget.items.map((item) => item.productId).filter((id): id is string => Boolean(id)),
      );
      setProducts((prev) =>
        prev.map((p) => (affectedProductIds.has(p.id) ? { ...p, isAvailable: false } : p)),
      );
    }
    setCancelTarget(null);
    setCancelReason('');
    setCancelNote('');
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!selectedOrder) return;
    await applyOrderStatusUpdate(selectedOrder.id, newStatus);
  };

  const menuProducts = products.filter((product) => product.category !== EXTRA_CATEGORY);
  const extraProducts = products.filter((product) => product.category === EXTRA_CATEGORY);

  const existingCategories = Array.from(
    new Set(
      menuProducts
        .map((product) => product.category)
        .filter((cat): cat is string => Boolean(cat && cat.trim())),
    ),
  ).sort((a, b) => a.localeCompare(b));

  const filteredMenuProducts = menuProducts.filter((product) => {
    const query = productSearch.trim().toLowerCase();
    return !query || [product.name, product.description, product.category]
      .some((value) => value.toLowerCase().includes(query));
  });

  const filteredExtraProducts = extraProducts.filter((product) => {
    const query = extraSearch.trim().toLowerCase();
    return !query || [product.name, product.description]
      .some((value) => value.toLowerCase().includes(query));
  });

  const performanceCards = [
    { label: 'Today', value: `₱${Number(dashboard?.todaySales || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, caption: '' },
    { label: 'Avg. ticket', value: `₱${Number(dashboard?.averageTicket || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, caption: '' },
    { label: 'Pending', value: String(dashboard?.pendingOrders || 0), caption: '' },
  ];

  return (
    <main className="mx-auto w-full max-w-[1300px] px-4 py-8 sm:px-6 lg:px-10 relative">
      {/* Feedback Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-2xl px-4 py-3 shadow-xl backdrop-blur-md transition-all ${
            toastMessage.type === 'success'
              ? 'border border-emerald-500/30 bg-emerald-950/80 text-emerald-200'
              : 'border border-destructive/30 bg-destructive/90 text-destructive-foreground'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          ) : (
            <AlertCircle className="h-5 w-5" />
          )}
          <span className="text-sm font-medium">{toastMessage.text}</span>
        </div>
      )}

      <div className="rounded-[28px] border border-border/80 bg-background/80 p-3 shadow-sm backdrop-blur-sm sm:p-4">
        <section className="mt-6 flex flex-col gap-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Good afternoon</p>
              <h1 className="mt-3 text-4xl font-extrabold tracking-[-0.07em] text-foreground sm:text-5xl lg:text-[4rem]">
                Hello, <span className=" text-primary"> {username} </span>
              </h1>
            </div>

            <div className="flex items-center gap-3 rounded-full border border-border bg-secondary/60 px-3 py-2 text-sm text-muted-foreground">
              <ShoppingBag className="h-4 w-4 text-primary" />
              <span>{storefrontData.campusLocation || 'No Location'}</span>
            </div>
          </div>

          <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-primary via-primary to-primary/85 text-primary-foreground shadow-md">
            <ChartContainer
              config={weekSalesChartConfig}
              className="pointer-events-none absolute inset-0 aspect-auto opacity-25"
            >
              <BarChart
                data={dashboard?.weekSales ?? []}
                margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
              >
                <Bar dataKey="amount" fill="currentColor" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ChartContainer>

            <CardContent className="relative z-10 flex flex-col gap-6 p-5 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-md">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary-foreground/80">Total sales</p>
                <div className="mt-3 flex items-end gap-3">
                  <span className="text-4xl font-bold tracking-[-0.07em] sm:text-5xl">₱{Number(dashboard?.todaySales || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="mt-4 flex items-center gap-4 text-[10px] uppercase tracking-[0.12em] text-primary-foreground/70">
                  {(dashboard?.weekSales ?? []).map((day) => (
                    <span key={day.day}>{day.day}</span>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsPayoutDialogOpen(true)}
                className="group flex items-center gap-3 rounded-[22px] border border-primary-foreground/15 bg-primary-foreground/5 px-4 py-3 text-left backdrop-blur-sm transition-colors hover:bg-primary-foreground/15"
              >
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-primary-foreground/80">Transfer out</p>
                  <p className="font-mono text-lg font-semibold">₱{Number(dashboard?.ledgerBalance || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
                </div>
                <span className="flex h-9 w-0 items-center justify-center overflow-hidden rounded-full bg-primary-foreground/20 opacity-0 transition-all duration-300 ease-out group-hover:w-9 group-hover:opacity-100">
                  <Send className="h-4 w-4 shrink-0 text-primary-foreground" />
                </span>
              </button>
            </CardContent>
          </Card>
        </section>

        <AlertDialog open={isPayoutDialogOpen} onOpenChange={setIsPayoutDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Transfer out balance?</AlertDialogTitle>
              <AlertDialogDescription>
                This will transfer your current ledger balance of ₱{Number(dashboard?.ledgerBalance || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })} and reset it to zero. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPayoutLoading}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => {
                  event.preventDefault();
                  handleTransferOut();
                }}
                disabled={isPayoutLoading}
              >
                {isPayoutLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Transfer out'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Quick Actions */}
        <section className="mt-8">
          <div className="mb-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Storefront settings</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-foreground">Keep your vendor details current</h2>
          </div>
          <Card className={`bg-card/90 shadow-sm ${!storefrontData.campusLocation.trim() ? 'border-2 border-destructive' : 'border-card-border/80'}`}>
            <CardContent className="p-5 sm:p-6">
              {isStorefrontLoading ? (
                <p className="text-sm text-muted-foreground">Loading storefront details...</p>
              ) : (
                <form onSubmit={handleSaveStorefront} className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium text-foreground" htmlFor="storefront-name">Store name</label>
                    <input id="storefront-name" value={storefrontData.name} onChange={(event) => setStorefrontData({ ...storefrontData, name: event.target.value })} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
                    {storefrontErrors.name && <p className="mt-1 text-xs text-destructive">{storefrontErrors.name}</p>}
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground" htmlFor="storefront-location">Campus location</label>
                    <input id="storefront-location" value={storefrontData.campusLocation} onChange={(event) => setStorefrontData({ ...storefrontData, campusLocation: event.target.value })} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
                    {storefrontErrors.campusLocation && <p className="mt-1 text-xs text-destructive">{storefrontErrors.campusLocation}</p>}
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-sm font-medium text-foreground" htmlFor="storefront-description">Description</label>
                    <textarea id="storefront-description" rows={3} value={storefrontData.description} onChange={(event) => setStorefrontData({ ...storefrontData, description: event.target.value })} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
                    {storefrontErrors.description && <p className="mt-1 text-xs text-destructive">{storefrontErrors.description}</p>}
                  </div>
                  <div className="md:col-span-2">
                    <Button type="submit" disabled={isStorefrontSaving} className="rounded-full px-5">
                      {isStorefrontSaving ? 'Saving...' : 'Save storefront'}
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Store availability */}
        <section className="mt-8">
          <div className="mb-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Availability</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-foreground">Store availability</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Set the days and times buyers can order from you. Outside these hours, your storefront
              shows as closed and buyers can't add items to their cart.
            </p>
          </div>
          <Card className="border-card-border/80 bg-card/90 shadow-sm">
            <CardContent className="p-5 sm:p-6">
              <div className="space-y-2">
                {WEEKDAYS.map(({ key, label }) => {
                  const day = storeDays[key];
                  return (
                    <div
                      key={key}
                      className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background/60 px-3 py-2.5"
                    >
                      <label className="flex w-28 shrink-0 items-center gap-2 text-sm font-medium text-foreground">
                        <input
                          type="checkbox"
                          checked={day.isOpen}
                          onChange={(event) =>
                            setStoreDays((prev) => ({
                              ...prev,
                              [key]: { ...prev[key], isOpen: event.target.checked },
                            }))
                          }
                          className="h-4 w-4 accent-primary"
                        />
                        {label}
                      </label>
                      <div className="flex items-center gap-2 text-sm">
                        <input
                          type="time"
                          value={day.openTime}
                          disabled={!day.isOpen}
                          onChange={(event) =>
                            setStoreDays((prev) => ({
                              ...prev,
                              [key]: { ...prev[key], openTime: event.target.value },
                            }))
                          }
                          className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm disabled:opacity-50"
                        />
                        <span className="text-muted-foreground">to</span>
                        <input
                          type="time"
                          value={day.closeTime}
                          disabled={!day.isOpen}
                          onChange={(event) =>
                            setStoreDays((prev) => ({
                              ...prev,
                              [key]: { ...prev[key], closeTime: event.target.value },
                            }))
                          }
                          className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm disabled:opacity-50"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <Button
                type="button"
                onClick={handleSaveAvailability}
                disabled={isAvailabilitySaving}
                className="mt-4 rounded-full px-5"
              >
                {isAvailabilitySaving ? 'Saving...' : 'Save store availability'}
              </Button>
            </CardContent>
          </Card>
        </section>

        {/* Preorder availability */}
        <section className="mt-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Preorders</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-foreground">Preorder availability</h2>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <input
                type="checkbox"
                checked={preorderEnabled}
                onChange={(event) => setPreorderEnabled(event.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              Enable preorders
            </label>
          </div>
          <Card className="border-card-border/80 bg-card/90 shadow-sm">
            <CardContent className="p-5 sm:p-6">
              {!preorderEnabled && (
                <p className="mb-4 text-sm text-muted-foreground">
                  Turn on preorders to let buyers schedule pickups on the days and times you choose
                  below.
                </p>
              )}
              <label
                className={`mb-4 flex items-center gap-2 text-sm font-medium text-foreground ${!preorderEnabled ? 'opacity-50' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={preorderSameAsStoreHours}
                  disabled={!preorderEnabled}
                  onChange={(event) => setPreorderSameAsStoreHours(event.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                Same as store availability
              </label>
              {preorderSameAsStoreHours ? (
                <p className={`text-sm text-muted-foreground ${!preorderEnabled ? 'opacity-50' : ''}`}>
                  Preorders will follow the store availability hours set above.
                </p>
              ) : (
              <div className={`space-y-2 ${!preorderEnabled ? 'pointer-events-none opacity-50' : ''}`}>
                {WEEKDAYS.map(({ key, label }) => {
                  const day = preorderDays[key];
                  return (
                    <div
                      key={key}
                      className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background/60 px-3 py-2.5"
                    >
                      <label className="flex w-28 shrink-0 items-center gap-2 text-sm font-medium text-foreground">
                        <input
                          type="checkbox"
                          checked={day.isEnabled}
                          onChange={(event) =>
                            setPreorderDays((prev) => ({
                              ...prev,
                              [key]: { ...prev[key], isEnabled: event.target.checked },
                            }))
                          }
                          className="h-4 w-4 accent-primary"
                        />
                        {label}
                      </label>
                      <div className="flex items-center gap-2 text-sm">
                        <input
                          type="time"
                          value={day.openTime}
                          disabled={!day.isEnabled}
                          onChange={(event) =>
                            setPreorderDays((prev) => ({
                              ...prev,
                              [key]: { ...prev[key], openTime: event.target.value },
                            }))
                          }
                          className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm disabled:opacity-50"
                        />
                        <span className="text-muted-foreground">to</span>
                        <input
                          type="time"
                          value={day.closeTime}
                          disabled={!day.isEnabled}
                          onChange={(event) =>
                            setPreorderDays((prev) => ({
                              ...prev,
                              [key]: { ...prev[key], closeTime: event.target.value },
                            }))
                          }
                          className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm disabled:opacity-50"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              )}
              <Button
                type="button"
                onClick={handleSavePreorderAvailability}
                disabled={isPreorderSaving}
                className="mt-4 rounded-full px-5"
              >
                {isPreorderSaving ? 'Saving...' : 'Save preorder availability'}
              </Button>
            </CardContent>
          </Card>
        </section>

        {/* Quick Actions */}
        <section className="mt-8">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Quick actions</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-foreground">Manage your store</h2>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                label: 'Orders',
                icon: PackageCheck,
                onClick: () => {
                  document.getElementById('incoming-orders-queue-section')?.scrollIntoView({ behavior: 'smooth' });
                },
              },
              {
                label: 'Menu',
                icon: MenuIcon,
                onClick: () => {
                  document.getElementById('menu-management-section')?.scrollIntoView({ behavior: 'smooth' });
                },
              },
              { label: 'Store', icon: Store, onClick: () => setLocation('/vendor/storefront') },
              { label: 'Promotion', icon: Megaphone, onClick: () => setLocation('/vendor/promotion') },
            ].map(({ label, icon: Icon, onClick }) => (
              <Button
                key={label}
                variant="secondary"
                onClick={onClick}
                className="flex h-20 items-center justify-between rounded-[22px] border border-border bg-secondary/60 px-4 py-4 text-left shadow-sm hover:bg-secondary"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-background text-primary shadow-sm">
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="text-base font-medium text-foreground">{label}</span>
                </div>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
              </Button>
            ))}
          </div>
        </section>

        {/* US-017: Incoming Order Queue Section */}
        <section id="incoming-orders-queue-section" className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Incoming Queue</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-[-0.05em] text-foreground">Order Queue & Status</h2>
            </div>
          </div>

          <Card className="border-card-border/80 bg-card/90 shadow-sm overflow-hidden">
            <CardContent className="p-0">
              <div className="grid grid-cols-[1fr_1fr_1.1fr_0.7fr_0.7fr_0.8fr_1.8fr] gap-3 border-b border-border bg-secondary/40 px-4 py-3 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                <span>Order Ref</span>
                <span>Customer</span>
                <span>Items & Quantity</span>
                <span>Payment</span>
                <span>Pasabuy?</span>
                <span>Status</span>
                <span className="text-right">Action</span>
              </div>

              {isQueueLoading ? (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  Loading order queue...
                </div>
              ) : !Array.isArray(orderQueue) || orderQueue.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  No active orders in queue.
                </div>
              ) : (
                orderQueue.map((order) => (
                  <div
                    key={order.id}
                    className="grid grid-cols-[1fr_1fr_1.1fr_0.7fr_0.7fr_0.8fr_1.8fr] items-center gap-3 border-b border-border/80 px-4 py-4 last:border-b-0"
                  >
                    <div>
                      <p className="text-sm font-semibold text-foreground">#{order.id.slice(-6).toUpperCase()}</p>
                      <p className="text-xs text-muted-foreground">₱{Number(order.totalAmount).toFixed(2)}</p>
                    </div>

                    <div>
                      <p className="text-sm font-medium text-foreground">{order.customerName || order.userId || 'Guest'}</p>
                      <p className="text-xs text-muted-foreground">{order.customerEmail || ''}</p>
                    </div>

                    <div className="text-sm text-foreground truncate">
                      {order.items && order.items.length > 0 ? (() => {
                        const firstItem = order.items[0] as any;
                        const itemName = firstItem.productName || firstItem.name || firstItem.product?.name || 'Item';
                        return (
                          <span>
                            {itemName} (x{firstItem.quantity})
                            {order.items.length > 1 ? ` +${order.items.length - 1} more` : ''}
                          </span>
                        );
                      })() : (
                        <span className="text-muted-foreground">No item details</span>
                      )}
                    </div>

                    <div>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                          order.paymentStatus === 'PAID'
                            ? 'bg-emerald-500/10 text-emerald-600'
                            : 'bg-amber-500/10 text-amber-600'
                        }`}
                      >
                        {order.paymentStatus || 'PENDING'}
                      </span>
                    </div>

                    <div>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                          order.isPasabuyRequest
                            ? 'bg-blue-500/10 text-blue-600'
                            : 'bg-secondary text-muted-foreground'
                        }`}
                      >
                        {order.isPasabuyRequest ? 'Yes' : 'No'}
                      </span>
                    </div>

                    <div>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] ${
                          order.status === 'COMPLETED'
                            ? 'bg-emerald-500/10 text-emerald-600'
                            : order.status === 'COOKING'
                            ? 'bg-amber-500/10 text-amber-600'
                            : order.status === 'CANCELLED'
                            ? 'bg-destructive/10 text-destructive'
                            : 'bg-blue-500/10 text-blue-600'
                        }`}
                      >
                        {order.status.replace(/_/g, ' ')}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {getNextOrderStatus(order) && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isUpdatingStatus}
                          onClick={() => {
                            const next = getNextOrderStatus(order);
                            if (next) applyOrderStatusUpdate(order.id, next.next);
                          }}
                          className="h-8 rounded-full px-3 text-[10px] font-semibold uppercase tracking-wide"
                          title={`Update status to ${getNextOrderStatus(order)?.next}`}
                        >
                          {getNextOrderStatus(order)?.label}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={isUpdatingStatus || order.status === 'CANCELLED' || order.status === 'COMPLETED'}
                        onClick={() => setCancelTarget(order)}
                        className="h-8 w-8 shrink-0 rounded-full border border-destructive/30 text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:border-border/60 disabled:text-muted-foreground disabled:opacity-50 disabled:hover:bg-transparent"
                        title={order.status === 'CANCELLED' ? 'Order already cancelled' : 'Cancel order'}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSelectedOrder(order)}
                        className="h-8 w-8 shrink-0 rounded-full border border-border/80 hover:bg-secondary"
                        title="View order detail"
                      >
                        <Eye className="h-3.5 w-3.5 text-foreground" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </section>

        {/* US-012: Product Management Section */}
        <section id="menu-management-section" className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Store Item</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-[-0.05em] text-foreground">Menu Products</h2>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                  placeholder="Search products"
                  className="h-10 w-full rounded-full border border-border bg-background pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 sm:w-56"
                />
              </div>
              <Button onClick={() => handleOpenModal(undefined, 'product')} className="gap-2 rounded-full px-4 py-2 font-medium">
                <Plus className="h-4 w-4" />
                Add Item
              </Button>
            </div>
          </div>

          <Card className="border-card-border/80 bg-card/90 shadow-sm overflow-hidden">
            <CardContent className="p-0">
              <div className="grid grid-cols-[1.3fr_0.8fr_1.6fr_0.9fr_1fr] gap-3 border-b border-border bg-secondary/40 px-4 py-3 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                <span>Product Name</span>
                <span>Price</span>
                <span>Description</span>
                <span>Availability</span>
                <span className="text-right">Actions</span>
              </div>

              {filteredMenuProducts.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  {menuProducts.length === 0 ? 'No products in your catalog yet. Click "Add Item" to create one.' : 'No products match your search.'}
                </div>
              ) : (
                filteredMenuProducts.map((product) => (
                  <div
                    key={product.id}
                    className="grid grid-cols-[1.3fr_0.8fr_1.6fr_0.9fr_1fr] items-center gap-3 border-b border-border/80 px-4 py-4 last:border-b-0"
                  >
                    <div>
                      <p className="text-sm font-semibold text-foreground">{product.name}</p>
                      <span className="inline-block rounded-full bg-secondary px-2 py-0.5 text-[9px] font-mono text-muted-foreground uppercase">
                        {product.category}
                      </span>
                    </div>

                    <p className="text-sm font-semibold text-primary">₱{product.price}</p>
                    <p className="text-sm text-muted-foreground line-clamp-1">{product.description}</p>

                    <div>
                      <button
                        type="button"
                        onClick={() => handleToggleAvailability(product)}
                        className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors ${
                          product.isAvailable
                            ? 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20'
                            : 'bg-destructive/10 text-destructive hover:bg-destructive/20'
                        }`}
                        title={`Mark as ${product.isAvailable ? 'unavailable' : 'available'}`}
                      >
                        {product.isAvailable ? 'Available' : 'Unavailable'}
                      </button>
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenModal(product)}
                        className="h-8 w-8 rounded-full border border-border/80 hover:bg-secondary"
                        title="Edit product"
                      >
                        <Pencil className="h-3.5 w-3.5 text-foreground" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTargetId(product.id)}
                        className="h-8 w-8 rounded-full border border-destructive/30 text-destructive hover:bg-destructive/10"
                        title="Delete product"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </section>

        {/* Extras Management Section */}
        <section id="extras-management-section" className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Add-ons</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-[-0.05em] text-foreground">Extras</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Add-ons like "Extra calamansi" that buyers can attach to eligible menu items.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={extraSearch}
                  onChange={(event) => setExtraSearch(event.target.value)}
                  placeholder="Search extras"
                  className="h-10 w-full rounded-full border border-border bg-background pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 sm:w-56"
                />
              </div>
              <Button onClick={() => handleOpenModal(undefined, 'extra')} className="gap-2 rounded-full px-4 py-2 font-medium">
                <Plus className="h-4 w-4" />
                Add Extras
              </Button>
            </div>
          </div>

          <Card className="border-card-border/80 bg-card/90 shadow-sm overflow-hidden">
            <CardContent className="p-0">
              <div className="grid grid-cols-[1.3fr_0.8fr_1.6fr_0.9fr_1fr] gap-3 border-b border-border bg-secondary/40 px-4 py-3 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                <span>Extra Name</span>
                <span>Price</span>
                <span>Description</span>
                <span>Availability</span>
                <span className="text-right">Actions</span>
              </div>

              {filteredExtraProducts.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  {extraProducts.length === 0 ? 'No extras yet. Click "Add Extras" to create one.' : 'No extras match your search.'}
                </div>
              ) : (
                filteredExtraProducts.map((extra) => (
                  <div
                    key={extra.id}
                    className="grid grid-cols-[1.3fr_0.8fr_1.6fr_0.9fr_1fr] items-center gap-3 border-b border-border/80 px-4 py-4 last:border-b-0"
                  >
                    <p className="text-sm font-semibold text-foreground">{extra.name}</p>
                    <p className="text-sm font-semibold text-primary">₱{extra.price}</p>
                    <p className="text-sm text-muted-foreground line-clamp-1">{extra.description}</p>

                    <div>
                      <button
                        type="button"
                        onClick={() => handleToggleAvailability(extra)}
                        className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors ${
                          extra.isAvailable
                            ? 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20'
                            : 'bg-destructive/10 text-destructive hover:bg-destructive/20'
                        }`}
                        title={`Mark as ${extra.isAvailable ? 'unavailable' : 'available'}`}
                      >
                        {extra.isAvailable ? 'Available' : 'Unavailable'}
                      </button>
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenModal(extra)}
                        className="h-8 w-8 rounded-full border border-border/80 hover:bg-secondary"
                        title="Edit extra"
                      >
                        <Pencil className="h-3.5 w-3.5 text-foreground" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTargetId(extra.id)}
                        className="h-8 w-8 rounded-full border border-destructive/30 text-destructive hover:bg-destructive/10"
                        title="Delete extra"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </section>

        {/* Performance Cards */}
        <section className="mt-8 grid gap-4 md:grid-cols-3">
          {performanceCards.map((card) => (
            <Card key={card.label} className="border-card-border/80 bg-card/90 shadow-sm">
              <CardContent className="flex items-center justify-between gap-4 p-4">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">{card.label}</p>
                  <p className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-foreground">{card.value}</p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-primary">
                  {card.caption.startsWith('-') ? (
                    <ArrowDownRight className="h-4 w-4" />
                  ) : (
                    <ArrowUpRight className="h-4 w-4" />
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        {/* Recent Orders */}
        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Recent activity</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-foreground">Recent orders</h2>
            </div>
          </div>

          <Card className="border-card-border/80 bg-card/90 shadow-sm">
            <CardContent className="p-0">
              <div className="overflow-hidden rounded-[20px]">
                <div className="grid grid-cols-[0.8fr_1.2fr_0.8fr_0.8fr] gap-3 border-b border-border bg-secondary/40 px-4 py-3 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  <span>Order</span>
                  <span>Customer</span>
                  <span>Item</span>
                  <span className="text-right">Status</span>
                </div>

                {dashboard?.recentOrders.length ? dashboard.recentOrders.map((order) => (
                  <div
                    key={order.id}
                    className="grid grid-cols-[0.8fr_1.2fr_0.8fr_0.8fr] items-center gap-3 border-b border-border/80 px-4 py-4 last:border-b-0"
                  >
                    <div>
                      <p className="text-sm font-semibold text-foreground">{order.id}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{order.total}</p>
                    </div>
                    <p className="text-sm text-foreground">{order.customer}</p>
                    <p className="text-sm text-muted-foreground">{order.item}</p>
                    <div className="text-right">
                      <span
                        className={[
                          'inline-flex rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em]',
                          order.status === 'COMPLETED' && 'bg-emerald-500/10 text-emerald-600',
                          order.status === 'COOKING' && 'bg-amber-500/10 text-amber-600',
                          (order.status === 'OUT_FOR_DELIVERY' || order.status === 'READY_FOR_PICKUP') && 'bg-blue-500/10 text-blue-600',
                          order.status === 'PENDING' && 'bg-slate-500/10 text-slate-600',
                          order.status === 'CANCELLED' && 'bg-destructive/10 text-destructive',
                        ].join(' ')}
                      >
                        {order.status}
                      </span>
                    </div>
                  </div>
                )) : (
                  <div className="bg-gray-100/70 p-8 text-center text-sm text-muted-foreground">
                    No recent orders.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </section>
      </div>

      {/* US-017: Order Details Display Modal */}
      {selectedOrder &&
        createPortal(
          <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
            <div className="w-full max-w-lg rounded-3xl border border-border bg-card p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Order Details</p>
                  <h3 className="text-lg font-bold text-foreground">
                    Ref #{selectedOrder.id}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-4 space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-2 rounded-2xl bg-secondary/30 p-3">
                  <div>
                    <span className="text-xs text-muted-foreground block">Customer Reference</span>
                    <span className="font-semibold text-foreground">{selectedOrder.customerName || selectedOrder.userId || 'Guest'}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">Payment State</span>
                    <span className="font-semibold text-emerald-600">{selectedOrder.paymentStatus || 'PENDING'}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">Requested Pasabuy?</span>
                    <span className="font-semibold text-foreground">{selectedOrder.isPasabuyRequest ? 'Yes' : 'No'}</span>
                  </div>
                </div>

                {selectedOrder.isPasabuyRequest && (() => {
                  const pasabuyRequest = getActiveRequestForOrder(selectedOrder.id);
                  return pasabuyRequest ? <PasabuyVendorCard request={pasabuyRequest} /> : null;
                })()}

                <div>
                  <h4 className="font-semibold text-foreground mb-2">Order Items</h4>
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {selectedOrder.items && selectedOrder.items.length > 0 ? (
                      (selectedOrder.items as any[]).map((rawItem, idx) => {
                        const item = rawItem;
                        const itemName = item.productName || item.name || item.product?.name || 'Product';
                        const itemPrice = Number(item.price || item.unitPrice || item.product?.price || 0);
                        return (
                          <div key={idx} className="flex justify-between items-center border-b border-border/50 pb-1.5">
                            <div>
                              <p className="font-medium text-foreground">{itemName}</p>
                              <p className="text-xs text-muted-foreground">Quantity: {item.quantity}</p>
                            </div>
                            <p className="font-medium text-primary">₱{(itemPrice * (item.quantity || 1)).toFixed(2)}</p>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-xs text-muted-foreground">No items listed.</p>
                    )}
                  </div>
                </div>

                <div className="flex justify-between items-center border-t border-border pt-3">
                  <span className="font-semibold text-foreground">Total Amount</span>
                  <span className="text-lg font-bold text-primary">₱{Number(selectedOrder.totalAmount || 0).toFixed(2)}</span>
                </div>
              </div>

              {/* US-018: Order Status Controls & Transition Buttons */}
              <div className="mt-4 border-t border-border pt-4">
                <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground block mb-2">
                  Update Order Status
                </span>
                <div className="flex flex-wrap gap-2">
                  {(selectedOrder.isPasabuyRequest
                    ? ['PENDING', 'PAID', 'COOKING', 'OUT_FOR_DELIVERY', 'COMPLETED']
                    : ['PENDING', 'PAID', 'COOKING', 'READY_FOR_PICKUP', 'COMPLETED']
                  ).map((statusOption) => (
                    <Button
                      key={statusOption}
                      type="button"
                      variant={selectedOrder.status === statusOption ? 'default' : 'outline'}
                      size="sm"
                      disabled={isUpdatingStatus || selectedOrder.status === statusOption}
                      onClick={() => handleStatusChange(statusOption)}
                      className="rounded-full text-xs"
                    >
                      {statusOption.replace(/_/g, ' ')}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isUpdatingStatus || selectedOrder.status === 'CANCELLED' || selectedOrder.status === 'COMPLETED'}
                    onClick={() => setCancelTarget(selectedOrder)}
                    className="rounded-full text-xs border-destructive/30 text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:border-border/60 disabled:text-muted-foreground disabled:opacity-50 disabled:hover:bg-transparent"
                  >
                    CANCELLED
                  </Button>
                </div>
                {selectedOrder.status === 'CANCELLED' && (selectedOrder as any).cancellationReason && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Cancellation reason: <span className="font-medium text-foreground">{(selectedOrder as any).cancellationReason.replace(/_/g, ' ')}</span>
                  </p>
                )}
              </div>

              <div className="mt-6 flex justify-end">
                <Button
                  onClick={() => setSelectedOrder(null)}
                  className="rounded-full px-6"
                >
                  Close
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* US-012: Add/Edit Product Modal */}
      {isModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 p-4 pt-10 backdrop-blur-md overflow-y-auto">
            <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl my-8">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h3 className="text-lg font-bold text-foreground">
                  {modalKind === 'extra'
                    ? editingProduct
                      ? 'Edit Extra'
                      : 'Add New Extra'
                    : editingProduct
                      ? 'Edit Product'
                      : 'Add New Product'}
                </h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSaveProduct} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">
                    {modalKind === 'extra' ? 'Extra Name' : 'Product Name'}
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder={modalKind === 'extra' ? 'e.g. Extra calamansi' : 'e.g. Banh Mi Combo'}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  {formErrors.name && <p className="mt-1 text-xs text-destructive">{formErrors.name}</p>}
                </div>

                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">
                    Price (₱)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="150"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  {formErrors.price && <p className="mt-1 text-xs text-destructive">{formErrors.price}</p>}
                </div>

                {modalKind === 'product' && (
                  <div className="relative">
                    <label className="block text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">
                      Category <span className="text-[10px] text-muted-foreground/70 font-normal">(Optional — type to filter or create)</span>
                    </label>
                    <input
                      type="text"
                      value={formData.category}
                      onChange={(e) => {
                        setFormData({ ...formData, category: e.target.value });
                        setIsCategoryMenuOpen(true);
                      }}
                      onFocus={() => setIsCategoryMenuOpen(true)}
                      onBlur={() => setTimeout(() => setIsCategoryMenuOpen(false), 120)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          setIsCategoryMenuOpen(false);
                        }
                      }}
                      placeholder="e.g. Rice Bowls, Drinks, Snacks"
                      autoComplete="off"
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    {isCategoryMenuOpen && (() => {
                      const query = formData.category.trim().toLowerCase();
                      const matches = existingCategories.filter((cat) =>
                        !query || cat.toLowerCase().includes(query),
                      );
                      const exactMatch = existingCategories.some(
                        (cat) => cat.toLowerCase() === query,
                      );
                      return (
                        <div className="absolute z-10 mt-1 w-full max-h-40 overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
                          {matches.map((cat) => (
                            <button
                              type="button"
                              key={cat}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setFormData({ ...formData, category: cat });
                                setIsCategoryMenuOpen(false);
                              }}
                              className="block w-full px-3 py-2 text-left text-sm text-foreground hover:bg-secondary"
                            >
                              {cat}
                            </button>
                          ))}
                          {query && !exactMatch && (
                            <button
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setIsCategoryMenuOpen(false);
                              }}
                              className="block w-full border-t border-border px-3 py-2 text-left text-sm text-primary hover:bg-secondary"
                            >
                              Create new category "{formData.category.trim()}"
                            </button>
                          )}
                          {matches.length === 0 && !query && (
                            <p className="px-3 py-2 text-xs text-muted-foreground">No categories yet — type a name to create one.</p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">
                    Preparation Time (minutes)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={180}
                    step={1}
                    value={formData.preparationTime}
                    onChange={(e) => setFormData({ ...formData, preparationTime: e.target.value })}
                    placeholder="15"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  {formErrors.preparationTime && (
                    <p className="mt-1 text-xs text-destructive">{formErrors.preparationTime}</p>
                  )}
                </div>

                {/* File Explorer / Gallery Picker */}
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">
                    Product Photo <span className="text-[10px] text-muted-foreground/70 font-normal">(Optional)</span>
                  </label>

                  <div className="relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-secondary/30 p-4 transition-colors hover:bg-secondary/50">
                    {imagePreview ? (
                      <div className="relative w-full h-32 overflow-hidden rounded-xl">
                        <img src={imagePreview} alt="Preview" className="h-full w-full object-cover" />
                        <button
                          type="button"
                          onClick={() => {
                            setImagePreview('');
                            setFormData((prev) => ({ ...prev, image: '' }));
                          }}
                          className="absolute top-2 right-2 rounded-full bg-black/60 p-1 text-white hover:bg-black"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center cursor-pointer w-full py-2">
                        <Upload className="h-6 w-6 text-muted-foreground mb-1" />
                        <span className="text-xs font-medium text-foreground">Upload from Device / Gallery</span>
                        <span className="text-[10px] text-muted-foreground mt-0.5">PNG, JPG, WEBP up to 5MB</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleFileChange}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-[1px] flex-1 bg-border" />
                    <span className="text-[10px] uppercase font-mono text-muted-foreground">or image url</span>
                    <div className="h-[1px] flex-1 bg-border" />
                  </div>

                  <input
                    type="url"
                    value={formData.image.startsWith('data:') ? '' : formData.image}
                    onChange={(e) => {
                      const url = e.target.value;
                      setFormData({ ...formData, image: url });
                      setImagePreview(url);
                    }}
                    placeholder="https://images.unsplash.com/..."
                    className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">
                    Description / Flavor Profile
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Short description of ingredients or taste..."
                    rows={3}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                  />
                  {formErrors.description && (
                    <p className="mt-1 text-xs text-destructive">{formErrors.description}</p>
                  )}
                </div>

                {modalKind === 'product' && (
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">
                      Extras eligible <span className="text-[10px] text-muted-foreground/70 font-normal">(Optional)</span>
                    </label>
                    {extraProducts.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-border bg-secondary/30 px-3 py-3 text-xs text-muted-foreground">
                        No extras yet — create one in the Extras section to make it eligible here.
                      </p>
                    ) : (
                      <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-border bg-background p-2">
                        {extraProducts.map((extra) => {
                          const checked = formData.eligibleExtraIds.includes(extra.id);
                          return (
                            <label
                              key={extra.id}
                              className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-secondary"
                            >
                              <span className="text-foreground">{extra.name}</span>
                              <span className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">₱{extra.price}</span>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    setFormData((prev) => ({
                                      ...prev,
                                      eligibleExtraIds: checked
                                        ? prev.eligibleExtraIds.filter((id) => id !== extra.id)
                                        : [...prev.eligibleExtraIds, extra.id],
                                    }))
                                  }
                                  className="h-4 w-4 accent-primary"
                                />
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsModalOpen(false)}
                    className="rounded-full px-4"
                  >
                    Cancel
                  </Button>
                  <Button type="submit" className="rounded-full px-5">
                    {editingProduct
                      ? 'Save Changes'
                      : modalKind === 'extra'
                        ? 'Create Extra'
                        : 'Create Product'}
                  </Button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* US-012: Delete Confirmation Modal */}
      {deleteTargetId &&
        createPortal(
          <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
            <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-2xl text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive mb-3">
                <Trash2 className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-foreground">Delete Product</h3>
              <p className="mt-2 text-xs text-muted-foreground">
                Are you sure you want to remove this item from your menu catalog? This action cannot be undone.
              </p>
              <div className="mt-6 flex justify-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => setDeleteTargetId(null)}
                  className="rounded-full px-5"
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteProduct}
                  className="rounded-full px-5"
                >
                  Delete
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* US-018: Cancel Order Modal */}
      {cancelTarget &&
        createPortal(
          <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
            <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-2xl">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive mb-3">
                <X className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-foreground text-center">Cancel Order</h3>
              <p className="mt-2 text-xs text-muted-foreground text-center">
                Ref #{cancelTarget.id.slice(-6).toUpperCase()} — this cannot be undone.
              </p>

              <div className="mt-4 space-y-2">
                <label className="block text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  Reason
                </label>
                {CANCELLATION_REASONS.map((reason) => (
                  <label
                    key={reason.value}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm cursor-pointer ${
                      cancelReason === reason.value ? 'border-primary bg-primary/5' : 'border-border'
                    }`}
                  >
                    <input
                      type="radio"
                      name="cancel-reason"
                      value={reason.value}
                      checked={cancelReason === reason.value}
                      onChange={(e) => setCancelReason(e.target.value)}
                    />
                    {reason.label}
                    {reason.value === 'NOT_AVAILABLE' && (
                      <span className="ml-auto text-[10px] text-muted-foreground">Marks item(s) unavailable</span>
                    )}
                  </label>
                ))}
                {cancelReason === 'OTHER' && (
                  <textarea
                    value={cancelNote}
                    onChange={(e) => setCancelNote(e.target.value)}
                    placeholder="Explain the reason..."
                    rows={2}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                )}
              </div>

              <div className="mt-6 flex justify-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setCancelTarget(null);
                    setCancelReason('');
                    setCancelNote('');
                  }}
                  className="rounded-full px-5"
                >
                  Back
                </Button>
                <Button
                  variant="destructive"
                  disabled={
                    isUpdatingStatus ||
                    !cancelReason ||
                    (cancelReason === 'OTHER' && !cancelNote.trim())
                  }
                  onClick={handleCancelOrder}
                  className="rounded-full px-5"
                >
                  {isUpdatingStatus ? 'Cancelling...' : 'Cancel Order'}
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </main>
  );
}