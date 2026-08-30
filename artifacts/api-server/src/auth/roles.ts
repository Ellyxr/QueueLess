export type UserRole = 'BUYER' | 'VENDOR_OWNER' | 'ADMIN';

export type FrontendRole = 'student' | 'vendor' | 'admin';

export const FRONTEND_ROLE_MAP: Record<FrontendRole, UserRole> = {
  student: 'BUYER',
  vendor: 'VENDOR_OWNER',
  admin: 'ADMIN',
};
