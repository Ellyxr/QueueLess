import { useEffect, useRef, useState } from 'react';
import { useReactToPrint } from 'react-to-print';
import { QRCodeSVG } from 'qrcode.react';
import {
  Download,
  Lock,
  MapPin,
  Megaphone,
  Phone,
  Printer,
  Sparkles,
  Store,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useRequireAuth } from '@/hooks/use-require-auth';
import {
  getMyProfile,
  getMyVendor,
  getVendorStorefront,
  type ProfileData,
  type VendorStorefront,
} from '@/features/auth/api';
import { EXTRA_CATEGORY } from '@/lib/product-extras';

const PLACEHOLDER_PRODUCT_IMAGE =
  'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80';

export default function VendorPromotionPage() {
  useRequireAuth(['vendor', 'student_vendor', 'admin']);

  const [vendor, setVendor] = useState<VendorStorefront | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const flyerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([getMyVendor().then((v) => getVendorStorefront(v.id)), getMyProfile()])
      .then(([vendorData, profileData]) => {
        setVendor(vendorData);
        setProfile(profileData);
      })
      .catch(() => setHasError(true))
      .finally(() => setIsLoading(false));
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

      {/* Featured listing (paid feature) - empty state */}
      <section>
        <div className="mb-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Boost visibility</p>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-foreground">Featured listing</h2>
        </div>
        <Card className="border-dashed border-card-border/80 bg-card/60 shadow-none">
          <CardContent className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Lock className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">Get featured on the marketplace</h3>
            <p className="max-w-sm text-sm text-muted-foreground">
              Featured listings put your store and products in front of more buyers. This is a paid add-on
              that's coming soon.
            </p>
            <Button disabled variant="secondary" className="mt-2 rounded-full px-5">
              <Sparkles className="mr-2 h-4 w-4" />
              Coming soon
            </Button>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
