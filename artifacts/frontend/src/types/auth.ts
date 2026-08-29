export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  fullName: string;
  email: string;
  phoneNumber: string;
  password: string;
  confirmPassword: string;
  role: 'student' | 'vendor';
  businessName?: string;
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  phoneNumber: string;
  role: 'student' | 'student_vendor' | 'vendor' | 'admin';
  businessName?: string;
}

export interface AuthResponse {
  token: string;
  user?: User;
  message?: string;
}