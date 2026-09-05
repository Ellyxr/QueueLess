import { LoginInput, RegisterInput, AuthResponse } from '../../types/auth';

const API_BASE_URL = '/api/v1';

export const AUTH_STATE_CHANGED_EVENT = 'queueless-auth-state-changed';
export const PORTAL_CHANGED_EVENT = 'queueless-portal-changed';

export type Portal = 'buyer' | 'vendor';

export function notifyAuthStateChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTH_STATE_CHANGED_EVENT));
  }
}

export interface VendorProduct {
  id: string;
  vendorId?: string;
  name: string;
  description: string | null;
  price: number;
  category: string | null;
  isAvailable: boolean;
}

export interface ProductInput {
  name: string;
  description?: string;
  price: number;
  category?: string;
  isAvailable?: boolean;
}

export interface VendorStorefront {
  id: string;
  name: string;
  description: string | null;
  campusLocation: string | null;
  vendorType: string;
  status: string;
  products?: VendorProduct[];
}

export interface VendorDashboard {
  todaySales: string;
  averageTicket: string;
  pendingOrders: number;
  recentOrders: Array<{
    id: string;
    customer: string;
    item: string;
    total: string;
    status: string;
    createdAt: string;
  }>;
}

export interface UpdateVendorInput {
  name?: string;
  description?: string;
  campusLocation?: string;
}

export async function loginUser(data: LoginInput): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || 'Invalid email or password.');
  }

  return response.json();
}

export async function registerUser(data: RegisterInput): Promise<AuthResponse> {
  const { fullName, email, password,role, businessName, phoneNumber } = data;

  const response = await fetch(`${API_BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName,
      email,
      password,
      role,
      businessName,
      phone: phoneNumber,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || 'Registration failed.');
  }

  return response.json();
}

// US-008: Logout Action & Clear Client Auth State
export function logoutUser(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    notifyAuthStateChanged();
    window.location.replace('/login');
  }
}

// US-006 & US-008: Authenticated fetch helper for handling 401 & 403 status responses
export async function fetchWithAuth<T = unknown>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  // US-008: Redirect when token is invalid or expired
  if (response.status === 401) {
    logoutUser();
    throw new Error('Unauthorized / Session expired. Redirecting to login.');
  }

  // US-006: Handle forbidden response
  if (response.status === 403) {
    throw new Error('Forbidden: You do not have permission to perform this action.');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || 'An error occurred.');
  }

  return response.json() as Promise<T>;
}

export function listVendors(): Promise<VendorStorefront[]> {
  return fetchWithAuth('/vendors');
}

export function getMyVendor(): Promise<VendorStorefront> {
  return fetchWithAuth('/vendors/mine');
}

export function getVendorStorefront(vendorId: string): Promise<VendorStorefront> {
  return fetchWithAuth(`/vendors/${vendorId}`);
}

export function createProduct(data: ProductInput): Promise<VendorProduct> {
  return fetchWithAuth('/products', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateProduct(
  productId: string,
  data: ProductInput,
): Promise<VendorProduct> {
  return fetchWithAuth(`/products/${productId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function deleteProduct(productId: string): Promise<{ message: string }> {
  return fetchWithAuth(`/products/${productId}`, { method: 'DELETE' });
}

export function getVendorDashboard(): Promise<VendorDashboard> {
  return fetchWithAuth('/orders/vendor/dashboard');
}

export function updateVendorStorefront(
  vendorId: string,
  data: UpdateVendorInput,
): Promise<VendorStorefront> {
  return fetchWithAuth(`/vendors/${vendorId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function setActivePortal(portal: Portal): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('active-portal', portal);
    window.dispatchEvent(new Event(PORTAL_CHANGED_EVENT));
  }
}