import { LoginInput, RegisterInput, AuthResponse } from "../../types/auth";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api/v1";

export const AUTH_STATE_CHANGED_EVENT = "queueless-auth-state-changed";
export const PORTAL_CHANGED_EVENT = "queueless-portal-changed";

export type Portal = "buyer" | "vendor";

export function notifyAuthStateChanged(): void {
  if (typeof window !== "undefined") {
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
  preparationTimeMinutes: number;
  isAvailable: boolean;
}

export interface ProductInput {
  name: string;
  description?: string;
  price: number;
  category?: string;
  preparationTimeMinutes: number;
  isAvailable?: boolean;
}

export interface VendorStorefront {
  id: string;
  name: string;
  description: string | null;
  campusLocation: string | null;
  categoryOrder?: string[];
  vendorType: string;
  status: string;
  products?: VendorProduct[];
  favoritesCount?: number;
  isFavoritedByMe?: boolean;
}

export interface VendorSummary {
  id: string;
  name: string;
  description: string | null;
  campusLocation: string | null;
  vendorType: string;
  status: string;
}

export interface VendorFavoriteStatus {
  vendorId: string;
  favoritesCount: number;
  isFavoritedByMe: boolean;
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
  categoryOrder?: string[];
}

// US-017 Types for Vendor Incoming Order Queue
export interface VendorOrderItem {
  productId?: string;
  productName?: string;
  quantity: number;
  price?: number;
}

export interface VendorQueueOrder {
  id: string;
  totalAmount: number;
  customerName?: string;
  customerEmail?: string;
  userId?: string;
  paymentStatus?: string;
  isPasabuyRequest?: boolean;
  status: string;
  items?: VendorOrderItem[];
}

export type CancellationReason =
  | 'NOT_AVAILABLE'
  | 'CUSTOMER_REQUEST'
  | 'CLOSING_EARLY'
  | 'OTHER';

// US-017: Create/Submit Order from Cart
export interface CreateOrderInput {
  cartId: string;
  isPasabuyRequest?: boolean;
}

export interface ProfileData {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerOrder {
  id: string;
  status: string;
  total: string;
  createdAt: string;
  vendor: { id: string; name: string };
  items: Array<{ productId: string; name: string; quantity: number }>;
}

export interface UpdateProfileInput {
  fullName?: string;
  phone?: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export async function loginUser(data: LoginInput): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || "Invalid email or password.");
  }

  return response.json();
}

export async function registerUser(data: RegisterInput): Promise<AuthResponse> {
  const { fullName, email, password, role, businessName, phoneNumber } = data;

  const response = await fetch(`${API_BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
    throw new Error(errorData.message || "Registration failed.");
  }

  return response.json();
}

// US-008: Logout Action & Clear Client Auth State
export function logoutUser(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    notifyAuthStateChanged();
    window.location.replace("/login");
  }
}

// US-006 & US-008: Authenticated fetch helper for handling 401 & 403 status responses
export async function fetchWithAuth<T = unknown>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const headers: HeadersInit = {
    "Content-Type": "application/json",
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
    throw new Error("Unauthorized / Session expired. Redirecting to login.");
  }

  // US-006: Handle forbidden response
  if (response.status === 403) {
    throw new Error(
      "Forbidden: You do not have permission to perform this action.",
    );
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || "An error occurred.");
  }

  return response.json() as Promise<T>;
}

export function listVendors(): Promise<VendorStorefront[]> {
  return fetchWithAuth("/vendors");
}

export function getMyProfile(): Promise<ProfileData> {
  return fetchWithAuth("/users/me");
}

export function updateMyProfile(
  data: UpdateProfileInput,
): Promise<ProfileData> {
  return fetchWithAuth("/users/me", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function changeMyPassword(
  data: ChangePasswordInput,
): Promise<{ message: string }> {
  return fetchWithAuth("/users/me/password", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function getMyOrders(): Promise<CustomerOrder[]> {
  return fetchWithAuth("/orders/mine");
}

export function getMyVendor(): Promise<VendorStorefront> {
  return fetchWithAuth("/vendors/mine");
}

export function getVendorStorefront(
  vendorId: string,
): Promise<VendorStorefront> {
  return fetchWithAuth(`/vendors/${vendorId}`);
}

export function createProduct(data: ProductInput): Promise<VendorProduct> {
  return fetchWithAuth("/products", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateProduct(
  productId: string,
  data: ProductInput,
): Promise<VendorProduct> {
  return fetchWithAuth(`/products/${productId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteProduct(productId: string): Promise<{ message: string }> {
  return fetchWithAuth(`/products/${productId}`, { method: "DELETE" });
}

export function getVendorDashboard(): Promise<VendorDashboard> {
  return fetchWithAuth("/orders/vendor/dashboard");
}

export function updateVendorStorefront(
  vendorId: string,
  data: UpdateVendorInput,
): Promise<VendorStorefront> {
  return fetchWithAuth(`/vendors/${vendorId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function favoriteVendor(vendorId: string): Promise<VendorFavoriteStatus> {
  return fetchWithAuth(`/vendors/${vendorId}/favorite`, { method: "POST" });
}

export function unfavoriteVendor(vendorId: string): Promise<VendorFavoriteStatus> {
  return fetchWithAuth(`/vendors/${vendorId}/favorite`, { method: "DELETE" });
}

export function getMyFavoriteVendors(): Promise<VendorSummary[]> {
  return fetchWithAuth("/vendors/favorites/mine");
}

// US-017: Get Vendor Incoming Order Queue
export function getVendorOrderQueue(): Promise<VendorQueueOrder[]> {
  return fetchWithAuth("/orders/vendor/queue");
}

export interface OrderStatusResponse {
  orderId: string;
  status: string;
  isPasabuyRequest: boolean;
  cancellationReason: CancellationReason | null;
  cancellationNote: string | null;
  estimatedReadyAt: string | null;
  estimatedWaitMinutes: number | null;
  updatedAt: string;
  vendor: { id: string; name: string; campusLocation: string | null };
  items: Array<{ id: string; name: string; quantity: number }>;
  history: Array<{ status: string; note: string | null; changedAt: string }>;
}

export function getOrderStatus(orderId: string): Promise<OrderStatusResponse> {
  return fetchWithAuth(`/orders/${orderId}/status`);
}

export function confirmOrderPickup(orderId: string): Promise<any> {
  return fetchWithAuth(`/orders/${orderId}/pickup`, { method: "PATCH" });
}

export function createOrder(data: CreateOrderInput): Promise<any> {
  return fetchWithAuth("/orders", {
    method: "POST",
    headers: {
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify(data),
  });
}

// US-018: Update Vendor Order Status
export function updateOrderStatus(
  orderId: string,
  status: string,
  extra?: { note?: string; cancellationReason?: CancellationReason; cancellationNote?: string },
): Promise<any> {
  return fetchWithAuth(`/orders/vendor/${orderId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status, ...extra }),
  });
}

export function setActivePortal(portal: Portal): void {
  if (typeof window !== "undefined") {
    localStorage.setItem("active-portal", portal);
    window.dispatchEvent(new Event(PORTAL_CHANGED_EVENT));
  }
}
