import { type ReactNode } from 'react';
import { ErrorBoundary } from '@/components/error-boundary';
import { AppShell } from '@/components/app-shell';
import NotFound from '@/pages/not-found';
import LoginPage from '@/pages/login';
import MarketplacePage from '@/features/marketplace/marketplace';
import Profile from '@/features/profile/profile';
import Vendor from '@/features/vendor/vendor';
import { StoreRouter } from '@/features/store/store-router';

import {
  Route,
  Router as WouterRouter,
  Switch,
  useLocation,
} from 'wouter';

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function MarketplaceRoute() {
  return <MarketplacePage username="Jamie" isLoggedIn />;
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
            <Route path="/store/:storeName" component={StoreRouter} />
            <Route path="/profile" component={Profile} />
            <Route path="/vendor" component={VendorRoute} />
            <Route component={NotFound} />
          </Switch>
        </RoutedErrorBoundary>
      </AppShell>
    </WouterRouter>
  );
}