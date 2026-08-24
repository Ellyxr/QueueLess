import { type ReactNode } from 'react';
import { Circle } from 'lucide-react';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="foundation-noise relative min-h-[100dvh] overflow-hidden bg-background">
      <div className="foundation-grid pointer-events-none absolute inset-x-0 top-0 h-[620px] opacity-80" />
      <header className="relative z-10 mx-auto flex w-full max-w-[1440px] items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
        <div className="flex items-center gap-3" data-testid="brand-queueless">
          <span className="relative flex h-9 w-9 items-center justify-center rounded-[11px] bg-primary text-primary-foreground shadow-sm">
            <span className="absolute h-4 w-4 rounded-full border-[1.5px] border-current" />
            <span className="absolute h-1.5 w-1.5 rounded-full bg-current" />
          </span>
          <span className="font-mono text-[13px] font-medium tracking-[0.08em] text-foreground">
            QUEUELESS
          </span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground" data-testid="status-foundation">
          <Circle className="h-2 w-2 fill-current text-secondary-foreground" aria-hidden="true" />
          <span>Foundation / online</span>
        </div>
      </header>
      <div className="relative z-10">{children}</div>
      <footer className="relative z-10 mx-auto flex w-full max-w-[1440px] items-center justify-between px-5 pb-6 pt-10 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground sm:px-8 lg:px-12">
        <span data-testid="text-version">QueueLess / frontend foundation</span>
        <span data-testid="text-year">2025</span>
      </footer>
    </div>
  );
}