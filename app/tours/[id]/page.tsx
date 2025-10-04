'use client';

// frontend/app/tours/[id]/page.tsx
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import SceneManager from '@/components/scenes/SceneManager';
import EnhancedHotspotEditor from '@/components/hotspots/EnhancedHotspotEditor';
import OverlayEditor from '@/components/overlays/OverlayEditor';
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
  const [activeTab, setActiveTab] = useState<'scenes' | 'hotspots' | 'overlays' | 'preview'>('scenes');
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
    // Switch to hotspots tab when a scene is selected
    if (activeTab === 'scenes') {
      setActiveTab('hotspots');
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
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
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
                onClick={() => setActiveTab('preview')}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                Preview Tour
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
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8">
            <button
              onClick={() => setActiveTab('scenes')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'scenes'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Scenes ({scenes.length})
            </button>
            <button
              onClick={() => setActiveTab('hotspots')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'hotspots'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } ${!selectedScene ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={!selectedScene}
            >
              Hotspots {selectedScene && `(${selectedScene.hotspots?.length || 0})`}
            </button>
            <button
              onClick={() => setActiveTab('overlays')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'overlays'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } ${!selectedScene ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={!selectedScene}
            >
              Overlays {selectedScene && `(${selectedScene.overlays?.length || 0})`}
            </button>
            <button
              onClick={() => setActiveTab('preview')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'preview'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Preview
            </button>
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Scene Selector (visible when not in scenes tab) */}
        {activeTab !== 'scenes' && activeTab !== 'preview' && selectedScene && (
          <div className="mb-6 bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-700">Current Scene:</label>
                <select
                  value={selectedScene.id}
                  onChange={(e) => {
                    const scene = scenes.find(s => s.id === e.target.value);
                    if (scene) setSelectedScene(scene);
                  }}
                  className="ml-3 px-3 py-1 border rounded-md"
                >
                  {scenes.map(scene => (
                    <option key={scene.id} value={scene.id}>
                      {scene.name} (Order: {scene.order})
                    </option>
                  ))}
                </select>
              </div>
              <div className="text-sm text-gray-500">
                Position: ({selectedScene.yaw.toFixed(1)}°, {selectedScene.pitch.toFixed(1)}°) | 
                FOV: {selectedScene.fov}° | 
                Type: {selectedScene.type}
              </div>
            </div>
          </div>
        )}

        {/* Tab Content */}
        <div className="bg-white rounded-lg shadow">
          {activeTab === 'scenes' && (
            <div className="p-6">
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

          {activeTab === 'hotspots' && selectedScene && (
            <div className="p-6">
              <div className="mb-4">
                <h2 className="text-lg font-semibold mb-2">Hotspot Management</h2>
                <p className="text-sm text-gray-600">
                  Add interactive hotspots to navigate between scenes or display information. 
                  Choose from predefined icons or upload custom ones.
                </p>
              </div>
              <EnhancedHotspotEditor
                sceneId={selectedScene.id}
                tourId={tourId}
                scenes={scenes}
                hotspots={selectedScene.hotspots || []}
                onHotspotAdded={handleHotspotAdded}
                onHotspotDeleted={handleHotspotDeleted}
              />
            </div>
          )}

          {activeTab === 'overlays' && selectedScene && (
            <div className="p-6">
              <div className="mb-4">
                <h2 className="text-lg font-semibold mb-2">Overlay Management</h2>
                <p className="text-sm text-gray-600">
                  Add overlays to display additional content like text, images, or videos on top of your scenes.
                </p>
              </div>
              <OverlayEditor
                sceneId={selectedScene.id}
                overlays={selectedScene.overlays || []}
                onOverlayAdded={handleOverlayAdded}
                onOverlayDeleted={handleOverlayDeleted}
              />
            </div>
          )}

          {activeTab === 'preview' && tour && scenes.length > 0 && (
            <div style={{ height: '600px' }}>
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
                  const payload = JSON.parse(hotspot.payload || '{}');
                  if (hotspot.kind === 'navigation' && payload.targetSceneId) {
                    const targetScene = scenes.find(s => s.id === payload.targetSceneId);
                    if (targetScene) {
                      setSelectedScene(targetScene);
                    }
                  }
                }}
              />
            </div>
          )}

          {activeTab === 'preview' && (!tour || scenes.length === 0) && (
            <div className="p-12 text-center">
              <p className="text-gray-500">No scenes available for preview.</p>
              <button
                onClick={() => setActiveTab('scenes')}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Add Scenes
              </button>
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