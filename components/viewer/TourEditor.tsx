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
  const [editPanel, setEditPanel] = useState<'hotspots' | 'overlays' | null>('hotspots');
  const [hotspotType, setHotspotType] = useState<'navigation' | 'info' | 'link'>('navigation');

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
    <div className="absolute inset-0">
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

      {/* Edit Controls Panel */}
      <div className="absolute bottom-4 left-4 z-30">
        <div className="bg-white rounded-lg shadow-xl p-4" style={{ width: '320px' }}>
          {/* Edit Mode Toggle */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Editor Controls</h3>
            <button
              onClick={() => setIsEditMode(!isEditMode)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                isEditMode 
                  ? 'bg-green-600 text-white' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {isEditMode ? 'ON' : 'OFF'}
            </button>
          </div>

          {isEditMode && (
            <>
              {/* Edit Type Selector */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setEditPanel('hotspots')}
                  className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
                    editPanel === 'hotspots'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Hotspots
                </button>
                <button
                  onClick={() => setEditPanel('overlays')}
                  className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
                    editPanel === 'overlays'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Overlays
                </button>
              </div>

              {/* Instructions */}
              <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-4">
                <p className="text-sm text-blue-800">
                  <strong>How to add {editPanel}:</strong><br />
                  Hold <kbd className="px-1 py-0.5 bg-white rounded border">Shift</kbd> + Click on the panorama
                </p>
              </div>

              {/* Hotspots List */}
              {editPanel === 'hotspots' && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Current Hotspots ({hotspots.filter(h => h.scene_id === currentSceneId).length})</h4>
                  <div className="max-h-32 overflow-y-auto space-y-1">
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
                          <div key={hotspot.id} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                            <span className="truncate">
                              {hotspot.kind === 'navigation' && '🔄'}
                              {hotspot.kind === 'info' && 'ℹ️'}
                              {hotspot.kind === 'link' && '🔗'}
                              {' '}{targetScene?.name || hotspot.kind}
                            </span>
                            {hotspot?.id && (
                              <button
                                onClick={() => deleteHotspot(hotspot.id ?? '')}
                                className="text-red-500 hover:text-red-700"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        );
                      })}
                    {hotspots.filter(h => h.scene_id === currentSceneId).length === 0 && (
                      <p className="text-gray-500 text-sm italic">No hotspots yet</p>
                    )}
                  </div>
                </div>
              )}

              {/* Overlays List */}
              {editPanel === 'overlays' && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Current Overlays</h4>
                  <p className="text-gray-500 text-sm italic">Overlay feature coming soon...</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Scene selector */}
      <div className="absolute top-4 right-4 z-30">
        <div className="bg-white rounded-lg shadow-lg p-3">
          <label className="text-xs font-medium text-gray-600 block mb-1">Current Scene</label>
          <select
            value={currentSceneId}
            onChange={(e) => handleSceneChange(e.target.value)}
            className="px-3 py-2 bg-gray-50 text-gray-900 rounded border border-gray-200 font-medium"
          >
            {scenes.map(scene => (
              <option key={scene.id} value={scene.id}>
                {scene.name}
              </option>
            ))}
          </select>
        </div>
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
            <h3 className="text-lg font-bold mb-4">Create Hotspot</h3>
            
            {/* Hotspot Type Selector */}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">
                Hotspot Type
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setHotspotType('navigation')}
                  className={`px-3 py-2 rounded border text-sm font-medium transition-colors ${
                    hotspotType === 'navigation'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  🔄 Navigation
                </button>
                <button
                  onClick={() => setHotspotType('info')}
                  className={`px-3 py-2 rounded border text-sm font-medium transition-colors ${
                    hotspotType === 'info'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  ℹ️ Info
                </button>
                <button
                  onClick={() => setHotspotType('link')}
                  className={`px-3 py-2 rounded border text-sm font-medium transition-colors ${
                    hotspotType === 'link'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  🔗 Link
                </button>
              </div>
            </div>

            {/* Dynamic content based on type */}
            {hotspotType === 'navigation' && (
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
            )}

            {hotspotType === 'info' && (
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">
                  Information Text
                </label>
                <textarea
                  placeholder="Enter information to display..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg h-24 resize-none"
                />
              </div>
            )}

            {hotspotType === 'link' && (
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">
                  External URL
                </label>
                <input
                  type="url"
                  placeholder="https://example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            )}

            <div className="mb-4 p-3 bg-gray-100 rounded">
              <p className="text-sm">
                <strong>Position:</strong> Yaw {pendingHotspot?.yaw.toFixed(1)}°, Pitch {pendingHotspot?.pitch.toFixed(1)}°
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={createHotspot}
                disabled={hotspotType === 'navigation' && !selectedTargetScene}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create Hotspot
              </button>
              <button
                onClick={() => {
                  setShowHotspotDialog(false);
                  setPendingHotspot(null);
                  setSelectedTargetScene('');
                  setHotspotType('navigation');
                }}
                className="flex-1 px-4 py-2 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}