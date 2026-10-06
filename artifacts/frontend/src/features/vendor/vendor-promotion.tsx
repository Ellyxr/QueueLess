import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useReactToPrint } from 'react-to-print';
import { QRCodeSVG } from 'qrcode.react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Loader2,
  MapPin,
  Megaphone,
  Phone,
  Plus,
  Printer,
  Sparkles,
  Store,
  Tag,
  Trash2,
  Upload,
  Wallet,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useRequireAuth } from '@/hooks/use-require-auth';
import {
  createDeal,
  createFeaturedListing,
  cancelFeaturedListing,
  deleteDeal,
  getMyFeaturedListings,
  getMyProfile,
  getMyVendor,
  getVendorDashboard,
  getVendorStorefront,
  listFeaturedPlans,
  listMyDeals,
  updateDeal,
  uploadPromotionImage,
  type CreateDealInput,
  type CreateFeaturedListingInput,
  type Deal,
  type DealDiscountType,
  type DealTriggerType,
  type FeaturedListingPaymentMethod,
  type FeaturedListingPlan,
  type MyFeaturedListing,
  type ProfileData,
  type VendorStorefront,
} from '@/features/auth/api';
import { EXTRA_CATEGORY } from '@/lib/product-extras';

const DISCOUNT_LADDER_COPY = ['1st vendor: 30% off', '2nd vendor: 20% off', '3rd vendor: 10% off', '4th+: full price'];

const PLACEHOLDER_PRODUCT_IMAGE =
  'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80';

