// The signed-in user as stored by AuthContext (localStorage 'user_data')

export type UserRole = 'admin' | 'user';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  email_verified_at?: string;
}

export function apiBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5555/api/';
  return base.endsWith('/') ? base : `${base}/`;
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('user_data');
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function isAdminUser(user: AuthUser | null = getStoredUser()): boolean {
  return user?.role === 'admin';
}
