import { useEffect, useState } from "react";

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
];

const REPORT_CATEGORIES = [
  { value: "ORDER_ISSUE", label: "Order issue" },
  { value: "WRONG_ITEM", label: "Wrong item" },
  { value: "FRAUD", label: "Fraud or suspicious activity" },
  { value: "INAPPROPRIATE_BEHAVIOR", label: "Inappropriate behavior" },
  { value: "OTHER", label: "Other" },
];

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
  const extraItems = order.items.length > 1
    ? ` +${order.items.length - 1}`
    : "";

  return `${itemName}${extraItems} • ₱${order.total} • ${formatDate(
    order.createdAt,
  )}`;
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

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

          const options = orders.map((order) => ({
            id: order.id,
            label: getOrderLabel(order),
            description: `From ${order.vendor.name}`,
          }));

          setTargetOptions(options);
        } else if (targetType === "VENDOR") {
          const vendors = await listVendors();

          if (cancelled) return;

          const options = vendors.map((vendor) => ({
            id: vendor.id,
            label: getVendorLabel(vendor),
            description: vendor.description ?? undefined,
          }));

          setTargetOptions(options);
        } else if (targetType === "PRODUCT") {
          const vendors = await listVendors();

          if (cancelled) return;

          const storefronts = await Promise.all(
            vendors.map(async (vendor) => {
              if (vendor.products) {
                return vendor;
              }

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
        } else if (targetType === "TRANSACTION") {
          const orders = await getMyOrders();

          if (cancelled) return;

          const paymentResults: Array<TargetOption | null> =
            await Promise.all(
                orders.map(async (order) => {
                try {
                    const payment = await getOrderPaymentStatus(order.id);

                    if (!payment.payment) return null;

                    const paymentOption: TargetOption = {
                    id: payment.payment.id,
                    label: `${
                        order.items[0]?.name ?? "Order payment"
                    } • ₱${payment.payment.amount} • ${formatDate(
                        payment.payment.createdAt,
                    )}`,
                    description: `Payment for ${order.vendor.name}`,
                    };

                    return paymentOption;
                } catch {
                    return null;
                }
                }),
            );

            if (cancelled) return;

            setTargetOptions(
            paymentResults.filter(
                (payment): payment is TargetOption => payment !== null,
            ),
            );
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
        targetType === "ORDER"
          ? "Selected order"
          : "Selected item",
      );

      return;
    }

    const selected = targetOptions.find(
      (option) => option.id === targetId,
    );

    setSelectedTargetLabel(selected?.label ?? "");
  }, [
    lockTarget,
    targetId,
    targetOptions,
    targetType,
  ]);

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const newErrors: Record<string, string> = {};

    if (!targetType) {
      newErrors.targetType =
        "Please select what you are reporting.";
    }

    if (!targetId.trim()) {
      newErrors.targetId =
        "Please select the item you want to report.";
    }

    if (!category.trim()) {
      newErrors.category =
        "Please select a report category.";
    }

    if (!description.trim()) {
      newErrors.description =
        "Please provide details about the report.";
    }

    if (description.trim().length > 2000) {
      newErrors.description =
        "Details must not exceed 2000 characters.";
    }

    if (category.trim().length > 100) {
      newErrors.category =
        "Category must not exceed 100 characters.";
    }

    setErrors(newErrors);
    setSubmitError("");
    setSubmitSuccess(false);

    if (Object.keys(newErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);

    try {
      const reportData: CreateReportInput = {
        targetType:
          targetType as CreateReportInput["targetType"],
        targetId: targetId.trim(),
        category: category.trim(),
        description: description.trim(),
      };

      await createReport(reportData);

      setSubmitSuccess(true);
      setErrors({});
    } catch (error) {
      console.error(
        "Failed to submit report:",
        error,
      );

      setSubmitError(
        error instanceof Error
          ? error.message
          : "Failed to submit the report. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
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
        <form
          onSubmit={handleSubmit}
          className="space-y-6"
        >
          {/* Target Type */}
          <div className="space-y-2">
            <Label htmlFor="target-type">
              What would you like to report?
            </Label>

            <Select
              value={targetType}
              disabled={lockTarget}
              onValueChange={(value) => {
                setTargetType(value);
                setTargetId("");
                setSelectedTargetLabel("");

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
                  <SelectItem
                    key={target.value}
                    value={target.value}
                  >
                    {target.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {errors.targetType && (
              <p className="text-sm text-destructive">
                {errors.targetType}
              </p>
            )}
          </div>

          {/* Target Selection */}
          <div className="space-y-2">
            <Label htmlFor="target-selection">
              {targetType === "ORDER"
                ? "Which order?"
                : targetType === "VENDOR"
                  ? "Which vendor?"
                  : targetType === "PRODUCT"
                    ? "Which product?"
                    : targetType === "TRANSACTION"
                      ? "Which transaction?"
                      : "Select an item"}
            </Label>

            {lockTarget ? (
              <div
                id="target-selection"
                className="rounded-md border bg-muted/30 px-3 py-2 text-sm"
              >
                {selectedTargetLabel}
              </div>
            ) : (
              <Select
                value={targetId}
                disabled={
                  !targetType ||
                  isLoadingTargets
                }
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

                <SelectContent>
                  {targetOptions.map((option) => (
                    <SelectItem
                      key={option.id}
                      value={option.id}
                    >
                      <div className="flex flex-col">
                        <span>{option.label}</span>

                        {option.description && (
                          <span className="text-xs text-muted-foreground">
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
                This report is linked to the selected order.
              </p>
            ) : targetLoadError ? (
              <p className="text-sm text-destructive">
                {targetLoadError}
              </p>
            ) : targetType &&
              !isLoadingTargets &&
              targetOptions.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                We couldn't find any available items to report.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Select the item from your QueueLess activity.
                You don't need to enter an ID.
              </p>
            )}

            {errors.targetId && (
              <p className="text-sm text-destructive">
                {errors.targetId}
              </p>
            )}
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label htmlFor="category">
              What happened?
            </Label>

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
                {REPORT_CATEGORIES.map(
                  (reportCategory) => (
                    <SelectItem
                      key={reportCategory.value}
                      value={reportCategory.value}
                    >
                      {reportCategory.label}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>

            {errors.category && (
              <p className="text-sm text-destructive">
                {errors.category}
              </p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">
              Tell us more
            </Label>

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
                Please provide enough information to help us
                review your report.
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

          {/* API Error */}
          {submitError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3">
              <p className="text-sm text-destructive">
                {submitError}
              </p>
            </div>
          )}

          {/* Success Message */}
          {submitSuccess && (
            <div className="rounded-md border border-green-500/30 bg-green-500/10 p-3">
              <p className="text-sm text-green-600">
                Report submitted successfully.
              </p>
            </div>
          )}

          {/* Submit */}
          <Button
            type="submit"
            className="w-full"
            disabled={
              isSubmitting ||
              isLoadingTargets
            }
          >
            {isSubmitting
              ? "Submitting..."
              : "Submit Report"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}