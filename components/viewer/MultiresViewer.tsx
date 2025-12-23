'use client';

import { useCallback, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { Tour, Scene, Hotspot } from '@/types/tour';
import { calculateVisibleTiles, getAppropriateLevel } from '@/lib/multires-utils';
import {
  MAX_CONCURRENT_TILE_LOADS,
  SPHERE_RADIUS,
  TILE_CACHE_LIMIT,
  TILE_UNLOAD_COOLDOWN,
  TILE_UPDATE_INTERVAL_MS,
} from './multires/constants';
import { createHotspotSprite } from './multires/hotspots';
import { buildTileUrl, parseSceneManifest } from './multires/manifest';
import { createTileGeometry, getTileKey, vectorToYawPitch, yawPitchToVector } from './multires/geometry';
import { disposeTileEntry } from './multires/tiles';
import type { ExtendedManifest, TileEntry, TileRequest } from './multires/types';

interface MultiresViewerProps {
  tour: Tour;
  currentScene: Scene;
  scenes?: Scene[];
  onSceneChange?: (sceneId: string) => void;
  onHotspotClick?: (hotspot: Hotspot) => void;
  isEditMode?: boolean;
  onHotspotCreate?: (yaw: number, pitch: number) => void;
  onHotspotUpdate?: (hotspot: Hotspot) => void;
  hotspots?: Hotspot[];
  isAutoplay?: boolean;
}

const PICKING_SPHERE = new THREE.Sphere(new THREE.Vector3(), SPHERE_RADIUS);

function useHotspotUpdater(
  hotspots: Hotspot[],
  currentSceneId: string,
  hotspotsGroupRef: MutableRefObject<THREE.Group | null>,
  scenes?: Scene[],
) {
  return useCallback(() => {
    const group = hotspotsGroupRef.current;
    if (!group) return;

    // Clear existing hotspots
    while (group.children.length) {
      const child = group.children.pop();
      if (!child) continue;
      group.remove(child);
      child.traverse((node) => {
        if (node instanceof THREE.Sprite && node.material instanceof THREE.Material) {
          node.material.dispose();
        }
        if (node instanceof THREE.Group) {
          // Handle nested groups (our new hotspot groups)
          node.traverse((nestedNode) => {
            if (nestedNode instanceof THREE.Sprite && nestedNode.material instanceof THREE.Material) {
              nestedNode.material.dispose();
            }
          });
        }
      });
    }

    // Add hotspots for current scene
    const sceneHotspots = hotspots.filter((hotspot) => hotspot.scene_id === currentSceneId);
    sceneHotspots.forEach((hotspot) => {
      const sprite = createHotspotSprite(hotspot, scenes);
      group.add(sprite);
    });
  }, [hotspots, currentSceneId, hotspotsGroupRef, scenes]);
}

function usePreviewLoader(
  manifestRef: MutableRefObject<ExtendedManifest | null>,
  currentSceneRef: MutableRefObject<Scene | null>,
  textureLoaderRef: MutableRefObject<THREE.TextureLoader | null>,
  previewMeshRef: MutableRefObject<THREE.Mesh | null>,
  sceneRef: MutableRefObject<THREE.Scene | null>,
) {
  return useCallback(() => {
    const manifest = manifestRef.current;
    const activeScene = currentSceneRef.current;
    const scene = sceneRef.current;
    if (!scene || !activeScene) return;

    const loader = textureLoaderRef.current ?? new THREE.TextureLoader();
    textureLoaderRef.current = loader;

    const previewCandidates = [
      manifest?.preview,
      activeScene.src_original_url,
      `https://test.thenimto.com/scenes/${activeScene.id}/tiles/preview.jpg`,
    ].filter(Boolean) as string[];

    if (!previewCandidates.length) {
      if (previewMeshRef.current) {
        scene.remove(previewMeshRef.current);
        previewMeshRef.current = null;
      }
      return;
    }

    const previewUrl = previewCandidates[0]!;
    const absoluteUrl = /^https?:\/\//i.test(previewUrl)
      ? previewUrl
      : new URL(previewUrl, window.location.origin).toString();

    // Preload the texture to avoid flicker
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      loader.load(
        absoluteUrl,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.minFilter = THREE.LinearFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.generateMipmaps = true;

          if (!previewMeshRef.current) {
            const geometry = new THREE.SphereGeometry(SPHERE_RADIUS, 64, 32);
            geometry.scale(-1, 1, 1);
            const material = new THREE.MeshBasicMaterial({ 
              map: texture, 
              side: THREE.BackSide,
              transparent: true,
              opacity: 1.0
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.renderOrder = -1000;
            mesh.frustumCulled = false;
            previewMeshRef.current = mesh;
            scene.add(mesh);
          } else {
            const material = previewMeshRef.current.material as THREE.MeshBasicMaterial;
            material.map?.dispose();
            material.map = texture;
            material.transparent = true;
            material.opacity = 1.0;
            material.needsUpdate = true;
            previewMeshRef.current.visible = true;
          }
        },
        undefined,
        () => {
          /* ignore preview errors */
        },
      );
    };
    img.onerror = () => {
      /* ignore preview errors */
    };
    img.src = absoluteUrl;
  }, [manifestRef, currentSceneRef, textureLoaderRef, previewMeshRef, sceneRef]);
}

const MultiresViewer: React.FC<MultiresViewerProps> = ({
  tour,
  currentScene,
  scenes = [],
  onSceneChange,
  onHotspotClick,
  isEditMode = false,
  onHotspotCreate,
  onHotspotUpdate,
  hotspots = [],
  isAutoplay = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const previewMeshRef = useRef<THREE.Mesh | null>(null);
  const hotspotsGroupRef = useRef<THREE.Group | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const pointerRef = useRef(new THREE.Vector2());
  const draggingSpriteRef = useRef<THREE.Sprite | null>(null);
  const originalHotspotRef = useRef<Hotspot | null>(null);
  const isAutoplayRef = useRef(isAutoplay);

  const tileCacheRef = useRef<Map<string, TileEntry>>(new Map());
  const geometryCacheRef = useRef<Map<string, THREE.BufferGeometry>>(new Map());
  const tileQueueRef = useRef<TileRequest[]>([]);
  const transitionRef = useRef({
    targetSceneId: null as string | null,
    startTime: 0,
    duration: 400, // Faster default duration
    startYaw: 0,
    startPitch: 0,
    endYaw: 0,
    endPitch: 0,
    startFov: 75,
    endFov: 75,
  });

  const pendingSetRef = useRef<Set<string>>(new Set());
  const activeLoadsRef = useRef(0);

  const manifestRef = useRef<ExtendedManifest | null>(null);
  const currentSceneRef = useRef<Scene | null>(null);
  const currentSceneIdRef = useRef<string>('');

  const textureLoaderRef = useRef<THREE.TextureLoader | null>(null);
  const destroyedRef = useRef(false);
  const lastTileUpdateRef = useRef(0);

  const pointerStateRef = useRef({
    isPointerDown: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    shiftKey: false,
  });

  const controlsRef = useRef({
    yaw: currentScene.yaw ?? 0,
    pitch: currentScene.pitch ?? 0,
    fov: currentScene.fov ?? tour?.default_fov ?? 75,
    velocityYaw: 0,
    velocityPitch: 0,
    pointerActive: false,
  });

  const manifest = useMemo(() => {
    const parsed = parseSceneManifest(currentScene);
    console.log('[MultiresViewer] Parsed manifest for scene:', currentScene.id, parsed);
    return parsed;
  }, [currentScene]);
  const updateHotspots = useHotspotUpdater(hotspots, currentScene.id, hotspotsGroupRef, scenes);
  const loadPreviewTexture = usePreviewLoader(
    manifestRef,
    currentSceneRef,
    textureLoaderRef,
    previewMeshRef,
    sceneRef,
  );

  const startSceneTransition = useCallback((hotspot: Hotspot) => {
    const controls = controlsRef.current;
    let targetSceneId = hotspot.target_scene_id || null;
    if (!targetSceneId && hotspot.payload) {
      try {
        const parsed = typeof hotspot.payload === 'string' ? JSON.parse(hotspot.payload) : hotspot.payload;
        if (parsed && typeof parsed === 'object' && parsed.targetSceneId) {
          targetSceneId = parsed.targetSceneId;
        }
      } catch (err) {
        /* ignore parse errors */
      }
    }

    if (!targetSceneId) {
      onHotspotClick?.(hotspot);
      return;
    }

    const targetScene = scenes?.find((scene) => scene.id === targetSceneId);
    if (!targetScene) {
      onHotspotClick?.(hotspot);
      return;
    }

    const targetManifest = parseSceneManifest(targetScene);
    if (targetManifest?.preview) {
      const loader = textureLoaderRef.current ?? new THREE.TextureLoader();
      textureLoaderRef.current = loader;
      const previewUrl = /^https?:\/\//i.test(targetManifest.preview)
        ? targetManifest.preview
        : new URL(targetManifest.preview, window.location.origin).toString();
      loader.load(previewUrl, () => {
        /* prefetch success */
      }, undefined, () => {
        /* ignore preview prefetch fail */
      });
    }

    controls.pointerActive = false;
    controls.velocityYaw = 0;
    controls.velocityPitch = 0;

    transitionRef.current = {
      targetSceneId,
      startTime: typeof performance !== 'undefined' ? performance.now() : Date.now(),
      duration: 400,
      startYaw: controls.yaw,
      startPitch: controls.pitch,
      endYaw: targetScene.yaw ?? controls.yaw,
      endPitch: targetScene.pitch ?? controls.pitch,
      startFov: controls.fov,
      endFov: targetScene.fov ?? controls.fov,
    } as typeof transitionRef.current;

    onHotspotClick?.(hotspot);
  }, [onHotspotClick, scenes]);

  const removeOverlappingTiles = useCallback((level: number, col: number, row: number) => {
    const manifestSnapshot = manifestRef.current;
    if (!manifestSnapshot) return;

    const targetLevelInfo = manifestSnapshot.levels[level];
    if (!targetLevelInfo) return;

    const targetCols = targetLevelInfo.cols || targetLevelInfo.tilesX || 1;
    const targetRows = targetLevelInfo.rows || targetLevelInfo.tilesY || 1;

    tileCacheRef.current.forEach((entry, key) => {
      if (entry.level === level && entry.col === col && entry.row === row && entry.sceneId === currentSceneIdRef.current) {
        return;
      }

      const entryLevelInfo = manifestSnapshot.levels[entry.level];
      if (!entryLevelInfo) return;

      const entryCols = entryLevelInfo.cols || entryLevelInfo.tilesX || 1;
      const entryRows = entryLevelInfo.rows || entryLevelInfo.tilesY || 1;

      if (entry.level < level) {
        return;
      }

      if (entry.level > level) {
        const colScale = (entryCols / targetCols) || 1;
        const rowScale = (entryRows / targetRows) || 1;
        const childColStart = Math.floor(col * colScale);
        const childColEnd = Math.ceil((col + 1) * colScale);
        const childRowStart = Math.floor(row * rowScale);
        const childRowEnd = Math.ceil((row + 1) * rowScale);
        if (entry.col >= childColStart && entry.col < childColEnd && entry.row >= childRowStart && entry.row < childRowEnd) {
          disposeTileEntry(entry);
          tileCacheRef.current.delete(key);
        }
      }
    });
  }, []);

  useEffect(() => {
    THREE.Cache.enabled = true;
    return () => {
      THREE.Cache.clear();
    };
  }, []);

  const processQueue = useCallback(() => {
    if (activeLoadsRef.current >= MAX_CONCURRENT_TILE_LOADS) {
      return;
    }

    const request = tileQueueRef.current.shift();
    if (!request) {
      return;
    }

    const manifestSnapshot = manifestRef.current;
    const targetSceneId = currentSceneIdRef.current;
    const scene = sceneRef.current;

    if (!manifestSnapshot || !scene) {
      pendingSetRef.current.delete(request.key);
      return;
    }

    const levelInfo = manifestSnapshot.levels[request.level];
    if (!levelInfo) {
      pendingSetRef.current.delete(request.key);
      processQueue();
      return;
    }

    const loader = textureLoaderRef.current ?? new THREE.TextureLoader();
    textureLoaderRef.current = loader;

    activeLoadsRef.current += 1;

    const tileUrl = buildTileUrl(manifestSnapshot, request.sceneId, request.level, request.col, request.row);

    console.log('[MultiresViewer] Loading tile:', {
      sceneId: request.sceneId,
      level: request.level,
      col: request.col,
      row: request.row,
      url: tileUrl
    });

    loader.load(
      tileUrl,
      (texture) => {
        activeLoadsRef.current = Math.max(0, activeLoadsRef.current - 1);

        if (destroyedRef.current || request.sceneId !== targetSceneId) {
          texture.dispose();
          pendingSetRef.current.delete(request.key);
          processQueue();
          return;
        }

        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
        const renderer = rendererRef.current;
        if (renderer) {
          const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
          texture.anisotropy = Math.min(8, maxAnisotropy);
        } else {
          texture.anisotropy = 4;
        }

        const geometryKey = `${manifestSnapshot.overlap ?? 0}:${request.level}:${request.col}:${request.row}`;
        const cachedGeometry = geometryCacheRef.current.get(geometryKey);
        const geometry =
          cachedGeometry ??
          (() => {
            const geom = createTileGeometry(
              levelInfo,
              request.col,
              request.row,
              manifestSnapshot.overlap ?? 0,
            );
            geometryCacheRef.current.set(geometryKey, geom);
            return geom;
          })();

        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.needsUpdate = true;
        
        const material = new THREE.MeshBasicMaterial({
          map: texture,
          side: THREE.DoubleSide,  // Use DoubleSide to ensure visibility
          depthWrite: false,
          depthTest: true,
          transparent: true,  // Enable transparency for smooth transitions
          opacity: 1.0,
          toneMapped: false,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.renderOrder = 10 + request.level;
        mesh.frustumCulled = false;
        mesh.visible = true; // Ensure tile is visible
        scene.add(mesh);
        console.log('[MultiresViewer] Tile loaded successfully:', request.key, 'Visible:', mesh.visible);

        tileCacheRef.current.set(request.key, {
          key: request.key,
          sceneId: request.sceneId,
          level: request.level,
          col: request.col,
          row: request.row,
          mesh,
          texture,
          lastUsed: performance.now(),
        });

        removeOverlappingTiles(request.level, request.col, request.row);

        // Keep preview visible until we have enough tiles loaded
        const tileCount = tileCacheRef.current.size;
        if (previewMeshRef.current && tileCount > 4) {
          // Fade out preview gradually
          const material = previewMeshRef.current.material as THREE.MeshBasicMaterial;
          if (material.opacity > 0.1) {
            material.transparent = true;
            material.opacity = Math.max(0, material.opacity - 0.1);
          } else {
            previewMeshRef.current.visible = false;
          }
        }

        if (tileCacheRef.current.size > TILE_CACHE_LIMIT) {
          const entries = Array.from(tileCacheRef.current.values()).sort(
            (a, b) => (a.lastUsed ?? 0) - (b.lastUsed ?? 0),
          );
          while (tileCacheRef.current.size > TILE_CACHE_LIMIT && entries.length) {
            const entry = entries.shift();
            if (!entry) break;
            disposeTileEntry(entry);
            tileCacheRef.current.delete(entry.key);
          }
        }

        pendingSetRef.current.delete(request.key);
        processQueue();
      },
      undefined,
      (error) => {
        console.error('[MultiresViewer] Failed to load tile:', request.key, error);
        activeLoadsRef.current = Math.max(0, activeLoadsRef.current - 1);
        pendingSetRef.current.delete(request.key);
        processQueue();
      },
    );
  }, []);

  const scheduleTile = useCallback(
    (level: number, col: number, row: number, priority: number) => {
      const sceneId = currentSceneIdRef.current;
      if (!sceneId) return;

      const key = getTileKey(sceneId, level, col, row);
      if (tileCacheRef.current.has(key) || pendingSetRef.current.has(key)) {
        return;
      }

      pendingSetRef.current.add(key);
      tileQueueRef.current.push({ key, sceneId, level, col, row, priority });
      tileQueueRef.current.sort((a, b) => a.priority - b.priority);
      processQueue();
    },
    [processQueue],
  );

  const updateVisibleTiles = useCallback(() => {
    const manifestSnapshot = manifestRef.current;
    const sceneId = currentSceneIdRef.current;
    const container = containerRef.current;

    if (!manifestSnapshot || !sceneId || !container) {
      console.log('[updateVisibleTiles] Missing requirements:', {
        hasManifest: !!manifestSnapshot,
        hasSceneId: !!sceneId,
        hasContainer: !!container
      });
      return;
    }

    const controls = controlsRef.current;
    const levelIndex = getAppropriateLevel(
      controls.fov,
      manifestSnapshot.levels,
      container.clientWidth || window.innerWidth,
    );

    const levelInfo = manifestSnapshot.levels[levelIndex];
    if (!levelInfo) {
      return;
    }

    const visible = calculateVisibleTiles(
      { yaw: controls.yaw, pitch: controls.pitch, fov: controls.fov },
      levelInfo,
      manifestSnapshot.originalWidth,
      manifestSnapshot.originalHeight,
    );

    const keep = new Set<string>();
    const colCenter = ((controls.yaw + 180) / 360) * levelInfo.cols;
    const rowCenter = ((controls.pitch + 90) / 180) * levelInfo.rows;

    visible.forEach(({ col, row }) => {
      const key = getTileKey(sceneId, levelIndex, col, row);
      keep.add(key);
      const priority = Math.abs(col - colCenter) + Math.abs(row - rowCenter);
      scheduleTile(levelIndex, col, row, priority);
    });

    const now = performance.now();
    tileCacheRef.current.forEach((entry, key) => {
      if (entry.sceneId !== sceneId) {
        disposeTileEntry(entry);
        tileCacheRef.current.delete(key);
        return;
      }

      if (keep.has(key)) {
        entry.lastUsed = now;
        entry.pendingRemovalAt = undefined;
        entry.mesh.visible = true; // Always show tiles that should be visible
        return;
      }

      // Keep tiles from other levels visible to prevent flashing
      // Only hide if it's the same level but out of view
      if (entry.level === levelIndex) {
        entry.mesh.visible = false; // Hide same-level tiles that are out of view
      } else {
        entry.mesh.visible = true; // Keep other level tiles visible for smooth transition
      }

      if (!entry.pendingRemovalAt) {
        entry.pendingRemovalAt = now;
      } else if (now - entry.pendingRemovalAt > TILE_UNLOAD_COOLDOWN) {
        disposeTileEntry(entry);
        tileCacheRef.current.delete(key);
      }
    });
  }, [scheduleTile]);

  const updateVisibleTilesRef = useRef(() => {});
  useEffect(() => {
    updateVisibleTilesRef.current = updateVisibleTiles;
  }, [updateVisibleTiles]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    // Only initialize renderer once, don't recreate on every mount
    if (rendererRef.current) {
      return;
    }

    destroyedRef.current = false;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const width = container.clientWidth;
    const height = container.clientHeight;
    renderer.setSize(width, height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    
    console.log('[MultiresViewer] Renderer initialized:', {
      containerSize: { width, height },
      pixelRatio: renderer.getPixelRatio(),
      domElement: renderer.domElement
    });

    const scene = new THREE.Scene();
    // Use a neutral gray background instead of black to prevent flickering
    scene.background = new THREE.Color(0x2a2a2a);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      controlsRef.current.fov,
      container.clientWidth / container.clientHeight || 1,
      0.1,
      2000,
    );
    camera.position.set(0, 0, 0);  // Camera should be at the center of the sphere
    camera.lookAt(yawPitchToVector(controlsRef.current.yaw, controlsRef.current.pitch, 1));
    camera.updateProjectionMatrix();
    scene.add(camera);
    cameraRef.current = camera;
    console.log('[MultiresViewer] Camera initialized at origin');

    const hotspotGroup = new THREE.Group();
    hotspotGroup.name = 'hotspots';
    scene.add(hotspotGroup);
    hotspotsGroupRef.current = hotspotGroup;

    const handleResize = () => {
      if (!rendererRef.current || !cameraRef.current || !containerRef.current) return;
      const { clientWidth, clientHeight } = containerRef.current;
      rendererRef.current.setSize(clientWidth, clientHeight, false);
      cameraRef.current.aspect = clientWidth / clientHeight || 1;
      cameraRef.current.updateProjectionMatrix();
      updateVisibleTilesRef.current();
    };

    const animate = () => {
      if (!sceneRef.current || !cameraRef.current || !rendererRef.current) {
        return;
      }

      const controls = controlsRef.current;
      const transition = transitionRef.current;
      const now = performance.now();

      const isTransitioning = transition.targetSceneId !== null;

      if (isTransitioning) {
        const duration = transition.duration > 0 ? transition.duration : 400; // Faster fallback duration
        const elapsed = now - transition.startTime;
        const progress = Math.min(1, elapsed / duration);
        const eased = progress * progress * (3 - 2 * progress);

        controls.velocityYaw = 0;
        controls.velocityPitch = 0;
        controls.yaw = THREE.MathUtils.lerp(transition.startYaw, transition.endYaw, eased);
        controls.pitch = THREE.MathUtils.lerp(transition.startPitch, transition.endPitch, eased);
        controls.fov = THREE.MathUtils.lerp(transition.startFov, transition.endFov, eased);

        if (progress >= 1) {
          controls.yaw = transition.endYaw;
          controls.pitch = transition.endPitch;
          controls.fov = transition.endFov;

          if (currentSceneIdRef.current === transition.targetSceneId) {
            transition.targetSceneId = null;
          } else {
            transition.startTime = now;
            transition.startYaw = controls.yaw;
            transition.startPitch = controls.pitch;
            transition.startFov = controls.fov;
          }
        }
      } else if (!controls.pointerActive) {
        controls.velocityYaw *= 0.85;  // Increased dampening from 0.92 to 0.85 for quicker stop
        controls.velocityPitch *= 0.85;  // Increased dampening from 0.92 to 0.85
        controls.yaw += controls.velocityYaw;
        controls.pitch += controls.velocityPitch;
        
        // Add autoplay rotation when enabled
        if (isAutoplayRef.current) {
          controls.yaw += tour.default_yaw_speed || 0.5;
        }
      }

      controls.pitch = Math.max(-85, Math.min(85, controls.pitch));
      cameraRef.current.lookAt(yawPitchToVector(controls.yaw, controls.pitch, 1));

      const fovDiff = controls.fov - cameraRef.current.fov;
      if (Math.abs(fovDiff) > 0.05) {
        cameraRef.current.fov += fovDiff * 0.12;
        cameraRef.current.updateProjectionMatrix();
      }

      if (now - lastTileUpdateRef.current > TILE_UPDATE_INTERVAL_MS) {
        lastTileUpdateRef.current = now;
        updateVisibleTilesRef.current();
      }

      if (hotspotsGroupRef.current) {
        const spriteScale = THREE.MathUtils.clamp(32 - (controls.fov - 40) * 0.2, 18, 30);
        hotspotsGroupRef.current.children.forEach((child) => {
          if (child instanceof THREE.Group) {
            // Handle new hotspot groups (icon + text)
            child.children.forEach((groupChild) => {
              if (groupChild instanceof THREE.Sprite) {
                // Scale the icon sprite
                if (groupChild.position.y === 0) { // This is the icon (at y=0)
                  groupChild.scale.setScalar(spriteScale);
                }
                // Keep text sprite at fixed scale for readability
                groupChild.visible = true;
              }
            });
            child.visible = true;
          } else if (child instanceof THREE.Sprite) {
            // Handle legacy single sprites (backward compatibility)
            child.scale.setScalar(spriteScale);
            child.visible = true;
          }
        });
        
        // Ensure the hotspots group itself is visible
        hotspotsGroupRef.current.visible = true;
      }

      rendererRef.current.render(sceneRef.current, cameraRef.current);
      
      // Debug: Log scene state periodically
      if (Math.random() < 0.01) { // Log 1% of frames
        const visibleMeshes = sceneRef.current.children.filter((child: THREE.Object3D) => 
          child instanceof THREE.Mesh && child.visible
        );
        if (visibleMeshes.length > 0 || Math.random() < 0.1) { // Always log if meshes visible
          console.log('[MultiresViewer] Render state:', {
            sceneChildren: sceneRef.current.children.length,
            visibleMeshes: visibleMeshes.length,
            cameraPosition: cameraRef.current.position,
            cameraRotation: cameraRef.current.rotation,
            controls: { yaw: controls.yaw, pitch: controls.pitch, fov: controls.fov }
          });
        }
      }
    };

    renderer.setAnimationLoop(animate);
    window.addEventListener('resize', handleResize);

    const pickHotspot = (event: PointerEvent): Hotspot | null => {
      const renderer = rendererRef.current;
      const camera = cameraRef.current;
      const group = hotspotsGroupRef.current;
      if (!renderer || !camera || !group) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      pointerRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointerRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycasterRef.current.setFromCamera(pointerRef.current, camera);
      const intersects = raycasterRef.current.intersectObjects(group.children, true);
      if (!intersects.length) return null;
      let node: THREE.Object3D | null = intersects[0].object;
      while (node && !node.userData?.hotspot) {
        node = node.parent;
      }
      return node?.userData?.hotspot ?? null;
    };

    const pickSphere = (event: PointerEvent): { yaw: number; pitch: number } | null => {
      const renderer = rendererRef.current;
      const camera = cameraRef.current;
      if (!renderer || !camera) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      pointerRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointerRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycasterRef.current.setFromCamera(pointerRef.current, camera);
      const intersectionPoint = raycasterRef.current.ray.intersectSphere(PICKING_SPHERE, new THREE.Vector3());
      if (!intersectionPoint) return null;
      return vectorToYawPitch(intersectionPoint);
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!rendererRef.current) return;
      pointerStateRef.current.isPointerDown = true;
      pointerStateRef.current.startX = event.clientX;
      pointerStateRef.current.startY = event.clientY;
      pointerStateRef.current.lastX = event.clientX;
      pointerStateRef.current.lastY = event.clientY;
      pointerStateRef.current.shiftKey = event.shiftKey;
      
      rendererRef.current.domElement.setPointerCapture(event.pointerId);

      if (isEditMode) {
        const hotspot = pickHotspot(event);
        if (hotspot) {
          const group = hotspotsGroupRef.current;
          const hotspotGroup = group?.children.find(
            (child) => child.userData.hotspot?.id === hotspot.id,
          ) as THREE.Group | undefined;
          if (hotspotGroup) {
            draggingSpriteRef.current = hotspotGroup as any; // Store the group instead of sprite
            originalHotspotRef.current = hotspot;
            return;
          }
        }
      }

      controlsRef.current.pointerActive = true;
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!pointerStateRef.current.isPointerDown) return;
      const dx = event.clientX - pointerStateRef.current.lastX;
      const dy = event.clientY - pointerStateRef.current.lastY;
      pointerStateRef.current.lastX = event.clientX;
      pointerStateRef.current.lastY = event.clientY;

      if (draggingSpriteRef.current && isEditMode) {
        const coords = pickSphere(event);
        if (coords && originalHotspotRef.current) {
          const updated: Hotspot = { ...originalHotspotRef.current, yaw: coords.yaw, pitch: coords.pitch };
          draggingSpriteRef.current.position.copy(yawPitchToVector(updated.yaw, updated.pitch, SPHERE_RADIUS - 5));
          draggingSpriteRef.current.userData.hotspot = updated;
          onHotspotUpdate?.(updated);
        }
        return;
      }

      controlsRef.current.yaw -= dx * 0.04;  // Further reduced to 0.04 for much smoother control
      controlsRef.current.pitch = THREE.MathUtils.clamp(
        controlsRef.current.pitch + dy * 0.04,  // Further reduced to 0.04
        -85,
        85,
      );
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (!pointerStateRef.current.isPointerDown) return;
      rendererRef.current?.domElement.releasePointerCapture(event.pointerId);
      pointerStateRef.current.isPointerDown = false;
      controlsRef.current.pointerActive = false;

      const moved =
        Math.abs(event.clientX - pointerStateRef.current.startX) > 6 ||
        Math.abs(event.clientY - pointerStateRef.current.startY) > 6;

      if (draggingSpriteRef.current) {
        draggingSpriteRef.current = null;
        originalHotspotRef.current = null;
      } else if (!moved) {
        const hotspot = pickHotspot(event);
        if (hotspot) {
          if (hotspot.kind === 'navigation') {
            startSceneTransition(hotspot);
          } else {
            onHotspotClick?.(hotspot);
          }
        } else if (isEditMode && (pointerStateRef.current.shiftKey || event.shiftKey)) {
          const coords = pickSphere(event);
          if (coords) {
            onHotspotCreate?.(coords.yaw, coords.pitch);
          }
        }
      }

      controlsRef.current.velocityYaw = (pointerStateRef.current.startX - event.clientX) * 0.01;  // Further reduced to 0.01 for minimal inertia
      controlsRef.current.velocityPitch = (event.clientY - pointerStateRef.current.startY) * 0.01;  // Further reduced to 0.01
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      controlsRef.current.fov = THREE.MathUtils.clamp(controlsRef.current.fov + event.deltaY * 0.02, 35, 100);
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);
    renderer.domElement.addEventListener('pointerleave', handlePointerUp);
    renderer.domElement.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      destroyedRef.current = true;
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('pointerleave', handlePointerUp);
      renderer.domElement.removeEventListener('wheel', handleWheel);
      renderer.setAnimationLoop(null);

      tileCacheRef.current.forEach((entry) => disposeTileEntry(entry));
      tileCacheRef.current.clear();
      transitionRef.current.targetSceneId = null;

      if (previewMeshRef.current) {
        if (previewMeshRef.current.material instanceof THREE.Material) {
          previewMeshRef.current.material.dispose();
        }
        previewMeshRef.current.geometry.dispose();
        previewMeshRef.current = null;
      }

      // Remove canvas from DOM
      if (container && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [onHotspotClick, onHotspotCreate, onHotspotUpdate, isEditMode]);

  useEffect(() => {
    console.log('[MultiresViewer] Scene changed:', currentScene.id, {
      hasManifest: !!manifest,
      tilesManifest: currentScene.tiles_manifest,
      manifest: manifest
    });
    manifestRef.current = manifest;
    currentSceneRef.current = currentScene;
    currentSceneIdRef.current = currentScene.id;

    tileQueueRef.current = [];
    pendingSetRef.current.clear();
    activeLoadsRef.current = 0;
    if (transitionRef.current.targetSceneId !== currentScene.id) {
      transitionRef.current.targetSceneId = null;
    }

    // Hide old tiles immediately to prevent dimming, but don't dispose yet
    tileCacheRef.current.forEach((entry) => {
      if (entry.sceneId !== currentScene.id && entry.mesh) {
        entry.mesh.visible = false; // Hide instead of fading to prevent dimming
      }
    });

    // Ensure preview mesh is visible immediately to prevent flicker
    if (previewMeshRef.current) {
      previewMeshRef.current.visible = true;
      // Reset preview opacity for new scene
      const material = previewMeshRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = 1.0;
      material.transparent = true;
    }

    // Load new scene preview immediately
    loadPreviewTexture();
    
    // Clear old tiles after a short delay to allow new preview to load
    setTimeout(() => {
      tileCacheRef.current.forEach((entry) => {
        if (entry.sceneId !== currentScene.id) {
          disposeTileEntry(entry);
        }
      });
      // Remove entries for old scenes
      const keysToDelete: string[] = [];
      tileCacheRef.current.forEach((entry, key) => {
        if (entry.sceneId !== currentScene.id) {
          keysToDelete.push(key);
        }
      });
      keysToDelete.forEach(key => tileCacheRef.current.delete(key));
    }, 100); // Reduced to 100ms for faster cleanup

    updateHotspots();
    requestAnimationFrame(() => updateVisibleTilesRef.current());
  }, [manifest, currentScene, loadPreviewTexture, updateHotspots]);

  // Add a separate effect to update hotspots when the hotspots array changes
  useEffect(() => {
    updateHotspots();
  }, [hotspots, updateHotspots]);

  // Handle edit mode changes without reinitializing the entire viewer
  useEffect(() => {
    // Ensure hotspots remain visible when edit mode changes
    if (hotspotsGroupRef.current) {
      hotspotsGroupRef.current.visible = true;
      hotspotsGroupRef.current.children.forEach((child) => {
        if (child instanceof THREE.Sprite) {
          child.visible = true;
        }
      });
    }
  }, [isEditMode]);

  useEffect(() => {
    const controls = controlsRef.current;
    const transition = transitionRef.current;
    const isTransitionTarget = transition.targetSceneId === currentScene.id;

    if (!isTransitionTarget) {
      controls.yaw = currentScene.yaw ?? 0;
      controls.pitch = currentScene.pitch ?? 0;
      controls.fov = currentScene.fov ?? tour?.default_fov ?? 75;
    } else {
      transition.endYaw = currentScene.yaw ?? transition.endYaw;
      transition.endPitch = currentScene.pitch ?? transition.endPitch;
      transition.endFov = currentScene.fov ?? transition.endFov;
    }

    controls.velocityYaw = 0;
    controls.velocityPitch = 0;
  }, [currentScene, tour?.default_fov]);

  useEffect(() => {
    onSceneChange?.(currentScene.id);
  }, [currentScene.id, onSceneChange]);

  useEffect(() => {
    if (!scenes.length) return;
    const index = scenes.findIndex((scene) => scene.id === currentScene.id);
    if (index === -1) return;
    const nextScene = scenes[(index + 1) % scenes.length];
    if (!nextScene || nextScene.id === currentScene.id) return;
    const manifestCandidate = parseSceneManifest(nextScene);
    if (!manifestCandidate?.preview) return;

    const loader = textureLoaderRef.current ?? new THREE.TextureLoader();
    textureLoaderRef.current = loader;
    const absoluteUrl = /^https?:\/\//i.test(manifestCandidate.preview)
      ? manifestCandidate.preview
      : new URL(manifestCandidate.preview, window.location.origin).toString();
    loader.load(absoluteUrl, () => {}, undefined, () => {});
  }, [currentScene.id, scenes]);

  // Handle autoplay state changes
  useEffect(() => {
    console.log('[MultiresViewer] Autoplay state changed:', isAutoplay, '-> ref updated');
    isAutoplayRef.current = isAutoplay;
  }, [isAutoplay]);

  const missingMedia = !manifest && !currentScene.src_original_url;

  return (
    <div className="absolute inset-0 bg-black">
      <div 
        ref={containerRef} 
        className="absolute inset-0"
      />
      {missingMedia && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-gray-400">
          No imagery available for this scene.
        </div>
      )}
    </div>
  );
};

MultiresViewer.displayName = 'MultiresViewer';

export default MultiresViewer;
