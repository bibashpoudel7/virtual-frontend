'use client';

// frontend/app/tours/[id]/page.tsx
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import SceneManager from '@/components/scenes/SceneManager';
import VirtualTourViewer from '@/components/viewer/VirtualTourViewer';
import { Tour, Scene, Hotspot, Overlay } from '@/types/tour';
import { tourService } from '@/services/tourService';

export default function TourDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const tourId = params.id as string;

  const [tour, setTour] = useState<Tour | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [selectedScene, setSelectedScene] = useState<Scene>();
  const [activeTab, setActiveTab] = useState<'scenes' | 'viewer'>('viewer');  // Simplified to just scenes and viewer
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTourData();
  }, [tourId]);

  const fetchTourData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch tour details
      const tourData = await tourService.getTour(tourId);
      setTour(tourData);
      
      // Fetch scenes for this tour
      const scenesData = await tourService.getScenes(tourId);
      setScenes(scenesData);
      
      // Select first scene by default
      if (scenesData.length > 0) {
        setSelectedScene(scenesData[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tour data');
    } finally {
      setLoading(false);
    }
  };

  const handleSceneAdded = async (scene: Scene) => {
    setScenes([...scenes, scene]);
    setSelectedScene(scene);
  };

  const handleSceneDeleted = async (sceneId: string) => {
    setScenes(scenes.filter(s => s.id !== sceneId));
    if (selectedScene?.id === sceneId) {
      setSelectedScene(scenes[0] || null);
    }
  };

  const handleSceneSelected = (scene: Scene) => {
    setSelectedScene(scene);
    // Switch to viewer tab when a scene is selected
    if (activeTab === 'scenes') {
      setActiveTab('viewer');
    }
  };

  const handleHotspotAdded = (hotspot: Hotspot) => {
    if (selectedScene) {
      const updatedScene = {
        ...selectedScene,
        hotspots: [...(selectedScene.hotspots || []), hotspot]
      };
      setSelectedScene(updatedScene);
      setScenes(scenes.map(s => s.id === selectedScene.id ? updatedScene : s));
    }
  };

  const handleHotspotDeleted = async (hotspotId: string) => {
    if (selectedScene) {
      try {
        await tourService.deleteHotspot(selectedScene.id, hotspotId);
        const updatedScene = {
          ...selectedScene,
          hotspots: selectedScene.hotspots.filter(h => h.id !== hotspotId)
        };
        setSelectedScene(updatedScene);
        setScenes(scenes.map(s => s.id === selectedScene.id ? updatedScene : s));
      } catch (err) {
        console.error('Failed to delete hotspot:', err);
      }
    }
  };

  const handleOverlayAdded = (overlay: Overlay) => {
    if (selectedScene) {
      const updatedScene = {
        ...selectedScene,
        overlays: [...(selectedScene.overlays || []), overlay]
      };
      setSelectedScene(updatedScene);
      setScenes(scenes.map(s => s.id === selectedScene.id ? updatedScene : s));
    }
  };

  const handleOverlayDeleted = async (overlayId: string) => {
    if (selectedScene) {
      try {
        await tourService.deleteOverlay(selectedScene.id, overlayId);
        const updatedScene = {
          ...selectedScene,
          overlays: selectedScene.overlays.filter(o => o.id !== overlayId)
        };
        setSelectedScene(updatedScene);
        setScenes(scenes.map(s => s.id === selectedScene.id ? updatedScene : s));
      } catch (err) {
        console.error('Failed to delete overlay:', err);
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading tour...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => router.push('/tours')}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Back to Tours
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={activeTab === 'viewer' ? "min-h-screen bg-gray-100" : "h-screen w-screen bg-gray-100 flex flex-col overflow-hidden"}>
      {/* Header */}
      <header className={`bg-white shadow ${activeTab !== 'viewer' ? 'flex-shrink-0' : ''}`}>
        <div className="px-4 py-3">
          <div className="flex justify-between items-center">
            <div>
              <button
                onClick={() => router.push('/tours')}
                className="text-gray-500 hover:text-gray-700 mb-2"
              >
                ← Back to Tours
              </button>
              <h1 className="text-2xl font-bold text-gray-900">
                {tour?.name || 'Tour Details'}
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Tour ID: {tourId}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('viewer')}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                Open Viewer
              </button>
              <button
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Publish Tour
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className={`bg-white border-b ${activeTab !== 'viewer' ? 'flex-shrink-0' : ''}`}>
        <div className="px-4">
          <nav className="flex space-x-8">
            <button
              onClick={() => setActiveTab('scenes')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'scenes'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Scene Management ({scenes.length})
            </button>
            <button
              onClick={() => setActiveTab('viewer')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'viewer'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } ${scenes.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={scenes.length === 0}
            >
              Viewer & Editor
            </button>
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <main className={activeTab === 'viewer' ? "w-full" : "flex-1 overflow-auto flex flex-col w-full"}>
        {/* Tab Content */}
        <div className={activeTab === 'viewer' ? "" : "flex-1 flex flex-col"}>
          {activeTab === 'scenes' && (
            <div className="max-w-7xl mx-auto w-full p-6 bg-white rounded-lg shadow m-4">
              <div className="mb-4">
                <h2 className="text-lg font-semibold mb-2">Scene Management</h2>
                <p className="text-sm text-gray-600">
                  Add and organize scenes for your virtual tour. Upload 360° images or videos to create immersive experiences.
                </p>
              </div>
              <SceneManager
                tourId={tourId}
                scenes={scenes}
                onSceneUpdate={(updatedScenes) => setScenes(updatedScenes)}
              />
            </div>
          )}

          {activeTab === 'viewer' && tour && scenes.length > 0 && (
            <div className="w-full overflow-auto p-4">
              <div className="max-w-7xl mx-auto w-full bg-white rounded-lg shadow overflow-hidden">
                <div className="p-4 bg-gray-50 border-b">
                  <h2 className="text-lg font-semibold mb-2">360° Viewer & Editor</h2>
                  <p className="text-sm text-gray-600 mb-2">
                    View your tour and edit hotspots/overlays directly in the viewer. Use Edit Mode to add or modify interactive elements.
                  </p>
                  <div className="text-xs text-gray-500">
                    <strong>Controls:</strong> Drag to rotate • Scroll to zoom • Shift+Click to add hotspot (in edit mode)
                  </div>
                </div>
                <div className="relative overflow-hidden" style={{ 
                  height: 'min(900px, calc(100vh - 250px))',
                  minHeight: '700px'
                }}>
                <VirtualTourViewer
                  tour={tour}
                  scenes={scenes}
                  currentScene={selectedScene || scenes[0]}
                  onSceneChange={(sceneId) => {
                    const scene = scenes.find(s => s.id === sceneId);
                    if (scene) setSelectedScene(scene);
                  }}
                  onHotspotClick={(hotspot) => {
                    console.log('Hotspot clicked:', hotspot);
                    // Handle hotspot navigation
                    if (hotspot.kind === 'navigation') {
                      let targetSceneId = hotspot.target_scene_id;
                      if (!targetSceneId && hotspot.payload) {
                        try {
                          const payload = typeof hotspot.payload === 'string' 
                            ? JSON.parse(hotspot.payload) 
                            : hotspot.payload;
                          targetSceneId = payload.targetSceneId || payload.targetSceneID;
                        } catch (err) {
                          console.error('Failed to parse hotspot payload:', err);
                        }
                      }
                      if (targetSceneId) {
                        const targetScene = scenes.find(s => s.id === targetSceneId);
                        if (targetScene) {
                          setSelectedScene(targetScene);
                        }
                      }
                    }
                  }}
                />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'viewer' && (!tour || scenes.length === 0) && (
            <div className="max-w-7xl mx-auto w-full p-6">
              <div className="bg-white rounded-lg shadow p-12 text-center">
                <p className="text-gray-500">No scenes available for preview.</p>
                <button
                  onClick={() => setActiveTab('scenes')}
                  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Add Scenes
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Help Section */}
        {activeTab !== 'preview' && (
          <div className="mt-8 bg-blue-50 rounded-lg p-6">
            <h3 className="font-semibold text-blue-900 mb-2">Quick Tips:</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              {activeTab === 'scenes' && (
                <>
                  <li>• Upload 360° images for the best immersive experience</li>
                  <li>• Arrange scenes in the order you want visitors to experience them</li>
                  <li>• Set initial view angles (yaw, pitch, FOV) for each scene</li>
                </>
              )}
              {activeTab === 'hotspots' && (
                <>
                  <li>• Click on the preview to place hotspots at specific locations</li>
                  <li>• Use navigation hotspots to link scenes together</li>
                  <li>• Upload custom icons for unique hotspot appearances</li>
                  <li>• Test hotspot interactions in the Preview tab</li>
                </>
              )}
              {activeTab === 'overlays' && (
                <>
                  <li>• Overlays appear on top of your scene content</li>
                  <li>• Use text overlays for descriptions or instructions</li>
                  <li>• Image overlays can show logos, maps, or additional photos</li>
                  <li>• Set animations to make overlays more engaging</li>
                </>
              )}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}