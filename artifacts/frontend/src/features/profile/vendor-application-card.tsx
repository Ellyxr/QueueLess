import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Clock,
  FileText,
  IdCard,
  Loader2,
  Store,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  VENDOR_PLANS,
  getVendorApplication,
  isContractOverdue,
  retryVendorPayment,
  submitSignedContract,
  submitVendorApplication,
  type VendorPlanId,
} from "./vendor-application";
import { VendorTermsDialog } from "./vendor-terms-dialog";

const MAX_PHOTO_DIMENSION = 480;

/** Resizes an uploaded photo before storing it, so it doesn't blow past localStorage limits. Mock-only — a real upload would go straight to backend storage. */
function resizeImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That file doesn't look like an image."));
      img.onload = () => {
        const scale = Math.min(1, MAX_PHOTO_DIMENSION / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not process that image."));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function PhotoUploadField({
  label,
  hint,
  preview,
  onChange,
}: {
  label: string;
  hint?: string;
  preview: string | null;
  onChange: (dataUrl: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setError(null);
    try {
      onChange(await resizeImageToDataUrl(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not process that photo.");
    }
  };

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div className="flex items-center gap-3">
        {preview ? (
          <img
            src={preview}
            alt={`${label} preview`}
            className="h-16 w-24 rounded-lg border border-border object-cover"
          />
        ) : (
          <div className="flex h-16 w-24 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground">
            <IdCard className="h-5 w-5" />
          </div>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 rounded-full"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-3.5 w-3.5" />
          {preview ? "Replace photo" : "Upload photo"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            handleFileChange(event.target.files);
            event.target.value = "";
          }}
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function StatusBanner({
  icon,
  title,
  detail,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  tone?: "neutral" | "success" | "warning";
}) {
  const toneClasses =
    tone === "success"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
      : tone === "warning"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-600"
        : "border-border bg-secondary/30 text-foreground";
  return (
    <div className={`rounded-[18px] border p-4 text-center ${toneClasses}`}>
      <div className="mx-auto flex h-5 w-5 items-center justify-center">{icon}</div>
      <p className="mt-2 text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

export function VendorApplicationCard() {
  const [application, setApplication] = useState(getVendorApplication);
  const [showForm, setShowForm] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [foodCategory, setFoodCategory] = useState("");
  const [validIdPhoto, setValidIdPhoto] = useState<string | null>(null);
  const [idSelfiePhoto, setIdSelfiePhoto] = useState<string | null>(null);
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankAccountHolderName, setBankAccountHolderName] = useState("");
  const [planId, setPlanId] = useState<VendorPlanId | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showTermsDialog, setShowTermsDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedContractPhoto, setSignedContractPhoto] = useState<string | null>(null);

  const handleSubmit = () => {
    setError(null);
    if (!businessName.trim()) return setError("Enter your business or stall name.");
    if (!foodCategory.trim()) return setError("Enter what you'll sell.");
    if (!validIdPhoto) return setError("Upload a photo of one valid ID.");
    if (!idSelfiePhoto) return setError("Upload a photo of yourself holding that ID.");
    if (!bankAccountNumber.trim()) return setError("Enter your bank account number.");
    if (!bankAccountHolderName.trim()) return setError("Enter the bank account holder name.");
    if (!planId) return setError("Choose a subscription plan.");
    if (!termsAccepted) return setError("You must agree to the Terms and Conditions.");

    submitVendorApplication({
      businessName: businessName.trim(),
      foodCategory: foodCategory.trim(),
      validIdPhoto,
      idSelfiePhoto,
      bankAccountNumber: bankAccountNumber.trim(),
      bankAccountHolderName: bankAccountHolderName.trim(),
      planId,
      termsAccepted,
    });
    setApplication(getVendorApplication());
    setShowForm(false);
  };

  const handleContractSubmit = () => {
    if (!signedContractPhoto) return;
    submitSignedContract(signedContractPhoto);
    setApplication(getVendorApplication());
  };

  const handleRetryPayment = () => {
    retryVendorPayment();
    setApplication(getVendorApplication());
  };

  useEffect(() => {
    if (application.status !== "payment_processing") return;
    const interval = window.setInterval(() => setApplication(getVendorApplication()), 500);
    return () => window.clearInterval(interval);
  }, [application.status]);

  const contractOverdue = isContractOverdue(application);
  const contractDaysLeft = application.contractDueAt
    ? Math.max(
        0,
        Math.ceil(
          (new Date(application.contractDueAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        ),
      )
    : null;

  return (
    <Card className="border-card-border/80 bg-card/90 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-2xl tracking-tighter">
          <Store className="h-5 w-5 text-primary" />
          Become a vendor
        </CardTitle>
        <CardDescription>
          Sell food or goods on campus as a student vendor.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {application.status === "pending_review" && (
          <StatusBanner
            icon={<Clock className="h-5 w-5" />}
            title="Application under review"
            detail="An admin is verifying your documents. We'll notify you once a decision is made."
          />
        )}

        {application.status === "rejected" && (
          <StatusBanner
            icon={<X className="h-5 w-5" />}
            title="Application not approved"
            detail={
              application.rejectionReason ||
              "Your application wasn't approved this time. Contact support for details."
            }
            tone="warning"
          />
        )}

        {application.status === "awaiting_contract" && (
          <div className="space-y-3">
            {contractOverdue ? (
              <StatusBanner
                icon={<AlertTriangle className="h-5 w-5" />}
                title="Contract window expired"
                detail="The 7-day window to return your signed contract has passed. Upload it now to re-open your application, or contact support."
                tone="warning"
              />
            ) : (
              <StatusBanner
                icon={<FileText className="h-5 w-5" />}
                title="Application approved — contract required"
                detail={`Print your vendor contract, fill it out in wet ink, sign it, and upload the scanned copy${
                  contractDaysLeft !== null ? ` within ${contractDaysLeft} day${contractDaysLeft === 1 ? "" : "s"}` : " within 7 days"
                }.`}
                tone="success"
              />
            )}
            {application.contractRejectionReason && (
              <p className="text-xs text-destructive">
                Previous scan rejected: {application.contractRejectionReason}
              </p>
            )}
            <PhotoUploadField
              label="Signed contract scan"
              hint="Upload a clear scan or photo of the fully signed contract."
              preview={signedContractPhoto}
              onChange={setSignedContractPhoto}
            />
            <Button
              type="button"
              className="w-full rounded-full"
              disabled={!signedContractPhoto}
              onClick={handleContractSubmit}
            >
              Submit signed contract
            </Button>
          </div>
        )}

        {application.status === "contract_submitted" && (
          <StatusBanner
            icon={<Clock className="h-5 w-5" />}
            title="Contract submitted — awaiting verification"
            detail="We're verifying your signed contract. Your subscription will be charged and your storefront activated once this is confirmed."
          />
        )}

        {application.status === "payment_processing" && (
          <StatusBanner
            icon={<Loader2 className="h-5 w-5 animate-spin" />}
            title="Processing your subscription payment"
            detail="Your contract is verified. We're charging your bank account for the selected plan — this only takes a moment."
          />
        )}

        {application.status === "payment_failed" && (
          <div className="space-y-3">
            <StatusBanner
              icon={<AlertTriangle className="h-5 w-5" />}
              title="Subscription payment failed"
              detail={
                application.paymentFailureReason ||
                "We couldn't charge your bank account for the selected plan."
              }
              tone="warning"
            />
            <Button type="button" className="w-full rounded-full" onClick={handleRetryPayment}>
              Retry payment
            </Button>
          </div>
        )}

        {application.status === "active" && (
          <StatusBanner
            icon={<Check className="h-5 w-5" />}
            title="You're a verified student vendor"
            detail="Your subscription is active. Manage your storefront from the Vendor dashboard."
            tone="success"
          />
        )}

        {application.status === "not_applied" &&
          (showForm ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Vendor application</p>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Close vendor application form"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-2">
                <label htmlFor="vendor-business-name" className="text-sm font-medium">
                  Business / stall name
                </label>
                <Input
                  id="vendor-business-name"
                  value={businessName}
                  onChange={(event) => setBusinessName(event.target.value)}
                  placeholder="e.g. North Loop Kitchen"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="vendor-food-category" className="text-sm font-medium">
                  What will you sell? (food category)
                </label>
                <Input
                  id="vendor-food-category"
                  value={foodCategory}
                  onChange={(event) => setFoodCategory(event.target.value)}
                  placeholder="e.g. Rice meals and snacks"
                />
              </div>

              <PhotoUploadField
                label="One valid ID"
                hint="School ID, government ID, or similar."
                preview={validIdPhoto}
                onChange={setValidIdPhoto}
              />

              <PhotoUploadField
                label="Photo holding your ID"
                hint="A selfie of you holding the same ID, for identity verification."
                preview={idSelfiePhoto}
                onChange={setIdSelfiePhoto}
              />

              <div className="space-y-3 rounded-[18px] border border-border bg-secondary/20 p-3">
                <p className="text-sm font-medium">Bank account for subscription billing</p>
                <div className="space-y-2">
                  <label htmlFor="vendor-bank-account-number" className="text-xs font-medium text-muted-foreground">
                    Account number
                  </label>
                  <Input
                    id="vendor-bank-account-number"
                    value={bankAccountNumber}
                    onChange={(event) => setBankAccountNumber(event.target.value)}
                    placeholder="e.g. 0123456789"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="vendor-bank-account-name" className="text-xs font-medium text-muted-foreground">
                    Account holder name
                  </label>
                  <Input
                    id="vendor-bank-account-name"
                    value={bankAccountHolderName}
                    onChange={(event) => setBankAccountHolderName(event.target.value)}
                    placeholder="Name on the bank account"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Subscription plan</p>
                <RadioGroup
                  value={planId ?? undefined}
                  onValueChange={(value) => setPlanId(value as VendorPlanId)}
                  className="gap-2"
                >
                  {(Object.entries(VENDOR_PLANS) as [VendorPlanId, (typeof VENDOR_PLANS)[VendorPlanId]][]).map(
                    ([id, plan]) => (
                      <label
                        key={id}
                        htmlFor={`vendor-plan-${id}`}
                        className="flex cursor-pointer items-center justify-between gap-3 rounded-[18px] border border-border bg-secondary/20 p-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                      >
                        <div className="flex items-center gap-3">
                          <RadioGroupItem value={id} id={`vendor-plan-${id}`} />
                          <div>
                            <p className="text-sm font-medium">{plan.label}</p>
                            {plan.promo && (
                              <p className="text-xs text-emerald-600">{plan.promo}</p>
                            )}
                          </div>
                        </div>
                        <p className="text-sm font-semibold">₱{plan.price}</p>
                      </label>
                    ),
                  )}
                </RadioGroup>
              </div>

              <div className="flex items-start gap-2">
                <Checkbox
                  id="vendor-terms-checkbox"
                  checked={termsAccepted}
                  onCheckedChange={(checked) => {
                    if (checked && !termsAccepted) {
                      setShowTermsDialog(true);
                      return;
                    }
                    setTermsAccepted(Boolean(checked));
                  }}
                  className="mt-0.5"
                />
                <label htmlFor="vendor-terms-checkbox" className="text-sm text-foreground">
                  I agree to the{" "}
                  <button
                    type="button"
                    onClick={() => setShowTermsDialog(true)}
                    className="font-medium text-primary underline underline-offset-2"
                  >
                    Terms and Conditions
                  </button>{" "}
                  for student vendors.
                </label>
              </div>

              <p className="text-xs text-muted-foreground">
                Your chosen subscription plan will only be deducted from your bank account
                after your application is approved, your identity is verified, and you've
                signed the vendor contract.
              </p>

              {error && <p className="text-xs text-destructive">{error}</p>}

              <Button type="button" className="w-full rounded-full" onClick={handleSubmit}>
                Apply to be a student vendor
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2 rounded-full"
              onClick={() => setShowForm(true)}
            >
              <Store className="h-4 w-4" />
              Apply to be a student vendor
            </Button>
          ))}
      </CardContent>

      <VendorTermsDialog
        open={showTermsDialog}
        onOpenChange={setShowTermsDialog}
        onAgree={() => setTermsAccepted(true)}
      />
    </Card>
  );
}
