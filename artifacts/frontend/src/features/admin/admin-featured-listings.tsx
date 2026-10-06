import { FormEvent, useEffect, useState } from "react";
import {
  Clock,
  Loader2,
  Megaphone,
  Plus,
  Pencil,
  Settings,
  ToggleLeft,
  ToggleRight,
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
import {
  createFeaturedListingPlan,
  getFeaturedListingSettings,
  listAdminFeaturedListings,
  listFeaturedListingPlans,
  updateFeaturedListingPlan,
  updateFeaturedListingSettings,
  type AdminFeaturedListing,
  type FeaturedListingPlacement,
  type FeaturedListingPlan,
  type FeaturedListingSettings,
} from "@/features/auth/api";
import { AdminShell } from "./admin-shell";

const PLACEMENT_OPTIONS: {
  value: FeaturedListingPlacement;
  label: string;
  description: string;
}[] = [
  {
    value: "MARKETPLACE_HOME",
    label: "Marketplace Home",
    description: "Featured placement on the marketplace home page.",
  },
  {
    value: "VENDOR_DIRECTORY",
    label: "Vendor Directory",
    description: "Featured placement in the vendor directory.",
  },
  {
    value: "PRODUCT_SPOTLIGHT",
    label: "Product Spotlight",
    description: "Featured placement for product promotion.",
  },
];

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 1);

function getPlacementLabel(placement: FeaturedListingPlacement): string {
  return (
    PLACEMENT_OPTIONS.find((option) => option.value === placement)?.label ??
    placement
  );
}

