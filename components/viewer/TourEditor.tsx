'use client';
// frontend/components/viewer/TourEditor.tsx
import { useState, useCallback, useEffect } from 'react';
import MultiresViewer from './MultiresViewer';
import { Tour, Scene, Hotspot } from '@/types/tour';
import { HotspotsAPI } from '@/lib/api/hotspots';

interface TourEditorProps {
  tour: Tour;
  scenes: Scene[];
}

export default function TourEditor({ tour, scenes }: TourEditorProps) {
  const [currentSceneId, setCurrentSceneId] = useState(scenes[0]?.id || '');
  const [isEditMode, setIsEditMode] = useState(false);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [showHotspotDialog, setShowHotspotDialog] = useState(false);
  const [pendingHotspot, setPendingHotspot] = useState<{ yaw: number; pitch: number } | null>(null);
  const [selectedTargetScene, setSelectedTargetScene] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentScene = scenes.find(s => s.id === currentSceneId) || scenes[0];

  // Load hotspots for current scene
  useEffect(() => {
    const loadHotspots = async () => {
      if (!currentSceneId || !tour.id) return;
      
      console.log('Loading hotspots for scene:', currentSceneId);
      
      try {
        // Don't show loading for hotspot fetching - it's fast enough
        const sceneHotspots = await HotspotsAPI.getSceneHotspots(tour.id, currentSceneId);
        console.log('Loaded hotspots:', sceneHotspots);
        setHotspots(sceneHotspots);
        setError(null);
      } catch (err) {
        console.error('Failed to load hotspots:', err);
        setError('Failed to load hotspots');
        setHotspots([]); // Set empty array on error
      }
    };

    loadHotspots();
  }, [currentSceneId, tour.id]);

  const handleSceneChange = useCallback((sceneId: string) => {
    console.log('Navigating to scene:', sceneId);
    // Direct scene change without loading screen for smooth transition
    setCurrentSceneId(sceneId);
  }, []);

  const handleHotspotClick = useCallback((hotspot: Hotspot) => {
    if (hotspot.kind === 'navigation' && hotspot.payload) {
      try {
        const payload = JSON.parse(hotspot.payload);
        if (payload.targetSceneId) {
          handleSceneChange(payload.targetSceneId);
        }
      } catch (err) {
        console.error('Invalid hotspot payload:', err);
      }
    }
  }, [handleSceneChange]);

  const handleHotspotCreate = useCallback((yaw: number, pitch: number) => {
    setPendingHotspot({ yaw, pitch });
    setShowHotspotDialog(true);
  }, []);

  const createHotspot = useCallback(async () => {
    if (!pendingHotspot || !selectedTargetScene) return;

    try {
      setIsLoading(true);
      const newHotspot = await HotspotsAPI.createHotspot(
        tour.id,
        {
          kind: 'navigation',
          yaw: pendingHotspot.yaw,
          pitch: pendingHotspot.pitch,
          scene_id: currentSceneId,
          target_scene_id: selectedTargetScene,
          payload: {
            targetSceneId: selectedTargetScene,
            rotation: {
              enabled: true,
              direction: 'left-to-right',
              speed: 0.5,
              autoStart: true,
              loop: true,
              autoReverse: false
            }
          }
        }
      );

      setHotspots([...hotspots, newHotspot]);
      setShowHotspotDialog(false);
      setPendingHotspot(null);
      setSelectedTargetScene('');
      setError(null);
    } catch (err) {
      console.error('Failed to create hotspot:', err);
      setError('Failed to create hotspot');
    } finally {
      setIsLoading(false);
    }
  }, [pendingHotspot, selectedTargetScene, tour.id, currentSceneId, hotspots]);

  const updateHotspot = useCallback(async (updatedHotspot: Hotspot) => {
    if (!updatedHotspot.id) return;
    
    try {
      setIsLoading(true);
      console.log('Updating hotspot position:', updatedHotspot);
      
      // Send the full hotspot data with updated position
      const updateData = {
        id: updatedHotspot.id,
        tour_id: tour.id,
        scene_id: currentSceneId,
        target_scene_id: updatedHotspot.target_scene_id,
        kind: updatedHotspot.kind,
        yaw: updatedHotspot.yaw,
        pitch: updatedHotspot.pitch,
        payload: updatedHotspot.payload
      };
      
      const updated = await HotspotsAPI.updateHotspot(
        tour.id,
        currentSceneId,
        updatedHotspot.id,
        updateData as any
      );
      
      // Update local state
      setHotspots(hotspots.map(h => 
        h.id === updatedHotspot.id ? { ...h, yaw: updatedHotspot.yaw, pitch: updatedHotspot.pitch } : h
      ));
      setError(null);
      console.log('Hotspot position updated successfully');
    } catch (err) {
      console.error('Failed to update hotspot:', err);
      setError('Failed to update hotspot position');
    } finally {
      setIsLoading(false);
    }
  }, [hotspots, tour.id, currentSceneId]);

  const deleteHotspot = useCallback(async (hotspotId: string) => {
    if (!hotspotId) return;
    
    try {
      setIsLoading(true);
      await HotspotsAPI.deleteHotspot(tour.id, currentSceneId, hotspotId);
      setHotspots(hotspots.filter(h => h.id !== hotspotId));
      setError(null);
    } catch (err) {
      console.error('Failed to delete hotspot:', err);
      setError('Failed to delete hotspot');
    } finally {
      setIsLoading(false);
    }
  }, [hotspots, tour.id, currentSceneId]);

  return (
    <div className="relative w-full h-full">
      <MultiresViewer
        tour={tour}
        currentScene={currentScene}
        scenes={scenes}
        onSceneChange={handleSceneChange}
        onHotspotClick={handleHotspotClick}
        isEditMode={isEditMode}
        onHotspotCreate={handleHotspotCreate}
        onHotspotUpdate={updateHotspot}
        hotspots={hotspots}
      />

      {/* Edit mode toggle */}
      <div className="absolute bottom-4 left-4 z-30">
        <button
          onClick={() => setIsEditMode(!isEditMode)}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            isEditMode 
              ? 'bg-green-600 text-white hover:bg-green-700' 
              : 'bg-gray-800 text-white hover:bg-gray-700'
          }`}
        >
          {isEditMode ? '✓ Edit Mode' : '✎ Edit Mode'}
        </button>
      </div>

      {/* Scene selector */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-30">
        <select
          value={currentSceneId}
          onChange={(e) => handleSceneChange(e.target.value)}
          className="px-4 py-2 bg-black bg-opacity-75 text-white rounded-lg border border-gray-600"
        >
          {scenes.map(scene => (
            <option key={scene.id} value={scene.id}>
              {scene.name}
            </option>
          ))}
        </select>
      </div>

      {/* Remove loading overlay for seamless transitions */}

      {/* Error notification */}
      {error && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 z-40">
          <div className="bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-2 text-white hover:text-gray-200"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Hotspot creation dialog */}
      {showHotspotDialog && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold mb-4">Create Navigation Hotspot</h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">
                Target Scene
              </label>
              <select
                value={selectedTargetScene}
                onChange={(e) => setSelectedTargetScene(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">Select a scene...</option>
                {scenes
                  .filter(s => s.id !== currentSceneId)
                  .map(scene => (
                    <option key={scene.id} value={scene.id}>
                      {scene.name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="mb-4 p-3 bg-gray-100 rounded">
              <p className="text-sm">
                Position: Yaw {pendingHotspot?.yaw.toFixed(1)}°, Pitch {pendingHotspot?.pitch.toFixed(1)}°
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={createHotspot}
                disabled={!selectedTargetScene}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create Hotspot
              </button>
              <button
                onClick={() => {
                  setShowHotspotDialog(false);
                  setPendingHotspot(null);
                  setSelectedTargetScene('');
                }}
                className="flex-1 px-4 py-2 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hotspot list */}
      {isEditMode && hotspots.length > 0 && (
        <div className="absolute bottom-20 left-4 bg-black bg-opacity-75 text-white p-4 rounded-lg z-30 max-h-48 overflow-y-auto">
          <h4 className="font-bold mb-2">Hotspots in this scene</h4>
          <div className="space-y-2">
            {hotspots
              .filter(h => h.scene_id === currentSceneId)
              .map(hotspot => {
                const targetScene = scenes.find(s => {
                  try {
                    const payload = JSON.parse(hotspot.payload || '{}');
                    return s.id === payload.targetSceneId;
                  } catch {
                    return false;
                  }
                });
                
                return (
                  <div key={hotspot.id} className="flex items-center justify-between text-sm">
                    <span>→ {targetScene?.name || 'Unknown'}</span>
                   {
                     hotspot?.id !== undefined && <button
                     onClick={() => deleteHotspot(hotspot.id?? '')}
                     className="ml-2 text-red-400 hover:text-red-300"
                   >
                     ✕
                   </button>
                   }
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}