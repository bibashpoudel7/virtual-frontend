'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import axios from 'axios';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  propertyId?: number;
  stripeCustomerId?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setAuth: (token: string, user: User) => void;
  logout: () => void;
  checkPaymentRequired: () => Promise<boolean>;
  getAuthHeaders: () => { Authorization: string } | {};
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
  mainBackendUrl?: string;
  microserviceUrl?: string;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ 
  children, 
  mainBackendUrl = process.env.NEXT_PUBLIC_MAIN_BACKEND_URL || 'http://localhost:3000',
  microserviceUrl = process.env.NEXT_PUBLIC_MICROSERVICE_URL || 'http://localhost:8080'
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for token in localStorage or from parent app
    // NestJS typically stores as 'accessToken'
    const storedToken = localStorage.getItem('accessToken') || localStorage.getItem('auth_token');
    const parentToken = window.parent !== window ? checkParentToken() : null;
    
    const authToken = parentToken || storedToken;
    
    if (authToken) {
      validateAndSetToken(authToken);
    } else {
      setIsLoading(false);
    }

    // Listen for messages from parent (main app)
    window.addEventListener('message', handleParentMessage);
    
    return () => {
      window.removeEventListener('message', handleParentMessage);
    };
  }, []);

  const checkParentToken = (): string | null => {
    // Check if running inside iframe/microfrontend
    try {
      // Request token from parent
      window.parent.postMessage({ type: 'REQUEST_AUTH_TOKEN' }, '*');
      
      // This would typically be handled asynchronously
      // For now, check sessionStorage set by parent
      return sessionStorage.getItem('parent_auth_token');
    } catch (error) {
      console.error('Error checking parent token:', error);
      return null;
    }
  };

  const handleParentMessage = (event: MessageEvent) => {
    // Validate origin
    const allowedOrigins = [mainBackendUrl, 'http://localhost:3001'];
    if (!allowedOrigins.includes(event.origin)) return;

    if (event.data.type === 'AUTH_TOKEN') {
      validateAndSetToken(event.data.token);
    } else if (event.data.type === 'LOGOUT') {
      logout();
    } else if (event.data.type === 'USER_UPDATE') {
      setUser(event.data.user);
    }
  };

  const validateAndSetToken = async (authToken: string) => {
    try {
      const storedUserData = localStorage.getItem('user_data');
      if (storedUserData) {
        try {
          const userData = JSON.parse(storedUserData);
          setToken(authToken);
          setUser(userData);
          axios.defaults.headers.common['Authorization'] = `Bearer ${authToken}`;
          setIsLoading(false);
          return;
        } catch (error) {
          console.error('Error parsing stored user data:', error);
        }
      }

      // Validate token with Go microservice backend
      const response = await axios.post(`${microserviceUrl}/api/auth/validate`, {}, {
        headers: { 
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.data.valid && response.data.user) {
        setToken(authToken);
        setUser(response.data.user);
        localStorage.setItem('auth_token', authToken);
        localStorage.setItem('user_data', JSON.stringify(response.data.user));
        
        // Set default axios header
        axios.defaults.headers.common['Authorization'] = `Bearer ${authToken}`;
      } else {
        // Token is invalid
        logout();
      }
    } catch (error: any) {
      console.error('Token validation failed:', error);
      
      if (error.code === 'ECONNREFUSED' || error.message?.includes('ECONNREFUSED')) {
        const storedUserData = localStorage.getItem('user_data');
        if (storedUserData && authToken) {
          try {
            const userData = JSON.parse(storedUserData);
            setToken(authToken);
            setUser(userData);
            axios.defaults.headers.common['Authorization'] = `Bearer ${authToken}`;
            setIsLoading(false);
            return;
          } catch (parseError) {
            console.error('Error parsing stored user data:', parseError);
          }
        }
      }
      
      logout();
    } finally {
      setIsLoading(false);
    }
  };

  const setAuth = (authToken: string, userData: User) => {
    setToken(authToken);
    setUser(userData);
    // Store as both for compatibility
    localStorage.setItem('accessToken', authToken);
    localStorage.setItem('auth_token', authToken);
    localStorage.setItem('user_data', JSON.stringify(userData));
    axios.defaults.headers.common['Authorization'] = `Bearer ${authToken}`;
    
    // Notify parent if in iframe
    if (window.parent !== window) {
      window.parent.postMessage({
        type: 'AUTH_UPDATE',
        token: authToken,
        user: userData
      }, '*');
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('accessToken');
    localStorage.removeItem('user_data');
    delete axios.defaults.headers.common['Authorization'];
    
    // Notify parent if in iframe
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'LOGOUT' }, '*');
    }
  };

  const checkPaymentRequired = async (): Promise<boolean> => {
    if (!user) return true;

    try {
      const response = await axios.get(`${microserviceUrl}/api/payment/check-limit`, {
        headers: getAuthHeaders()
      });
      
      return response.data.paymentRequired;
    } catch (error) {
      console.error('Payment check failed:', error);
      return true;
    }
  };

  const getAuthHeaders = () => {
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const value = {
    user,
    token,
    isAuthenticated: !!token && !!user,
    isLoading,
    setAuth,
    logout,
    checkPaymentRequired,
    getAuthHeaders,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};