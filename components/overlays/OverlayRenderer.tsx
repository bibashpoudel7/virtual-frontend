'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { Overlay } from '@/types/tour';
import { yawPitchToVector } from '../viewer/multires/geometry';
import { SPHERE_RADIUS } from '../viewer/multires/constants';
import { useUrlParams } from '@/hooks/useUrlParams';

interface OverlayRendererProps {
  overlays: Overlay[];
  onOverlayClick?: (overlay: Overlay) => void;
  onOverlayUpdate?: (overlay: Overlay) => void;
  onModalStateChange?: (isOpen: boolean) => void;
  isEditMode?: boolean;
  viewerWidth: number;
  viewerHeight: number;
  currentYaw: number;
  currentPitch: number;
  fov: number;
  camera?: THREE.PerspectiveCamera | null;
  scene?: THREE.Scene | null;
  overlayGroup?: THREE.Group | null;
  isFullscreen?: boolean;
}

// Create 3D overlay sprite
function createOverlaySprite(overlay: Overlay): THREE.Group {
  const group = new THREE.Group();
  
  // Check for invalid coordinates
  if (isNaN(overlay.yaw) || isNaN(overlay.pitch)) {
    overlay.yaw = 0;
    overlay.pitch = 0;
  }
  
  // Constrain overlay coordinates
  const constrainedYaw = THREE.MathUtils.clamp(overlay.yaw, -180, 180);
  const constrainedPitch = THREE.MathUtils.clamp(overlay.pitch, -80, 80);
  
  const position = yawPitchToVector(constrainedYaw, constrainedPitch, SPHERE_RADIUS);
  group.position.copy(position);
  group.userData.overlay = overlay;
  group.visible = true;
  group.frustumCulled = false;
  
  // Create overlay icon based on type
  const iconTexture = createOverlayIconTexture(overlay.kind);
  const iconMaterial = new THREE.SpriteMaterial({
    map: iconTexture,
    transparent: true,
    depthWrite: false,
    depthTest: true,
  });
  const iconSprite = new THREE.Sprite(iconMaterial);
  iconSprite.scale.setScalar(32);
  iconSprite.renderOrder = 1001;
  iconSprite.frustumCulled = false;
  group.add(iconSprite);
  
  return group;
}

