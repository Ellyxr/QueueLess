import { LoginInput, RegisterInput, AuthResponse } from '../../types/auth';

const API_BASE_URL = '/api/v1';

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
  const { fullName, email, password, phoneNumber } = data;

  const response = await fetch(`${API_BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName,
      email,
      password,
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
    window.location.replace('/login');
  }
}

// US-006 & US-008: Authenticated fetch helper for handling 401 & 403 status responses
export async function fetchWithAuth(endpoint: string, options: RequestInit = {}): Promise<any> {
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

  return response.json();
}