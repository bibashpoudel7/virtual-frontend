import {
  Tour,
  Scene,
  Hotspot,
  Overlay,
  GetUploadURLResponse,
  ProcessCubemapRequest,
  ProcessCubemapResponse,
  CreateHotspotRequest,
  PlayTour,
  PlayTourScene,
  FloorPlanAnalysis
} from '@/types/tour';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

// Global logout function reference
let globalLogoutFunction: (() => void) | null = null;

export const setTourServiceLogoutFunction = (logoutFn: () => void) => {
  globalLogoutFunction = logoutFn;
};

class TourService {
  private async fetchWithAuth(url: string, options?: RequestInit) {
    const token = localStorage.getItem('accessToken');

    // The API reads the user's role from the database; only the login token is sent
    const headers = {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options?.headers,
    };

    const response = await fetch(`${API_BASE_URL}${url}`, {
      ...options,
      headers,
    });

    // Handle 401 errors (token expired)
    if (response.status === 401) {
      console.log('Token expired in tour service - logging out user');

      if (globalLogoutFunction) {
        globalLogoutFunction();
      } else {
        // Fallback: Clear tokens and redirect
        localStorage.removeItem('accessToken');
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_data');
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
      }
      throw new Error('Authentication expired. Please log in again.');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    // Handle empty responses
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return;
    }

    // Try to parse JSON, but handle empty responses gracefully
    const text = await response.text();
    if (!text) {
      return;
    }

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  async createTour(tour: Partial<Tour>): Promise<Tour> {
    return this.fetchWithAuth('tours', {
      method: 'POST',
      body: JSON.stringify(tour),
    });
  }

  async getTour(id: string): Promise<Tour> {
    return this.fetchWithAuth(`tours/${id}`);
  }

  async getPublicTour(id: string): Promise<Tour> {
    return this.fetchWithAuth(`tours/${id}/public`);
  }

  async getPublicScenes(tourId: string): Promise<Scene[]> {
    const response = await this.fetchWithAuth(`tours/${tourId}/scenes/public?limit=500`);
    if (response && response.datas && Array.isArray(response.datas)) {
      return response.datas;
    }
    return Array.isArray(response) ? response : (response?.scenes || []);
  }

  async getPublicPlayTours(tourId: string): Promise<PlayTour[]> {
    const tours = await this.fetchWithAuth(`tours/${tourId}/play-tours/public`) as PlayTour[];
    if (Array.isArray(tours)) {
      tours.forEach(tour => {
        if (tour.play_tour_scenes) {
          tour.play_tour_scenes.sort((a, b) => a.sequence_order - b.sequence_order);
        }
      });
    }
    return tours;
  }

  async listTours(page: number = 1, limit: number = 10): Promise<{ data: Tour[], pagination: any }> {
    const response = await this.fetchWithAuth(`tours?page=${page}&limit=${limit}`);
    return response;
  }

  async listToursLegacy(): Promise<Tour[]> {
    const response = await this.fetchWithAuth(`tours`);
    return response?.data || [];
  }

  async listPublicTours(page: number = 1, limit: number = 10): Promise<Tour[]> {
    const response = await this.fetchWithAuth(`tours/public?page=${page}&limit=${limit}`);
    if (response && response.datas && Array.isArray(response.datas)) {
      return response.datas;
    }
    return Array.isArray(response) ? response : (response?.data || []);
  }

  async getUploadURL(sceneId: string, prefix?: string): Promise<GetUploadURLResponse> {
    return this.fetchWithAuth(`scenes/${sceneId}/upload-url`, {
      method: 'POST',
      body: JSON.stringify({ prefix }),
    });
  }

  async processCubemap(
    sceneId: string,
    request: ProcessCubemapRequest
  ): Promise<ProcessCubemapResponse> {
    return this.fetchWithAuth(`scenes/${sceneId}/process-cubemap`, {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async createHotspot(
    sceneId: string,
    hotspot: CreateHotspotRequest
  ): Promise<Hotspot> {
    return this.fetchWithAuth(`scenes/${sceneId}/hotspots`, {
      method: 'POST',
      body: JSON.stringify(hotspot),
    });
  }

  async listHotspots(sceneId: string): Promise<Hotspot[]> {
    const response = await this.fetchWithAuth(`scenes/${sceneId}/hotspots`);
    return Array.isArray(response) ? response : (response.hotspots || []);
  }

  async uploadToCloudflare(uploadUrl: string, file: File): Promise<void> {
    // Check if it's a local/mock URL
    if (uploadUrl.startsWith('local://')) {
      console.log('Using local storage, skipping Cloudflare upload');
      return; // Skip actual upload for local development
    }

    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }
  }

  // Scene management
  async getScenes(tourId: string, page: number = 1, limit: number = 10): Promise<Scene[]> {
    const response = await this.fetchWithAuth(`tours/${tourId}/scenes?page=${page}&limit=${limit}`);
    // If response is the new standardized format, return .datas
    if (response && response.datas && Array.isArray(response.datas)) {
      return response.datas;
    }
    // Fallback for old format or unexpected structure
    return Array.isArray(response) ? response : (response?.scenes || []);
  }

  // Read the rooms from a floor plan image with the server's AI model (dollhouse builder)
  async analyzeFloorPlan(tourId: string, image: Blob): Promise<FloorPlanAnalysis> {
    const form = new FormData();
    form.append('image', image, 'floorplan');
    const token = localStorage.getItem('accessToken');
    // Not fetchWithAuth: it forces a JSON content type, and this is a multipart upload
    const response = await fetch(`${API_BASE_URL}tours/${tourId}/floorplan/analyze`, {
      method: 'POST',
      body: form,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || `HTTP error! status: ${response.status}`);
    return data;
  }

  // Get all scenes for a tour
  async getAllScenes(tourId: string): Promise<Scene[]> {
    return this.getScenes(tourId, 1, 500);
  }

  async createScene(tourId: string, scene: Partial<Scene>): Promise<Scene> {
    return this.fetchWithAuth(`tours/${tourId}/scenes`, {
      method: 'POST',
      body: JSON.stringify(scene),
    });
  }

  async updateScene(sceneId: string, scene: Partial<Scene>): Promise<Scene> {
    return this.fetchWithAuth(`scenes/${sceneId}`, {
      method: 'PUT',
      body: JSON.stringify(scene),
    });
  }

  // Saves only the camera angle the scene opens at (PUT /scenes/:id would overwrite every column)
  async updateSceneView(sceneId: string, view: { yaw: number; pitch: number; fov: number }): Promise<void> {
    return this.fetchWithAuth(`scenes/${sceneId}/view`, {
      method: 'PUT',
      body: JSON.stringify(view),
    });
  }

  async deleteScene(sceneId: string): Promise<void> {
    return this.fetchWithAuth(`scenes/${sceneId}`, {
      method: 'DELETE',
    });
  }

  // Hotspot management
  async deleteHotspot(sceneId: string, hotspotId: string): Promise<void> {
    return this.fetchWithAuth(`scenes/${sceneId}/hotspots/${hotspotId}`, {
      method: 'DELETE',
    });
  }

  async updateHotspot(sceneId: string, hotspotId: string, hotspot: Partial<Hotspot>): Promise<Hotspot> {
    return this.fetchWithAuth(`scenes/${sceneId}/hotspots/${hotspotId}`, {
      method: 'PUT',
      body: JSON.stringify(hotspot),
    });
  }

  // Overlay management
  async createOverlay(sceneId: string, overlay: any): Promise<Overlay> {
    return this.fetchWithAuth(`scenes/${sceneId}/overlays`, {
      method: 'POST',
      body: JSON.stringify(overlay),
    });
  }

  async listOverlays(sceneId: string): Promise<Overlay[]> {
    return this.fetchWithAuth(`scenes/${sceneId}/overlays`);
  }

  async updateOverlay(sceneId: string, overlayId: string, overlay: Partial<Overlay>): Promise<Overlay> {
    return this.fetchWithAuth(`scenes/${sceneId}/overlays/${overlayId}`, {
      method: 'PUT',
      body: JSON.stringify(overlay),
    });
  }

  async deleteOverlay(sceneId: string, overlayId: string): Promise<void> {
    return this.fetchWithAuth(`scenes/${sceneId}/overlays/${overlayId}`, {
      method: 'DELETE',
    });
  }

  // Tour management
  async updateTour(tourId: string, tour: Partial<Tour>): Promise<Tour> {
    return this.fetchWithAuth(`tours/${tourId}`, {
      method: 'PUT',
      body: JSON.stringify(tour),
    });
  }

  async deleteTour(tourId: string): Promise<void> {
    return this.fetchWithAuth(`tours/${tourId}`, {
      method: 'DELETE',
    });
  }

  async publishTour(tourId: string): Promise<Tour> {
    return this.fetchWithAuth(`tours/${tourId}/publish`, {
      method: 'POST',
    });
  }

  async toggleFeaturedStatus(tourId: string, isFeatured: boolean): Promise<any> {
    return this.fetchWithAuth(`tours/${tourId}/feature`, {
      method: 'PUT',
      body: JSON.stringify({ is_featured_on_homepage: isFeatured }),
    });
  }

  async getFeaturedTour(): Promise<Tour | null> {
    try {
      const response = await this.fetchWithAuth('tours/featured');
      if (response && typeof response === 'object' && 'tour' in response) {
        return response.tour;
      }
      return response;
    } catch (error) {
      console.error('No featured tour found:', error);
      return null;
    }
  }


  async updateTourAudio(tourId: string, audioUrl: string, currentTour: Tour): Promise<Tour> {
    // Send the complete tour object with updated audio URL
    const updateData = {
      ...currentTour,
      background_audio_url: audioUrl || null
    };

    return this.fetchWithAuth(`tours/${tourId}`, {
      method: 'PUT',
      body: JSON.stringify(updateData),
    });
  }

  // PlayTour management
  async createPlayTour(tourId: string, playTour: Partial<PlayTour>): Promise<PlayTour> {
    return this.fetchWithAuth(`tours/${tourId}/play-tours`, {
      method: 'POST',
      body: JSON.stringify(playTour),
    });
  }

  async listPlayTours(tourId: string): Promise<PlayTour[]> {
    const tours = await this.fetchWithAuth(`tours/${tourId}/play-tours`) as PlayTour[];
    if (Array.isArray(tours)) {
      tours.forEach(tour => {
        if (tour.play_tour_scenes) {
          tour.play_tour_scenes.sort((a, b) => a.sequence_order - b.sequence_order);
        }
      });
    }
    return tours;
  }

  async getPlayTour(id: string): Promise<PlayTour> {
    const tour = await this.fetchWithAuth(`play-tours/${id}`) as PlayTour;
    if (tour && tour.play_tour_scenes) {
      tour.play_tour_scenes.sort((a, b) => a.sequence_order - b.sequence_order);
    }
    return tour;
  }

  async updatePlayTour(id: string, playTour: Partial<PlayTour>): Promise<PlayTour> {
    return this.fetchWithAuth(`play-tours/${id}`, {
      method: 'PUT',
      body: JSON.stringify(playTour),
    });
  }

  async deletePlayTour(id: string): Promise<void> {
    return this.fetchWithAuth(`play-tours/${id}`, {
      method: 'DELETE',
    });
  }
}

export const tourService = new TourService();