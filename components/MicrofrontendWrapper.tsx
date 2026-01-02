'use client';

import React, { useEffect, useState } from 'react';
import { AuthProvider } from '@/contexts/AuthContext';
import axios from 'axios';

interface MicrofrontendConfig {
  apiUrl: string;
  mainAppUrl: string;
  stripePublicKey: string;
  mode: 'standalone' | 'embedded';
  theme?: 'light' | 'dark';
  propertyId?: string;
}

interface MicrofrontendWrapperProps {
  children: React.ReactNode;
  config?: Partial<MicrofrontendConfig>;
}

export default function MicrofrontendWrapper({ 
  children, 
  config 
}: MicrofrontendWrapperProps) {
  const [isConfigured, setIsConfigured] = useState(false);
  const [configuration, setConfiguration] = useState<MicrofrontendConfig>({
    apiUrl: process.env.NEXT_PUBLIC_API_BASE_URL_NESTED || '',
    mainAppUrl: process.env.NEXT_PUBLIC_MAIN_APP_URL || 'http://localhost:3001',
    stripePublicKey: process.env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY || '',
    mode: 'standalone',
    theme: 'light',
    ...config
  });

  useEffect(() => {
    // Check if running in iframe
    const isEmbedded = window.parent !== window;
    
    if (isEmbedded) {
      // Request configuration from parent
      window.parent.postMessage({ type: 'REQUEST_CONFIG' }, '*');
      
      // Listen for configuration
      const handleMessage = (event: MessageEvent) => {
        if (event.data.type === 'MICROFRONTEND_CONFIG') {
          setConfiguration(prev => ({
            ...prev,
            ...event.data.config,
            mode: 'embedded'
          }));
          setIsConfigured(true);
        }
      };
      
      window.addEventListener('message', handleMessage);
      
      // Timeout fallback
      setTimeout(() => {
        if (!isConfigured) {
          setIsConfigured(true);
        }
      }, 2000);
      
      return () => {
        window.removeEventListener('message', handleMessage);
      };
    } else {
      setIsConfigured(true);
    }
  }, []);

  useEffect(() => {
    // Configure axios defaults
    axios.defaults.baseURL = configuration.apiUrl;
    
    // Add request interceptor for cross-origin
    axios.interceptors.request.use(
      (config) => {
        // Add CORS headers if needed
        config.headers['X-Requested-With'] = 'XMLHttpRequest';
        
        // Add property ID if available
        if (configuration.propertyId) {
          config.headers['X-Property-ID'] = configuration.propertyId;
        }
        
        // Add source header
        config.headers['X-Source'] = configuration.mode === 'embedded' ? 'main_app' : 'standalone';
        
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Add response interceptor for error handling
    axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          // Notify parent about auth failure
          if (configuration.mode === 'embedded') {
            window.parent.postMessage({ type: 'AUTH_REQUIRED' }, '*');
          } else {
            // Redirect to login
            window.location.href = '/login';
          }
        }
        return Promise.reject(error);
      }
    );
  }, [configuration]);

  if (!isConfigured) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <AuthProvider 
      mainBackendUrl={configuration.mainAppUrl}
      microserviceUrl={configuration.apiUrl}
    >
      <div className={`microfrontend-container ${configuration.theme}`}>
        {configuration.mode === 'embedded' && (
          <div className="embedded-header bg-blue-50 p-2 text-sm text-center">
            Running in embedded mode
          </div>
        )}
        {children}
      </div>
    </AuthProvider>
  );
}