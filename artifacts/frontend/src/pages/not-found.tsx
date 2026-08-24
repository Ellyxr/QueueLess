import { Card, CardContent } from '@/components/ui/card';
import { CircleAlert } from 'lucide-react';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70dvh] w-full max-w-[1440px] items-center justify-center px-5 py-16 sm:px-8 lg:px-12">
      <Card className="w-full max-w-md rounded-[20px] border-card-border/80 bg-card shadow-md">
        <CardContent className="p-7 sm:p-9">
          <div className="mb-6 flex items-start gap-4">
            <CircleAlert className="mt-0.5 h-5 w-5 text-primary" aria-hidden="true" />
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Route boundary</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-card-foreground" data-testid="heading-not-found">
                Nothing here yet
              </h1>
            </div>
          </div>
          <p className="text-sm leading-6 text-muted-foreground" data-testid="text-not-found">
            This address is outside the current foundation route.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
