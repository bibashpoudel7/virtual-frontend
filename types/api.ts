// Base response type for all API responses
export interface BaseResponse<T = any> {
  success?: boolean;
  message?: string;
  datas?: T;
  statusCode: number;
}

// Auth types
export interface LoginResponse {
  accessToken: string;
    refreshToken?: string;
    firstName: string;
    lastName: string;
    email: string;
    roles: number;
    id: string;
}

// Tour types
export interface Tour {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  // Add other tour fields as needed
}

export interface TourListResponse extends BaseResponse<Tour[]> {}
export interface SingleTourResponse extends BaseResponse<Tour> {}

// Error types
export interface ApiError {
  response?: {
    status?: number;
    data?: {
      message?: string;
      error?: string;
      statusCode?: number;
    };
  };
  message?: string;
}
