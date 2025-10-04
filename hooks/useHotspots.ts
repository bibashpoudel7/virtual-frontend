import { useState, useEffect, useCallback } from 'react';
import { Hotspot } from '@/types/tour';
import { HotspotsAPI, CreateHotspotData, UpdateHotspotData } from '@/lib/api/hotspots';

export function useHotspots(tourId: string, sceneId: string) {
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load hotspots for the scene
  const loadHotspots = useCallback(async () => {
    if (!tourId || !sceneId) return;
    
    try {
      setIsLoading(true);
      setError(null);
      const data = await HotspotsAPI.getSceneHotspots(tourId, sceneId);
      setHotspots(data);
    } catch (err) {
      console.error('Failed to load hotspots:', err);
      setError(err instanceof Error ? err.message : 'Failed to load hotspots');
    } finally {
      setIsLoading(false);
    }
  }, [tourId, sceneId]);

  // Create a new hotspot
  const createHotspot = useCallback(async (data: CreateHotspotData) => {
    if (!tourId) {
      throw new Error('Tour ID and Scene ID are required');
    }
    
    try {
      setIsLoading(true);
      setError(null);
      const newHotspot = await HotspotsAPI.createHotspot(tourId, data);
      setHotspots(prev => [...prev, newHotspot]);
      return newHotspot;
    } catch (err) {
      console.error('Failed to create hotspot:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to create hotspot';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [tourId, sceneId]);

  // Update an existing hotspot
  const updateHotspot = useCallback(async (hotspotId: string, data: UpdateHotspotData) => {
    if (!tourId || !sceneId || !hotspotId) {
      throw new Error('Tour ID, Scene ID, and Hotspot ID are required');
    }
    
    try {
      setIsLoading(true);
      setError(null);
      const updatedHotspot = await HotspotsAPI.updateHotspot(tourId, sceneId, hotspotId, data);
      setHotspots(prev => prev.map(h => h.id === hotspotId ? updatedHotspot : h));
      return updatedHotspot;
    } catch (err) {
      console.error('Failed to update hotspot:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to update hotspot';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [tourId, sceneId]);

  // Delete a hotspot
  const deleteHotspot = useCallback(async (hotspotId: string) => {
    if (!tourId || !sceneId || !hotspotId) {
      throw new Error('Tour ID, Scene ID, and Hotspot ID are required');
    }
    
    try {
      setIsLoading(true);
      setError(null);
      await HotspotsAPI.deleteHotspot(tourId, sceneId, hotspotId);
      setHotspots(prev => prev.filter(h => h.id !== hotspotId));
    } catch (err) {
      console.error('Failed to delete hotspot:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete hotspot';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [tourId, sceneId]);

  // Load hotspots on mount and when scene changes
  useEffect(() => {
    loadHotspots();
  }, [loadHotspots]);

  return {
    hotspots,
    isLoading,
    error,
    createHotspot,
    updateHotspot,
    deleteHotspot,
    reloadHotspots: loadHotspots,
    clearError: () => setError(null),
  };
}