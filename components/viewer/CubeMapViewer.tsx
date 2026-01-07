'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Tour, Scene, Hotspot, Overlay } from '@/types/tour';
import { CubeFace, CubeMapManifest } from '@/lib/cubemap-types';
import OverlayRenderer from '../overlays/OverlayRenderer';

const R2_PUBLIC_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || 'https://test.thenimto.com';

interface CubeMapViewerProps {
  tour: Tour;
  currentScene: Scene;
  scenes?: Scene[];
  onSceneChange?: (sceneId: string) => void;
  onHotspotClick?: (hotspot: Hotspot) => void;
  isEditMode?: boolean;
  onHotspotCreate?: (yaw: number, pitch: number) => void;
  onHotspotUpdate?: (hotspot: Hotspot) => void;
  hotspots?: Hotspot[];
  overlays?: Overlay[];
  autoRotate?: boolean;
  highlightedHotspotId?: string | null;
  onOverlayPause?: () => void;
  onCameraChange?: (yaw: number, pitch: number, fov: number) => void;
  forcedCameraPosition?: { yaw: number; pitch: number; fov: number } | null;
  isPlaybackMode?: boolean;
}


export default function CubeMapViewer({
  tour,
  currentScene,
  scenes = [],
  onSceneChange,
  onHotspotClick,
  isEditMode = false,
  onHotspotCreate,
  onHotspotUpdate,
  hotspots = [],
  overlays = [],
  autoRotate = false,
  highlightedHotspotId = null,
  onOverlayPause,
  onCameraChange,
  forcedCameraPosition = null,
  isPlaybackMode = false,
}: CubeMapViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const cubeRef = useRef<THREE.Mesh | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());

  const [isLoading, setIsLoading] = useState(true);
  const [manifest, setManifest] = useState<CubeMapManifest | null>(null);
  const [currentLevel, setCurrentLevel] = useState(0);
  const [isAutoRotating, setIsAutoRotating] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isThreeInitialized, setIsThreeInitialized] = useState(false);
  const [viewerDimensions, setViewerDimensions] = useState({ width: 0, height: 0 });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const materialsRef = useRef<THREE.MeshBasicMaterial[]>([]);
  const hotspotsRef = useRef<THREE.Group | null>(null);
  const overlaysRef = useRef<THREE.Group | null>(null);
  const hoveredHotspotRef = useRef<THREE.Sprite | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isNavigatingRef = useRef(false);

  // Controls state
  const controlsRef = useRef({
    mouseX: 0,
    mouseY: 0,
    targetRotationX: 0,
    targetRotationY: 0,
    isUserInteracting: false,
    onPointerDownX: 0,
    onPointerDownY: 0,
    onPointerDownLon: 0,
    onPointerDownLat: 0,
    lon: 0,
    lat: 0,
    phi: 0,
    theta: 0,
    isDragging: false, // Track if user is dragging vs clicking
  });

  const isAutoRotatingRef = useRef(isAutoRotating);
  const autoRotateRef = useRef(autoRotate);

  // Sync refs with state/props
  useEffect(() => {
    isAutoRotatingRef.current = isAutoRotating;
  }, [isAutoRotating]);

  useEffect(() => {
    autoRotateRef.current = autoRotate;
  }, [autoRotate]);

  // Apply forced camera position (for Play Tour playback)
  useEffect(() => {
    if (forcedCameraPosition && cameraRef.current) {
      const controls = controlsRef.current;
      controls.lon = forcedCameraPosition.yaw;
      controls.lat = forcedCameraPosition.pitch;
      cameraRef.current.fov = forcedCameraPosition.fov;
      cameraRef.current.updateProjectionMatrix();
    }
  }, [forcedCameraPosition]);

  // Parse manifest from scene
  useEffect(() => {
    if (currentScene.tiles_manifest) {
      try {
        const parsed = typeof currentScene.tiles_manifest === 'string'
          ? JSON.parse(currentScene.tiles_manifest)
          : currentScene.tiles_manifest;

        if (parsed.type === 'cubemap') {

          // Clear texture cache when switching scenes
          if (loadedTexturesRef.current.size > 0) {
            loadedTexturesRef.current.forEach(texture => texture.dispose());
            loadedTexturesRef.current.clear();
          }
          setManifest(parsed);
          setCurrentLevel(0); // Reset to level 0 for new scene
        }
      } catch (error) {
        console.error('Failed to parse cube map manifest:', error);
      }
    }

    // Reset camera to scene defaults (only if not in playback mode AND no forced camera position)
    if (!isPlaybackMode && !forcedCameraPosition) {
      const controls = controlsRef.current;
      controls.lon = currentScene.yaw || 0;
      controls.lat = currentScene.pitch || 0;
      controls.targetRotationX = 0; // Reset momentum
      controls.targetRotationY = 0;

      if (cameraRef.current) {
        // Reset FOV if defined, or default to 60 (or tour default if we had access, otherwise 60)
        cameraRef.current.fov = currentScene.fov || 60;
        cameraRef.current.updateProjectionMatrix();
      }
    }
  }, [currentScene, isPlaybackMode]);

  // Initialize Three.js scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Create renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.opacity = '1'; // Ensure opacity is always 1
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Create scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    sceneRef.current = scene;

    // Create camera with better FOV for cube maps
    const camera = new THREE.PerspectiveCamera(
      60, // Reduced FOV for less distortion
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 0, 0);
    cameraRef.current = camera;

    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 1);
    scene.add(ambientLight);

    // Create groups for hotspots and overlays
    const hotspotsGroup = new THREE.Group();
    hotspotsGroup.name = 'hotspots';
    scene.add(hotspotsGroup);
    hotspotsRef.current = hotspotsGroup;

    const overlaysGroup = new THREE.Group();
    overlaysGroup.name = 'overlays';
    scene.add(overlaysGroup);
    overlaysRef.current = overlaysGroup;

    // Set initial dimensions
    setViewerDimensions({
      width: container.clientWidth,
      height: container.clientHeight
    });

    // Mark as initialized
    setIsThreeInitialized(true);

    // Animation loop
    let animationId: number;
    const animate = () => {
      if (!sceneRef.current || !cameraRef.current || !rendererRef.current) return;

      animationId = requestAnimationFrame(animate);

      // Update camera rotation based on controls
      const controls = controlsRef.current;

      // Auto-rotation controlled by state or scene settings
      // Use refs to access latest values without re-triggering effect
      // Skip auto-rotate during playback mode
      if (!isPlaybackMode && (autoRotateRef.current || isAutoRotatingRef.current) && !controls.isUserInteracting) {
        const rotateSpeed = 0.5;
        controls.lon += rotateSpeed * 0.2; // Apply rotation speed (increased for visibility)
      }

      controls.lat = Math.max(-90, Math.min(90, controls.lat)); // Allow full vertical range
      controls.phi = THREE.MathUtils.degToRad(90 - controls.lat);
      controls.theta = THREE.MathUtils.degToRad(controls.lon);

      const target = new THREE.Vector3();
      target.x = 500 * Math.sin(controls.phi) * Math.cos(controls.theta);
      target.y = 500 * Math.cos(controls.phi);
      target.z = 500 * Math.sin(controls.phi) * Math.sin(controls.theta);

      cameraRef.current.lookAt(target);

      // Ensure proper orientation
      cameraRef.current.up.set(0, 1, 0);

      // Adjust hotspot/overlay sizes based on FOV (zoom level) and add glow/highlight effects
      if (hotspotsRef.current && cameraRef.current) {
        const scaleFactor = cameraRef.current.fov / 60; // Base FOV is 60
        const time = Date.now() * 0.001; // Time in seconds for animations

        hotspotsRef.current.children.forEach((child) => {
          if (child instanceof THREE.Sprite && child.userData.baseScale) {
            const baseScale = child.userData.baseScale;
            const isHighlighted = child.userData.isHighlighted;
            const isHovered = child.userData.targetGlow === 1;

            // Unified glow/pulsing logic for all hotspots
            const glowSpeed = 0.1;
            child.userData.glowIntensity = child.userData.glowIntensity || 0;
            child.userData.targetGlow = child.userData.targetGlow || 0;

            // Interpolate glow intensity (for hover and highlights)
            child.userData.glowIntensity +=
              (child.userData.targetGlow - child.userData.glowIntensity) * glowSpeed;

            // Base scale adjusted by FOV
            let scale = baseScale * scaleFactor;

            // Apply glow/pulse effect
            let pulseFactor = 1.0;

            if (child.userData.isGround) {
              // Pulse for ground hotspots
              pulseFactor = 1 + child.userData.glowIntensity * 0.3;
              if (isHighlighted) {
                pulseFactor += Math.sin(time * 3) * 0.15;
              }
            } else {
              // Pulse for regular hotspots
              if (isHovered || isHighlighted) {
                pulseFactor = 1 + (child.userData.glowIntensity * 0.2);
                pulseFactor *= (1 + Math.sin(time * 3) * 0.15);
              }
            }

            child.scale.set(scale * pulseFactor, scale * pulseFactor, 1);

            // Update opacity
            if (child.material && 'opacity' in child.material) {
              const baseOpacity = (isHighlighted || isHovered) ? 1.0 : 0.8;
              child.material.opacity = baseOpacity + child.userData.glowIntensity * 0.2;
            }
          }
        });
      }

      // Overlay scaling is now handled by OverlayRenderer
      // Removed manual overlay scaling logic

      rendererRef.current.render(sceneRef.current, cameraRef.current);

      // Report camera changes to parent if needed
      if (onCameraChange) {
        // Use lon (yaw) and lat (pitch) which are already in degrees
        // Normalize lon to -180 to 180 range like TourEditor does
        let normalizedLon = controls.lon % 360;
        if (normalizedLon > 180) normalizedLon -= 360;
        if (normalizedLon < -180) normalizedLon += 360;

        onCameraChange(normalizedLon, controls.lat, cameraRef.current.fov);
      }
    };

    animate();

    // Handle resize
    const handleResize = () => {
      if (!cameraRef.current || !rendererRef.current || !containerRef.current) return;

      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;

      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(width, height);

      setViewerDimensions({ width, height });
    };

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      if (animationId) cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []); // Empty dependency array - only init once!

  // Keep track of loaded textures to prevent reloading
  const loadedTexturesRef = useRef<Map<string, THREE.Texture>>(new Map());

  // Progressive loading of cube map tiles with proper compositing
  const loadCubeMapLevel = useCallback((level: number) => {
    // Always use the current manifest from state, not from closure
    const currentManifest = manifest;
    if (!currentManifest || !sceneRef.current || !currentManifest.levels[level]) return;

    // optimization: During playback, stick to lower levels (max level 1) to prevent lag
    if (isPlaybackMode && level > 1) {
      return;
    }

    const levelInfo = currentManifest.levels[level];
    const tilesPerSide = levelInfo.tiles;
    const faceSize = levelInfo.size;

    const faceOrder = [
      CubeFace.RIGHT,
      CubeFace.LEFT,
      CubeFace.TOP,
      CubeFace.BOTTOM,
      CubeFace.FRONT,
      CubeFace.BACK
    ];

    // Special case for level 0 - single tile per face
    if (level === 0) {
      const loader = new THREE.TextureLoader();
      faceOrder.forEach((face, faceIndex) => {
        // Check cache first
        const cacheKey = `${currentScene.id}_${face}_l${level}`;
        if (loadedTexturesRef.current.has(cacheKey)) {
          const cachedTexture = loadedTexturesRef.current.get(cacheKey)!;
          if (materialsRef.current[faceIndex]) {
            materialsRef.current[faceIndex].map = cachedTexture;
            materialsRef.current[faceIndex].needsUpdate = true;
          }
          return;
        }

        // Load single tile
        const tileUrl = `${R2_PUBLIC_URL}/scenes/${currentScene.id}/tiles/${face}_l${level}_0_0.jpg`;

        loader.load(
          tileUrl,
          (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.minFilter = THREE.LinearMipmapLinearFilter;
            texture.magFilter = THREE.LinearFilter;
            texture.generateMipmaps = true;
            texture.anisotropy = rendererRef.current?.capabilities.getMaxAnisotropy() || 16;
            texture.needsUpdate = true;

            // Cache the texture
            loadedTexturesRef.current.set(cacheKey, texture);

            // Update material
            if (materialsRef.current[faceIndex]) {
              const oldMap = materialsRef.current[faceIndex].map;
              materialsRef.current[faceIndex].map = texture;
              materialsRef.current[faceIndex].needsUpdate = true;

              // Dispose old texture if it's not cached
              if (oldMap && oldMap !== texture && !Array.from(loadedTexturesRef.current.values()).includes(oldMap)) {
                oldMap.dispose();
              }
            }
          },
          undefined,
          (error) => {
            console.error(`Failed to load tile: ${face}_l${level}_0_0.jpg`, error);
          }
        );
      });
      return;
    }

    // For levels 1+ - composite multiple tiles
    faceOrder.forEach((face, faceIndex) => {
      // Check cache first
      const cacheKey = `${currentScene.id}_${face}_l${level}`;
      if (loadedTexturesRef.current.has(cacheKey)) {
        const cachedTexture = loadedTexturesRef.current.get(cacheKey)!;
        if (materialsRef.current[faceIndex]) {
          materialsRef.current[faceIndex].map = cachedTexture;
          materialsRef.current[faceIndex].needsUpdate = true;
        }
        return;
      }

      // Create canvas for compositing tiles
      const canvas = document.createElement('canvas');
      canvas.width = faceSize;
      canvas.height = faceSize;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        console.error('Failed to get canvas context');
        return;
      }

      // Track loaded tiles for this face
      let tilesLoaded = 0;
      const totalTiles = tilesPerSide * tilesPerSide;
      // Use the tileSize from the levelInfo we already have at the top
      const tileSize = levelInfo.tileSize || currentManifest.tileSize || 512;

      // Load all tiles for this face
      for (let y = 0; y < tilesPerSide; y++) {
        for (let x = 0; x < tilesPerSide; x++) {
          const tileUrl = `${R2_PUBLIC_URL}/scenes/${currentScene.id}/tiles/${face}_l${level}_${x}_${y}.jpg`;

          const img = new Image();
          img.crossOrigin = 'anonymous';

          img.onload = () => {
            // Draw tile at correct position
            const destX = x * tileSize;
            const destY = y * tileSize;

            // Handle edge tiles that might be smaller
            const drawWidth = Math.min(tileSize, faceSize - destX);
            const drawHeight = Math.min(tileSize, faceSize - destY);

            ctx.drawImage(img, 0, 0, img.width, img.height, destX, destY, drawWidth, drawHeight);

            tilesLoaded++;

            // All tiles loaded for this face
            if (tilesLoaded === totalTiles) {
              // Create texture from composite canvas
              const texture = new THREE.CanvasTexture(canvas);
              texture.colorSpace = THREE.SRGBColorSpace;
              texture.minFilter = THREE.LinearMipmapLinearFilter;
              texture.magFilter = THREE.LinearFilter;
              texture.generateMipmaps = true;
              texture.anisotropy = rendererRef.current?.capabilities.getMaxAnisotropy() || 16;
              texture.needsUpdate = true;

              // Cache the texture
              loadedTexturesRef.current.set(cacheKey, texture);

              // Update material
              if (materialsRef.current[faceIndex]) {
                const oldMap = materialsRef.current[faceIndex].map;
                materialsRef.current[faceIndex].map = texture;
                materialsRef.current[faceIndex].needsUpdate = true;

                // Dispose old texture if it's not cached
                if (oldMap && oldMap !== texture && !Array.from(loadedTexturesRef.current.values()).includes(oldMap)) {
                  oldMap.dispose();
                }
              }


            }
          };

          img.onerror = () => {
            console.error(`Failed to load tile: ${face}_l${level}_${x}_${y}.jpg`);
            tilesLoaded++;

            // Still create texture even if some tiles fail
            if (tilesLoaded === totalTiles) {
              const texture = new THREE.CanvasTexture(canvas);
              texture.colorSpace = THREE.SRGBColorSpace;
              texture.minFilter = THREE.LinearMipmapLinearFilter;
              texture.magFilter = THREE.LinearFilter;
              texture.generateMipmaps = true;

              loadedTexturesRef.current.set(cacheKey, texture);

              if (materialsRef.current[faceIndex]) {
                materialsRef.current[faceIndex].map = texture;
                materialsRef.current[faceIndex].needsUpdate = true;
              }
            }
          };

          img.src = tileUrl;
        }
      }
    });
  }, [manifest, currentScene.id, isPlaybackMode]);

  // Load cube map tiles
  useEffect(() => {
    if (!manifest || !sceneRef.current) return;

    // Only show loading state on initial load, not during transitions
    if (!isNavigatingRef.current && !isTransitioning) {
      setIsLoading(true);
    }

    // Create cube geometry
    const geometry = new THREE.BoxGeometry(100, 100, 100);
    geometry.scale(-1, 1, 1); // Invert for inside view
    geometry.rotateX(Math.PI); // Rotate 180 degrees around X axis to fix upside-down issue

    // Load textures for each face
    const loader = new THREE.TextureLoader();
    const materials: THREE.MeshBasicMaterial[] = [];
    materialsRef.current = materials;

    // Face order for Three.js BoxGeometry: +X, -X, +Y, -Y, +Z, -Z
    // This matches how Three.js expects cube map faces
    const faceOrder = [
      CubeFace.RIGHT,  // +X
      CubeFace.LEFT,   // -X
      CubeFace.TOP,    // +Y
      CubeFace.BOTTOM, // -Y
      CubeFace.FRONT,  // +Z
      CubeFace.BACK    // -Z
    ];

    // Start with level 0 for quick loading
    const level = 0;

    let loadedCount = 0;
    faceOrder.forEach(face => {
      // Build URL for this face at level 0, tile 0,0
      const tileUrl = `${R2_PUBLIC_URL}/scenes/${currentScene.id}/tiles/${face}_l${level}_0_0.jpg`;

      const texture = loader.load(
        tileUrl,
        () => {
          loadedCount++;
          if (loadedCount === 6) {
            // Remove old cube when transitioning and new one is ready
            if (isTransitioning && sceneRef.current) {
              // Remove all existing cubes to prevent overlap
              const existingCubes = sceneRef.current.children.filter(
                child => child instanceof THREE.Mesh && child.geometry instanceof THREE.BoxGeometry
              );
              existingCubes.forEach(cube => {
                if (cube !== cubeRef.current) {
                  sceneRef.current!.remove(cube);
                }
              });
            }

            // Add a small delay before marking as loaded for smoother transition
            setTimeout(() => {
              setIsLoading(false);
            }, 200);

            // Automatically load higher quality levels progressively
            // Note: We're using the manifest from the effect's dependency, which should be current
            if (manifest && manifest.levels && manifest.levels.length > 1) {
              // Load level 1 immediately for better default quality
              setTimeout(() => {

                loadCubeMapLevel(1);
                setCurrentLevel(1);

                // Pre-load level 2 after level 1 is loaded
                if (manifest.levels.length > 2) {
                  setTimeout(() => {

                    loadCubeMapLevel(2);

                    // Pre-load level 3 for maximum quality
                    if (manifest.levels.length > 3) {
                      setTimeout(() => {

                        loadCubeMapLevel(3);
                      }, 1500);
                    }
                  }, 1000);
                }
              }, 100);
            }
          }
        },
        undefined,
        (error) => {
          console.error(`Failed to load cube face ${face}:`, error);
          // Set visible error message
          setErrorMsg(`Failed to load tile: ${tileUrl}. Server might be unreachable.`);
          loadedCount++;
          if (loadedCount === 6) {
            setIsLoading(false);
          }
        }
      );

      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = true;
      texture.anisotropy = rendererRef.current?.capabilities.getMaxAnisotropy() || 1;

      materials.push(new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.FrontSide // Use FrontSide since geometry is inverted
      }));
    });

    // Create cube mesh
    const cube = new THREE.Mesh(geometry, materials);
    sceneRef.current.add(cube);
    cubeRef.current = cube;

    // Cleanup
    return () => {
      // Don't remove cube during transitions to prevent white screen
      if (sceneRef.current && cubeRef.current && !isTransitioning) {
        sceneRef.current.remove(cubeRef.current);
        cubeRef.current = null; // Clear the reference
      }
      materials.forEach(mat => {
        if (mat.map) mat.map.dispose();
        mat.dispose();
      });
      geometry.dispose();
    };
  }, [manifest, currentScene.id, loadCubeMapLevel, isTransitioning]);

  // Render hotspots
  useEffect(() => {
    if (!hotspotsRef.current || !sceneRef.current) return;

    // Clear existing hotspots
    while (hotspotsRef.current.children.length > 0) {
      const child = hotspotsRef.current.children[0];
      hotspotsRef.current.remove(child);
      if (child instanceof THREE.Mesh || child instanceof THREE.Sprite) {
        if ('geometry' in child) (child.geometry as THREE.BufferGeometry).dispose();
        if ('material' in child) {
          const material = child.material as THREE.Material;
          if ('map' in material && material.map) {
            (material.map as THREE.Texture).dispose();
          }
          material.dispose();
        }
      }
    }

    // Add new hotspots
    hotspots.forEach((hotspot) => {
      // Convert yaw/pitch to 3D position
      const yaw = (hotspot.yaw || 0) * Math.PI / 180;
      const pitch = (hotspot.pitch || 0) * Math.PI / 180;

      // Parse payload to check for ground flag or other settings
      let parsedPayload: any = {};
      try {
        if (hotspot.payload) {
          parsedPayload = JSON.parse(hotspot.payload);
        }
      } catch (e) {
        // Payload parsing failed, continue with defaults
      }

      // Check if this is a ground/floor hotspot
      // Only treat as ground if explicitly marked or pitch is very low (< -45°)
      const isGroundHotspot =
        parsedPayload.ground === true ||
        parsedPayload.isFloor === true ||
        hotspot.kind === 'navigation'
      // pitch < -45 * Math.PI / 180; // Only very low pitch for auto-ground

      // Calculate position
      let x, y, z, distance;

      if (isGroundHotspot) {
        // Place on the floor plane - visible and clickable
        // distance = 35; // Optimal distance for floor markers
        // const groundPitch = -70 * Math.PI / 180; // Look down angle (70 degrees down)
        // x = distance * Math.cos(groundPitch) * Math.sin(yaw);
        // y = distance * Math.sin(groundPitch); // This will be negative (below eye level)
        // z = distance * Math.cos(groundPitch) * Math.cos(yaw);
        distance = 45; // Place hotspots closer than the cube (which is at 50)
        x = distance * Math.cos(pitch) * Math.sin(yaw);
        y = distance * Math.sin(pitch);
        z = distance * Math.cos(pitch) * Math.cos(yaw);
      } else {
        // Regular floating hotspot
        distance = 45; // Place hotspots closer than the cube (which is at 50)
        x = distance * Math.cos(pitch) * Math.sin(yaw);
        y = distance * Math.sin(pitch);
        z = distance * Math.cos(pitch) * Math.cos(yaw);
      }

      // Create hotspot sprite
      const canvas = document.createElement('canvas');

      if (isGroundHotspot) {
        // Create circular floor navigation point (like Matterport)
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        if (ctx) {
          // Enable antialiasing
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          // Clear canvas with transparency
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // Draw outer glow ring (will pulse on hover)
          const glowGradient = ctx.createRadialGradient(256, 256, 120, 256, 256, 200);
          glowGradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
          glowGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.2)');
          glowGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
          ctx.fillStyle = glowGradient;
          ctx.beginPath();
          ctx.arc(256, 256, 200, 0, Math.PI * 2);
          ctx.fill();

          // Draw main circle with gradient
          const mainGradient = ctx.createRadialGradient(256, 256, 0, 256, 256, 120);
          mainGradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
          mainGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.95)');
          mainGradient.addColorStop(0.8, 'rgba(255, 255, 255, 0.8)');
          mainGradient.addColorStop(1, 'rgba(255, 255, 255, 0.6)');
          ctx.fillStyle = mainGradient;
          ctx.beginPath();
          ctx.arc(256, 256, 120, 0, Math.PI * 2);
          ctx.fill();

          // Add border ring
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(256, 256, 120, 0, Math.PI * 2);
          ctx.stroke();

          // Draw inner bright circle
          const innerGradient = ctx.createRadialGradient(256, 256, 0, 256, 256, 60);
          innerGradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
          innerGradient.addColorStop(1, 'rgba(255, 255, 255, 0.9)');
          ctx.fillStyle = innerGradient;
          ctx.beginPath();
          ctx.arc(256, 256, 60, 0, Math.PI * 2);
          ctx.fill();

          // Draw arrow or icon in center
          ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
          ctx.font = 'bold 80px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          if (hotspot.kind === 'navigation' || isGroundHotspot) {
            // Draw arrow pointing forward - bigger and clearer
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.lineWidth = 8;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            // Arrow shaft
            ctx.moveTo(256, 296);
            ctx.lineTo(256, 216);
            // Arrow head
            ctx.moveTo(236, 236);
            ctx.lineTo(256, 216);
            ctx.lineTo(276, 236);
            ctx.stroke();
          } else {
            const icon = hotspot.kind === 'info' ? 'i' : '●';
            ctx.fillText(icon, 256, 256);
          }
        }
      } else {
        // Regular floating hotspot - High resolution 1024x1024 canvas
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');

        if (ctx) {
          // Enable antialiasing
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          // Draw hotspot icon biased towards the top to leave room for labels
          const iconY = 400;
          const iconRadius = 240;

          ctx.fillStyle = hotspot.kind === 'navigation' ? '#4CAF50' :
            hotspot.kind === 'info' ? '#2196F3' : '#FFC107';
          ctx.beginPath();
          ctx.arc(512, iconY, iconRadius, 0, Math.PI * 2);
          ctx.fill();

          // Add border for better visibility
          ctx.strokeStyle = 'white';
          ctx.lineWidth = 15;
          ctx.stroke();

          // Add label if available
          if (parsedPayload.label) {
            // High resolution font rendering
            const fontSize = 54;
            ctx.font = `bold ${fontSize}px Arial`;
            const metrics = ctx.measureText(parsedPayload.label);
            const textWidth = metrics.width;

            // Cap label width and add padding
            const bgWidth = Math.min(textWidth + 100, 980);
            const bgHeight = 100;
            const bgX = 512 - bgWidth / 2;
            const bgY = 750; // Well below the icon to avoid overlap

            // Draw label background with shadow
            ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
            ctx.shadowBlur = 20;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
            ctx.roundRect(bgX, bgY, bgWidth, bgHeight, 25);
            ctx.fill();
            ctx.shadowColor = 'transparent';

            // Draw label text
            ctx.fillStyle = 'white';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // Truncate text if it somehow still exceeds bgWidth
            let labelText = parsedPayload.label;
            if (textWidth > bgWidth - 40) {
              const charsToKeep = Math.floor(labelText.length * (bgWidth - 80) / textWidth);
              labelText = labelText.substring(0, charsToKeep) + '...';
            }

            ctx.fillText(labelText, 512, bgY + bgHeight / 2);
          }

          // Add icon centered in the circle
          ctx.fillStyle = 'white';
          ctx.font = 'bold 240px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const icon = hotspot.kind === 'navigation' ? '→' :
            hotspot.kind === 'info' ? 'i' : '🔗';
          ctx.fillText(icon, 512, iconY);
        }
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;

      const spriteMaterial = new THREE.SpriteMaterial({
        map: texture,
        sizeAttenuation: false, // Keep same size regardless of distance
        depthTest: true,
        depthWrite: false,
        transparent: true
      });

      const sprite = new THREE.Sprite(spriteMaterial);
      sprite.position.set(x, y, z);

      // Check if this hotspot is being edited
      const isHighlighted = highlightedHotspotId === hotspot.id;

      // Different scale for ground labels vs floating hotspots
      if (isGroundHotspot) {
        const baseScale = isHighlighted ? 0.25 : 0.20; // Larger when highlighted (increased from 0.2/0.15)
        sprite.scale.set(baseScale, baseScale, 1);
        sprite.userData = {
          hotspot,
          type: 'hotspot',
          baseScale: baseScale,
          isGround: true,
          glowIntensity: isHighlighted ? 1 : 0,
          targetGlow: isHighlighted ? 1 : 0,
          isHighlighted
        };

        // Make sure it's visible
        sprite.renderOrder = isHighlighted ? 2 : 1; // Higher render order when highlighted
      } else {
        const baseScale = isHighlighted ? 0.16 : 0.12; // Larger when highlighted (increased from 0.11/0.08)
        sprite.scale.set(baseScale, baseScale, 1);
        sprite.userData = {
          hotspot,
          type: 'hotspot',
          baseScale: baseScale,
          isGround: false,
          isHighlighted
        };
      }

      // Add pulsing effect for highlighted hotspots
      if (isHighlighted) {
        sprite.material.opacity = 1;
      }

      if (hotspotsRef.current) {
        hotspotsRef.current.add(sprite);
      }
    });
  }, [hotspots, highlightedHotspotId]);

  // Render overlays
  // Manual overlay rendering removed in favor of OverlayRenderer component
  // which handles high-quality overlay rendering, hover effects, and interactions

  // Mouse controls
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onPointerDown = (event: PointerEvent) => {
      event.preventDefault();

      // Disable user interaction during playback mode
      if (isPlaybackMode) return;

      const controls = controlsRef.current;

      // Reset drag flag
      controls.isDragging = false;

      // Edit mode: create hotspot with Shift + Click (matching your editor controls)
      if (isEditMode && event.shiftKey) {
        const rect = container.getBoundingClientRect();
        mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        if (cameraRef.current) {
          // Calculate yaw/pitch from click position on the sphere
          const vector = new THREE.Vector3(mouseRef.current.x, mouseRef.current.y, 0.5);
          vector.unproject(cameraRef.current);
          vector.sub(cameraRef.current.position).normalize();

          // Convert to spherical coordinates
          const yaw = Math.atan2(vector.x, vector.z) * 180 / Math.PI;
          const pitch = Math.asin(vector.y) * 180 / Math.PI;

          if (onHotspotCreate) {
            onHotspotCreate(yaw, pitch);

            // Visual feedback - create temporary marker
            const tempMarker = document.createElement('div');
            tempMarker.style.position = 'absolute';
            tempMarker.style.left = `${event.clientX - rect.left - 10}px`;
            tempMarker.style.top = `${event.clientY - rect.top - 10}px`;
            tempMarker.style.width = '20px';
            tempMarker.style.height = '20px';
            tempMarker.style.borderRadius = '50%';
            tempMarker.style.backgroundColor = '#4CAF50';
            tempMarker.style.animation = 'pulse 0.5s ease-out';
            tempMarker.style.pointerEvents = 'none';
            container.appendChild(tempMarker);

            setTimeout(() => container.removeChild(tempMarker), 500);
          }
        }
        return; // Don't start camera rotation when placing hotspot
      }

      controls.isUserInteracting = true;
      controls.onPointerDownX = event.clientX;
      controls.onPointerDownY = event.clientY;
      controls.onPointerDownLon = controls.lon;
      controls.onPointerDownLat = controls.lat;
    };

    const onPointerMove = (event: PointerEvent) => {
      // Disable hover interactions when auto-rotating (playing)
      if (isAutoRotatingRef.current || autoRotateRef.current) {
        if (container.style.cursor !== 'grab') {
          container.style.cursor = 'grab';
        }
        // Clear any existing hover state
        if (hoveredHotspotRef.current) {
          if (hoveredHotspotRef.current.userData) {
            hoveredHotspotRef.current.userData.targetGlow = 0;
          }
          hoveredHotspotRef.current = null;
        }
        return;
      }

      const controls = controlsRef.current;

      // Check for hotspot/overlay hover
      if (!isEditMode && cameraRef.current) {
        const rect = container.getBoundingClientRect();
        mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);

        let foundHoverable = false;

        // Check overlay hover first
        // Overlay hover handling is managed by OverlayRenderer

        // Check hotspot hover
        if (!foundHoverable && hotspotsRef.current) {
          const intersects = raycasterRef.current.intersectObjects(hotspotsRef.current.children, true);

          // Reset previous hover
          if (hoveredHotspotRef.current && hoveredHotspotRef.current.userData) {
            hoveredHotspotRef.current.userData.targetGlow = 0;
            hoveredHotspotRef.current = null;
          }

          // Check for new hover
          if (intersects.length > 0) {
            const hoveredObject = intersects[0].object as THREE.Sprite;
            hoveredHotspotRef.current = hoveredObject;
            hoveredObject.userData.targetGlow = 1;
            container.style.cursor = 'pointer';
            foundHoverable = true;
          }
        }

        if (!foundHoverable) {
          container.style.cursor = isEditMode ? 'crosshair' : 'grab';
        }
      }

      if (!controls.isUserInteracting) return;

      // Detect if user is dragging (movement > 10px threshold)
      const dragThreshold = 10;
      const deltaX = Math.abs(event.clientX - controls.onPointerDownX);
      const deltaY = Math.abs(event.clientY - controls.onPointerDownY);

      if (deltaX > dragThreshold || deltaY > dragThreshold) {
        controls.isDragging = true;
      }

      controls.lon = (controls.onPointerDownX - event.clientX) * 0.15 + controls.onPointerDownLon;
      controls.lat = (event.clientY - controls.onPointerDownY) * 0.15 + controls.onPointerDownLat;
    };

    const onPointerUp = (event: PointerEvent) => {
      const controls = controlsRef.current;
      const wasDragging = controls.isDragging;

      console.log('[CubeMapViewer] Click detected:', {
        wasDragging,
        isAutoRotatingRef: isAutoRotatingRef.current,
        autoRotateRef: autoRotateRef.current,
        hasOnOverlayPause: !!onOverlayPause,
        isPlaybackMode
      });

      controls.isUserInteracting = false;
      controls.isDragging = false;

      // Handle interactions (clicks)
      if (!wasDragging) {
        // If autoplay OR playback is active, ANY click should pause it immediately
        const isAnyPlaybackActive = isAutoRotatingRef.current || autoRotateRef.current || isPlaybackMode;
        if (isAnyPlaybackActive && onOverlayPause) {
          console.log('[CubeMapViewer] PAUSING - calling onOverlayPause');
          onOverlayPause();
          // We still continue to process the click (e.g. to navigate or show info), 
          // but the pause happens first/simultaneously.
        } else {
          console.log('[CubeMapViewer] NOT PAUSING - conditions not met');
        }

        let clickedOnTarget = false;
        let targetHotspot: Hotspot | null = null;
        const rect = container.getBoundingClientRect();
        mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        if (cameraRef.current && sceneRef.current) {
          raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);

          // 1. Direct hit check
          if (hotspotsRef.current) {
            const hotspotIntersects = raycasterRef.current.intersectObjects(hotspotsRef.current.children, true);
            if (hotspotIntersects.length > 0) {
              const clickedObject = hotspotIntersects[0].object as THREE.Sprite;
              // Check if it's a hotspot (has userData) or part of one
              if (clickedObject.userData && clickedObject.userData.hotspot) {
                targetHotspot = clickedObject.userData.hotspot;
                clickedOnTarget = true;
              }
            }
          }

          // 2. Smart Proximity Check (if no direct hit and not in playback/autoplay mode)
          // If we clicked on the background (wall/floor) but close to a navigation hotspot, go there!
          // BUT: Disable this during autoplay/playback - we want clicks to pause, not navigate
          const isAutoplayActive = isAutoRotatingRef.current || autoRotateRef.current;
          if (!clickedOnTarget && !isPlaybackMode && !isAutoplayActive && hotspots.length > 0) {
            let bestAngle = Math.PI; // Max possible angle
            const proximityThreshold = 25 * (Math.PI / 180); // 25 degrees threshold

            // Get current ray direction
            const ray = raycasterRef.current.ray;

            hotspots.forEach(hotspot => {
              if (hotspot.kind !== 'navigation') return;

              // Calculate 3D position of hotspot
              const yawRad = (hotspot.yaw || 0) * Math.PI / 180;
              const pitchRad = (hotspot.pitch || 0) * Math.PI / 180;
              const distance = 45;
              const hx = distance * Math.cos(pitchRad) * Math.sin(yawRad);
              const hy = distance * Math.sin(pitchRad);
              const hz = distance * Math.cos(pitchRad) * Math.cos(yawRad);

              const hotspotVec = new THREE.Vector3(hx, hy, hz).normalize();
              const angle = ray.direction.angleTo(hotspotVec);

              if (angle < proximityThreshold && angle < bestAngle) {
                bestAngle = angle;
                targetHotspot = hotspot;
              }
            });

            if (targetHotspot) {
              clickedOnTarget = true;
            }
          }
        }

        // 3. Action Logic
        if (targetHotspot) {
          // Handle Navigation Hotspot (Smooth Animation)
          if (targetHotspot.kind === 'navigation') {
            const hotspot = targetHotspot;

            // Trigger Animation
            setIsTransitioning(true);
            setLoadingProgress(0);

            // Store initial camera state
            const startFov = cameraRef.current!.fov;
            const startScale = cubeRef.current?.scale.x || 1;
            const startLon = controls.lon;
            const startLat = controls.lat;

            // Calculate target direction
            const yawRad = (hotspot.yaw || 0) * Math.PI / 180;
            const pitchRad = (hotspot.pitch || 0) * Math.PI / 180;
            const distance = 45;
            const hx = distance * Math.cos(pitchRad) * Math.sin(yawRad);
            const hy = distance * Math.sin(pitchRad);
            const hz = distance * Math.cos(pitchRad) * Math.cos(yawRad);

            let targetLon = Math.atan2(hx, hz) * 180 / Math.PI;
            const targetLat = Math.atan2(hy, Math.sqrt(hx * hx + hz * hz)) * 180 / Math.PI;

            // Limit rotation to avoid dizzying spins
            const maxRotation = 30;
            let lonDiff = targetLon - startLon;
            while (lonDiff > 180) lonDiff -= 360;
            while (lonDiff < -180) lonDiff += 360;

            if (Math.abs(lonDiff) > maxRotation) {
              lonDiff = lonDiff > 0 ? maxRotation : -maxRotation;
            }
            targetLon = startLon + lonDiff;

            // Animation params
            const moveDuration = 1500;
            const startTime = Date.now();
            controls.isUserInteracting = true;
            isNavigatingRef.current = true;

            // Determine final targets based on direction
            let finalTargetLon = targetLon;
            let finalTargetLat = targetLat;
            let finalTargetFov = 20; // ZOOM IN effect

            const direction = hotspot.transition_direction || 'forward';

            if (direction === 'left') { finalTargetLon = startLon - 30; finalTargetFov = startFov; }
            else if (direction === 'right') { finalTargetLon = startLon + 30; finalTargetFov = startFov; }
            else if (direction === 'up') { finalTargetLat = startLat + 20; finalTargetFov = startFov; }
            else if (direction === 'down') { finalTargetLat = startLat - 20; finalTargetFov = startFov; }
            else if (direction === 'backward') { finalTargetLon = startLon + 180; finalTargetFov = 100; } // Zoom out for backward

            const animateToHotspot = () => {
              const elapsed = Date.now() - startTime;
              const progress = Math.min(elapsed / moveDuration, 1);
              const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;
              const easedProgress = easeInOutSine(progress);

              // Update View
              controls.lon = startLon + (finalTargetLon - startLon) * easedProgress;
              controls.lat = startLat + (finalTargetLat - startLat) * easedProgress;

              if (cameraRef.current) {
                cameraRef.current.fov = startFov + (finalTargetFov - startFov) * easedProgress;
                cameraRef.current.updateProjectionMatrix();
              }

              if (cubeRef.current && direction === 'forward') {
                // Scale cube down to simulate moving closer
                const targetScale = startScale * 0.6;
                const scale = startScale + (targetScale - startScale) * easedProgress;
                cubeRef.current.scale.set(scale, scale, scale);
              }

              setLoadingProgress(Math.floor(progress * 100));

              if (progress < 1) {
                requestAnimationFrame(animateToHotspot);
              } else {
                // Animation Done - Fire Event
                if (onHotspotClick) onHotspotClick(hotspot);

                // Reset
                isNavigatingRef.current = false;
                if (cameraRef.current) {
                  cameraRef.current.fov = 60;
                  cameraRef.current.updateProjectionMatrix();
                }
                if (cubeRef.current) cubeRef.current.scale.set(1, 1, 1);
                controls.lon = 0;
                controls.lat = 0;
                controls.isUserInteracting = false;
                setIsTransitioning(false);
              }
            };

            animateToHotspot();

          } else {
            // Handle other hotspots (Info, Link) directly
            if (onHotspotClick) onHotspotClick(targetHotspot);
          }
        }
        else {
          // No target found - Toggle Pause (if autoplaying)
          if ((isAutoRotatingRef.current || autoRotateRef.current) && onOverlayPause) {
            onOverlayPause();
          }
        }
      }
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();

      // Disable zoom during playback
      if (isPlaybackMode) return;

      if (!cameraRef.current) return;

      const fov = cameraRef.current.fov + event.deltaY * 0.05;
      cameraRef.current.fov = Math.max(10, Math.min(90, fov)); // Max 90 instead of 100
      cameraRef.current.updateProjectionMatrix();

      // Progressive loading based on zoom level - only upgrade, never downgrade quality
      if (manifest && manifest.levels.length > 0) {
        let targetLevel = 0;

        // Determine target level based on FOV
        if (cameraRef.current.fov <= 15) {
          targetLevel = Math.min(4, manifest.levels.length - 1); // Extreme quality for maximum zoom
        } else if (cameraRef.current.fov <= 25) {
          targetLevel = Math.min(3, manifest.levels.length - 1); // Maximum quality
        } else if (cameraRef.current.fov <= 40) {
          targetLevel = Math.min(2, manifest.levels.length - 1); // High quality
        } else if (cameraRef.current.fov <= 60) {
          targetLevel = Math.min(1, manifest.levels.length - 1); // Medium quality
        } else {
          targetLevel = 0; // Base quality for wide view
        }

        // Only change level if we're upgrading quality or significantly zooming out
        if (targetLevel > currentLevel) {
          // Upgrade quality

          loadCubeMapLevel(targetLevel);
          setCurrentLevel(targetLevel);
        } else if (targetLevel < currentLevel && cameraRef.current.fov > 75) {
          // Only downgrade when significantly zoomed out to save memory

          loadCubeMapLevel(targetLevel);
          setCurrentLevel(targetLevel);
        } else if (targetLevel === currentLevel) {
          // Already at correct level

        }
      }
    };

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('wheel', onWheel);
    };
  }, [manifest, currentLevel, loadCubeMapLevel, isEditMode, hotspots, overlays, onHotspotClick, onHotspotCreate]);

  return (
    <div className="relative w-full h-full">
      <style jsx>{`
        @keyframes pulse {
          0% {
            transform: scale(1);
            opacity: 1;
          }
          100% {
            transform: scale(2);
            opacity: 0;
          }
        }
      `}</style>

      <div
        ref={containerRef}
        className={`w-full h-full touch-action-none transition-opacity duration-300 opacity-100 ${isEditMode ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
        style={isEditMode ? { border: '2px dashed rgba(76, 175, 80, 0.5)' } : {}}
      />

      {/* Edit Mode Indicator */}
      {isEditMode && (
        <div className="absolute top-4 left-4 z-20 bg-green-600/90 text-white px-3 py-2 rounded-lg backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
            <span className="text-sm font-medium">Edit Mode: Shift + Click to add hotspot</span>
          </div>
        </div>
      )}

      {/* Auto-rotate toggle button */}
      {/* <button
        onClick={() => setIsAutoRotating(!isAutoRotating)}
        className={`absolute bottom-4 right-4 z-20 px-3 py-2 rounded-lg backdrop-blur-sm transition-all ${isAutoRotating
          ? 'bg-blue-600/80 text-white hover:bg-blue-700/80'
          : 'bg-white/80 text-gray-700 hover:bg-white/90'
          }`}
        title={isAutoRotating ? 'Stop Auto-rotation' : 'Start Auto-rotation'}
      >
        <div className="flex items-center gap-2">
          <svg
            className={`w-5 h-5 ${isAutoRotating ? 'animate-spin' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          <span className="text-sm font-medium">
            {isAutoRotating ? 'Auto-rotating' : 'Auto-rotate'}
          </span>
        </div>
      </button> */}

      {isLoading && !isNavigatingRef.current && !autoRotate && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="text-white">Loading cube map...</div>
        </div>
      )}

      {!manifest && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="text-white">No cube map data available. Please upload a new scene.</div>
        </div>
      )}

      {errorMsg && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-50">
          <div className="text-center p-6 max-w-lg">
            <div className="text-red-500 text-xl font-bold mb-2">Failed to load scene</div>
            <div className="text-white mb-4 text-sm break-all">{errorMsg}</div>
            <div className="text-gray-400 text-xs text-left bg-gray-900 p-4 rounded overflow-auto max-h-40">
              Possible causes:
              <ul className="list-disc ml-4 mt-1">
                <li>Image server is unreachable (test.thenimto.com)</li>
                <li>CORS policy is blocking access locally</li>
                <li>Scene ID does not exist on the remote server</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {isThreeInitialized && sceneRef.current && cameraRef.current && overlaysRef.current && (
        <OverlayRenderer
          overlays={overlays}
          viewerWidth={viewerDimensions.width}
          viewerHeight={viewerDimensions.height}
          currentYaw={THREE.MathUtils.radToDeg(controlsRef.current.lon)}
          currentPitch={THREE.MathUtils.radToDeg(controlsRef.current.lat)}
          fov={cameraRef.current.fov}
          camera={cameraRef.current}
          scene={sceneRef.current}
          overlayGroup={overlaysRef.current}
          isEditMode={isEditMode}
          isAutoplay={isAutoRotating || autoRotate || isPlaybackMode}
          onPause={onOverlayPause}
          onOverlayClick={(overlay) => void 0}
        />
      )}
    </div>
  );
}