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

export interface EligibleExtra {
  id: string;
  name: string;
  price: number;
  description: string | null;
  category?: string | null;
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
  imageUrl?: string | null;
  imageFileId?: string | null;
  eligibleExtras?: EligibleExtra[];
}

export interface ImagekitAuthResponse {
  token: string;
  expire: number;
  signature: string;
}

export function getImagekitAuth(): Promise<ImagekitAuthResponse> {
  return fetchWithAuth("/imagekit/auth");
}

export interface ImagekitUploadResult {
  url: string;
  fileId: string;
}

export async function uploadProductImage(file: File): Promise<ImagekitUploadResult> {
  const auth = await getImagekitAuth();

  const form = new FormData();
  form.append("file", file);
  form.append("fileName", file.name);
  form.append("publicKey", import.meta.env.VITE_IMAGEKIT_PUBLIC_KEY);
  form.append("signature", auth.signature);
  form.append("expire", String(auth.expire));
  form.append("token", auth.token);
  form.append("folder", "/products");

  const response = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || "Image upload failed.");
  }

  const result = await response.json();
  return { url: result.url, fileId: result.fileId };
}

export interface ProductInput {
  name: string;
  description?: string;
  price: number;
  category?: string;
  preparationTimeMinutes: number;
  isAvailable?: boolean;
  eligibleExtraIds?: string[];
  imageUrl?: string;
  imageFileId?: string;
}

export type Weekday = "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY";

export interface VendorPreorderDay {
  dayOfWeek: Weekday;
  isEnabled: boolean;
  openTime: string | null;
  closeTime: string | null;
}

