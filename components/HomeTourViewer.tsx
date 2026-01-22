'use client';

import { Icon } from '@iconify/react';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Tour, Scene, Hotspot, Overlay, PlayTour } from '@/types/tour';
import { useAuth } from '@/contexts/AuthContext';

const R2_PUBLIC_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || 'https://test.thenimto.com';
import { tourService } from '@/services/tourService';
import CubeMapViewer from './viewer/CubeMapViewer';
import PlayTourOverlay from './tours/PlayTourOverlay';
import AutoplayController from './viewer/AutoplayController';
import { ChevronLeft, ChevronRight, Play, Maximize, Minimize, Share2, Volume2, VolumeX, Facebook, Twitter, Linkedin, Mail, Copy, X } from 'lucide-react';

const calculateTransitionOffsets = (direction: string, progress: number) => {
  // Use a smooth ease-out curve that doesn't return to zero
  const curveProgress = 1 - Math.pow(1 - progress, 3); // Cubic ease-out
  let yawOffset = 0;
  let pitchOffset = 0;
  let fovOffset = 0;

  switch (direction) {
    case 'up':
      pitchOffset = 20 * curveProgress;   // Arc Up
      fovOffset = -10 * curveProgress;    // Subtle Zoom In
      break;
    case 'down':
      pitchOffset = -20 * curveProgress;  // Arc Down
      fovOffset = 10 * curveProgress;     // Subtle Zoom Out
      break;
    case 'left':
      yawOffset = -25 * curveProgress;    // Arc Left
      break;
    case 'right':
      yawOffset = 25 * curveProgress;     // Arc Right
      break;
    case 'forward':
      fovOffset = -25 * curveProgress;    // Significant Zoom In
      break;
    case 'backward':
      fovOffset = 35 * curveProgress;     // Smooth zoom out (backward movement)
      pitchOffset = -5 * curveProgress;   // Slight downward tilt for natural backward feel
      break;
  }

  return { yawOffset, pitchOffset, fovOffset };
};

