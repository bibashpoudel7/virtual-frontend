'use client';
// frontend/components/viewer/TourEditor.tsx
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Play } from 'lucide-react';
import CubeMapViewer from './CubeMapViewer';
import OverlayEditor from '../overlays/OverlayEditor';
import { Tour, Scene, Hotspot, Overlay, PlayTour } from '@/types/tour';
import PlayTourEditor from '../tours/PlayTourEditor';

const R2_PUBLIC_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || 'https://test.thenimto.com';
import { HotspotsAPI } from '@/lib/api/hotspots';
import { tourService } from '@/services/tourService';

// Simple debounce utility with cancel method
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) & { cancel: () => void } {
  let timeout: NodeJS.Timeout;

  const debounced = (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };

  debounced.cancel = () => {
    clearTimeout(timeout);
  };

  return debounced;
}

// Progress bar component for fullscreen mode
const ProgressBar = ({
  scenes,
  currentSceneIndex,
  isAutoplay,
  isTransitioning,
  onSceneChange,
  isOverlayModalOpen = false,
  segmentDuration = 12000
}: {
  scenes: any[];
  currentSceneIndex: number;
  isAutoplay: boolean;
  isTransitioning: boolean;
  onSceneChange: (index: number) => void;
  isOverlayModalOpen?: boolean;
  segmentDuration?: number;
}) => {
  const progressBarRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | undefined>(undefined);
  const startTimeRef = useRef<number>(0);
  const pausedProgressRef = useRef<number>(0);
  const lastSceneIndexRef = useRef<number>(currentSceneIndex);

  useEffect(() => {
    if (lastSceneIndexRef.current !== currentSceneIndex) {
      pausedProgressRef.current = 0;
      lastSceneIndexRef.current = currentSceneIndex;
    }

    if (isTransitioning || scenes.length <= 1) {
      return;
    }

    if (isAutoplay && !isOverlayModalOpen) {
      startTimeRef.current = Date.now() - (pausedProgressRef.current * segmentDuration);

      const updateProgress = () => {
        if (!progressBarRef.current || isTransitioning) return;

        const elapsed = Date.now() - startTimeRef.current;
        const progress = Math.min(1, elapsed / segmentDuration);

        pausedProgressRef.current = progress;

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
  }, [isAutoplay, isTransitioning, currentSceneIndex, scenes.length, isOverlayModalOpen, segmentDuration]);

  if (scenes.length <= 1) return null;

  return (
    <div className="absolute bottom-0 left-0 right-0 p-4" ref={progressBarRef}>
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
              <div className="w-full h-1 bg-white/40 rounded-full overflow-hidden">
                <div
                  className={`progress-fill h-full rounded-full ${isCompleted || isCurrent
                    ? 'bg-red-500'
                    : 'bg-white/40'
                    }`}
                  style={{
                    width: isCompleted ? '100%' : '0%',
                    backgroundColor: isCompleted || isCurrent ? '#ef4444' : undefined
                  }}
                />
              </div>

              <button
                onClick={() => onSceneChange(index)}
                disabled={isTransitioning}
                className="absolute inset-0 -top-2 -bottom-2 cursor-pointer disabled:cursor-not-allowed group"
                title={scene.name || `Scene ${index + 1}`}
              >
                <div className="absolute inset-0 top-2 bottom-2 bg-red-400/30 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

                <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all duration-300 delay-150 pointer-events-none z-50">
                  <div className="bg-black/90 backdrop-blur-sm rounded-lg overflow-hidden shadow-xl border border-white/20">
                    <div className="w-32 h-20 bg-gray-800 relative overflow-hidden">
                      {scene.src_original_url ? (
                        <img
                          src={scene.src_original_url}
                          alt={scene.name || `Scene ${index + 1}`}
                          className="w-full h-full object-cover"
                          onError={(e) => {
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
                      <div className="absolute top-1 right-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
                        {index + 1}
                      </div>
                    </div>
                    <div className="px-3 py-2 text-white text-xs font-medium">
                      {scene.name || `Scene ${index + 1}`}
                    </div>
                  </div>
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-6 border-transparent border-t-black/90"></div>
                </div>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface TourEditorProps {
  tour: Tour;
  scenes: Scene[];
  onTourUpdate?: (updatedTour: Tour) => void;
}

export default function TourEditor({ tour, scenes, onTourUpdate }: TourEditorProps) {
  const [currentSceneId, setCurrentSceneId] = useState(scenes[0]?.id || '');
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false); // Disable edit mode by default
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [pendingSaves, setPendingSaves] = useState<Set<string>>(new Set()); // Track hotspots with pending saves
  const [showHotspotDialog, setShowHotspotDialog] = useState(false);
  const [showOverlayDialog, setShowOverlayDialog] = useState(false);
  const [pendingHotspot, setPendingHotspot] = useState<{ yaw: number; pitch: number } | null>(null);
  const [pendingOverlay, setPendingOverlay] = useState<{ yaw: number; pitch: number } | null>(null);
  const [selectedTargetScene, setSelectedTargetScene] = useState<string>('');
  const [transitionDirection, setTransitionDirection] = useState<string>('forward'); // Add default direction
  const [isLoading, setIsLoading] = useState(false);
  const [deletingHotspotId, setDeletingHotspotId] = useState<string | null>(null);
  const [deletingOverlayId, setDeletingOverlayId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editPanel, setEditPanel] = useState<'hotspots' | 'overlays' | 'playTours' | null>('hotspots');
  const [currentCamera, setCurrentCamera] = useState({ yaw: 0, pitch: 0, fov: 75 });
  const [previewCameraPosition, setPreviewCameraPosition] = useState<{ yaw: number; pitch: number; fov: number } | null>(null);
  const cameraControlRef = useRef<{ setCamera: (yaw: number, pitch: number, fov: number) => void } | null>(null);
  const [hotspotType, setHotspotType] = useState<'navigation' | 'info' | 'link'>('navigation');
  const [infoText, setInfoText] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isFullscreen,] = useState(false);
  const [isViewerFullscreen, setIsViewerFullscreen] = useState(false);
  const [preloadedScenes, setPreloadedScenes] = useState<Set<string>>(new Set());
  const [showPauseOverlay, setShowPauseOverlay] = useState(false);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);

  // Audio controls state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoplayTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
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

  // Hotspot editing state
  const [editingHotspot, setEditingHotspot] = useState<string | null>(null);
  const [editingPitch, setEditingPitch] = useState<string>('');
  const [editingYaw, setEditingYaw] = useState<string>('');

  // Play Tour state
  const [playTours, setPlayTours] = useState<PlayTour[]>([]);
  const [selectedPlayTourId, setSelectedPlayTourId] = useState<string | null>(null);
  const [currentPlayTourSceneIndex, setCurrentPlayTourSceneIndex] = useState(0);
  const [isPlayingTour, setIsPlayingTour] = useState(false);

  const pauseTimeoutRef = useRef<NodeJS.Timeout | null>(null);


  const playTourDisplayScenes = useMemo(() => {
    if (!selectedPlayTourId) return null;
    const selectedTour = playTours.find(t => t.id === selectedPlayTourId);
    if (!selectedTour || !selectedTour.play_tour_scenes) return null;

    return selectedTour.play_tour_scenes.map((ps: any, idx: number) => {
      const scene = scenes.find(s => s.id === ps.scene_id);
      // Construct a compatible scene object for the ProgressBar
      if (!scene) return null;

      return {
        ...scene,
        id: `${ps.id}-${idx}`, // Unique ID for the progress bar key
        originalId: scene.id,
        name: scene.name || 'Tour Step',
        move_duration: ps.move_duration,
        wait_duration: ps.wait_duration
      };
    }).filter(Boolean) as (Scene & { originalId: string; move_duration?: number; wait_duration?: number })[];
  }, [selectedPlayTourId, playTours, scenes]);

  const currentScene = scenes.find(s => s.id === currentSceneId) || scenes[0];

  // Sync currentSceneIndex when currentSceneId changes
  useEffect(() => {
    const newIndex = scenes.findIndex(s => s.id === currentSceneId);
    if (newIndex !== -1 && newIndex !== currentSceneIndex) {
      setCurrentSceneIndex(newIndex);
    }
  }, [currentSceneId, scenes, currentSceneIndex]);

  // Memoize filtered hotspots and overlays to prevent re-renders in CubeMapViewer
  // causing performance issues during playback animation
  const currentSceneHotspots = useMemo(() =>
    hotspots.filter(h => h.scene_id === currentSceneId),
    [hotspots, currentSceneId]);

  const currentSceneOverlays = useMemo(() =>
    overlays.filter(o => o.scene_id === currentSceneId),
    [overlays, currentSceneId]);

  // Load hotspots and overlays for all scenes in the tour
  useEffect(() => {
    const loadAllHotspotsAndOverlays = async () => {
      if (!tour.id) return;

      try {
        // Load all hotspots for the entire tour
        const allTourHotspots = await HotspotsAPI.getTourHotspots(tour.id);
        setHotspots(allTourHotspots);

        // Load overlays for all scenes
        const allOverlays: Overlay[] = [];
        for (const scene of scenes) {
          try {
            const sceneOverlays = await tourService.listOverlays(scene.id);
            allOverlays.push(...sceneOverlays);
          } catch (err) {
            console.warn(`Failed to load overlays for scene ${scene.id}:`, err);
          }
        }
        setOverlays(allOverlays);

        setError(null);
      } catch (err) {
        console.error('Failed to load hotspots and overlays:', err);
        setError('Failed to load hotspots and overlays');
        setHotspots([]); // Set empty array on error
        setOverlays([]);
      }
    };

    loadAllHotspotsAndOverlays();
  }, [tour.id, scenes]); // Depend on scenes array to reload when scenes change

  // Load Play Tours for this tour
  useEffect(() => {
    const loadPlayTours = async () => {
      if (!tour.id) return;

      try {
        const tours = await tourService.listPlayTours(tour.id);
        setPlayTours(tours);
        // Auto-select the first play tour if available
        if (tours && tours.length > 0) {
          setSelectedPlayTourId(tours[0].id);
        }
      } catch (err) {
        console.error('Failed to load play tours:', err);
      }
    };

    loadPlayTours();
  }, [tour.id]);

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
      return;
    }

    const pScene = selectedTour.play_tour_scenes[currentPlayTourSceneIndex];
    const sceneId = pScene.scene_id;
    let animationFrameId: number | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    let isCleanedUp = false;

    // Change to the scene
    const sceneIndex = scenes.findIndex(s => s.id === sceneId);
    if (sceneIndex !== -1 && (sceneIndex !== currentSceneIndex || currentSceneId !== sceneId)) {
      setCurrentSceneId(sceneId);
      setCurrentSceneIndex(sceneIndex);
    }

    // Wait for scene to load, then animate camera
    timeoutId = setTimeout(() => {
      if (isCleanedUp) return;

      const startTime = Date.now();
      const moveDuration = pScene.move_duration || 5000;
      const waitDuration = pScene.wait_duration || 1000;

      const easeInOutCubic = (t: number) => {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      };

      const animateCamera = () => {
        if (isCleanedUp) return;

        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / moveDuration, 1);
        const easedProgress = easeInOutCubic(progress);

        // Calculate curve offset based on transition direction
        const direction = pScene.transition_direction || 'forward';
        let yawOffset = 0;
        let pitchOffset = 0;
        let fovOffset = 0;

        if (direction !== 'forward') {
          const curveProgress = Math.sin(progress * Math.PI);
          if (direction === 'left') yawOffset = -30 * curveProgress;
          else if (direction === 'right') yawOffset = 30 * curveProgress;
          else if (direction === 'up') pitchOffset = 20 * curveProgress;
          else if (direction === 'down') pitchOffset = -20 * curveProgress;
          else if (direction === 'backward') {
            fovOffset = 40 * curveProgress;
            yawOffset = 180 * curveProgress;
          }
        }

        const currentYaw = pScene.start_yaw + (pScene.end_yaw - pScene.start_yaw) * easedProgress + yawOffset;
        const currentPitch = pScene.start_pitch + (pScene.end_pitch - pScene.start_pitch) * easedProgress + pitchOffset;
        const currentFov = pScene.start_fov + (pScene.end_fov - pScene.start_fov) * easedProgress + fovOffset;

        // Use direct camera control for smooth animation (bypasses React state)
        if (cameraControlRef.current) {
          cameraControlRef.current.setCamera(currentYaw, currentPitch, currentFov);
        } else {
          // Fallback to state (only if ref not available)
          setCurrentCamera({ yaw: currentYaw, pitch: currentPitch, fov: currentFov });
        }

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
  }, [isPlayingTour, selectedPlayTourId, currentPlayTourSceneIndex, playTours, scenes, currentSceneIndex, currentSceneId]);

  const handleSceneChange = useCallback((sceneId: string) => {
    if (sceneId === currentSceneId) return; // Don't transition to the same scene

    setIsTransitioning(true);

    // Update both scene ID and index
    setCurrentSceneId(sceneId);
    const newIndex = scenes.findIndex(s => s.id === sceneId);
    if (newIndex !== -1) {
      setCurrentSceneIndex(newIndex);
    }

    // Sync Play Tour progress bar if expected scene is in the current tour
    if (selectedPlayTourId) {
      const selectedTour = playTours.find(t => t.id === selectedPlayTourId);
      if (selectedTour && selectedTour.play_tour_scenes) {
        const matchingIndex = selectedTour.play_tour_scenes.findIndex((ps: any) => ps.scene_id === sceneId);
        if (matchingIndex !== -1) {
          setCurrentPlayTourSceneIndex(matchingIndex);
        }
      }
    }

    // Reset transition state after scene has time to load
    setTimeout(() => {
      setIsTransitioning(false);
    }, 1500);
  }, [currentSceneId, scenes, selectedPlayTourId, playTours]);

  const handleOverlayPause = useCallback(() => {
    if (isPlayingTour) setIsPlayingTour(false);
    if (isAutoplay) setIsAutoplay(false);
    triggerPauseAnimation();
  }, [isPlayingTour, isAutoplay]);

  // Preview a scene with specific camera position (for Play Tour editor)
  const handlePreviewScene = useCallback((sceneId: string, yaw: number, pitch: number, fov: number) => {
    // Change to the scene if different
    if (sceneId !== currentSceneId) {
      handleSceneChange(sceneId);
      // Wait for scene to load then set camera position
      setTimeout(() => {
        setPreviewCameraPosition({ yaw, pitch, fov });
      }, 500);
    } else {
      // Same scene, set camera immediately
      setPreviewCameraPosition({ yaw, pitch, fov });
    }
  }, [currentSceneId, handleSceneChange]);

  // Play camera animation from start to end position (for Play Tour editor)
  const animationRef = useRef<number | null>(null);
  const handlePlaySceneAnimation = useCallback((
    sceneId: string,
    startYaw: number, startPitch: number, startFov: number,
    endYaw: number, endPitch: number, endFov: number,
    duration: number,
    transitionDirection: string = 'forward'
  ) => {
    // Cancel any existing animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    const startAnimation = () => {
      const startTime = Date.now();

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Smooth easing
        const easeInOutCubic = (t: number) =>
          t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        const easedProgress = easeInOutCubic(progress);

        // Curve effect - camera arcs during movement (sine wave peaks at middle)
        const curveAmount = Math.sin(progress * Math.PI);

        // Calculate curve offsets based on direction
        let yawCurve = 0;
        let pitchCurve = 0;
        let fovCurve = 0;

        switch (transitionDirection) {
          case 'left':
            yawCurve = -30 * curveAmount;
            break;
          case 'right':
            yawCurve = 30 * curveAmount;
            break;
          case 'up':
            pitchCurve = 20 * curveAmount;
            break;
          case 'down':
            pitchCurve = -20 * curveAmount;
            break;
          case 'backward':
            fovCurve = 40 * curveAmount;
            break;
          default: // forward
            fovCurve = -15 * curveAmount;
            break;
        }

        // Interpolate camera position with curve
        const currentYaw = startYaw + (endYaw - startYaw) * easedProgress + yawCurve;
        const currentPitch = Math.max(-85, Math.min(85, startPitch + (endPitch - startPitch) * easedProgress + pitchCurve));
        const currentFov = startFov + (endFov - startFov) * easedProgress + fovCurve;

        // Use direct camera control (bypasses React state for smooth animation)
        if (cameraControlRef.current) {
          cameraControlRef.current.setCamera(currentYaw, currentPitch, currentFov);
        }

        if (progress < 1) {
          animationRef.current = requestAnimationFrame(animate);
        } else {
          animationRef.current = null;
        }
      };

      animationRef.current = requestAnimationFrame(animate);
    };

    // Change to the scene if different, then start animation
    if (sceneId !== currentSceneId) {
      handleSceneChange(sceneId);
      // Wait for scene to load then start animation
      setTimeout(() => {
        if (cameraControlRef.current) {
          cameraControlRef.current.setCamera(startYaw, startPitch, startFov);
        }
        setTimeout(startAnimation, 100);
      }, 600);
    } else {
      // Same scene, set start position and begin animation
      if (cameraControlRef.current) {
        cameraControlRef.current.setCamera(startYaw, startPitch, startFov);
      }
      setTimeout(startAnimation, 100);
    }
  }, [currentSceneId, handleSceneChange]);

  const handleSceneChangeByIndex = useCallback((index: number) => {
    if (index === currentSceneIndex || isTransitioning) return;

    setIsTransitioning(true);

    // Immediate scene change with enhanced loading feedback
    setTimeout(() => {
      setCurrentSceneIndex(index);
      setCurrentSceneId(scenes[index]?.id || '');
    }, 50);

    // Reset transition state after scene loads
    setTimeout(() => {
      setIsTransitioning(false);
    }, 1200);
  }, [currentSceneIndex, isTransitioning, scenes]);

  const handlePrevScene = useCallback(() => {
    if (currentSceneIndex > 0) {
      handleSceneChangeByIndex(currentSceneIndex - 1);
    }
  }, [currentSceneIndex, handleSceneChangeByIndex]);

  const handleNextScene = useCallback(() => {
    if (currentSceneIndex < scenes.length - 1) {
      handleSceneChangeByIndex(currentSceneIndex + 1);
    }
  }, [currentSceneIndex, scenes.length, handleSceneChangeByIndex]);

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
        setIsInfoModalOpen(true);

        // Create and show info modal
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4';
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
          setIsInfoModalOpen(false);
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
  }, [handleSceneChange, isAutoplay, isPlayingTour, setIsPlayingTour, setIsInfoModalOpen, containerRef]);

  const handleHotspotCreate = useCallback((yaw: number, pitch: number) => {
    if (editPanel === 'hotspots') {
      setPendingHotspot({ yaw, pitch });
      setShowHotspotDialog(true);
    } else if (editPanel === 'overlays') {
      setPendingOverlay({ yaw, pitch });
      setShowOverlayDialog(true);
    }
  }, [editPanel]);

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
        hotspotData.transition_direction = transitionDirection; // Add direction to data
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

  // Immediate visual update function (no API call)
  const updateHotspotVisually = useCallback((updatedHotspot: Hotspot) => {
    if (!updatedHotspot.id) return;

    // Update local state immediately for visual feedback
    setHotspots(prevHotspots =>
      prevHotspots.map(h =>
        h.id === updatedHotspot.id
          ? { ...h, yaw: updatedHotspot.yaw, pitch: updatedHotspot.pitch }
          : h
      )
    );
  }, []);

  // API update function (called after debounce)
  const updateHotspotAPI = useCallback(async (updatedHotspot: Hotspot) => {
    if (!updatedHotspot.id) return;

    try {
      // Add to pending saves
      setPendingSaves(prev => new Set(prev).add(updatedHotspot.id!));

      // Send the full hotspot data with updated position
      const updateData = {
        id: updatedHotspot.id,
        tour_id: tour.id,
        scene_id: currentSceneId,
        target_scene_id: updatedHotspot.target_scene_id,
        kind: updatedHotspot.kind,
        yaw: updatedHotspot.yaw,
        pitch: updatedHotspot.pitch,
        payload: typeof updatedHotspot.payload === 'object'
          ? JSON.stringify(updatedHotspot.payload)
          : updatedHotspot.payload
      };

      await HotspotsAPI.updateHotspot(
        tour.id,
        currentSceneId,
        updatedHotspot.id,
        updateData as any
      );

      setError(null);
    } catch (err) {
      console.error('Failed to update hotspot:', err);
      setError('Failed to update hotspot position');

    } finally {
      // Remove from pending saves
      setPendingSaves(prev => {
        const newSet = new Set(prev);
        newSet.delete(updatedHotspot.id!);
        return newSet;
      });
    }
  }, [tour.id, currentSceneId]);

  // Combined update function that handles both immediate visual update and debounced API call
  const updateHotspot = useCallback((updatedHotspot: Hotspot) => {
    // Immediate visual update for smooth dragging
    updateHotspotVisually(updatedHotspot);
  }, [updateHotspotVisually]);

  // Function to update hotspot coordinates from manual input
  const updateHotspotCoordinates = useCallback((hotspotId: string, yaw: number, pitch: number) => {
    const hotspot = hotspots.find(h => h.id === hotspotId);
    if (!hotspot) return;

    // Create updated hotspot with new coordinates
    const updatedHotspot = {
      ...hotspot,
      yaw: yaw,
      pitch: pitch
    };

    // Use the existing updateHotspot function for real-time updates
    updateHotspot(updatedHotspot);
  }, [hotspots, updateHotspot]);

  const deleteHotspot = useCallback(async (hotspotId: string) => {
    if (!hotspotId) return;

    try {
      setDeletingHotspotId(hotspotId);
      await HotspotsAPI.deleteHotspot(tour.id, currentSceneId, hotspotId);
      setHotspots(hotspots.filter(h => h.id !== hotspotId));
      setError(null);
    } catch (err) {
      console.error('Failed to delete hotspot:', err);
      setError('Failed to delete hotspot');
    } finally {
      setDeletingHotspotId(null);
    }
  }, [hotspots, tour.id, currentSceneId]);

  // Overlay management functions
  const handleOverlayAdded = useCallback((overlay: Overlay) => {
    setOverlays(prev => [...prev, overlay]);
  }, []);

  const handleOverlayDeleted = useCallback(async (overlayId: string) => {
    try {
      setDeletingOverlayId(overlayId);
      await tourService.deleteOverlay(currentSceneId, overlayId);
      setOverlays(prev => prev.filter(o => o.id !== overlayId));
      setError(null);
    } catch (err) {
      console.error('Failed to delete overlay:', err);
      setError('Failed to delete overlay');
    } finally {
      setDeletingOverlayId(null);
    }
  }, [currentSceneId]);

  const handleOverlayUpdated = useCallback(async (overlay: Overlay) => {
    if (!overlay.id) return;

    try {
      const updated = await tourService.updateOverlay(currentSceneId, overlay.id, overlay);
      setOverlays(prev => prev.map(o => o.id === overlay.id ? updated : o));
      setError(null);
    } catch (err) {
      console.error('Failed to update overlay:', err);
      setError('Failed to update overlay');
    }
  }, [currentSceneId]);

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

  // Preload adjacent scenes for faster transitions
  useEffect(() => {
    const preloadScene = (sceneId: string) => {
      if (preloadedScenes.has(sceneId)) return;

      const scene = scenes.find(s => s.id === sceneId);
      if (!scene?.tiles_manifest) return;

      try {
        const manifest = typeof scene.tiles_manifest === 'string'
          ? JSON.parse(scene.tiles_manifest)
          : scene.tiles_manifest;

        if (manifest.type === 'cubemap' && manifest.levels?.length > 0) {
          // Preload level 1 tiles for quick initial display (level 0 is not generated)
          const faceOrder = ['right', 'left', 'top', 'bottom', 'front', 'back'];

          faceOrder.forEach(face => {
            // Level 1 has 2x2 tiles (1024px resolution with 512px tiles)
            for (let y = 0; y < 2; y++) {
              for (let x = 0; x < 2; x++) {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.src = `${R2_PUBLIC_URL}/scenes/${sceneId}/tiles/${face}_l1_${x}_${y}.jpg`;
              }
            }
          });

          setPreloadedScenes((prev: Set<string>) => new Set(prev).add(sceneId));
        }
      } catch (error) {
        console.warn('Failed to preload scene:', sceneId, error);
      }
    };

    // Preload current scene and adjacent scenes
    const currentIndex = scenes.findIndex(s => s.id === currentSceneId);
    if (currentIndex !== -1) {
      // Preload previous scene
      if (currentIndex > 0) {
        preloadScene(scenes[currentIndex - 1].id);
      }
      // Preload next scene
      if (currentIndex < scenes.length - 1) {
        preloadScene(scenes[currentIndex + 1].id);
      }
    }
  }, [currentSceneId, scenes, preloadedScenes]);

  // Client-side only flag
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Built-in autoplay mechanism (Syncs with progress bar)
  useEffect(() => {
    if (!isAutoplay || isTransitioning || scenes.length <= 1 || showHotspotDialog || showOverlayDialog) {
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

    // Fixed 12 seconds to match progress bar duration
    const autoplayInterval = 12000;

    autoplayTimeoutRef.current = setTimeout(() => {
      const nextIndex = (currentSceneIndex + 1) % scenes.length;
      handleSceneChangeByIndex(nextIndex);
    }, autoplayInterval);

    // Cleanup function
    return () => {
      if (autoplayTimeoutRef.current) {
        clearTimeout(autoplayTimeoutRef.current);
        autoplayTimeoutRef.current = null;
      }
    };
  }, [isAutoplay, currentSceneIndex, scenes.length, isTransitioning, showHotspotDialog, showOverlayDialog, handleSceneChangeByIndex]);

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

  const triggerPauseAnimation = () => {
    if (pauseTimeoutRef.current) clearTimeout(pauseTimeoutRef.current);
    setShowPauseOverlay(true);
    pauseTimeoutRef.current = setTimeout(() => setShowPauseOverlay(false), 500);
  };

  const toggleAutoplay = () => {
    if (playTours.length > 0 && selectedPlayTourId) {
      // Prioritize Play Tour when one is selected
      const nextState = !isPlayingTour;
      if (!nextState) {
        triggerPauseAnimation();
        // Keep current camera position when pausing (don't reset)
      } else {
        setIsAutoplay(false); // Disable normal sequential autoplay

        const selectedTour = playTours.find(t => t.id === selectedPlayTourId);
        if (selectedTour && selectedTour.play_tour_scenes) {
          // Smart Resume: Check if current scene is part of the tour
          const currentSceneId = scenes[currentSceneIndex]?.id;
          const matchingSceneIndex = selectedTour.play_tour_scenes.findIndex(
            (ps: any) => ps.scene_id === currentSceneId
          );

          if (matchingSceneIndex !== -1) {
            // Resume from current location
            setCurrentPlayTourSceneIndex(matchingSceneIndex);
          } else {
            // If current scene is not in the tour, start from the beginning
            setCurrentPlayTourSceneIndex(0);
          }
        }
      }
      setIsPlayingTour(nextState);
    } else {
      // No Play Tour selected, just toggle autoplay
      const nextState = !isAutoplay;
      if (!nextState) triggerPauseAnimation();
      setIsAutoplay(nextState);
    }
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
    <div className="absolute inset-0" ref={containerRef}>
      {/* Fullscreen Viewer Mode */}
      {isViewerFullscreen ? (
        <div className="fixed inset-0 z-50 bg-black">
          {/* Full Integrated Controls for Fullscreen */}
          <div className="absolute top-4 right-4 z-60">
            <div className="bg-white rounded-lg shadow-lg p-2">
              <div className="flex items-center gap-2">
                {/* Play Tour Selection */}
                {playTours.length > 0 && (
                  <>
                    <select
                      value={selectedPlayTourId || ''}
                      onChange={(e) => setSelectedPlayTourId(e.target.value || null)}
                      className="px-3 py-2 bg-gray-50 text-gray-900 rounded border border-gray-200 text-sm font-medium cursor-pointer"
                    >
                      <option value="">Select Play Tour...</option>
                      {playTours.map(playTour => (
                        <option key={playTour.id} value={playTour.id}>
                          🎬 {playTour.name}
                        </option>
                      ))}
                    </select>
                    {selectedPlayTourId && (
                      <button
                        onClick={() => setIsPlayingTour(!isPlayingTour)}
                        className={`px-3 py-2 rounded text-sm font-medium transition-colors cursor-pointer ${isPlayingTour
                          ? 'bg-red-600 text-white hover:bg-red-700'
                          : 'bg-green-600 text-white hover:bg-green-700'
                          }`}
                        title={isPlayingTour ? 'Stop Play Tour' : 'Start Play Tour'}
                      >
                        {isPlayingTour ? '⏹ Stop' : '▶ Play'}
                      </button>
                    )}
                  </>
                )}

                {/* Autoplay Control */}
                <button
                  onClick={toggleAutoplay}
                  className={`p-2 rounded transition-colors flex items-center gap-1 cursor-pointer ${isAutoplay
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  title={isAutoplay ? 'Pause Auto-rotation' : 'Start Auto-rotation'}
                >
                  {isAutoplay ? '⏸' : '▶'}
                  <span className="text-xs hidden sm:inline">Auto</span>
                </button>

                {/* Audio Controls */}
                {isClient && (
                  <>
                    <button
                      onClick={toggleAudio}
                      disabled={isAudioLoading}
                      className={`p-2 rounded transition-colors flex items-center ${isAudioLoading
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
                      className={`p-2 rounded transition-colors ${isAudioLoading
                        ? 'bg-gray-50 text-gray-400 cursor-not-allowed'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 cursor-pointer'
                        }`}
                      title="Audio Settings"
                    >
                      ⚙️
                    </button>
                  </>
                )}

                {/* Exit Fullscreen Toggle */}
                <button
                  onClick={toggleViewerFullscreen}
                  className="p-2 hover:bg-gray-100 transition-colors rounded cursor-pointer flex items-center justify-center"
                  title="Exit fullscreen (ESC)"
                >
                  <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Clean Viewer */}
          <div className="w-full h-full relative">
            <CubeMapViewer
              tour={tour}
              currentScene={currentScene}
              scenes={scenes}
              onSceneChange={handleSceneChange}
              onHotspotClick={handleHotspotClick}
              isEditMode={false} // Disable edit mode in fullscreen
              onHotspotCreate={handleHotspotCreate}
              onHotspotUpdate={updateHotspot}
              hotspots={currentSceneHotspots}
              overlays={currentSceneOverlays}
              autoRotate={isAutoplay}
              highlightedHotspotId={editingHotspot}
              onOverlayPause={handleOverlayPause}
              onCameraChange={(yaw, pitch, fov) => setCurrentCamera({ yaw, pitch, fov })}
              forcedCameraPosition={isPlayingTour ? currentCamera : previewCameraPosition}
              isPlaybackMode={isPlayingTour}
              cameraControlRef={cameraControlRef}
            />

            {/* Pause Animation Overlay */}
            {showPauseOverlay && (
              <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none">
                <div className="bg-black/60 rounded-full p-8 animate-in fade-in zoom-in duration-300">
                  <svg className="w-16 h-16 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                  </svg>
                </div>
              </div>
            )}

            {/* Bottom Navigation Controls - Match public tour page */}
            <div className="absolute bottom-6 left-6 z-30">
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
                          {isPlayingTour ? 'Stop Play Tour' : isAutoplay ? 'Pause' : 'Play'}
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
              </div>
            </div>

            {/* Progress Bar - Only show in fullscreen mode */}
            <ProgressBar
              scenes={playTourDisplayScenes || scenes}
              currentSceneIndex={selectedPlayTourId ? currentPlayTourSceneIndex : currentSceneIndex}
              isAutoplay={isAutoplay || (!!selectedPlayTourId && isPlayingTour)}
              segmentDuration={isPlayingTour && playTourDisplayScenes ? (playTourDisplayScenes[currentPlayTourSceneIndex]?.move_duration || 5000) : 12000}
              isTransitioning={isTransitioning}
              onSceneChange={(index) => {
                if (selectedPlayTourId && playTourDisplayScenes) {
                  // Navigate within play tour
                  const targetStep = playTourDisplayScenes[index];
                  if (targetStep && targetStep.originalId) {
                    handleSceneChange(targetStep.originalId);
                    setCurrentPlayTourSceneIndex(index);
                  }
                } else {
                  handleSceneChangeByIndex(index);
                }
              }}
              isOverlayModalOpen={showOverlayDialog || showHotspotDialog || isInfoModalOpen}
            />
          </div>
        </div>
      ) : (
        <>
          {/* Normal Editor Mode */}
          <div className="w-full h-full relative">
            <CubeMapViewer
              tour={tour}
              currentScene={currentScene}
              scenes={scenes}
              onSceneChange={handleSceneChange}
              onHotspotClick={handleHotspotClick}
              isEditMode={isEditMode}
              onHotspotCreate={handleHotspotCreate}
              onHotspotUpdate={updateHotspot}
              hotspots={currentSceneHotspots}
              overlays={currentSceneOverlays}
              autoRotate={isAutoplay}
              highlightedHotspotId={editingHotspot}
              onOverlayPause={handleOverlayPause}
              onCameraChange={(yaw, pitch, fov) => setCurrentCamera({ yaw, pitch, fov })}
              forcedCameraPosition={isPlayingTour ? currentCamera : previewCameraPosition}
              isPlaybackMode={isPlayingTour}
              cameraControlRef={cameraControlRef}
            />

            {/* Pause Animation Overlay */}
            {showPauseOverlay && (
              <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none">
                <div className="bg-black/60 rounded-full p-8 animate-in fade-in zoom-in duration-300">
                  <svg className="w-16 h-16 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                  </svg>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar Toggle Button - Only show when sidebar is closed */}
          {!sidebarOpen && (
            <div className="absolute left-2 top-2 z-40">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="bg-white rounded-lg shadow-lg p-3 hover:bg-gray-50 transition-colors cursor-pointer"
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
          <div className={`absolute left-0 top-0 bottom-0 z-30 transition-all duration-300 ease-in-out ${sidebarOpen ? 'w-80 opacity-100' : 'w-0 opacity-0 pointer-events-none'
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
                    className={`relative cursor-pointer rounded-lg border-2 transition-all duration-200 ${scene.id === currentSceneId
                      ? 'border-blue-500 bg-blue-50 shadow-md'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 hover:shadow-sm'
                      } ${isTransitioning && scene.id === currentSceneId ? 'opacity-50' : ''}`}
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

                      {/* Hotspot and Overlay counts for this scene */}
                      <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
                        <div className="flex items-center">
                          <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                          </svg>
                          {hotspots.filter(h => h.scene_id === scene.id).length} hotspots
                        </div>
                        <div className="flex items-center">
                          <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" clipRule="evenodd" />
                          </svg>
                          {overlays.filter(o => o.scene_id === scene.id).length} overlays
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Edit Controls Panel - Responsive to sidebar */}
          <div className={`absolute bottom-4 left-2 z-30 transition-all duration-300 ${sidebarOpen ? 'ml-80 pl-2' : 'ml-0'
            }`}>
            <div className="bg-white rounded-lg shadow-xl p-4" style={{ width: '320px' }}>
              {/* Edit Mode Toggle */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Editor Controls</h3>
                <button
                  onClick={() => setIsEditMode(!isEditMode)}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors cursor-pointer ${isEditMode
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
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer border-2 ${editPanel === 'hotspots'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700'
                        }`}
                    >
                      🔥 Hotspots
                    </button>
                    <button
                      onClick={() => setEditPanel('overlays')}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer border-2 ${editPanel === 'overlays'
                        ? 'bg-purple-600 text-white border-purple-600 shadow-md'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-purple-50 hover:border-purple-300 hover:text-purple-700'
                        }`}
                    >
                      ✨ Overlays
                    </button>
                    <button
                      onClick={() => setEditPanel('playTours')}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer border-2 ${editPanel === 'playTours'
                        ? 'bg-purple-600 text-white border-purple-600 shadow-md'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-purple-50 hover:border-purple-300 hover:text-purple-700'
                        }`}
                    >
                      🎬 Play Tours
                    </button>
                  </div>

                  {/* Instructions */}
                  <div className={`border-2 rounded-lg p-3 mb-4 ${editPanel === 'playTours'
                    ? 'bg-purple-50 border-purple-200'
                    : editPanel === 'overlays'
                      ? 'bg-purple-50 border-purple-200'
                      : 'bg-blue-50 border-blue-200'
                    }`}>
                    <p className={`text-sm font-medium ${editPanel === 'playTours'
                      ? 'text-purple-900'
                      : editPanel === 'overlays'
                        ? 'text-purple-900'
                        : 'text-blue-900'
                      }`}>
                      {editPanel === 'playTours' ? (
                        <>
                          <strong>Play Tours:</strong><br />
                          Manage automated tour sequences and camera movements
                        </>
                      ) : (
                        <>
                          <strong>How to add {editPanel}:</strong><br />
                          Hold <kbd className="px-1 py-0.5 bg-white rounded border text-gray-800 font-semibold">Shift</kbd> + Click on the panorama
                        </>
                      )}
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

                            const isEditing = editingHotspot === hotspot.id;

                            return (
                              <div key={hotspot.id} className="p-3 bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 rounded-lg text-sm text-gray-700 hover:shadow-sm transition-all duration-200">
                                <div className="flex items-center justify-between">
                                  <span className="truncate flex items-center gap-2">
                                    <span className="text-lg">
                                      {hotspot.kind === 'navigation' && '🔄'}
                                      {hotspot.kind === 'info' && 'ℹ️'}
                                      {hotspot.kind === 'link' && '🔗'}
                                    </span>
                                    <span className="font-medium">{displayLabel}</span>
                                    {/* Save indicator */}
                                    {hotspot.id && pendingSaves.has(hotspot.id) && (
                                      <span className="flex items-center gap-1 text-xs text-blue-600">
                                        <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Saving...
                                      </span>
                                    )}
                                  </span>
                                  <div className="flex items-center gap-1">
                                    {hotspot?.id && (
                                      <>
                                        <button
                                          onClick={() => {
                                            if (isEditing) {
                                              // Trigger immediate update on close
                                              const finalYaw = parseFloat(editingYaw);
                                              const finalPitch = parseFloat(editingPitch);
                                              if (!isNaN(finalYaw) && !isNaN(finalPitch) && hotspot.id) {
                                                const updatedHotspot = {
                                                  ...hotspot,
                                                  yaw: finalYaw,
                                                  pitch: finalPitch
                                                };
                                                // Cancel any pending debounced calls to avoid double-firing or race conditions

                                                // Call API immediately
                                                updateHotspotAPI(updatedHotspot);
                                              }
                                              setEditingHotspot(null);
                                            } else {
                                              setEditingHotspot(hotspot.id || null);
                                              setEditingPitch((hotspot.pitch || 0).toFixed(2));
                                              setEditingYaw((hotspot.yaw || 0).toFixed(2));
                                            }
                                          }}
                                          className="text-blue-500 hover:text-blue-700 hover:bg-blue-100 cursor-pointer flex items-center justify-center w-8 h-8 rounded-full transition-all duration-200"
                                          title={isEditing ? "Close editor" : "Edit coordinates"}
                                        >
                                          {isEditing ? '✓' : '✏️'}
                                        </button>
                                        <button
                                          onClick={() => deleteHotspot(hotspot.id ?? '')}
                                          disabled={deletingHotspotId === hotspot.id}
                                          className="text-red-500 hover:text-red-700 hover:bg-red-100 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center w-8 h-8 rounded-full transition-all duration-200"
                                          title="Delete hotspot"
                                        >
                                          {deletingHotspotId === hotspot.id ? (
                                            <svg className="animate-spin h-3 w-3 text-red-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                          ) : (
                                            '✕'
                                          )}
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>

                                {/* Coordinate Editor */}
                                {isEditing && (
                                  <div className="mt-3 p-3 bg-white rounded-lg border border-blue-300">
                                    <div className="grid grid-cols-2 gap-3">
                                      <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Yaw (°)</label>
                                        <input
                                          type="number"
                                          value={editingYaw}
                                          onChange={(e) => {
                                            setEditingYaw(e.target.value);
                                            // Update hotspot immediately for real-time feedback
                                            const yawValue = parseFloat(e.target.value);
                                            if (!isNaN(yawValue)) {
                                              updateHotspotCoordinates(hotspot.id!, yawValue, hotspot.pitch || 0);
                                            }
                                          }}
                                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                          step="0.1"
                                          min="-180"
                                          max="180"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Pitch (°)</label>
                                        <input
                                          type="number"
                                          value={editingPitch}
                                          onChange={(e) => {
                                            setEditingPitch(e.target.value);
                                            // Update hotspot immediately for real-time feedback
                                            const pitchValue = parseFloat(e.target.value);
                                            if (!isNaN(pitchValue)) {
                                              updateHotspotCoordinates(hotspot.id!, hotspot.yaw || 0, pitchValue);
                                            }
                                          }}
                                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                          step="0.1"
                                          min="-90"
                                          max="90"
                                        />
                                      </div>
                                    </div>
                                    <div className="mt-2 text-xs text-gray-500">
                                      <div>Horizontal: -180° to 180°</div>
                                      <div>Vertical: -90° (down) to 90° (up)</div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        {hotspots.filter(h => h.scene_id === currentSceneId).length === 0 && (
                          <div className="text-center py-6">
                            <div className="text-4xl mb-2">🔥</div>
                            <p className="text-gray-500 text-sm font-medium">No hotspots yet</p>
                            <p className="text-gray-400 text-xs mt-1">Add navigation points to connect scenes</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Overlays List */}
                  {editPanel === 'overlays' && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2 text-gray-900">Current Overlays ({overlays.filter(o => o.scene_id === currentSceneId).length})</h4>
                      <div className="max-h-32 overflow-y-auto space-y-1">
                        {overlays
                          .filter(o => o.scene_id === currentSceneId)
                          .map(overlay => {
                            let displayLabel: string = overlay.kind;

                            try {
                              const payload = JSON.parse(overlay.payload || '{}');

                              if (payload.text) {
                                displayLabel = payload.text.length > 20
                                  ? `${payload.text.substring(0, 20)}...`
                                  : payload.text;
                              } else if (overlay.kind === 'image' && payload.imageName) {
                                displayLabel = payload.imageName;
                              } else if (overlay.kind === 'video' && payload.videoUrl) {
                                displayLabel = 'Video content';
                              } else {
                                displayLabel = `${overlay.kind} overlay`;
                              }
                            } catch {
                              displayLabel = `${overlay.kind} overlay`;
                            }

                            return (
                              <div key={overlay.id} className="flex items-center justify-between p-3 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-lg text-sm text-gray-700 hover:shadow-sm transition-all duration-200">
                                <span className="truncate flex items-center gap-2">
                                  <span className="text-lg">
                                    {overlay.kind === 'text' && '📝'}
                                    {overlay.kind === 'image' && '🖼️'}
                                    {overlay.kind === 'video' && '🎥'}
                                    {overlay.kind === 'badge' && '🏷️'}
                                    {overlay.kind === 'html' && '🌐'}
                                    {overlay.kind === 'tooltip' && '💬'}
                                  </span>
                                  <span className="font-medium">{displayLabel}</span>
                                </span>
                                {overlay?.id && (
                                  <button
                                    onClick={() => handleOverlayDeleted(overlay.id ?? '')}
                                    disabled={deletingOverlayId === overlay.id}
                                    className="text-red-500 hover:text-red-700 hover:bg-red-100 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center w-8 h-8 rounded-full transition-all duration-200"
                                    title="Delete overlay"
                                  >
                                    {deletingOverlayId === overlay.id ? (
                                      <svg className="animate-spin h-3 w-3 text-red-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                      </svg>
                                    ) : (
                                      '✕'
                                    )}
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        {overlays.filter(o => o.scene_id === currentSceneId).length === 0 && (
                          <div className="text-center py-6">
                            <div className="text-4xl mb-2">✨</div>
                            <p className="text-gray-500 text-sm font-medium">No overlays yet</p>
                            <p className="text-gray-400 text-xs mt-1">Add your first overlay to enhance this scene</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Play Tours Editor */}
                  {editPanel === 'playTours' && (
                    <div className="fixed top-0 left-0 bottom-0 z-50 animate-in slide-in-from-left duration-300">
                      <div className="flex bg-white h-full relative">
                        <button
                          onClick={() => setEditPanel('hotspots')}
                          className="absolute right-4 top-4 bg-gray-100 p-2 rounded-lg shadow-md text-gray-700 hover:bg-gray-200 cursor-pointer z-50 font-bold"
                          title="Close Play Tour Editor"
                        >
                          ✕
                        </button>
                        <PlayTourEditor
                          tourId={tour.id}
                          scenes={scenes}
                          currentYaw={currentCamera.yaw}
                          currentPitch={currentCamera.pitch}
                          currentFov={currentCamera.fov}
                          onPreviewScene={handlePreviewScene}
                          onPlaySceneAnimation={handlePlaySceneAnimation}
                        />
                      </div>
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
            <div className="absolute top-4 right-4 z-30">
              {/* Consolidated Controls Container */}
              <div className="bg-white rounded-lg shadow-lg p-2">
                <div className="flex items-center gap-2">
                  {/* Play Tour Selection */}
                  {playTours.length > 0 && (
                    <>
                      <select
                        value={selectedPlayTourId || ''}
                        onChange={(e) => setSelectedPlayTourId(e.target.value || null)}
                        className="px-3 py-2 bg-gray-50 text-gray-900 rounded border border-gray-200 text-sm font-medium cursor-pointer"
                      >
                        <option value="">Select Play Tour...</option>
                        {playTours.map(playTour => (
                          <option key={playTour.id} value={playTour.id}>
                            🎬 {playTour.name}
                          </option>
                        ))}
                      </select>
                      {selectedPlayTourId && (
                        <button
                          onClick={() => setIsPlayingTour(!isPlayingTour)}
                          className={`px-3 py-2 rounded text-sm font-medium transition-colors cursor-pointer ${isPlayingTour
                            ? 'bg-red-600 text-white hover:bg-red-700'
                            : 'bg-green-600 text-white hover:bg-green-700'
                            }`}
                          title={isPlayingTour ? 'Stop Play Tour' : 'Start Play Tour'}
                        >
                          {isPlayingTour ? '⏹ Stop' : '▶ Play'}
                        </button>
                      )}
                    </>
                  )}

                  {/* Audio & Autoplay Controls */}
                  {/* Autoplay Control */}
                  <button
                    onClick={toggleAutoplay}
                    className={`p-2 rounded transition-colors flex items-center gap-1 cursor-pointer ${isAutoplay
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
                        className={`p-2 rounded transition-colors flex items-center ${isAudioLoading
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
                        className={`p-2 rounded transition-colors ${isAudioLoading
                          ? 'bg-gray-50 text-gray-400 cursor-not-allowed'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200 cursor-pointer'
                          }`}
                        title={isAudioLoading ? 'Loading audio...' : 'Audio Settings'}
                      >
                        ⚙️
                      </button>
                    </>
                  )}

                  {/* Fullscreen Toggle */}
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
            </div>
          )}

          {/* Audio Error Display*/}
          {!isViewerFullscreen && isClient && audioError && (
            <div className="absolute top-4 right-4 z-40 mt-20">
              <div className={`text-white px-3 py-2 rounded text-xs max-w-xs ${audioError.includes('successfully') || audioError.includes('extracted') || audioError.includes('✓ Audio ready')
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
                      className={`px-3 py-2 rounded border text-sm font-medium transition-colors cursor-pointer ${hotspotType === 'navigation'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                    >
                      🔄 Navigation
                    </button>
                    <button
                      onClick={() => setHotspotType('info')}
                      className={`px-3 py-2 rounded border text-sm font-medium transition-colors cursor-pointer ${hotspotType === 'info'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                    >
                      ℹ️ Info
                    </button>
                    <button
                      onClick={() => setHotspotType('link')}
                      className={`px-3 py-2 rounded border text-sm font-medium transition-colors cursor-pointer ${hotspotType === 'link'
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
                  <>
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

                    {/* Transition Direction Selector */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium mb-2 text-gray-900">
                        Transition Direction
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {['forward', 'backward', 'left', 'right', 'up', 'down'].map((dir) => (
                          <button
                            key={dir}
                            onClick={() => setTransitionDirection(dir)}
                            className={`px-2 py-2 rounded border text-xs font-medium capitalize transition-colors cursor-pointer ${transitionDirection === dir
                              ? 'border-blue-500 bg-blue-50 text-blue-700'
                              : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                              }`}
                          >
                            {dir === 'forward' && '⬆️'}
                            {dir === 'backward' && '⬇️'}
                            {dir === 'left' && '⬅️'}
                            {dir === 'right' && '➡️'}
                            {dir === 'up' && '↗️'}
                            {dir === 'down' && '↙️'}
                            {' ' + dir}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
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
                      isLoading ||
                      (hotspotType === 'navigation' && !selectedTargetScene) ||
                      (hotspotType === 'info' && !infoText.trim()) ||
                      (hotspotType === 'link' && !linkUrl.trim())
                    }
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
                  >
                    {isLoading ? (
                      <>
                        <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Creating...
                      </>
                    ) : (
                      'Create Hotspot'
                    )}
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
                    disabled={isLoading}
                    className="flex-1 px-4 py-2 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
                  >
                    {isUpdatingAudio ? (
                      <>
                        <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Updating...
                      </>
                    ) : (
                      'Update Audio'
                    )}
                  </button>

                  {tour.background_audio_url && (
                    <button
                      onClick={handleRemoveAudio}
                      disabled={isUpdatingAudio}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
                      title="Remove audio and use default"
                    >
                      {isUpdatingAudio ? (
                        <>
                          <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Removing...
                        </>
                      ) : (
                        'Remove'
                      )}
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

          {/* Overlay Creation Dialog */}
          {showOverlayDialog && pendingOverlay && (
            <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40">
              <div className="bg-white rounded-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto relative">
                {/* Close Button - Top Right */}
                <button
                  onClick={() => {
                    setShowOverlayDialog(false);
                    setPendingOverlay(null);
                  }}
                  className="absolute top-4 right-4 z-10 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors cursor-pointer"
                  title="Close"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>

                {/* Modal Content */}
                <div className="p-6">
                  <OverlayEditor
                    sceneId={currentSceneId}
                    tourId={tour.id}
                    overlays={overlays.filter(o => o.scene_id === currentSceneId)}
                    pendingPosition={pendingOverlay}
                    onOverlayAdded={(overlay) => {
                      handleOverlayAdded(overlay);
                      setShowOverlayDialog(false);
                      setPendingOverlay(null);
                    }}
                    onOverlayDeleted={handleOverlayDeleted}
                    onOverlayUpdated={handleOverlayUpdated}
                    deletingOverlayId={deletingOverlayId}
                  />
                </div>
              </div>
            </div>
          )}
        </>
      )}

    </div>
  );
}