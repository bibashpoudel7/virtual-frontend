// Admin API for embed keys (who may show a tour on other websites)

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5555/api/';

export interface EmbedToken {
  id: string;
  tour_id: string;
  token: string;
  name: string;
  allowed_domains: string; // comma-separated, empty = any site
  revoked_at?: string | null;
  last_used_at?: string | null;
  created_at: string;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const base = API_BASE_URL.endsWith('/') ? API_BASE_URL : `${API_BASE_URL}/`;
  const token = localStorage.getItem('accessToken') || localStorage.getItem('auth_token');
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options?.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data as T;
}

export const embedService = {
  list: (tourId: string) => request<EmbedToken[]>(`tours/${tourId}/embed-tokens`),
  create: (tourId: string, body: { name: string; allowed_domains: string[] }) =>
    request<EmbedToken>(`tours/${tourId}/embed-tokens`, { method: 'POST', body: JSON.stringify(body) }),
  revoke: (tourId: string, tokenId: string) =>
    request<{ message: string }>(`tours/${tourId}/embed-tokens/${tokenId}`, { method: 'DELETE' }),
};