// Create overlay icon texture
function createOverlayIconTexture(kind: string): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');

  if (!context) {
    return new THREE.Texture();
  }

  context.clearRect(0, 0, size, size);
  
  // Get color based on overlay type
  const colors = {
    text: '#3B82F6',
    image: '#10B981',
    video: '#EF4444',
    badge: '#F59E0B',
    tooltip: '#8B5CF6',
    html: '#6366F1'
  };
  
  const color = colors[kind as keyof typeof colors] || '#6B7280';
  
  // Draw main circle
  context.beginPath();
  context.arc(size / 2, size / 2, size * 0.45, 0, 2 * Math.PI);
  context.fillStyle = color;
  context.fill();
  
  // Draw white border
  context.beginPath();
  context.arc(size / 2, size / 2, size * 0.45, 0, 2 * Math.PI);
  context.strokeStyle = '#ffffff';
  context.lineWidth = 6;
  context.stroke();

  // Draw white icon in center
  context.fillStyle = '#ffffff';
  context.strokeStyle = '#ffffff';
  context.lineWidth = 3;
  
  const centerX = size / 2;
  const centerY = size / 2;
  const iconSize = size * 0.18;
  
  if (kind === 'text') {
    // Chat bubble icon
    context.beginPath();
    context.roundRect(centerX - iconSize * 1.2, centerY - iconSize * 0.8, iconSize * 2.4, iconSize * 1.4, 4);
    context.fill();
    context.beginPath();
    context.moveTo(centerX - iconSize * 0.6, centerY + iconSize * 0.6);
    context.lineTo(centerX - iconSize * 0.2, centerY + iconSize * 0.6);
    context.lineTo(centerX - iconSize * 0.6, centerY + iconSize * 1.0);
    context.closePath();
    context.fill();
    
    context.fillStyle = color;
    context.fillRect(centerX - iconSize * 0.8, centerY - iconSize * 0.4, iconSize * 1.6, 2);
    context.fillRect(centerX - iconSize * 0.8, centerY - iconSize * 0.1, iconSize * 1.2, 2);
    
  } else if (kind === 'video') {
    // Play button icon
    context.beginPath();
    context.moveTo(centerX - iconSize * 0.5, centerY - iconSize * 0.8);
    context.lineTo(centerX - iconSize * 0.5, centerY + iconSize * 0.8);
    context.lineTo(centerX + iconSize * 0.8, centerY);
    context.closePath();
    context.fill();
    
  } else if (kind === 'image') {
    // Image icon
    context.strokeStyle = '#ffffff';
    context.lineWidth = 3;
    context.fillStyle = '#ffffff';
    
    context.beginPath();
    context.roundRect(centerX - iconSize * 1.0, centerY - iconSize * 0.8, iconSize * 2.0, iconSize * 1.6, 3);
    context.stroke();
    
    context.beginPath();
    context.arc(centerX + iconSize * 0.4, centerY - iconSize * 0.4, iconSize * 0.25, 0, 2 * Math.PI);
    context.fill();
    
    context.beginPath();
    context.moveTo(centerX - iconSize * 0.6, centerY + iconSize * 0.6);
    context.lineTo(centerX - iconSize * 0.2, centerY - iconSize * 0.1);
    context.lineTo(centerX + iconSize * 0.2, centerY + iconSize * 0.6);
    context.closePath();
    context.fill();
    
  } else {
    // Default icon
    context.font = `bold ${iconSize * 2}px Arial`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('?', centerX, centerY);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export default function OverlayRenderer({
  overlays,
  onOverlayClick,
  onOverlayUpdate,
  onModalStateChange,
  isEditMode = false,
  viewerWidth,
  viewerHeight,
  currentYaw,
  currentPitch,
  fov,
  camera = null,
  scene = null,
  overlayGroup = null,
  isFullscreen = false
}: OverlayRendererProps) {
  const overlaySpritesRef = useRef<Map<string, THREE.Group>>(new Map());
  const [hoveredOverlay, setHoveredOverlay] = useState<Overlay | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null);
  const [expandedOverlay, setExpandedOverlay] = useState<Overlay | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  
  // URL parameter support for direct overlay links
  const { overlayId: urlOverlayId, sceneId: urlSceneId } = useUrlParams();

  // Auto-open overlay from URL parameters
  useEffect(() => {
    if (urlOverlayId && urlSceneId && overlays.length > 0) {
      const targetOverlay = overlays.find(overlay => 
        overlay.id === urlOverlayId && overlay.scene_id === urlSceneId
      );
      
      if (targetOverlay && !isModalOpen) {
        setExpandedOverlay(targetOverlay);
        setIsModalOpen(true);
        
        // Clear any existing hover states when modal opens
        setHoveredOverlay(null);
        setHoverPosition(null);
        
        // Clear URL parameters after opening
        const url = new URL(window.location.href);
        url.searchParams.delete('overlay');
        url.searchParams.delete('scene');
        window.history.replaceState({}, '', url.toString());
      }
    }
  }, [urlOverlayId, urlSceneId, overlays, isModalOpen]);
  
  // Notify parent when modal state changes
  useEffect(() => {
    onModalStateChange?.(isModalOpen);
  }, [isModalOpen, onModalStateChange]);

  // Clear hover states when modal opens/closes
  useEffect(() => {
    if (isModalOpen) {
      // Clear any hover states when modal opens
      setHoveredOverlay(null);
      setHoverPosition(null);
      
      // Clear any pending timeouts
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
    }
  }, [isModalOpen]);

  // Simple hover state for video overlays
  const [videoStates, setVideoStates] = useState<Map<string, {
    isVideoPlaying: boolean;
    hasStartedPlaying: boolean;
  }>>(new Map());
  
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const modalHoverRef = useRef<boolean>(false);
  const lastHoveredOverlayRef = useRef<string | null>(null);

  const formatUrl = (url: string): string => {
    if (!url) return url;
    
    // If URL already has protocol, return as is
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    
    if (url.startsWith('www.') || url.includes('.')) {
      return `https://${url}`;
    }    
    return `https://${url}`;
  };

  useEffect(() => {
    if (!scene || !overlayGroup) {
      return;
    }

    while (overlayGroup.children.length) {
      const child = overlayGroup.children.pop();
      if (!child) continue;
      overlayGroup.remove(child);
      child.traverse((node) => {
        if (node instanceof THREE.Sprite && node.material instanceof THREE.Material) {
          node.material.dispose();
        }
      });
    }
    overlaySpritesRef.current.clear();

    // Add overlay sprites for current scene
    overlays.forEach((overlay) => {
      if (!overlay.id) return;
      
      const sprite = createOverlaySprite(overlay);
      overlayGroup.add(sprite);
      overlaySpritesRef.current.set(overlay.id, sprite);
      
      // Initialize video state for video overlays
      if (overlay.kind === 'video') {
        setVideoStates(prev => {
          const newStates = new Map(prev);
          newStates.set(overlay.id!, {
            isVideoPlaying: false,
            hasStartedPlaying: false
          });
          return newStates;
        });
      }
      
      // Ensure visibility
      sprite.visible = true;
      sprite.children.forEach(child => {
        if (child instanceof THREE.Sprite) {
          child.visible = true;
        }
      });
    });
    
    // Ensure the overlay group itself is visible
    overlayGroup.visible = true;
  }, [overlays, scene, overlayGroup]);

  // Scale overlay sprites based on camera FOV
  useEffect(() => {
    if (!overlayGroup) return;
    
    const spriteScale = THREE.MathUtils.clamp(38 - (fov - 40) * 0.2, 24, 36);
    overlayGroup.children.forEach((child) => {
      if (child instanceof THREE.Group) {
        child.children.forEach((groupChild) => {
          if (groupChild instanceof THREE.Sprite) {
            groupChild.scale.setScalar(spriteScale);
            groupChild.visible = true;
          }
        });
        child.visible = true;
      }
    });
    overlayGroup.visible = true;
  }, [fov, overlayGroup]);

  // Handle advanced hover functionality with better throttling
  const handleOverlayHover = (overlay: Overlay, position: { x: number; y: number }) => {
    // Prevent spam by checking if we're already hovering this overlay
    if (lastHoveredOverlayRef.current === overlay.id) {
      return;
    }
    
    lastHoveredOverlayRef.current = overlay.id || null;
    setHoveredOverlay(overlay);
    setHoverPosition(position);
    
    // Clear any pending timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    
    // Handle video overlay hover - start video with sound attempt
    if (overlay.kind === 'video' && overlay.id) {
      const currentState = videoStates.get(overlay.id);
      
      if (!currentState?.isVideoPlaying) {
        // Try to create a user interaction context for autoplay with sound
        const simulateUserInteraction = () => {
          // Create a temporary button and click it to establish user interaction
          const tempButton = document.createElement('button');
          tempButton.style.position = 'absolute';
          tempButton.style.left = '-9999px';
          tempButton.style.opacity = '0';
          document.body.appendChild(tempButton);
          
          // Simulate click to establish user interaction
          tempButton.click();
          
          // Clean up
          setTimeout(() => {
            document.body.removeChild(tempButton);
          }, 100);
        };
        
        // Simulate user interaction before starting video
        simulateUserInteraction();
        
        setVideoStates(prev => {
          const newStates = new Map(prev);
          newStates.set(overlay.id!, {
            isVideoPlaying: true,
            hasStartedPlaying: true
          });
          return newStates;
        });
      }
    }
  };

  const handleOverlayHoverEnd = (overlay: Overlay) => {
    // Reset the last hovered overlay
    lastHoveredOverlayRef.current = null;
    
    // Don't immediately hide - set a timeout to allow moving to modal
    hoverTimeoutRef.current = setTimeout(() => {
      if (!modalHoverRef.current) {
        setHoveredOverlay(null);
        setHoverPosition(null);
        
        // Stop video if it's a video overlay
        if (overlay.kind === 'video' && overlay.id) {
          const currentState = videoStates.get(overlay.id);
          
          // Only update state if video is currently playing
          if (currentState?.isVideoPlaying) {
            setVideoStates(prev => {
              const newStates = new Map(prev);
              newStates.set(overlay.id!, {
                isVideoPlaying: false,
                hasStartedPlaying: true
              });
              return newStates;
            });
          }
        }
      }
    }, 200);
  };

  const handleModalHover = () => {
    modalHoverRef.current = true;
    
    // Clear any pending timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  };

  const handleModalHoverEnd = () => {
    modalHoverRef.current = false;
    
    // Set timeout to hide modal
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredOverlay(null);
      setHoverPosition(null);
      
      // Stop video if it's currently playing
      if (hoveredOverlay?.kind === 'video' && hoveredOverlay.id) {
        const currentState = videoStates.get(hoveredOverlay.id);
        
        // Only update state if video is currently playing
        if (currentState?.isVideoPlaying) {
          setVideoStates(prev => {
            const newStates = new Map(prev);
            newStates.set(hoveredOverlay.id!, {
              isVideoPlaying: false,
              hasStartedPlaying: true
            });
            return newStates;
          });
        }
      }
    }, 200);
  };

  // Handle mouse events for hover detection with improved throttling
  useEffect(() => {
    if (!scene || !camera || !overlayGroup) return;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let currentHoveredOverlay: Overlay | null = null;
    let lastHoverTime = 0;
    let lastMousePosition = { x: 0, y: 0 };
    const HOVER_THROTTLE = 200;
    const MOUSE_MOVE_THRESHOLD = 10;

    const handleMouseMove = (event: MouseEvent) => {
      // Don't process hover events when modal is open to avoid interference
      if (isModalOpen) return;
      
      const now = Date.now();
      
      // Check if mouse actually moved significantly
      const mouseMoved = Math.abs(event.clientX - lastMousePosition.x) > MOUSE_MOVE_THRESHOLD || 
                        Math.abs(event.clientY - lastMousePosition.y) > MOUSE_MOVE_THRESHOLD;
      
      // Throttle hover detection and only process if mouse moved significantly
      if (now - lastHoverTime < HOVER_THROTTLE || !mouseMoved) {
        return;
      }
      
      lastHoverTime = now;
      lastMousePosition = { x: event.clientX, y: event.clientY };

      // Calculate mouse position in normalized device coordinates
      const rect = (event.target as HTMLElement).getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      // Update the picking ray with the camera and mouse position
      raycaster.setFromCamera(mouse, camera);

      // Calculate objects intersecting the picking ray
      const intersects = raycaster.intersectObjects(overlayGroup.children, true);

      if (intersects.length > 0) {
        // Find the overlay from the intersected object
        let node: THREE.Object3D | null = intersects[0].object;
        while (node && !node.userData?.overlay) {
          node = node.parent;
        }

        if (node && node.userData?.overlay) {
          const overlay = node.userData.overlay as Overlay;
          if (currentHoveredOverlay?.id !== overlay.id) {
            // End hover on previous overlay
            if (currentHoveredOverlay) {
              handleOverlayHoverEnd(currentHoveredOverlay);
            }
            
            currentHoveredOverlay = overlay;
            handleOverlayHover(overlay, { x: event.clientX, y: event.clientY });
          }
        }
      } else {
        if (currentHoveredOverlay) {
          handleOverlayHoverEnd(currentHoveredOverlay);
          currentHoveredOverlay = null;
        }
      }
    };

    const handleMouseLeave = () => {
      if (currentHoveredOverlay) {
        handleOverlayHoverEnd(currentHoveredOverlay);
        currentHoveredOverlay = null;
      }
    };

    // Find the canvas element
    const canvasElement = document.querySelector('canvas');
    
    if (canvasElement) {
      canvasElement.addEventListener('mousemove', handleMouseMove);
      canvasElement.addEventListener('mouseleave', handleMouseLeave);

      return () => {
        canvasElement.removeEventListener('mousemove', handleMouseMove);
        canvasElement.removeEventListener('mouseleave', handleMouseLeave);
      };
    }
  }, [scene, camera, overlayGroup, isModalOpen]);

  // Video Player Component - Enhanced autoplay implementation with memoization
  const VideoPlayerWithContinuity = useCallback(({ 
    videoSrc, 
    videoId, 
    overlayId,
    payload 
  }: { 
    videoSrc: string; 
    videoId: string | null; 
    overlayId: string;
    payload: any;
  }) => {
    const videoState = videoStates.get(overlayId);
    const isPlaying = videoState?.isVideoPlaying || false;
    const [isMuted, setIsMuted] = useState(false); // Start unmuted by default
    const [hasUserInteracted, setHasUserInteracted] = useState(false);
    const [useDirectVideo, setUseDirectVideo] = useState(false);
    const [loadAttempt, setLoadAttempt] = useState(0);
    const [autoplayFailed, setAutoplayFailed] = useState(false);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    
    // Show placeholder if not playing
    if (!isPlaying) {
      return (
        <div 
          className="bg-gray-800 rounded flex items-center justify-center"
          style={{
            width: payload.width ? `${payload.width}px` : '100%',
            height: payload.height ? `${payload.height}px` : '192px'
          }}
        >
          <div className="text-center">
            <svg className="w-12 h-12 text-gray-500 mx-auto mb-2" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
            <p className="text-gray-400 text-sm">Hover over video icon to play</p>
          </div>
        </div>
      );
    }

    // Show error if no video ID
    if (!videoId) {
      return (
        <div 
          className="bg-red-900 rounded flex items-center justify-center"
          style={{
            width: payload.width ? `${payload.width}px` : '100%',
            height: payload.height ? `${payload.height}px` : '192px'
          }}
        >
          <div className="text-center">
            <p className="text-red-400 text-sm">Invalid video URL</p>
            <p className="text-red-300 text-xs mt-1">Could not extract video ID</p>
          </div>
        </div>
      );
    }

    // Auto-start video when component mounts and is playing
    useEffect(() => {
      if (isPlaying && iframeRef.current && !hasUserInteracted) {
        // Create a hidden video element to test autoplay capabilities
        const testVideo = document.createElement('video');
        testVideo.muted = false;
        testVideo.autoplay = true;
        testVideo.style.position = 'absolute';
        testVideo.style.left = '-9999px';
        testVideo.style.width = '1px';
        testVideo.style.height = '1px';
        
        // Test if autoplay with sound is possible
        const testAutoplay = async () => {
          try {
            document.body.appendChild(testVideo);
            await testVideo.play();
            // If we get here, autoplay with sound is allowed
            setAutoplayFailed(false);
            setIsMuted(false);
          } catch (e) {
            // Autoplay with sound failed, fallback to muted
            setAutoplayFailed(true);
            setIsMuted(true);
          } finally {
            if (document.body.contains(testVideo)) {
              document.body.removeChild(testVideo);
            }
          }
        };
        
        testAutoplay();
        
        // Try to trigger autoplay via postMessage after a short delay
        const timeoutId = setTimeout(() => {
          if (iframeRef.current) {
            try {
              // Try to play with sound first
              iframeRef.current.contentWindow?.postMessage(
                '{"event":"command","func":"playVideo","args":""}', 
                '*'
              );
              if (!autoplayFailed) {
                iframeRef.current.contentWindow?.postMessage(
                  '{"event":"command","func":"unMute","args":""}', 
                  '*'
                );
              }
            } catch (e) {
              // If it fails, try muted autoplay
              setAutoplayFailed(true);
              setIsMuted(true);
            }
          }
        }, 800);
        
        return () => clearTimeout(timeoutId);
      }
    }, [isPlaying, videoId, hasUserInteracted, autoplayFailed]);

    // Handle unmute click (force reload with sound)
    const handleUnmute = () => {
      setIsMuted(false);
      setHasUserInteracted(true);
      setAutoplayFailed(false);
      
      // Force iframe reload with unmuted parameters
      setLoadAttempt(prev => prev + 1);
    };

    // Try direct video approach if iframe fails
    const handleIframeError = () => {
      setUseDirectVideo(true);
    };

    // Enhanced embed URL - try with sound first, fallback to muted
    const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=${(isMuted || autoplayFailed) ? 1 : 0}&controls=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}&loop=0&fs=1&cc_load_policy=0&iv_load_policy=3&autohide=1&start=0&html5=1&wmode=opaque&vq=hd720&t=0s`;

    return (
      <div 
        className="rounded overflow-hidden bg-black relative"
        style={{
          width: payload.width ? `${payload.width}px` : '100%',
          height: payload.height ? `${payload.height}px` : '192px'
        }}
      >
        {!useDirectVideo ? (
          // Primary iframe approach with aggressive autoplay
          <iframe
            ref={iframeRef}
            key={`${videoId}-${isMuted ? 'muted' : 'unmuted'}-${loadAttempt}`}
            src={embedUrl}
            className="w-full h-full"
            style={{ border: 'none' }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            title="Video preview"
            onLoad={() => {
              // Silently handle iframe load
            }}
            onError={handleIframeError}
          />
        ) : (
          // Fallback: Show thumbnail with direct YouTube link
          <div className="w-full h-full relative">
            <img 
              src={`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`}
              alt="Video thumbnail"
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
              }}
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
              <button
                onClick={() => window.open(formatUrl(videoSrc), '_blank')}
                className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg flex items-center gap-2 transition-colors shadow-lg"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
                Play Video
              </button>
            </div>
          </div>
        )}
        
        {/* Unmute button overlay - only show if autoplay failed or muted */}
        {!useDirectVideo && (isMuted || autoplayFailed) && !hasUserInteracted && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 z-10">
            <button
              onClick={handleUnmute}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-lg"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
              </svg>
              {autoplayFailed ? 'Click for sound' : 'Click to unmute'}
            </button>
          </div>
        )}
      </div>
    );
  }, [videoStates]);

  // Render hover tooltip
  const renderHoverTooltip = () => {
    // Don't show hover tooltip when modal is open
    if (!hoveredOverlay || !hoverPosition || isModalOpen) return null;

    let payload: any = {};
    try {
      payload = typeof hoveredOverlay.payload === 'string' 
        ? JSON.parse(hoveredOverlay.payload) 
        : hoveredOverlay.payload || {};
    } catch {
      payload = {};
    }

    // Calculate tooltip position to avoid going off-screen
    const tooltipWidth = hoveredOverlay.kind === 'text' ? 300 : 400;
    const tooltipHeight = hoveredOverlay.kind === 'text' ? 150 : 300;
    const arrowSize = hoveredOverlay.kind === 'text' ? 10 : 8;
    
    // Get the overlay icon's 3D position and convert to screen coordinates
    let iconScreenPosition = { x: hoverPosition.x, y: hoverPosition.y };
    
    // Try to get more accurate screen position from the 3D overlay sprite
    if (camera && hoveredOverlay.id) {
      const overlaySprite = overlaySpritesRef.current.get(hoveredOverlay.id);
      if (overlaySprite) {
        const vector = overlaySprite.position.clone();
        vector.project(camera);
        
        // Convert to screen coordinates
        const canvas = document.querySelector('canvas');
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          const screenX = (vector.x * 0.5 + 0.5) * rect.width + rect.left;
          const screenY = (vector.y * -0.5 + 0.5) * rect.height + rect.top;
          
          // Only use projected position if it's reasonable
          const distance = Math.sqrt(
            Math.pow(screenX - hoverPosition.x, 2) + 
            Math.pow(screenY - hoverPosition.y, 2)
          );
          
          if (distance < 100) {
            iconScreenPosition = { x: screenX, y: screenY };
          }
        }
      }
    }
    
    // Calculate tooltip position relative to icon with proper spacing for each type
    let tooltipLeft = iconScreenPosition.x - tooltipWidth / 2;
    let tooltipTop, arrowDirection;
    
    // Different spacing based on overlay type
    if (hoveredOverlay.kind === 'text') {
      // Text overlays: very close to icon
      tooltipTop = iconScreenPosition.y - tooltipHeight - arrowSize - 5;
      arrowDirection = 'down';
    } else {
      // Image/Video overlays: more space to prevent overlap
      tooltipTop = iconScreenPosition.y - tooltipHeight - arrowSize - 25;
      arrowDirection = 'down';
    }
    
    // Adjust if tooltip would go off screen edges
    const screenPadding = 20;
    
    // Horizontal adjustments
    if (tooltipLeft < screenPadding) {
      tooltipLeft = screenPadding;
    } else if (tooltipLeft + tooltipWidth > window.innerWidth - screenPadding) {
      tooltipLeft = window.innerWidth - tooltipWidth - screenPadding;
    }
    
    // Vertical adjustments
    if (tooltipTop < screenPadding) {
      // Not enough space above, show below icon
      if (hoveredOverlay.kind === 'text') {
        tooltipTop = iconScreenPosition.y + 15; 
      } else {
        tooltipTop = iconScreenPosition.y + 35; 
      }
      arrowDirection = 'up'; 
    }
    
    // Calculate arrow position relative to icon position
    const arrowLeft = Math.max(
      arrowSize,
      Math.min(
        tooltipWidth - arrowSize,
        iconScreenPosition.x - tooltipLeft
      )
    );

    return (
      <div
        className="fixed pointer-events-auto z-[400] animate-in fade-in-0 zoom-in-95 duration-200"
        style={{
          left: tooltipLeft,
          top: tooltipTop,
        }}
        onMouseEnter={handleModalHover}
        onMouseLeave={handleModalHoverEnd}
      >
        <div className="bg-gray-900 text-white rounded-lg shadow-2xl border border-gray-700 overflow-hidden relative" 
             style={{ 
               minWidth: hoveredOverlay.kind === 'text' ? '250px' : '320px', 
               maxWidth: hoveredOverlay.kind === 'text' ? '350px' : '450px' 
             }}>
          {/* Header */}
          <div className="flex items-center justify-between p-4 pb-3 border-b border-gray-700">
            <h3 className="font-semibold text-lg capitalize flex items-center gap-2">
              {/* Icon based on overlay type */}
              {hoveredOverlay.kind === 'text' && (
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-1l-4 4z" />
                </svg>
              )}
              {hoveredOverlay.kind === 'image' && (
                <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              )}
              {hoveredOverlay.kind === 'video' && (
                <div className="w-5 h-5 bg-red-500 rounded flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                </div>
              )}
              {hoveredOverlay.kind === 'image' ? 'Image Gallery' : 
               hoveredOverlay.kind === 'video' ? 'Video Content' : 
               hoveredOverlay.kind}
            </h3>
          </div>
          
          {/* Content */}
          <div className={hoveredOverlay.kind === 'text' ? 'p-3' : 'p-4'}>
            {/* Content based on overlay type */}
            {hoveredOverlay.kind === 'text' && (
              <div className="text-gray-200 leading-relaxed text-sm">
                {payload.text || 'No text content available'}
              </div>
            )}
          
          {hoveredOverlay.kind === 'image' && (
            <div>
              {payload.imageUrl && (
                <div className="mb-3">
                  <img
                    src={payload.imageUrl}
                    alt={payload.alt || 'Overlay image'}
                    className="object-cover rounded"
                    style={{
                      width: payload.width ? `${payload.width}px` : '100%',
                      height: payload.height ? `${payload.height}px` : '192px'
                    }}
                    onError={(e) => {
                      e.currentTarget.src = '/placeholder-image.jpg';
                    }}
                  />
                </div>
              )}
              {payload.description && (
                <p className="text-gray-200 text-sm leading-relaxed mb-3">
                  {payload.description}
                </p>
              )}
              <div className="border-t border-gray-700 pt-3">
                <button 
                  className="text-blue-400 hover:text-blue-300 text-sm font-medium border-b border-blue-400 hover:border-blue-300 transition-colors cursor-pointer"
                  onClick={() => {
                    setExpandedOverlay(hoveredOverlay);
                    setIsModalOpen(true);
                    setHoveredOverlay(null);
                    setHoverPosition(null);
                  }}
                >
                  View more
                </button>
              </div>
            </div>
          )}
          
          {hoveredOverlay.kind === 'video' && hoveredOverlay.id && (
            <div>
              {/* Video Preview Area */}
              <div className="mb-3 relative">
                {payload.videoUrl ? (
                  (() => {
                    // Extract YouTube video ID from various URL formats
                    let videoId = null;
                    let videoSrc = payload.videoUrl;
                    
                    // Handle different YouTube URL formats
                    if (videoSrc.includes('youtube.com/watch?v=')) {
                      videoId = videoSrc.split('v=')[1]?.split('&')[0];
                    } else if (videoSrc.includes('youtu.be/')) {
                      videoId = videoSrc.split('youtu.be/')[1]?.split('?')[0];
                    } else if (videoSrc.includes('youtube.com/embed/')) {
                      videoId = videoSrc.split('/embed/')[1]?.split('?')[0];
                    }

                    return (
                      <VideoPlayerWithContinuity 
                        videoSrc={videoSrc} 
                        videoId={videoId} 
                        overlayId={hoveredOverlay.id!}
                        payload={payload} 
                      />
                    );
                  })()
                ) : (
                  <div 
                    className="bg-gray-800 rounded flex items-center justify-center"
                    style={{
                      width: payload.width ? `${payload.width}px` : '100%',
                      height: payload.height ? `${payload.height}px` : '192px'
                    }}
                  >
                    <div className="text-center">
                      <svg className="w-12 h-12 text-gray-500 mx-auto mb-2" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                      <p className="text-gray-400 text-sm">No video available</p>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Video Description */}
              {payload.description && (
                <p className="text-gray-200 text-sm leading-relaxed mb-3">
                  {payload.description}
                </p>
              )}
              
              {/* Simple autoplay status */}
              {/* <div className="text-gray-400 text-xs mb-3">
                {(() => {
                  const currentVideoState = videoStates.get(hoveredOverlay.id!);
                  return currentVideoState?.isVideoPlaying ? (
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                      <span>Video is playing</span>
                    </div>
                  ) : (
                    <span>Hover over the video icon to start playback</span>
                  );
                })()}
              </div> */}
              
              {/* View More Button */}
              <div className="border-t border-gray-700 pt-3">
                <button 
                  className="text-blue-400 hover:text-blue-300 text-sm font-medium border-b border-blue-400 hover:border-blue-300 transition-colors cursor-pointer"
                  onClick={() => {
                    setExpandedOverlay(hoveredOverlay);
                    setIsModalOpen(true);
                    setHoveredOverlay(null);
                    setHoverPosition(null);
                  }}
                >
                  View more
                </button>
              </div>
            </div>
          )}
          
          {hoveredOverlay.kind === 'badge' && (
            <div className="text-center">
              <div 
                className="inline-block px-3 py-1 rounded-full text-sm font-bold mb-2"
                style={{ backgroundColor: payload.color || '#EF4444', color: 'white' }}
              >
                {payload.text || 'BADGE'}
              </div>
            </div>
          )}
          
          {hoveredOverlay.kind === 'tooltip' && (
            <div className="text-gray-200 text-sm leading-relaxed">
              {payload.text || 'Tooltip information'}
            </div>
          )}
          
          {hoveredOverlay.kind === 'html' && (
            <div>
              <h4 className="font-semibold text-lg mb-2">Custom Content</h4>
              <div 
                className="text-sm leading-relaxed text-gray-200"
                dangerouslySetInnerHTML={{ __html: payload.html || '<p>Custom HTML content</p>' }}
              />
            </div>
          )}
          </div>
        </div>
        
        {/* Dynamic Arrow pointing to overlay icon */}
        {arrowDirection === 'down' ? (
          <div 
            className="absolute top-full"
            style={{
              left: `${arrowLeft}px`,
              transform: 'translateX(-50%)'
            }}
          >
            <div 
              className="border-l-transparent border-r-transparent border-t-gray-900"
              style={{
                width: 0,
                height: 0,
                borderLeftWidth: `${arrowSize}px`,
                borderRightWidth: `${arrowSize}px`,
                borderTopWidth: `${arrowSize}px`,
                borderStyle: 'solid'
              }}
            ></div>
          </div>
        ) : (
          <div 
            className="absolute bottom-full"
            style={{
              left: `${arrowLeft}px`,
              transform: 'translateX(-50%)'
            }}
          >
            <div 
              className="border-l-transparent border-r-transparent border-b-gray-900"
              style={{
                width: 0,
                height: 0,
                borderLeftWidth: `${arrowSize}px`,
                borderRightWidth: `${arrowSize}px`,
                borderBottomWidth: `${arrowSize}px`,
                borderStyle: 'solid'
              }}
            ></div>
          </div>
        )}
      </div>
    );
  };

  // Render expanded modal (Matterport-style)
  const renderExpandedModal = () => {
    if (!isModalOpen || !expandedOverlay) return null;

    let payload: any = {};
    try {
      payload = typeof expandedOverlay.payload === 'string' 
        ? JSON.parse(expandedOverlay.payload) 
        : expandedOverlay.payload || {};
    } catch {
      payload = {};
    }

    // Handle copy link functionality
    const handleCopyLink = async () => {
      try {
        const currentUrl = window.location.href;
        const url = new URL(currentUrl);
        url.searchParams.set('overlay', expandedOverlay.id || '');
        url.searchParams.set('scene', expandedOverlay.scene_id);
        
        await navigator.clipboard.writeText(url.toString());
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      } catch (error) {
        console.error('Failed to copy link:', error);
      }
    };

    return (
      <>
        {/* Right Sidebar - positioned absolutely, doesn't interfere with canvas */}
        <div className="fixed top-0 right-0 w-80 h-full bg-white shadow-2xl overflow-y-auto z-[500] pointer-events-auto">
          {/* Close button - top right with dark color */}
          <button
            onClick={() => {
              setIsModalOpen(false);
              setExpandedOverlay(null);
            }}
            className="absolute top-4 right-4 text-gray-800 hover:text-gray-600 transition-colors z-10 cursor-pointer"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div className="p-6 pt-16">
            {/* Horizontal line */}
            <div className="border-t border-gray-200 mb-6"></div>

            {/* Image content in sidebar */}
            {expandedOverlay.kind === 'image' && payload.imageUrl && (
              <div className="mb-4">
                {/* Image header with icon and text */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <span className="text-lg font-medium text-gray-700">Image</span>
                </div>
                
                <img
                  src={payload.imageUrl}
                  alt={payload.alt || 'Overlay image'}
                  className="w-full h-48 object-cover rounded-lg"
                  onError={(e) => {
                    e.currentTarget.src = '/placeholder-image.jpg';
                  }}
                />
              </div>
            )}

            {/* Video content in sidebar */}
            {expandedOverlay.kind === 'video' && payload.videoUrl && (
              <div className="mb-4">
                {/* Video header with icon and text */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  </div>
                  <span className="text-lg font-medium text-gray-700">Video</span>
                </div>
                
                {(() => {
                  // Extract YouTube video ID from various URL formats
                  let videoId = null;
                  let videoSrc = payload.videoUrl;
                  
                  if (videoSrc.includes('youtube.com/watch?v=')) {
                    videoId = videoSrc.split('v=')[1]?.split('&')[0];
                  } else if (videoSrc.includes('youtu.be/')) {
                    videoId = videoSrc.split('youtu.be/')[1]?.split('?')[0];
                  } else if (videoSrc.includes('youtube.com/embed/')) {
                    videoId = videoSrc.split('/embed/')[1]?.split('?')[0];
                  }

                  const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=0&controls=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}&loop=0&fs=1&cc_load_policy=0&iv_load_policy=3&autohide=1&start=0&html5=1&wmode=opaque&vq=hd720`;

                  return (
                    <iframe
                      src={embedUrl}
                      className="w-full h-48 rounded-lg"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      title="Video content"
                    />
                  );
                })()}
              </div>
            )}

            {/* Title with share icon - NOW BELOW image/video */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900 flex-1 pr-4 leading-tight">
                {payload.title || (
                  expandedOverlay.kind === 'image' ? 'Image Gallery' : 
                  expandedOverlay.kind === 'video' ? 'Video Content' : 
                  'Information'
                )}
              </h2>
              
              {/* Share icon with hover tooltip and click feedback */}
              <div className="relative flex-shrink-0">
                <button
                  onClick={handleCopyLink}
                  className="p-1 text-gray-600 hover:text-gray-800 transition-colors group cursor-pointer flex items-center justify-center"
                  title="Copy Link"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
                  </svg>
                </button>
                
                {/* Hover tooltip */}
                <div className="absolute bottom-full right-0 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <div className="bg-gray-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                    Copy Link
                  </div>
                </div>
                
                {/* Success message - positioned below the icon to avoid overlap */}
                {copySuccess && (
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1">
                    <span className="text-green-600 font-medium text-sm whitespace-nowrap bg-white px-2 py-1 rounded shadow-sm border">
                      Copied!
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Text content display */}
            {expandedOverlay.kind === 'text' && payload.text && (
              <div className="mb-6">
                {/* Text header with icon and text */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-1l-4 4z" />
                    </svg>
                  </div>
                  <span className="text-lg font-medium text-gray-700">Text</span>
                </div>
                
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-gray-800 leading-relaxed">
                    {payload.text}
                  </p>
                </div>
              </div>
            )}

            {/* Description - NOW directly below title */}
            {payload.description && (
              <div className="mb-6">
                <p className="text-gray-700 leading-relaxed">
                  {payload.description}
                </p>
              </div>
            )}

            {/* Action buttons */}
            <div className="space-y-3">
              {(payload.clickUrl || payload.imageUrl || payload.videoUrl) && (
                <button
                  onClick={() => {
                    const url = payload.clickUrl || payload.imageUrl || payload.videoUrl;
                    if (url) {
                      const formattedUrl = formatUrl(url);
                      window.open(formattedUrl, '_blank', 'noopener,noreferrer');
                    }
                  }}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-lg transition-colors font-medium cursor-pointer"
                >
                  View Original
                </button>
              )}
            </div>
          </div>
        </div>
      </>
    );
  };

  // Cleanup timeouts
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  return (
    <>
      {/* Render hover tooltip */}
      {renderHoverTooltip()}
      
      {/* Render expanded modal */}
      {renderExpandedModal()}
    </>
  );
}