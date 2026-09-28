import { useEffect, useState, type FormEvent } from "react";

import {
  createReport,
  getMyOrders,
  getOrderPaymentStatus,
  getVendorStorefront,
  listVendors,
  type CreateReportInput,
  type CustomerOrder,
  type VendorStorefront,
} from "@/features/auth/api";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Check, Paperclip, X } from "lucide-react";

interface ReportSubmissionFormProps {
  initialTargetType?: string;
  initialTargetId?: string;
  initialCategory?: string;
  initialDescription?: string;
  lockTarget?: boolean;
}

type ReportTargetType =
  | "VENDOR"
  | "USER"
  | "ORDER"
  | "TRANSACTION"
  | "PRODUCT"
  | "PASABUY";

interface TargetOption {
  id: string;
  label: string;
  description?: string;
}

const TARGET_TYPES: Array<{
  value: ReportTargetType;
  label: string;
}> = [
  { value: "ORDER", label: "An order" },
  { value: "VENDOR", label: "A vendor" },
  { value: "PRODUCT", label: "A product" },
  { value: "TRANSACTION", label: "A transaction / payment" },
  { value: "PASABUY", label: "A Pasabuy transaction" },
];

const REPORT_CATEGORIES_BY_TARGET: Record<
  ReportTargetType,
  Array<{ value: string; label: string }>
> = {
  ORDER: [
    { value: "ORDER_ISSUE", label: "Order issue" },
    { value: "WRONG_ITEM", label: "Wrong item" },
    { value: "FRAUD", label: "Fraud or suspicious activity" },
    { value: "INAPPROPRIATE_BEHAVIOR", label: "Inappropriate behavior" },
    { value: "OTHER", label: "Other" },
  ],
  VENDOR: [
    { value: "VENDOR_ISSUE", label: "Vendor issue" },
    { value: "FRAUD", label: "Fraud or suspicious activity" },
    { value: "INAPPROPRIATE_BEHAVIOR", label: "Inappropriate behavior" },
    { value: "PRODUCT_OR_LISTING_ISSUE", label: "Product or listing issue" },
    { value: "OTHER", label: "Other" },
  ],
  PRODUCT: [
    { value: "PRODUCT_ISSUE", label: "Product issue" },
    { value: "WRONG_OR_MISLEADING_ITEM", label: "Wrong or misleading item" },
    { value: "FRAUD", label: "Fraud or suspicious activity" },
    { value: "INAPPROPRIATE_CONTENT", label: "Inappropriate content" },
    { value: "OTHER", label: "Other" },
  ],
  TRANSACTION: [
    { value: "PAYMENT_ISSUE", label: "Payment issue" },
    {
      value: "CHARGED_BUT_NOT_PROCESSED",
      label: "Charged but payment was not processed",
    },
    { value: "DUPLICATE_CHARGE", label: "Duplicate charge" },
    { value: "REFUND_ISSUE", label: "Refund issue" },
    {
      value: "UNAUTHORIZED_PAYMENT",
      label: "Unauthorized or suspicious payment",
    },
    { value: "OTHER", label: "Other" },
  ],
  PASABUY: [
    { value: "PASABUY_TRANSACTION_ISSUE", label: "Pasabuy transaction issue" },
    { value: "PAYMENT_OR_FEE_ISSUE", label: "Payment or convenience fee issue" },
    { value: "WRONG_OR_MISSING_ITEM", label: "Wrong or missing item" },
    { value: "INAPPROPRIATE_BEHAVIOR", label: "Inappropriate behavior" },
    { value: "FRAUD", label: "Fraud or suspicious activity" },
    { value: "OTHER", label: "Other" },
  ],
  USER: [
    { value: "INAPPROPRIATE_BEHAVIOR", label: "Inappropriate behavior" },
    { value: "FRAUD", label: "Fraud or suspicious activity" },
    { value: "OTHER", label: "Other" },
  ],
};

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getOrderLabel(order: CustomerOrder) {
  const firstItem = order.items[0];
  const itemName = firstItem?.name ?? "Order";
  const extraItems = order.items.length > 1 ? ` +${order.items.length - 1}` : "";

  return `${itemName}${extraItems} • ₱${order.total} • ${formatDate(order.createdAt)}`;
}

function getVendorLabel(vendor: VendorStorefront) {
  const location = vendor.campusLocation
    ? ` • ${vendor.campusLocation}`
    : "";

  return `${vendor.name}${location}`;
}