// Share Modal Component
const ShareModal = React.memo(({
  isOpen,
  onClose,
  tourName,
  tourUrl
}: {
  isOpen: boolean;
  onClose: () => void;
  tourName: string;
  tourUrl: string;
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(tourUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const shareLinks = {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(tourUrl)}`,
    twitter: `https://twitter.com/intent/tweet?url=${encodeURIComponent(tourUrl)}&text=${encodeURIComponent(`Check out this amazing virtual tour: ${tourName}`)}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(tourUrl)}`,
    pinterest: `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(tourUrl)}&description=${encodeURIComponent(`Virtual Tour: ${tourName}`)}`,
    email: `mailto:?subject=${encodeURIComponent(`Virtual Tour: ${tourName}`)}&body=${encodeURIComponent(`Check out this amazing virtual tour: ${tourName}\n\n${tourUrl}`)}`
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h3 className="text-xl font-semibold text-gray-900">Share</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Social Share Buttons */}
          <div className="flex justify-center gap-4 mb-6">
            <a
              href={shareLinks.facebook}
              target="_blank"
              rel="noopener noreferrer"
              className="w-12 h-12 bg-gray-100 hover:bg-blue-100 rounded-full flex items-center justify-center transition-colors group cursor-pointer"
              title="Share on Facebook"
            >
              <Facebook className="w-6 h-6 text-gray-600 group-hover:text-blue-600" />
            </a>
            <a
              href={shareLinks.twitter}
              target="_blank"
              rel="noopener noreferrer"
              className="w-12 h-12 bg-gray-100 hover:bg-blue-100 rounded-full flex items-center justify-center transition-colors group cursor-pointer"
              title="Share on Twitter"
            >
              <Twitter className="w-6 h-6 text-gray-600 group-hover:text-blue-400" />
            </a>
            <a
              href={shareLinks.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="w-12 h-12 bg-gray-100 hover:bg-blue-100 rounded-full flex items-center justify-center transition-colors group cursor-pointer"
              title="Share on LinkedIn"
            >
              <Linkedin className="w-6 h-6 text-gray-600 group-hover:text-blue-700" />
            </a>
            <a
              href={shareLinks.pinterest}
              target="_blank"
              rel="noopener noreferrer"
              className="w-12 h-12 bg-gray-100 hover:bg-red-100 rounded-full flex items-center justify-center transition-colors group cursor-pointer"
              title="Share on Pinterest"
            >
              <div className="w-6 h-6 bg-red-600 rounded-full flex items-center justify-center text-white text-xs font-bold group-hover:bg-red-700 transition-colors">
                P
              </div>
            </a>
            <a
              href={shareLinks.email}
              className="w-12 h-12 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-colors group cursor-pointer"
              title="Share via Email"
            >
              <Mail className="w-6 h-6 text-gray-600 group-hover:text-gray-800" />
            </a>
          </div>

          {/* URL Copy Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <input
                type="text"
                value={tourUrl}
                readOnly
                className="flex-1 bg-transparent text-sm text-gray-600 outline-none"
              />
              <button
                onClick={handleCopy}
                className={`px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer ${copied
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-900 text-white hover:bg-gray-800'
                  }`}
              >
                {copied ? 'Copied!' : 'COPY'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

ShareModal.displayName = 'ShareModal';

interface HomeTourViewerProps {
  className?: string;
}

// Completely isolated progress bar that doesn't cause React re-renders
const ProgressBar = React.memo(({
  scenes,
  currentSceneIndex,
  isAutoplay,
  isTransitioning,
  onSceneChange,
  isOverlayModalOpen = false,
  segmentDuration = 12000, // Default 12s
  restartTrigger
}: {
  scenes: any[];
  currentSceneIndex: number;
  isAutoplay: boolean;
  isTransitioning: boolean;
  onSceneChange: (index: number) => void;
  isOverlayModalOpen?: boolean;
  segmentDuration?: number;
  restartTrigger?: number;
}) => {
  const progressBarRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | undefined>(undefined);
  const startTimeRef = useRef<number>(0);
  const pausedProgressRef = useRef<number>(0); // Track progress when paused
  const lastSceneIndexRef = useRef<number>(currentSceneIndex);
  const prevRestartTriggerRef = useRef<number>(restartTrigger || 0);

  // Direct DOM manipulation for smooth progress without React re-renders
  useEffect(() => {
    // Reset progress when scene changes or restart is triggered
    if (lastSceneIndexRef.current !== currentSceneIndex || (restartTrigger !== undefined && prevRestartTriggerRef.current !== restartTrigger)) {
      pausedProgressRef.current = 0;
      lastSceneIndexRef.current = currentSceneIndex;
      if (restartTrigger !== undefined) {
        prevRestartTriggerRef.current = restartTrigger;
        startTimeRef.current = Date.now(); // Reset start time for immediate restart
      }
    }

    if (isTransitioning || scenes.length <= 1) {
      return;
    }

    if (isAutoplay && !isOverlayModalOpen) {
      // Resume from paused progress or start fresh
      startTimeRef.current = Date.now() - (pausedProgressRef.current * segmentDuration);

      const updateProgress = () => {
        if (!progressBarRef.current || isTransitioning) return;

        const elapsed = Date.now() - startTimeRef.current;
        const progress = Math.min(1, elapsed / segmentDuration);

        // Store current progress for potential pause
        pausedProgressRef.current = progress;

        // Find the current scene's progress bar and update it directly
        const currentProgressBar = progressBarRef.current.querySelector(`[data-scene-index="${currentSceneIndex}"] .progress-fill`) as HTMLElement;
        if (currentProgressBar) {
          currentProgressBar.style.width = `${progress * 100}%`;
        }

        if (progress < 1 && isAutoplay && !isOverlayModalOpen) {
          animationRef.current = requestAnimationFrame(updateProgress);
        }
      };

      animationRef.current = requestAnimationFrame(updateProgress);
    } else {
      // When paused, keep the current progress visible
      if (progressBarRef.current) {
        const currentProgressBar = progressBarRef.current.querySelector(`[data-scene-index="${currentSceneIndex}"] .progress-fill`) as HTMLElement;
        if (currentProgressBar) {
          currentProgressBar.style.width = `${pausedProgressRef.current * 100}%`;
        }
      }
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isAutoplay, isTransitioning, currentSceneIndex, scenes.length, isOverlayModalOpen, segmentDuration, restartTrigger]);

  if (scenes.length <= 1) return null;

  return (
    <div className="absolute bottom-0 left-0 right-0 p-4" ref={progressBarRef}>
      {/* Segmented Progress Bar with gaps */}
      <div className="flex gap-1 w-full h-1">
        {scenes.map((scene, index) => {
          const isCompleted = index < currentSceneIndex;
          const isCurrent = index === currentSceneIndex;

          return (
            <div
              key={scene.id}
              className="flex-1 relative group"
              data-scene-index={index}
            >
              {/* Background segment */}
              <div className="w-full h-1 bg-white/40 rounded-full overflow-hidden">
                {/* Progress fill */}
                <div
                  className={`progress-fill h-full rounded-full tour-progress-segment ${isCompleted || isCurrent
                    ? 'bg-red-500'
                    : 'bg-white/40'
                    }`}
                  style={{
                    width: isCompleted ? '100%' : '0%', // Let the useEffect handle current scene progress
                    backgroundColor: isCompleted || isCurrent ? '#ef4444' : undefined
                  }}
                />
              </div>

              {/* Hover area */}
              <button
                onClick={() => onSceneChange(index)}
                disabled={isTransitioning}
                className="absolute inset-0 -top-2 -bottom-2 cursor-pointer disabled:cursor-not-allowed group"
                title={scene.name || `Scene ${index + 1}`}
              >
                {/* Hover effect overlay */}
                <div className="absolute inset-0 top-2 bottom-2 bg-red-400/30 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

                {/* Scene preview tooltip with image on hover */}
                <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all duration-300 delay-150 pointer-events-none z-50">
                  <div className="bg-black/90 backdrop-blur-sm rounded-lg overflow-hidden shadow-xl border border-white/20">
                    {/* Scene preview image */}
                    <div className="w-32 h-20 bg-gray-800 relative overflow-hidden">
                      {scene.src_original_url ? (
                        <img
                          src={scene.src_original_url}
                          alt={scene.name || `Scene ${index + 1}`}
                          className="w-full h-full object-cover scene-preview-image"
                          onError={(e) => {
                            // Try fallback sources
                            const img = e.target as HTMLImageElement;
                            if (!img.dataset.fallbackTried) {
                              img.dataset.fallbackTried = 'true';
                              const fallbackUrl = scene.src_original_url?.replace(/\.(jpg|jpeg|png)$/i, '_thumb.$1') ||
                                `${R2_PUBLIC_URL}/scenes/${scene.id}/preview.jpg`;
                              img.src = fallbackUrl;
                            } else {
                              img.style.display = 'none';
                              const placeholder = img.nextElementSibling as HTMLElement;
                              if (placeholder) placeholder.style.display = 'flex';
                            }
                          }}
                        />
                      ) : null}
                      {/* Fallback placeholder */}
                      <div
                        className="w-full h-full flex items-center justify-center text-white/60 text-xs"
                        style={{ display: scene.src_original_url ? 'none' : 'flex' }}
                      >
                        <div className="text-center">
                          <div className="w-8 h-8 mx-auto mb-1 bg-white/20 rounded flex items-center justify-center">
                            📷
                          </div>
                          Scene {index + 1}
                        </div>
                      </div>
                      {/* Scene number overlay */}
                      <div className="absolute top-1 right-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
                        {index + 1}
                      </div>
                    </div>
                    {/* Scene name */}
                    <div className="px-3 py-2 text-white text-xs font-medium">
                      {scene.name || `Scene ${index + 1}`}
                    </div>
                  </div>
                  {/* Arrow pointing down */}
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-6 border-transparent border-t-black/90"></div>
                </div>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
});

ProgressBar.displayName = 'ProgressBar';

const HomeTourViewer: React.FC<HomeTourViewerProps> = ({ className = '' }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const [currentTour, setCurrentTour] = useState<Tour | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [isAutoplay, setIsAutoplay] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allHotspots, setAllHotspots] = useState<Hotspot[]>([]);
  const [allOverlays, setAllOverlays] = useState<Overlay[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [isOverlayModalOpen, setIsOverlayModalOpen] = useState(false);
  const [showPauseOverlay, setShowPauseOverlay] = useState(false);
  const [restartTrigger, setRestartTrigger] = useState(0);

  // Play Tour state
  const [playTours, setPlayTours] = useState<any[]>([]);
  const [isPlayingTour, setIsPlayingTour] = useState(false);
  const [hasPlayTourStarted, setHasPlayTourStarted] = useState(false);
  const [selectedPlayTourId, setSelectedPlayTourId] = useState<string | null>(null);
  const [currentPlayTourSceneIndex, setCurrentPlayTourSceneIndex] = useState(0);
  const [currentCamera, setCurrentCamera] = useState<{ yaw: number; pitch: number; fov: number } | null>(null);
  const [isManualSceneChange, setIsManualSceneChange] = useState(false);

  // Reset manual scene change flag after CubeMapViewer processes it
  useEffect(() => {
    if (isManualSceneChange) {
      const timer = setTimeout(() => {
        setIsManualSceneChange(false);
      }, 100); // Increased delay to ensure CubeMapViewer processes the flag
      return () => clearTimeout(timer);
    }
  }, [isManualSceneChange]);

  const containerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pauseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const autoplayTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const playTourProgressRef = useRef<number>(0);
  const playTourLastSceneIndexRef = useRef<number>(0);
  const playTourRestartTriggerRef = useRef<number>(0);
  const fetchInProgressRef = useRef<boolean>(false);

  // Memoize the fetch function to prevent unnecessary re-creations
  const fetchTours = useCallback(async () => {
    // Prevent duplicate API calls
    if (fetchInProgressRef.current) {
      return;
    }

    // Wait for authentication check to complete before deciding which API to use
    if (isLoading) {
      return;
    }

    try {
      fetchInProgressRef.current = true;
      setLoading(true);

      // 1. Try to fetch user-specific tours if authenticated
      let toursData: Tour[] = [];
      let usingPublicApi = false;
      let selectedTour: Tour | null = null;

      if (isAuthenticated) {
        // User is authenticated - only use authenticated API
        try {
          toursData = await tourService.listTours();

          if (toursData && toursData.length > 0) {
            // Filter for featured tours first
            const featuredTours = toursData.filter(tour => tour.is_featured_on_homepage === true);

            if (featuredTours.length > 0) {
              // Use the first featured tour
              selectedTour = featuredTours[0];
              console.log('[HomeTourViewer] Found featured tour:', selectedTour.name);
            } else {
              // No featured tours found, use the first available tour
              selectedTour = toursData[0];
              console.log('[HomeTourViewer] No featured tours found, using first available tour:', selectedTour.name);
            }
          } else {
            setError('No tours available for your account');
            return;
          }
        } catch (authErr) {
          console.error('Failed to fetch authenticated tours:', authErr);
          setError('Failed to load your tours');
          return;
        }
      } else {
        // User is not authenticated - use public API
        console.log('[HomeTourViewer] User not authenticated, fetching public tours...');
        try {
          toursData = await tourService.listPublicTours();
          usingPublicApi = true;
          if (toursData && toursData.length > 0) {
            // Select the first tour from the public list
            selectedTour = toursData[0];
            console.log('[HomeTourViewer] Using public tour:', selectedTour.name);
          } else {
            setError('No public tours available');
            return;
          }
        } catch (pubErr) {
          console.error('Failed to fetch public tours:', pubErr);
          setError('Failed to load virtual tours');
          return;
        }
      }

      if (selectedTour) {
        // Use the selected tour data directly from the list API (no need for individual tour API call)
        // Only fetch scenes and play tours separately
        let scenesData: Scene[] = [];
        let playToursData: PlayTour[] = [];

        if (usingPublicApi) {
          scenesData = await tourService.getPublicScenes(selectedTour.id);
          try {
            playToursData = await tourService.getPublicPlayTours(selectedTour.id);
          } catch (e) {
            console.warn('Public play tours not found:', e);
            playToursData = [];
          }
        } else {
          scenesData = await tourService.getAllScenes(selectedTour.id);
          try {
            playToursData = await tourService.listPlayTours(selectedTour.id);
          } catch (e) {
            console.warn('Auth play tours not found:', e);
            playToursData = [];
          }
        }

        // Use the tour data directly from the list (no additional API call needed)
        setCurrentTour(selectedTour);
        const validScenesData = scenesData || [];
        setScenes(validScenesData);

        // Extract hotspots and overlays
        const preloadedHotspots = validScenesData.flatMap((s: Scene) => s.hotspots || []);
        const preloadedOverlays = validScenesData.flatMap((s: Scene) => s.overlays || []);

        setAllHotspots(preloadedHotspots);
        setAllOverlays(preloadedOverlays);

        // Sort play tour scenes by sequence order
        const finalPlayTours = (playToursData || []).map((pt: any) => {
          if (pt.play_tour_scenes) {
            return {
              ...pt,
              play_tour_scenes: [...pt.play_tour_scenes].sort((a: any, b: any) => (a.sequence_order || 0) - (b.sequence_order || 0))
            };
          }
          return pt;
        });

        setPlayTours(finalPlayTours);
        if (finalPlayTours.length > 0) {
          setSelectedPlayTourId(finalPlayTours[0].id);

          const firstPlayTour = finalPlayTours[0];
          if (firstPlayTour.play_tour_scenes && firstPlayTour.play_tour_scenes.length > 0) {
            const firstSceneId = firstPlayTour.play_tour_scenes[0].scene_id;
            const sceneIndex = validScenesData.findIndex((s: Scene) => s.id === firstSceneId);
            if (sceneIndex !== -1) {
              setCurrentSceneIndex(sceneIndex);
            }
          }
        }
      }
    } catch (err) {
      console.error('Error fetching tours:', err);
      setError('Failed to load virtual tours');
    } finally {
      setLoading(false);
      fetchInProgressRef.current = false;
    }
  }, [isAuthenticated, isLoading]);

  // Fetch tours on component mount and when authentication changes
  useEffect(() => {
    fetchTours();

    // Cleanup function to reset fetch progress if component unmounts
    return () => {
      fetchInProgressRef.current = false;
    };
  }, [fetchTours]);

  const playTourDisplayScenes = React.useMemo(() => {
    if (!selectedPlayTourId) return null;
    const selectedTour = playTours.find(t => t.id === selectedPlayTourId);
    if (!selectedTour || !selectedTour.play_tour_scenes) return null;

    return selectedTour.play_tour_scenes.map((ps: any, idx: number) => {
      const scene = scenes.find(s => s.id === ps.scene_id);
      return {
        ...scene,
        id: `${ps.id}-${idx}`, // Unique ID for the progress bar key
        name: scene?.name || 'Tour Step',
        move_duration: ps.move_duration,
        wait_duration: ps.wait_duration,
        title: ps.title,
        description: ps.description
      };
    });
  }, [selectedPlayTourId, playTours, scenes]);

  const currentPlayTourScene = React.useMemo(() => {
    if (!selectedPlayTourId) return null;
    const selectedTour = playTours.find(t => t.id === selectedPlayTourId);
    return selectedTour?.play_tour_scenes?.[currentPlayTourSceneIndex] || null;
  }, [selectedPlayTourId, playTours, currentPlayTourSceneIndex]);

  const handleSceneChange = useCallback((index: number, immediate: boolean = false) => {
    if (index === currentSceneIndex) {
      setRestartTrigger(prev => prev + 1);
      return;
    }

    // Mark this as a manual scene change (user clicked progress bar or navigation buttons)
    setIsManualSceneChange(true);

    // Interrupt any active playback when changing scenes manually (like PublicTourViewer)
    setIsPlayingTour(false);
    setIsAutoplay(false);
    
    // Reset forced camera control - this is crucial for manual scene changes
    setCurrentCamera(null);

    // Sync Play Tour progress bar if expected scene is in the current tour
    if (selectedPlayTourId) {
      const selectedTour = playTours.find(t => t.id === selectedPlayTourId);
      if (selectedTour && selectedTour.play_tour_scenes) {
        const nextSceneId = scenes[index]?.id;
        const matchingIndex = selectedTour.play_tour_scenes.findIndex((ps: any) => ps.scene_id === nextSceneId);
        if (matchingIndex !== -1) {
          setCurrentPlayTourSceneIndex(matchingIndex);
        }
      }
    }

    // Skip transition check for immediate changes
    if (!immediate && isTransitioning) return;
    if (immediate) {
      // Immediate scene change for navigation - no delay
      setCurrentSceneIndex(index);
      setIsTransitioning(false);
    } else {
      // Normal transition with fade effect
      setIsTransitioning(true);
      setCurrentSceneIndex(index);

      // Reset transition state after a short delay
      setTimeout(() => {
        setIsTransitioning(false);
      }, 300);
    }
  }, [currentSceneIndex, isTransitioning, selectedPlayTourId, playTours, scenes]);

  // Built-in autoplay mechanism (works independently of AutoplayController)
  useEffect(() => {
    if (!isAutoplay || isTransitioning || scenes.length <= 1 || isOverlayModalOpen) {
      if (autoplayTimeoutRef.current) {
        clearTimeout(autoplayTimeoutRef.current);
        autoplayTimeoutRef.current = null;
      }
      return;
    }

    // Clear any existing timeout
    if (autoplayTimeoutRef.current) {
      clearTimeout(autoplayTimeoutRef.current);
    }

    // Use 12 seconds to match the progress bar duration
    const autoplayInterval = 12000; // Fixed 12 seconds to match progress bar    
    autoplayTimeoutRef.current = setTimeout(() => {
      const nextIndex = (currentSceneIndex + 1) % scenes.length;
      handleSceneChange(nextIndex);
    }, autoplayInterval);

    // Cleanup function
    return () => {
      if (autoplayTimeoutRef.current) {
        clearTimeout(autoplayTimeoutRef.current);
        autoplayTimeoutRef.current = null;
      }
    };
  }, [isAutoplay, currentSceneIndex, scenes.length, isTransitioning, isOverlayModalOpen, handleSceneChange]);

  // Calculate scenes to preload (tiles)
  const preloadSceneIds = React.useMemo(() => {
    const ids: string[] = [];

    // 1. Play Tour - Look ahead 2 scenes
    if (isPlayingTour && selectedPlayTourId) {
      const selectedTour = playTours.find(t => t.id === selectedPlayTourId);
      if (selectedTour && selectedTour.play_tour_scenes) {
        // Next scene
        const nextPtScene = selectedTour.play_tour_scenes[currentPlayTourSceneIndex + 1];
        if (nextPtScene) ids.push(nextPtScene.scene_id);

        // Second next scene
        const secondPtScene = selectedTour.play_tour_scenes[currentPlayTourSceneIndex + 2];
        if (secondPtScene) ids.push(secondPtScene.scene_id);
      }
    }
    // 2. Standard sequential
    else if (scenes.length > 0) {
      const nextIndex = (currentSceneIndex + 1) % scenes.length;
      if (scenes[nextIndex]) ids.push(scenes[nextIndex].id);
    }

    return ids;
  }, [isPlayingTour, selectedPlayTourId, currentPlayTourSceneIndex, playTours, currentSceneIndex, scenes]);

  // Optimize image preloading to prevent lag during transitions
  useEffect(() => {
    if (scenes.length === 0) return;

    const preloadImage = (url: string) => {
      const img = new Image();
      img.src = url;
    };

    // 1. Preload Next Scene logic
    let nextSceneToPreload: Scene | null = null;
    let secondNextSceneToPreload: Scene | null = null;

    if (isPlayingTour && selectedPlayTourId) {
      // Play Tour Mode: Look ahead in the Play Tour sequence
      const selectedTour = playTours.find(t => t.id === selectedPlayTourId);
      if (selectedTour && selectedTour.play_tour_scenes) {
        // Next scene
        const nextPtScene = selectedTour.play_tour_scenes[currentPlayTourSceneIndex + 1];
        if (nextPtScene) {
          nextSceneToPreload = scenes.find(s => s.id === nextPtScene.scene_id) || null;
        }

        // Second next scene (for extra smoothness)
        const secondNextPtScene = selectedTour.play_tour_scenes[currentPlayTourSceneIndex + 2];
        if (secondNextPtScene) {
          secondNextSceneToPreload = scenes.find(s => s.id === secondNextPtScene.scene_id) || null;
        }
      }
    } else {
      // Standard Mode: Preload sequential next
      const nextIndex = (currentSceneIndex + 1) % scenes.length;
      nextSceneToPreload = scenes[nextIndex];
    }

    if (nextSceneToPreload?.src_original_url) {
      preloadImage(nextSceneToPreload.src_original_url);
    }

    if (secondNextSceneToPreload?.src_original_url) {
      preloadImage(secondNextSceneToPreload.src_original_url);
    }

  }, [currentSceneIndex, currentPlayTourSceneIndex, isPlayingTour, selectedPlayTourId, playTours, scenes]);

  // Play Tour playback logic
  useEffect(() => {
    if (!isPlayingTour || !selectedPlayTourId) return;

    const selectedTour = playTours.find(t => t.id === selectedPlayTourId);
    if (!selectedTour || !selectedTour.play_tour_scenes || selectedTour.play_tour_scenes.length === 0) {
      setIsPlayingTour(false);
      return;
    }

    if (currentPlayTourSceneIndex >= selectedTour.play_tour_scenes.length) {
      setIsPlayingTour(false);
      // Auto-mute audio when play tour finishes and reset to beginning
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0; // Reset audio to start
        audioRef.current.muted = true;
        setIsAudioMuted(true);
        setIsAudioPlaying(false);
      }
      return;
    }

    const pScene = selectedTour.play_tour_scenes[currentPlayTourSceneIndex];
    const sceneId = pScene.scene_id;
    let animationFrameId: number | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    let isCleanedUp = false;

    // Change to the scene
    const sceneIndex = scenes.findIndex(s => s.id === sceneId);
    if (sceneIndex !== -1 && sceneIndex !== currentSceneIndex) {
      setCurrentSceneIndex(sceneIndex);
    }

    // Reset progress if scene changed or restart triggered
    if (playTourLastSceneIndexRef.current !== currentPlayTourSceneIndex || playTourRestartTriggerRef.current !== restartTrigger) {
      playTourProgressRef.current = 0;
      playTourLastSceneIndexRef.current = currentPlayTourSceneIndex;
      playTourRestartTriggerRef.current = restartTrigger;
    }

    // Wait for scene to load, then animate camera
    timeoutId = setTimeout(() => {
      if (isCleanedUp) return;

      const moveDuration = pScene.move_duration || 5000;
      // Calculate start time based on saved progress to allow resuming
      const startTime = Date.now() - (playTourProgressRef.current * moveDuration);
      const waitDuration = pScene.wait_duration || 1000;

      const easeInOutCubic = (t: number) => {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      };

      const animateCamera = () => {
        if (isCleanedUp) return;

        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / moveDuration, 1);

        // Save progress for resume functionality
        playTourProgressRef.current = progress;

        const easedProgress = easeInOutCubic(progress);

        // Calculate curve offset based on transition direction
        // This creates a smooth arc that peaks at 50% progress and returns to 0 at 100%
        const direction = pScene.transition_direction || 'forward';

        // Use centralized offset calculation for enhanced intensities
        const { yawOffset, pitchOffset, fovOffset } = calculateTransitionOffsets(direction, progress);

        // Calculate directional yaw difference
        let startYawNorm = pScene.start_yaw % 360;
        let endYawNorm = pScene.end_yaw % 360;
        let yawDiff = endYawNorm - startYawNorm;

        // Standardize to -180 to 180 range
        while (yawDiff > 180) yawDiff -= 360;
        while (yawDiff < -180) yawDiff += 360;

        // Force direction if specified
        if (direction === 'left' && yawDiff > 0) yawDiff -= 360;
        if (direction === 'right' && yawDiff < 0) yawDiff += 360;

        const currentYaw = startYawNorm + yawDiff * easedProgress + yawOffset;
        const currentPitch = Math.max(-85, Math.min(85, pScene.start_pitch + (pScene.end_pitch - pScene.start_pitch) * easedProgress + pitchOffset));
        const currentFov = pScene.start_fov + (pScene.end_fov - pScene.start_fov) * easedProgress + fovOffset;

        setCurrentCamera({ yaw: currentYaw, pitch: currentPitch, fov: currentFov });

        if (progress < 1) {
          animationFrameId = requestAnimationFrame(animateCamera);
        } else {
          // Animation complete, wait then move to next scene
          timeoutId = setTimeout(() => {
            if (!isCleanedUp) {
              setCurrentPlayTourSceneIndex(prev => prev + 1);
            }
          }, waitDuration);
        }
      };

      animateCamera();
    }, 500);

    return () => {
      isCleanedUp = true;
      if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
      if (timeoutId !== null) clearTimeout(timeoutId);
    };
  }, [isPlayingTour, selectedPlayTourId, currentPlayTourSceneIndex, playTours, scenes, currentSceneIndex, restartTrigger]);

  const handlePrevScene = useCallback(() => {
    if (isTransitioning) return;
    
    if (selectedPlayTourId && playTourDisplayScenes) {
      // Navigate through Play Tour sequence - direct navigation without scene sync
      if (currentPlayTourSceneIndex > 0) {
        const newIndex = currentPlayTourSceneIndex - 1;
        setCurrentPlayTourSceneIndex(newIndex);
        
        // Mark this as a manual scene change to prevent sync issues
        setIsManualSceneChange(true);
        
        // Interrupt any active playback
        setIsPlayingTour(false);
        setIsAutoplay(false);
        setCurrentCamera(null);
        
        // Find the corresponding scene and change directly
        const selectedTour = playTours.find(t => t.id === selectedPlayTourId);
        const pScene = selectedTour?.play_tour_scenes?.[newIndex];
        if (pScene) {
          const sceneIdx = scenes.findIndex(s => s.id === pScene.scene_id);
          if (sceneIdx !== -1) {
            setIsTransitioning(true);
            setTimeout(() => {
              setCurrentSceneIndex(sceneIdx);
            }, 100);
            setTimeout(() => {
              setIsTransitioning(false);
            }, 300);
          }
        }
      }
    } else {
      // Navigate through base scenes
      const newIndex = (currentSceneIndex - 1 + scenes.length) % scenes.length;
      handleSceneChange(newIndex);
    }
  }, [currentSceneIndex, scenes.length, isTransitioning, handleSceneChange, selectedPlayTourId, playTourDisplayScenes, currentPlayTourSceneIndex, playTours]);

  const handleNextScene = useCallback(() => {
    if (isTransitioning) return;
    
    if (selectedPlayTourId && playTourDisplayScenes) {
      // Navigate through Play Tour sequence - direct navigation without scene sync
      if (currentPlayTourSceneIndex < playTourDisplayScenes.length - 1) {
        const newIndex = currentPlayTourSceneIndex + 1;
        setCurrentPlayTourSceneIndex(newIndex);
        
        // Mark this as a manual scene change to prevent sync issues
        setIsManualSceneChange(true);
        
        // Interrupt any active playback
        setIsPlayingTour(false);
        setIsAutoplay(false);
        setCurrentCamera(null);
        
        // Find the corresponding scene and change directly
        const selectedTour = playTours.find(t => t.id === selectedPlayTourId);
        const pScene = selectedTour?.play_tour_scenes?.[newIndex];
        if (pScene) {
          const sceneIdx = scenes.findIndex(s => s.id === pScene.scene_id);
          if (sceneIdx !== -1) {
            setIsTransitioning(true);
            setTimeout(() => {
              setCurrentSceneIndex(sceneIdx);
            }, 100);
            setTimeout(() => {
              setIsTransitioning(false);
            }, 300);
          }
        }
      }
    } else {
      // Navigate through base scenes
      const newIndex = (currentSceneIndex + 1) % scenes.length;
      handleSceneChange(newIndex);
    }
  }, [currentSceneIndex, scenes.length, isTransitioning, handleSceneChange, selectedPlayTourId, playTourDisplayScenes, currentPlayTourSceneIndex, playTours]);

  const triggerPauseAnimation = useCallback(() => {
    if (pauseTimeoutRef.current) clearTimeout(pauseTimeoutRef.current);
    setShowPauseOverlay(true);
    pauseTimeoutRef.current = setTimeout(() => setShowPauseOverlay(false), 500);
  }, []);

  const toggleAutoplay = useCallback(() => {
    if (playTours.length > 0 && selectedPlayTourId) {
      const nextState = !isPlayingTour;
      if (!nextState) {
        triggerPauseAnimation();
        // Keep current camera position when pausing (don't reset)
      } else {
        setIsAutoplay(false); // Disable normal sequential autoplay
        // Reset to start if we finished the tour previously
        const selectedTour = playTours.find(t => t.id === selectedPlayTourId);
        if (selectedTour && currentPlayTourSceneIndex >= selectedTour.play_tour_scenes.length) {
          setCurrentPlayTourSceneIndex(0);
        }
      }
      setIsPlayingTour(nextState);
      if (nextState) setHasPlayTourStarted(true);
    } else {
      const nextState = !isAutoplay;
      if (!nextState) {
        triggerPauseAnimation();
      }
      setIsAutoplay(nextState);
    }
  }, [isPlayingTour, isAutoplay, playTours, selectedPlayTourId, currentPlayTourSceneIndex, triggerPauseAnimation]);

  const handleViewerSceneChange = useCallback((sceneId: string) => {
    const sceneIndex = scenes.findIndex(s => s.id === sceneId);
    if (sceneIndex !== -1 && sceneIndex !== currentSceneIndex) {
      // This is hotspot navigation, not manual scene change
      setIsManualSceneChange(false);
      setCurrentSceneIndex(sceneIndex);
    }
  }, [scenes, currentSceneIndex]);

  const handleHotspotClick = useCallback((hotspot: Hotspot) => {
    // Pause any active autoplay when user manually interacts with hotspots
    if (isAutoplay) {
      setIsAutoplay(false);
    }
    if (isPlayingTour) {
      setIsPlayingTour(false);
    }

    if (hotspot.kind === 'navigation') {
      // Handle navigation hotspots - check both target_scene_id and payload.targetSceneId
      let targetSceneId = hotspot.target_scene_id;

      // If no direct target_scene_id, check payload
      if (!targetSceneId && hotspot.payload) {
        try {
          const payload = JSON.parse(hotspot.payload);
          targetSceneId = payload.targetSceneId;
        } catch (error) {
          console.error('Error parsing navigation hotspot payload:', error);
        }
      }

      if (targetSceneId) {
        const targetSceneIndex = scenes.findIndex(scene => scene.id === targetSceneId);

        if (targetSceneIndex !== -1) {
          handleSceneChange(targetSceneIndex, true);
        } else {
          console.error('Target scene not found:', targetSceneId);
        }
      } else {
        console.error('No target scene ID found in navigation hotspot');
      }
    } else if (hotspot.kind === 'info') {
      // Handle info hotspots - show information modal/popup
      try {
        const payload = JSON.parse(hotspot.payload || '{}');
        const infoText = payload.infoText || payload.text || 'No information available';

        // Escape HTML to prevent XSS
        const escapeHtml = (text: string) => {
          const div = document.createElement('div');
          div.textContent = text;
          return div.innerHTML;
        };

        // Pause autoplay when modal opens
        const wasAutoplayActive = isAutoplay;
        const wasPlayingTourActive = isPlayingTour;

        if (isAutoplay) setIsAutoplay(false);
        if (isPlayingTour) setIsPlayingTour(false);
        setIsOverlayModalOpen(true);

        // Create and show info modal
        const modal = document.createElement('div');
        modal.className = 'absolute inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4';
        modal.innerHTML = `
          <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
            <div class="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 class="text-xl font-semibold text-gray-900">Information</h3>
              <button class="info-modal-close text-gray-400 hover:text-gray-600 transition-colors cursor-pointer">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>
            <div class="p-6">
              <p class="text-gray-700 leading-relaxed">${escapeHtml(infoText)}</p>
            </div>
          </div>
        `;

        // Add click handlers
        const closeModal = () => {
          if (containerRef.current && containerRef.current.contains(modal)) {
            containerRef.current.removeChild(modal);
          }
          setIsOverlayModalOpen(false);
          // Resume autoplay when modal closes
          if (wasAutoplayActive) {
            setIsAutoplay(true);
          }
          if (wasPlayingTourActive) {
            setIsPlayingTour(true);
          }
        };

        modal.addEventListener('click', (e) => {
          if (e.target === modal) closeModal();
        });

        modal.querySelector('.info-modal-close')?.addEventListener('click', closeModal);

        if (containerRef.current) {
          containerRef.current.appendChild(modal);
        } else {
          document.body.appendChild(modal);
        }

      } catch (error) {
        console.error('Error parsing info hotspot payload:', error);
        alert('Information not available');
      }
    } else if (hotspot.kind === 'link') {
      // Handle link hotspots - open external URL
      try {
        const payload = JSON.parse(hotspot.payload || '{}');
        const url = payload.url || payload.externalUrl;

        if (url) {
          // Ensure URL has protocol
          const fullUrl = url.startsWith('http') ? url : `https://${url}`;
          window.open(fullUrl, '_blank', 'noopener,noreferrer');
        } else {
          alert('Link URL not available');
        }
      } catch (error) {
        console.error('Error parsing link hotspot payload:', error);
        alert('Link not available');
      }
    }
  }, [scenes, handleSceneChange, isAutoplay, setIsAutoplay, isPlayingTour, setIsPlayingTour, setIsOverlayModalOpen]);

  const handleCenterPlayClick = useCallback(() => {
    setShowControls(true);
    if (playTours.length > 0) {
      setCurrentPlayTourSceneIndex(0);
      setIsPlayingTour(true);
      setHasPlayTourStarted(true);

      // Force navigation to the first scene of the play tour
      const selectedTour = playTours.find(t => t.id === selectedPlayTourId);
      if (selectedTour && selectedTour.play_tour_scenes?.length > 0) {
        const firstSceneId = selectedTour.play_tour_scenes[0].scene_id;
        const sceneIndex = scenes.findIndex((s: Scene) => s.id === firstSceneId);
        if (sceneIndex !== -1 && sceneIndex !== currentSceneIndex) {
          handleSceneChange(sceneIndex);
        }
      }
    } else {
      setIsAutoplay(true);
    }
  }, [playTours, selectedPlayTourId, currentSceneIndex, scenes, handleSceneChange]);

  // Effect to log scene changes and hotspot/overlay data
  useEffect(() => {
    if (scenes.length > 0 && (allHotspots.length > 0 || allOverlays.length > 0)) {
      const currentScene = scenes[currentSceneIndex];
      const currentSceneHotspots = allHotspots.filter(h => h.scene_id === currentScene?.id);
      const currentSceneOverlays = allOverlays.filter(o => o.scene_id === currentScene?.id);
    }
  }, [currentSceneIndex, scenes, allHotspots, allOverlays]);

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;

    try {
      if (!isFullscreen) {
        if (containerRef.current.requestFullscreen) {
          await containerRef.current.requestFullscreen();
        } else {
          const element = containerRef.current as HTMLElement & {
            webkitRequestFullscreen?: () => Promise<void>;
            msRequestFullscreen?: () => Promise<void>;
          };
          if (element.webkitRequestFullscreen) {
            await element.webkitRequestFullscreen();
          } else if (element.msRequestFullscreen) {
            await element.msRequestFullscreen();
          }
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else {
          const doc = document as Document & {
            webkitExitFullscreen?: () => Promise<void>;
            msExitFullscreen?: () => Promise<void>;
          };
          if (doc.webkitExitFullscreen) {
            await doc.webkitExitFullscreen();
          } else if (doc.msExitFullscreen) {
            await doc.msExitFullscreen();
          }
        }
      }
    } catch (error) {
      console.error('Fullscreen toggle failed:', error);
    }
  }, [isFullscreen]);

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTransitioning) return;

      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          handlePrevScene();
          break;
        case 'ArrowRight':
          event.preventDefault();
          handleNextScene();
          break;
        case ' ':
          event.preventDefault();
          toggleAutoplay();
          break;
        case 'f':
        case 'F':
          if (event.ctrlKey || event.metaKey) return;
          event.preventDefault();
          toggleFullscreen();
          break;
        case 'Escape':
          if (isFullscreen) {
            event.preventDefault();
            toggleFullscreen();
          }
          break;
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('msfullscreenchange', handleFullscreenChange);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('msfullscreenchange', handleFullscreenChange);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullscreen, isTransitioning, handlePrevScene, handleNextScene, toggleAutoplay, toggleFullscreen]);

  // Initialize background audio
  useEffect(() => {
    // Don't initialize audio until tour is loaded
    if (!currentTour) {
      return;
    }

    // Clean up any existing audio first
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    if (currentTour?.background_audio_url && currentTour.background_audio_url.trim() !== '') {
      const audioUrl = currentTour.background_audio_url;

      // Check if it's a sharing service URL that needs extraction
      const isFileSharing = (audioUrl.includes('jumpshare.com') && audioUrl.includes('/share/')) ||
        (audioUrl.includes('audio.com') && audioUrl.includes('/audio/')) ||
        (audioUrl.includes('soundcloud.com') && audioUrl.includes('/tracks/')) ||
        (audioUrl.includes('dropbox.com') && audioUrl.includes('/s/')) ||
        (audioUrl.includes('drive.google.com') && audioUrl.includes('/file/d/'));

      if (isFileSharing) {
        // Extract audio URL for sharing services
        extractTourAudio(audioUrl);
      } else {
        // Direct audio URL
        loadTourAudio(audioUrl);
      }
    } else {
      // No tour-specific audio, load default audio
      loadDefaultAudio();
    }

    // Cleanup function
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [currentTour?.id, currentTour?.background_audio_url]);

  // Extract audio from sharing services for tour-specific audio
  const extractTourAudio = async (audioUrl: string) => {
    try {
      const response = await fetch(`/api/extract-audio?url=${encodeURIComponent(audioUrl)}`);
      const result = await response.json();

      if (result.success && result.audioUrl) {
        loadTourAudio(result.audioUrl, false);
      } else {
        loadTourAudio(audioUrl, false);
      }
    } catch (error) {
      console.error('[HomeTourViewer Audio] Extraction error:', error);
      loadTourAudio(audioUrl, false);
    }
  };

  // Load tour-specific audio
  const loadTourAudio = (audioUrl: string, isCustomAttempt: boolean = false) => {
    const audio = new Audio(audioUrl);
    audio.loop = true;
    audio.volume = 0.5; // Set default volume to 50%
    audio.muted = true; // Start muted
    audio.crossOrigin = 'anonymous';

    audio.addEventListener('canplay', () => {
      setAudioError(null);
    });

    audio.addEventListener('error', (e) => {
      console.error('[HomeTourViewer Audio] Failed to load audio:', audioUrl, e);
      setAudioError('Failed to load tour background audio');

      // Don't fall back to default audio - just keep the audio controls disabled
      // This matches the TourEditor behavior where custom audio is always respected
    });

    audio.addEventListener('play', () => setIsAudioPlaying(true));
    audio.addEventListener('pause', () => setIsAudioPlaying(false));

    audioRef.current = audio;
    setIsAudioMuted(true);
    setIsAudioPlaying(false);
  };

  // Load default audio function
  const loadDefaultAudio = async () => {
    const defaultAudioUrl = 'https://audio.com/saransh-pachhai/audio/niya-a-bloom-vlog-no-copyright-music';

    try {
      // Extract direct audio URL from audio.com for default audio
      const response = await fetch(`/api/extract-audio?url=${encodeURIComponent(defaultAudioUrl)}`);
      const result = await response.json();

      if (result.success && result.audioUrl) {
        const audio = new Audio(result.audioUrl);
        audio.loop = true;
        audio.volume = 0.3; // Lower volume for default audio
        audio.muted = true;
        audio.crossOrigin = 'anonymous';

        audio.addEventListener('play', () => setIsAudioPlaying(true));
        audio.addEventListener('pause', () => setIsAudioPlaying(false));

        audioRef.current = audio;
        setIsAudioMuted(true);
        setIsAudioPlaying(false);
      } else {
        setIsAudioMuted(true);
        setIsAudioPlaying(false);
      }
    } catch (error) {
      setIsAudioMuted(true);
      setIsAudioPlaying(false);
    }
  };

  // Audio control functions - Single toggle button (works even without audio)
  const toggleAudio = useCallback(() => {

    if (audioRef.current) {
      // If we have actual audio
      if (isAudioPlaying && !isAudioMuted) {
        // If playing and not muted, pause and mute
        audioRef.current.pause();
        audioRef.current.muted = true;
        setIsAudioMuted(true);
        setIsAudioPlaying(false);
      } else {
        // If paused or muted, play and unmute
        audioRef.current.muted = false;
        setIsAudioMuted(false);
        audioRef.current.play().then(() => {
          setIsAudioPlaying(true);
        }).catch(err => {
          setAudioError('Failed to play audio. User interaction may be required.');
          setIsAudioPlaying(false);
          setIsAudioMuted(true);
        });
      }
    } else {
      // No actual audio, just toggle the visual state for demo
      if (isAudioPlaying) {
        setIsAudioPlaying(false);
        setIsAudioMuted(true);
      } else {
        setIsAudioPlaying(true);
        setIsAudioMuted(false);
      }
    }
  }, [isAudioPlaying, isAudioMuted]);

  // Share functionality
  const handleShare = useCallback(async () => {
    // Always show modal for consistent experience
    setShowShareModal(true);
  }, []);

  if (loading) {
    return (
      <div className={`relative bg-gray-900 rounded-2xl overflow-hidden ${className}`}>
        <div className="aspect-video flex items-center justify-center">
          <div className="text-white text-lg">Loading virtual tour...</div>
        </div>
      </div>
    );
  }

  // Show static preview when not authenticated - just the basic image with title
  if (error === 'not_authenticated') {
    return (
      <div
        ref={containerRef}
        className={`relative bg-gray-900 rounded-2xl overflow-hidden ${className}`}
      >
        <div className="aspect-video relative">
          <img
            src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800"
            alt="Virtual Tour Preview"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />

          {/* Static Tour Title Overlay */}
          <div className="absolute top-4 left-4 z-10">
            <h3 className="text-white text-2xl font-bold mb-2 drop-shadow-lg">
              Tons of Natural Light
            </h3>
            <p className="text-white/90 text-sm drop-shadow-lg max-w-md font-semibold">
              Unique throughout with expansive windows, high ceilings, floating stairs and tons of natural light
            </p>
          </div>

          {/* 360° Experience badge - INSIDE image when not logged in */}
          <div className="absolute bottom-4 right-4 bg-yellow-400 text-gray-900 px-4 py-2 rounded-lg font-bold shadow-lg">
            <span className="text-xl">360°</span> Experience
          </div>
        </div>
      </div>
    );
  }

  // Show error message for other errors
  if (error && error !== 'not_authenticated') {
    return (
      <div className={`relative bg-gray-900 rounded-2xl overflow-hidden ${className}`}>
        <div className="aspect-video flex items-center justify-center">
          <div className="text-white text-lg">{error}</div>
        </div>
      </div>
    );
  }

  // Show message when no tours available
  if (!currentTour || scenes.length === 0) {
    return (
      <div className={`relative bg-gray-900 rounded-2xl overflow-hidden ${className}`}>
        <div className="aspect-video flex items-center justify-center">
          <div className="text-white text-lg">No virtual tours available</div>
        </div>
      </div>
    );
  }

  const currentScene = scenes[currentSceneIndex];
  const currentSceneHotspots = allHotspots.filter(hotspot => hotspot.scene_id === currentScene?.id);
  const currentSceneOverlays = allOverlays.filter(overlay => overlay.scene_id === currentScene?.id);

  return (
    <div
      ref={containerRef}
      className={`relative bg-gray-900 rounded-2xl overflow-hidden shadow-2xl ${className} ${isFullscreen ? 'fixed inset-0 z-50 rounded-none' : ''}`}
    >
      {/* Tour Viewer */}
      <div className={`${isFullscreen ? 'h-screen' : 'aspect-video'} relative`}>
        {currentTour && currentScene && (
          <CubeMapViewer
            tour={currentTour}
            currentScene={currentScene}
            scenes={scenes}
            onSceneChange={handleViewerSceneChange}
            onHotspotClick={handleHotspotClick}
            hotspots={showControls ? currentSceneHotspots : []}
            overlays={showControls ? currentSceneOverlays : []}
            autoRotate={isAutoplay}
            forcedCameraPosition={currentCamera}
            isPlaybackMode={isPlayingTour}
            preloadSceneIds={preloadSceneIds}
            isManualSceneChange={isManualSceneChange}
            onOverlayPause={() => {
              if (isPlayingTour) {
                setIsPlayingTour(false);
                // Keep current camera position when pausing
              } else {
                setIsAutoplay(false);
              }
              triggerPauseAnimation();
            }}
          />
        )}

        {/* Transient Pause Icon Overlay */}
        <div
          className={`absolute inset-0 flex items-center justify-center pointer-events-none z-40 transition-opacity duration-300 ${showPauseOverlay ? 'opacity-100' : 'opacity-0'}`}
        >
          <div className="bg-black/30 backdrop-blur-sm rounded-full p-8 flex items-center justify-center border border-white/20">
            <div className="flex gap-2">
              <div className="w-4 h-12 bg-white rounded-sm shadow-xl"></div>
              <div className="w-4 h-12 bg-white rounded-sm shadow-xl"></div>
            </div>
          </div>
        </div>

        {/* Play Tour Title/Description Overlay */}
        <PlayTourOverlay
          title={playTourDisplayScenes ? playTourDisplayScenes[currentPlayTourSceneIndex]?.title : undefined}
          description={playTourDisplayScenes ? playTourDisplayScenes[currentPlayTourSceneIndex]?.description : undefined}
          isVisible={!!(hasPlayTourStarted && playTourDisplayScenes && playTourDisplayScenes[currentPlayTourSceneIndex])}
          variant={isFullscreen ? 'default' : 'compact'}
        />

        {/* Autoplay Controller - Disabled for now - using built-in autoplay instead */}

        {!showControls && (
          <div className="absolute top-4 left-4 z-30">
            <h3 className="text-white text-2xl font-bold mb-2 drop-shadow-lg">
              {currentTour?.name || 'Virtual Tour'}
            </h3>
            {/* <p className="text-white/90 text-sm drop-shadow-lg">
              {scenes.length} scene{scenes.length !== 1 ? 's' : ''} • Public Tour
            </p> */}
            <p className="text-white/90 text-sm drop-shadow-lg">
              Public Tour
            </p>
          </div>
        )}

        {/* 360° Experience Badge - Show when controls are not active */}
        {!showControls && (
          <div className="absolute bottom-4 right-4 bg-yellow-400 text-gray-900 px-4 py-2 rounded-lg font-bold shadow-lg z-20">
            <span className="text-xl">360°</span> Experience
          </div>
        )}

        {/* TheNimto Logo - Only visible after controls are activated */}
        {showControls && (
          <div className="absolute bottom-1 right-4 z-30">
            <img
              src="/TheNimto.png"
              alt="TheNimto"
              className="h-30 w-auto opacity-80 hover:opacity-100 transition-opacity duration-200"
            />
          </div>
        )}

        {/* Top Right Controls - Only show when controls are active */}
        {showControls && (
          <div className="absolute top-4 right-4 z-30 flex gap-2">
            {/* Share Button */}
            <button
              onClick={handleShare}
              className="bg-black/50 backdrop-blur-sm text-white p-2 rounded-full hover:bg-black/70 transition-colors cursor-pointer"
              title="Share Tour"
            >
              <Share2 className="w-5 h-5" />
            </button>

            {/* Audio Control - Single toggle button */}
            <button
              onClick={toggleAudio}
              className={`backdrop-blur-sm text-white p-2 rounded-full transition-colors cursor-pointer ${isAudioPlaying
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-black/50 hover:bg-black/70'
                }`}
              title={isAudioPlaying ? 'Mute Audio' : 'Play Audio'}
            >
              {isAudioPlaying ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </button>

            {/* Fullscreen Button */}
            <button
              onClick={toggleFullscreen}
              className="bg-black/50 backdrop-blur-sm text-white p-2 rounded-full hover:bg-black/70 transition-colors cursor-pointer"
              title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>
          </div>
        )}

        {!showControls && (
          <div className="absolute inset-0 flex items-center justify-center z-20">
            <button
              onClick={handleCenterPlayClick}
              className="bg-white/95 backdrop-blur-sm rounded-full p-6 hover:bg-white transition-all duration-300 shadow-2xl hover:scale-105 group cursor-pointer"
            >
              <Play className="w-12 h-12 text-gray-800 ml-1 group-hover:text-black transition-colors" />
            </button>
          </div>
        )}

        {/* Controls - Only show after center play is clicked */}
        {showControls && (
          <>
            <div className="absolute bottom-6 left-6 z-50">
              <div className="flex items-center gap-4">
                {/* Navigation Controls */}
                {scenes.length > 1 && (
                  <div className="flex items-center bg-white/95 backdrop-blur-sm rounded-full px-1 py-1 shadow-lg border border-white/20">
                    <button
                      onClick={handlePrevScene}
                      disabled={isTransitioning}
                      className="relative p-2.5 hover:bg-gray-100 rounded-full transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer group"
                    >
                      <ChevronLeft className="w-4 h-4 text-gray-700 group-hover:text-gray-900 transition-colors" />
                      {/* Previous Tooltip */}
                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none">
                        <div className="bg-black/80 backdrop-blur-sm text-white text-sm px-3 py-2 rounded-lg whitespace-nowrap">
                          Previous
                        </div>
                        {/* Arrow pointing down */}
                        <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-2 border-r-2 border-t-4 border-transparent border-t-black/80"></div>
                      </div>
                    </button>
                    <button
                      onClick={toggleAutoplay}
                      className="relative p-2.5 hover:bg-gray-100 rounded-full transition-all duration-200 cursor-pointer group"
                    >
                      {isPlayingTour || isAutoplay ? (
                        <div className="w-4 h-4 flex items-center justify-center">
                          <div className="w-1 h-3 bg-red-500 rounded-sm mr-0.5 group-hover:bg-red-600 transition-colors"></div>
                          <div className="w-1 h-3 bg-red-500 rounded-sm group-hover:bg-red-600 transition-colors"></div>
                        </div>
                      ) : (
                        <Play className="w-4 h-4 text-red-500 ml-0.5 group-hover:text-red-600 transition-colors" />
                      )}
                      {/* Play/Pause Tooltip */}
                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none">
                        <div className="bg-black/80 backdrop-blur-sm text-white text-sm px-3 py-2 rounded-lg whitespace-nowrap">
                          {isPlayingTour || isAutoplay ? 'Pause' : 'Play'}
                        </div>
                        {/* Arrow pointing down */}
                        <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-2 border-r-2 border-t-4 border-transparent border-t-black/80"></div>
                      </div>
                    </button>
                    <button
                      onClick={handleNextScene}
                      disabled={isTransitioning}
                      className="relative p-2.5 hover:bg-gray-100 rounded-full transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer group"
                    >
                      <ChevronRight className="w-4 h-4 text-gray-700 group-hover:text-gray-900 transition-colors" />
                      {/* Next Tooltip */}
                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none">
                        <div className="bg-black/80 backdrop-blur-sm text-white text-sm px-3 py-2 rounded-lg whitespace-nowrap">
                          Next
                        </div>
                        {/* Arrow pointing down */}
                        <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-2 border-r-2 border-t-4 border-transparent border-t-black/80"></div>
                      </div>
                    </button>
                  </div>
                )}

                {/* Walking Man Icon - Shows when tour is paused (like Matterport) */}
                {!isAutoplay && !isPlayingTour && !isTransitioning && (
                  <div className="bg-white rounded-full p-2.5 flex items-center justify-center shadow-lg border border-gray-200 transition-all duration-500">
                    <Icon
                      icon="mdi:walk"
                      width="20"
                      height="20"
                      className="text-red-500"
                    />
                  </div>
                )}
              </div>
            </div>

            <ProgressBar
              scenes={selectedPlayTourId && playTourDisplayScenes ? playTourDisplayScenes : scenes}
              currentSceneIndex={selectedPlayTourId ? currentPlayTourSceneIndex : currentSceneIndex}
              isAutoplay={isAutoplay || isPlayingTour}
              isTransitioning={isTransitioning}
              onSceneChange={selectedPlayTourId ? (idx) => {
                if (idx === currentPlayTourSceneIndex) {
                  setRestartTrigger(prev => prev + 1);
                  return;
                }
                setCurrentPlayTourSceneIndex(idx);
                if (!isPlayingTour) {
                  const selectedTour = playTours.find(t => t.id === selectedPlayTourId);
                  const pScene = selectedTour?.play_tour_scenes?.[idx];
                  if (pScene) {
                    const sceneIdx = scenes.findIndex(s => s.id === pScene.scene_id);
                    if (sceneIdx !== -1) {
                      // Use handleSceneChange to properly set manual scene change flag
                      handleSceneChange(sceneIdx);
                    }
                  }
                }
              } : handleSceneChange}
              isOverlayModalOpen={isOverlayModalOpen}
              segmentDuration={selectedPlayTourId && currentPlayTourScene
                ? (currentPlayTourScene.move_duration + (currentPlayTourScene.wait_duration || 0))
                : (currentTour?.auto_change_interval || 12000)}
              restartTrigger={restartTrigger}
            />
          </>
        )}
      </div>

      {/* Share Modal */}
      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        tourName={currentTour?.name || 'Virtual Tour'}
        tourUrl={currentTour ? `${window.location.origin}/tours/${currentTour.id}` : window.location.href}
      />
    </div>
  );
};

export default HomeTourViewer;