export interface VendorAvailabilityDay {
  dayOfWeek: Weekday;
  isOpen: boolean;
  openTime: string | null;
  closeTime: string | null;
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
  preorderEnabled?: boolean;
  preorderSameAsStoreHours?: boolean;
  preorderAvailability?: VendorPreorderDay[];
  availabilityDays?: VendorAvailabilityDay[];
  /** Only present on the buyer-facing storefront response, not the vendor's own settings fetch. */
  isOpenNow?: boolean;
  nextAvailableLabel?: string | null;
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
  ledgerBalance: string;
  weekSales: Array<{ day: string; amount: string }>;
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
  allowParticipantOrderCompletion?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerOrder {
  id: string;
  status: string;
  total: string;
  createdAt: string;
  paidAt: string | null;
  buyerContactPingAt: string | null;
  vendor: { id: string; name: string };
  items: Array<{ productId: string; name: string; quantity: number }>;
  refund: OrderRefundSummary | null;
}

export interface UpdateProfileInput {
  fullName?: string;
  phone?: string;
  allowParticipantOrderCompletion?: boolean;
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

export interface PayoutResponse {
  id: string;
  amount: string;
  status: string;
}

export function payoutVendorBalance(idempotencyKey: string): Promise<PayoutResponse> {
  return fetchWithAuth("/vendors/mine/payout", {
    method: "POST",
    headers: {
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({}),
  });
}

export type RefundCategory =
  | "VENDOR_NOT_ACCEPTED"
  | "VENDOR_UNRESPONSIVE"
  | "WRONG_ITEM"
  | "MISSING_ITEM"
  | "QUALITY_ISSUE"
  | "INCORRECTLY_COMPLETED"
  | "DISAGREEMENT"
  | "OUTSIDE_WINDOW"
  | "OTHER";

export interface OrderRefundSummary {
  status: "REQUESTED" | "APPROVED" | "PROCESSED" | "DENIED";
  category: string | null;
}

export interface RequestRefundInput {
  category: RefundCategory;
  description?: string;
  orderItemId?: string;
}

export interface RequestRefundResponse {
  outcome: "AUTO_REFUNDED" | "PENDING_REVIEW";
  refund?: { id: string; amount: string; status: string; category: string | null };
  refunds?: Array<{ id: string; amount: string; status: string; category: string | null }>;
}

export function contactVendor(orderId: string): Promise<{ message: string }> {
  return fetchWithAuth(`/orders/${orderId}/contact-vendor`, {
    method: "POST",
  });
}

export function requestOrderRefund(
  orderId: string,
  data: RequestRefundInput,
): Promise<RequestRefundResponse> {
  return fetchWithAuth(`/orders/${orderId}/refund-request`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export interface AdminRefundRow {
  id: string;
  orderId: string | null;
  requesterName: string;
  requesterEmail: string | null;
  vendorName: string | null;
  orderedAt: string | null;
  isGroupOrder: boolean;
  amount: number;
  currency: string;
  reason: string;
  category: string | null;
  initiatedBy: "BUYER" | "SYSTEM";
  status: "REQUESTED" | "APPROVED" | "PROCESSED" | "DENIED";
  createdAt: string;
  processedAt: string | null;
  providerRefundId: string | null;
}

export function listAdminRefunds(status?: string): Promise<AdminRefundRow[]> {
  const query = status && status !== "ALL" ? `?status=${status}` : "";
  return fetchWithAuth(`/refunds${query}`);
}

export type AdminUserRole = "student" | "vendor" | "admin";

export interface AdminUserRow {
  id: string;
  fullName: string;
  email: string | null;
  roles: AdminUserRole[];
  isActive: boolean;
  isArchived: boolean;
  /** Whether this user has granted the admin permission to view/change their email & password. */
  dataAccessGranted: boolean;
  createdAt: string;
}

export function listAdminUsers(search?: string, role?: AdminUserRole): Promise<AdminUserRow[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (role) params.set("role", role);
  const query = params.toString();
  return fetchWithAuth(`/admin/users${query ? `?${query}` : ""}`);
}

export function createAdminUser(data: {
  fullName: string;
  email: string;
  password: string;
  role: AdminUserRole;
}): Promise<AdminUserRow> {
  return fetchWithAuth(`/admin/users`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateAdminUserRoles(
  userId: string,
  roles: AdminUserRole[],
): Promise<AdminUserRow> {
  return fetchWithAuth(`/admin/users/${userId}/roles`, {
    method: "PATCH",
    body: JSON.stringify({ roles }),
  });
}

export function updateAdminUserStatus(
  userId: string,
  data: { isActive?: boolean; isArchived?: boolean },
): Promise<AdminUserRow> {
  return fetchWithAuth(`/admin/users/${userId}/status`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function updateAdminUserEmail(userId: string, email: string): Promise<AdminUserRow> {
  return fetchWithAuth(`/admin/users/${userId}/email`, {
    method: "PATCH",
    body: JSON.stringify({ email }),
  });
}

export function updateAdminUserPassword(
  userId: string,
  password: string,
): Promise<{ message: string }> {
  return fetchWithAuth(`/admin/users/${userId}/password`, {
    method: "PATCH",
    body: JSON.stringify({ password }),
  });
}

export function updateAdminRefundStatus(
  refundId: string,
  status: "APPROVED" | "DENIED" | "PROCESSED",
): Promise<AdminRefundRow> {
  return fetchWithAuth(`/refunds/${refundId}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
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

export interface UpdateVendorPreorderAvailabilityInput {
  preorderEnabled: boolean;
  sameAsStoreHours: boolean;
  days?: VendorPreorderDay[];
}

export function updateVendorPreorderAvailability(
  vendorId: string,
  data: UpdateVendorPreorderAvailabilityInput,
): Promise<{
  id: string;
  preorderEnabled: boolean;
  preorderSameAsStoreHours: boolean;
  preorderAvailability: VendorPreorderDay[];
}> {
  return fetchWithAuth(`/vendors/${vendorId}/preorder-availability`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export interface UpdateVendorAvailabilityInput {
  days: VendorAvailabilityDay[];
}

export function updateVendorAvailability(
  vendorId: string,
  data: UpdateVendorAvailabilityInput,
): Promise<{ id: string; availability: VendorAvailabilityDay[] }> {
  return fetchWithAuth(`/vendors/${vendorId}/availability`, {
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
  orderType: "INDIVIDUAL" | "GROUP";
  status: string;
  isPasabuyRequest: boolean;
  cancellationReason: CancellationReason | null;
  cancellationNote: string | null;
  estimatedReadyAt: string | null;
  estimatedWaitMinutes: number | null;
  updatedAt: string;
  paidAt: string | null;
  buyerContactPingAt: string | null;
  refund: OrderRefundSummary | null;
  myPaymentShare: { id: string; amountDue: string; status: "PENDING" | "PAID" } | null;
  vendor: { id: string; name: string; campusLocation: string | null };
  items: Array<{ id: string; name: string; quantity: number }>;
  history: Array<{ status: string; note: string | null; changedAt: string }>;
  viewerRole: "OWNER" | "MEMBER" | null;
  canComplete: boolean;
  groupOrder: { id: string; code: string; participantCount: number } | null;
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

export interface OrderPaymentStatusResponse {
  orderId: string;
  orderType: "INDIVIDUAL" | "GROUP";
  orderStatus: string;
  totalAmount: string;
  paymentShare: {
    id: string;
    amountDue: string;
    status: "PENDING" | "PAID";
  };
  payment: {
    id: string;
    amount: string;
    currency: string;
    provider: string;
    status: "PENDING" | "SUCCEEDED" | "FAILED";
    createdAt: string;
    updatedAt: string;
  } | null;
}

export function getOrderPaymentStatus(orderId: string): Promise<OrderPaymentStatusResponse> {
  return fetchWithAuth(`/payments/orders/${orderId}/status`);
}

export interface CreatePaymentCheckoutResponse {
  paymentId: string;
  paymentShareId: string;
  orderId: string;
  amount: string;
  currency: string;
  status: string;
  provider: string;
  checkoutSessionId: string;
  checkoutUrl: string;
}

export function createPaymentCheckout(paymentShareId: string): Promise<CreatePaymentCheckoutResponse> {
  return fetchWithAuth("/payments/checkout", {
    method: "POST",
    headers: {
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({ paymentShareId }),
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

// Group Orders

export interface GroupOrderVendor {
  id: string;
  name: string;
  status: string;
  vendorType: string;
  campusLocation: string | null;
}

export interface GroupOrderParticipantItem {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  unitPrice: string;
  subtotal: string;
}

export interface GroupOrderParticipant {
  participantId: string;
  user: { id: string; fullName: string; email: string };
  status: "INVITED" | "JOINED" | "LEFT";
  joinedAt: string | null;
  isOwner: boolean;
  items: GroupOrderParticipantItem[];
  subtotal: string;
}

export interface GroupOrderPaymentShare {
  id: string;
  payer: { id: string; fullName: string; email: string };
  amountDue: string;
  status: "PENDING" | "PAID";
}

export interface GroupOrderResponse {
  id: string;
  code: string;
  status: "OPEN" | "LOCKED" | "FINALIZED" | "CANCELLED";
  initiator: { id: string; fullName: string; email: string };
  vendor: GroupOrderVendor | null;
  participants: GroupOrderParticipant[];
  participantCount: number;
  authoritativeOrder: {
    id: string;
    status: string;
    orderType: string;
    totalAmount: string;
    paymentSplitMode: "ITEM_BASED" | "EQUAL" | "CUSTOM" | null;
    paymentShares: GroupOrderPaymentShare[];
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface AddGroupOrderItemResponse {
  groupOrderId: string;
  vendorId: string;
  participantId: string;
  cartId: string;
  status: string;
  items: GroupOrderParticipantItem[];
  total: string;
}

export interface FinalizeGroupOrderResponse {
  groupOrderId: string;
  groupOrderStatus: string;
  authoritativeOrder: {
    id: string;
    orderType: string;
    status: string;
    vendor: { id: string; name: string };
    subtotal: string;
    marketplaceFee: string;
    totalAmount: string;
    estimatedReadyAt: string | null;
    items: Array<{
      id: string;
      productId: string;
      name: string;
      quantity: number;
      unitPrice: string;
      subtotal: string;
      participant: { participantId: string; user: { id: string; fullName: string; email: string } } | null;
    }>;
  };
}

export interface SetPaymentSplitInput {
  mode: "ITEM_BASED" | "EQUAL" | "CUSTOM";
  customShares?: Array<{ participantId: string; amount: number }>;
}

export interface SetPaymentSplitResponse {
  groupOrderId: string;
  orderId: string;
  paymentSplitMode: string;
  orderTotal: string;
  paymentShares: GroupOrderPaymentShare[];
  totalAllocated: string;
}

export function createGroupOrder(vendorId?: string): Promise<GroupOrderResponse> {
  return fetchWithAuth("/group-orders", {
    method: "POST",
    body: JSON.stringify(vendorId ? { vendorId } : {}),
  });
}

export function joinGroupOrderByCode(code: string): Promise<GroupOrderResponse> {
  return fetchWithAuth("/group-orders/join-by-code", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export function getGroupOrder(groupOrderId: string): Promise<GroupOrderResponse> {
  return fetchWithAuth(`/group-orders/${groupOrderId}`);
}

export function lockGroupOrder(groupOrderId: string): Promise<GroupOrderResponse> {
  return fetchWithAuth(`/group-orders/${groupOrderId}/lock`, { method: "PATCH" });
}

export function addGroupOrderItem(
  groupOrderId: string,
  data: { productId: string; quantity: number },
): Promise<AddGroupOrderItemResponse> {
  return fetchWithAuth(`/group-orders/${groupOrderId}/items`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function removeGroupOrderItem(
  groupOrderId: string,
  itemId: string,
): Promise<AddGroupOrderItemResponse> {
  return fetchWithAuth(`/group-orders/${groupOrderId}/items/${itemId}`, {
    method: "DELETE",
  });
}

export function finalizeGroupOrder(
  groupOrderId: string,
): Promise<FinalizeGroupOrderResponse> {
  return fetchWithAuth(`/group-orders/${groupOrderId}/finalize`, { method: "POST" });
}

export function setGroupOrderPaymentSplit(
  groupOrderId: string,
  data: SetPaymentSplitInput,
): Promise<SetPaymentSplitResponse> {
  return fetchWithAuth(`/group-orders/${groupOrderId}/payment-split`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function pingGroupOrder(groupOrderId: string): Promise<{ message: string }> {
  return fetchWithAuth(`/group-orders/${groupOrderId}/ping`, { method: "POST" });
}

export function cancelGroupOrder(groupOrderId: string): Promise<GroupOrderResponse> {
  return fetchWithAuth(`/group-orders/${groupOrderId}`, { method: "DELETE" });
}

// Notifications

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  isRead: boolean;
  createdAt: string;
}

export function listNotifications(): Promise<NotificationItem[]> {
  return fetchWithAuth("/notifications");
}

export function getUnreadNotificationCount(): Promise<{ unreadCount: number }> {
  return fetchWithAuth("/notifications/unread-count");
}

export function markNotificationRead(id: string): Promise<{ message: string }> {
  return fetchWithAuth(`/notifications/${id}/read`, { method: "PATCH" });
}

export function setActivePortal(portal: Portal): void {
  if (typeof window !== "undefined") {
    localStorage.setItem("active-portal", portal);
    window.dispatchEvent(new Event(PORTAL_CHANGED_EVENT));
  }
}
