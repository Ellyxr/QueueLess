import { type ReactNode, useEffect } from 'react';
import { ErrorBoundary } from '@/components/error-boundary';
import { AppShell } from '@/components/app-shell';
import NotFound from '@/pages/not-found';
import LoginPage from '@/pages/login';
import MarketplacePage from '@/features/marketplace/marketplace';
import Profile from '@/features/profile/profile';
import Vendor from '@/features/vendor/vendor';
import VendorStorefrontPage from '@/features/vendor/vendor-storefront';
import VendorPromotionPage from '@/features/vendor/vendor-promotion';
import { StoreRouter } from '@/features/store/store-router';
import CartPage from '@/features/cart/cart';
import PaymentSuccessPage from '@/features/payments/payment-success';
import PaymentCancelPage from '@/features/payments/payment-cancel';
import AdminDashboardPage from '@/features/admin/admin-dashboard';
import AdminRefundsPage from '@/features/admin/admin-refunds';
import AdminUsersPage from '@/features/admin/admin-users';
import PasabuyPage from '@/features/pasabuy/pasabuy-page';
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

function getStoredUserName(fallback: string) {
  try {
    const storedUser = localStorage.getItem('user');
    const user = storedUser ? (JSON.parse(storedUser) as { fullName?: string }) : null;
    return user?.fullName || fallback;
  } catch {
    return fallback;
  }
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

  return <MarketplacePage username={getStoredUserName('Buyer')} isLoggedIn />;
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
  return <Vendor username={getStoredUserName('Vendor')} />;
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
            <Route path="/cart" component={CartPage} />
            <Route path="/payment/success" component={PaymentSuccessPage} />
            <Route path="/payment/cancel" component={PaymentCancelPage} />
            <Route path="/profile" component={Profile} />
            <Route path="/pasabuy/:id" component={PasabuyPage} />
            <Route path="/pasabuy" component={PasabuyPage} />
            <Route path="/vendor" component={VendorRoute} />
            <Route path="/vendor/storefront" component={VendorStorefrontPage} />
            <Route path="/vendor/promotion" component={VendorPromotionPage} />
            <Route path="/admin" component={AdminDashboardPage} />
            <Route path="/admin/refunds" component={AdminRefundsPage} />
            <Route path="/admin/users" component={AdminUsersPage} />
            <Route component={NotFound} />
          </Switch>
        </RoutedErrorBoundary>
      </AppShell>
    </WouterRouter>
  );
}