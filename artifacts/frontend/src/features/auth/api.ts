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
  const { fullName, email, password, phoneNumber} = data;

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