'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import MultiresViewer from '@/components/viewer/MultiresViewer';
import { Tour, Scene, Hotspot } from '@/types/tour';

export default function PublicViewerPage() {
  const params = useParams();
  const router = useRouter();
  const tourId = params.id as string;
  
  const [tour, setTour] = useState<Tour | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTourData();
  }, [tourId]);

  const fetchTourData = async () => {
    try {
      setLoading(true);
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      
      // Fetch tour details with scenes from backend
      const tourResponse = await fetch(`${backendUrl}/api/tours/${tourId}/public`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!tourResponse.ok) {
        throw new Error('Tour not found');
      }

      const tourData = await tourResponse.json();
      setTour(tourData);

      // Fetch scenes for this tour
      const scenesResponse = await fetch(`${backendUrl}/api/tours/${tourId}/scenes`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (scenesResponse.ok) {
        const scenesData = await scenesResponse.json();
        setScenes(scenesData);

        // Collect all hotspots from scenes
        const allHotspots: Hotspot[] = [];
        for (const scene of scenesData) {
          try {
            const hotspotsResponse = await fetch(
              `${backendUrl}/api/scenes/${scene.id}/hotspots`,
              {
                method: 'GET',
                headers: {
                  'Content-Type': 'application/json',
                },
              }
            );
            
            if (hotspotsResponse.ok) {
              const sceneHotspots = await hotspotsResponse.json();
              allHotspots.push(...sceneHotspots);
            }
          } catch (err) {
            console.error(`Failed to fetch hotspots for scene ${scene.id}:`, err);
          }
        }
        setHotspots(allHotspots);
      }
    } catch (err) {
      console.error('Failed to fetch tour data:', err);
      setError('Unable to load virtual tour');
    } finally {
      setLoading(false);
    }
  };

  const handleSceneChange = (sceneId: string) => {
    const newIndex = scenes.findIndex(s => s.id === sceneId);
    if (newIndex !== -1) {
      setCurrentSceneIndex(newIndex);
    }
  };

  const handleHotspotClick = (hotspot: Hotspot) => {
    if (hotspot.kind === 'info' && hotspot.payload) {
      try {
        const payload = JSON.parse(hotspot.payload);
        alert(`${payload.title}: ${payload.description}`);
      } catch (err) {
        console.error('Failed to parse hotspot payload:', err);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-black">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p>Loading virtual tour...</p>
        </div>
      </div>
    );
  }

  if (error || !tour) {
    return (
      <div className="flex items-center justify-center h-screen bg-black">
        <div className="text-white text-center">
          <p className="text-xl mb-4">{error || 'Tour not found'}</p>
          <button
            onClick={() => router.push('/showcase')}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Back to Showcase
          </button>
        </div>
      </div>
    );
  }

  if (scenes.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen bg-black">
        <div className="text-white text-center">
          <p className="text-xl mb-4">No 360° tour available for this property yet</p>
          <p className="text-gray-400 mb-6">Check back soon or explore other properties</p>
          <button
            onClick={() => router.push('/showcase')}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Back to Showcase
          </button>
        </div>
      </div>
    );
  }

  const currentScene = scenes[currentSceneIndex];

  return (
    <div className="relative w-full h-screen bg-black">
      {/* Header overlay */}
      <div className="absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-black/70 to-transparent p-4">
        <div className="max-w-7xl mx-auto flex justify-between items-start">
          <div className="text-white">
            <h1 className="text-2xl font-bold mb-1">{tour.name}</h1>
            <p className="text-sm opacity-80">{tour.description}</p>
          </div>
          <button
            onClick={() => router.push('/showcase')}
            className="px-4 py-2 bg-white/10 backdrop-blur text-white rounded-lg hover:bg-white/20 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Showcase
          </button>
        </div>
      </div>

      {/* Scene selector if multiple scenes */}
      {scenes.length > 1 && (
        <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/70 to-transparent p-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex gap-2 overflow-x-auto pb-2">
              {scenes.map((scene, index) => (
                <button
                  key={scene.id}
                  onClick={() => setCurrentSceneIndex(index)}
                  className={`px-4 py-2 rounded-lg whitespace-nowrap transition-all ${
                    index === currentSceneIndex
                      ? 'bg-white text-black'
                      : 'bg-white/10 backdrop-blur text-white hover:bg-white/20'
                  }`}
                >
                  {scene.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MultiresViewer component */}
      <MultiresViewer
        tour={tour}
        currentScene={currentScene}
        scenes={scenes}
        onSceneChange={handleSceneChange}
        onHotspotClick={handleHotspotClick}
        isEditMode={false}
        hotspots={hotspots.filter(h => h.scene_id === currentScene.id)}
      />

      {/* Info panel */}
      <div className="absolute top-20 right-4 bg-white/10 backdrop-blur text-white p-3 rounded-lg z-10">
        <p className="text-sm mb-1">Use mouse to look around</p>
        <p className="text-sm mb-1">Scroll to zoom in/out</p>
        <p className="text-sm">Click hotspots to navigate</p>
      </div>
    </div>
  );
}