import { ReceiptText, ShoppingBag, Store, UserPlus, Users, Wallet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminShell } from "./admin-shell";
import { MOCK_ACTIVITY, MOCK_METRICS } from "./admin-data";

const currency = (amount: number) => `₱${amount.toLocaleString("en-PH")}`;

export default function AdminDashboardPage() {
  const metrics = MOCK_METRICS;

  const cards = [
    { label: "Students", value: metrics.totalStudents.toLocaleString(), icon: Users },
    { label: "Vendors", value: metrics.totalVendors.toLocaleString(), icon: Store },
    {
      label: "Orders today",
      value: (metrics.activeOrdersToday + metrics.completedOrdersToday).toLocaleString(),
      icon: ShoppingBag,
    },
    { label: "Revenue today", value: currency(metrics.platformRevenueToday), icon: Wallet },
    { label: "Pending refunds", value: metrics.pendingRefunds.toLocaleString(), icon: ReceiptText },
    { label: "New signups (7d)", value: metrics.newSignupsThisWeek.toLocaleString(), icon: UserPlus },
  ];

  return (
    <AdminShell>
      <div className="mb-6 rounded-2xl border border-dashed border-amber-500/40 bg-amber-500/5 px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
        Showing placeholder data — there's no platform metrics endpoint yet. See AddressMe.md.
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="border-card-border/80 bg-card/90 shadow-sm">
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  {label}
                </p>
                <p className="mt-2 text-2xl font-bold tracking-[-0.04em] text-foreground">
                  {value}
                </p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-6 border-card-border/80 bg-card/90 shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl tracking-tighter">Recent activity</CardTitle>
          <CardDescription>
            Platform-wide events across students, vendors, and orders.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {MOCK_ACTIVITY.map((event) => (
            <div
              key={event.id}
              className="flex flex-col gap-1 rounded-[16px] border border-border/80 bg-secondary/30 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="text-foreground">{event.message}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(event.timestamp).toLocaleString()}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </AdminShell>
  );
}
