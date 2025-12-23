import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { ApiError, BaseResponse } from '@/types/api';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const API_BASE_URL_NESTED = process.env.NEXT_PUBLIC_API_BASE_URL_NESTED;



// Create a base API instance
const createApiInstance = (baseURL?: string): AxiosInstance => {
  const instance = axios.create({
    baseURL,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Request interceptor
  instance.interceptors.request.use(
    (config) => {
      // Add auth token if available
      const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
  );

  // Response interceptor
  instance.interceptors.response.use(
    (response: AxiosResponse<BaseResponse>) => {
      // Handle successful responses
      if (response.data && typeof response.data === 'object') {
        return response;
      }
      return response;
    },
    (error: AxiosError<BaseResponse>) => {
      // Handle errors
      if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        const errorData = error.response.data || {};
        const apiError: ApiError = {
          response: {
            status: error.response.status,
            data: {
              message: typeof errorData === 'string' ? errorData : errorData.message || 'An error occurred',
              statusCode: error.response.status,
              error: typeof errorData === 'string' ? errorData : errorData.message || 'An error occurred',
            },
          },
          message: error.message,
        };
        return Promise.reject(apiError);
      } else if (error.request) {
        // The request was made but no response was received
        return Promise.reject({
          message: 'No response received from the server',
          response: {
            data: {
              message: 'No response received from the server',
              error: 'No response received from the server',
            }
          }
        } as ApiError);
      } else {
        // Something happened in setting up the request that triggered an Error
        const message = error.message || 'An error occurred';
        return Promise.reject({
          message,
          response: {
            data: {
              message,
              error: message,
            }
          }
        } as ApiError);
      }
    }
  );

  return instance;
};

// Create API instances
const api = createApiInstance(API_BASE_URL);
const apiWithAuth = createApiInstance(API_BASE_URL);
const nestedApi = createApiInstance(API_BASE_URL_NESTED);

// Helper function to handle API responses
const handleResponse = <T>(response: AxiosResponse<BaseResponse<T>>): T => {
  if (response.data.success === false) {
    throw {
      response: {
        data: {
          message: response.data.message || 'Request failed',
        },
      },
    } as ApiError;
  }
  return response.data.datas as T;
};

// Typed API methods
export const apiClient = {
  get: async <T>(url: string, config?: AxiosRequestConfig): Promise<T> => {
    const response = await api.get<BaseResponse<T>>(url, config);
    return handleResponse(response);
  },
  post: async <T>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<T> => {
    const response = await api.post<BaseResponse<T>>(url, data, config);
    return handleResponse(response);
  },
  put: async <T>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<T> => {
    const response = await api.put<BaseResponse<T>>(url, data, config);
    return handleResponse(response);
  },
  delete: async <T>(url: string, config?: AxiosRequestConfig): Promise<T> => {
    const response = await api.delete<BaseResponse<T>>(url, config);
    return handleResponse(response);
  },
};

export const nestedApiClient = {
  get: async <T>(url: string, config?: AxiosRequestConfig): Promise<T> => {
    const response = await nestedApi.get<BaseResponse<T>>(url, config);
    return handleResponse(response);
  },
  post: async <T>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<T> => {
    const response = await nestedApi.post<BaseResponse<T>>(url, data, config);
    return handleResponse(response);
  },
  put: async <T>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<T> => {
    const response = await nestedApi.put<BaseResponse<T>>(url, data, config);
    return handleResponse(response);
  },
  delete: async <T>(url: string, config?: AxiosRequestConfig): Promise<T> => {
    const response = await nestedApi.delete<BaseResponse<T>>(url, config);
    return handleResponse(response);
  },
};

export { api, apiWithAuth, nestedApi };