export default function VendorPromotionPage() {
  useRequireAuth(['vendor', 'student_vendor', 'admin']);

  const [vendor, setVendor] = useState<VendorStorefront | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const [deals, setDeals] = useState<Deal[]>([]);
  const [featuredPlans, setFeaturedPlans] = useState<FeaturedListingPlan[]>([]);
  const [myFeaturedListings, setMyFeaturedListings] = useState<MyFeaturedListing[]>([]);
  const [walletBalance, setWalletBalance] = useState('0.00');
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isDealDialogOpen, setIsDealDialogOpen] = useState(false);
  const [isFeaturedDialogOpen, setIsFeaturedDialogOpen] = useState(false);

  const flyerRef = useRef<HTMLDivElement>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3000);
  };

  const refreshPromotions = () => {
    listMyDeals().then(setDeals).catch(() => {});
    getMyFeaturedListings().then(setMyFeaturedListings).catch(() => {});
    getVendorDashboard().then((d) => setWalletBalance(d.ledgerBalance)).catch(() => {});
  };

  const handleCancelFeaturedListing = async (listingId: string) => {
    try {
      await cancelFeaturedListing(listingId);

      setMyFeaturedListings((prev) =>
        prev.map((listing) =>
          listing.id === listingId
            ? { ...listing, status: "CANCELLED" }
            : listing,
        ),
      );

      showToast("Featured listing cancelled.");
    } catch (error: unknown) {
      showToast(
        error instanceof Error
          ? error.message
          : "Unable to cancel featured listing.",
        "error",
      );
    }
  };

  useEffect(() => {
    Promise.all([getMyVendor().then((v) => getVendorStorefront(v.id)), getMyProfile()])
      .then(([vendorData, profileData]) => {
        setVendor(vendorData);
        setProfile(profileData);
      })
      .catch(() => setHasError(true))
      .finally(() => setIsLoading(false));
    listFeaturedPlans().then(setFeaturedPlans).catch(() => {});
    refreshPromotions();
  }, []);

  const handlePrint = useReactToPrint({
    contentRef: flyerRef,
    documentTitle: vendor ? `${vendor.name} - Promotion Flyer` : 'Promotion Flyer',
    pageStyle: '@page { size: letter; margin: 0.5in; }',
  });

  const handleDownloadPdf = async () => {
    if (!flyerRef.current || isDownloading) return;
    setIsDownloading(true);
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas-pro'),
        import('jspdf'),
      ]);

      const canvas = await html2canvas(flyerRef.current, { scale: 2 });
      const imageData = canvas.toDataURL('image/png');

      // Letter size in points: 8.5in x 11in
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 36;
      const maxWidth = pageWidth - margin * 2;
      const maxHeight = pageHeight - margin * 2;
      const scale = Math.min(maxWidth / canvas.width, maxHeight / canvas.height);
      const renderWidth = canvas.width * scale;
      const renderHeight = canvas.height * scale;

      pdf.addImage(
        imageData,
        'PNG',
        (pageWidth - renderWidth) / 2,
        margin,
        renderWidth,
        renderHeight,
      );
      pdf.save(`${vendor?.name || 'promotion'}-flyer.pdf`);
    } finally {
      setIsDownloading(false);
    }
  };

  if (isLoading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading your promotion page...</div>
      </main>
    );
  }

  if (hasError || !vendor) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">Promotion page unavailable</h1>
          <p className="mt-2 text-muted-foreground">We couldn't load your promotion details right now.</p>
        </div>
      </main>
    );
  }

  const storefrontUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/store/${vendor.id}` : `/store/${vendor.id}`;
  const promotableProducts = (vendor.products ?? []).filter(
    (product) => product.category !== EXTRA_CATEGORY,
  );
  const previewProducts = promotableProducts.filter((product) => product.isAvailable).slice(0, 3);
  const fallbackProducts = previewProducts.length > 0 ? previewProducts : promotableProducts.slice(0, 3);

  return (
    <main className="mx-auto min-h-dvh max-w-4xl bg-background px-4 py-8 sm:px-6">
      <div className="mb-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Grow your store</p>
        <h1 className="mt-2 flex items-center gap-2 text-3xl font-semibold tracking-[-0.05em] text-foreground">
          <Megaphone className="h-7 w-7 text-primary" />
          Promotion
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Share your QR code so customers can find your storefront instantly, and preview your featured items.
        </p>
      </div>

      {/* Printable preview section */}
      <section className="mb-10">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Preview</p>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-foreground">Printable QR flyer</h2>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => handlePrint()}
              className="rounded-full px-4"
            >
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
            <Button
              onClick={handleDownloadPdf}
              disabled={isDownloading}
              className="rounded-full px-4"
            >
              <Download className="mr-2 h-4 w-4" />
              {isDownloading ? 'Preparing...' : 'Download PDF'}
            </Button>
          </div>
        </div>

        <Card className="overflow-hidden border-card-border/80 bg-card/90 shadow-sm">
          <CardContent className="p-0">
            <div ref={flyerRef} className="bg-white p-8 text-black">
              {/* Credentials */}
              <div className="border-b border-black/10 pb-5 text-center">
                <h3 className="text-2xl font-bold tracking-[-0.03em]">{vendor.name}</h3>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-black/70">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" />
                    {vendor.campusLocation || 'Location not set'}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Phone className="h-4 w-4" />
                    {profile?.phone || 'Contact number not set'}
                  </span>
                </div>
              </div>

              {/* QR code */}
              <div className="flex flex-col items-center gap-3 py-8">
                <div className="rounded-2xl border border-black/10 p-4">
                  <QRCodeSVG value={storefrontUrl} size={200} level="M" marginSize={2} />
                </div>
                <p className="flex items-center gap-1.5 text-xs uppercase tracking-[0.18em] text-black/50">
                  <Store className="h-3.5 w-3.5" />
                  Scan to visit storefront
                </p>
              </div>

              {/* Product preview cards */}
              {fallbackProducts.length > 0 && (
                <div className="mt-4 border-t border-black/10 pt-6">
                  <p className="mb-3 text-center text-xs font-semibold uppercase tracking-[0.18em] text-black/50">
                    Featured items
                  </p>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    {fallbackProducts.map((product) => (
                      <div
                        key={product.id}
                        className="flex flex-1 items-center gap-3 rounded-xl border border-black/10 p-3"
                      >
                        <img
                          src={PLACEHOLDER_PRODUCT_IMAGE}
                          alt={product.name}
                          className="h-14 w-14 shrink-0 rounded-lg object-cover"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{product.name}</p>
                          <p className="text-xs text-black/60">
                            ₱{Number(product.price).toLocaleString('en-PH')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Deals */}
      <section className="mb-10">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Drive sales</p>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-foreground">Deals</h2>
          </div>
          <Button onClick={() => setIsDealDialogOpen(true)} disabled={promotableProducts.length === 0} className="rounded-full px-4">
            <Plus className="mr-2 h-4 w-4" />
            Add deal
          </Button>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Active deals appear as a discount carousel on the marketplace, right below your section. Deals with no
          minimum order always show first &mdash; they're the easiest for buyers to grab.
        </p>
        {deals.length === 0 ? (
          <Card className="border-dashed border-card-border/80 bg-card/60 shadow-none">
            <CardContent className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <Tag className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {promotableProducts.length === 0
                  ? 'Add an available product first, then come back to create a deal.'
                  : "You haven't created any deals yet."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {deals.map((deal) => (
              <Card key={deal.id} className="border-card-border/80 bg-card/90 shadow-sm">
                <CardContent className="flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{deal.product.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {deal.discountType === 'PERCENTAGE' ? `${Number(deal.discountValue)}% off` : `₱${Number(deal.discountValue).toLocaleString('en-PH')} off`}
                      {deal.triggerType === 'NONE' && ' · No minimum'}
                      {deal.triggerType === 'MIN_QUANTITY' && ` · Min ${deal.triggerValue} qty`}
                      {deal.triggerType === 'MIN_ORDER_AMOUNT' && ` · Min ₱${Number(deal.triggerValue).toLocaleString('en-PH')} order`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={deal.isActive}
                      onCheckedChange={(checked) =>
                        updateDeal(deal.id, { isActive: checked })
                          .then((updated) => setDeals((prev) => prev.map((d) => (d.id === updated.id ? updated : d))))
                          .catch((error: unknown) => showToast(error instanceof Error ? error.message : 'Unable to update deal.', 'error'))
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        deleteDeal(deal.id)
                          .then(() => setDeals((prev) => prev.filter((d) => d.id !== deal.id)))
                          .catch((error: unknown) => showToast(error instanceof Error ? error.message : 'Unable to delete deal.', 'error'))
                      }
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Featured listing / marketplace promo card */}
      <section>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Boost visibility</p>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-foreground">Featured listing</h2>
          </div>
          <Button onClick={() => setIsFeaturedDialogOpen(true)} className="rounded-full px-4">
            <Sparkles className="mr-2 h-4 w-4" />
            Avail featured listing
          </Button>
        </div>
        <Card className="border-card-border/80 bg-card/60 shadow-none">
          <CardContent className="flex flex-col gap-2 px-6 py-6 text-sm text-muted-foreground">
            <p>
              Get your store or a product featured on the marketplace's promo card. It's first come, first served
              &mdash; the earlier you avail, the bigger your discount:
            </p>
            <ul className="ml-4 list-disc">
              {DISCOUNT_LADDER_COPY.map((line) => <li key={line}>{line}</li>)}
            </ul>
            <p>Wallet balance available for promotions: <span className="font-semibold text-foreground">₱{Number(walletBalance).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span></p>
          </CardContent>
        </Card>

        {myFeaturedListings.length > 0 && (
          <div className="mt-4 flex flex-col gap-3">
            {myFeaturedListings.map((listing) => (
              <Card key={listing.id} className="border-card-border/80 bg-card/90 shadow-sm">
                <CardContent className="flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {listing.product?.name ?? vendor.name} &middot; {listing.plan?.name ?? listing.placement}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {listing.status === 'ACTIVE' && listing.endDate
                        ? `Active until ${new Date(listing.endDate).toLocaleDateString()}`
                        : listing.status}
                      {listing.discountPercent > 0 && ` · ${listing.discountPercent}% off applied`}
                      {listing.pricePaid && ` · ₱${Number(listing.pricePaid).toLocaleString('en-PH')} paid`}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Badge variant={listing.status === 'ACTIVE' ? 'default' : 'secondary'}>
                      {listing.status}
                    </Badge>

                    {(listing.status === 'ACTIVE' || listing.status === 'PENDING') && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCancelFeaturedListing(listing.id)}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                  
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {isDealDialogOpen && (
        <AddDealDialog
          products={promotableProducts}
          onClose={() => setIsDealDialogOpen(false)}
          onCreated={(deal) => {
            setDeals((prev) => [deal, ...prev]);
            setIsDealDialogOpen(false);
            showToast('Deal created.');
          }}
          onError={(message) => showToast(message, 'error')}
        />
      )}

      {isFeaturedDialogOpen && (
        <AvailFeaturedListingDialog
          products={promotableProducts}
          plans={featuredPlans}
          walletBalance={walletBalance}
          onClose={() => setIsFeaturedDialogOpen(false)}
          onCreated={(result) => {
            setIsFeaturedDialogOpen(false);
            if (result.checkoutUrl) {
              window.location.href = result.checkoutUrl;
              return;
            }
            refreshPromotions();
            showToast(
              result.discountPercent
                ? `Featured listing activated with ${result.discountPercent}% off!`
                : 'Featured listing activated!',
            );
          }}
          onError={(message) => showToast(message, 'error')}
        />
      )}

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
    </main>
  );
}

interface DealFormProduct {
  id: string;
  name: string;
  price: number;
}

function AddDealDialog({
  products,
  onClose,
  onCreated,
  onError,
}: {
  products: DealFormProduct[];
  onClose: () => void;
  onCreated: (deal: Deal) => void;
  onError: (message: string) => void;
}) {
  const [productId, setProductId] = useState(products[0]?.id ?? '');
  const [discountType, setDiscountType] = useState<DealDiscountType>('PERCENTAGE');
  const [discountValue, setDiscountValue] = useState('10');
  const [triggerType, setTriggerType] = useState<DealTriggerType>('NONE');
  const [triggerValue, setTriggerValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!productId || !discountValue) return;
    setIsSubmitting(true);
    try {
      const input: CreateDealInput = {
        productId,
        discountType,
        discountValue: Number(discountValue),
        triggerType,
        ...(triggerType !== 'NONE' ? { triggerValue: Number(triggerValue) } : {}),
      };
      const deal = await createDeal(input);
      onCreated(deal);
    } catch (error: unknown) {
      onError(error instanceof Error ? error.message : 'Unable to create deal.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a deal</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label>Product</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger><SelectValue placeholder="Choose a product" /></SelectTrigger>
              <SelectContent>
                {products.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.name} (₱{Number(product.price).toLocaleString('en-PH')})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Discount</Label>
            <RadioGroup value={discountType} onValueChange={(v) => setDiscountType(v as DealDiscountType)} className="flex gap-4">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="PERCENTAGE" id="discount-percentage" />
                <Label htmlFor="discount-percentage" className="font-normal">Percentage off</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="FIXED_AMOUNT" id="discount-amount" />
                <Label htmlFor="discount-amount" className="font-normal">Amount off</Label>
              </div>
            </RadioGroup>
            <Input
              type="number"
              min={1}
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              placeholder={discountType === 'PERCENTAGE' ? 'e.g. 10 (%)' : 'e.g. 20 (₱)'}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Activates when</Label>
            <RadioGroup value={triggerType} onValueChange={(v) => setTriggerType(v as DealTriggerType)} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="NONE" id="trigger-none" />
                <Label htmlFor="trigger-none" className="font-normal">No minimum &mdash; discounts immediately</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="MIN_QUANTITY" id="trigger-qty" />
                <Label htmlFor="trigger-qty" className="font-normal">Minimum quantity of this product</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="MIN_ORDER_AMOUNT" id="trigger-amount" />
                <Label htmlFor="trigger-amount" className="font-normal">Minimum order amount</Label>
              </div>
            </RadioGroup>
            {triggerType !== 'NONE' && (
              <Input
                type="number"
                min={1}
                value={triggerValue}
                onChange={(e) => setTriggerValue(e.target.value)}
                placeholder={triggerType === 'MIN_QUANTITY' ? 'e.g. 3 (qty)' : 'e.g. 500 (₱)'}
              />
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !productId || !discountValue}>
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Create deal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface FeaturedFormProduct {
  id: string;
  name: string;
  imageUrl?: string | null;
}

function AvailFeaturedListingDialog({
  products,
  plans,
  walletBalance,
  onClose,
  onCreated,
  onError,
}: {
  products: FeaturedFormProduct[];
  plans: FeaturedListingPlan[];
  walletBalance: string;
  onClose: () => void;
  onCreated: (result: { checkoutUrl?: string; discountPercent?: number }) => void;
  onError: (message: string) => void;
}) {
  const marketplacePlans = plans.filter((plan) => plan.placement === 'MARKETPLACE_HOME');
  const [planId, setPlanId] = useState(marketplacePlans[0]?.id ?? '');
  const [productId, setProductId] = useState<string>('none');
  const [paymentMethod, setPaymentMethod] = useState<FeaturedListingPaymentMethod>('PAYMONGO');
  const [customImageUrl, setCustomImageUrl] = useState<string | undefined>(undefined);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleImageChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingImage(true);
    try {
      const { url } = await uploadPromotionImage(file);
      setCustomImageUrl(url);
    } catch (error: unknown) {
      onError(error instanceof Error ? error.message : 'Image upload failed.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleSubmit = async () => {
    if (!planId) return;
    setIsSubmitting(true);
    try {
      const input: CreateFeaturedListingInput = {
        planId,
        ...(productId !== 'none' ? { productId } : {}),
        ...(customImageUrl ? { imageUrl: customImageUrl } : {}),
        paymentMethod,
      };
      const result = await createFeaturedListing(input);
      onCreated({ checkoutUrl: result.checkoutUrl, discountPercent: result.discountPercent });
    } catch (error: unknown) {
      onError(error instanceof Error ? error.message : 'Unable to avail featured listing.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Avail featured listing</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label>Plan</Label>
            <Select value={planId} onValueChange={setPlanId}>
              <SelectTrigger><SelectValue placeholder="Choose a plan" /></SelectTrigger>
              <SelectContent>
                {marketplacePlans.map((plan) => (
                  <SelectItem key={plan.id} value={plan.id}>
                    {plan.name} &mdash; ₱{Number(plan.price).toLocaleString('en-PH')} / {plan.durationDays}d
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Product (optional)</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger><SelectValue placeholder="No specific product" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No specific product</SelectItem>
                {products.map((product) => (
                  <SelectItem key={product.id} value={product.id}>{product.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Custom promo image (optional)</Label>
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-card-border/80 px-3 py-2 text-sm text-muted-foreground hover:bg-card/60">
              <Upload className="h-4 w-4" />
              {isUploadingImage ? 'Uploading...' : customImageUrl ? 'Image selected' : 'Defaults to the product image'}
              <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
            </label>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Payment method</Label>
            <RadioGroup value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as FeaturedListingPaymentMethod)} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="PAYMONGO" id="pay-paymongo" />
                <Label htmlFor="pay-paymongo" className="font-normal">PayMongo sandbox checkout</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="WALLET" id="pay-wallet" />
                <Label htmlFor="pay-wallet" className="flex items-center gap-1.5 font-normal">
                  <Wallet className="h-3.5 w-3.5" />
                  Vendor wallet balance (₱{Number(walletBalance).toLocaleString('en-PH', { minimumFractionDigits: 2 })})
                </Label>
              </div>
            </RadioGroup>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !planId || isUploadingImage}>
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Avail listing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
