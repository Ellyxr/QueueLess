import { useEffect, useState } from "react";
import {
  Camera,
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
  ArrowRight,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { logoutUser } from '@/features/auth/api';
import { useRequireAuth } from '@/hooks/use-require-auth';

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

const initialProfile = {
  fullName: "Toni Fowler",
  email: "jamie.rivera@students.nu-laguna.edu.ph",
  phone: "1234567891",
  password: "Password123!",
};

const orderHistory = [
  {
    item: "Sunset Burrito Bowl",
    vendor: "North Loop Kitchen",
    date: "Jul 17",
    total: "$14.50",
  },
  {
    item: "Pesto Pasta Box",
    vendor: "Cinder Flatbread",
    date: "Jul 14",
    total: "$18.20",
  },
  {
    item: "Berry Smoothie",
    vendor: "Bamboo Lane",
    date: "Jul 11",
    total: "$7.90",
  },
  {
    item: "Campus Lunch Combo",
    vendor: "Elm Street Cafe",
    date: "Jul 06",
    total: "$12.60",
  },
];

const orderHighlights = [
  {
    label: "Latest Order",
    title: "Sunset Burrito Bowl",
    subtitle: "North Loop Kitchen",
    image:
      "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=80",
    className: "bg-card",
  },
  {
    label: "Most Ordered Food",
    title: "Pesto Pasta Box",
    subtitle: "Cinder Flatbread",
    image:
      "https://images.unsplash.com/photo-1473093295043-cdd812d0e601?auto=format&fit=crop&w=900&q=80",
    className: "bg-primary",
  },
  {
    label: "Favorite Vendor",
    title: "North Loop Kitchen",
    subtitle: "Your favorite campus vendor",
    image:
      "https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=900&q=80",
    className: "bg-card",
  },
];

export default function ProfilePage() {
  // US-008: Redirect kapag walang valid auth
  useRequireAuth();
  
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [profile, setProfile] = useState(initialProfile);
  const [nameError, setNameError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setIsLoading(false), 600);
    return () => window.clearTimeout(timer);
  }, []);

  // Password change states
  const [currentPasswordInput, setCurrentPasswordInput] = useState("");
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [confirmPasswordInput, setConfirmPasswordInput] = useState("");
  const [passwordMessage, setPasswordMessage] = useState<{
    text: string;
    type: "error" | "success";
  } | null>(null);

  const [settings, setSettings] = useState({
    reducedMotion: true,
    dyslexicFont: false,
    theme: "light" as "light" | "dark",
  });

  const handleNameChange = (value: string) => {
    // Validate: no numbers or special characters (letters and spaces only)
    const filtered = value.replace(/[^a-zA-Z\s]/g, "");
    if (filtered !== value) {
      setNameError("Full name cannot contain numbers or special characters.");
    } else {
      setNameError("");
    }
    setProfile((current) => ({ ...current, fullName: filtered }));
  };

  const handlePhoneChange = (value: string) => {
    const onlyNums = value.replace(/\D/g, "").slice(0, 10);
    setProfile((current) => ({ ...current, phone: onlyNums }));
  };

  const handleSave = () => {
    // Validate passwords if changing
    if (newPasswordInput || currentPasswordInput || confirmPasswordInput) {
      if (currentPasswordInput !== profile.password) {
        setPasswordMessage({
          text: "Current password is incorrect.",
          type: "error",
        });
        return;
      }
      if (
        newPasswordInput.length <= 8 ||
        !/[!@#$%^&*(),.?":{}|<>-_]/.test(newPasswordInput) ||
        !/\d/.test(newPasswordInput)
      ) {
        setPasswordMessage({
          text: "New password must be more than 8 characters, include at least 1 special character and 1 number.",
          type: "error",
        });
        return;
      }
      if (newPasswordInput !== confirmPasswordInput) {
        setPasswordMessage({
          text: "Confirm password does not match new password.",
          type: "error",
        });
        return;
      }

      // Success state update
      setProfile((current) => ({ ...current, password: newPasswordInput }));
      setPasswordMessage({
        text: "Password successfully updated!",
        type: "success",
      });
    } else {
      setPasswordMessage(null);
    }

    setIsEditing(false);
  };

  const isPhoneInvalid = profile.phone.length !== 10;
  const isNewPasswordInvalid =
    newPasswordInput.length > 0 &&
    (newPasswordInput.length <= 8 ||
      !/[!@#$%^&*(),_.?":{}|<>-]/.test(newPasswordInput) ||
      !/\d/.test(newPasswordInput));
  const isConfirmPasswordInvalid =
    confirmPasswordInput.length > 0 &&
    confirmPasswordInput !== newPasswordInput;

  const handleCancel = () => {
    setIsEditing(false);
    setPasswordMessage(null);
    setCurrentPasswordInput("");
    setNewPasswordInput("");
    setConfirmPasswordInput("");
  };

  if (isLoading) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-4 py-8">
        <div className="flex flex-col items-center justify-center gap-3 rounded-[24px] border border-border bg-card/80 px-8 py-6 shadow-sm backdrop-blur-sm">
          <Spinner className="h-8 w-8 text-primary" />
          <p className="text-sm font-medium text-muted-foreground">
            Loading profile...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6 lg:px-6">
      <div className="grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
        <section className="space-y-6">
          <Card className="border-card-border/80 bg-card/90 shadow-sm backdrop-blur-sm">
            <CardContent className="p-5 sm:p-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <Avatar className="h-20 w-20 border border-border bg-secondary">
                      <AvatarImage src="" alt={`${profile.fullName}`} />
                      <AvatarFallback className="bg-primary/10 text-xl font-semibold text-primary">
                        {profile.fullName.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <button
                      type="button"
                      className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm"
                      aria-label="Edit avatar"
                    >
                      <Camera className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      Buyer profile
                    </p>
                    <h1 className="mt-2 text-3xl font-semibold tracking-[-0.06em] text-foreground sm:text-4xl">
                      {profile.fullName}
                    </h1>
                    <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                      <ShieldCheck className="h-4 w-4 text-primary" />
                      Account verified
                    </p>
                  </div>
                </div>

                <Button
                  type="button"
                  variant={isEditing ? "outline" : "default"}
                  className="group w-full rounded-full sm:w-auto"
                  onClick={() => {
                    if (isEditing) {
                      handleCancel();
                    } else {
                      setIsEditing(true);
                    }
                  }}
                >
                  {" "}
                  {!isEditing && (
                    <PencilLine className="mr-0 h-4 w-4 max-w-0 translate-x-[-4px] overflow-hidden opacity-0 transition-all duration-300 ease-in-out group-hover:mr-2 group-hover:max-w-4 group-hover:translate-x-0 group-hover:opacity-100" />
                  )}{" "}
                  {isEditing ? "Cancel" : "Edit profile"}{" "}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-3">
            {orderHighlights.map((item, index) => (
              <Card
                key={item.label}
                className={`group relative min-h-[190px] overflow-hidden rounded-[22px] border-card-border/80 shadow-sm ${item.className}`}
              >
                {" "}
                {/* Placeholder food/vendor image */}{" "}
                <img
                  src={item.image}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />{" "}
                {/* White gradient — text remains on the solid side */}{" "}
                <div
                  className={`absolute inset-0 ${index === 1 ? "bg-gradient-to-r from-primary via-primary/90 to-transparent" : "bg-gradient-to-r from-white via-white/95 to-transparent"}`}
                />{" "}
                <CardContent className="relative z-10 flex h-full min-h-[190px] flex-col justify-between p-5">
                  {" "}
                  <div className="max-w-[75%]">
                    {" "}
                    <p
                      className={`font-mono text-[9px] uppercase tracking-[0.18em] ${index === 1 ? "text-primary-foreground/70" : "text-muted-foreground"}`}
                    >
                      {" "}
                      {item.label}{" "}
                    </p>{" "}
                    <h3
                      className={`mt-3 text-xl font-semibold leading-tight tracking-[-0.04em] ${index === 1 ? "text-primary-foreground" : "text-foreground"}`}
                    >
                      {" "}
                      {item.title}{" "}
                    </h3>{" "}
                    <p
                      className={`mt-1 text-xs ${index === 1 ? "text-primary-foreground/75" : "text-muted-foreground"}`}
                    >
                      {" "}
                      {item.subtitle}{" "}
                    </p>{" "}
                  </div>{" "}
                  {index === 0 && (
                    <Button
                      type="button"
                      size="sm"
                      className="group/order-again relative mt-4 w-full sm:w-25 rounded-full px-4 transition-all duration-500 ease-in-out hover:w-full flex items-center justify-between"
                    >
                      <span className="absolute left-1/2 -translate-x-1/2 transition-all duration-300 ease-in-out group-hover/order-again:static group-hover/order-again:translate-x-0">
                        Order Again
                      </span>
                      <ArrowRight className="ml-auto h-4 w-4 translate-x-2 opacity-0 transition-all duration-300 ease-in-out group-hover/order-again:translate-x-0 group-hover/order-again:opacity-100" />
                    </Button>
                  )}
                  {index === 1 && (
                    <Button
                      type="button"
                      variant="secondary"
                      className="group/order-again relative mt-4 w-full sm:w-25 rounded-full px-4 transition-all duration-500 ease-in-out hover:w-full flex items-center justify-between"
                      aria-label="Order Again"
                    >
                      <span className="absolute left-1/2 -translate-x-1/2 transition-all duration-300 ease-in-out group-hover/order-again:static group-hover/order-again:translate-x-0">Order Again</span>

                      <ArrowRight className="ml-auto h-4 w-4 translate-x-2 opacity-0 transition-all duration-300 ease-in-out group-hover/order-again:translate-x-0 group-hover/order-again:opacity-100" />
                    </Button>
                  )}
                </CardContent>{" "}
              </Card>
            ))}
          </div>

          <Card className="border-card-border/80 bg-card/90 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-2xl tracking-[-0.05em] text-foreground">
                Profile details
              </CardTitle>
              <CardDescription>
                Manage your account information and login details.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 px-6 pb-6">
              {passwordMessage && (
                <div
                  className={`mb-4 rounded-md p-3 text-xs font-medium ${passwordMessage.type === "error" ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-600"}`}
                >
                  {passwordMessage.text}
                </div>
              )}

              {isEditing ? (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      Full name
                    </label>
                    <Input
                      value={profile.fullName}
                      onChange={(event) => handleNameChange(event.target.value)}
                    />
                    {nameError && (
                      <p className="text-[11px] text-yellow-500 font-medium mt-1">
                        {nameError}
                      </p>
                    )}
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">
                        Email
                      </label>
                      <div className="relative flex items-center rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring overflow-hidden">
                        <Input
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
                          className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-xs px-3 h-9"
                        />
                        <span className="px-3 py-2 text-xs text-muted-foreground bg-muted border-l border-input select-none flex items-center justify-center whitespace-nowrap">
                          @students.nu-laguna.edu.ph
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Only the username part of your institutional email can
                        be edited.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">
                        Phone number
                      </label>
                      <div className="relative flex items-center rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring overflow-hidden">
                        <span className="px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 bg-muted border-r border-input select-none flex items-center justify-center">
                          +63
                        </span>
                        <Input
                          id="phoneNumber"
                          type="tel"
                          required
                          maxLength={10}
                          value={profile.phone}
                          onChange={(e) => handlePhoneChange(e.target.value)}
                          placeholder="XXX-XXX-XXXX"
                          className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-xs px-3 h-9"
                        />
                      </div>
                      {isPhoneInvalid && (
                        <p className="text-[11px] text-yellow-500 font-medium mt-1">
                          Phone number must be 10 digits.
                        </p>
                      )}
                    </div>
                  </div>

                  <Separator className="my-4" />
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-foreground">
                      Change Password
                    </h3>

                    <div className="space-y-2">
                      <label className="text-xs font-medium text-foreground">
                        Current password
                      </label>
                      <div className="relative">
                        <Input
                          type={showCurrentPassword ? "text" : "password"}
                          value={currentPasswordInput}
                          onChange={(event) =>
                            setCurrentPasswordInput(event.target.value)
                          }
                          className="pr-10 text-xs h-9"
                          placeholder="Enter current password"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setShowCurrentPassword((current) => !current)
                          }
                          className="absolute inset-y-0 right-3 flex items-center text-muted-foreground"
                          aria-label="Toggle current password visibility"
                        >
                          {showCurrentPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-medium text-foreground">
                        New password
                      </label>
                      <div className="relative">
                        <Input
                          type={showNewPassword ? "text" : "password"}
                          value={newPasswordInput}
                          onChange={(event) =>
                            setNewPasswordInput(event.target.value)
                          }
                          className="pr-10 text-xs h-9"
                          placeholder="Enter new password"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setShowNewPassword((current) => !current)
                          }
                          className="absolute inset-y-0 right-3 flex items-center text-muted-foreground"
                          aria-label="Toggle new password visibility"
                        >
                          {showNewPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                      {isNewPasswordInvalid && (
                        <p className="text-[11px] text-yellow-500 font-medium mt-1">
                          Must be greater than 8 characters, contain at least 1
                          special character and 1 number.
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-medium text-foreground">
                        Confirm new password
                      </label>
                      <div className="relative">
                        <Input
                          type={showConfirmPassword ? "text" : "password"}
                          value={confirmPasswordInput}
                          onChange={(event) =>
                            setConfirmPasswordInput(event.target.value)
                          }
                          className="pr-10 text-xs h-9"
                          placeholder="Confirm new password"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setShowConfirmPassword((current) => !current)
                          }
                          className="absolute inset-y-0 right-3 flex items-center text-muted-foreground"
                          aria-label="Toggle confirm password visibility"
                        >
                          {showConfirmPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                      {isConfirmPasswordInvalid && (
                        <p className="text-[11px] text-yellow-500 font-medium mt-1">
                          Passwords do not match.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCancel}
                    >
                      Cancel
                    </Button>
                    <Button type="button" onClick={handleSave}>
                      Save changes
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-1">
                    <div className="rounded-[18px] border border-border bg-secondary/40 p-4">
                      <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                        Full name
                      </p>
                      <p className="mt-2 text-lg font-medium text-foreground">
                        {profile.fullName}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-[18px] border border-border bg-secondary/40 p-4">
                      <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                        Email
                      </p>
                      <p className="mt-2 text-lg font-medium text-foreground">
                        {profile.email}
                      </p>
                    </div>
                    <div className="rounded-[18px] border border-border bg-secondary/40 p-4">
                      <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                        Phone number
                      </p>
                      <p className="mt-2 text-lg font-medium text-foreground">
                        +63 {profile.phone}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-[18px] border border-border bg-secondary/40 p-4">
                    <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                      Password
                    </p>
                    <p className="mt-2 text-lg font-medium text-foreground">
                      ••••••••••••
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-card-border/80 bg-card/90 shadow-sm">
            <CardHeader className="pb-4">
              {" "}
              <div className="flex items-start justify-between gap-4">
                {" "}
                <div>
                  {" "}
                  <CardTitle className="text-2xl tracking-[-0.05em] text-foreground">
                    {" "}
                    Order history{" "}
                  </CardTitle>{" "}
                  <CardDescription>
                    {" "}
                    Your recent campus purchases.{" "}
                  </CardDescription>{" "}
                </div>{" "}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 rounded-full"
                >
                  {" "}
                  View all{" "}
                </Button>{" "}
              </div>{" "}
            </CardHeader>
            <CardContent className="space-y-3 p-0 px-6 pb-6">
              {orderHistory.map((order) => (
                <div key={`${order.item}-${order.date}`}>
                  <div className="flex items-center justify-between gap-3 rounded-[18px] border border-border/80 bg-secondary/30 p-4">
                    <div>
                      <p className="text-base font-medium text-foreground">
                        {order.item}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {order.vendor}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-foreground">
                        {order.total}
                      </p>
                      <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                        {order.date}
                      </p>
                    </div>
                  </div>
                  <Separator className="my-2 opacity-0" />
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <aside className="space-y-6">
          <Card className="border-card-border/80 bg-card/90 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-2xl tracking-[-0.05em] text-foreground">
                App settings
              </CardTitle>
              <CardDescription>
                Adjust the experience for easier browsing.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 p-0 px-6 pb-6">
              <div className="flex items-center justify-between gap-4 rounded-[18px] border border-border bg-secondary/30 p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Reduced motion
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Lower animation intensity
                  </p>
                </div>
                <Switch
                  checked={settings.reducedMotion}
                  onCheckedChange={(checked) =>
                    setSettings((current) => ({
                      ...current,
                      reducedMotion: checked,
                    }))
                  }
                />
              </div>

              <div className="flex items-center justify-between gap-4 rounded-[18px] border border-border bg-secondary/30 p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Dyslexic font
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Increase readability
                  </p>
                </div>
                <Switch
                  checked={settings.dyslexicFont}
                  onCheckedChange={(checked) =>
                    setSettings((current) => ({
                      ...current,
                      dyslexicFont: checked,
                    }))
                  }
                />
              </div>

              <div className="rounded-[18px] border border-border bg-secondary/30 p-3">
                <p className="text-sm font-medium text-foreground">Theme</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={settings.theme === "light" ? "default" : "outline"}
                    className="flex items-center justify-center gap-2 rounded-full"
                    onClick={() =>
                      setSettings((current) => ({ ...current, theme: "light" }))
                    }
                  >
                    <SunMedium className="h-4 w-4" />
                    Light
                  </Button>
                  <Button
                    type="button"
                    variant={settings.theme === "dark" ? "default" : "outline"}
                    className="flex items-center justify-center gap-2 rounded-full"
                    onClick={() =>
                      setSettings((current) => ({ ...current, theme: "dark" }))
                    }
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
              <div className="flex items-center gap-3 rounded-[18px] border border-border bg-secondary/30 p-3 text-foreground">
                <UserRound className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-sm font-medium">Member since</p>
                  <p className="text-xs text-muted-foreground">August 2024</p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between rounded-[18px] border border-border bg-secondary/30 p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Check className="h-4 w-4 text-primary" />
                  Security status
                </div>
                <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                  Active
                </span>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>

      <div className="mt-8 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:justify-end">
        <Button 
          type="button" 
          variant="ghost" 
          onClick={logoutUser}
          className="justify-center gap-2 rounded-full text-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="h-4 w-4" />
          Log out
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="justify-center gap-2 rounded-full text-destructive hover:bg-destructive/5 hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
          Delete account
        </Button>
      </div>
    </main>
  );
}
