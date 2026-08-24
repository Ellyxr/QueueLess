import { Blocks, Check, CircleDashed } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const foundationItems = [
  { label: 'Design tokens', detail: 'Loaded', icon: Check },
  { label: 'UI primitives', detail: 'Loaded', icon: Blocks },
  { label: 'Route boundary', detail: 'Ready', icon: CircleDashed },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-[1440px] flex-col px-5 pb-10 pt-16 sm:px-8 sm:pt-24 lg:px-12 lg:pt-28">
      <section className="grid items-end gap-10 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-20">
        <div className="foundation-in max-w-3xl">
          <p className="mb-7 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground" data-testid="text-eyebrow">
            Campus coordination / build 01
          </p>
          <h1 className="max-w-3xl text-[clamp(3.25rem,9vw,8.5rem)] font-extrabold leading-[0.9] tracking-[-0.08em] text-foreground" data-testid="heading-queueless">
            QueueLess
          </h1>
          <p className="mt-8 max-w-xl text-lg leading-8 text-muted-foreground sm:text-xl" data-testid="text-placeholder">
            The product surface is taking shape. This quiet route is the starting point for a clearer way to coordinate campus life.
          </p>
        </div>

        <Card className="foundation-in-delay overflow-hidden rounded-[20px] border-card-border/80 bg-card/80 shadow-md backdrop-blur-sm">
          <CardContent className="p-0">
            <div className="border-b border-card-border/80 px-6 py-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Current surface</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-card-foreground" data-testid="status-surface">
                Foundation only
              </p>
            </div>
            <div className="space-y-1 px-3 py-3">
              {foundationItems.map(({ label, detail, icon: Icon }) => (
                <div className="flex items-center justify-between rounded-xl px-3 py-3" key={label} data-testid={`row-foundation-${label.toLowerCase().replaceAll(' ', '-')}`}>
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                    <span className="text-sm font-medium text-card-foreground">{label}</span>
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{detail}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mt-28 border-t border-border/80 pt-6 sm:mt-40" data-testid="section-note">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">A considered beginning</p>
          <p className="max-w-md text-sm leading-6 text-muted-foreground">
            Shared providers, routing, tokens, and primitives are ready for the next layer. No product workflows are enabled here yet.
          </p>
        </div>
      </section>
    </main>
  );
}