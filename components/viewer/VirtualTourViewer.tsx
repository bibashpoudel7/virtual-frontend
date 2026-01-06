'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Tour, Scene, Hotspot } from '@/types/tour';
import TourEditor from './TourEditor';

// frontend/components/viewer/VirtualTourViewer.tsx
interface VirtualTourViewerProps {
  tour: Tour;
  currentScene: Scene;
  scenes: Scene[];
  onSceneChange?: (sceneId: string) => void;
  onHotspotClick?: (hotspot: Hotspot) => void;
  onAutoplayPause?: () => void;
}

export default function VirtualTourViewer({
  tour,
  currentScene,
  onSceneChange,
  onHotspotClick,
  scenes,
  onAutoplayPause
}: VirtualTourViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const animationIdRef = useRef<number | null>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAutoplay, setIsAutoplay] = useState(tour.autoplay_enabled || false);
  
  // State for pause icon animation
  const [showPauseIcon, setShowPauseIcon] = useState(false);
  
  // Audio controls state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  
  // Mouse/touch controls state
  const mouseDown = useRef(false);
  const mouseX = useRef(0);
  const mouseY = useRef(0);
  const startMouseX = useRef(0); 
  const startMouseY = useRef(0);
  const lon = useRef(currentScene.yaw || 0);
  const lat = useRef(currentScene.pitch || 0);
  const phi = useRef(0);
  const theta = useRef(0);

  // Check if scene has multiresolution tiles
  const hasMultires = Boolean(currentScene.tiles_manifest);
  
  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    
    // Scene setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      currentScene.fov || tour.default_fov || 75,
      container.clientWidth / container.clientHeight,
      0.1,
      1100
    );
    camera.position.set(0, 0, 0.1);
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Load panorama
    loadPanorama();

    // Animation loop
    function animate() {
      animationIdRef.current = requestAnimationFrame(animate);

      // Auto-rotate if enabled
      if (isAutoplay && !mouseDown.current) {
        lon.current += tour.default_yaw_speed || 0.5;
      }

      // Update camera rotation
      lat.current = Math.max(-85, Math.min(85, lat.current));
      phi.current = THREE.MathUtils.degToRad(90 - lat.current);
      theta.current = THREE.MathUtils.degToRad(lon.current);

      const target = new THREE.Vector3();
      target.x = 500 * Math.sin(phi.current) * Math.cos(theta.current);
      target.y = 500 * Math.cos(phi.current);
      target.z = 500 * Math.sin(phi.current) * Math.sin(theta.current);

      camera.lookAt(target);
      renderer.render(scene, camera);
    }

    async function loadPanorama() {
      try {
        setIsLoading(true);
        setError(null);

        // Clear existing geometry
        while(scene.children.length > 0) {
          const child = scene.children[0];
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            if (child.material instanceof THREE.Material) {
              child.material.dispose();
            } else if (Array.isArray(child.material)) {
              child.material.forEach(mat => mat.dispose());
            }
          }
          scene.remove(child);
        }

        // Check if scene has any image source
        if (!currentScene.cubemap_manifest_url && !currentScene.src_original_url) {
          // No image uploaded yet - show placeholder
          setError('No image uploaded for this scene yet. Please upload a 360° image in Scene Management.');
          setIsLoading(false);
          return;
        }

        // Prefer equirectangular for simplicity (single image instead of 6 faces)
        // You can switch the order if you prefer cubemap
        if (currentScene.cubemap_manifest_url) {
          await loadCubemap();
        } else if (currentScene.src_original_url) {
          loadEquirectangular();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load panorama');
        setIsLoading(false);
      }
    }

    async function loadCubemap() {
      try {
        
        // Fetch manifest
        const response = await fetch(currentScene.cubemap_manifest_url!);
        if (!response.ok) throw new Error('Failed to fetch manifest');
        
        const manifest = await response.json();
        console.log('Manifest loaded:', manifest);
        
        // Load textures for each face
        const textureLoader = new THREE.TextureLoader();
        const materials = [];
        
        // Order for Three.js BoxGeometry: [+X, -X, +Y, -Y, +Z, -Z]
        const faceOrder = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
        
        for (const face of faceOrder) {
          const texture = await textureLoader.loadAsync(manifest.faces[face]);
          materials.push(new THREE.MeshBasicMaterial({ 
            map: texture,
            side: THREE.BackSide
          }));
        }

        // Create skybox
        const geometry = new THREE.BoxGeometry(1000, 1000, 1000);
        const skybox = new THREE.Mesh(geometry, materials);
        scene.add(skybox);
        
        setIsLoading(false);
      } catch (err) {
        // Fallback to equirectangular if available
        if (currentScene.src_original_url) {
          loadEquirectangular();
        } else {
          throw err;
        }
      }
    }

    function loadEquirectangular() {
      console.log('Loading equirectangular from:', currentScene.src_original_url);
      const textureLoader = new THREE.TextureLoader();
      
      textureLoader.load(
        currentScene.src_original_url!,
        (texture) => {
          // Fix upside-down issue by flipping the texture
          texture.wrapS = THREE.RepeatWrapping;
          texture.repeat.x = -1; // Flip horizontally if needed
          
          // Create sphere geometry for equirectangular projection
          const geometry = new THREE.SphereGeometry(500, 60, 40);
          // Flip the geometry inside out and correct orientation
          geometry.scale(-1, 1, 1);
          geometry.rotateY(Math.PI); // Rotate 180 degrees to fix orientation
          
          const material = new THREE.MeshBasicMaterial({
            map: texture,
            side: THREE.DoubleSide
          });
          
          const mesh = new THREE.Mesh(geometry, material);
          scene.add(mesh);
          
          console.log('Equirectangular loaded successfully');
          setIsLoading(false);
        },
        (progress) => {
          // Progress callback
          console.log('Loading progress:', progress);
        },
        (error) => {
          console.error('Error loading texture:', error);
          setError('Failed to load panorama image');
          setIsLoading(false);
        }
      );
    }

    // Mouse controls
    function onMouseDown(event: MouseEvent) {
      event.preventDefault();
      mouseDown.current = true;
      mouseX.current = event.clientX;
      mouseY.current = event.clientY;
      startMouseX.current = event.clientX;
      startMouseY.current = event.clientY;
    }

    function onMouseMove(event: MouseEvent) {
      if (!mouseDown.current) return;
      
      // Disable autoplay when user starts dragging
      if (isAutoplay) {
        setIsAutoplay(false);
      }
      
      lon.current += (event.clientX - mouseX.current) * 0.15;
      lat.current -= (event.clientY - mouseY.current) * 0.15;
      
      mouseX.current = event.clientX;
      mouseY.current = event.clientY;
    }

    function onMouseUp() {
      mouseDown.current = false;
    }

    function onMouseClick(event: MouseEvent) {
      // Click anywhere during autoplay to pause
      // Only pause if it was a click (not a drag) and autoplay is active
      const dragDistance = Math.sqrt(
        Math.pow(event.clientX - startMouseX.current, 2) + 
        Math.pow(event.clientY - startMouseY.current, 2)
      );
      
      if (isAutoplay && dragDistance < 5) {
        onAutoplayPause?.();
        // Show pause icon animation
        setShowPauseIcon(true);
        setTimeout(() => setShowPauseIcon(false), 1000); // Hide after 1 second
      }
    }

    function onMouseWheel(event: WheelEvent) {
      event.preventDefault();
      const fov = camera.fov + event.deltaY * 0.05;
      camera.fov = THREE.MathUtils.clamp(fov, 10, 100);
      camera.updateProjectionMatrix();
    }

    // Touch controls for mobile
    function onTouchStart(event: TouchEvent) {
      event.preventDefault();
      const touch = event.touches[0];
      mouseDown.current = true;
      mouseX.current = touch.clientX;
      mouseY.current = touch.clientY;
      startMouseX.current = touch.clientX;
      startMouseY.current = touch.clientY;
    }

    function onTouchMove(event: TouchEvent) {
      if (!mouseDown.current) return;
      event.preventDefault();
      
      // Disable autoplay when user starts dragging
      if (isAutoplay) {
        setIsAutoplay(false);
      }
      
      const touch = event.touches[0];
      lon.current += (touch.clientX - mouseX.current) * 0.15;
      lat.current -= (touch.clientY - mouseY.current) * 0.15;
      
      mouseX.current = touch.clientX;
      mouseY.current = touch.clientY;
    }

    function onTouchEnd() {
      mouseDown.current = false;
    }

    function onTouchClick(event: TouchEvent) {
      // Tap anywhere during autoplay to pause
      // Only pause if it was a tap (not a drag) and autoplay is active
      const touch = event.changedTouches[0];
      const dragDistance = Math.sqrt(
        Math.pow(touch.clientX - startMouseX.current, 2) + 
        Math.pow(touch.clientY - startMouseY.current, 2)
      );
      
      if (isAutoplay && dragDistance < 5) {
        onAutoplayPause?.();
        // Show pause icon animation
        setShowPauseIcon(true);
        setTimeout(() => setShowPauseIcon(false), 1000); // Hide after 1 second
      }
    }

    // Window resize handler
    function onWindowResize() {
      if (!container || !camera || !renderer) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    }

    // Add event listeners
    renderer.domElement.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('click', onMouseClick);
    renderer.domElement.addEventListener('wheel', onMouseWheel);
    
    renderer.domElement.addEventListener('touchstart', onTouchStart);
    renderer.domElement.addEventListener('touchmove', onTouchMove);
    renderer.domElement.addEventListener('touchend', onTouchEnd);
    renderer.domElement.addEventListener('touchend', onTouchClick);
    
    window.addEventListener('resize', onWindowResize);

    // Start animation
    animate();

    // Cleanup
    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      renderer.domElement.removeEventListener('click', onMouseClick);
      renderer.domElement.removeEventListener('wheel', onMouseWheel);
      
      renderer.domElement.removeEventListener('touchstart', onTouchStart);
      renderer.domElement.removeEventListener('touchmove', onTouchMove);
      renderer.domElement.removeEventListener('touchend', onTouchEnd);
      renderer.domElement.removeEventListener('touchend', onTouchClick);
      
      window.removeEventListener('resize', onWindowResize);
      
      // Dispose of Three.js resources
      if (sceneRef.current) {
        sceneRef.current.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            if (child.material instanceof THREE.Material) {
              child.material.dispose();
            } else if (Array.isArray(child.material)) {
              child.material.forEach(mat => mat.dispose());
            }
          }
        });
      }
      
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [currentScene.id]); // Re-initialize when scene changes

  // Update view when scene settings change
  useEffect(() => {
    lon.current = currentScene.yaw || 0;
    lat.current = currentScene.pitch || 0;
    if (cameraRef.current) {
      cameraRef.current.fov = currentScene.fov || tour.default_fov || 75;
      cameraRef.current.updateProjectionMatrix();
    }
  }, [currentScene.yaw, currentScene.pitch, currentScene.fov, currentScene.id, tour.default_fov]);

  // Update autoplay state
  useEffect(() => {
    setIsAutoplay(tour.autoplay_enabled || false);
  }, [tour.autoplay_enabled]);

  // Client-side only flag
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Initialize background audio
  useEffect(() => {
    if (!isClient) return;
    if (tour.background_audio_url) {
      const audio = new Audio(tour.background_audio_url);
      audio.loop = true;
      audio.volume = 0.5; // Set default volume to 50%
      
      audio.addEventListener('canplay', () => {
        console.log('Background audio loaded successfully');
        setAudioError(null);
      });
      
      audio.addEventListener('error', (e) => {
        console.error('Background audio error:', e);
        setAudioError('Failed to load background audio');
      });
      
      audio.addEventListener('play', () => setIsAudioPlaying(true));
      audio.addEventListener('pause', () => setIsAudioPlaying(false));
      
      audioRef.current = audio;
      
      return () => {
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
        }
      };
    }
  }, [tour.background_audio_url, isClient]);

  // Audio control functions
  const toggleAudio = () => {
    if (!audioRef.current) return;
    
    if (isAudioPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(err => {
        console.error('Failed to play audio:', err);
        setAudioError('Failed to play audio. User interaction may be required.');
      });
    }
  };

  const toggleAudioMute = () => {
    if (!audioRef.current) return;
    
    audioRef.current.muted = !audioRef.current.muted;
    setIsAudioMuted(audioRef.current.muted);
  };

  // Hotspot calculation (projected to 2D screen coordinates)
  const getHotspotScreenPosition = (hotspot: Hotspot) => {
    if (!cameraRef.current || !rendererRef.current) return null;

    // Convert hotspot spherical coordinates to 3D position
    const hotspotPhi = THREE.MathUtils.degToRad(90 - hotspot.pitch);
    const hotspotTheta = THREE.MathUtils.degToRad(hotspot.yaw);
    
    const vector = new THREE.Vector3(
      500 * Math.sin(hotspotPhi) * Math.cos(hotspotTheta),
      500 * Math.cos(hotspotPhi),
      500 * Math.sin(hotspotPhi) * Math.sin(hotspotTheta)
    );

    // Project to screen coordinates
    vector.project(cameraRef.current);

    // Check if behind camera
    if (vector.z > 1) return null;

    // Convert to screen coordinates
    const x = (vector.x * 0.5 + 0.5) * rendererRef.current.domElement.clientWidth;
    const y = (-vector.y * 0.5 + 0.5) * rendererRef.current.domElement.clientHeight;

    return { x, y };
  };

  const handleHotspotClick = (hotspot: Hotspot) => {
    if (hotspot.kind === 'navigation') {
      // Check if payload contains targetSceneId
      if (hotspot.payload) {
        try {
          const payload = typeof hotspot.payload === 'string' 
            ? JSON.parse(hotspot.payload) 
            : hotspot.payload;
          
          if (payload.targetSceneId || payload.targetSceneID) {
            const targetId = payload.targetSceneId || payload.targetSceneID;
            onSceneChange?.(targetId);
          }
        } catch (err) {
          console.error('Failed to parse hotspot payload:', err);
        }
      }
      // Also check target_scene_id field directly (backend structure)
      else if (hotspot.target_scene_id) {
        onSceneChange?.(hotspot.target_scene_id);
      }
    }
    onHotspotClick?.(hotspot);
  };

  // If multiresolution tiles are available, use the TourEditor/MultiresViewer
  if (hasMultires) {
    return <TourEditor 
      tour={tour} 
      scenes={scenes}
    />;
  }

  return (
    <div className="absolute inset-0 bg-black">
      <div
        ref={containerRef}
        className="relative w-full h-full"
        style={{ cursor: mouseDown.current ? 'grabbing' : 'grab' }}
      />

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="text-white text-center bg-black bg-opacity-50 p-4 rounded">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mb-4 mx-auto"></div>
            <p>Loading 360° panorama...</p>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="text-center bg-white bg-opacity-95 p-8 rounded-lg shadow-lg max-w-md mx-4">
            <div className="text-gray-400 mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Scene Image Required</h3>
            <p className="text-gray-600 mb-4">{error}</p>
            <p className="text-sm text-gray-500">Go to Scene Management to upload a 360° image for this scene.</p>
          </div>
        </div>
      )}

      {/* Hotspots overlay */}
      {!isLoading && !error && currentScene.hotspots?.map((hotspot) => {
        const position = getHotspotScreenPosition(hotspot);
        if (!position) return null;

        return (
          <div
            key={hotspot.id}
            className="absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer z-20"
            style={{ left: `${position.x}px`, top: `${position.y}px` }}
            onClick={() => handleHotspotClick(hotspot)}
          >
            <div className="relative group">
              <div className={`
                w-16 h-16 rounded-full flex items-center justify-center
                transition-all duration-200 group-hover:scale-110
                ${hotspot.kind === 'navigation' ? 'bg-blue-500' : 'bg-green-500'}
                bg-opacity-80 group-hover:bg-opacity-100
              `}>
                <span className="text-white text-3xl">
                  {hotspot.kind === 'navigation' && '➤'}
                  {hotspot.kind === 'info' && 'ℹ'}
                  {hotspot.kind === 'image' && '🖼'}
                  {hotspot.kind === 'video' && '▶'}
                  {hotspot.kind === 'link' && '🔗'}
                  {hotspot.kind === 'text' && '📝'}
                </span>
              </div>
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-3 
                              opacity-0 group-hover:opacity-100 transition-opacity
                              bg-black bg-opacity-[0.98] text-white rounded-lg shadow-2xl border border-white/10
                              pointer-events-none min-w-[200px] overflow-hidden z-30">
                {/* Tooltip Header */}
                <div className="flex items-center gap-2.5 px-4 py-2.5">
                  <div className={`w-6 h-6 rounded flex items-center justify-center shadow-sm ${hotspot.kind === 'navigation' ? 'bg-blue-500' :
                      hotspot.kind === 'info' ? 'bg-green-500' :
                        hotspot.kind === 'text' ? 'bg-blue-600' :
                          hotspot.kind === 'image' ? 'bg-emerald-500' :
                            hotspot.kind === 'video' ? 'bg-red-500' :
                              'bg-gray-500'
                    }`}>
                    <span className="text-white text-xs">
                      {hotspot.kind === 'navigation' && '➤'}
                      {hotspot.kind === 'info' && 'ℹ'}
                      {hotspot.kind === 'image' && '🖼'}
                      {hotspot.kind === 'video' && '▶'}
                      {hotspot.kind === 'link' && '🔗'}
                      {hotspot.kind === 'text' && '📝'}
                    </span>
                  </div>
                  <span className="font-semibold text-white text-sm">
                    {hotspot.kind === 'text' ? 'Text' :
                      hotspot.kind === 'image' ? 'Image' :
                        hotspot.kind === 'video' ? 'Video' :
                          hotspot.kind === 'navigation' ? 'Navigation' :
                            hotspot.kind === 'info' ? 'Information' :
                              hotspot.kind.charAt(0).toUpperCase() + hotspot.kind.slice(1)}
                  </span>
                </div>

                {/* Underline Separator */}
                <div className="mx-4 border-t border-white/10"></div>

                {/* Tooltip Content */}
                <div className="px-4 py-3 text-white/90 text-sm leading-relaxed max-w-[250px]">
                  {(() => {
                    try {
                      const payload = JSON.parse(hotspot.payload || '{}');
                      return payload.label || payload.content || payload.text || hotspot.kind.charAt(0).toUpperCase() + hotspot.kind.slice(1);
                    } catch (e) {
                      return hotspot.kind.charAt(0).toUpperCase() + hotspot.kind.slice(1);
                    }
                  })()}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Scene info with status indicators */}
      <div className="absolute top-4 left-4 bg-black bg-opacity-50 text-white p-3 rounded pointer-events-none z-10">
        <h3 className="text-lg font-semibold">{currentScene.name}</h3>
        <p className="text-sm opacity-75">{tour.name}</p>

        {/* Status Indicators */}
        {isClient && (
          <div className="flex gap-2 mt-2">
            {isAutoplay && (
              <span className="text-xs bg-blue-600 px-2 py-1 rounded flex items-center gap-1">
                <span className="animate-pulse">●</span>
                Auto-rotating
              </span>
            )}
            {isAudioPlaying && (
              <span className="text-xs bg-green-600 px-2 py-1 rounded flex items-center gap-1">
                <span className="animate-pulse">♪</span>
                Audio playing
              </span>
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-2 z-10">
        {/* Main Controls Row */}
        <div className="flex gap-2">
          {/* Autoplay Control */}
          <button
            onClick={() => setIsAutoplay(!isAutoplay)}
            className={`px-4 py-2 rounded transition-colors flex items-center gap-2 ${isAutoplay
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-black bg-opacity-50 text-white hover:bg-opacity-70'
              }`}
            title={isAutoplay ? 'Pause Auto-rotation' : 'Start Auto-rotation'}
          >
            {isAutoplay ? (
              <>
                <span>⏸</span>
                <span className="hidden sm:inline">Pause</span>
              </>
            ) : (
              <>
                <span>▶</span>
                <span className="hidden sm:inline">Auto</span>
              </>
            )}
          </button>

          {/* Zoom Controls */}
          <button
            onClick={() => {
              if (cameraRef.current) {
                cameraRef.current.fov = Math.max(30, cameraRef.current.fov - 10);
                cameraRef.current.updateProjectionMatrix();
              }
            }}
            className="px-3 py-2 bg-black bg-opacity-50 text-white rounded hover:bg-opacity-70 transition-colors"
            title="Zoom In"
          >
            🔍+
          </button>
          <button
            onClick={() => {
              if (cameraRef.current) {
                cameraRef.current.fov = Math.min(120, cameraRef.current.fov + 10);
                cameraRef.current.updateProjectionMatrix();
              }
            }}
            className="px-3 py-2 bg-black bg-opacity-50 text-white rounded hover:bg-opacity-70 transition-colors"
            title="Zoom Out"
          >
            🔍-
          </button>
        </div>

        {/* Audio Controls Row */}
        {isClient && tour.background_audio_url && (
          <div className="flex gap-2">
            <button
              onClick={toggleAudio}
              className={`px-4 py-2 rounded transition-colors flex items-center gap-2 ${isAudioPlaying
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-black bg-opacity-50 text-white hover:bg-opacity-70'
                }`}
              title={isAudioPlaying ? 'Pause Background Audio' : 'Play Background Audio'}
            >
              {isAudioPlaying ? (
                <>
                  <span>⏸</span>
                  <span className="hidden sm:inline">Audio</span>
                </>
              ) : (
                <>
                  <span>🎵</span>
                  <span className="hidden sm:inline">Audio</span>
                </>
              )}
            </button>

            <button
              onClick={toggleAudioMute}
              className={`px-3 py-2 rounded transition-colors ${isAudioMuted
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-black bg-opacity-50 text-white hover:bg-opacity-70'
                }`}
              title={isAudioMuted ? 'Unmute Audio' : 'Mute Audio'}
            >
              {isAudioMuted ? '🔇' : '🔊'}
            </button>
          </div>
        )}

        {/* Audio Error Display */}
        {isClient && audioError && (
          <div className="bg-red-600 bg-opacity-90 text-white px-3 py-2 rounded text-sm max-w-xs">
            {audioError}
          </div>
        )}
      </div>

      {/* Scene navigation */}
      {scenes && scenes.length > 1 && (
        <div className="absolute bottom-4 left-4 flex gap-2 z-10">
          {scenes.map((scene, index) => (
            <button
              key={scene.id}
              onClick={() => onSceneChange?.(scene.id)}
              className={`px-3 py-2 rounded transition-colors text-sm ${scene.id === currentScene.id
                ? 'bg-blue-600 text-white'
                : 'bg-black bg-opacity-50 text-white hover:bg-opacity-70'
                }`}
            >
              {scene.name}
            </button>
          ))}
        </div>
      )}

      {/* Pause Icon Animation */}
      {showPauseIcon && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-50">
          <div className="bg-black/50 backdrop-blur-sm rounded-full p-4 animate-fade-in-out">
            <div className="w-12 h-12 flex items-center justify-center">
              <div className="flex gap-1.5">
                <div className="w-2 h-8 bg-white rounded-sm"></div>
                <div className="w-2 h-8 bg-white rounded-sm"></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}