function formatPrice(price: string | number): string {
  const numericPrice = Number(price);

  if (Number.isNaN(numericPrice)) {
    return String(price);
  }

  return `₱${numericPrice.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function AdminFeaturedListings() {
  const [plans, setPlans] = useState<FeaturedListingPlan[]>([]);
  const [featuredListings, setFeaturedListings] = useState<AdminFeaturedListing[]>([]);
  const [featuredListingsTotal, setFeaturedListingsTotal] = useState(0);
  const [settings, setSettings] =
    useState<FeaturedListingSettings | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingDiscounts, setSavingDiscounts] = useState(false);
  const [savingPlanEdit, setSavingPlanEdit] = useState(false);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showDiscountSettings, setShowDiscountSettings] = useState(false);
  const [editingPlan, setEditingPlan] =
    useState<FeaturedListingPlan | null>(null);

  const [name, setName] = useState("");
  const [placement, setPlacement] =
    useState<FeaturedListingPlacement>("MARKETPLACE_HOME");
  const [price, setPrice] = useState("100");
  const [durationMonths, setDurationMonths] = useState("1");

  const [firstVendorDiscount, setFirstVendorDiscount] = useState("");
  const [secondVendorDiscount, setSecondVendorDiscount] = useState("");
  const [thirdVendorDiscount, setThirdVendorDiscount] = useState("");
  const [discountOnRenewals, setDiscountOnRenewals] = useState(false);

  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editDurationMonths, setEditDurationMonths] = useState("1");

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);


  const loadData = async () => {
    setError(null);
    setLoading(true);

    try {
      const [plansResponse, settingsResponse, featuredListingsResponse] = await Promise.all([
        listFeaturedListingPlans(),
        getFeaturedListingSettings(),
        listAdminFeaturedListings(),
      ]);

      setPlans(plansResponse);
      setSettings(settingsResponse);
      setFeaturedListings(featuredListingsResponse.items);
      setFeaturedListingsTotal(featuredListingsResponse.total);

      setFirstVendorDiscount(
        String(settingsResponse.firstVendorDiscount ?? ""),
      );

      setSecondVendorDiscount(
        String(settingsResponse.secondVendorDiscount ?? ""),
      );

      setThirdVendorDiscount(
        String(settingsResponse.thirdVendorDiscount ?? ""),
      );

      setDiscountOnRenewals(Boolean(settingsResponse.discountOnRenewals));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load featured listing settings.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const resetCreateForm = () => {
    setName("");
    setPlacement("MARKETPLACE_HOME");
    setPrice("100");
    setDurationMonths("1");
  };

  const handleCreatePlan = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setError(null);
    setSuccess(null);

    const trimmedName = name.trim();
    const numericPrice = Number(price);
    const numericMonths = Number(durationMonths);

    if (!trimmedName) {
      setError("Enter a name for the featured listing plan.");
      return;
    }

    if (!price || Number.isNaN(numericPrice) || numericPrice < 0) {
      setError("Enter a valid price.");
      return;
    }

    if (
      !durationMonths ||
      Number.isNaN(numericMonths) ||
      numericMonths < 1 ||
      numericMonths > 12
    ) {
      setError("Select a duration between 1 and 12 months.");
      return;
    }

    setSaving(true);

    try {
      const createdPlan = await createFeaturedListingPlan({
        name: trimmedName,
        placement,
        price: numericPrice,
        durationDays: numericMonths * 30,
      });

      setPlans((current) => [createdPlan, ...current]);

      resetCreateForm();
      setShowCreateForm(false);

      setSuccess("Featured listing plan created successfully.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to create the featured listing plan.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDiscounts = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!settings) {
      setError("Featured listing settings are not available.");
      return;
    }

    setError(null);
    setSuccess(null);

    const parseDiscount = (value: string) => {
      const trimmed = value.trim();

      if (trimmed === "") {
        return 0;
      }

      return Number(trimmed);
    };

    const first = parseDiscount(firstVendorDiscount);
    const second = parseDiscount(secondVendorDiscount);
    const third = parseDiscount(thirdVendorDiscount);

    const discounts = [
      { label: "1st vendor discount", value: first },
      { label: "2nd vendor discount", value: second },
      { label: "3rd vendor discount", value: third },
    ];

    const invalidDiscount = discounts.find(
      (discount) =>
        Number.isNaN(discount.value) ||
        discount.value < 0 ||
        discount.value > 100,
    );

    if (invalidDiscount) {
      setError(`${invalidDiscount.label} must be between 0% and 100%.`);
      return;
    }

    setSavingDiscounts(true);

    try {
      const updatedSettings = await updateFeaturedListingSettings({
        monthlyPrice: Number(settings.monthlyPrice),
        firstVendorDiscount: first,
        secondVendorDiscount: second,
        thirdVendorDiscount: third,
        discountOnRenewals,
        version: settings.version,
      });

      setSettings(updatedSettings);

      setFirstVendorDiscount(
        String(updatedSettings.firstVendorDiscount ?? ""),
      );

      setSecondVendorDiscount(
        String(updatedSettings.secondVendorDiscount ?? ""),
      );

      setThirdVendorDiscount(
        String(updatedSettings.thirdVendorDiscount ?? ""),
      );

      setDiscountOnRenewals(Boolean(updatedSettings.discountOnRenewals));

      setShowDiscountSettings(false);
      setSuccess("Discount settings updated successfully.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to update discount settings.",
      );
    } finally {
      setSavingDiscounts(false);
    }
  };

    const openEditPlan = (plan: FeaturedListingPlan) => {
    setError(null);
    setSuccess(null);

    setEditingPlan(plan);
    setEditName(plan.name);
    setEditPrice(String(plan.price));

    setEditDurationMonths(
      String(Math.max(1, Math.round(plan.durationDays / 30))),
    );
  };

  const closeEditPlan = () => {
    if (savingPlanEdit) return;

    setEditingPlan(null);
  };

  const handleSavePlanEdit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (!editingPlan) return;

    setError(null);
    setSuccess(null);

    const trimmedName = editName.trim();
    const numericPrice = Number(editPrice);
    const numericMonths = Number(editDurationMonths);

    if (!trimmedName) {
      setError("Enter a name for the featured listing plan.");
      return;
    }

    if (!editPrice || Number.isNaN(numericPrice) || numericPrice < 0) {
      setError("Enter a valid price.");
      return;
    }

    if (
      !editDurationMonths ||
      Number.isNaN(numericMonths) ||
      numericMonths < 1 ||
      numericMonths > 12
    ) {
      setError("Select a duration between 1 and 12 months.");
      return;
    }

    setSavingPlanEdit(true);

    try {
      const updatedPlan = await updateFeaturedListingPlan(
        editingPlan.id,
        {
          name: trimmedName,
          price: numericPrice,
          durationDays: numericMonths * 30,
        },
      );

      setPlans((current) =>
        current.map((item) =>
          item.id === updatedPlan.id ? updatedPlan : item,
        ),
      );

      setEditingPlan(null);

      setSuccess("Featured listing plan updated successfully.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to update the featured listing plan.",
      );
    } finally {
      setSavingPlanEdit(false);
    }
  };

  const handleTogglePlan = async (plan: FeaturedListingPlan) => {
    setError(null);
    setSuccess(null);

    try {
      const updatedPlan = await updateFeaturedListingPlan(plan.id, {
        isActive: !plan.isActive,
      });

      setPlans((current) =>
        current.map((item) =>
          item.id === updatedPlan.id ? updatedPlan : item,
        ),
      );

      setSuccess(
        updatedPlan.isActive
          ? `${updatedPlan.name} is now active.`
          : `${updatedPlan.name} is now inactive.`,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to update the featured listing plan.",
      );
    }
  };

  return (
    <AdminShell>
      <section className="w-full space-y-6">
        {/* Page heading */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-primary" />

              <h2 className="text-2xl font-bold tracking-[-0.04em] text-foreground">
                Featured Listings
              </h2>
            </div>

            <p className="mt-2 text-sm text-muted-foreground">
              Manage the plans and placements available for featured listings.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              className="gap-2 rounded-full"
              onClick={() => {
                setError(null);
                setSuccess(null);
                resetCreateForm();
                setShowCreateForm(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Add plan
            </Button>
          </div>
        </div>

        {/* Feedback */}
        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">
            {success}
          </div>
        )}

        {/* Current discount */}
        <Card className="w-full border-border bg-card shadow-sm">
          <CardHeader className="flex flex-col gap-3 px-6 pt-6 sm:flex-row sm:items-start sm:justify-between sm:px-7">
            <div>
              <CardTitle className="text-lg">
                Current discount
              </CardTitle>

              <CardDescription>
                The discount settings currently applied to featured listing purchases.
              </CardDescription>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full gap-2 rounded-full sm:w-auto"
              onClick={() => {
                setError(null);
                setSuccess(null);
                setShowDiscountSettings(true);
              }}
              disabled={!settings || savingDiscounts}
            >
              <Settings className="h-4 w-4" />
              Edit discount
            </Button>
          </CardHeader>

          <CardContent className="px-6 pb-6 sm:px-7">
            {loading || !settings ? (
              <div className="flex items-center justify-center rounded-xl border border-border bg-secondary/20 px-4 py-6 text-sm text-muted-foreground">
                {loading && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}

                {loading
                  ? "Loading current discount..."
                  : "Discount settings unavailable."}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-border bg-secondary/20 p-4">
                  <p className="text-xs text-muted-foreground">
                    1st vendor discount
                  </p>

                  <p className="mt-1 text-lg font-semibold text-foreground">
                    {settings.firstVendorDiscount}%
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-secondary/20 p-4">
                  <p className="text-xs text-muted-foreground">
                    2nd vendor discount
                  </p>

                  <p className="mt-1 text-lg font-semibold text-foreground">
                    {settings.secondVendorDiscount}%
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-secondary/20 p-4">
                  <p className="text-xs text-muted-foreground">
                    3rd vendor discount
                  </p>

                  <p className="mt-1 text-lg font-semibold text-foreground">
                    {settings.thirdVendorDiscount}%
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-secondary/20 p-4">
                  <p className="text-xs text-muted-foreground">
                    Renewal discount
                  </p>

                  <p className="mt-1 text-lg font-semibold text-foreground">
                    {settings.discountOnRenewals
                      ? "Enabled"
                      : "Disabled"}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Available plans */}
        <Card className="w-full border-border bg-card shadow-sm">
          <CardHeader className="px-6 pt-6 sm:px-7">
            <CardTitle className="text-lg">
              Available plans
            </CardTitle>

            <CardDescription>
              Activate or deactivate plans without deleting their records.
            </CardDescription>
          </CardHeader>

          <CardContent className="px-6 pb-6 sm:px-7">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading featured listing plans...
              </div>
            ) : plans.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-secondary/20 px-6 py-12 text-center">
                <Megaphone className="mx-auto h-8 w-8 text-muted-foreground" />

                <p className="mt-3 text-sm font-medium">
                  No featured listing plans yet
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  Create your first plan to make a featured placement option
                  available.
                </p>

                <Button
                  type="button"
                  className="mt-4 gap-2 rounded-full"
                  onClick={() => {
                    resetCreateForm();
                    setShowCreateForm(true);
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Add plan
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {plans.map((plan) => (
                  <div
                    key={plan.id}
                    className="flex flex-col gap-4 rounded-xl border border-border bg-secondary/20 px-5 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium text-foreground">
                          {plan.name}
                        </h3>

                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                            plan.isActive
                              ? "bg-emerald-500/10 text-emerald-700"
                              : "bg-secondary text-muted-foreground"
                          }`}
                        >
                          {plan.isActive ? "Active" : "Inactive"}
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>
                          {getPlacementLabel(plan.placement)}
                        </span>

                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />

                          {Math.round(plan.durationDays / 30)}{" "}
                          {Math.round(plan.durationDays / 30) === 1
                            ? "month"
                            : "months"}
                        </span>

                        <span className="font-medium text-foreground">
                          {formatPrice(plan.price)}
                        </span>
                      </div>
                    </div>

                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full gap-2 rounded-full sm:w-auto"
                        onClick={() => openEditPlan(plan)}
                      >
                        <Pencil className="h-4 w-4" />
                        Edit
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        className="w-full gap-2 rounded-full sm:w-auto"
                        onClick={() => void handleTogglePlan(plan)}
                      >
                        {plan.isActive ? (
                          <>
                            <ToggleRight className="h-4 w-4" />
                            Deactivate
                          </>
                        ) : (
                          <>
                            <ToggleLeft className="h-4 w-4" />
                            Activate
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Discount Settings Modal */}
        {showDiscountSettings && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
            <Card className="w-full max-w-2xl border-border bg-card shadow-xl">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 px-6 pt-6 sm:px-7">
                <div>
                  <CardTitle className="text-lg">
                    Discount settings
                  </CardTitle>

                  <CardDescription className="mt-1">
                    Configure the discounts applied to featured listing
                    purchases.
                  </CardDescription>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="rounded-full"
                  onClick={() => setShowDiscountSettings(false)}
                  disabled={savingDiscounts}
                >
                  <X className="h-4 w-4" />
                </Button>
              </CardHeader>

              <CardContent className="px-6 pb-6 sm:px-7">
                <form
                  onSubmit={handleSaveDiscounts}
                  className="space-y-5"
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label
                        htmlFor="first-vendor-discount"
                        className="text-sm font-medium"
                      >
                        1st vendor discount
                      </label>

                      <div className="relative">
                        <Input
                          id="first-vendor-discount"
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={firstVendorDiscount}
                          onChange={(event) =>
                            setFirstVendorDiscount(
                              event.target.value,
                            )
                          }
                          className="pr-10"
                          placeholder="0"
                        />

                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                          %
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label
                        htmlFor="second-vendor-discount"
                        className="text-sm font-medium"
                      >
                        2nd vendor discount
                      </label>

                      <div className="relative">
                        <Input
                          id="second-vendor-discount"
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={secondVendorDiscount}
                          onChange={(event) =>
                            setSecondVendorDiscount(
                              event.target.value,
                            )
                          }
                          className="pr-10"
                          placeholder="0"
                        />

                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                          %
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label
                        htmlFor="third-vendor-discount"
                        className="text-sm font-medium"
                      >
                        3rd vendor discount
                      </label>

                      <div className="relative">
                        <Input
                          id="third-vendor-discount"
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={thirdVendorDiscount}
                          onChange={(event) =>
                            setThirdVendorDiscount(
                              event.target.value,
                            )
                          }
                          className="pr-10"
                          placeholder="0"
                        />

                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                          %
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label
                        htmlFor="renewal-discount"
                        className="text-sm font-medium"
                      >
                        Renewal discount
                      </label>

                      <button
                        id="renewal-discount"
                        type="button"
                        role="switch"
                        aria-checked={discountOnRenewals}
                        onClick={() =>
                          setDiscountOnRenewals(
                            (current) => !current,
                          )
                        }
                        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 text-sm shadow-sm transition-colors hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <span>
                          {discountOnRenewals
                            ? "Enabled"
                            : "Disabled"}
                        </span>

                        {discountOnRenewals ? (
                          <ToggleRight className="h-5 w-5 text-primary" />
                        ) : (
                          <ToggleLeft className="h-5 w-5 text-muted-foreground" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full"
                      onClick={() =>
                        setShowDiscountSettings(false)
                      }
                      disabled={savingDiscounts}
                    >
                      Cancel
                    </Button>

                    <Button
                      type="submit"
                      className="rounded-full"
                      disabled={savingDiscounts}
                    >
                      {savingDiscounts && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Save discounts
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Edit Plan Modal */}
        {editingPlan && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
            <Card className="w-full max-w-2xl border-border bg-card shadow-xl">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 px-6 pt-6 sm:px-7">
                <div>
                  <CardTitle className="text-lg">
                    Edit featured listing plan
                  </CardTitle>

                  <CardDescription className="mt-1">
                    Update the plan details used for featured listing purchases.
                  </CardDescription>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="rounded-full"
                  onClick={closeEditPlan}
                  disabled={savingPlanEdit}
                >
                  <X className="h-4 w-4" />
                </Button>
              </CardHeader>

              <CardContent className="px-6 pb-6 sm:px-7">
                <form
                  onSubmit={handleSavePlanEdit}
                  className="space-y-5"
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                      <label
                        htmlFor="edit-featured-plan-name"
                        className="text-sm font-medium"
                      >
                        Plan name
                      </label>

                      <Input
                        id="edit-featured-plan-name"
                        value={editName}
                        onChange={(event) =>
                          setEditName(event.target.value)
                        }
                        placeholder="e.g. Marketplace Boost"
                      />
                    </div>

                    <div className="space-y-2">
                      <label
                        htmlFor="edit-featured-plan-price"
                        className="text-sm font-medium"
                      >
                        Price
                      </label>

                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                          ₱
                        </span>

                        <Input
                          id="edit-featured-plan-price"
                          type="number"
                          min="0"
                          step="0.01"
                          value={editPrice}
                          onChange={(event) =>
                            setEditPrice(event.target.value)
                          }
                          className="pl-8"
                          placeholder="100"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label
                        htmlFor="edit-featured-plan-duration"
                        className="text-sm font-medium"
                      >
                        Duration
                      </label>

                      <select
                        id="edit-featured-plan-duration"
                        value={editDurationMonths}
                        onChange={(event) =>
                          setEditDurationMonths(
                            event.target.value,
                          )
                        }
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      >
                        {MONTH_OPTIONS.map((months) => (
                          <option key={months} value={months}>
                            {months}{" "}
                            {months === 1
                              ? "month"
                              : "months"}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-secondary/20 p-4">
                    <p className="text-sm font-medium">
                      {getPlacementLabel(editingPlan.placement)}
                    </p>

                    <p className="mt-1 text-xs text-muted-foreground">
                      Placement cannot be changed here.
                    </p>
                  </div>

                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full"
                      onClick={closeEditPlan}
                      disabled={savingPlanEdit}
                    >
                      Cancel
                    </Button>

                    <Button
                      type="submit"
                      className="gap-2 rounded-full"
                      disabled={savingPlanEdit}
                    >
                      {savingPlanEdit && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}

                      Save changes
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        )}

                {/* Add Plan Modal */}
        {showCreateForm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
            <Card className="w-full max-w-2xl border-border bg-card shadow-xl">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 px-6 pt-6 sm:px-7">
                <div>
                  <CardTitle className="text-lg">
                    Create featured listing plan
                  </CardTitle>

                  <CardDescription className="mt-1">
                    Add a plan that vendors can use for featured placement.
                  </CardDescription>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="rounded-full"
                  onClick={() => setShowCreateForm(false)}
                  disabled={saving}
                >
                  <X className="h-4 w-4" />
                </Button>
              </CardHeader>

              <CardContent className="px-6 pb-6 sm:px-7">
                <form
                  onSubmit={handleCreatePlan}
                  className="space-y-5"
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label
                        htmlFor="featured-plan-name"
                        className="text-sm font-medium"
                      >
                        Plan name
                      </label>

                      <Input
                        id="featured-plan-name"
                        value={name}
                        onChange={(event) =>
                          setName(event.target.value)
                        }
                        placeholder="e.g. Marketplace Boost"
                      />
                    </div>

                    <div className="space-y-2">
                      <label
                        htmlFor="featured-plan-placement"
                        className="text-sm font-medium"
                      >
                        Placement
                      </label>

                      <select
                        id="featured-plan-placement"
                        value={placement}
                        onChange={(event) =>
                          setPlacement(
                            event.target.value as FeaturedListingPlacement,
                          )
                        }
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      >
                        {PLACEMENT_OPTIONS.map((option) => (
                          <option
                            key={option.value}
                            value={option.value}
                          >
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label
                        htmlFor="featured-plan-price"
                        className="text-sm font-medium"
                      >
                        Price
                      </label>

                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                          ₱
                        </span>

                        <Input
                          id="featured-plan-price"
                          type="number"
                          min="0"
                          step="0.01"
                          value={price}
                          onChange={(event) =>
                            setPrice(event.target.value)
                          }
                          className="pl-8"
                          placeholder="100"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label
                        htmlFor="featured-plan-duration"
                        className="text-sm font-medium"
                      >
                        Duration
                      </label>

                      <select
                        id="featured-plan-duration"
                        value={durationMonths}
                        onChange={(event) =>
                          setDurationMonths(
                            event.target.value,
                          )
                        }
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      >
                        {MONTH_OPTIONS.map((months) => (
                          <option
                            key={months}
                            value={months}
                          >
                            {months}{" "}
                            {months === 1
                              ? "month"
                              : "months"}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-secondary/20 p-4">
                    <p className="text-sm font-medium">
                      {getPlacementLabel(placement)}
                    </p>

                    <p className="mt-1 text-xs text-muted-foreground">
                      {
                        PLACEMENT_OPTIONS.find(
                          (option) =>
                            option.value === placement,
                        )?.description
                      }
                    </p>
                  </div>

                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full"
                      onClick={() => {
                        resetCreateForm();
                        setShowCreateForm(false);
                      }}
                      disabled={saving}
                    >
                      Cancel
                    </Button>

                    <Button
                      type="submit"
                      className="gap-2 rounded-full"
                      disabled={saving}
                    >
                      {saving && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}

                      Create plan
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        )}
      </section>

      <section className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Vendor Featured Listings</CardTitle>
            <CardDescription>
              Vendors who have availed featured listing plans.
              {featuredListingsTotal > 0 &&
                ` ${featuredListingsTotal} listing${
                  featuredListingsTotal === 1 ? "" : "s"
                } found.`}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {featuredListings.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center">
                <Megaphone className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                <p className="font-medium">No featured listings yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Vendor featured listing purchases will appear here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="px-3 py-3 font-medium">Vendor</th>
                      <th className="px-3 py-3 font-medium">Plan</th>
                      <th className="px-3 py-3 font-medium">Placement</th>
                      <th className="px-3 py-3 font-medium">Status</th>
                      <th className="px-3 py-3 font-medium">Amount Paid</th>
                      <th className="px-3 py-3 font-medium">Payment</th>
                      <th className="px-3 py-3 font-medium">Date</th>
                    </tr>
                  </thead>

                  <tbody>
                    {featuredListings.map((listing) => {
                      const latestPayment = listing.payments[0];

                      return (
                        <tr
                          key={listing.id}
                          className="border-b last:border-0"
                        >
                          <td className="px-3 py-4">
                            <div>
                              <p className="font-medium">
                                {listing.vendor.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {listing.vendor.vendorType}
                              </p>
                            </div>
                          </td>

                          <td className="px-3 py-4">
                            {listing.plan.name}
                          </td>

                          <td className="px-3 py-4">
                            {getPlacementLabel(listing.placement)}
                          </td>

                          <td className="px-3 py-4">
                            <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium">
                              {listing.status}
                            </span>
                          </td>

                          <td className="px-3 py-4">
                            {listing.pricePaid != null
                              ? formatPrice(listing.pricePaid)
                              : "—"}
                            {listing.discountPercent > 0 && (
                              <p className="text-xs text-muted-foreground">
                                {listing.discountPercent}% discount
                              </p>
                            )}
                          </td>

                          <td className="px-3 py-4">
                            {latestPayment ? (
                              <div>
                                <p className="font-medium">
                                  {latestPayment.status}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {latestPayment.provider}
                                </p>
                              </div>
                            ) : (
                              "—"
                            )}
                          </td>

                          <td className="px-3 py-4 text-muted-foreground">
                            {new Date(
                              listing.createdAt,
                            ).toLocaleDateString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </AdminShell>
  );
}

export default AdminFeaturedListings;