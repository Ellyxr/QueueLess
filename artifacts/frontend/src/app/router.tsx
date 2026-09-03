import { type ReactNode, useEffect } from 'react';
import { ErrorBoundary } from '@/components/error-boundary';
import { AppShell } from '@/components/app-shell';
import NotFound from '@/pages/not-found';
import LoginPage from '@/pages/login';
import MarketplacePage from '@/features/marketplace/marketplace';
import Profile from '@/features/profile/profile';
import Vendor from '@/features/vendor/vendor';
import { StoreRouter } from '@/features/store/store-router';
import { useLocation } from 'wouter';

import {
  Route,
  Router as WouterRouter,
  Switch,
} from 'wouter';

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function MarketplaceRoute() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) return;

    try {
      const user = JSON.parse(storedUser) as { role?: string };
      if (user.role === 'vendor') {
        setLocation('/vendor');
      }
    } catch {
      setLocation('/login');
    }
  }, [setLocation]);

  const storedUser = localStorage.getItem('user');
  if (storedUser) {
    try {
      if ((JSON.parse(storedUser) as { role?: string }).role === 'vendor') {
        return null;
      }
    } catch {
      return null;
    }
  }

  return <MarketplacePage username="Jamie" isLoggedIn />;
}

function StoreRoute() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) return;

    try {
      if ((JSON.parse(storedUser) as { role?: string }).role === 'vendor') {
        setLocation('/vendor');
      }
    } catch {
      setLocation('/login');
    }
  }, [setLocation]);

  const storedUser = localStorage.getItem('user');
  if (storedUser) {
    try {
      if ((JSON.parse(storedUser) as { role?: string }).role === 'vendor') {
        return null;
      }
    } catch {
      return null;
    }
  }

  return <StoreRouter />;
}

function VendorRoute() {
  return <Vendor username="Jamie" />;
}

export function AppRouter() {
  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <AppShell>
        <RoutedErrorBoundary>
          <Switch>
            <Route path="/" component={MarketplaceRoute} />
            <Route path="/login" component={LoginPage} />
            <Route path="/store/:storeName" component={StoreRoute} />
            <Route path="/profile" component={Profile} />
            <Route path="/vendor" component={VendorRoute} />
            <Route component={NotFound} />
          </Switch>
        </RoutedErrorBoundary>
      </AppShell>
    </WouterRouter>
  );
}