import { useState, useCallback } from 'react';
import { Overlay } from '@/types/tour';
import { tourService } from '@/services/tourService';

export function useOverlays(initialOverlays: Overlay[] = []) {
  const [overlays, setOverlays] = useState<Overlay[]>(initialOverlays);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createOverlay = useCallback(async (sceneId: string, overlayData: any) => {
    setLoading(true);
    setError(null);
    
    try {
      const newOverlay = await tourService.createOverlay(sceneId, overlayData);
      setOverlays(prev => [...prev, newOverlay]);
      return newOverlay;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create overlay';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateOverlay = useCallback(async (sceneId: string, overlayId: string, updates: Partial<Overlay>) => {
    setLoading(true);
    setError(null);
    
    try {
      const updatedOverlay = await tourService.updateOverlay(sceneId, overlayId, updates);
      setOverlays(prev => prev.map(o => o.id === overlayId ? updatedOverlay : o));
      return updatedOverlay;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update overlay';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteOverlay = useCallback(async (sceneId: string, overlayId: string) => {
    setLoading(true);
    setError(null);
    
    try {
      await tourService.deleteOverlay(sceneId, overlayId);
      setOverlays(prev => prev.filter(o => o.id !== overlayId));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete overlay';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOverlays = useCallback(async (sceneId: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const sceneOverlays = await tourService.listOverlays(sceneId);
      setOverlays(prev => {
        // Remove existing overlays for this scene and add new ones
        const otherSceneOverlays = prev.filter(o => o.scene_id !== sceneId);
        return [...otherSceneOverlays, ...sceneOverlays];
      });
      return sceneOverlays;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load overlays';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const getOverlaysForScene = useCallback((sceneId: string) => {
    return overlays.filter(o => o.scene_id === sceneId);
  }, [overlays]);

  return {
    overlays,
    loading,
    error,
    createOverlay,
    updateOverlay,
    deleteOverlay,
    loadOverlays,
    getOverlaysForScene,
    setOverlays,
    clearError: () => setError(null)
  };
}