export default function ReportSubmissionForm({
  initialTargetType = "",
  initialTargetId = "",
  initialCategory = "",
  initialDescription = "",
  lockTarget = false,
}: ReportSubmissionFormProps) {
  const [targetType, setTargetType] = useState(initialTargetType);
  const [targetId, setTargetId] = useState(initialTargetId);
  const [targetOptions, setTargetOptions] = useState<TargetOption[]>([]);
  const [selectedTargetLabel, setSelectedTargetLabel] = useState("");
  const [isLoadingTargets, setIsLoadingTargets] = useState(false);
  const [targetLoadError, setTargetLoadError] = useState("");

  const [category, setCategory] = useState(initialCategory);
  const [description, setDescription] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentError, setAttachmentError] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reportCategories =
    REPORT_CATEGORIES_BY_TARGET[targetType as ReportTargetType] ?? [];

  useEffect(() => {
    setDescription(initialDescription);
  }, [initialDescription]);

  useEffect(() => {
    if (lockTarget || !targetType) {
      setTargetOptions([]);
      setIsLoadingTargets(false);
      setTargetLoadError("");
      return;
    }

    let cancelled = false;

    async function loadTargets() {
      setIsLoadingTargets(true);
      setTargetLoadError("");
      setTargetOptions([]);
      setTargetId("");

      try {
        if (targetType === "ORDER") {
          const orders = await getMyOrders();

          if (cancelled) return;

          setTargetOptions(
            orders.map((order) => ({
              id: order.id,
              label: getOrderLabel(order),
              description: `From ${order.vendor.name}`,
            })),
          );
        } else if (targetType === "VENDOR") {
          const vendors = await listVendors();

          if (cancelled) return;

          setTargetOptions(
            vendors.map((vendor) => ({
              id: vendor.id,
              label: getVendorLabel(vendor),
              description: vendor.description ?? undefined,
            })),
          );
        } else if (targetType === "PRODUCT") {
          const vendors = await listVendors();

          if (cancelled) return;

          const storefronts = await Promise.all(
            vendors.map(async (vendor) => {
              if (vendor.products) return vendor;

              try {
                return await getVendorStorefront(vendor.id);
              } catch {
                return null;
              }
            }),
          );

          if (cancelled) return;

          const options: TargetOption[] = [];

          storefronts.forEach((vendor) => {
            if (!vendor?.products) return;

            vendor.products.forEach((product) => {
              options.push({
                id: product.id,
                label: `${product.name} • ₱${product.price}`,
                description: vendor.name,
              });
            });
          });

          setTargetOptions(options);
        } else if (targetType === "TRANSACTION" || targetType === "PASABUY") {
          setTargetOptions([]);
        }
      } catch (error) {
        if (cancelled) return;

        setTargetLoadError(
          error instanceof Error
            ? error.message
            : "Unable to load your available items.",
        );
      } finally {
        if (!cancelled) {
          setIsLoadingTargets(false);
        }
      }
    }

    void loadTargets();

    return () => {
      cancelled = true;
    };
  }, [targetType, lockTarget]);

  useEffect(() => {
    if (lockTarget) {
      setSelectedTargetLabel(
        targetType === "ORDER" ? "Selected order" : "Selected item",
      );
      return;
    }

    const selected = targetOptions.find((option) => option.id === targetId);
    setSelectedTargetLabel(selected?.label ?? "");
  }, [lockTarget, targetId, targetOptions, targetType]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const newErrors: Record<string, string> = {};

    if (!targetType) {
      newErrors.targetType = "Please select what you are reporting.";
    }

    if (targetType !== "TRANSACTION" && !targetId.trim()) {
      newErrors.targetId = "Please select the item you want to report.";
    }

    if (targetType === "TRANSACTION" && !targetId.trim() && !attachment) {
      newErrors.targetId =
        "A target ID is required unless transaction proof is attached.";
    }

    if (!category.trim()) {
      newErrors.category = "Please select a report category.";
    }

    if (!description.trim()) {
      newErrors.description = "Please provide details about the report.";
    }

    if (description.trim().length > 2000) {
      newErrors.description = "Details must not exceed 2000 characters.";
    }

    if (category.trim().length > 100) {
      newErrors.category = "Category must not exceed 100 characters.";
    }

    if (attachment && attachment.size > 5 * 1024 * 1024) {
      newErrors.attachment = "File must not exceed 5 MB.";
    }

    setErrors(newErrors);
    setSubmitError("");

    if (Object.keys(newErrors).length > 0) return;

    setIsSubmitting(true);

    try {
      const reportData: CreateReportInput = {
        targetType: targetType as CreateReportInput["targetType"],
        ...(targetId.trim() ? { targetId: targetId.trim() } : {}),
        category: category.trim(),
        description: description.trim(),
        attachment: attachment ?? undefined,
      };

      await createReport(reportData);

      setSubmitSuccess(true);
      setErrors({});
      setSubmitError("");

      setTargetType("");
      setTargetId("");
      setTargetOptions([]);
      setSelectedTargetLabel("");
      setCategory("");
      setDescription("");
      setAttachment(null);
      setAttachmentError("");
    } catch (error) {
      console.error("Failed to submit report:", error);

      setSubmitError(
        error instanceof Error
          ? error.message
          : "Failed to submit the report. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitSuccess) {
    return (
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Report a Problem</CardTitle>
          <p className="text-sm text-muted-foreground">
            Tell us about the issue you would like to report.
          </p>
        </CardHeader>

        <CardContent>
          <div className="rounded-[18px] border border-emerald-500/30 bg-emerald-500/10 px-6 py-10 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
              <Check className="h-7 w-7 text-emerald-600" />
            </div>

            <h2 className="mt-5 text-2xl font-semibold text-emerald-700 dark:text-emerald-400">
              Report submitted!
            </h2>

            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-emerald-700/80 dark:text-emerald-300/80">
              Thanks for letting us know. Our team will review your report and
              take the appropriate action.
            </p>

            <Button
              type="button"
              variant="outline"
              className="mt-6 rounded-full"
              onClick={() => {
                setSubmitSuccess(false);
                setSubmitError("");
              }}
            >
              Submit another report
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Report a Problem</CardTitle>
        <p className="text-sm text-muted-foreground">
          Tell us about the issue you would like to report.
        </p>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="target-type">What would you like to report?</Label>

            <Select
              value={targetType}
              disabled={lockTarget}
              onValueChange={(value) => {
                setTargetType(value);
                setTargetId("");
                setSelectedTargetLabel("");
                setTargetLoadError("");
                setCategory("");
                setAttachment(null);
                setAttachmentError("");
                setErrors((previous) => ({
                  ...previous,
                  targetType: "",
                  targetId: "",
                }));
              }}
            >
              <SelectTrigger id="target-type">
                <SelectValue placeholder="Choose what you are reporting" />
              </SelectTrigger>

              <SelectContent>
                {TARGET_TYPES.map((target) => (
                  <SelectItem key={target.value} value={target.value}>
                    {target.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {errors.targetType && (
              <p className="text-sm text-destructive">{errors.targetType}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="target-selection">
              {targetType === "ORDER"
                ? "Which order?"
                : targetType === "VENDOR"
                  ? "Which vendor?"
                  : targetType === "PRODUCT"
                    ? "Which product?"
                    : targetType === "TRANSACTION"
                      ? "Transaction proof"
                      : targetType === "PASABUY"
                        ? "Which Pasabuy transaction?"
                        : "Select an item"}
            </Label>

            {lockTarget ? (
              <div
                id="target-selection"
                className="rounded-md border bg-muted/30 px-3 py-2 text-sm"
              >
                {selectedTargetLabel}
              </div>
            ) : targetType === "TRANSACTION" ? (
              <div className="space-y-3">
                <div className="rounded-[14px] border border-dashed bg-muted/20 p-4">
                  <div className="flex items-start gap-3">
                    <Paperclip className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">Upload payment proof</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Add a screenshot, image, or PDF of the transaction if you have one.
                      </p>
                    </div>
                  </div>

                  <input
                    id="transaction-attachment"
                    type="file"
                    accept="image/png,image/jpeg,application/pdf"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      setAttachmentError("");
                      setErrors((previous) => ({ ...previous, attachment: "" }));

                      if (!file) {
                        setAttachment(null);
                        return;
                      }

                      if (file.size > 5 * 1024 * 1024) {
                        setAttachment(null);
                        setAttachmentError("File must not exceed 5 MB.");
                        setErrors((previous) => ({
                          ...previous,
                          attachment: "File must not exceed 5 MB.",
                        }));
                        event.target.value = "";
                        return;
                      }

                      setAttachment(file);
                    }}
                  />

                  {!attachment ? (
                    <label
                      htmlFor="transaction-attachment"
                      className="mt-4 inline-flex cursor-pointer items-center rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                    >
                      Choose File
                    </label>
                  ) : (
                    <div className="mt-4 flex items-center justify-between gap-3 rounded-lg bg-background px-3 py-2 text-sm">
                      <span className="min-w-0 truncate">{attachment.name}</span>
                      <button
                        type="button"
                        className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        onClick={() => {
                          setAttachment(null);
                          setAttachmentError("");
                          setErrors((previous) => ({ ...previous, attachment: "" }));
                          const input = document.getElementById(
                            "transaction-attachment",
                          ) as HTMLInputElement | null;
                          if (input) input.value = "";
                        }}
                        aria-label="Remove attachment"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}

                  <p className="mt-2 text-xs text-muted-foreground">
                    JPG, JPEG, PNG, or PDF • Max 5 MB
                  </p>

                  {(attachmentError || errors.attachment) && (
                    <p className="text-sm text-destructive">
                      {attachmentError || errors.attachment}
                    </p>
                  )}
                </div>
              </div>
            ) : targetType === "PASABUY" ? (
              <div
                id="target-selection"
                className="rounded-md border border-dashed bg-muted/20 px-4 py-3 text-sm text-muted-foreground"
              >
                Pasabuy transaction selection will appear here once the Pasabuy history data is available.
              </div>
            ) : (
              <Select
                value={targetId}
                disabled={!targetType || isLoadingTargets}
                onValueChange={(value) => {
                  setTargetId(value);
                  setErrors((previous) => ({
                    ...previous,
                    targetId: "",
                  }));
                }}
              >
                <SelectTrigger id="target-selection">
                  <SelectValue
                    placeholder={
                      isLoadingTargets
                        ? "Loading..."
                        : targetType
                          ? "Select an item"
                          : "Choose what you are reporting first"
                    }
                  />
                </SelectTrigger>

                <SelectContent className="max-h-64 overflow-y-auto">
                  {targetOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      <div className="flex max-w-[520px] flex-col">
                        <span className="truncate">{option.label}</span>
                        {option.description && (
                          <span className="truncate text-xs text-muted-foreground">
                            {option.description}
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {lockTarget ? (
              <p className="text-xs text-muted-foreground">
                This report is linked to the selected {targetType === "ORDER" ? "order" : "item"}.
              </p>
            ) : targetLoadError ? (
              <p className="text-sm text-destructive">{targetLoadError}</p>
            ) : targetType === "ORDER" ? (
              <p className="text-xs text-muted-foreground">
                Select the order from your QueueLess activity. You don't need
                to enter an ID.
              </p>
            ) : targetType === "TRANSACTION" ? (
              <p className="text-xs text-muted-foreground">
                A transaction record is optional here. Upload payment proof if you need to show transaction details.
              </p>
            ) : targetType === "PASABUY" ? (
              <p className="text-xs text-muted-foreground">
                Pasabuy transaction history will be connected once its frontend data source is available.
              </p>
            ) : targetType ? (
              <p className="text-xs text-muted-foreground">
                Select the item from your QueueLess activity. You don't need to
                enter an ID.
              </p>
            ) : null}

            {errors.targetId && (
              <p className="text-sm text-destructive">{errors.targetId}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">What happened?</Label>

            <Select
              value={category}
              onValueChange={(value) => {
                setCategory(value);
                setErrors((previous) => ({
                  ...previous,
                  category: "",
                }));
              }}
            >
              <SelectTrigger id="category">
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>

              <SelectContent>
                {reportCategories.map((reportCategory) => (
                  <SelectItem
                    key={reportCategory.value}
                    value={reportCategory.value}
                  >
                    {reportCategory.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {errors.category && (
              <p className="text-sm text-destructive">{errors.category}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Tell us more</Label>

            <Textarea
              id="description"
              placeholder="Describe what happened and include any details that may help us review your report."
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                setErrors((previous) => ({
                  ...previous,
                  description: "",
                }));
              }}
              rows={6}
              maxLength={2000}
            />

            <div className="flex justify-between gap-4">
              <p className="text-xs text-muted-foreground">
                Please provide enough information to help us review your report.
              </p>
              <p className="shrink-0 text-xs text-muted-foreground">
                {description.length}/2000
              </p>
            </div>

            {errors.description && (
              <p className="text-sm text-destructive">
                {errors.description}
              </p>
            )}
          </div>

          {submitError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3">
              <p className="text-sm text-destructive">{submitError}</p>
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={isSubmitting || isLoadingTargets}
          >
            {isSubmitting ? "Submitting..." : "Submit Report"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
