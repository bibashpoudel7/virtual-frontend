import { 
  Tour, 
  Scene, 
  Hotspot,
  Overlay, 
  GetUploadURLResponse, 
  ProcessCubemapRequest, 
  ProcessCubemapResponse,
  CreateHotspotRequest 
} from '@/types/tour';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

class TourService {
  private async fetchWithAuth(url: string, options?: RequestInit) {
    const token = localStorage.getItem('accessToken');
    
    const headers = {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
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

    return response.json();
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
    return this.fetchWithAuth(`scenes/${sceneId}/hotspots`);
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
}

export const tourService = new TourService();