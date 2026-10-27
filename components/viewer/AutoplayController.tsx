'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Tour, Scene } from '@/types/tour';
import { Play, Pause, SkipForward, SkipBack, Volume2, VolumeX } from 'lucide-react';

interface AutoplayControllerProps {
  tour: Tour;
  scenes: Scene[];
  currentSceneIndex: number;
  onSceneChange: (sceneIndex: number) => void;
  isAutoplayEnabled?: boolean;
  onAutoplayToggle?: (enabled: boolean) => void;
  isPaused?: boolean;
}

export default function AutoplayController({
  tour,
  scenes,
  currentSceneIndex,
  onSceneChange,
  isAutoplayEnabled = false,
  onAutoplayToggle,
  isPaused = false
}: AutoplayControllerProps) {
  const [isPlaying, setIsPlaying] = useState(isAutoplayEnabled);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(0);
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Get autoplay settings from tour
  const autoplayInterval = tour.auto_change_interval || 5000; // Default 5 seconds
  const autoplayMode = tour.auto_change_mode || 'sequential'; // sequential, random
  const autoPauseOnInteraction = tour.auto_pause_on_interaction ?? true;
  const autoRestartDelay = tour.auto_restart_delay || 3000; // 3 seconds

  // Initialize background audio
  useEffect(() => {
    if (tour.background_audio_url && !audioRef.current) {
      audioRef.current = new Audio(tour.background_audio_url);
      audioRef.current.loop = true;
      audioRef.current.volume = 0.3; // Start at 30% volume
      
      // Handle audio loading
      audioRef.current.addEventListener('canplaythrough', () => {
        if (isPlaying && !isMuted) {
          audioRef.current?.play().catch(console.error);
        }
      });
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [tour.background_audio_url]);

  // Handle audio playback based on play state
  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying && !isMuted) {
        audioRef.current.play().catch(console.error);
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying, isMuted]);

  // Get next scene index based on autoplay mode
  const getNextSceneIndex = useCallback(() => {
    if (autoplayMode === 'random') {
      let nextIndex;
      do {
        nextIndex = Math.floor(Math.random() * scenes.length);
      } while (nextIndex === currentSceneIndex && scenes.length > 1);
      return nextIndex;
    } else {
      // Sequential mode
      return (currentSceneIndex + 1) % scenes.length;
    }
  }, [currentSceneIndex, scenes.length, autoplayMode]);

  // Get previous scene index
  const getPreviousSceneIndex = useCallback(() => {
    return currentSceneIndex === 0 ? scenes.length - 1 : currentSceneIndex - 1;
  }, [currentSceneIndex, scenes.length]);

  // Start autoplay
  const startAutoplay = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    setProgress(0);
    setTimeRemaining(autoplayInterval / 1000);

    // Progress tracking
    const progressInterval = 100; // Update every 100ms
    let elapsed = 0;

    progressIntervalRef.current = setInterval(() => {
      elapsed += progressInterval;
      const progressPercent = (elapsed / autoplayInterval) * 100;
      const remaining = Math.ceil((autoplayInterval - elapsed) / 1000);
      
      setProgress(Math.min(progressPercent, 100));
      setTimeRemaining(Math.max(remaining, 0));
    }, progressInterval);

    // Scene transition
    intervalRef.current = setTimeout(() => {
      const nextIndex = getNextSceneIndex();
      onSceneChange(nextIndex);
      
      // Clear progress interval
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    }, autoplayInterval);
  }, [autoplayInterval, getNextSceneIndex, onSceneChange]);

  // Stop autoplay
  const stopAutoplay = useCallback(() => {
    if (intervalRef.current) {
      clearTimeout(intervalRef.current);
      intervalRef.current = null;
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    setProgress(0);
    setTimeRemaining(0);
  }, []);

  // Handle autoplay state changes
  useEffect(() => {
    // Pause autoplay if modal is open or if not playing
    if (isPlaying && !isPaused) {
      startAutoplay();
    } else {
      stopAutoplay();
    }

    return () => {
      stopAutoplay();
    };
  }, [isPlaying, isPaused, currentSceneIndex, startAutoplay, stopAutoplay]);

  // Handle play/pause toggle
  const togglePlayback = () => {
    const newPlayState = !isPlaying;
    setIsPlaying(newPlayState);
    onAutoplayToggle?.(newPlayState);
  };

  // Handle manual scene navigation
  const goToNextScene = () => {
    const nextIndex = getNextSceneIndex();
    onSceneChange(nextIndex);
    
    // Restart autoplay if it was playing
    if (isPlaying) {
      stopAutoplay();
      // Small delay to allow scene transition
      setTimeout(() => {
        if (isPlaying) {
          startAutoplay();
        }
      }, 100);
    }
  };

  const goToPreviousScene = () => {
    const prevIndex = getPreviousSceneIndex();
    onSceneChange(prevIndex);
    
    // Restart autoplay if it was playing
    if (isPlaying) {
      stopAutoplay();
      setTimeout(() => {
        if (isPlaying) {
          startAutoplay();
        }
      }, 100);
    }
  };

  // Handle mute toggle
  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  // Pause on user interaction (if enabled)
  useEffect(() => {
    if (!autoPauseOnInteraction) return;

    const handleUserInteraction = () => {
      if (isPlaying) {
        setIsPlaying(false);
        
        // Auto-restart after delay
        setTimeout(() => {
          setIsPlaying(true);
        }, autoRestartDelay);
      }
    };

    // Listen for various user interactions
    const events = ['mousedown', 'touchstart', 'keydown', 'wheel'];
    events.forEach(event => {
      document.addEventListener(event, handleUserInteraction, { passive: true });
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleUserInteraction);
      });
    };
  }, [isPlaying, autoPauseOnInteraction, autoRestartDelay]);

  return (
    <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50">
      <div className="bg-black/80 backdrop-blur-sm text-white rounded-full px-6 py-3 flex items-center gap-4 shadow-2xl border border-white/20">
        {/* Previous Scene */}
        <button
          onClick={goToPreviousScene}
          className="p-2 hover:bg-white/20 rounded-full transition-colors"
          title="Previous scene"
        >
          <SkipBack className="w-5 h-5" />
        </button>

        {/* Play/Pause */}
        <button
          onClick={togglePlayback}
          className="p-3 hover:bg-white/20 rounded-full transition-colors"
          title={isPlaying ? 'Pause autoplay' : 'Start autoplay'}
        >
          {isPlaying ? (
            <Pause className="w-6 h-6" />
          ) : (
            <Play className="w-6 h-6" />
          )}
        </button>

        {/* Next Scene */}
        <button
          onClick={goToNextScene}
          className="p-2 hover:bg-white/20 rounded-full transition-colors"
          title="Next scene"
        >
          <SkipForward className="w-5 h-5" />
        </button>

        {/* Progress Bar */}
        {isPlaying && (
          <div className="flex items-center gap-3 ml-2">
            <div className="w-32 h-1 bg-white/30 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-100 ease-linear ${
                  isPaused ? 'bg-yellow-400' : 'bg-white'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-sm font-mono min-w-[2ch]">
              {isPaused ? 'PAUSED' : `${timeRemaining}s`}
            </span>
          </div>
        )}

        {/* Audio Controls */}
        {tour.background_audio_url && (
          <>
            <div className="w-px h-6 bg-white/30" />
            <button
              onClick={toggleMute}
              className="p-2 hover:bg-white/20 rounded-full transition-colors"
              title={isMuted ? 'Unmute audio' : 'Mute audio'}
            >
              {isMuted ? (
                <VolumeX className="w-5 h-5" />
              ) : (
                <Volume2 className="w-5 h-5" />
              )}
            </button>
          </>
        )}

        {/* Scene Counter */}
        <div className="text-sm text-white/80 ml-2">
          {currentSceneIndex + 1} / {scenes.length}
        </div>
      </div>
    </div>
  );
}