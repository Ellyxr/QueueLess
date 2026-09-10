import { type ReactNode, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function AppProviders({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState(() =>
    typeof window !== 'undefined' && localStorage.getItem('theme') === 'dark'
      ? 'dark'
      : 'light',
  );

  useEffect(() => {
    const applyTheme = () => {
      const nextTheme = localStorage.getItem('theme') === 'dark' ? 'dark' : 'light';
      setTheme(nextTheme);
      document.documentElement.classList.toggle('dark', nextTheme === 'dark');
    };

    applyTheme();
    window.addEventListener('storage', applyTheme);
    window.addEventListener('queueless-theme-changed', applyTheme);
    return () => {
      window.removeEventListener('storage', applyTheme);
      window.removeEventListener('queueless-theme-changed', applyTheme);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient} key={theme}>
      <TooltipProvider>
        {children}
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}