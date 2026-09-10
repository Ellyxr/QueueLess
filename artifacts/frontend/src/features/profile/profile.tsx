import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  Eye,
  EyeOff,
  LogOut,
  MoonStar,
  PencilLine,
  ShieldCheck,
  SunMedium,
  Trash2,
  UserRound,
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
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  getMyOrders,
  getMyProfile,
  listVendors,
  changeMyPassword,
  logoutUser,
  updateMyProfile,
  type CustomerOrder,
  type VendorStorefront,
} from "@/features/auth/api";
import { useRequireAuth } from "@/hooks/use-require-auth";

type Theme = "light" | "dark";

function EmptyState({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: string;
}) {
  return (
    <div className="rounded-[18px] bg-gray-10 p-8 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      {action && (
        <Button
          type="button"
          className="mt-4 rounded-full"
          onClick={() => (window.location.href = "/")}
        >
          {action}
        </Button>
      )}
    </div>
  );
}

export default function ProfilePage() {
  useRequireAuth();

  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    error?: boolean;
  } | null>(null);
  const [profile, setProfile] = useState({
    fullName: "",
    email: "",
    phone: "",
  });
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [vendors, setVendors] = useState<VendorStorefront[]>([]);
  const [favoriteVendorId, setFavoriteVendorId] = useState(
    () => localStorage.getItem("favorite-vendor-id") || "",
  );
  const [theme, setThemeState] = useState<Theme>(() =>
    localStorage.getItem("theme") === "dark" ? "dark" : "light",
  );
  const [seePasabuyRequest, setSeePasabuyRequest] = useState(
    () => localStorage.getItem("see-pasabuy-request") === "true",
  );
  const [reducedMotion, setReducedMotion] = useState(true);
  const [dyslexicFont, setDyslexicFont] = useState(false);
  const [nameError, setNameError] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    Promise.all([getMyProfile(), getMyOrders(), listVendors()])
      .then(([user, customerOrders, vendorList]) => {
        setProfile({
          fullName: user.fullName,
          email: user.email,
          phone: user.phone || "",
        });
        setOrders(customerOrders);
        setVendors(vendorList);
      })
      .catch((error: unknown) =>
        setMessage({
          text:
            error instanceof Error ? error.message : "Unable to load profile.",
          error: true,
        }),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    localStorage.setItem("theme", theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
    window.dispatchEvent(new Event("queueless-theme-changed"));
  }, [theme]);

  const nameParts = profile.fullName.trim().split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ");
  const incomplete = !firstName || !lastName || !profile.phone;
  const favoriteVendor = vendors.find(
    (vendor) => vendor.id === favoriteVendorId,
  );
  const latestOrder = orders[0];
  const mostOrdered = useMemo(() => {
    const counts = new Map<string, { name: string; quantity: number }>();
    orders.forEach((order) =>
      order.items.forEach((item) => {
        const current = counts.get(item.productId) || {
          name: item.name,
          quantity: 0,
        };
        counts.set(item.productId, {
          name: current.name,
          quantity: current.quantity + item.quantity,
        });
      }),
    );
    return [...counts.values()].sort((a, b) => b.quantity - a.quantity)[0];
  }, [orders]);

  const updateNamePart = (part: "first" | "last", value: string) => {
    const filtered = value.replace(/[^a-zA-Z\s]/g, "");
    setNameError(
      filtered === value
        ? ""
        : "Names cannot contain numbers or special characters.",
    );
    const nextFirst = part === "first" ? filtered.trim() : firstName;
    const nextLast = part === "last" ? filtered.trim() : lastName;
    setProfile((current) => ({
      ...current,
      fullName: `${nextFirst} ${nextLast}`.trim(),
    }));
  };

  const saveProfile = async () => {
    const phone = profile.phone.replace(/\D/g, "").slice(0, 10);
    if (!firstName || !lastName || phone.length !== 10 || nameError) {
      setMessage({
        text: "Complete your first name, last name, and 10-digit phone number.",
        error: true,
      });
      return;
    }
    setSaving(true);
    try {
      const updated = await updateMyProfile({
        fullName: `${firstName} ${lastName}`,
        phone,
      });
      setProfile({
        fullName: updated.fullName,
        email: updated.email,
        phone: updated.phone || "",
      });
      setEditing(false);
      setMessage({ text: "Profile successfully updated." });
    } catch (error: unknown) {
      setMessage({
        text:
          error instanceof Error ? error.message : "Unable to update profile.",
        error: true,
      });
    } finally {
      setSaving(false);
    }
  };

  const chooseFavorite = (vendorId: string) => {
    setFavoriteVendorId(vendorId);
    localStorage.setItem("favorite-vendor-id", vendorId);
  };

  const savePassword = async () => {
    if (newPassword.length < 9 || newPassword !== confirmPassword) {
      setMessage({
        text: "New passwords must match and contain at least 9 characters.",
        error: true,
      });
      return;
    }
    setSaving(true);
    try {
      await changeMyPassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage({ text: "Password successfully updated." });
    } catch (error: unknown) {
      setMessage({
        text:
          error instanceof Error ? error.message : "Unable to update password.",
        error: true,
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <Spinner className="h-8 w-8 text-primary" />
      </main>
    );

  return (
    <main className="mx-auto w-full max-w-[1300px] px-4 py-8 sm:px-6">
      <div className="grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
        <section className="space-y-4">
          <Card className="border-card-border/80 bg-card/90 shadow-sm">
            <CardContent className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Buyer profile
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-[-0.06em] text-foreground">
                  {profile.fullName || "Complete your profile"}
                </h1>
                <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Account verified{" "}
                  {incomplete && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white"
                      title="Complete your profile"
                    >
                      <AlertCircle className="h-3 w-3" />!
                    </span>
                  )}
                </p>
              </div>
              <Button
                type="button"
                variant={editing ? "outline" : "default"}
                className="gap-2 rounded-full"
                onClick={() => setEditing((current) => !current)}
              >
                <PencilLine className="h-4 w-4" />
                {editing ? "Cancel" : "Edit profile"}
              </Button>
            </CardContent>
          </Card>

          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="relative min-h-47.5 overflow-hidden rounded-[22px] border-card-border/80 bg-gray-10">
              <img
                src="https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=80"
                alt=""
                className="absolute inset-0 h-full w-full object-cover opacity-35"
              />
              <div className="absolute inset-0 bg-linear-to-r from-background via-background/70 to-transparent" />
              <CardContent className="relative z-10 flex min-h-47.5 flex-col justify-between p-5">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                    Latest Order
                  </p>
                  {latestOrder ? (
                    <>
                      <h3 className="mt-3 text-xl font-semibold text-foreground">
                        {latestOrder.items[0]?.name || "Order"}
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {latestOrder.vendor.name} · ₱{latestOrder.total}
                      </p>
                    </>
                  ) : (
                    <p className="mt-8 text-sm text-muted-foreground">
                      No orders yet
                    </p>
                  )}
                </div>
                {latestOrder && (
                  <Button
                    type="button"
                    size="sm"
                    className="mt-4 rounded-full"
                    onClick={() => (window.location.href = "/")}
                  >
                    Order again
                  </Button>
                )}
              </CardContent>
            </Card>
            <Card className="relative min-h-47.5 overflow-hidden rounded-[22px] border-card-border/80 bg-gray-10">
              <img
                src="https://images.unsplash.com/photo-1473093295043-cdd812d0e601?auto=format&fit=crop&w=900&q=80"
                alt=""
                className="absolute inset-0 h-full w-full object-cover opacity-35"
              />
              <div className="absolute inset-0 bg-linear-to-r from-background via-background/70 to-transparent" />
              <CardContent className="relative z-10 flex min-h-47.5 flex-col justify-between p-5">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                    Most Ordered Food
                  </p>
                  {mostOrdered ? (
                    <>
                      <h3 className="mt-3 text-xl font-semibold text-foreground">
                        {mostOrdered.name}
                      </h3>
                      <p className="mt-16 text-sm text-muted-foreground">
                        Ordered{" "}
                        <span className="font-extrabold text-primary">
                          {" "}
                          {mostOrdered.quantity}{" "}
                        </span>{" "}
                        <span className="text-xs">time </span>
                        {mostOrdered.quantity === 1 ? "" : "s"}
                      </p>
                    </>
                  ) : (
                    <p className="mt-8 text-sm text-muted-foreground">
                      Order food to see it here
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
            <Card className="relative min-h-47.5 overflow-hidden rounded-[22px] border-card-border/80 bg-gray-10">
              <img
                src="https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=900&q=80"
                alt=""
                className="absolute inset-0 h-full w-full object-cover opacity-35"
              />
              <div className="absolute inset-0 bg-linear-to-r from-background via-background/70 to-transparent" />
              <CardContent className="relative z-10 flex min-h-47.5 flex-col justify-between p-5">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                    Favorite Vendor
                  </p>
                  {favoriteVendor ? (
                    <>
                      <h3 className="mt-3 text-xl font-semibold text-foreground">
                        {favoriteVendor.name}
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {favoriteVendor.description ||
                          "Your favorite campus vendor"}
                      </p>
                    </>
                  ) : (
                    <p className="mt-8 text-sm text-muted-foreground">
                      Choose a vendor to save it here
                    </p>
                  )}
                </div>
                <select
                  value={favoriteVendorId}
                  onChange={(event) => chooseFavorite(event.target.value)}
                  className="mt-4 h-9 w-full appearance-none rounded-full border border-border bg-background px-3 pr-8 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring hover:outline hover:outline-primary "
                >
                  <option value="">Add favorite vendor</option>
                  {vendors.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </option>
                  ))}
                </select>
              </CardContent>
            </Card>
          </div>

          <Card className="border-card-border/80 bg-card/90 shadow-sm">
            <CardHeader>
              <CardTitle className="text-2xl tracking-[-0.05em]">
                Profile details
              </CardTitle>
              <CardDescription>
                Manage your account information.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {message && (
                <p
                  className={`rounded-md p-3 text-xs font-medium ${message.error ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-600"}`}
                >
                  {message.text}
                </p>
              )}
              {editing ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label
                        htmlFor="first-name"
                        className="text-sm font-medium"
                      >
                        First name
                      </label>
                      <Input
                        id="first-name"
                        value={firstName}
                        onChange={(event) =>
                          updateNamePart("first", event.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <label
                        htmlFor="last-name"
                        className="text-sm font-medium"
                      >
                        Last name
                      </label>
                      <Input
                        id="last-name"
                        value={lastName}
                        onChange={(event) =>
                          updateNamePart("last", event.target.value)
                        }
                      />
                    </div>
                  </div>
                  {nameError && (
                    <p className="text-xs text-destructive">{nameError}</p>
                  )}
                  <div className="space-y-2">
                    <label
                      htmlFor="profile-email"
                      className="text-sm font-medium text-foreground"
                    >
                      Email
                    </label>
                    <div className="relative flex items-center overflow-hidden rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
                      <Input
                        id="profile-email"
                        type="text"
                        value={profile.email.split("@")[0]}
                        onChange={(e) => {
                          const username = e.target.value;
                          setProfile((current) => ({
                            ...current,
                            email: `${username}@students.nu-laguna.edu.ph`,
                          }));
                        }}
                        placeholder="username"
                        className="h-9 border-0 bg-transparent text-xs px-3 focus-visible:ring-0 focus-visible:ring-offset-0"
                      />
                      <span className="flex items-center justify-center border-l border-input bg-muted px-3 py-2 text-xs text-muted-foreground select-none whitespace-nowrap">
                        @students.nu-laguna.edu.ph
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label
                      htmlFor="phone-number"
                      className="text-sm font-medium text-foreground"
                    >
                      Phone number
                    </label>
                    <div className="relative flex items-center overflow-hidden rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
                      <span className="flex items-center justify-center border-r border-input bg-muted px-3 py-2 text-xs font-bold text-slate-600 select-none whitespace-nowrap dark:text-slate-300">
                        +63
                      </span>
                      <Input
                        id="phone-number"
                        type="tel"
                        value={profile.phone}
                        maxLength={10}
                        onChange={(event) =>
                          setProfile((current) => ({
                            ...current,
                            phone: event.target.value
                              .replace(/\D/g, "")
                              .slice(0, 10),
                          }))
                        }
                        placeholder="XXXXXXXXXX"
                        className="h-9 border-0 bg-transparent text-xs px-3 focus-visible:ring-0 focus-visible:ring-offset-0"
                      />
                    </div>
                  </div>
                  <Button
                    type="button"
                    disabled={saving}
                    onClick={saveProfile}
                    className="rounded-full"
                  >
                    {saving ? "Saving..." : "Save changes"}
                  </Button>
                </>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-[18px] border border-border bg-secondary/40 p-4">
                      <p className="text-xs text-muted-foreground">Full name</p>
                      <p className="mt-2 text-lg font-medium">
                        {profile.fullName}
                      </p>
                    </div>
                    <div className="rounded-[18px] border border-border bg-secondary/40 p-4">
                      <p className="text-xs text-muted-foreground">Email</p>
                      <p className="mt-2 text-lg font-medium">
                        {profile.email}
                      </p>
                    </div>
                  </div>
                  <div className="rounded-[18px] border border-border bg-secondary/40 p-4">
                    <p className="text-xs text-muted-foreground">
                      Phone number
                    </p>
                    <p className="mt-2 text-lg font-medium">
                      {profile.phone ? `+63 ${profile.phone}` : "Not added"}
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-card-border/80 bg-card/90 shadow-sm">
            <CardHeader>
              <CardTitle className="text-2xl tracking-tighter">
                Change password
              </CardTitle>
              <CardDescription>
                Use a new password with at least 9 characters.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {[
                [
                  "current-password",
                  "Current password",
                  currentPassword,
                  setCurrentPassword,
                  showCurrentPassword,
                  setShowCurrentPassword,
                ],
                [
                  "new-password",
                  "New password",
                  newPassword,
                  setNewPassword,
                  showNewPassword,
                  setShowNewPassword,
                ],
                [
                  "confirm-password",
                  "Confirm new password",
                  confirmPassword,
                  setConfirmPassword,
                  showConfirmPassword,
                  setShowConfirmPassword,
                ],
              ].map(([id, label, value, setValue, visible, setVisible]) => (
                <div key={id as string} className="space-y-2">
                  <label htmlFor={id as string} className="text-sm font-medium">
                    {label as string}
                  </label>
                  <div className="relative">
                    <Input
                      id={id as string}
                      type={visible ? "text" : "password"}
                      value={value as string}
                      onChange={(event) =>
                        (setValue as (value: string) => void)(
                          event.target.value,
                        )
                      }
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        (setVisible as (value: boolean) => void)(!visible)
                      }
                      className="absolute inset-y-0 right-3 text-muted-foreground"
                      aria-label={`Toggle ${label as string} visibility`}
                    >
                      {visible ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
              <Button
                type="button"
                disabled={
                  saving || !currentPassword || !newPassword || !confirmPassword
                }
                onClick={savePassword}
                className="rounded-full"
              >
                {saving ? "Saving..." : "Update password"}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-card-border/80 bg-card/90 shadow-sm">
            <CardHeader>
              <CardTitle className="text-2xl tracking-tighter">
                Order history
              </CardTitle>
              <CardDescription>Your recent campus purchases.</CardDescription>
            </CardHeader>
            <CardContent>
              {orders.length === 0 ? (
                <EmptyState
                  title="No orders yet"
                  detail="Your campus purchases will appear here."
                  action="Create an order"
                />
              ) : (
                <div className="space-y-3">
                  {orders.map((order) => (
                    <div
                      key={order.id}
                      className="flex items-center justify-between gap-3 rounded-[18px] border border-border/80 bg-secondary/30 p-4"
                    >
                      <div>
                        <p className="font-medium">
                          {order.items[0]?.name || "Order"}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {order.vendor.name}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">₱{order.total}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {new Date(order.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <aside className="space-y-6">
          <Card className="border-card-border/80 bg-card/90 shadow-sm">
            <CardHeader>
              <CardTitle className="text-2xl tracking-tighter">
                App settings
              </CardTitle>
              <CardDescription>
                Adjust the experience for easier browsing.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-[18px] border border-border bg-secondary/30 p-3">
                <span className="text-sm font-medium">Reduced motion</span>
                <Switch
                  checked={reducedMotion}
                  onCheckedChange={setReducedMotion}
                />
              </div>
              <div className="flex items-center justify-between rounded-[18px] border border-border bg-secondary/30 p-3">
                <span className="text-sm font-medium">Dyslexic font</span>
                <Switch
                  checked={dyslexicFont}
                  onCheckedChange={setDyslexicFont}
                />
              </div>
              <div className="flex items-center justify-between rounded-[18px] border border-border bg-secondary/30 p-3">
                <span className="text-sm font-medium">
                  See Pasabuy Requests
                </span>
                <Switch
                  checked={seePasabuyRequest}
                  onCheckedChange={(checked) => {
                    setSeePasabuyRequest(checked);
                    localStorage.setItem(
                      "see-pasabuy-request",
                      String(checked),
                    );
                  }}
                />
              </div>
              <div className="rounded-[18px] border border-border bg-secondary/30 p-3">
                <p className="text-sm font-medium">Theme</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={theme === "light" ? "default" : "outline"}
                    className="gap-2 rounded-full"
                    onClick={() => setThemeState("light")}
                  >
                    <SunMedium className="h-4 w-4" />
                    Light
                  </Button>
                  <Button
                    type="button"
                    variant={theme === "dark" ? "default" : "outline"}
                    className="gap-2 rounded-full"
                    onClick={() => setThemeState("dark")}
                  >
                    <MoonStar className="h-4 w-4" />
                    Dark
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-card-border/80 bg-card/90 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 rounded-[18px] border border-border bg-secondary/30 p-3">
                <UserRound className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-sm font-medium">Account status</p>
                  <p className="text-xs text-muted-foreground">Active</p>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2 rounded-[18px] border border-border bg-secondary/30 p-3 text-sm font-medium">
                <Check className="h-4 w-4 text-primary" />
                Security status: Active
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>

      <div className="mt-8 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="ghost"
          onClick={() =>
            (window.location.href =
              "mailto:nicholequimpan@gmail.com?cc=avrilphoebematanguiham@gmail.com,lingahanayanna@gmail.com&subject=QueueLess%20problem")
          }
          className="rounded-full text-blue-600 hover:bg-blue-50 hover:text-blue-700"
        >
          Report a problem
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={logoutUser}
          className="gap-2 rounded-full hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="h-4 w-4" />
          Log out
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="gap-2 rounded-full text-destructive hover:bg-destructive/5"
        >
          <Trash2 className="h-4 w-4" />
          Delete account
        </Button>
      </div>
    </main>
  );
}
