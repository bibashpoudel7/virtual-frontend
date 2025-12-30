'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Tour, Scene, Hotspot, Overlay } from '@/types/tour';
import { tourService } from '@/services/tourService';
import MultiresViewer from './viewer/MultiresViewer';
import AutoplayController from './viewer/AutoplayController';
import { ChevronLeft, ChevronRight, Play, Maximize, Minimize, Share2, Volume2, VolumeX, Facebook, Twitter, Linkedin, Mail, Copy, X } from 'lucide-react';

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
                className={`px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer ${
                  copied 
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
  isOverlayModalOpen = false // New prop
}: {
  scenes: Scene[];
  currentSceneIndex: number;
  isAutoplay: boolean;
  isTransitioning: boolean;
  onSceneChange: (index: number) => void;
  isOverlayModalOpen?: boolean; // New prop
}) => {
  const progressBarRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | undefined>(undefined);
  const startTimeRef = useRef<number>(0);
  const pausedProgressRef = useRef<number>(0); // Track progress when paused
  const lastSceneIndexRef = useRef<number>(currentSceneIndex);

  // Direct DOM manipulation for smooth progress without React re-renders
  useEffect(() => {
    // Reset progress when scene changes
    if (lastSceneIndexRef.current !== currentSceneIndex) {
      pausedProgressRef.current = 0;
      lastSceneIndexRef.current = currentSceneIndex;
    }

    if (isTransitioning || scenes.length <= 1) {
      return;
    }

    if (isAutoplay && !isOverlayModalOpen) {
      // Resume from paused progress or start fresh
      startTimeRef.current = Date.now() - (pausedProgressRef.current * 12000);
      
      const updateProgress = () => {
        if (!progressBarRef.current || isTransitioning) return;
        
        const elapsed = Date.now() - startTimeRef.current;
        const progress = Math.min(1, elapsed / 12000); // 12 second duration
        
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
  }, [isAutoplay, isTransitioning, currentSceneIndex, scenes.length, isOverlayModalOpen]);

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
                  className={`progress-fill h-full rounded-full tour-progress-segment ${
                    isCompleted || isCurrent 
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
                                                 `https://test.thenimto.com/scenes/${scene.id}/preview.jpg`;
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
  const containerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Fetch tours on component mount
  useEffect(() => {
    const fetchTours = async () => {
      try {
        setLoading(true);
        
        // Check if user is authenticated
        const token = localStorage.getItem('accessToken') || localStorage.getItem('auth_token');
        if (!token) {
          // If not authenticated, show static image without play button
          setError('not_authenticated');
          setLoading(false);
          return;
        }

        const toursData = await tourService.listTours();
        
        if (toursData && toursData.length > 0) {
          // Select the first tour
          const firstTour = toursData[0];
          setCurrentTour(firstTour);
          
          // Fetch scenes for the first tour
          const scenesData = await tourService.getScenes(firstTour.id);
          setScenes(scenesData || []);
          
          // Fetch hotspots and overlays for all scenes
          if (scenesData && scenesData.length > 0) {
            const allHotspotsPromises = scenesData.map(async (scene: Scene) => {
              try {
                const sceneHotspots = await tourService.listHotspots(scene.id);
                return sceneHotspots || [];
              } catch (error) {
                console.error(`Error fetching hotspots for scene ${scene.id}:`, error);
                return [];
              }
            });

            const allOverlaysPromises = scenesData.map(async (scene: Scene) => {
              try {
                const sceneOverlays = await tourService.listOverlays(scene.id);
                return sceneOverlays || [];
              } catch (error) {
                console.error(`Error fetching overlays for scene ${scene.id}:`, error);
                return [];
              }
            });
            
            const [hotspotsArrays, overlaysArrays] = await Promise.all([
              Promise.all(allHotspotsPromises),
              Promise.all(allOverlaysPromises)
            ]);
            
            const flattenedHotspots = hotspotsArrays.flat();
            const flattenedOverlays = overlaysArrays.flat();
            
            setAllHotspots(flattenedHotspots);
            setAllOverlays(flattenedOverlays);
          }
        } else {
          setError('No tours available');
        }
      } catch (err) {
        console.error('Error fetching tours:', err);
        if (err instanceof Error && (err.message.includes('401') || err.message.includes('Unauthorized'))) {
          setError('not_authenticated');
        } else {
          setError('Failed to load virtual tours');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchTours();
  }, []);

  // Auto-advance scenes when autoplay is enabled
  useEffect(() => {
    if (!isAutoplay || scenes.length <= 1 || isTransitioning || isOverlayModalOpen) {
      return;
    }

    const sceneInterval = setInterval(() => {
      setCurrentSceneIndex((prev) => {
        const nextIndex = (prev + 1) % scenes.length;
        // Trigger smooth transition
        setIsTransitioning(true);
        setTimeout(() => setIsTransitioning(false), 600);
        return nextIndex;
      });
    }, 12000); // Change scene every 12 seconds

    return () => {
      clearInterval(sceneInterval);
    };
  }, [isAutoplay, scenes.length, isTransitioning, currentSceneIndex, isOverlayModalOpen]);

  const handleSceneChange = useCallback((index: number) => {
    if (index === currentSceneIndex || isTransitioning) return;
    
    setIsTransitioning(true);
    
    // Faster transition - immediate scene change with quick overlay
    setTimeout(() => {
      setCurrentSceneIndex(index);
    }, 100);
    
    // Reset transition state after animation completes
    setTimeout(() => {
      setIsTransitioning(false);
    }, 600);
  }, [currentSceneIndex, isTransitioning, scenes]);

  const handlePrevScene = useCallback(() => {
    if (isTransitioning) return;
    const newIndex = (currentSceneIndex - 1 + scenes.length) % scenes.length;
    handleSceneChange(newIndex);
  }, [currentSceneIndex, scenes.length, isTransitioning, handleSceneChange]);

  const handleNextScene = useCallback(() => {
    if (isTransitioning) return;
    const newIndex = (currentSceneIndex + 1) % scenes.length;
    handleSceneChange(newIndex);
  }, [currentSceneIndex, scenes.length, isTransitioning, handleSceneChange]);

  const toggleAutoplay = useCallback(() => {
    setIsAutoplay(!isAutoplay);
  }, [isAutoplay]);

  const handleViewerSceneChange = useCallback((sceneId: string) => {
    const sceneIndex = scenes.findIndex(s => s.id === sceneId);
    if (sceneIndex !== -1 && sceneIndex !== currentSceneIndex) {
      setCurrentSceneIndex(sceneIndex);
    }
  }, [scenes, currentSceneIndex]);

  const handleHotspotClick = useCallback((hotspot: Hotspot) => {
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
          handleSceneChange(targetSceneIndex);
        }
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
        if (isAutoplay) {
          setIsAutoplay(false);
        }
        
        // Create and show info modal
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4';
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
          document.body.removeChild(modal);
          // Resume autoplay when modal closes
          if (wasAutoplayActive) {
            setIsAutoplay(true);
          }
        };
        
        modal.addEventListener('click', (e) => {
          if (e.target === modal) closeModal();
        });
        
        modal.querySelector('.info-modal-close')?.addEventListener('click', closeModal);
        
        document.body.appendChild(modal);
        
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
  }, [scenes, handleSceneChange, isAutoplay, setIsAutoplay]);

  const handleCenterPlayClick = useCallback(() => {
    setShowControls(true);
    setIsAutoplay(true);
  }, []);

  // Effect to log scene changes and hotspot/overlay data
  useEffect(() => {
    if (scenes.length > 0 && (allHotspots.length > 0 || allOverlays.length > 0)) {
      const currentScene = scenes[currentSceneIndex];
      const currentSceneHotspots = allHotspots.filter(h => h.scene_id === currentScene?.id);
      const currentSceneOverlays = allOverlays.filter(o => o.scene_id === currentScene?.id);
      console.log(`Scene ${currentSceneIndex + 1}: ${currentSceneHotspots.length} hotspots, ${currentSceneOverlays.length} overlays`);
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
    // Clean up any existing audio first
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    if (currentTour?.background_audio_url && currentTour.background_audio_url.trim() !== '') {
      console.log('Loading tour-specific audio:', currentTour.background_audio_url);
      
      // Check if it's a sharing service URL that needs extraction
      const isFileSharing = (currentTour.background_audio_url.includes('jumpshare.com') && currentTour.background_audio_url.includes('/share/')) || 
                           (currentTour.background_audio_url.includes('audio.com') && currentTour.background_audio_url.includes('/audio/')) || 
                           (currentTour.background_audio_url.includes('soundcloud.com') && currentTour.background_audio_url.includes('/tracks/')) ||
                           (currentTour.background_audio_url.includes('dropbox.com') && currentTour.background_audio_url.includes('/s/')) ||
                           (currentTour.background_audio_url.includes('drive.google.com') && currentTour.background_audio_url.includes('/file/d/'));
      
      if (isFileSharing) {
        // Extract audio URL for sharing services
        extractTourAudio(currentTour.background_audio_url);
      } else {
        // Direct audio URL
        loadTourAudio(currentTour.background_audio_url);
      }
    } else {
      // No tour-specific audio, load default audio
      console.log('No tour-specific audio found, loading default audio');
      loadDefaultAudio();
    }
    
    // Cleanup function
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [currentTour?.background_audio_url]);

  // Extract audio from sharing services for tour-specific audio
  const extractTourAudio = async (audioUrl: string) => {
    try {
      console.log('Extracting tour audio from sharing service:', audioUrl);
      const response = await fetch(`/api/extract-audio?url=${encodeURIComponent(audioUrl)}`);
      const result = await response.json();
      
      if (result.success && result.audioUrl) {
        console.log('Tour audio extraction successful');
        loadTourAudio(result.audioUrl);
      } else {
        console.warn('Tour audio extraction failed, trying direct URL');
        loadTourAudio(audioUrl);
      }
    } catch (error) {
      console.error('Tour audio extraction error:', error);
      loadTourAudio(audioUrl);
    }
  };

  // Load tour-specific audio
  const loadTourAudio = (audioUrl: string) => {
    console.log('Loading tour audio:', audioUrl);
    const audio = new Audio(audioUrl);
    audio.loop = true;
    audio.volume = 0.5; // Set default volume to 50%
    audio.muted = true; // Start muted
    audio.crossOrigin = 'anonymous';
    
    audio.addEventListener('canplay', () => {
      console.log('Tour background audio loaded successfully');
      setAudioError(null);
    });
    
    audio.addEventListener('error', (e) => {
      console.error('Tour background audio error:', e);
      setAudioError('Failed to load tour background audio');
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
      console.log('Loading default audio from audio.com...');
      // Extract direct audio URL from audio.com for default audio
      const response = await fetch(`/api/extract-audio?url=${encodeURIComponent(defaultAudioUrl)}`);
      const result = await response.json();
      
      if (result.success && result.audioUrl) {
        console.log('Default audio extraction successful');
        const audio = new Audio(result.audioUrl);
        audio.loop = true;
        audio.volume = 0.3; // Lower volume for default audio
        audio.muted = true;
        audio.crossOrigin = 'anonymous';
        
        audio.addEventListener('canplay', () => {
          console.log('Default background audio loaded successfully');
        });
        
        audio.addEventListener('error', (e) => {
          console.log('Default audio playback error, using visual-only toggle');
        });
        
        audio.addEventListener('play', () => setIsAudioPlaying(true));
        audio.addEventListener('pause', () => setIsAudioPlaying(false));
        
        audioRef.current = audio;
        setIsAudioMuted(true);
        setIsAudioPlaying(false);
      } else {
        console.warn('Default audio extraction failed, using visual-only toggle');
        setIsAudioMuted(true);
        setIsAudioPlaying(false);
      }
    } catch (error) {
      console.error('Default audio extraction error:', error);
      setIsAudioMuted(true);
      setIsAudioPlaying(false);
    }
  };

  // Audio control functions - Single toggle button (works even without audio)
  const toggleAudio = useCallback(() => {
    console.log('Audio toggle clicked', { isAudioPlaying, isAudioMuted, audioRef: !!audioRef.current });
    
    if (audioRef.current) {
      // If we have actual audio
      if (isAudioPlaying && !isAudioMuted) {
        // If playing and not muted, pause and mute
        console.log('Pausing and muting audio');
        audioRef.current.pause();
        audioRef.current.muted = true;
        setIsAudioMuted(true);
        setIsAudioPlaying(false);
      } else {
        // If paused or muted, play and unmute
        console.log('Playing and unmuting audio');
        audioRef.current.muted = false;
        setIsAudioMuted(false);
        audioRef.current.play().then(() => {
          setIsAudioPlaying(true);
        }).catch(err => {
          console.error('Failed to play audio:', err);
          setAudioError('Failed to play audio. User interaction may be required.');
          setIsAudioPlaying(false);
          setIsAudioMuted(true);
        });
      }
    } else {
      // No actual audio, just toggle the visual state for demo
      console.log('No audio ref, toggling visual state');
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
            <p className="text-white/90 text-sm drop-shadow-lg max-w-md">
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
        <MultiresViewer
          tour={currentTour}
          currentScene={currentScene}
          scenes={scenes}
          isAutoplay={isAutoplay}
          onSceneChange={handleViewerSceneChange}
          onHotspotClick={handleHotspotClick}
          hotspots={currentSceneHotspots}
          overlays={currentSceneOverlays}
          onOverlayModalStateChange={setIsOverlayModalOpen}
          isOverlayModalOpen={isOverlayModalOpen}
          isFullscreen={isFullscreen}
        />
        
        {/* Autoplay Controller - Matterport style */}
        {showControls && currentTour?.autoplay_enabled && (
          <AutoplayController
            tour={currentTour}
            scenes={scenes}
            currentSceneIndex={currentSceneIndex}
            onSceneChange={handleSceneChange}
            isAutoplayEnabled={isAutoplay}
            onAutoplayToggle={setIsAutoplay}
            isPaused={isOverlayModalOpen}
          />
        )}
        
        {!showControls && (
          <div className="absolute top-4 left-4 z-30">
            <h3 className="text-white text-2xl font-bold mb-2 drop-shadow-lg">
              {currentTour.name || 'Virtual Tour'}
            </h3>
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
              className={`backdrop-blur-sm text-white p-2 rounded-full transition-colors cursor-pointer ${
                isAudioPlaying 
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
                      {isAutoplay ? (
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
                          {isAutoplay ? 'Pause' : 'Play'}
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

            <ProgressBar
              scenes={scenes}
              currentSceneIndex={currentSceneIndex}
              isAutoplay={isAutoplay}
              isTransitioning={isTransitioning}
              onSceneChange={handleSceneChange}
              isOverlayModalOpen={isOverlayModalOpen}
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