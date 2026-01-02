import axios from 'axios';

// Global logout function that can be called from anywhere
let globalLogoutFunction: (() => void) | null = null;

export const setGlobalLogoutFunction = (logoutFn: () => void) => {
  globalLogoutFunction = logoutFn;
};

// Configure axios defaults
export const configureAxios = () => {
  // Set base URL for the microservice backend
  axios.defaults.baseURL = process.env.NEXT_PUBLIC_API_BASE_URL_NESTED

  // Add request interceptor to include token
  axios.interceptors.request.use(
    (config) => {
      // Get token from localStorage (try multiple keys for compatibility)
      const token = localStorage.getItem('accessToken') || 
                   localStorage.getItem('auth_token') || 
                   localStorage.getItem('token');
      
      if (token) {
        config.headers['Authorization'] = `Bearer ${token}`;
      }
      
      // Add CORS headers
      config.headers['Content-Type'] = 'application/json';
      config.headers['Accept'] = 'application/json';
      
      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
  );

  // Add response interceptor to handle auth errors
  axios.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401) {
        console.log('Token expired - logging out user');
        
        // Use the global logout function if available
        if (globalLogoutFunction) {
          globalLogoutFunction();
        } else {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('auth_token');
          localStorage.removeItem('token');
          localStorage.removeItem('user_data');
          localStorage.removeItem('user');
          
          // Clear any user-specific cache entries
          Object.keys(localStorage).forEach(key => {
            if (key.startsWith('userType_') || key.includes('_cache') || 
                key.includes('user_') || key.includes('tour_')) {
              localStorage.removeItem(key);
            }
          });
          
          // Clear axios auth header
          delete axios.defaults.headers.common['Authorization'];
          
          // Redirect to login
          if (typeof window !== 'undefined') {
            window.location.href = '/login';
          }
        }
      }
      return Promise.reject(error);
    }
  );
};

// Initialize on import
if (typeof window !== 'undefined') {
  configureAxios();
}