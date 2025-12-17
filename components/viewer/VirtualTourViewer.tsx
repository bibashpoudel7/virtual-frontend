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
}

export default function VirtualTourViewer({
  tour,
  currentScene,
  onSceneChange,
  onHotspotClick,
  scenes
}: VirtualTourViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const animationIdRef = useRef<number | null>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAutoplay, setIsAutoplay] = useState(tour.autoplay_enabled || false);
  
  // Mouse/touch controls state
  const mouseDown = useRef(false);
  const mouseX = useRef(0);
  const mouseY = useRef(0);
  const lon = useRef(currentScene.yaw || 0);
  const lat = useRef(currentScene.pitch || 0);
  const phi = useRef(0);
  const theta = useRef(0);

  // Check if scene has multiresolution tiles
  const hasMultires = Boolean(currentScene.tiles_manifest);
  
  console.log('[VirtualTourViewer] Scene check:', {
    sceneId: currentScene.id,
    hasMultires,
    tiles_manifest: currentScene.tiles_manifest,
    src_original_url: currentScene.src_original_url
  });

  // If multiresolution tiles are available, use the MultiresViewer
  if (hasMultires) {
    console.log('[VirtualTourViewer] Using TourEditor/MultiresViewer for tiles');
    return <TourEditor 
      tour={tour} 
      scenes={scenes}
    />;
  }

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

        // Prefer equirectangular for simplicity (single image instead of 6 faces)
        // You can switch the order if you prefer cubemap
        if (currentScene.cubemap_manifest_url) {
          // Load equire await loadCubemap();ctangular directly - simpler and faster
          await loadCubemap();
        } else if (currentScene.src_original_url) {
          // Fallback to cubemap if no original URL
         
          loadEquirectangular();
        } else {
          throw new Error('No panorama source available');
        }
      } catch (err) {
        console.error('Error loading panorama:', err);
        setError(err instanceof Error ? err.message : 'Failed to load panorama');
        setIsLoading(false);
      }
    }

    async function loadCubemap() {
      try {
        console.log('Loading cubemap from:', currentScene.cubemap_manifest_url);
        
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
        
        console.log('Cubemap loaded successfully');
        setIsLoading(false);
      } catch (err) {
        console.error('Cubemap loading failed, trying equirectangular fallback:', err);
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
      setIsAutoplay(false);
    }

    function onMouseMove(event: MouseEvent) {
      if (!mouseDown.current) return;
      
      lon.current += (event.clientX - mouseX.current) * 0.15;  // Reduced from 0.3 to 0.15
      lat.current -= (event.clientY - mouseY.current) * 0.15;  // Reduced from 0.3 to 0.15
      
      mouseX.current = event.clientX;
      mouseY.current = event.clientY;
    }

    function onMouseUp() {
      mouseDown.current = false;
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
      setIsAutoplay(false);
    }

    function onTouchMove(event: TouchEvent) {
      if (!mouseDown.current) return;
      event.preventDefault();
      
      const touch = event.touches[0];
      lon.current += (touch.clientX - mouseX.current) * 0.15;  // Reduced from 0.3 to 0.15
      lat.current -= (touch.clientY - mouseY.current) * 0.15;  // Reduced from 0.3 to 0.15
      
      mouseX.current = touch.clientX;
      mouseY.current = touch.clientY;
    }

    function onTouchEnd() {
      mouseDown.current = false;
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
    renderer.domElement.addEventListener('wheel', onMouseWheel);
    
    renderer.domElement.addEventListener('touchstart', onTouchStart);
    renderer.domElement.addEventListener('touchmove', onTouchMove);
    renderer.domElement.addEventListener('touchend', onTouchEnd);
    
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
      renderer.domElement.removeEventListener('wheel', onMouseWheel);
      
      renderer.domElement.removeEventListener('touchstart', onTouchStart);
      renderer.domElement.removeEventListener('touchmove', onTouchMove);
      renderer.domElement.removeEventListener('touchend', onTouchEnd);
      
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
  }, [currentScene.yaw, currentScene.pitch, currentScene.fov, tour.default_fov]);

  // Update autoplay state
  useEffect(() => {
    setIsAutoplay(tour.autoplay_enabled || false);
  }, [tour.autoplay_enabled]);

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
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="text-red-500 text-center bg-black bg-opacity-75 p-4 rounded">
            <p className="text-xl mb-2">Error loading panorama</p>
            <p className="text-sm">{error}</p>
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
                w-12 h-12 rounded-full flex items-center justify-center
                transition-all duration-200 group-hover:scale-110
                ${hotspot.kind === 'navigation' ? 'bg-blue-500' : 'bg-green-500'}
                bg-opacity-80 group-hover:bg-opacity-100
              `}>
                <span className="text-white text-xl">
                  {hotspot.kind === 'navigation' && '➤'}
                  {hotspot.kind === 'info' && 'ℹ'}
                  {hotspot.kind === 'image' && '🖼'}
                  {hotspot.kind === 'video' && '▶'}
                  {hotspot.kind === 'link' && '🔗'}
                  {hotspot.kind === 'text' && '📝'}
                </span>
              </div>
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 
                              opacity-0 group-hover:opacity-100 transition-opacity
                              bg-black bg-opacity-75 text-white px-2 py-1 rounded text-sm
                              whitespace-nowrap pointer-events-none">
                {hotspot.kind}
              </div>
            </div>
          </div>
        );
      })}

      {/* Scene info */}
      <div className="absolute top-4 left-4 bg-black bg-opacity-50 text-white p-3 rounded pointer-events-none z-10">
        <h3 className="text-lg font-semibold">{currentScene.name}</h3>
        <p className="text-sm opacity-75">{tour.name}</p>
      </div>

      {/* Controls */}
      <div className="absolute bottom-4 right-4 flex gap-2 z-10">
        <button
          onClick={() => setIsAutoplay(!isAutoplay)}
          className="px-4 py-2 bg-black bg-opacity-50 text-white rounded hover:bg-opacity-70 transition-colors"
        >
          {isAutoplay ? '⏸ Pause' : '▶ Play'}
        </button>
        <button
          onClick={() => {
            if (cameraRef.current) {
              cameraRef.current.fov = Math.max(30, cameraRef.current.fov - 10);
              cameraRef.current.updateProjectionMatrix();
            }
          }}
          className="px-3 py-2 bg-black bg-opacity-50 text-white rounded hover:bg-opacity-70 transition-colors"
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
        >
          🔍-
        </button>
      </div>

      {/* Scene navigation */}
      {tour.tour_scenes && tour.tour_scenes.length > 1 && (
        <div className="absolute bottom-4 left-4 flex gap-2 z-10">
          {tour.tour_scenes.map((tourScene, index) => (
            <button
              key={tourScene.id}
              onClick={() => onSceneChange?.(tourScene.scene_id)}
              className={`px-3 py-2 rounded transition-colors ${
                tourScene.scene_id === currentScene.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-black bg-opacity-50 text-white hover:bg-opacity-70'
              }`}
            >
              Scene {index + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}