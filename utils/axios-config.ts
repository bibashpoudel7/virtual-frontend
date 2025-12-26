import axios from 'axios';

// Configure axios defaults
export const configureAxios = () => {
  // Set base URL for the microservice backend
  axios.defaults.baseURL = process.env.NEXT_PUBLIC_API_BASE_URL_NESTED || 'http://localhost:8080/';

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
        // Clear tokens
        localStorage.removeItem('accessToken');
        localStorage.removeItem('auth_token');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        
        // Redirect to login
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
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