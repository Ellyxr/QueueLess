import { useEffect, useMemo, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  contactVendor,
  requestOrderRefund,
  type RefundCategory,
} from "@/features/auth/api";

const MAX_ATTACHMENTS = 4;

const FIVE_MIN_MS = 5 * 60 * 1000;
const TWO_MIN_MS = 2 * 60 * 1000;

interface CategoryOption {
  value: RefundCategory;
  label: string;
  auto: boolean;
}

const CATEGORY_OPTIONS: CategoryOption[] = [
  { value: "VENDOR_NOT_ACCEPTED", label: "Vendor hasn't accepted my order (5+ minutes)", auto: true },
  { value: "VENDOR_UNRESPONSIVE", label: "Vendor stopped responding after I contacted them", auto: true },
  { value: "WRONG_ITEM", label: "I received the wrong item", auto: false },
  { value: "MISSING_ITEM", label: "An item is missing from my order", auto: false },
  { value: "QUALITY_ISSUE", label: "There's a quality problem with my order", auto: false },
  { value: "INCORRECTLY_COMPLETED", label: "This order was marked completed incorrectly", auto: false },
  { value: "DISAGREEMENT", label: "I disagree with the vendor about what happened", auto: false },
  { value: "OUTSIDE_WINDOW", label: "Requesting a refund outside the normal window", auto: false },
  { value: "OTHER", label: "Something else", auto: false },
];

export interface RefundableOrder {
  status: string;
  paidAt: string | null;
  buyerContactPingAt: string | null;
}

export function RefundRequestDialog({
  open,
  onOpenChange,
  orderId,
  order,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  order: RefundableOrder;
  onSuccess?: (message: string) => void;
}) {
  const [category, setCategory] = useState<RefundCategory | null>(null);
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isContacting, setIsContacting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buyerContactPingAt, setBuyerContactPingAt] = useState(order.buyerContactPingAt);
  const [attachments, setAttachments] = useState<File[]>([]);

  const attachmentPreviews = useMemo(
    () => attachments.map((file) => URL.createObjectURL(file)),
    [attachments],
  );

  useEffect(() => {
    return () => {
      attachmentPreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [attachmentPreviews]);

  const vendorAcceptEligible = useMemo(() => {
    if (order.status !== "PAID" || !order.paidAt) return false;
    return Date.now() - new Date(order.paidAt).getTime() >= FIVE_MIN_MS;
  }, [order.status, order.paidAt]);

  const vendorUnresponsiveEligible = useMemo(() => {
    if (!buyerContactPingAt) return false;
    return Date.now() - new Date(buyerContactPingAt).getTime() >= TWO_MIN_MS;
  }, [buyerContactPingAt]);

  const reset = () => {
    setCategory(null);
    setDescription("");
    setError(null);
    setAttachments([]);
  };

  const handleAddAttachments = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setAttachments((current) =>
      [...current, ...Array.from(files)].slice(0, MAX_ATTACHMENTS),
    );
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachments((current) => current.filter((_, i) => i !== index));
  };

  const handleContactVendor = async () => {
    if (isContacting) return;
    setIsContacting(true);
    setError(null);
    try {
      await contactVendor(orderId);
      setBuyerContactPingAt(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not contact the vendor.");
    } finally {
      setIsContacting(false);
    }
  };

  const handleSubmit = async () => {
    if (!category || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await requestOrderRefund(orderId, {
        category,
        description: description.trim() || undefined,
      });
      const message =
        result.outcome === "AUTO_REFUNDED"
          ? "Refund processed — your order has been cancelled and refunded."
          : "Your refund request has been submitted for review.";
      onSuccess?.(message);
      onOpenChange(false);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit your request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedOption = CATEGORY_OPTIONS.find((option) => option.value === category);
  const needsContactFirst = category === "VENDOR_UNRESPONSIVE" && !buyerContactPingAt;
  const waitingOnTimeout =
    (category === "VENDOR_NOT_ACCEPTED" && !vendorAcceptEligible) ||
    (category === "VENDOR_UNRESPONSIVE" && buyerContactPingAt && !vendorUnresponsiveEligible);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Need help with this order?</DialogTitle>
          <DialogDescription>
            Tell us what happened. Eligible timeout issues are refunded automatically —
            everything else is reviewed by our team.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {CATEGORY_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm transition-colors ${
                category === option.value ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <input
                type="radio"
                name="refund-category"
                value={option.value}
                checked={category === option.value}
                onChange={() => setCategory(option.value)}
                className="mt-0.5"
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>

        {category && !selectedOption?.auto && (
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Add any details that will help our team review this (optional)"
            className="min-h-20 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none"
            maxLength={500}
          />
        )}

        {category && !selectedOption?.auto && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {attachmentPreviews.map((src, index) => (
                <div key={src} className="relative h-16 w-16 overflow-hidden rounded-lg border border-border">
                  <img src={src} alt={`Attachment ${index + 1}`} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => handleRemoveAttachment(index)}
                    aria-label="Remove attachment"
                    className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {attachments.length < MAX_ATTACHMENTS && (
                <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-muted-foreground hover:bg-secondary/40">
                  <ImagePlus className="h-4 w-4" />
                  <span className="text-[10px]">Add</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      handleAddAttachments(event.target.files);
                      event.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Attach up to {MAX_ATTACHMENTS} photos to help explain what happened. Photos are only
              shown here and aren't submitted with your request.
            </p>
          </div>
        )}

        {category === "VENDOR_NOT_ACCEPTED" && !vendorAcceptEligible && (
          <p className="text-xs text-muted-foreground">
            This becomes available once the vendor has had 5 minutes to accept your order.
          </p>
        )}

        {category === "VENDOR_UNRESPONSIVE" && !buyerContactPingAt && (
          <p className="text-xs text-muted-foreground">
            Contact the vendor first — if they don't respond within 2 minutes, you can request
            a refund.
          </p>
        )}

        {category === "VENDOR_UNRESPONSIVE" && buyerContactPingAt && !vendorUnresponsiveEligible && (
          <p className="text-xs text-muted-foreground">
            Vendor notified — you can request a refund if there's no progress within 2 minutes.
          </p>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}

        <DialogFooter>
          {needsContactFirst ? (
            <Button onClick={handleContactVendor} disabled={isContacting} className="rounded-full">
              {isContacting ? "Contacting..." : "Contact vendor"}
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={!category || isSubmitting || Boolean(waitingOnTimeout)}
              className="rounded-full"
            >
              {isSubmitting ? "Submitting..." : "Submit"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
