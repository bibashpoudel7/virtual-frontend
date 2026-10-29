'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import axios from 'axios';
import { setGlobalLogoutFunction } from '../utils/axios-config';
import { setTourServiceLogoutFunction } from '../services/tourService';
import { AuthUser, apiBaseUrl } from '@/lib/auth-user';

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  setAuth: (token: string, user: AuthUser) => void;
  logout: () => void;
  checkPaymentRequired: () => Promise<boolean>;
  getAuthHeaders: () => { Authorization: string };
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

const PUBLIC_PATHS = ['/', '/showcase', '/tours', '/embed', '/login', '/contact', '/privacy', '/terms'];

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const logout = React.useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('accessToken');
    localStorage.removeItem('user_data');

    // Clear user-specific caches
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('userType_') || key.includes('_cache') || key.includes('tour_')) {
        localStorage.removeItem(key);
      }
    });

    delete axios.defaults.headers.common['Authorization'];

    if (typeof window !== 'undefined') {
      const currentPath = window.location.pathname;
      const isPublicPath = PUBLIC_PATHS.some(path =>
        currentPath === path || (path !== '/' && currentPath.startsWith(path))
      );
      if (!isPublicPath) {
        window.location.href = '/login';
      }
    }
  }, []);

  useEffect(() => {
    setGlobalLogoutFunction(logout);
    setTourServiceLogoutFunction(logout);

    // Skip auth session check when rendered inside a public embed iframe (/embed/... or ?embed=1)
    if (typeof window !== 'undefined') {
      const isEmbedRoute =
        window.location.pathname.startsWith('/embed') ||
        new URLSearchParams(window.location.search).get('embed') === '1';
      if (isEmbedRoute) {
        setIsLoading(false);
        return;
      }
    }

    const storedToken = localStorage.getItem('accessToken') || localStorage.getItem('auth_token');
    if (!storedToken) {
      setIsLoading(false);
      return;
    }

    // Show the cached user immediately, then confirm the session with the API
    try {
      const cached = localStorage.getItem('user_data');
      if (cached) {
        setUser(JSON.parse(cached));
        setToken(storedToken);
      }
    } catch {
      // ignore a corrupt cache; /auth/me below decides
    }

    let cancelled = false;
    fetch(`${apiBaseUrl()}auth/me`, { headers: { Authorization: `Bearer ${storedToken}` } })
      .then(async (response) => {
        if (cancelled) return;
        if (response.status === 401) {
          logout();
          return;
        }
        if (!response.ok) return; // API down: keep the cached session
        const data = await response.json();
        setUser(data.user);
        setToken(storedToken);
        localStorage.setItem('user_data', JSON.stringify(data.user));
        axios.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
      })
      .catch(() => {
        // Network error: keep the cached session
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [logout]);

  const setAuth = (authToken: string, userData: AuthUser) => {
    setToken(authToken);
    setUser(userData);
    // Stored under both keys for older code that reads either
    localStorage.setItem('accessToken', authToken);
    localStorage.setItem('auth_token', authToken);
    localStorage.setItem('user_data', JSON.stringify(userData));
    axios.defaults.headers.common['Authorization'] = `Bearer ${authToken}`;
  };

  const getAuthHeaders = (): { Authorization: string } => {
    return { Authorization: token ? `Bearer ${token}` : '' };
  };

  const checkPaymentRequired = async (): Promise<boolean> => {
    if (!user) return true;
    try {
      const response = await axios.get(`${apiBaseUrl()}payment/check-limit`, {
        headers: getAuthHeaders()
      });
      return response.data.paymentRequired;
    } catch (error) {
      console.error('Payment check failed:', error);
      return true;
    }
  };

  const value = {
    user,
    token,
    isAuthenticated: !!token && !!user,
    isAdmin: user?.role === 'admin',
    isLoading,
    setAuth,
    logout,
    checkPaymentRequired,
    getAuthHeaders,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
