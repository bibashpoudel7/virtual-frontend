import { 
  Tour, 
  Scene, 
  Hotspot,
  Overlay, 
  GetUploadURLResponse, 
  ProcessCubemapRequest, 
  ProcessCubemapResponse,
  CreateHotspotRequest,
  Property,
  PropertiesResponse
} from '@/types/tour';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

class TourService {
  private async fetchWithAuth(url: string, options?: RequestInit) {
    const token = localStorage.getItem('accessToken');
    const userData = localStorage.getItem('user_data');
    
    let role = '';
    if (userData) {
      try {
        const user = JSON.parse(userData);
        // TheNimto backend stores role as 'roles' (number), not 'role'
        role = user.roles?.toString() || user.role?.toString() || '';
      } catch (error) {
        console.error('Error parsing user data:', error);
      }
    }
    
    const headers = {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(role && { 'X-User-Role': role }),
      ...options?.headers,
    };

    const response = await fetch(`${API_BASE_URL}${url}`, {
      ...options,
      headers,
    });

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

  async getApprovedProperties(): Promise<PropertiesResponse> {
    return this.fetchWithAuth('properties/approved');
  }

  async getCompanyInfo(): Promise<any> {
    return this.fetchWithAuth('properties/company-info');
  }

  async getTour(id: string): Promise<Tour> {
    return this.fetchWithAuth(`tours/${id}`);
  }

  async listTours(): Promise<Tour[]> {
    return this.fetchWithAuth(`tours`);
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
  async getScenes(tourId: string): Promise<Scene[]> {
    return this.fetchWithAuth(`tours/${tourId}/scenes`);
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
}

export const tourService = new TourService();