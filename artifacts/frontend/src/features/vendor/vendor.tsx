import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Inbox,
  Megaphone,
  Menu,
  PackageCheck,
  ShoppingBag,
  Store,
  UserCircle2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useRequireAuth } from '@/hooks/use-require-auth';

const navItems = ['Home', 'Transactions', 'Inbox', 'Profile'];

const quickActions = [
  { label: 'Orders', icon: PackageCheck },
  { label: 'Menu', icon: Menu },
  { label: 'Store', icon: Store },
  { label: 'Promotion', icon: Megaphone },
];

const performanceCards = [
  { label: 'Today', value: '124', caption: '+12.4%' },
  { label: 'Avg. ticket', value: '$18.40', caption: '+3.1%' },
  { label: 'Pending', value: '18', caption: '-5.2%' },
];

const recentOrders = [
  { id: '#1048', customer: 'Alicia M.', item: 'Burrito Bowl', total: '$18.50', status: 'Preparing' },
  { id: '#1047', customer: 'Daniel R.', item: 'Pesto Pasta', total: '$21.00', status: 'Out for delivery' },
  { id: '#1046', customer: 'Nina P.', item: 'Salad Wrap', total: '$15.75', status: 'Completed' },
  { id: '#1045', customer: 'Victor S.', item: 'Smoothie', total: '$8.00', status: 'Pending' },
];

export default function VendorPage({ username = 'Jordan' }: { username?: string }) {
  useRequireAuth(['vendor', 'student_vendor', 'admin']);
  
  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 lg:px-10">
      <div className="rounded-[28px] border border-border/80 bg-background/80 p-3 shadow-sm backdrop-blur-sm sm:p-4">
        <header className="flex items-center justify-between gap-3 rounded-[22px] border border-border/80 bg-card/80 px-3 py-3 sm:px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <span className="h-4 w-4 rounded-full border-[1.5px] border-current" />
            </div>
            <div className="hidden sm:block">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">QueueLess</p>
            </div>
          </div>

          <nav className="hidden items-center gap-2 md:flex">
            {navItems.map((item) => (
              <Button
                key={item}
                variant={item === 'Home' ? 'default' : 'ghost'}
                className={item === 'Home' ? 'rounded-full px-4 py-2' : 'rounded-full px-4 py-2 text-foreground hover:bg-secondary'}
              >
                {item}
              </Button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="rounded-full border border-border/80 bg-background text-foreground">
              <Inbox className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="rounded-full border border-border/80 bg-background text-foreground">
              <Bell className="h-4 w-4" />
            </Button>
            <Button variant="secondary" className="gap-2 rounded-full px-3 py-2 sm:px-4">
              <UserCircle2 className="h-4 w-4" />
              <span className="hidden sm:inline">{username}</span>
            </Button>
          </div>
        </header>

        <section className="mt-6 flex flex-col gap-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Good afternoon</p>
              <h1 className="mt-3 text-4xl font-extrabold tracking-[-0.07em] text-foreground sm:text-5xl lg:text-[4rem]">
                Hello, {username}
              </h1>
            </div>

            <div className="flex items-center gap-3 rounded-full border border-border bg-secondary/60 px-3 py-2 text-sm text-muted-foreground">
              <ShoppingBag className="h-4 w-4 text-primary" />
              <span>North Courtyard Kitchen</span>
            </div>
          </div>

          <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary via-primary to-primary/85 text-primary-foreground shadow-md">
            <CardContent className="flex flex-col gap-6 p-5 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-md">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary-foreground/80">Total sales</p>
                <div className="mt-3 flex items-end gap-3">
                  <span className="text-4xl font-bold tracking-[-0.07em] sm:text-5xl">$24,560</span>
                  <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-primary-foreground/10 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-primary-foreground">
                    <ArrowUpRight className="h-3.5 w-3.5" />
                    +12.4%
                  </span>
                </div>
              </div>

              <div className="flex min-w-[210px] flex-col gap-4 rounded-[22px] border border-primary-foreground/15 bg-primary-foreground/5 p-4 backdrop-blur-sm">
                <div className="flex items-center justify-between text-sm text-primary-foreground/80">
                  <span>vs last week</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em]">+8.6k</span>
                </div>
                <div className="flex items-end gap-2">
                  {[42, 58, 46, 78, 68, 90, 100].map((height, index) => (
                    <div
                      key={height + index}
                      className="w-full rounded-t-full bg-primary-foreground/85"
                      style={{ height: `${height}px` }}
                    />
                  ))}
                </div>
                <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-primary-foreground/80">
                  <span>Mon</span>
                  <span>Tue</span>
                  <span>Wed</span>
                  <span>Thu</span>
                  <span>Fri</span>
                  <span>Sat</span>
                  <span>Sun</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Quick actions</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-foreground">Manage your store</h2>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {quickActions.map(({ label, icon: Icon }) => (
              <Button
                key={label}
                variant="secondary"
                className="flex h-20 items-center justify-between rounded-[22px] border border-border bg-secondary/60 px-4 py-4 text-left shadow-sm hover:bg-secondary"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-background text-primary shadow-sm">
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="text-base font-medium text-foreground">{label}</span>
                </div>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
              </Button>
            ))}
          </div>
        </section>

        <section className="mt-8 grid gap-4 md:grid-cols-3">
          {performanceCards.map((card) => (
            <Card key={card.label} className="border-card-border/80 bg-card/90 shadow-sm">
              <CardContent className="flex items-center justify-between gap-4 p-4">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">{card.label}</p>
                  <p className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-foreground">{card.value}</p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-primary">
                  {card.caption.startsWith('-') ? (
                    <ArrowDownRight className="h-4 w-4" />
                  ) : (
                    <ArrowUpRight className="h-4 w-4" />
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Recent activity</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-foreground">Recent orders</h2>
            </div>
          </div>

          <Card className="border-card-border/80 bg-card/90 shadow-sm">
            <CardContent className="p-0">
              <div className="overflow-hidden rounded-[20px]">
                <div className="grid grid-cols-[0.8fr_1.2fr_0.8fr_0.8fr] gap-3 border-b border-border bg-secondary/40 px-4 py-3 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  <span>Order</span>
                  <span>Customer</span>
                  <span>Item</span>
                  <span className="text-right">Status</span>
                </div>

                {recentOrders.map((order) => (
                  <div
                    key={order.id}
                    className="grid grid-cols-[0.8fr_1.2fr_0.8fr_0.8fr] items-center gap-3 border-b border-border/80 px-4 py-4 last:border-b-0"
                  >
                    <div>
                      <p className="text-sm font-semibold text-foreground">{order.id}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{order.total}</p>
                    </div>
                    <p className="text-sm text-foreground">{order.customer}</p>
                    <p className="text-sm text-muted-foreground">{order.item}</p>
                    <div className="text-right">
                      <span
                        className={[
                          'inline-flex rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em]',
                          order.status === 'Completed' && 'bg-emerald-500/10 text-emerald-600',
                          order.status === 'Preparing' && 'bg-amber-500/10 text-amber-600',
                          order.status === 'Out for delivery' && 'bg-blue-500/10 text-blue-600',
                          order.status === 'Pending' && 'bg-slate-500/10 text-slate-600',
                        ].join(' ')}
                      >
                        {order.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
