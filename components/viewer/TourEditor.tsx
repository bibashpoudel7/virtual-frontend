'use client';
// frontend/components/viewer/TourEditor.tsx
import { useState, useCallback, useEffect, useRef } from 'react';
import MultiresViewer from './MultiresViewer';
import { Tour, Scene, Hotspot } from '@/types/tour';
import { HotspotsAPI } from '@/lib/api/hotspots';
import { tourService } from '@/services/tourService';

interface TourEditorProps {
  tour: Tour;
  scenes: Scene[];
  onTourUpdate?: (updatedTour: Tour) => void;
}

export default function TourEditor({ tour, scenes, onTourUpdate }: TourEditorProps) {
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
  const [infoText, setInfoText] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isFullscreen, ] = useState(false);
  const [isViewerFullscreen, setIsViewerFullscreen] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  
  // Audio controls state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [isAutoplay, setIsAutoplay] = useState(tour.autoplay_enabled || false);
  const [isClient, setIsClient] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  
  // Audio management state
  const [showAudioSettings, setShowAudioSettings] = useState(false);
  const [newAudioUrl, setNewAudioUrl] = useState('');
  const [isUpdatingAudio, setIsUpdatingAudio] = useState(false);

  const currentScene = scenes.find(s => s.id === currentSceneId) || scenes[0];

  // Load hotspots for current scene
  useEffect(() => {
    const loadHotspots = async () => {
      if (!currentSceneId || !tour.id) return;
      
      try {
        // Don't show loading for hotspot fetching - it's fast enough
        const sceneHotspots = await HotspotsAPI.getSceneHotspots(tour.id, currentSceneId);
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
    if (sceneId === currentSceneId) return; // Don't transition to the same scene
    
    // Direct scene change without transition overlay
    setCurrentSceneId(sceneId);
  }, [currentSceneId]);

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
    if (!pendingHotspot) return;
    
    // Validate required fields based on hotspot type
    if (hotspotType === 'navigation' && !selectedTargetScene) return;
    if (hotspotType === 'info' && !infoText.trim()) return;
    if (hotspotType === 'link' && !linkUrl.trim()) return;

    try {
      setIsLoading(true);
      let payload: any = {};
      let hotspotData: any = {
        kind: hotspotType,
        yaw: pendingHotspot.yaw,
        pitch: pendingHotspot.pitch,
        scene_id: currentSceneId,
        payload
      };
      
      if (hotspotType === 'navigation') {
        hotspotData.target_scene_id = selectedTargetScene;
        const targetScene = scenes.find(s => s.id === selectedTargetScene);
        payload = {
          label: `Go to ${targetScene?.name || 'Scene'}`,
          targetSceneId: selectedTargetScene,
          rotation: {
            enabled: true,
            direction: 'left-to-right',
            speed: 0.5,
            autoStart: true,
            loop: true,
            autoReverse: false
          }
        };
      } else if (hotspotType === 'info') {
        payload = {
          label: infoText.trim().length > 20 
            ? `${infoText.trim().substring(0, 20)}...` 
            : infoText.trim(),
          infoText: infoText.trim()
        };
      } else if (hotspotType === 'link') {
        let linkLabel = 'External Link';
        try {
          const urlObj = new URL(linkUrl.trim());
          linkLabel = `Link to ${urlObj.hostname}`;
        } catch {
          linkLabel = 'External Link';
        }
        payload = {
          label: linkLabel,
          url: linkUrl.trim()
        };
      }
      
      // Update payload in hotspotData
      hotspotData.payload = payload;
      const newHotspot = await HotspotsAPI.createHotspot(tour.id, hotspotData);
      const updatedHotspots = [...hotspots, newHotspot];
      setHotspots(updatedHotspots);
      
      // Force a re-render by triggering a small state change
      setTimeout(() => {
        setHotspots(prev => [...prev]);
      }, 100);
      
      // Clear form and close dialog
      setShowHotspotDialog(false);
      setPendingHotspot(null);
      setSelectedTargetScene('');
      setInfoText('');
      setLinkUrl('');
      setHotspotType('navigation');
      setError(null);
    } catch (err) {
      console.error('Failed to create hotspot:', err);
      setError('Failed to create hotspot');
    } finally {
      setIsLoading(false);
    }
  }, [pendingHotspot, selectedTargetScene, infoText, linkUrl, hotspotType, tour.id, currentSceneId, hotspots]);

  const updateHotspot = useCallback(async (updatedHotspot: Hotspot) => {
    if (!updatedHotspot.id) return;
    
    try {
      setIsLoading(true);
      
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

  // Viewer fullscreen functionality
  const toggleViewerFullscreen = useCallback(() => {
    setIsViewerFullscreen(!isViewerFullscreen);
  }, [isViewerFullscreen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isViewerFullscreen) {
        setIsViewerFullscreen(false);
      }
    };

    if (isViewerFullscreen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isViewerFullscreen]);

  // Client-side only flag
  useEffect(() => {
    setIsClient(true);
    // Set initial loading to false after a short delay to allow scene to initialize
    const timer = setTimeout(() => {
      setIsInitialLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  // Initialize background audio
  useEffect(() => {
    if (!isClient) return;
    
    setIsAudioLoading(true);
    
    let audioUrl = tour.background_audio_url || 
                   (tour as any).backgroundAudioUrl;
    
    if (audioUrl) {
      // Try to extract direct audio URL from sharing services
      extractAndLoadAudio(audioUrl);
    } else {
      // No audio URL provided, load default audio
      loadDefaultAudio();
    }

    // Cleanup function to stop audio when component unmounts
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current = null;
      }
      setIsAudioLoading(false);
    };
  }, [tour.background_audio_url, isClient]);

  const extractAndLoadAudio = async (originalUrl: string) => {
    try {
      // Check if it's a sharing service URL (be more specific about sharing services)
      const isFileSharing = (originalUrl.includes('jumpshare.com') && originalUrl.includes('/share/')) || 
                           (originalUrl.includes('audio.com') && originalUrl.includes('/audio/')) || 
                           (originalUrl.includes('soundcloud.com') && originalUrl.includes('/tracks/')) ||
                           (originalUrl.includes('dropbox.com') && originalUrl.includes('/s/')) ||
                           (originalUrl.includes('drive.google.com') && originalUrl.includes('/file/d/'));
      
      // If it's a sharing service, try extraction
      if (isFileSharing) {
        setAudioError('Loading audio...');
        
        try {
          const response = await fetch(`/api/extract-audio?url=${encodeURIComponent(originalUrl)}`);
          const result = await response.json();
          
          if (result.success && result.audioUrl) {
            // Don't show a message here, let loadAudioElement handle it
            loadAudioElement(result.audioUrl, true);
          } else {
            setAudioError(`${result.error} Please use direct audio URLs or sharing service URLs.`);
            loadAudioElement(originalUrl, true);
          }
        } catch (extractError) {
          setAudioError('Audio extraction failed. Please use direct audio URLs or sharing service URLs.');
          loadAudioElement(originalUrl, true);
        }
      } else {
        // Not a sharing service - it's a direct audio URL (user-provided file)
        // Load it directly without any warning
        loadAudioElement(originalUrl, false);
      }
    } catch (error) {
      console.error('[TourEditor] Audio processing error:', error);
      setAudioError('Failed to process audio URL');
    }
  };

  const loadDefaultAudio = async () => {
    // Default background audio when no audio is provided
    const defaultAudioUrl = 'https://audio.com/saransh-pachhai/audio/niya-a-bloom-vlog-no-copyright-music';
    
    setAudioError('No audio URL found. Loading default background music...');
    
    try {
      // Extract direct audio URL from audio.com for default audio
      const response = await fetch(`/api/extract-audio?url=${encodeURIComponent(defaultAudioUrl)}`);
      const result = await response.json();
      
      if (result.success && result.audioUrl) {
        const audio = new Audio(result.audioUrl);
        audio.loop = true;
        audio.volume = 0.3; // Lower volume for default audio
        audio.crossOrigin = 'anonymous';
        
        audio.addEventListener('canplay', () => {
          setIsAudioLoading(false); // Default audio is ready
          setAudioError('Playing default background music. Enter your own audio URL for a custom experience.');
          // Auto-hide message after 4 seconds
          setTimeout(() => {
            setAudioError(null);
          }, 4000);
        });
        
        audio.addEventListener('error', (e) => {
          setIsAudioLoading(false); // Stop loading on error
          console.error('[TourEditor] Default audio loading error:', e);
          setAudioError('Default audio failed to load. Please enter your own audio URL.');
        });
        
        audio.addEventListener('play', () => {
          setIsAudioPlaying(true);
        });
        
        audio.addEventListener('pause', () => {
          setIsAudioPlaying(false);
        });
        
        audioRef.current = audio;
      } else {
        setIsAudioLoading(false); // Stop loading on failure
        console.warn('[TourEditor] Default audio extraction failed');
        setAudioError('Default audio extraction failed. Please enter your own audio URL.');
      }
      
    } catch (error) {
      setIsAudioLoading(false); // Stop loading on error
      console.error('[TourEditor] Default audio extraction error:', error);
      setAudioError('Default audio failed to load. Please enter your own audio URL.');
    }
  };

  const loadAudioElement = (audioUrl: string, isFromSharingService: boolean) => {
    const audio = new Audio(audioUrl);
    audio.loop = true;
    audio.volume = 0.5;
    audio.crossOrigin = 'anonymous';
    
    audio.addEventListener('canplay', () => {
      setIsAudioLoading(false); // Audio is ready, stop loading
      
      if (isFromSharingService) {
        // For sharing services, show a brief success message then hide it
        setAudioError('✓ Audio ready');
        // Auto-hide success message after 2 seconds
        setTimeout(() => {
          setAudioError(null);
        }, 2000);
      } else {
        // For user-uploaded files, don't show any warning
        setAudioError(null);
      }
    });
    
    audio.addEventListener('error', (e) => {
      setIsAudioLoading(false); // Stop loading on error
      
      const errorMsg = audio.error?.message || 'Unknown error';
      
      if (isFromSharingService) {
        setAudioError('Extracted audio failed to load. Please use direct audio URLs or sharing service URLs.');
      } else {
        setAudioError(`Audio failed to load: ${errorMsg}. Please use direct audio file URLs or sharing service URLs.`);
      }
    });
    
    audio.addEventListener('play', () => {
      setIsAudioPlaying(true);
    });
    
    audio.addEventListener('pause', () => {
      setIsAudioPlaying(false);
    });
    
    audioRef.current = audio;
  };

  // Audio control functions
  const toggleAudio = async () => {
    if (!audioRef.current) {
      // Try to create audio if it doesn't exist
      let audioUrl = tour.background_audio_url || 
                     (tour as any).backgroundAudioUrl;
      
      if (audioUrl) {
        setAudioError('Loading audio...');
        
        // Use the extraction system
        await extractAndLoadAudio(audioUrl);
      } else {
        setAudioError('No audio URL available');
        return; // Don't load default audio automatically
      }
    }
    
    if (audioRef.current) {
      if (isAudioPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().catch((err: any) => {
          console.error('Failed to play audio:', err);
          setAudioError(`Failed to play audio: ${err.message}. Click to try again.`);
        });
      }
    }
  };

  const toggleAudioMute = () => {
    if (!audioRef.current) return;
    
    audioRef.current.muted = !audioRef.current.muted;
    setIsAudioMuted(audioRef.current.muted);
  };

  const toggleAutoplay = () => {
    setIsAutoplay(!isAutoplay);
    // Force a small delay to ensure the state change is processed
    setTimeout(() => {
    }, 100);
  };

  // Audio management functions
  const handleAudioUpdate = async () => {
    if (!newAudioUrl.trim() && !tour.background_audio_url) {
      setError('Please enter an audio URL or leave empty to remove audio');
      return;
    }

    setIsUpdatingAudio(true);
    setError(null);

    try {
      const updatedTour = await tourService.updateTourAudio(tour.id, newAudioUrl.trim(), tour);
      
      // Update local tour object
      tour.background_audio_url = updatedTour.background_audio_url;
      
      // Notify parent component
      if (onTourUpdate) {
        onTourUpdate(updatedTour);
      }

      // Stop current audio and reload with new URL
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
        setIsAudioPlaying(false);
      }

      // Reload audio with new URL
      setIsAudioLoading(true);
      if (updatedTour.background_audio_url) {
        await extractAndLoadAudio(updatedTour.background_audio_url);
      }
      // Don't load default audio if user removed audio - just stop playing

      setShowAudioSettings(false);
      setNewAudioUrl('');
      setAudioError('Audio updated successfully!');
      
      // Auto-hide success message
      setTimeout(() => {
        setAudioError(null);
      }, 3000);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update audio');
    } finally {
      setIsUpdatingAudio(false);
    }
  };

  const handleRemoveAudio = async () => {
    setIsUpdatingAudio(true);
    setError(null);

    try {
      const updatedTour = await tourService.updateTourAudio(tour.id, '', tour);
      
      // Update local tour object
      tour.background_audio_url = undefined;
      
      // Notify parent component
      if (onTourUpdate) {
        onTourUpdate(updatedTour);
      }

      // Stop current audio - don't load default
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
        setIsAudioPlaying(false);
      }

      setShowAudioSettings(false);
      setNewAudioUrl('');
      setAudioError('Audio removed.');
      setIsAudioLoading(false);
      
      // Auto-hide message
      setTimeout(() => {
        setAudioError(null);
      }, 3000);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove audio');
    } finally {
      setIsUpdatingAudio(false);
    }
  };

  return (
    <div className="absolute inset-0">
      {/* Initial Loading Overlay */}
      {isInitialLoading && (
        <div className="absolute inset-0 bg-gray-800 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-xl p-6 flex items-center space-x-3">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            <span className="text-gray-900 font-medium">Initializing viewer...</span>
          </div>
        </div>
      )}

      {/* Fullscreen Viewer Mode */}
      {isViewerFullscreen ? (
        <div className="fixed inset-0 z-50 bg-black">
          {/* Minimal Audio Controls for Fullscreen */}
          {isClient && (
            <div className="absolute top-4 left-4 z-60">
              <div className="bg-black bg-opacity-50 rounded-lg p-2 flex gap-2">
                {/* Autoplay Control */}
                <button
                  onClick={toggleAutoplay}
                  className={`p-2 rounded transition-colors flex items-center cursor-pointer ${
                    isAutoplay 
                      ? 'bg-blue-600 text-white hover:bg-blue-700' 
                      : 'bg-white bg-opacity-20 text-white hover:bg-opacity-30'
                  }`}
                  title={isAutoplay ? 'Pause Auto-rotation' : 'Start Auto-rotation'}
                >
                  {isAutoplay ? '⏸' : '▶'}
                </button>

                {/* Audio Control */}
                <button
                  onClick={toggleAudio}
                  disabled={isAudioLoading}
                  className={`p-2 rounded transition-colors flex items-center ${
                    isAudioLoading
                      ? 'bg-white bg-opacity-10 text-white cursor-not-allowed'
                      : isAudioPlaying 
                      ? 'bg-green-600 text-white hover:bg-green-700 cursor-pointer' 
                      : 'bg-white bg-opacity-20 text-white hover:bg-opacity-30 cursor-pointer'
                  }`}
                  title={
                    isAudioLoading 
                      ? 'Loading audio...' 
                      : isAudioPlaying 
                      ? 'Pause Background Audio' 
                      : 'Play Background Audio'
                  }
                >
                  {isAudioLoading ? '⏳' : isAudioPlaying ? '⏸' : '🎵'}
                </button>
                
                {/* Mute Control */}
                <button
                  onClick={toggleAudioMute}
                  disabled={isAudioLoading}
                  className={`p-2 rounded transition-colors ${
                    isAudioLoading
                      ? 'bg-white bg-opacity-10 text-white cursor-not-allowed'
                      : isAudioMuted 
                      ? 'bg-red-600 text-white hover:bg-red-700 cursor-pointer' 
                      : 'bg-white bg-opacity-20 text-white hover:bg-opacity-30 cursor-pointer'
                  }`}
                  title={
                    isAudioLoading 
                      ? 'Loading audio...' 
                      : isAudioMuted 
                      ? 'Unmute Audio' 
                      : 'Mute Audio'
                  }
                >
                  {isAudioMuted ? '🔇' : '🔊'}
                </button>
              </div>
            </div>
          )}

          {/* Exit Fullscreen Button */}
          <div className="absolute top-4 right-4 z-60">
            <button
              onClick={toggleViewerFullscreen}
              className="bg-black bg-opacity-50 text-white p-3 rounded-lg hover:bg-opacity-70 transition-colors cursor-pointer"
              title="Exit fullscreen (ESC)"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* Clean Viewer */}
          <div className="w-full h-full">
            <MultiresViewer
              tour={tour}
              currentScene={currentScene}
              scenes={scenes}
              onSceneChange={handleSceneChange}
              onHotspotClick={handleHotspotClick}
              isEditMode={false} // Disable edit mode in fullscreen
              onHotspotCreate={handleHotspotCreate}
              onHotspotUpdate={updateHotspot}
              hotspots={hotspots}
              isAutoplay={isAutoplay}
            />
          </div>
        </div>
      ) : (
        <>
          {/* Normal Editor Mode */}
          <div className="w-full h-full">
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
              isAutoplay={isAutoplay}
            />
          </div>

          {/* Sidebar Toggle Button - Only show when sidebar is closed */}
      {!sidebarOpen && (
        <div className="absolute left-2 top-2 z-40">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="bg-white rounded-lg shadow-lg p-3 hover:bg-gray-50 transition-colors"
            title="Open sidebar"
          >
            <svg 
              className="w-5 h-5 text-gray-700 cursor-pointer" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              {/* Hamburger menu icon */}
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      )}

      {/* Left Sidebar - Scene Navigation */}
      <div className={`absolute left-0 top-0 bottom-0 z-30 transition-all duration-300 ease-in-out ${
        sidebarOpen ? 'w-80 opacity-100' : 'w-0 opacity-0 pointer-events-none'
      }`}>
        <div className="bg-white shadow-xl h-full flex flex-col overflow-hidden rounded-r-lg">
          {/* Header */}
          <div className="p-4 border-b border-gray-200 flex-shrink-0">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-lg font-semibold text-gray-900">Scenes</h3>
                  {/* Close Sidebar Button - Top Right */}
                  <button
                    onClick={() => setSidebarOpen(false)}
                    className="p-2 hover:bg-gray-100 bg-gray-50 rounded-lg transition-colors shadow-sm"
                    title="Close sidebar"
                  >
                    <svg 
                      className="w-4 h-4 text-gray-600 hover:text-gray-800 cursor-pointer" 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-sm text-gray-600 whitespace-nowrap">Click to navigate between scenes</p>
                  <div className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded ml-3">
                    {scenes.length} scenes
                  </div>
                </div>
                
                {/* Status Indicators */}
                {isClient && (
                <div className="flex gap-2 mt-3">
                  {isAutoplay && (
                    <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded flex items-center gap-1">
                      <span className="animate-pulse">●</span>
                      Auto-rotating
                    </span>
                  )}
                  {isAudioPlaying && (
                    <span className="text-xs bg-green-600 text-white px-2 py-1 rounded flex items-center gap-1">
                      <span className="animate-pulse">♪</span>
                      Audio playing
                    </span>
                  )}
                </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Scenes List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {scenes.map((scene, index) => (
              <div
                key={scene.id}
                onClick={() => handleSceneChange(scene.id)}
                className={`relative cursor-pointer rounded-lg border-2 transition-all duration-200 ${
                  scene.id === currentSceneId
                    ? 'border-blue-500 bg-blue-50 shadow-md'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 hover:shadow-sm'
                }`}
              >
                {/* Scene Thumbnail */}
                <div className="aspect-video bg-gray-100 rounded-t-lg overflow-hidden relative">
                  {scene.src_original_url ? (
                    <img
                      src={scene.src_original_url}
                      alt={scene.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        // Fallback to a placeholder if image fails to load
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                  
                  {/* Scene number badge */}
                  <div className="absolute top-2 left-2 bg-black bg-opacity-60 text-white text-xs px-2 py-1 rounded">
                    {index + 1}
                  </div>
                </div>
                
                {/* Scene Info */}
                <div className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-gray-900 truncate">{scene.name}</h4>
                      <p className="text-xs text-gray-500">Scene {index + 1}</p>
                    </div>
                    {scene.id === currentSceneId && (
                      <div className="flex items-center text-blue-600 ml-2">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </div>
                  
                  {/* Hotspot count for this scene */}
                  <div className="mt-2 flex items-center text-xs text-gray-500">
                    <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                    </svg>
                    {hotspots.filter(h => h.scene_id === scene.id).length} hotspots
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Edit Controls Panel - Responsive to sidebar */}
      <div className={`absolute bottom-4 left-2 z-30 transition-all duration-300 ${
        sidebarOpen ? 'ml-80 pl-2' : 'ml-0'
      }`}>
        <div className="bg-white rounded-lg shadow-xl p-4" style={{ width: '320px' }}>
          {/* Edit Mode Toggle */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Editor Controls</h3>
            <button
              onClick={() => setIsEditMode(!isEditMode)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors cursor-pointer ${
                isEditMode 
                  ? 'bg-green-600 text-white' 
                  : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
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
                  className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors cursor-pointer ${
                    editPanel === 'hotspots'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Hotspots
                </button>
                <button
                  onClick={() => setEditPanel('overlays')}
                  className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors cursor-pointer ${
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
                <p className="text-sm text-blue-900 font-medium">
                  <strong>How to add {editPanel}:</strong><br />
                  Hold <kbd className="px-1 py-0.5 bg-white rounded border text-gray-800 font-semibold">Shift</kbd> + Click on the panorama
                </p>
              </div>

              {/* Hotspots List */}
              {editPanel === 'hotspots' && (
                <div>
                  <h4 className="text-sm font-semibold mb-2 text-gray-900">Current Hotspots ({hotspots.filter(h => h.scene_id === currentSceneId).length})</h4>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {hotspots
                      .filter(h => h.scene_id === currentSceneId)
                      .map(hotspot => {
                        let displayLabel: string = hotspot.kind;
                        let targetScene = null;
                        
                        try {
                          const payload = JSON.parse(hotspot.payload || '{}');
                          
                          // Check if there's a custom label in the payload
                          if (payload.label) {
                            displayLabel = payload.label;
                          } else if (hotspot.kind === 'navigation' && payload.targetSceneId) {
                            // Find target scene and create "Go to [scene name]" label
                            targetScene = scenes.find(s => s.id === payload.targetSceneId);
                            if (targetScene) {
                              displayLabel = `Go to ${targetScene.name}`;
                            }
                          } else if (hotspot.kind === 'info' && payload.infoText) {
                            // For info hotspots, show truncated info text
                            displayLabel = payload.infoText.length > 20 
                              ? `${payload.infoText.substring(0, 20)}...` 
                              : payload.infoText;
                          } else if (hotspot.kind === 'link' && payload.url) {
                            // For link hotspots, show domain name
                            try {
                              const urlObj = new URL(payload.url);
                              displayLabel = `Link to ${urlObj.hostname}`;
                            } catch {
                              displayLabel = 'External Link';
                            }
                          }
                        } catch {
                          // Fallback to target scene name if payload parsing fails
                          if (hotspot.kind === 'navigation' && hotspot.target_scene_id) {
                            targetScene = scenes.find(s => s.id === hotspot.target_scene_id);
                            if (targetScene) {
                              displayLabel = `Go to ${targetScene.name}`;
                            }
                          }
                        }
                        
                        return (
                          <div key={hotspot.id} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm text-gray-700">
                            <span className="truncate">
                              {hotspot.kind === 'navigation' && '🔄'}
                              {hotspot.kind === 'info' && 'ℹ️'}
                              {hotspot.kind === 'link' && '🔗'}
                              {' '}{displayLabel}
                            </span>
                            {hotspot?.id && (
                              <button
                                onClick={() => deleteHotspot(hotspot.id ?? '')}
                                className="text-red-500 hover:text-red-700 cursor-pointer"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        );
                      })}
                    {hotspots.filter(h => h.scene_id === currentSceneId).length === 0 && (
                      <p className="text-gray-700 text-sm italic">No hotspots yet</p>
                    )}
                  </div>
                </div>
              )}

              {/* Overlays List */}
              {editPanel === 'overlays' && (
                <div>
                  <h4 className="text-sm font-semibold mb-2 text-gray-900">Current Overlays</h4>
                  <p className="text-gray-700 text-sm italic">Overlay feature coming soon...</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Scene selector */}
      {/* <div className="absolute top-4 right-4 z-30">
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
      </div> */}

      {/* Top Right Controls - Only show when not in viewer fullscreen */}
      {!isViewerFullscreen && (
        <div className="absolute top-4 right-4 z-30 flex flex-col gap-2">
          {/* Audio & Autoplay Controls */}
          <div className="bg-white rounded-lg shadow-lg p-2 flex gap-2">
            {/* Autoplay Control */}
            <button
              onClick={toggleAutoplay}
              className={`p-2 rounded transition-colors flex items-center gap-1 cursor-pointer ${
                isAutoplay 
                  ? 'bg-blue-600 text-white hover:bg-blue-700' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              title={isAutoplay ? 'Pause Auto-rotation' : 'Start Auto-rotation'}
            >
              {isAutoplay ? '⏸' : '▶'}
              <span className="text-xs hidden sm:inline">Auto</span>
            </button>

            {/* Audio Controls - Always show since we have default audio */}
            {isClient && (
              <>
                <button
                  onClick={toggleAudio}
                  disabled={isAudioLoading}
                  className={`p-2 rounded transition-colors flex items-center ${
                    isAudioLoading
                      ? 'bg-blue-100 text-blue-600 cursor-not-allowed'
                      : isAudioPlaying 
                      ? 'bg-green-600 text-white hover:bg-green-700 cursor-pointer' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 cursor-pointer'
                  }`}
                  title={
                    isAudioLoading 
                      ? 'Loading audio...' 
                      : isAudioPlaying 
                      ? 'Pause Background Audio' 
                      : 'Play Background Audio'
                  }
                >
                  {isAudioLoading ? '' : isAudioPlaying ? '⏸' : '🎵'}
                  <span className="text-xs hidden sm:inline ml-1">
                    {isAudioLoading ? 'Loading...' : 'Audio'}
                  </span>
                </button>
                
                <button
                  onClick={() => {
                    setShowAudioSettings(true);
                    setNewAudioUrl(tour.background_audio_url || '');
                  }}
                  disabled={isAudioLoading}
                  className={`p-2 rounded transition-colors ${
                    isAudioLoading
                      ? 'bg-gray-50 text-gray-400 cursor-not-allowed'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 cursor-pointer'
                  }`}
                  title={isAudioLoading ? 'Loading audio...' : 'Audio Settings'}
                >
                  ⚙️
                </button>
                
                <button
                  onClick={toggleAudioMute}
                  disabled={isAudioLoading}
                  className={`p-2 rounded transition-colors ${
                    isAudioLoading
                      ? 'bg-gray-50 text-gray-400 cursor-not-allowed'
                      : isAudioMuted 
                      ? 'bg-red-600 text-white hover:bg-red-700 cursor-pointer' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 cursor-pointer'
                  }`}
                  title={
                    isAudioLoading 
                      ? 'Loading audio...' 
                      : isAudioMuted 
                      ? 'Unmute Audio' 
                      : 'Mute Audio'
                  }
                >
                  {isAudioMuted ? '🔇' : '🔊'}
                </button>
              </>
            )}
          </div>

          {/* Fullscreen Toggle */}
          <div className="bg-white rounded-lg shadow-lg w-fit ml-auto">
            <button
              onClick={toggleViewerFullscreen}
              className="p-2 hover:bg-gray-100 transition-colors rounded cursor-pointer flex items-center justify-center"
              title="Enter fullscreen viewer"
            >
              <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Audio Error Display*/}
      {!isViewerFullscreen && isClient && audioError && (
        <div className="absolute top-4 right-4 z-40 mt-20">
          <div className={`text-white px-3 py-2 rounded text-xs max-w-xs ${
            audioError.includes('successfully') || audioError.includes('extracted') || audioError.includes('✓ Audio ready')
              ? 'bg-green-600' 
              : audioError.includes('Extracting') || audioError.includes('Loading')
              ? 'bg-blue-600'
              : 'bg-amber-600'
          }`}>
            <div className="font-medium mb-1">
              {audioError.includes('successfully') || audioError.includes('extracted') || audioError.includes('✓ Audio ready') ? '✓ Success:' :
               audioError.includes('Extracting') || audioError.includes('Loading') ? '⏳ Processing:' :
               '⚠️ Audio Issue:'}
            </div>
            <div>{audioError}</div>
            {audioError.includes('sharing') && !audioError.includes('successfully') && !audioError.includes('✓ Audio ready') && (
              <div className="mt-2 text-xs opacity-90">
                💡 Use audio.com, jumpshare.com, or direct audio URLs
              </div>
            )}
          </div>
        </div>
      )}

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
            <h3 className="text-lg font-bold mb-4 text-gray-900">Create Hotspot</h3>
            
            {/* Hotspot Type Selector */}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2 text-gray-900">
                Hotspot Type
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setHotspotType('navigation')}
                  className={`px-3 py-2 rounded border text-sm font-medium transition-colors cursor-pointer ${
                    hotspotType === 'navigation'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  🔄 Navigation
                </button>
                <button
                  onClick={() => setHotspotType('info')}
                  className={`px-3 py-2 rounded border text-sm font-medium transition-colors cursor-pointer ${
                    hotspotType === 'info'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  ℹ️ Info
                </button>
                <button
                  onClick={() => setHotspotType('link')}
                  className={`px-3 py-2 rounded border text-sm font-medium transition-colors cursor-pointer ${
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
                <label className="block text-sm font-medium mb-2 text-gray-900">
                  Target Scene
                </label>
                <select
                  value={selectedTargetScene}
                  onChange={(e) => setSelectedTargetScene(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 cursor-pointer"
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
                <label className="block text-sm font-medium mb-2 text-gray-900">
                  Information Text
                </label>
                <textarea
                  value={infoText}
                  onChange={(e) => setInfoText(e.target.value)}
                  placeholder="Enter information to display..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg h-24 resize-none text-gray-900"
                />
              </div>
            )}

            {hotspotType === 'link' && (
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2 text-gray-900">
                  External URL
                </label>
                <input
                  type="url"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                />
              </div>
            )}

            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
              <p className="text-sm text-gray-900 font-medium">
                <strong>Position:</strong> Yaw {pendingHotspot?.yaw.toFixed(1)}°, Pitch {pendingHotspot?.pitch.toFixed(1)}°
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={createHotspot}
                disabled={
                  (hotspotType === 'navigation' && !selectedTargetScene) ||
                  (hotspotType === 'info' && !infoText.trim()) ||
                  (hotspotType === 'link' && !linkUrl.trim())
                }
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                Create Hotspot
              </button>
              <button
                onClick={() => {
                  setShowHotspotDialog(false);
                  setPendingHotspot(null);
                  setSelectedTargetScene('');
                  setHotspotType('navigation');
                  setInfoText('');
                  setLinkUrl('');
                }}
                className="flex-1 px-4 py-2 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audio Settings Dialog */}
      {showAudioSettings && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold mb-4 text-gray-900">Audio Settings</h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2 text-gray-900">
                Background Audio URL
              </label>
              <input
                type="url"
                value={newAudioUrl}
                onChange={(e) => setNewAudioUrl(e.target.value)}
                placeholder="https://audio.com/your-audio-link or direct audio URL"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="mt-2 text-xs text-gray-600">
                💡 Supports audio.com, jumpshare.com, or direct audio file URLs. Leave empty for default background music.
              </p>
            </div>

            {tour.background_audio_url && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
                <p className="text-sm text-gray-900 font-medium mb-1">Current Audio:</p>
                <p className="text-xs text-gray-600 break-all">{tour.background_audio_url}</p>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleAudioUpdate}
                disabled={isUpdatingAudio}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isUpdatingAudio ? 'Updating...' : 'Update Audio'}
              </button>
              
              {tour.background_audio_url && (
                <button
                  onClick={handleRemoveAudio}
                  disabled={isUpdatingAudio}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  title="Remove audio and use default"
                >
                  Remove
                </button>
              )}
              
              <button
                onClick={() => {
                  setShowAudioSettings(false);
                  setNewAudioUrl('');
                  setError(null);
                }}
                disabled={isUpdatingAudio}
                className="px-4 py-2 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400 disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}

    </div>
  );
}