'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
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
}

const PICKING_SPHERE = new THREE.Sphere(new THREE.Vector3(), SPHERE_RADIUS);

function useHotspotUpdater(
  hotspots: Hotspot[],
  currentSceneId: string,
  hotspotsGroupRef: React.MutableRefObject<THREE.Group | null>,
) {
  return useCallback(() => {
    const group = hotspotsGroupRef.current;
    if (!group) return;

    while (group.children.length) {
      const child = group.children.pop();
      if (!child) continue;
      group.remove(child);
      child.traverse((node) => {
        if (node instanceof THREE.Sprite && node.material instanceof THREE.Material) {
          node.material.dispose();
        }
      });
    }

    hotspots
      .filter((hotspot) => hotspot.scene_id === currentSceneId)
      .forEach((hotspot) => group.add(createHotspotSprite(hotspot)));
  }, [hotspots, currentSceneId, hotspotsGroupRef]);
}

function usePreviewLoader(
  manifestRef: React.MutableRefObject<ExtendedManifest | null>,
  currentSceneRef: React.MutableRefObject<Scene | null>,
  textureLoaderRef: React.MutableRefObject<THREE.TextureLoader | null>,
  previewMeshRef: React.MutableRefObject<THREE.Mesh | null>,
  sceneRef: React.MutableRefObject<THREE.Scene | null>,
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
          const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide });
          const mesh = new THREE.Mesh(geometry, material);
          mesh.renderOrder = -1000;
          mesh.frustumCulled = false;
          previewMeshRef.current = mesh;
          scene.add(mesh);
        } else {
          const material = previewMeshRef.current.material as THREE.MeshBasicMaterial;
          material.map?.dispose();
          material.map = texture;
          material.needsUpdate = true;
          previewMeshRef.current.visible = true;
        }
      },
      undefined,
      () => {
        /* ignore preview errors */
      },
    );
  }, [manifestRef, currentSceneRef, textureLoaderRef, previewMeshRef, sceneRef]);
}

export default function MultiresViewer({
  tour,
  currentScene,
  scenes = [],
  onSceneChange,
  onHotspotClick,
  isEditMode = false,
  onHotspotCreate,
  onHotspotUpdate,
  hotspots = [],
}: MultiresViewerProps) {
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

  const tileCacheRef = useRef<Map<string, TileEntry>>(new Map());
  const geometryCacheRef = useRef<Map<string, THREE.BufferGeometry>>(new Map());
  const tileQueueRef = useRef<TileRequest[]>([]);
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

  const manifest = useMemo(() => parseSceneManifest(currentScene), [currentScene]);
  const updateHotspots = useHotspotUpdater(hotspots, currentScene.id, hotspotsGroupRef);
  const loadPreviewTexture = usePreviewLoader(
    manifestRef,
    currentSceneRef,
    textureLoaderRef,
    previewMeshRef,
    sceneRef,
  );

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
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;

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

        const material = new THREE.MeshBasicMaterial({
          map: texture,
          side: THREE.BackSide,
          depthWrite: false,
          toneMapped: false,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.renderOrder = 10 + request.level;
        mesh.frustumCulled = false;
        scene.add(mesh);

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

        if (previewMeshRef.current && request.level === manifestSnapshot.levels.length - 1) {
          previewMeshRef.current.visible = false;
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
      () => {
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
        entry.mesh.visible = true;
        return;
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
    if (!container || rendererRef.current) return;

    destroyedRef.current = false;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      controlsRef.current.fov,
      container.clientWidth / container.clientHeight || 1,
      0.5,
      2000,
    );
    scene.add(camera);
    cameraRef.current = camera;

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

      if (!controls.pointerActive) {
        controls.velocityYaw *= 0.92;
        controls.velocityPitch *= 0.92;
        controls.yaw += controls.velocityYaw;
        controls.pitch += controls.velocityPitch;
      }

      controls.pitch = Math.max(-85, Math.min(85, controls.pitch));
      cameraRef.current.lookAt(yawPitchToVector(controls.yaw, controls.pitch, 1));

      const fovDiff = controls.fov - cameraRef.current.fov;
      if (Math.abs(fovDiff) > 0.05) {
        cameraRef.current.fov += fovDiff * 0.12;
        cameraRef.current.updateProjectionMatrix();
      }

      const now = performance.now();
      if (now - lastTileUpdateRef.current > TILE_UPDATE_INTERVAL_MS) {
        lastTileUpdateRef.current = now;
        updateVisibleTilesRef.current();
      }

      if (hotspotsGroupRef.current) {
        const spriteScale = THREE.MathUtils.clamp(32 - (controls.fov - 40) * 0.2, 18, 30);
        hotspotsGroupRef.current.children.forEach((child) => {
          if (child instanceof THREE.Sprite) {
            child.scale.setScalar(spriteScale);
          }
        });
      }

      rendererRef.current.render(sceneRef.current, cameraRef.current);
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
          const sprite = group?.children.find(
            (child) => child instanceof THREE.Sprite && child.userData.hotspot?.id === hotspot.id,
          ) as THREE.Sprite | undefined;
          if (sprite) {
            draggingSpriteRef.current = sprite;
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

      controlsRef.current.yaw -= dx * 0.12;
      controlsRef.current.pitch = THREE.MathUtils.clamp(
        controlsRef.current.pitch + dy * 0.12,
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
          onHotspotClick?.(hotspot);
        } else if (isEditMode && (pointerStateRef.current.shiftKey || event.shiftKey)) {
          const coords = pickSphere(event);
          if (coords) {
            onHotspotCreate?.(coords.yaw, coords.pitch);
          }
        }
      }

      controlsRef.current.velocityYaw = (pointerStateRef.current.startX - event.clientX) * 0.05;
      controlsRef.current.velocityPitch = (event.clientY - pointerStateRef.current.startY) * 0.05;
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

      if (previewMeshRef.current) {
        if (previewMeshRef.current.material instanceof THREE.Material) {
          previewMeshRef.current.material.dispose();
        }
        previewMeshRef.current.geometry.dispose();
        previewMeshRef.current = null;
      }

      renderer.dispose();
      rendererRef.current = null;
    };
  }, [isEditMode, onHotspotClick, onHotspotCreate, onHotspotUpdate]);

  useEffect(() => {
    manifestRef.current = manifest;
    currentSceneRef.current = currentScene;
    currentSceneIdRef.current = currentScene.id;

    tileQueueRef.current = [];
    pendingSetRef.current.clear();
    activeLoadsRef.current = 0;

    tileCacheRef.current.forEach((entry) => disposeTileEntry(entry));
    tileCacheRef.current.clear();

    if (previewMeshRef.current) {
      previewMeshRef.current.visible = true;
    }

    loadPreviewTexture();
    updateHotspots();
    requestAnimationFrame(() => updateVisibleTilesRef.current());
  }, [manifest, currentScene, loadPreviewTexture, updateHotspots]);

  useEffect(() => {
    controlsRef.current.yaw = currentScene.yaw ?? 0;
    controlsRef.current.pitch = currentScene.pitch ?? 0;
    controlsRef.current.fov = currentScene.fov ?? tour?.default_fov ?? 75;
    controlsRef.current.velocityYaw = 0;
    controlsRef.current.velocityPitch = 0;
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

  const missingMedia = !manifest && !currentScene.src_original_url;

  return (
    <div className="relative h-full w-full bg-black">
      <div ref={containerRef} className="h-full w-full" />
      {missingMedia && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-gray-400">
          No imagery available for this scene.
        </div>
      )}
    </div>
  );
}
