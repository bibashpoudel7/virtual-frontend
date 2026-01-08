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
  cameraControlRef?: React.MutableRefObject<{ setCamera: (yaw: number, pitch: number, fov: number) => void } | null>;
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
  cameraControlRef,
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
  const [currentLevel, setCurrentLevel] = useState(1);
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
  const loadingTimeoutsRef = useRef<NodeJS.Timeout[]>([]);
  // Store target camera direction when navigating to new scene
  const navigationTargetRef = useRef<{ yaw: number; pitch: number } | null>(null);

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

  // Expose direct camera control for smooth animations (bypasses React state)
  useEffect(() => {
    if (cameraControlRef) {
      cameraControlRef.current = {
        setCamera: (yaw: number, pitch: number, fov: number) => {
          const controls = controlsRef.current;
          controls.lon = yaw;
          controls.lat = pitch;
          if (cameraRef.current) {
            cameraRef.current.fov = fov;
            cameraRef.current.updateProjectionMatrix();
          }
        }
      };
    }
    return () => {
      if (cameraControlRef) {
        cameraControlRef.current = null;
      }
    };
  }, [cameraControlRef]);

  // Parse manifest from scene
  useEffect(() => {
    if (currentScene.tiles_manifest) {
      try {
        const parsed = typeof currentScene.tiles_manifest === 'string'
          ? JSON.parse(currentScene.tiles_manifest)
          : currentScene.tiles_manifest;

        console.log('[CubeMapViewer] Parsed manifest:', parsed);
        console.log('[CubeMapViewer] Levels:', parsed.levels);

        if (parsed.type === 'cubemap') {

          // Clear texture cache when switching scenes
          if (loadedTexturesRef.current.size > 0) {
            loadedTexturesRef.current.forEach(texture => texture.dispose());
            loadedTexturesRef.current.clear();
          }
          setManifest(parsed);
          setCurrentLevel(1); // Reset to level 1 for new scene
        } else {
          console.error('[CubeMapViewer] Invalid manifest type:', parsed.type);
        }
      } catch (error) {
        console.error('[CubeMapViewer] Failed to parse cube map manifest:', error);
      }
    } else {
      console.warn('[CubeMapViewer] No tiles_manifest in currentScene');
    }

    // Reset camera - use navigation target if we just walked to this scene, otherwise use scene defaults
    if (!isPlaybackMode && !forcedCameraPosition) {
      const controls = controlsRef.current;
      const isNavigatedEntry = !!navigationTargetRef.current;

      if (navigationTargetRef.current) {
        // We navigated here via hotspot - face the direction we were walking
        console.log('[CubeMapViewer] Using navigation target direction:', navigationTargetRef.current);
        controls.lon = navigationTargetRef.current.yaw;
        controls.lat = navigationTargetRef.current.pitch;
        navigationTargetRef.current = null; // Clear after use
      } else {
        // Normal load - use scene defaults
        controls.lon = currentScene.yaw || 0;
        controls.lat = currentScene.pitch || 0;
      }

      controls.targetRotationX = 0; // Reset momentum
      controls.targetRotationY = 0;

      const targetFov = currentScene.fov || 60;

      if (cameraRef.current) {
        cameraRef.current.fov = targetFov;
        cameraRef.current.updateProjectionMatrix();
      }

      // Entry animation is handled by applyAllTextures() when new textures are ready
      // This ensures the scene is visible before any animation starts
    }
  }, [currentScene]);

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
        controls.lon += rotateSpeed * 0.2;
      }

      controls.lat = Math.max(-90, Math.min(90, controls.lat)); // Allow full vertical range
      controls.phi = THREE.MathUtils.degToRad(90 - controls.lat);
      // Add 180° to align camera with cubemap front face
      controls.theta = THREE.MathUtils.degToRad(controls.lon + 180);

      const target = new THREE.Vector3();
      target.x = 500 * Math.sin(controls.phi) * Math.cos(controls.theta);
      target.y = 500 * Math.cos(controls.phi);
      target.z = 500 * Math.sin(controls.phi) * Math.sin(controls.theta);

      cameraRef.current.lookAt(target);

      // Ensure proper orientation
      cameraRef.current.up.set(0, 1, 0);

      // Scale overlay sprites the same way as hotspots
      if (overlaysRef.current && cameraRef.current) {
        const scaleFactor = cameraRef.current.fov / 60;
        overlaysRef.current.children.forEach((child: THREE.Object3D) => {
          if (child instanceof THREE.Group) {
            child.children.forEach((groupChild: THREE.Object3D) => {
              if (groupChild instanceof THREE.Sprite && groupChild.userData.baseScale) {
                const scale = groupChild.userData.baseScale * scaleFactor;
                groupChild.scale.set(scale, scale, 1);
                groupChild.visible = true;
              }
            });
            child.visible = true;
          }
        });
      }
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


      rendererRef.current.render(sceneRef.current, cameraRef.current);

      // Report camera changes to parent if needed
      if (onCameraChange) {
        // Normalize lon to -180 to 180 range
        let normalizedLon = controls.lon % 360;
        if (normalizedLon > 180) normalizedLon -= 360;
        if (normalizedLon < -180) normalizedLon += 360;

        onCameraChange(normalizedLon, controls.lat, cameraRef.current.fov);
      }
    };

    animate();

    // Handle resize using ResizeObserver to detect container size changes
    const handleResize = () => {
      if (!cameraRef.current || !rendererRef.current || !containerRef.current) return;

      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;

      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(width, height);

      setViewerDimensions({ width, height });
    };

    // Use ResizeObserver to detect size changes of the container element
    // This supports both window resize AND container resizing (e.g. fullscreen toggle)
    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });

    resizeObserver.observe(container);

    // Initial resize to ensure correct size
    handleResize();

    // Cleanup
    return () => {
      if (animationId) cancelAnimationFrame(animationId);
      resizeObserver.disconnect();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []); // Empty dependency array - only init once!

  // Keep track of loaded textures to prevent reloading
  const loadedTexturesRef = useRef<Map<string, THREE.Texture>>(new Map());

  // Track preloaded scene tiles for smooth navigation
  const preloadedTilesRef = useRef<Map<string, Map<string, HTMLImageElement>>>(new Map());
  const preloadingPromiseRef = useRef<Map<string, Promise<boolean>>>(new Map());

  // Preload tiles for a scene (used during navigation animation)
  const preloadSceneTiles = useCallback((targetSceneId: string): Promise<boolean> => {
    // Check if already preloading this scene
    if (preloadingPromiseRef.current.has(targetSceneId)) {
      return preloadingPromiseRef.current.get(targetSceneId)!;
    }

    // Find target scene from scenes array
    const targetScene = scenes.find(s => s.id === targetSceneId);
    if (!targetScene || !targetScene.tiles_manifest) {
      console.warn('[CubeMapViewer] Cannot preload - no manifest for scene:', targetSceneId);
      return Promise.resolve(false);
    }

    const targetManifest = typeof targetScene.tiles_manifest === 'string'
      ? JSON.parse(targetScene.tiles_manifest)
      : targetScene.tiles_manifest;

    if (targetManifest.type !== 'cubemap') {
      return Promise.resolve(false);
    }

    // Get level 1 info
    const levelInfo = targetManifest.levels?.find((l: { level: number }) => l.level === 1);
    if (!levelInfo) {
      console.warn('[CubeMapViewer] No level 1 found in target manifest');
      return Promise.resolve(false);
    }

    const tileSize = levelInfo.tileSize || targetManifest.tileSize || 512;
    const tilesPerSide = levelInfo.tiles || Math.ceil(levelInfo.size / tileSize);
    const faceOrder = ['right', 'left', 'bottom', 'top', 'front', 'back'];

    console.log(`[CubeMapViewer] Preloading scene ${targetSceneId}: ${faceOrder.length} faces, ${tilesPerSide}x${tilesPerSide} tiles each`);

    const promise = new Promise<boolean>((resolve) => {
      const tileImages = new Map<string, HTMLImageElement>();
      let loadedCount = 0;
      const totalTiles = faceOrder.length * tilesPerSide * tilesPerSide;

      faceOrder.forEach(face => {
        for (let y = 0; y < tilesPerSide; y++) {
          for (let x = 0; x < tilesPerSide; x++) {
            const tileKey = `${face}_l1_${x}_${y}`;
            const tileUrl = `${R2_PUBLIC_URL}/scenes/${targetSceneId}/tiles/${tileKey}.jpg`;

            const img = new Image();
            img.crossOrigin = 'anonymous';

            img.onload = () => {
              tileImages.set(tileKey, img);
              loadedCount++;
              if (loadedCount === totalTiles) {
                console.log(`[CubeMapViewer] Preloaded all ${totalTiles} tiles for scene ${targetSceneId}`);
                preloadedTilesRef.current.set(targetSceneId, tileImages);
                preloadingPromiseRef.current.delete(targetSceneId);
                resolve(true);
              }
            };

            img.onerror = () => {
              loadedCount++;
              console.warn(`[CubeMapViewer] Failed to preload tile: ${tileUrl}`);
              if (loadedCount === totalTiles) {
                preloadedTilesRef.current.set(targetSceneId, tileImages);
                preloadingPromiseRef.current.delete(targetSceneId);
                resolve(true); // Still resolve even with some failures
              }
            };

            img.src = tileUrl;
          }
        }
      });
    });

    preloadingPromiseRef.current.set(targetSceneId, promise);
    return promise;
  }, [scenes]);

  // Progressive loading of cube map tiles with proper compositing
  const loadCubeMapLevel = useCallback((level: number) => {
    // Always use the current manifest from state, not from closure
    const currentManifest = manifest;
    console.log('[CubeMapViewer] loadCubeMapLevel called with level:', level);
    console.log('[CubeMapViewer] currentManifest:', currentManifest);
    console.log('[CubeMapViewer] sceneRef.current:', !!sceneRef.current);

    if (!currentManifest || !sceneRef.current) {
      console.warn('[CubeMapViewer] Skipping loadCubeMapLevel - missing manifest or scene');
      return;
    }

    // Find level info by level number (not array index) since level 0 is removed
    const levelInfo = currentManifest.levels.find(l => l.level === level);
    console.log('[CubeMapViewer] levelInfo for level', level, ':', JSON.stringify(levelInfo));
    console.log('[CubeMapViewer] All levels:', JSON.stringify(currentManifest.levels));

    if (!levelInfo) {
      console.error('[CubeMapViewer] No levelInfo found for level:', level, 'Available levels:', currentManifest.levels.map(l => l.level));
      return;
    }

    if (!levelInfo.size) {
      console.error('[CubeMapViewer] levelInfo missing size property:', levelInfo);
      return;
    }

    // optimization: During playback, stick to lower levels (max level 1) to prevent lag
    if (isPlaybackMode && level > 1) {
      return;
    }
    const faceSize = levelInfo.size;
    const tileSize = levelInfo.tileSize || currentManifest.tileSize || 512;
    // Calculate tilesPerSide with fallback in case manifest doesn't have it
    const tilesPerSide = levelInfo.tiles || Math.ceil(faceSize / tileSize);

    console.log(`[CubeMapViewer] Level ${level}: faceSize=${faceSize}, tileSize=${tileSize}, tilesPerSide=${tilesPerSide}`);

    const faceOrder = [
      CubeFace.RIGHT,
      CubeFace.LEFT,
      CubeFace.BOTTOM,  // Swapped: Three.js +Y expects bottom when viewing from inside
      CubeFace.TOP,     // Swapped: Three.js -Y expects top when viewing from inside
      CubeFace.FRONT,
      CubeFace.BACK
    ];

    console.log(`[CubeMapViewer] Starting to load ${faceOrder.length} faces, ${tilesPerSide}x${tilesPerSide}=${tilesPerSide * tilesPerSide} tiles each`);

    // Check if tiles were preloaded for this scene
    const preloadedSceneTiles = preloadedTilesRef.current.get(currentScene.id);
    const hasPreloadedTiles = preloadedSceneTiles && level === 1;

    // Track completed faces for batch update (smooth transition)
    let facesCompleted = 0;
    const pendingTextures: Map<number, THREE.Texture> = new Map();

    // Function to apply all textures at once (smooth Matterport-style swap)
    const applyAllTextures = () => {
      console.log('[CubeMapViewer] Applying all 6 face textures at once for smooth transition');

      // Reset cube position and scale for smooth appearance after navigation animation
      if (cubeRef.current) {
        cubeRef.current.position.set(0, 0, 0);
        cubeRef.current.scale.set(1, 1, 1);
      }

      // Reset camera FOV to scene default after animation
      if (cameraRef.current) {
        const targetFov = currentScene.fov || 60;
        cameraRef.current.fov = targetFov;
        cameraRef.current.updateProjectionMatrix();
      }

      pendingTextures.forEach((texture, faceIndex) => {
        if (materialsRef.current[faceIndex]) {
          const oldMap = materialsRef.current[faceIndex].map;
          materialsRef.current[faceIndex].map = texture;
          materialsRef.current[faceIndex].color.setHex(0xffffff);
          materialsRef.current[faceIndex].needsUpdate = true;

          // Dispose old texture if not cached
          if (oldMap && oldMap !== texture && !Array.from(loadedTexturesRef.current.values()).includes(oldMap)) {
            oldMap.dispose();
          }
        }
      });

      setIsTransitioning(false);
      setIsLoading(false);
    };

    // Composite multiple tiles for all levels (level 0 removed)
    faceOrder.forEach((face, faceIndex) => {
      // Check cache first
      const cacheKey = `${currentScene.id}_${face}_l${level}`;
      if (loadedTexturesRef.current.has(cacheKey)) {
        console.log(`[CubeMapViewer] Using cached texture for ${face} level ${level}`);
        pendingTextures.set(faceIndex, loadedTexturesRef.current.get(cacheKey)!);
        facesCompleted++;
        if (facesCompleted === 6) {
          applyAllTextures();
        }
        return;
      }

      console.log(`[CubeMapViewer] Loading tiles for face ${face} (index ${faceIndex}), level ${level}`);

      // Create canvas for compositing tiles
      const canvas = document.createElement('canvas');
      canvas.width = faceSize;
      canvas.height = faceSize;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        console.error('Failed to get canvas context');
        facesCompleted++;
        if (facesCompleted === 6) applyAllTextures();
        return;
      }

      // Track loaded tiles for this face
      let tilesLoaded = 0;
      const totalTiles = tilesPerSide * tilesPerSide;

      // Function called when all tiles for this face are loaded
      const onFaceComplete = () => {
        console.log('[CubeMapViewer] Face complete:', face);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
        texture.anisotropy = rendererRef.current?.capabilities.getMaxAnisotropy() || 16;
        texture.flipY = false;
        texture.needsUpdate = true;

        loadedTexturesRef.current.set(cacheKey, texture);
        pendingTextures.set(faceIndex, texture);
        facesCompleted++;

        // When all 6 faces are ready, apply them all at once
        if (facesCompleted === 6) {
          applyAllTextures();
        }
      };

      // Helper function to process a loaded image
      const processLoadedImage = (img: HTMLImageElement, x: number, y: number) => {
        const destX = x * tileSize;
        const destY = y * tileSize;
        const drawWidth = Math.min(tileSize, faceSize - destX);
        const drawHeight = Math.min(tileSize, faceSize - destY);
        ctx.drawImage(img, 0, 0, img.width, img.height, destX, destY, drawWidth, drawHeight);
        tilesLoaded++;

        if (tilesLoaded === totalTiles) {
          onFaceComplete();
        }
      };

      // Load all tiles for this face
      for (let y = 0; y < tilesPerSide; y++) {
        for (let x = 0; x < tilesPerSide; x++) {
          const tileKey = `${face}_l${level}_${x}_${y}`;

          // Check for preloaded tile first
          if (hasPreloadedTiles) {
            const preloadedImg = preloadedSceneTiles.get(tileKey);
            if (preloadedImg) {
              processLoadedImage(preloadedImg, x, y);
              continue;
            }
          }

          // Fallback: load tile from network
          const tileUrl = `${R2_PUBLIC_URL}/scenes/${currentScene.id}/tiles/${tileKey}.jpg`;

          const img = new Image();
          img.crossOrigin = 'anonymous';

          img.onload = () => {
            processLoadedImage(img, x, y);
          };

          img.onerror = (err) => {
            console.error(`[CubeMapViewer] Failed to load tile: ${tileUrl}`, err);
            tilesLoaded++;
            if (tilesLoaded === totalTiles) {
              onFaceComplete();
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

    const loader = new THREE.TextureLoader();
    const sceneId = currentScene.id;

    // Face order for Three.js BoxGeometry: +X, -X, +Y, -Y, +Z, -Z
    // When viewing from inside, +Y shows floor and -Y shows ceiling
    const faceOrder = [
      CubeFace.RIGHT,  // +X
      CubeFace.LEFT,   // -X
      CubeFace.BOTTOM, // +Y (swapped - floor appears at top position)
      CubeFace.TOP,    // -Y (swapped - ceiling appears at bottom position)
      CubeFace.FRONT,  // +Z
      CubeFace.BACK    // -Z
    ];

    // Check if cube already exists (scene transition) or needs to be created
    const isSceneTransition = cubeRef.current !== null;
    console.log('[CubeMapViewer] isSceneTransition:', isSceneTransition, 'cubeRef.current:', !!cubeRef.current);

    if (!isSceneTransition) {
      // First load - create cube geometry and materials
      console.log('[CubeMapViewer] Creating new cube and materials');
      setIsLoading(true);

      const geometry = new THREE.BoxGeometry(100, 100, 100);
      // No transformations needed - use BackSide to see inside the cube

      const materials: THREE.MeshBasicMaterial[] = [];
      materialsRef.current = materials;

      // Create placeholder materials
      faceOrder.forEach(() => {
        materials.push(new THREE.MeshBasicMaterial({
          color: 0x000000,
          side: THREE.DoubleSide
        }));
      });

      console.log('[CubeMapViewer] Created', materials.length, 'materials');

      const cube = new THREE.Mesh(geometry, materials);
      sceneRef.current.add(cube);
      cubeRef.current = cube;
      console.log('[CubeMapViewer] Cube added to scene');
    } else {
      console.log('[CubeMapViewer] Using existing cube, materialsRef.current.length:', materialsRef.current.length);
    }

    // Clear any pending loading timeouts from previous scene
    loadingTimeoutsRef.current.forEach(t => clearTimeout(t));
    loadingTimeoutsRef.current = [];

    // Load level 1 tiles (now 2x2 tiles of 512px each)
    // Use loadCubeMapLevel which handles compositing multiple tiles
    setIsLoading(true);

    console.log('[CubeMapViewer] Scheduling loadCubeMapLevel(1) with setTimeout');

    // Small delay to ensure cube is created, then load level 1 only
    // Higher levels (2, 3) are loaded on-demand when user zooms in
    const t1 = setTimeout(() => {
      console.log('[CubeMapViewer] Loading level 1 (current scene stays visible until ready)');
      loadCubeMapLevel(1);
      setCurrentLevel(1);

      // Clean up preloaded tiles after they've been consumed by loadCubeMapLevel
      setTimeout(() => {
        if (preloadedTilesRef.current.has(currentScene.id)) {
          console.log('[CubeMapViewer] Cleaning up preloaded tiles for scene:', currentScene.id);
          preloadedTilesRef.current.delete(currentScene.id);
        }
      }, 100);

      // Note: setIsLoading, setIsTransitioning, and cube scale reset
      // are handled by applyAllTextures() when all faces are ready
    }, 50);
    loadingTimeoutsRef.current.push(t1);

    // Cleanup on unmount only - DON'T remove cube on scene change to keep current view visible
    return () => {
      // Clear all pending timeouts
      loadingTimeoutsRef.current.forEach(t => clearTimeout(t));
      loadingTimeoutsRef.current = [];

      // Only remove cube on actual unmount, not on scene change
      // The cube stays visible with old textures until new textures are loaded
    };
  }, [manifest, currentScene.id, loadCubeMapLevel]);

  // Render hotspots - only after tiles are loaded
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

    // Don't show hotspots until tiles are fully loaded
    if (isLoading) return;

    // Add new hotspots
    hotspots.forEach((hotspot) => {
      // Convert yaw/pitch to 3D position
      // Add 180° and swap to match camera coordinate system (cos/sin instead of sin/cos)
      const yaw = ((hotspot.yaw || 0) + 180) * Math.PI / 180;
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
        // Use cos/sin to match camera coordinate system
        distance = 45; // Place hotspots closer than the cube (which is at 50)
        x = distance * Math.cos(pitch) * Math.cos(yaw);
        y = distance * Math.sin(pitch);
        z = distance * Math.cos(pitch) * Math.sin(yaw);
      } else {
        // Regular floating hotspot
        // Use cos/sin to match camera coordinate system
        distance = 45; // Place hotspots closer than the cube (which is at 50)
        x = distance * Math.cos(pitch) * Math.cos(yaw);
        y = distance * Math.sin(pitch);
        z = distance * Math.cos(pitch) * Math.sin(yaw);
      }

      // Helper to draw rounded rect for compatibility
      const roundedRect = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) => {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
      };

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

          if (hotspot.kind === 'info') {
            // Draw enhanced chat bubble icon for info hotspots
            const centerX = 512;
            const centerY = iconY;
            const bubbleSize = 120;
            const color = '#2196F3';

            // Draw main chat bubble with rounded corners
            const bubbleWidth = bubbleSize * 2.4;
            const bubbleHeight = bubbleSize * 1.8;
            const bubbleX = centerX - bubbleWidth / 2;
            const bubbleY = centerY - bubbleHeight / 2;
            const cornerRadius = 20;

            roundedRect(ctx, bubbleX, bubbleY, bubbleWidth, bubbleHeight, cornerRadius);
            ctx.fill();

            // Triangle tip
            ctx.beginPath();
            ctx.moveTo(bubbleX + bubbleWidth * 0.25, bubbleY + bubbleHeight);
            ctx.lineTo(bubbleX + bubbleWidth * 0.45, bubbleY + bubbleHeight);
            ctx.lineTo(bubbleX + bubbleWidth * 0.3, bubbleY + bubbleHeight + bubbleSize * 0.5);
            ctx.closePath();
            ctx.fill();

            // Text lines inside bubble
            ctx.fillStyle = color;
            const lineWidth = bubbleWidth * 0.6;
            const lineHeight = 12;
            const startX = centerX - lineWidth / 2;
            const lineSpacing = bubbleSize * 0.35;

            ctx.fillRect(startX, centerY - lineSpacing, lineWidth, lineHeight);
            ctx.fillRect(startX, centerY, lineWidth * 0.85, lineHeight);
            ctx.fillRect(startX, centerY + lineSpacing, lineWidth * 0.7, lineHeight);
          } else {
            const icon = hotspot.kind === 'navigation' ? '→' : '🔗';
            ctx.fillText(icon, 512, iconY);
          }
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

    // Preload all adjacent scenes level 1 tiles for instant transitions
    // Level 1 is now 2x2 tiles (512px each) per face
    const faces = ['front', 'back', 'left', 'right', 'top', 'bottom'];
    hotspots.forEach(h => {
      if (h.kind === 'navigation' && h.target_scene_id) {
        faces.forEach(face => {
          // Preload all 4 tiles (2x2) for each face
          for (let y = 0; y < 2; y++) {
            for (let x = 0; x < 2; x++) {
              const tileUrl = `${R2_PUBLIC_URL}/scenes/${h.target_scene_id}/tiles/${face}_l1_${x}_${y}.jpg`;
              const img = new Image();
              img.src = tileUrl;
            }
          }
        });
      }
    });
  }, [hotspots, highlightedHotspotId, isLoading]);

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
          // Use atan2(z, x) to match cos/sin coordinate system, subtract 180° for camera offset
          const yaw = Math.atan2(vector.z, vector.x) * 180 / Math.PI - 180;
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

            // Preload next scene tiles on hover for faster transitions
            const hotspotData = hoveredObject.userData.hotspot;
            if (hotspotData?.kind === 'navigation' && hotspotData?.target_scene_id) {
              const faces = ['front', 'back', 'left', 'right', 'top', 'bottom'];
              faces.forEach(face => {
                const tileUrl = `${R2_PUBLIC_URL}/scenes/${hotspotData.target_scene_id}/tiles/${face}_l1_0_0.jpg`;
                const img = new Image();
                img.src = tileUrl;
              });
            }
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
              // Add 180° and use cos/sin to match camera coordinate system
              const yawRad = ((hotspot.yaw || 0) + 180) * Math.PI / 180;
              const pitchRad = (hotspot.pitch || 0) * Math.PI / 180;
              const distance = 45;
              const hx = distance * Math.cos(pitchRad) * Math.cos(yawRad);
              const hy = distance * Math.sin(pitchRad);
              const hz = distance * Math.cos(pitchRad) * Math.sin(yawRad);

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
          // Handle Navigation Hotspot (Matterport-style smooth walking transition)
          if (targetHotspot.kind === 'navigation') {
            const hotspot = targetHotspot;
            const targetSceneId = hotspot.target_scene_id;

            // Trigger Animation
            setIsTransitioning(true);
            setLoadingProgress(0);

            // Start preloading target scene tiles immediately
            let preloadComplete = false;
            let animationComplete = false;

            const checkAndNavigate = () => {
              if (preloadComplete && animationComplete) {
                console.log('[CubeMapViewer] Both preload and animation complete - switching scene');
                isNavigatingRef.current = false;
                controls.isUserInteracting = false;

                // DON'T reset scale/fov here - keep old scene visible
                // The new scene's applyAllTextures will handle the reset

                // Store the direction we should face in the new scene
                // Check for target_yaw/target_pitch in top-level fields OR in payload
                let targetYaw = hotspot.target_yaw;
                let targetPitch = hotspot.target_pitch;

                // If not found in top-level, try to get from payload
                if (targetYaw === undefined || targetPitch === undefined) {
                  try {
                    const payload = typeof hotspot.payload === 'string'
                      ? JSON.parse(hotspot.payload)
                      : hotspot.payload;
                    if (payload) {
                      if (targetYaw === undefined && payload.targetYaw !== undefined) {
                        targetYaw = payload.targetYaw;
                      }
                      if (targetPitch === undefined && payload.targetPitch !== undefined) {
                        targetPitch = payload.targetPitch;
                      }
                    }
                  } catch (e) {
                    // Ignore parse errors
                  }
                }

                // Use target values if defined, otherwise continue facing hotspot direction
                navigationTargetRef.current = {
                  yaw: targetYaw !== undefined ? targetYaw : hotspot.yaw,
                  pitch: targetPitch !== undefined ? targetPitch : 0
                };
                console.log('[CubeMapViewer] Set navigation target:', navigationTargetRef.current);

                // Fire event to load new scene - old scene stays visible until new textures ready
                if (onHotspotClick) onHotspotClick(hotspot);
              }
            };

            // Start preloading
            if (targetSceneId) {
              console.log('[CubeMapViewer] Starting preload for scene:', targetSceneId);
              preloadSceneTiles(targetSceneId).then(() => {
                preloadComplete = true;
                console.log('[CubeMapViewer] Preload complete for scene:', targetSceneId);
                checkAndNavigate();
              });
            } else {
              preloadComplete = true; // No target scene to preload
            }

            // Store initial camera state
            const startScale = cubeRef.current?.scale.x || 1;
            const startFov = cameraRef.current?.fov || 60;
            const startLon = controls.lon;
            const startLat = controls.lat;

            // Get hotspot position (yaw/pitch) to rotate camera toward it
            // Camera direction is theta = lon + 180, hotspot is at yaw + 180
            // So we want lon = yaw for camera to face hotspot
            const hotspotYaw = hotspot.yaw || 0;
            const hotspotPitch = hotspot.pitch || 0;

            controls.isUserInteracting = true;
            isNavigatingRef.current = true;

            // Calculate shortest rotation path to hotspot
            let deltaYaw = hotspotYaw - startLon;
            while (deltaYaw > 180) deltaYaw -= 360;
            while (deltaYaw < -180) deltaYaw += 360;
            const deltaPitch = hotspotPitch - startLat;

            // Matterport-style navigation with two phases:
            // Phase 1: Smooth rotation toward hotspot (if needed)
            // Phase 2: Slow forward movement
            const rotationDuration = Math.min(Math.abs(deltaYaw) * 6, 800); // Slower rotation
            const moveDuration = 3000; // Slower, gentle forward movement
            const startTime = Date.now();

            // Easing functions
            const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);
            // Smooth constant speed with soft start/end
            const easeInOutQuad = (t: number) => t < 0.5
              ? 2 * t * t
              : 1 - Math.pow(-2 * t + 2, 2) / 2;

            const animateToHotspot = () => {
              const elapsed = Date.now() - startTime;
              const totalDuration = rotationDuration + moveDuration;

              // Phase 1: Rotation (first part of animation)
              if (elapsed < rotationDuration) {
                const rotProgress = Math.min(elapsed / rotationDuration, 1);
                const easedRot = easeOutQuart(rotProgress);

                // Smoothly rotate camera toward hotspot
                controls.lon = startLon + deltaYaw * easedRot;
                controls.lat = Math.max(-85, Math.min(85, startLat + deltaPitch * easedRot));

                requestAnimationFrame(animateToHotspot);
              }
              // Phase 2: Gentle forward movement
              else {
                const moveElapsed = elapsed - rotationDuration;
                const moveProgress = Math.min(moveElapsed / moveDuration, 1);

                // Smooth constant speed movement
                const smoothProgress = easeInOutQuad(moveProgress);

                // Keep camera pointed at hotspot
                controls.lon = startLon + deltaYaw;
                controls.lat = Math.max(-85, Math.min(85, startLat + deltaPitch));

                if (cubeRef.current && cameraRef.current) {
                  // Calculate direction toward hotspot for cube offset
                  const theta = THREE.MathUtils.degToRad(hotspotYaw + 180);
                  const dirX = Math.cos(theta);
                  const dirZ = Math.sin(theta);

                  // Move forward toward hotspot
                  const moveDistance = 18 * smoothProgress;
                  cubeRef.current.position.set(
                    -dirX * moveDistance,
                    0,
                    -dirZ * moveDistance
                  );

                  // Scale down for forward motion feel
                  const scaleTarget = 0.6;
                  const scale = startScale + (scaleTarget - startScale) * smoothProgress;
                  cubeRef.current.scale.set(scale, scale, scale);

                  // FOV change based on current FOV - max 10, scales down if FOV is low
                  const baseFovChange = 10;
                  const fovChange = startFov < 60
                    ? baseFovChange * (startFov / 60) // Scale down proportionally
                    : baseFovChange;
                  const fovTarget = startFov + fovChange;
                  cameraRef.current.fov = startFov + (fovTarget - startFov) * smoothProgress;
                  cameraRef.current.updateProjectionMatrix();
                }

                if (moveProgress < 1) {
                  requestAnimationFrame(animateToHotspot);
                } else {
                  // DON'T reset cube position here - keep forward position visible
                  // The new scene's applyAllTextures will reset position and scale
                  console.log('[CubeMapViewer] Animation complete, checking preload status');
                  animationComplete = true;
                  checkAndNavigate();
                }
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
      // Allow wider FOV at level 1 for better overview, min 10 for zoom in
      const maxFov = currentLevel === 1 ? 120 : 100;
      cameraRef.current.fov = Math.max(10, Math.min(maxFov, fov));
      cameraRef.current.updateProjectionMatrix();

      // Progressive loading based on zoom level - only upgrade, never downgrade quality
      if (manifest && manifest.levels.length > 0) {
        let targetLevel = 1; // Start at level 1 (level 0 is not generated)

        // Determine target level based on FOV (max level 2)
        if (cameraRef.current.fov <= 40) {
          targetLevel = 2; // High quality for zoom
        } else {
          targetLevel = 1; // Base quality for normal/wide view
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
  }, [manifest, currentLevel, loadCubeMapLevel, isEditMode, hotspots, overlays, onHotspotClick, onHotspotCreate, preloadSceneTiles]);

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
      {/* {isEditMode && (
        <div className="absolute top-4 left-4 z-20 bg-green-600/90 text-white px-3 py-2 rounded-lg backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
            <span className="text-sm font-medium">Edit Mode: Shift + Click to add hotspot</span>
          </div>
        </div>
      )} */}

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

      {/* Loading indicator removed - current scene stays visible during transitions */}

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

      {isThreeInitialized && !isLoading && sceneRef.current && cameraRef.current && overlaysRef.current && (
        <OverlayRenderer
          overlays={overlays}
          viewerWidth={viewerDimensions.width}
          viewerHeight={viewerDimensions.height}
          currentYaw={controlsRef.current.lon}
          currentPitch={controlsRef.current.lat}
          fov={cameraRef.current.fov}
          camera={cameraRef.current}
          scene={sceneRef.current}
          overlayGroup={overlaysRef.current}
          isEditMode={isEditMode}
          isAutoplay={isAutoRotating || autoRotate || isPlaybackMode}
          onPause={onOverlayPause}
          onOverlayClick={(overlay) => void 0}
          radius={45}
        />
      )}
    </div>
  );
}