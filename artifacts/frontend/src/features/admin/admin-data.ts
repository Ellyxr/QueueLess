// Placeholder data for the admin panel. None of this is wired to a real
// backend yet — see AddressMe.md in artifacts/api-server for what's missing.

export type AdminUserRole = "student" | "vendor" | "admin";

export interface AdminUserRow {
  id: string;
  fullName: string;
  email: string;
  roles: AdminUserRole[];
  isActive: boolean;
  isArchived: boolean;
  /** Whether this user has granted the admin permission to view/change their email & password. */
  dataAccessGranted: boolean;
  createdAt: string;
}

export type RefundStatus = "REQUESTED" | "APPROVED" | "PROCESSED" | "DENIED";

export interface RefundRequest {
  id: string;
  orderId: string;
  requesterName: string;
  requesterEmail: string;
  vendorName: string;
  amount: number;
  reason: string;
  status: RefundStatus;
  createdAt: string;
}

export interface AdminMetrics {
  totalStudents: number;
  totalVendors: number;
  totalAdmins: number;
  activeOrdersToday: number;
  completedOrdersToday: number;
  platformRevenueToday: number;
  pendingRefunds: number;
  newSignupsThisWeek: number;
}

export interface ActivityEvent {
  id: string;
  message: string;
  timestamp: string;
}

export const MOCK_METRICS: AdminMetrics = {
  totalStudents: 482,
  totalVendors: 37,
  totalAdmins: 2,
  activeOrdersToday: 26,
  completedOrdersToday: 118,
  platformRevenueToday: 14320,
  pendingRefunds: 3,
  newSignupsThisWeek: 21,
};

export const MOCK_ACTIVITY: ActivityEvent[] = [
  { id: "act-1", message: "North Loop Kitchen went active after approval", timestamp: "2026-09-17T08:12:00Z" },
  { id: "act-2", message: "Jamie dela Cruz requested a refund on order #a1b2c3d4", timestamp: "2026-09-17T07:48:00Z" },
  { id: "act-3", message: "42 orders completed in the last hour", timestamp: "2026-09-17T07:30:00Z" },
  { id: "act-4", message: "New vendor application submitted: Bites & Brew", timestamp: "2026-09-16T21:05:00Z" },
  { id: "act-5", message: "Student account suspended: repeated no-show pickups", timestamp: "2026-09-16T18:40:00Z" },
  { id: "act-6", message: "5 new students signed up", timestamp: "2026-09-16T14:00:00Z" },
];

export const MOCK_REFUNDS: RefundRequest[] = [
  {
    id: "refund-1",
    orderId: "a1b2c3d4-1111-2222-3333-444455556666",
    requesterName: "Jamie dela Cruz",
    requesterEmail: "jamie.delacruz@students.nu-laguna.edu.ph",
    vendorName: "North Loop Kitchen",
    amount: 185,
    reason: "Order arrived incomplete — missing a rice meal.",
    status: "REQUESTED",
    createdAt: "2026-09-17T07:48:00Z",
  },
  {
    id: "refund-2",
    orderId: "b2c3d4e5-2222-3333-4444-555566667777",
    requesterName: "Miguel Santos",
    requesterEmail: "miguel.santos@students.nu-laguna.edu.ph",
    vendorName: "Bites & Brew",
    amount: 90,
    reason: "Vendor cancelled after payment was already confirmed.",
    status: "REQUESTED",
    createdAt: "2026-09-16T19:20:00Z",
  },
  {
    id: "refund-3",
    orderId: "c3d4e5f6-3333-4444-5555-666677778888",
    requesterName: "Ella Ramirez",
    requesterEmail: "ella.ramirez@students.nu-laguna.edu.ph",
    vendorName: "Campus Brew Co.",
    amount: 60,
    reason: "Wrong item delivered.",
    status: "APPROVED",
    createdAt: "2026-09-15T10:05:00Z",
  },
  {
    id: "refund-4",
    orderId: "d4e5f6a7-4444-5555-6666-777788889999",
    requesterName: "Paolo Reyes",
    requesterEmail: "paolo.reyes@students.nu-laguna.edu.ph",
    vendorName: "North Loop Kitchen",
    amount: 220,
    reason: "Requested a refund after already picking up the order.",
    status: "DENIED",
    createdAt: "2026-09-14T13:30:00Z",
  },
];

export const MOCK_USERS: AdminUserRow[] = [
  {
    id: "user-1",
    fullName: "Jamie dela Cruz",
    email: "jamie.delacruz@students.nu-laguna.edu.ph",
    roles: ["student"],
    isActive: true,
    isArchived: false,
    dataAccessGranted: true,
    createdAt: "2026-01-14T00:00:00Z",
  },
  {
    id: "user-2",
    fullName: "Miguel Santos",
    email: "miguel.santos@students.nu-laguna.edu.ph",
    roles: ["student", "vendor"],
    isActive: true,
    isArchived: false,
    dataAccessGranted: false,
    createdAt: "2026-02-02T00:00:00Z",
  },
  {
    id: "user-3",
    fullName: "North Loop Kitchen",
    email: "owner@northloopkitchen.ph",
    roles: ["vendor"],
    isActive: true,
    isArchived: false,
    dataAccessGranted: false,
    createdAt: "2025-11-20T00:00:00Z",
  },
  {
    id: "user-4",
    fullName: "Ella Ramirez",
    email: "ella.ramirez@students.nu-laguna.edu.ph",
    roles: ["student"],
    isActive: false,
    isArchived: false,
    dataAccessGranted: true,
    createdAt: "2026-03-11T00:00:00Z",
  },
  {
    id: "user-5",
    fullName: "Bites & Brew",
    email: "hello@bitesandbrew.ph",
    roles: ["vendor"],
    isActive: true,
    isArchived: false,
    dataAccessGranted: false,
    createdAt: "2026-04-05T00:00:00Z",
  },
  {
    id: "user-6",
    fullName: "Paolo Reyes",
    email: "paolo.reyes@students.nu-laguna.edu.ph",
    roles: ["student"],
    isActive: true,
    isArchived: true,
    dataAccessGranted: false,
    createdAt: "2025-09-30T00:00:00Z",
  },
  {
    id: "user-7",
    fullName: "QueueLess Admin",
    email: "admin@queueless.com",
    roles: ["admin"],
    isActive: true,
    isArchived: false,
    dataAccessGranted: true,
    createdAt: "2025-08-01T00:00:00Z",
  },
];

export function createEmptyAdminUser(input: {
  fullName: string;
  email: string;
  role: AdminUserRole;
}): AdminUserRow {
  return {
    id: `user-${crypto.randomUUID()}`,
    fullName: input.fullName,
    email: input.email,
    roles: [input.role],
    isActive: true,
    isArchived: false,
    dataAccessGranted: false,
    createdAt: new Date().toISOString(),
  };
}
