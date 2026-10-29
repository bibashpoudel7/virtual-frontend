'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Tour, Scene, Hotspot, Overlay } from '@/types/tour';
import { CubeFace, CubeMapManifest } from '@/lib/cubemap-types';
import OverlayRenderer from '../overlays/OverlayRenderer';
import { CameraPoint, sampleCameraPath } from '@/lib/camera-path';

const R2_PUBLIC_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || 'https://tour.thenimto.com';

// Tiles are always loaded in CORS mode. The query string gives them their own browser-cache
// entry, so a copy cached earlier without CORS headers can never block (black out) a scene.
export const sceneTileUrl = (sceneId: string, tileKey: string) =>
  `${R2_PUBLIC_URL}/scenes/${sceneId}/tiles/${tileKey}.jpg?cors=1`;

// Direction from the camera for a yaw/pitch in degrees (same convention as the camera and hotspots)
const directionFromYawPitch = (yawDeg: number, pitchDeg: number) => {
  const y = THREE.MathUtils.degToRad(yawDeg + 180);
  const p = THREE.MathUtils.degToRad(pitchDeg);
  return new THREE.Vector3(Math.cos(p) * Math.cos(y), Math.sin(p), Math.cos(p) * Math.sin(y));
};

const FLOOR_DISC_DISTANCE = 38;

/**
 * Matterport-style navigation marker: lies flat on the floor with its arrow pointing away from the
 * viewer. Near the horizon it tilts toward the camera so it never turns edge-on.
 */
const placeFloorDisc = (mesh: THREE.Object3D, yawDeg: number, pitchDeg: number) => {
  const dir = directionFromYawPitch(yawDeg, pitchDeg);
  mesh.position.copy(dir).multiplyScalar(FLOOR_DISC_DISTANCE);
  const forward = new THREE.Vector3(dir.x, 0, dir.z);
  if (forward.lengthSq() < 1e-6) forward.set(0, 0, 1);
  forward.normalize();
  const tilt = THREE.MathUtils.clamp((pitchDeg + 20) / 30, 0, 0.5);
  const normal = new THREE.Vector3(0, 1, 0).lerp(dir.clone().negate(), tilt).normalize();
  const yAxis = forward.sub(normal.clone().multiplyScalar(forward.dot(normal))).normalize();
  const xAxis = new THREE.Vector3().crossVectors(yAxis, normal).normalize();
  mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, normal));
};

const createFloorDiscTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Soft shadow so the ring reads on bright floors
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 24;
    ctx.lineWidth = 30;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.beginPath();
    ctx.arc(256, 256, 196, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // Frosted centre
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.beginPath();
    ctx.arc(256, 256, 181, 0, Math.PI * 2);
    ctx.fill();
    // Chevron pointing "forward" (canvas top = the way you walk)
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = 10;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.98)';
    ctx.lineWidth = 34;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(176, 300);
    ctx.lineTo(256, 210);
    ctx.lineTo(336, 300);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  return texture;
};

// Convert a pointer position over the viewer into yaw/pitch (same maths as Shift+click placement)
const pointerToYawPitch = (event: PointerEvent, container: HTMLElement, camera: THREE.PerspectiveCamera) => {
  const rect = container.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  const direction = new THREE.Vector3(x, y, 0.5).unproject(camera).sub(camera.position).normalize();
  return {
    yaw: Math.atan2(direction.z, direction.x) * 180 / Math.PI - 180,
    pitch: Math.max(-89, Math.min(89, Math.asin(direction.y) * 180 / Math.PI)),
  };
};

