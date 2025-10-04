import { Hotspot } from '@/types/tour';

const API_BASE = '/api/tours';

export interface CreateHotspotData {
  kind: Hotspot['kind'];
  yaw: number;
  pitch: number;
  scene_id: string;
  target_scene_id: string;
  payload?: any; // Optional payload object
}

export interface UpdateHotspotData {
  kind?: Hotspot['kind'];
  yaw?: number;
  pitch?: number;
  payload?: string;
}

export class HotspotsAPI {
  // Get all hotspots for a scene
  static async getSceneHotspots(tourId: string, sceneId: string): Promise<Hotspot[]> {
    const response = await fetch(`${API_BASE}/${tourId}/scenes/${sceneId}/hotspots`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch hotspots: ${response.statusText}`);
    }

    const data = await response.json();
    return data.hotspots;
  }

  // Create a new hotspot
  static async createHotspot(
    tourId: string,
    hotspotData: CreateHotspotData
  ): Promise<Hotspot> {
    const response = await fetch(`${API_BASE}/${tourId}/hotspots`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
      },
      body: JSON.stringify(hotspotData),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create hotspot');
    }

    const data = await response.json();
    return data.hotspot;
  }

  // Update an existing hotspot
  static async updateHotspot(
    tourId: string,
    sceneId: string,
    hotspotId: string,
    updateData: UpdateHotspotData
  ): Promise<Hotspot> {
    const response = await fetch(
      `${API_BASE}/${tourId}/scenes/${sceneId}/hotspots/${hotspotId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
        body: JSON.stringify(updateData),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update hotspot');
    }

    const data = await response.json();
    return data.hotspot;
  }

  // Delete a hotspot
  static async deleteHotspot(
    tourId: string,
    sceneId: string,
    hotspotId: string
  ): Promise<void> {
    const response = await fetch(
      `${API_BASE}/${tourId}/scenes/${sceneId}/hotspots/${hotspotId}`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete hotspot');
    }
  }

  // Get all hotspots for a tour (all scenes)
  static async getTourHotspots(tourId: string): Promise<Hotspot[]> {
    const response = await fetch(`${API_BASE}/${tourId}/hotspots`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch tour hotspots: ${response.statusText}`);
    }

    const data = await response.json();
    return data.hotspots;
  }

  // Batch create hotspots
  static async batchCreateHotspots(
    tourId: string,
    hotspots: Array<CreateHotspotData & { scene_id: string }>
  ): Promise<Hotspot[]> {
    const response = await fetch(`${API_BASE}/${tourId}/hotspots/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
      },
      body: JSON.stringify({ hotspots }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create hotspots');
    }

    const data = await response.json();
    return data.hotspots;
  }
}