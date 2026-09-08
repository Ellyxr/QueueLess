import { useEffect } from 'react';
import { User } from '@/types/auth';

export function useRequireAuth(allowedRoles?: Array<User['role']>) {
  useEffect(() => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');

    // US-008: Redirect to /login if client auth state is missing
    if (!token || !userStr) {
      window.location.href = '/login';
      return;
    }

    // US-006: Redirect if user role is not authorized for this page
    if (allowedRoles && allowedRoles.length > 0) {
      try {
        const user: User = JSON.parse(userStr);
        if (!allowedRoles.includes(user.role)) {
          window.location.href = '/login';
        }
      } catch {
        window.location.href = '/login';
      }
    }
  }, [allowedRoles]);
}