'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Tour, Scene } from '@/types/tour';
import { tourService } from '@/services/tourService';
import MultiresViewer from './viewer/MultiresViewer';
import { ChevronLeft, ChevronRight, Play, Maximize, Minimize } from 'lucide-react';

interface HomeTourViewerProps {
  className?: string;
}

// Completely isolated progress bar that doesn't cause React re-renders
const ProgressBar = React.memo(({ 
  scenes, 
  currentSceneIndex, 
  isAutoplay, 
  isTransitioning, 
  onSceneChange 
}: {
  scenes: Scene[];
  currentSceneIndex: number;
  isAutoplay: boolean;
  isTransitioning: boolean;
  onSceneChange: (index: number) => void;
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

    if (isAutoplay) {
      // Resume from paused progress or start fresh
      startTimeRef.current = Date.now() - (pausedProgressRef.current * 6000);
      
      const updateProgress = () => {
        if (!progressBarRef.current || isTransitioning) return;
        
        const elapsed = Date.now() - startTimeRef.current;
        const progress = Math.min(1, elapsed / 6000); // 6 second duration
        
        // Store current progress for potential pause
        pausedProgressRef.current = progress;
        
        // Find the current scene's progress bar and update it directly
        const currentProgressBar = progressBarRef.current.querySelector(`[data-scene-index="${currentSceneIndex}"] .progress-fill`) as HTMLElement;
        if (currentProgressBar) {
          currentProgressBar.style.width = `${progress * 100}%`;
        }
        
        if (progress < 1 && isAutoplay) {
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
  }, [isAutoplay, isTransitioning, currentSceneIndex, scenes.length]);

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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
        console.log('Fetched tours:', toursData);
        
        if (toursData && toursData.length > 0) {
          // Select the first tour
          const firstTour = toursData[0];
          setCurrentTour(firstTour);
          
          // Fetch scenes for the first tour
          const scenesData = await tourService.getScenes(firstTour.id);
          console.log('Fetched scenes for tour:', firstTour.id, scenesData);
          setScenes(scenesData || []);
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
    if (!isAutoplay || scenes.length <= 1 || isTransitioning) {
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
    }, 6000); // Change scene every 6 seconds

    return () => {
      clearInterval(sceneInterval);
    };
  }, [isAutoplay, scenes.length, isTransitioning, currentSceneIndex]);

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
  }, [currentSceneIndex, isTransitioning]);

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

  const handleCenterPlayClick = useCallback(() => {
    setShowControls(true);
    setIsAutoplay(true);
  }, []);

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
        />
        
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
            />
          </>
        )}
      </div>
    </div>
  );
};

export default HomeTourViewer;