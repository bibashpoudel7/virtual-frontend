// Account API: sign-up, email verification (OTP), login and password reset
import { AuthUser, apiBaseUrl } from '@/lib/auth-user';

export interface AuthResult {
  token: string;
  user: AuthUser;
}

export class AuthApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function post<T>(path: string, body: Record<string, string>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}auth/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AuthApiError('Cannot reach the server. Check your connection and try again.', 0);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data.error === 'string' ? data.error : 'Something went wrong. Please try again.';
    throw new AuthApiError(message.charAt(0).toUpperCase() + message.slice(1), response.status, data.code);
  }
  return data as T;
}

export const authService = {
  register: (name: string, email: string, password: string) =>
    post<{ status: string; email: string }>('register', { name, email, password }),
  verifyEmail: (email: string, code: string) => post<AuthResult>('verify-email', { email, code }),
  resendCode: (email: string, purpose: 'verify_email' | 'reset_password') =>
    post<{ status: string }>('resend-code', { email, purpose }),
  login: (email: string, password: string) => post<AuthResult>('login', { email, password }),
  forgotPassword: (email: string) => post<{ status: string }>('forgot-password', { email }),
  resetPassword: (email: string, code: string, password: string) =>
    post<AuthResult>('reset-password', { email, code, password }),
};
