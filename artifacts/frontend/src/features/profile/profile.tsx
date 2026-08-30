import { useState } from 'react';
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
} from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';

const initialProfile = {
  firstName: 'Jamie',
  lastName: 'Rivera',
  email: 'jamie.rivera@campus.edu',
  phone: '+1 (415) 204-1102',
  password: '********',
};

const orderHistory = [
  { item: 'Sunset Burrito Bowl', vendor: 'North Loop Kitchen', date: 'Jul 17', total: '$14.50' },
  { item: 'Pesto Pasta Box', vendor: 'Cinder Flatbread', date: 'Jul 14', total: '$18.20' },
  { item: 'Berry Smoothie', vendor: 'Bamboo Lane', date: 'Jul 11', total: '$7.90' },
  { item: 'Campus Lunch Combo', vendor: 'Elm Street Cafe', date: 'Jul 06', total: '$12.60' },
];

const stats = [
  { label: 'Orders placed', value: '38' },
  { label: 'Items bought', value: '126' },
  { label: 'Saved total', value: '$418' },
];

export default function ProfilePage() {
  const [isEditing, setIsEditing] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [profile, setProfile] = useState(initialProfile);
  const [settings, setSettings] = useState({
    reducedMotion: true,
    dyslexicFont: false,
    theme: 'light' as 'light' | 'dark',
  });

  const handleChange = (field: keyof typeof initialProfile, value: string) => {
    setProfile((current) => ({ ...current, [field]: value }));
  };

  const handleSave = () => {
    setIsEditing(false);
  };

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 lg:px-10">
      <div className="grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
        <section className="space-y-6">
          <Card className="border-card-border/80 bg-card/90 shadow-sm backdrop-blur-sm">
            <CardContent className="p-5 sm:p-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <Avatar className="h-20 w-20 border border-border bg-secondary">
                      <AvatarImage src="" alt={`${profile.firstName} ${profile.lastName}`} />
                      <AvatarFallback className="bg-primary/10 text-xl font-semibold text-primary">
                        {profile.firstName.charAt(0)}
                        {profile.lastName.charAt(0)}
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
                      {profile.firstName} {profile.lastName}
                    </h1>
                    <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                      <ShieldCheck className="h-4 w-4 text-primary" />
                      Account verified
                    </p>
                  </div>
                </div>

                <Button
                  type="button"
                  variant={isEditing ? 'outline' : 'default'}
                  className="w-full rounded-full sm:w-auto"
                  onClick={() => setIsEditing((current) => !current)}
                >
                  <PencilLine className="mr-2 h-4 w-4" />
                  {isEditing ? 'Cancel' : 'Edit profile'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-3">
            {stats.map((item) => (
              <Card key={item.label} className="border-card-border/80 bg-card/95 shadow-sm">
                <CardContent className="flex flex-col gap-2 p-4">
                  <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">{item.label}</p>
                  <p className="text-3xl font-semibold tracking-[-0.06em] text-foreground">{item.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="border-card-border/80 bg-card/90 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-2xl tracking-[-0.05em] text-foreground">Profile details</CardTitle>
              <CardDescription>Manage your account information and login details.</CardDescription>
            </CardHeader>
            <CardContent className="p-0 px-6 pb-6">
              {isEditing ? (
                <div className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">First name</label>
                      <Input
                        value={profile.firstName}
                        onChange={(event) => handleChange('firstName', event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Last name</label>
                      <Input
                        value={profile.lastName}
                        onChange={(event) => handleChange('lastName', event.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Email</label>
                      <Input
                        type="email"
                        value={profile.email}
                        onChange={(event) => handleChange('email', event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Phone number</label>
                      <Input
                        type="tel"
                        value={profile.phone}
                        onChange={(event) => handleChange('phone', event.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Password</label>
                    <div className="relative">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        value={profile.password}
                        onChange={(event) => handleChange('password', event.target.value)}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((current) => !current)}
                        className="absolute inset-y-0 right-3 flex items-center text-muted-foreground"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>
                      Cancel
                    </Button>
                    <Button type="button" onClick={handleSave}>
                      Save changes
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-[18px] border border-border bg-secondary/40 p-4">
                      <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">First name</p>
                      <p className="mt-2 text-lg font-medium text-foreground">{profile.firstName}</p>
                    </div>
                    <div className="rounded-[18px] border border-border bg-secondary/40 p-4">
                      <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Last name</p>
                      <p className="mt-2 text-lg font-medium text-foreground">{profile.lastName}</p>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-[18px] border border-border bg-secondary/40 p-4">
                      <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Email</p>
                      <p className="mt-2 text-lg font-medium text-foreground">{profile.email}</p>
                    </div>
                    <div className="rounded-[18px] border border-border bg-secondary/40 p-4">
                      <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Phone number</p>
                      <p className="mt-2 text-lg font-medium text-foreground">{profile.phone}</p>
                    </div>
                  </div>

                  <div className="rounded-[18px] border border-border bg-secondary/40 p-4">
                    <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Password</p>
                    <p className="mt-2 text-lg font-medium text-foreground">••••••••••</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-card-border/80 bg-card/90 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-2xl tracking-[-0.05em] text-foreground">Order history</CardTitle>
              <CardDescription>Your recent campus purchases.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 p-0 px-6 pb-6">
              {orderHistory.map((order) => (
                <div key={`${order.item}-${order.date}`}>
                  <div className="flex items-center justify-between gap-3 rounded-[18px] border border-border/80 bg-secondary/30 p-4">
                    <div>
                      <p className="text-base font-medium text-foreground">{order.item}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{order.vendor}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-foreground">{order.total}</p>
                      <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">{order.date}</p>
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
              <CardTitle className="text-2xl tracking-[-0.05em] text-foreground">App settings</CardTitle>
              <CardDescription>Adjust the experience for easier browsing.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 p-0 px-6 pb-6">
              <div className="flex items-center justify-between gap-4 rounded-[18px] border border-border bg-secondary/30 p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Reduced motion</p>
                  <p className="text-xs text-muted-foreground">Lower animation intensity</p>
                </div>
                <Switch
                  checked={settings.reducedMotion}
                  onCheckedChange={(checked) => setSettings((current) => ({ ...current, reducedMotion: checked }))}
                />
              </div>

              <div className="flex items-center justify-between gap-4 rounded-[18px] border border-border bg-secondary/30 p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Dyslexic font</p>
                  <p className="text-xs text-muted-foreground">Increase readability</p>
                </div>
                <Switch
                  checked={settings.dyslexicFont}
                  onCheckedChange={(checked) => setSettings((current) => ({ ...current, dyslexicFont: checked }))}
                />
              </div>

              <div className="rounded-[18px] border border-border bg-secondary/30 p-3">
                <p className="text-sm font-medium text-foreground">Theme</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={settings.theme === 'light' ? 'default' : 'outline'}
                    className="flex items-center justify-center gap-2 rounded-full"
                    onClick={() => setSettings((current) => ({ ...current, theme: 'light' }))}
                  >
                    <SunMedium className="h-4 w-4" />
                    Light
                  </Button>
                  <Button
                    type="button"
                    variant={settings.theme === 'dark' ? 'default' : 'outline'}
                    className="flex items-center justify-center gap-2 rounded-full"
                    onClick={() => setSettings((current) => ({ ...current, theme: 'dark' }))}
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
                <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Active</span>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>

      <div className="mt-8 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" className="justify-center gap-2 rounded-full text-foreground">
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