interface CubeMapViewerProps {
  tour: Tour;
  currentScene: Scene;
  scenes?: Scene[];
  onSceneChange?: (sceneId: string) => void;
  onHotspotClick?: (hotspot: Hotspot) => void;
  isEditMode?: boolean;
  onHotspotCreate?: (yaw: number, pitch: number) => void;
  onHotspotUpdate?: (hotspot: Hotspot) => void;
  // Edit mode: a hotspot was dragged to a new position (save it)
  onHotspotMoveEnd?: (hotspot: Hotspot) => void;
  hotspots?: Hotspot[];
  overlays?: Overlay[];
  autoRotate?: boolean;
  highlightedHotspotId?: string | null;
  onOverlayPause?: () => void;
  onCameraChange?: (yaw: number, pitch: number, fov: number) => void;
  forcedCameraPosition?: { yaw: number; pitch: number; fov: number } | null;
  isPlaybackMode?: boolean;
  cameraControlRef?: React.MutableRefObject<{ setCamera: (yaw: number, pitch: number, fov: number) => void } | null>;
  preloadSceneIds?: string[];
  isManualSceneChange?: boolean;
  /** Edit mode: the next click on the panorama places a hotspot/overlay (same as Shift + click) */
  placementMode?: boolean;
  // Play Tour camera path to draw over the photo (start → points → end)
  cameraPath?: CameraPoint[] | null;
  // When set, path markers can be dragged; index 0 is S, the last is E, the rest are the numbered points
  onCameraPathPointMove?: (index: number, yaw: number, pitch: number) => void;
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
  onHotspotMoveEnd,
  hotspots: hotspotsProp = [],
  overlays = [],
  autoRotate = false,
  highlightedHotspotId = null,
  onOverlayPause,
  onCameraChange,
  forcedCameraPosition = null,
  isPlaybackMode = false,
  cameraControlRef,
  preloadSceneIds = [],
  isManualSceneChange = false,
  placementMode = false,
  cameraPath = null,
  onCameraPathPointMove,
}: CubeMapViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Parents often rebuild the hotspot array every render (e.g. each Play Tour frame); keep the same
  // array while the content is unchanged so markers and listeners aren't rebuilt constantly
  const hotspotsKey = JSON.stringify(hotspotsProp.map(h => [h.id, h.yaw, h.pitch, h.kind, h.target_scene_id, h.payload]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const hotspots = useMemo(() => hotspotsProp, [hotspotsKey]);
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
  // Latest scenes for event handlers registered inside long-lived effects
  const scenesRef = useRef(scenes);
  scenesRef.current = scenes;
  const isManualSceneChangeRef = useRef<boolean>(false);
  // Camera reset for a new scene waits until that scene's textures are on screen, so the old
  // photo is never shown from the new scene's angle (that looked like a flip/jump)
  const pendingCameraResetRef = useRef<(() => void) | null>(null);
  const pendingCameraTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Scene whose photo is currently on the cube, and the fading copy of the previous photo
  const displayedSceneIdRef = useRef<string | null>(null);
  const transitionAnimFrameRef = useRef<number | null>(null);
  const ghostCubeRef = useRef<{ mesh: THREE.Mesh; materials: THREE.MeshBasicMaterial[]; oldMaps: THREE.Texture[] } | null>(null);
  const activeTransitionRef = useRef<{
    startTime: number;
    duration: number;
    startLon: number;
    startLat: number;
    deltaYaw: number;
    deltaPitch: number;
    startFov: number;
    targetFov: number;
    dirX: number;
    dirZ: number;
    stepDist: number;
  } | null>(null);
  // Play Tour path markers (for dragging) and the latest move callback
  const pathMarkersRef = useRef<THREE.Sprite[]>([]);
  const pathPointMoveRef = useRef(onCameraPathPointMove);
  pathPointMoveRef.current = onCameraPathPointMove;

  const flushPendingCameraReset = useCallback(() => {
    if (pendingCameraTimeoutRef.current) {
      clearTimeout(pendingCameraTimeoutRef.current);
      pendingCameraTimeoutRef.current = null;
    }
    const reset = pendingCameraResetRef.current;
    pendingCameraResetRef.current = null;
    reset?.();
  }, []);

  // Controls state
  const controlsRef = useRef({
    mouseX: 0,
    mouseY: 0,
    targetRotationX: 0,
    targetRotationY: 0,
    isUserInteracting: false,
    onPointerDownX: 0,
    onPointerDownY: 0,
    lastPointerX: 0,
    lastPointerY: 0,
    onPointerDownTime: 0,
    onPointerDownLon: 0,
    onPointerDownLat: 0,
    lon: 0,
    lat: 0,
    phi: 0,
    theta: 0,
    isDragging: false, // Track if user is dragging vs clicking
    // Inertia & Smoothness
    targetLon: 0,
    targetLat: 0,
    lonSpeed: 0,
    latSpeed: 0,
    dampingFactor: 0.94, // Smooth decay for flick momentum
    smoothFactor: 0.25,
  });

  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStateRef = useRef<{ initialDistance: number; initialFov: number } | null>(null);
  const velocityHistoryRef = useRef<Array<{ x: number; y: number; time: number }>>([]);

  const isAutoRotatingRef = useRef(isAutoRotating);
  const autoRotateRef = useRef(autoRotate);
  const isTransitioningRef = useRef(isTransitioning);
  const isPlaybackModeRef = useRef(isPlaybackMode);
  const placementModeRef = useRef(placementMode);
  // Placement-mode press waiting to see whether it's a click (place) or a drag (turn the view)
  const pendingPlacementRef = useRef(false);

  useEffect(() => {
    placementModeRef.current = placementMode;
    if (containerRef.current) {
      containerRef.current.style.cursor = placementMode ? 'crosshair' : 'default';
    }
  }, [placementMode]);

  // Sync refs with state/props
  useEffect(() => {
    isAutoRotatingRef.current = isAutoRotating;
  }, [isAutoRotating]);

  useEffect(() => {
    isTransitioningRef.current = isTransitioning;
  }, [isTransitioning]);

  useEffect(() => {
    autoRotateRef.current = autoRotate;
  }, [autoRotate]);

  useEffect(() => {
    isPlaybackModeRef.current = isPlaybackMode;
  }, [isPlaybackMode]);
  // Sharper tiles whenever the view is zoomed in, whatever zoomed it (wheel, Play Tour, preview).
  // Refs because the loader is defined further down and these run from long-lived callbacks.
  const currentLevelRef = useRef(currentLevel);
  currentLevelRef.current = currentLevel;
  const manifestRef = useRef(manifest);
  manifestRef.current = manifest;
  const loadLevelRef = useRef<(level: number) => void>(() => {});
  const requestDetailForFov = (fov: number) => {
    const levels = manifestRef.current?.levels;
    if (!levels?.length) return;
    const target = fov <= 20 && levels.some(l => l.level === 3) ? 3 : fov <= 40 ? 2 : 1;
    if (target > currentLevelRef.current) {
      currentLevelRef.current = target;
      loadLevelRef.current(target);
      setCurrentLevel(target);
    }
  };

  // Apply forced camera position (for Play Tour playback)
  useEffect(() => {
    if (forcedCameraPosition && cameraRef.current) {
      const controls = controlsRef.current;
      controls.lon = forcedCameraPosition.yaw;
      controls.lat = forcedCameraPosition.pitch;
      controls.targetLon = forcedCameraPosition.yaw;
      controls.targetLat = forcedCameraPosition.pitch;
      controls.lonSpeed = 0;
      controls.latSpeed = 0;
      controls.targetRotationX = 0;
      controls.targetRotationY = 0;
      cameraRef.current.fov = forcedCameraPosition.fov;
      cameraRef.current.updateProjectionMatrix();
      requestDetailForFov(forcedCameraPosition.fov);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          requestDetailForFov(fov);
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
          // Limit texture cache using LRU so preloaded and recent scenes transition immediately
          if (loadedTexturesRef.current.size > 48) {
            const keysToRemove: string[] = [];
            const currentScenePrefix = `${currentScene.id}_`;
            for (const key of loadedTexturesRef.current.keys()) {
              if (!key.startsWith(currentScenePrefix)) {
                keysToRemove.push(key);
                if (loadedTexturesRef.current.size - keysToRemove.length <= 36) break;
              }
            }
            keysToRemove.forEach(k => {
              const tex = loadedTexturesRef.current.get(k);
              tex?.dispose();
              loadedTexturesRef.current.delete(k);
            });
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

    // Parse manifest and handle camera reset
    if (!isPlaybackMode && !forcedCameraPosition) {
      const applyCameraReset = () => {
        const controls = controlsRef.current;

        // Apply scene defaults ONLY if not currently running a smooth hotspot transition
        if (isManualSceneChange || (!isTransitioningRef.current && !activeTransitionRef.current)) {
          console.log('[CubeMapViewer] Scene change: applying scene defaults.');
          controls.lon = currentScene.yaw || 0;
          controls.lat = currentScene.pitch || 0;
          controls.targetLon = currentScene.yaw || 0;
          controls.targetLat = currentScene.pitch || 0;
          controls.targetRotationX = 0; // Reset momentum
          controls.targetRotationY = 0;
          controls.lonSpeed = 0; // Stop any existing movement
          controls.latSpeed = 0;

          const targetFov = currentScene.fov || 60;
          if (cameraRef.current) {
            cameraRef.current.fov = targetFov;
            cameraRef.current.updateProjectionMatrix();
          }

          navigationTargetRef.current = null;
        }
      };

      // Dim the outgoing photo ONLY for manual scene changes without an active transition
      const hasTextures = materialsRef.current.some(material => material.map);
      if (hasTextures && isManualSceneChange && !isTransitioningRef.current && !activeTransitionRef.current) {
        const fadeStart = Date.now();
        const fadeOut = () => {
          if (!pendingCameraResetRef.current) return;
          const t = Math.min((Date.now() - fadeStart) / 150, 1);
          const value = Math.floor(255 - (255 - 0x88) * t);
          const hex = (value << 16) | (value << 8) | value;
          materialsRef.current.forEach(material => material.color.setHex(hex));
          if (t < 1) requestAnimationFrame(fadeOut);
        };
        requestAnimationFrame(fadeOut);
      }

      pendingCameraResetRef.current = applyCameraReset;
      if (pendingCameraTimeoutRef.current) clearTimeout(pendingCameraTimeoutRef.current);
      pendingCameraTimeoutRef.current = setTimeout(flushPendingCameraReset, 2500);
    }
  }, [currentScene, isManualSceneChange]);

  useEffect(() => () => {
    if (pendingCameraTimeoutRef.current) clearTimeout(pendingCameraTimeoutRef.current);
    if (transitionAnimFrameRef.current) cancelAnimationFrame(transitionAnimFrameRef.current);
    if (ghostCubeRef.current) {
      const { mesh, materials, oldMaps } = ghostCubeRef.current;
      mesh.parent?.remove(mesh);
      materials.forEach(m => m.dispose());
      oldMaps.forEach(m => m.dispose());
      ghostCubeRef.current = null;
    }
  }, []);

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
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.style.userSelect = 'none';
    (renderer.domElement.style as any).webkitUserSelect = 'none';
    (renderer.domElement.style as any).webkitTouchCallout = 'none';
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

      // Handle Inertia & Smooth Drag
      if (controls.isUserInteracting) {
        controls.targetLon = controls.lon;
        controls.targetLat = controls.lat;
      } else {
        // When released, apply damping to flick momentum
        if (Math.abs(controls.lonSpeed) > 0.005) {
          controls.lon += controls.lonSpeed;
          controls.lonSpeed *= controls.dampingFactor;
        } else {
          controls.lonSpeed = 0;
        }

        if (Math.abs(controls.latSpeed) > 0.005) {
          controls.lat += controls.latSpeed;
          controls.latSpeed *= controls.dampingFactor;
        } else {
          controls.latSpeed = 0;
        }

        // Keep targets in sync with current position
        controls.targetLon = controls.lon;
        controls.targetLat = controls.lat;
      }

      // Auto-rotation controlled by state or scene settings
      // Use refs to access latest values without re-triggering effect
      // Skip auto-rotate during playback mode, transitions, or active navigation
      if (!isPlaybackModeRef.current && !isTransitioningRef.current && !isNavigatingRef.current && !activeTransitionRef.current && (autoRotateRef.current || isAutoRotatingRef.current) && !controls.isUserInteracting && Math.abs(controls.lonSpeed) < 0.01) {
        const rotateSpeed = 0.5;
        controls.lon += rotateSpeed * 0.2;
        controls.targetLon = controls.lon; // Keep target in sync
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
                groupChild.visible = !isTransitioningRef.current;
              }
            });
            child.visible = !isTransitioningRef.current;
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

            // Hide hotspots during transition
            child.visible = !isTransitioningRef.current;

            // Update opacity
            if (child.material && 'opacity' in child.material) {
              const baseOpacity = (isHighlighted || isHovered) ? 1.0 : 0.8;
              child.material.opacity = baseOpacity + child.userData.glowIntensity * 0.2;
            }
          } else if (child instanceof THREE.Mesh && child.userData.isFloorDisc) {
            // Floor discs: grow and brighten on hover, gentle pulse when selected in the editor
            child.userData.glowIntensity += ((child.userData.targetGlow || 0) - child.userData.glowIntensity) * 0.15;
            // Keep a steady on-screen size when zooming (like the other markers): base size at F 75
            let discScale = ((cameraRef.current?.fov ?? 75) / 75) * (1 + child.userData.glowIntensity * 0.18);
            if (child.userData.isHighlighted) discScale += Math.sin(time * 3) * 0.06;
            child.scale.set(discScale, discScale, 1);
            child.visible = !isTransitioningRef.current;
            (child.material as THREE.MeshBasicMaterial).opacity = 0.85 + child.userData.glowIntensity * 0.15;
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
            const tileUrl = sceneTileUrl(targetSceneId, tileKey);

            const img = new Image();
            img.crossOrigin = 'anonymous';

            // Use decode() to force off-main-thread decoding (solves the "micro-lag" on render)
            img.src = tileUrl;
            img.decode()
              .then(() => {
                tileImages.set(tileKey, img);
                loadedCount++;
                if (loadedCount === totalTiles) {
                  console.log(`[CubeMapViewer] Preloaded and decoded all ${totalTiles} tiles for scene ${targetSceneId}`);
                  preloadedTilesRef.current.set(targetSceneId, tileImages);
                  preloadingPromiseRef.current.delete(targetSceneId);
                  resolve(true);
                }
              })
              .catch((err) => {
                loadedCount++;
                console.warn(`[CubeMapViewer] Failed to preload/decode tile: ${tileUrl}`, err);
                // Still resolve even with some failures to prevent hanging
                if (loadedCount === totalTiles) {
                  preloadedTilesRef.current.set(targetSceneId, tileImages);
                  preloadingPromiseRef.current.delete(targetSceneId);
                  resolve(true);
                }
              });
          }
        }
      });
    });

    preloadingPromiseRef.current.set(targetSceneId, promise);
    return promise;
  }, [scenes]);

  // Progressive loading of cube map tiles with proper compositing
  const loadCubeMapLevel = useCallback((level: number, preserveCamera: boolean = false) => {
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
    if (isPlaybackModeRef.current && level > 1) {
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

      const isSceneChange = !!displayedSceneIdRef.current && displayedSceneIdRef.current !== currentScene.id;
      const isQualityUpgrade = displayedSceneIdRef.current === currentScene.id;

      if (isSceneChange && cubeRef.current && sceneRef.current && materialsRef.current.some(m => m.map)) {
        // Clean up previous ghost if still present
        if (ghostCubeRef.current) {
          const { mesh, materials, oldMaps } = ghostCubeRef.current;
          mesh.parent?.remove(mesh);
          materials.forEach(m => m.dispose());
          oldMaps.forEach(m => m.dispose());
          ghostCubeRef.current = null;
        }

        const oldMaps: THREE.Texture[] = [];
        const ghostMaterials = materialsRef.current.map(material => {
          const ghostMaterial = material.clone();
          ghostMaterial.transparent = true;
          ghostMaterial.depthTest = false; // CRITICAL: completely prevents floor Z-fighting and wall clipping!
          ghostMaterial.depthWrite = false;
          ghostMaterial.side = THREE.BackSide;
          ghostMaterial.opacity = 1.0;
          return ghostMaterial;
        });

        const ghostCube = new THREE.Mesh(cubeRef.current.geometry, ghostMaterials);
        ghostCube.position.copy(cubeRef.current.position);
        ghostCube.scale.copy(cubeRef.current.scale);
        ghostCube.renderOrder = 2;
        sceneRef.current.add(ghostCube);
        ghostCubeRef.current = { mesh: ghostCube, materials: ghostMaterials, oldMaps };
      }

      displayedSceneIdRef.current = currentScene.id;

      // Update target FOV on active transition if specified
      if (activeTransitionRef.current && currentScene.fov) {
        activeTransitionRef.current.targetFov = currentScene.fov;
      }

      // Apply new textures to cubeRef.current
      pendingTextures.forEach((texture, faceIndex) => {
        if (materialsRef.current[faceIndex]) {
          const oldMap = materialsRef.current[faceIndex].map;
          materialsRef.current[faceIndex].map = texture;
          materialsRef.current[faceIndex].color.setHex(0xffffff);
          materialsRef.current[faceIndex].needsUpdate = true;

          // Dispose old texture if not cached (after ghost has faded)
          if (oldMap && oldMap !== texture && !Array.from(loadedTexturesRef.current.values()).includes(oldMap)) {
            if (ghostCubeRef.current) ghostCubeRef.current.oldMaps.push(oldMap);
            else oldMap.dispose();
          }
        }
      });

      // If active hotspot transition is running:
      // The unified tick RAF is ALREADY running and controlling camera rotation, forward walk displacement,
      // and ghost cross-fade. We do NOT snap camera or start another loop!
      if (!activeTransitionRef.current) {
        // Cross-fade for Play Tour and scene switches
        if (ghostCubeRef.current) {
          const fadeStart = Date.now();
          const fadeDuration = isPlaybackModeRef.current ? 650 : 350;
          const fadeManual = () => {
            const t = Math.min((Date.now() - fadeStart) / fadeDuration, 1);
            if (ghostCubeRef.current) {
              // Cosine ease-out for smooth non-linear dissolve
              const easedOpacity = 0.5 * (1 + Math.cos(Math.PI * t));
              ghostCubeRef.current.materials.forEach(m => {
                m.opacity = Math.max(0, easedOpacity);
              });
            }
            if (t < 1) {
              requestAnimationFrame(fadeManual);
            } else {
              if (ghostCubeRef.current) {
                const { mesh, materials, oldMaps } = ghostCubeRef.current;
                mesh.parent?.remove(mesh);
                materials.forEach(m => m.dispose());
                oldMaps.forEach(m => m.dispose());
                ghostCubeRef.current = null;
              }
              isTransitioningRef.current = false;
              setIsTransitioning(false);
              setIsLoading(false);
            }
          };
          requestAnimationFrame(fadeManual);
        } else {
          isTransitioningRef.current = false;
          setIsTransitioning(false);
          setIsLoading(false);
        }

        if (cubeRef.current) {
          cubeRef.current.position.set(0, 0, 0);
          cubeRef.current.scale.set(1, 1, 1);
        }
        if (cameraRef.current && !preserveCamera && !isQualityUpgrade && !isPlaybackModeRef.current) {
          const targetFov = currentScene.fov || 60;
          cameraRef.current.fov = targetFov;
          cameraRef.current.updateProjectionMatrix();
        }

        flushPendingCameraReset();
      }
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
          requestAnimationFrame(() => {
            applyAllTextures();
          });
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

        // When all 6 faces are ready, apply them all at once with a small delay for camera stability
        if (facesCompleted === 6) {
          requestAnimationFrame(() => {
            applyAllTextures();
          });
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
          const tileUrl = sceneTileUrl(currentScene.id, tileKey);

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
  }, [manifest, currentScene.id]);
  loadLevelRef.current = loadCubeMapLevel;

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
    }, isSceneTransition ? 0 : 50);
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

      // Navigation hotspots: a flat disc lying on the floor (Matterport style)
      if (isGroundHotspot) {
        const isDiscHighlighted = highlightedHotspotId === hotspot.id;
        const disc = new THREE.Mesh(
          new THREE.CircleGeometry(2.4, 48),
          new THREE.MeshBasicMaterial({
            map: createFloorDiscTexture(),
            transparent: true,
            opacity: 0.85,
            depthTest: false,
            depthWrite: false,
            side: THREE.DoubleSide,
          })
        );
        placeFloorDisc(disc, hotspot.yaw || 0, hotspot.pitch || 0);
        disc.renderOrder = isDiscHighlighted ? 2 : 1;
        disc.userData = {
          hotspot,
          type: 'hotspot',
          isGround: true,
          isFloorDisc: true,
          glowIntensity: isDiscHighlighted ? 1 : 0,
          targetGlow: isDiscHighlighted ? 1 : 0,
          isHighlighted: isDiscHighlighted,
        };
        hotspotsRef.current?.add(disc);
        return;
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
      const targetSceneId = h.target_scene_id;
      if (h.kind === 'navigation' && targetSceneId) {
        faces.forEach(face => {
          // Preload all 4 tiles (2x2) for each face
          for (let y = 0; y < 2; y++) {
            for (let x = 0; x < 2; x++) {
              const tileUrl = sceneTileUrl(targetSceneId, `${face}_l1_${x}_${y}`);
              const img = new Image();
              img.crossOrigin = 'anonymous'; // must match the viewer's CORS load or the cached copy is unusable
              img.src = tileUrl;
            }
          }
        });
      }
    });
  }, [hotspots, highlightedHotspotId, isLoading]);

  // Play Tour camera path: the curve the camera will follow, with S, numbered and E markers.
  // Drawn on top of the photo and never hit-tested, so it can't block clicks.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !cameraPath || cameraPath.length < 2) return;

    const radius = 40;
    const toVector = (yaw: number, pitch: number, r = radius) => {
      const y = THREE.MathUtils.degToRad(yaw + 180);
      const p = THREE.MathUtils.degToRad(pitch);
      return new THREE.Vector3(r * Math.cos(p) * Math.cos(y), r * Math.sin(p), r * Math.cos(p) * Math.sin(y));
    };

    const group = new THREE.Group();
    const disposables: { dispose: () => void }[] = [];
    const overlayMaterial = (color: number) => {
      const material = new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false, transparent: true, opacity: 0.95 });
      disposables.push(material);
      return material;
    };

    // The same curve playback follows
    const steps = Math.max(48, (cameraPath.length - 1) * 48);
    const samples: THREE.Vector3[] = [];
    for (let i = 0; i <= steps; i++) {
      const point = sampleCameraPath(cameraPath, i / steps);
      samples.push(toVector(point.yaw, point.pitch));
    }
    const tubeGeometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(samples), steps, 0.18, 8, false);
    disposables.push(tubeGeometry);
    const tube = new THREE.Mesh(tubeGeometry, overlayMaterial(0xd97706));
    tube.renderOrder = 3;
    group.add(tube);

    // Arrow head showing which way the camera moves
    const tip = samples[samples.length - 1];
    const beforeTip = samples[Math.max(samples.length - 4, 0)];
    const coneGeometry = new THREE.ConeGeometry(0.7, 1.8, 16);
    disposables.push(coneGeometry);
    const arrow = new THREE.Mesh(coneGeometry, overlayMaterial(0x0d9488));
    arrow.position.copy(tip);
    arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tip.clone().sub(beforeTip).normalize());
    arrow.renderOrder = 3;
    group.add(arrow);

    // S → 1, 2, 3… → E markers
    const lastIndex = cameraPath.length - 1;
    const markers: THREE.Sprite[] = [];
    cameraPath.forEach((point, index) => {
      const label = index === 0 ? 'S' : index === lastIndex ? 'E' : String(index);
      const color = index === 0 ? '#7c3aed' : index === lastIndex ? '#0d9488' : '#d97706';
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 64;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.beginPath();
      ctx.arc(32, 32, 28, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 30px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 32, 34);
      const texture = new THREE.CanvasTexture(canvas);
      const spriteMaterial = new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false, transparent: true });
      disposables.push(texture, spriteMaterial);
      const sprite = new THREE.Sprite(spriteMaterial);
      sprite.position.copy(toVector(point.yaw, point.pitch, radius - 0.5));
      sprite.scale.set(2.6, 2.6, 1);
      sprite.renderOrder = 4;
      sprite.userData.pathIndex = index;
      markers.push(sprite);
      group.add(sprite);
    });

    scene.add(group);
    pathMarkersRef.current = markers;
    return () => {
      scene.remove(group);
      disposables.forEach(item => item.dispose());
      pathMarkersRef.current = [];
    };
  }, [cameraPath]);

  // Edit mode: drag a hotspot to move it; it saves when released. A press without moving stays a
  // normal click. Window capture listeners run before the viewer's own handlers, so the camera
  // stops rotating once the hotspot starts moving.
  const isEditModeRef = useRef(isEditMode);
  isEditModeRef.current = isEditMode;
  const hotspotUpdateRef = useRef(onHotspotUpdate);
  hotspotUpdateRef.current = onHotspotUpdate;
  const hotspotMoveEndRef = useRef(onHotspotMoveEnd);
  hotspotMoveEndRef.current = onHotspotMoveEnd;
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let candidate: { object: THREE.Object3D; hotspot: Hotspot; x: number; y: number } | null = null;
    let dragging = false;
    let latest: { yaw: number; pitch: number } | null = null;

    const hotspotAt = (event: PointerEvent) => {
      if (!cameraRef.current || !hotspotsRef.current) return null;
      const rect = container.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(ndc, cameraRef.current);
      const hit = raycaster.intersectObjects(hotspotsRef.current.children, true)
        .find(h => h.object.userData?.hotspot);
      return hit ? hit.object : null;
    };

    const moveObject = (object: THREE.Object3D, yaw: number, pitch: number) => {
      if (object.userData.isFloorDisc) placeFloorDisc(object, yaw, pitch);
      else object.position.copy(directionFromYawPitch(yaw, pitch).multiplyScalar(45));
    };

    const onMove = (event: PointerEvent) => {
      if (!candidate) return;
      if (!dragging) {
        if (Math.hypot(event.clientX - candidate.x, event.clientY - candidate.y) < 5) return;
        dragging = true;
        const controls = controlsRef.current;
        controls.isUserInteracting = false;
        controls.isDragging = true; // so the viewer doesn't treat the release as a click
        controls.lonSpeed = 0;
        controls.latSpeed = 0;
        container.style.cursor = 'grabbing';
      }
      event.stopPropagation();
      if (!cameraRef.current) return;
      latest = pointerToYawPitch(event, container, cameraRef.current);
      moveObject(candidate.object, latest.yaw, latest.pitch);
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      if (dragging && candidate && latest) {
        const moved = { ...candidate.hotspot, yaw: latest.yaw, pitch: latest.pitch };
        hotspotUpdateRef.current?.(moved);
        hotspotMoveEndRef.current?.(moved);
      }
      candidate = null;
      dragging = false;
      latest = null;
    };

    const onPointerDownCapture = (event: PointerEvent) => {
      if (!isEditModeRef.current || !hotspotMoveEndRef.current || event.shiftKey) return;
      const object = hotspotAt(event);
      if (!object) return;
      candidate = { object, hotspot: object.userData.hotspot as Hotspot, x: event.clientX, y: event.clientY };
      window.addEventListener('pointermove', onMove, true);
      window.addEventListener('pointerup', onUp, true);
    };

    // Show a move cursor over hotspots in edit mode (only when no button is held)
    const onHoverCapture = (event: PointerEvent) => {
      if (candidate || event.buttons !== 0 || !isEditModeRef.current || !hotspotMoveEndRef.current) return;
      if (hotspotAt(event)) {
        container.style.cursor = 'move';
        event.stopPropagation();
      }
    };

    container.addEventListener('pointerdown', onPointerDownCapture, true);
    container.addEventListener('pointermove', onHoverCapture, true);
    return () => {
      container.removeEventListener('pointerdown', onPointerDownCapture, true);
      container.removeEventListener('pointermove', onHoverCapture, true);
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
    };
  }, []);

  // Drag a path marker to move that point. Capture-phase listeners run before the viewer's own
  // handlers, so grabbing a marker doesn't rotate the camera or add a new point.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let dragIndex: number | null = null;
    let frame = 0;
    let pending: { yaw: number; pitch: number } | null = null;

    const toNdc = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      return new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
    };

    // Same conversion as Shift+click hotspot placement
    const toYawPitch = (event: PointerEvent) => {
      const camera = cameraRef.current;
      if (!camera) return null;
      const ndc = toNdc(event);
      const direction = new THREE.Vector3(ndc.x, ndc.y, 0.5).unproject(camera).sub(camera.position).normalize();
      return {
        yaw: Math.atan2(direction.z, direction.x) * 180 / Math.PI - 180,
        pitch: Math.max(-85, Math.min(85, Math.asin(direction.y) * 180 / Math.PI)),
      };
    };

    const markerIndexAt = (event: PointerEvent): number | null => {
      if (!pathPointMoveRef.current || !cameraRef.current || pathMarkersRef.current.length === 0) return null;
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(toNdc(event), cameraRef.current);
      const hit = raycaster.intersectObjects(pathMarkersRef.current, false)[0];
      return hit ? (hit.object.userData.pathIndex as number) : null;
    };

    const onDragMove = (event: PointerEvent) => {
      if (dragIndex === null) return;
      pending = toYawPitch(event);
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (pending && dragIndex !== null) pathPointMoveRef.current?.(dragIndex, pending.yaw, pending.pitch);
      });
    };

    const onDragEnd = () => {
      dragIndex = null;
      container.style.cursor = '';
      window.removeEventListener('pointermove', onDragMove);
      window.removeEventListener('pointerup', onDragEnd);
    };

    const onPointerDownCapture = (event: PointerEvent) => {
      const index = markerIndexAt(event);
      if (index === null) return;
      event.preventDefault();
      event.stopPropagation();
      dragIndex = index;
      container.style.cursor = 'grabbing';
      window.addEventListener('pointermove', onDragMove);
      window.addEventListener('pointerup', onDragEnd);
    };

    // Show a grab cursor over markers (and keep the viewer's hover logic from overriding it)
    const onPointerMoveCapture = (event: PointerEvent) => {
      if (dragIndex !== null) return;
      if (markerIndexAt(event) !== null) {
        container.style.cursor = 'grab';
        event.stopPropagation();
      }
    };

    container.addEventListener('pointerdown', onPointerDownCapture, true);
    container.addEventListener('pointermove', onPointerMoveCapture, true);
    return () => {
      container.removeEventListener('pointerdown', onPointerDownCapture, true);
      container.removeEventListener('pointermove', onPointerMoveCapture, true);
      onDragEnd();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // Handle external preloading requests (e.g. from Play Tour)
  useEffect(() => {
    if (preloadSceneIds && preloadSceneIds.length > 0) {
      console.log('[CubeMapViewer] Processing external preload request for scenes:', preloadSceneIds);
      preloadSceneIds.forEach(id => {
        preloadSceneTiles(id);
      });
    }
  }, [preloadSceneIds, preloadSceneTiles]);

  // Render overlays
  // Manual overlay rendering removed in favor of OverlayRenderer component
  // which handles high-quality overlay rendering, hover effects, and interactions

  // Mouse controls
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Place a hotspot / path point at a screen position (with a short visual pulse)
    const placeAt = (clientX: number, clientY: number) => {
      const rect = container.getBoundingClientRect();
      mouseRef.current.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      if (!cameraRef.current || !onHotspotCreate) return;

      // Calculate yaw/pitch from click position on the sphere
      const vector = new THREE.Vector3(mouseRef.current.x, mouseRef.current.y, 0.5);
      vector.unproject(cameraRef.current);
      vector.sub(cameraRef.current.position).normalize();

      // Convert to spherical coordinates
      // Use atan2(z, x) to match cos/sin coordinate system, subtract 180° for camera offset
      const yaw = Math.atan2(vector.z, vector.x) * 180 / Math.PI - 180;
      const pitch = Math.asin(vector.y) * 180 / Math.PI;
      onHotspotCreate(yaw, pitch);

      // Visual feedback - create temporary marker
      const tempMarker = document.createElement('div');
      tempMarker.style.position = 'absolute';
      tempMarker.style.left = `${clientX - rect.left - 10}px`;
      tempMarker.style.top = `${clientY - rect.top - 10}px`;
      tempMarker.style.width = '20px';
      tempMarker.style.height = '20px';
      tempMarker.style.borderRadius = '50%';
      tempMarker.style.backgroundColor = '#4CAF50';
      tempMarker.style.animation = 'pulse 0.5s ease-out';
      tempMarker.style.pointerEvents = 'none';
      container.appendChild(tempMarker);
      setTimeout(() => tempMarker.remove(), 500);
    };

    const onPointerDown = (event: PointerEvent) => {
      // Disable interaction ONLY during transitions. 
      // Playback mode should still allow initial coordinate capture for clicks.
      if (isTransitioningRef.current) return;

      // Track active pointer in map
      activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

      // Edit mode: Shift + Click places right away. In placement mode (adding a hotspot or drawing a
      // path) a click places on release, so dragging still turns the view.
      if (isEditMode && event.shiftKey) {
        placeAt(event.clientX, event.clientY);
        return; // Don't start camera rotation when placing hotspot
      }
      pendingPlacementRef.current = isEditMode && placementModeRef.current;

      const controls = controlsRef.current;

      if (activePointersRef.current.size === 1) {
        // First pointer down: begin drag session
        try {
          container.setPointerCapture(event.pointerId);
        } catch (e) {}

        controls.isUserInteracting = true;
        controls.isDragging = false;
        controls.onPointerDownX = event.clientX;
        controls.onPointerDownY = event.clientY;
        controls.lastPointerX = event.clientX;
        controls.lastPointerY = event.clientY;
        controls.onPointerDownTime = performance.now();
        controls.onPointerDownLon = controls.lon;
        controls.onPointerDownLat = controls.lat;

        // Initialize targets to Avoid Jump
        controls.targetLon = controls.lon;
        controls.targetLat = controls.lat;
        controls.lonSpeed = 0;
        controls.latSpeed = 0;

        velocityHistoryRef.current = [{ x: event.clientX, y: event.clientY, time: performance.now() }];
        container.style.cursor = 'grabbing';
      } else if (activePointersRef.current.size === 2) {
        // Second pointer down: two-finger pinch zoom gesture started!
        const pointers = Array.from(activePointersRef.current.values());
        const dist = Math.hypot(pointers[0].x - pointers[1].x, pointers[0].y - pointers[1].y);
        pinchStateRef.current = {
          initialDistance: dist,
          initialFov: cameraRef.current ? cameraRef.current.fov : 60,
        };
        controls.isDragging = true;
        controls.lonSpeed = 0;
        controls.latSpeed = 0;
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (isTransitioningRef.current) return;

      const controls = controlsRef.current;

      if (activePointersRef.current.has(event.pointerId)) {
        activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      }

      // 1. Two-finger Pinch Zoom (mobile touch)
      if (activePointersRef.current.size >= 2 && pinchStateRef.current && cameraRef.current) {
        if (!isPlaybackModeRef.current) {
          const pointers = Array.from(activePointersRef.current.values());
          const currentDist = Math.hypot(pointers[0].x - pointers[1].x, pointers[0].y - pointers[1].y);
          if (pinchStateRef.current.initialDistance > 0 && currentDist > 0) {
            const scale = pinchStateRef.current.initialDistance / currentDist;
            const maxFov = currentLevel === 1 ? 120 : 100;
            const targetFov = Math.max(10, Math.min(maxFov, pinchStateRef.current.initialFov * scale));
            cameraRef.current.fov = targetFov;
            cameraRef.current.updateProjectionMatrix();
            requestDetailForFov(targetFov);
          }
        }
        return; // Skip rotation while pinching!
      }

      // 2. Mouse-only hover check (skipped during touch or while dragging to keep 60fps)
      if (event.pointerType === 'mouse' && !controls.isUserInteracting && !isEditMode && cameraRef.current) {
        const rect = container.getBoundingClientRect();
        mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);

        let foundHoverable = false;

        // Check overlay hover first
        if (overlaysRef.current) {
          const intersects = raycasterRef.current.intersectObjects(overlaysRef.current.children, true);
          if (intersects.length > 0) {
            container.style.cursor = 'pointer';
            foundHoverable = true;
          }
        }

        // Check hotspot hover if no overlay found
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
                const tileUrl = sceneTileUrl(hotspotData.target_scene_id, `${face}_l1_0_0`);
                const img = new Image();
                img.crossOrigin = 'anonymous'; // must match the viewer's CORS load or the cached copy is unusable
                img.src = tileUrl;
              });
            }
          }
        }

        if (!foundHoverable) {
          // Default arrow when not hovering, Grabbing when dragging/interacting
          container.style.cursor = isEditMode ? 'crosshair' : 'default';
        }
      }

      if (!controls.isUserInteracting) return;

      // 3. Movement threshold for drag detection
      const dragThreshold = event.pointerType === 'touch' ? 8 : 4;
      const totalDeltaX = Math.abs(event.clientX - controls.onPointerDownX);
      const totalDeltaY = Math.abs(event.clientY - controls.onPointerDownY);

      if (totalDeltaX > dragThreshold || totalDeltaY > dragThreshold) {
        controls.isDragging = true;
      }

      // Record velocity history for flick throw
      const now = performance.now();
      velocityHistoryRef.current.push({ x: event.clientX, y: event.clientY, time: now });
      velocityHistoryRef.current = velocityHistoryRef.current.filter(p => now - p.time < 120);

      // 4. Rotate camera directly with finger/mouse for responsive, natural feel
      if (!isPlaybackModeRef.current) {
        const deltaX = event.clientX - controls.lastPointerX;
        const deltaY = event.clientY - controls.lastPointerY;

        // Scale by FOV: zooming in makes rotation slower and more precise
        const fovScale = cameraRef.current ? (cameraRef.current.fov / 60) : 1;
        // On mobile touch: 0.32 deg/px gives responsive 1:1 feel with touch screen
        // On desktop mouse: 0.20 deg/px
        const sensitivity = (event.pointerType === 'touch' ? 0.32 : 0.20) * fovScale;

        controls.lon -= deltaX * sensitivity;
        controls.lat += deltaY * sensitivity;
        controls.lat = Math.max(-85, Math.min(85, controls.lat));

        controls.targetLon = controls.lon;
        controls.targetLat = controls.lat;
      }

      controls.lastPointerX = event.clientX;
      controls.lastPointerY = event.clientY;
    };

    const onPointerUp = (event: PointerEvent) => {
      // Release pointer capture
      try {
        if (container.hasPointerCapture(event.pointerId)) {
          container.releasePointerCapture(event.pointerId);
        }
      } catch (e) {}

      activePointersRef.current.delete(event.pointerId);

      const controls = controlsRef.current;

      // If one finger is still touching (e.g. released 1 finger of pinch), don't finish drag session
      if (activePointersRef.current.size > 0) {
        const remaining = Array.from(activePointersRef.current.values())[0];
        controls.lastPointerX = remaining.x;
        controls.lastPointerY = remaining.y;
        pinchStateRef.current = null;
        return;
      }

      pinchStateRef.current = null;

      const wasDragging = controls.isDragging;

      // Calculate flick momentum on release if dragging
      if (wasDragging && !isPlaybackModeRef.current) {
        const now = performance.now();
        const history = velocityHistoryRef.current;
        if (history.length >= 2) {
          const oldest = history[0];
          const latest = history[history.length - 1];
          const dt = latest.time - oldest.time;
          const timeSinceLast = now - latest.time;

          // If flick was executed just before lifting (within 80ms)
          if (dt > 10 && timeSinceLast < 80) {
            const vx = (latest.x - oldest.x) / dt; // px/ms
            const vy = (latest.y - oldest.y) / dt;

            const fovScale = cameraRef.current ? (cameraRef.current.fov / 60) : 1;
            const sensitivity = (event.pointerType === 'touch' ? 0.32 : 0.20) * fovScale;

            const maxFlickSpeed = 3.5; // max degrees per frame
            controls.lonSpeed = Math.max(-maxFlickSpeed, Math.min(maxFlickSpeed, -vx * sensitivity * 16));
            controls.latSpeed = Math.max(-maxFlickSpeed, Math.min(maxFlickSpeed, vy * sensitivity * 16));
          } else {
            controls.lonSpeed = 0;
            controls.latSpeed = 0;
          }
        }
      }

      controls.isUserInteracting = false;
      controls.isDragging = false;
      container.style.cursor = isEditMode ? 'crosshair' : 'default';

      // Placement mode: a click (no drag) places the hotspot / path point; a drag only turned the view
      if (pendingPlacementRef.current) {
        pendingPlacementRef.current = false;
        if (!wasDragging) placeAt(event.clientX, event.clientY);
        return;
      }

      // Handle interactions (clicks)
      if (!wasDragging) {
        // Initial pause logic removed - will be re-added after targetHotspot calculation

        // If we hit a hotspot, we handle it below and DON'T pause the overall tour immediately
        // (The individual hotspot action like navigation will handle its own state changes)

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
        if (!clickedOnTarget && !isPlaybackModeRef.current && !isAutoplayActive && hotspots.length > 0) {
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

        // 3. Handle pausing logic - ANY click on background during playback should pause it
        const isAnyPlaybackActive = isAutoRotatingRef.current || autoRotateRef.current || isPlaybackModeRef.current;
        if (isAnyPlaybackActive && onOverlayPause && !targetHotspot) {
          console.log('[CubeMapViewer] PAUSING - calling onOverlayPause because background was clicked');
          onOverlayPause();
        }

        // 4. Action Logic
        if (targetHotspot) {
          // Handle Navigation Hotspot (Matterport-style smooth walking transition)
          if (targetHotspot.kind === 'navigation') {
            const hotspot = targetHotspot;
            let targetSceneId = hotspot.target_scene_id;
            if (!targetSceneId && hotspot.payload) {
              try {
                const payload = typeof hotspot.payload === 'string'
                  ? JSON.parse(hotspot.payload)
                  : hotspot.payload;
                if (payload?.targetSceneId) targetSceneId = payload.targetSceneId;
              } catch (e) {}
            }

            if (targetSceneId) {
              // Store target orientation if defined in hotspot or payload
              let targetYaw = hotspot.target_yaw;
              let targetPitch = hotspot.target_pitch;
              if (targetYaw === undefined || targetPitch === undefined) {
                try {
                  const payload = typeof hotspot.payload === 'string'
                    ? JSON.parse(hotspot.payload)
                    : hotspot.payload;
                  if (payload) {
                    if (targetYaw === undefined && payload.targetYaw !== undefined) targetYaw = payload.targetYaw;
                    if (targetPitch === undefined && payload.targetPitch !== undefined) targetPitch = payload.targetPitch;
                  }
                } catch (e) {}
              }

              const hotspotYaw = hotspot.yaw || 0;
              const hotspotPitch = hotspot.pitch || 0;
              const startLon = controls.lon;
              const startLat = controls.lat;
              const startFov = cameraRef.current?.fov || (currentScene.fov || 60);

              // Final yaw: smoothly face targetYaw if defined, else forward walk direction (hotspotYaw)
              const finalYaw = (targetYaw !== undefined && targetYaw !== null) ? targetYaw : hotspotYaw;
              let deltaYaw = finalYaw - startLon;
              while (deltaYaw > 180) deltaYaw -= 360;
              while (deltaYaw < -180) deltaYaw += 360;

              // Natural eye-level pitch
              const finalPitch = (targetPitch !== undefined && targetPitch !== null)
                ? targetPitch
                : (Math.abs(startLat) > 20 ? 0 : Math.max(-8, Math.min(8, hotspotPitch * 0.2)));
              const deltaPitch = finalPitch - startLat;

              // Forward walk direction vector towards the hotspot
              const theta = THREE.MathUtils.degToRad(hotspotYaw + 180);
              const dirX = Math.cos(theta);
              const dirZ = Math.sin(theta);
              const stepDist = 5.0; // Realistic forward walk distance

              // Clear user momentum & lock navigation state
              controls.isUserInteracting = false;
              controls.lonSpeed = 0;
              controls.latSpeed = 0;
              controls.targetRotationX = 0;
              controls.targetRotationY = 0;
              isNavigatingRef.current = true;
              isTransitioningRef.current = true;
              setIsTransitioning(true);

              // Slower, cinematic pacing as requested: ~1400ms - 1800ms
              const angularDistance = Math.hypot(deltaYaw, deltaPitch);
              const duration = Math.round(Math.min(1800, Math.max(1400, 1300 + angularDistance * 2.5)));
              const startTime = Date.now();

              activeTransitionRef.current = {
                startTime,
                duration,
                startLon,
                startLat,
                deltaYaw,
                deltaPitch,
                startFov,
                targetFov: currentScene.fov || 60,
                dirX,
                dirZ,
                stepDist,
              };

              // Clean up any ongoing transition frame or ghost
              if (transitionAnimFrameRef.current) {
                cancelAnimationFrame(transitionAnimFrameRef.current);
                transitionAnimFrameRef.current = null;
              }
              if (ghostCubeRef.current) {
                const { mesh, materials, oldMaps } = ghostCubeRef.current;
                mesh.parent?.remove(mesh);
                materials.forEach(m => m.dispose());
                oldMaps.forEach(m => m.dispose());
                ghostCubeRef.current = null;
              }

              // Preload tiles and trigger scene change immediately for background loading
              preloadSceneTiles(targetSceneId);
              if (onHotspotClick) onHotspotClick(hotspot);

              const easeInOutCubic = (t: number) =>
                t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

              const tick = () => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const eased = easeInOutCubic(progress);

                // 1. Smooth rotation toward target orientation
                controls.lon = startLon + deltaYaw * eased;
                controls.lat = startLat + deltaPitch * eased;
                controls.targetLon = controls.lon;
                controls.targetLat = controls.lat;
                controls.lonSpeed = 0;
                controls.latSpeed = 0;

                // 2. Continuous forward step (bell curve displacement: 0 -> stepDist -> 0)
                const disp = stepDist * Math.sin(Math.PI * eased);
                if (cubeRef.current) {
                  cubeRef.current.position.set(-dirX * disp, 0, -dirZ * disp);
                  cubeRef.current.scale.set(1, 1, 1);
                }
                if (ghostCubeRef.current?.mesh) {
                  ghostCubeRef.current.mesh.position.set(-dirX * disp, 0, -dirZ * disp);
                  ghostCubeRef.current.mesh.scale.set(1, 1, 1);
                }

                // 3. Subtle FOV dolly sensation (-4 deg at midpoint)
                if (cameraRef.current) {
                  const targetFov = activeTransitionRef.current?.targetFov || (currentScene.fov || 60);
                  const fovDolly = 4 * Math.sin(Math.PI * eased);
                  const currentBaseFov = startFov + (targetFov - startFov) * eased;
                  cameraRef.current.fov = currentBaseFov - fovDolly;
                  cameraRef.current.updateProjectionMatrix();
                }

                // 4. Ghost cross-fade dissolve (soft transition from ~0.2 to ~0.8)
                if (ghostCubeRef.current) {
                  const fadeP = Math.max(0, Math.min(1, (progress - 0.2) / 0.65));
                  const ghostOpacity = 1 - (fadeP * fadeP * (3 - 2 * fadeP));
                  ghostCubeRef.current.materials.forEach(m => {
                    m.opacity = Math.max(0, Math.min(1, ghostOpacity));
                  });
                }

                if (progress < 1) {
                  transitionAnimFrameRef.current = requestAnimationFrame(tick);
                } else {
                  // Lock final orientation and center
                  controls.lon = startLon + deltaYaw;
                  controls.lat = startLat + deltaPitch;
                  controls.targetLon = controls.lon;
                  controls.targetLat = controls.lat;
                  controls.lonSpeed = 0;
                  controls.latSpeed = 0;

                  if (cubeRef.current) {
                    cubeRef.current.position.set(0, 0, 0);
                    cubeRef.current.scale.set(1, 1, 1);
                  }
                  if (cameraRef.current) {
                    const finalFov = activeTransitionRef.current?.targetFov || (currentScene.fov || 60);
                    cameraRef.current.fov = finalFov;
                    cameraRef.current.updateProjectionMatrix();
                  }

                  // Dispose ghost mesh
                  if (ghostCubeRef.current) {
                    const { mesh, materials, oldMaps } = ghostCubeRef.current;
                    mesh.parent?.remove(mesh);
                    materials.forEach(m => m.dispose());
                    oldMaps.forEach(m => m.dispose());
                    ghostCubeRef.current = null;
                  }

                  activeTransitionRef.current = null;
                  transitionAnimFrameRef.current = null;
                  isNavigatingRef.current = false;
                  isTransitioningRef.current = false;
                  setIsTransitioning(false);
                  setIsLoading(false);
                }
              };

              transitionAnimFrameRef.current = requestAnimationFrame(tick);
            } else {
              if (onHotspotClick) onHotspotClick(targetHotspot);
            }
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

    const onPointerCancel = (event: PointerEvent) => {
      try {
        if (container.hasPointerCapture(event.pointerId)) {
          container.releasePointerCapture(event.pointerId);
        }
      } catch (e) {}

      activePointersRef.current.delete(event.pointerId);
      pinchStateRef.current = null;

      const controls = controlsRef.current;
      controls.isUserInteracting = false;
      controls.isDragging = false;
      controls.lonSpeed = 0;
      controls.latSpeed = 0;
      container.style.cursor = isEditMode ? 'crosshair' : 'default';
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();

      // Disable zoom during playback
      if (isPlaybackModeRef.current) return;

      if (!cameraRef.current) return;

      const fov = cameraRef.current.fov + event.deltaY * 0.05;
      // Allow wider FOV at level 1 for better overview, min 10 for zoom in
      const maxFov = currentLevel === 1 ? 120 : 100;
      const targetFov = Math.max(10, Math.min(maxFov, fov));
      cameraRef.current.fov = targetFov;
      cameraRef.current.updateProjectionMatrix();

      requestDetailForFov(targetFov);
    };

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('pointercancel', onPointerCancel);
    container.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('pointercancel', onPointerCancel);
      container.removeEventListener('wheel', onWheel);
    };
  }, [manifest, currentLevel, loadCubeMapLevel, isEditMode, hotspots, overlays, onHotspotClick, onHotspotCreate, preloadSceneTiles]);

  return (
    <div className="relative w-full h-full overflow-hidden touch-none select-none">
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
        className={`w-full h-full touch-none select-none transition-opacity duration-300 opacity-100 ${isEditMode ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
        style={{
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          ...(isEditMode ? { border: '2px dashed rgba(76, 175, 80, 0.5)' } : {})
        }}
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
          isTransitioning={isTransitioning}
        />
      )}
    </div>
  );
}