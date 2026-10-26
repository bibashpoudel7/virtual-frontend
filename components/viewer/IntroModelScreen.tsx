'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Eye, EyeOff, Layers, ListOrdered, X, ArrowRight, Home, Sparkles } from 'lucide-react';
import { loadGlb, disposeObject3D } from '@/lib/glb-model';
import { IntroModelRoom } from '@/types/tour';

// Every model is normalized to this size so camera, controls and saved label positions behave the
// same for any file (label positions are stored in this normalized space)
const MODEL_SIZE = 10;

// Soft round shadow under the model (cheap, no shadow maps)
function createGroundShadow(radius: number) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.45)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);
  }
  const texture = new THREE.CanvasTexture(canvas);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })
  );
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

export interface IntroRoomLabel extends IntroModelRoom {
  label: string;
  description?: string;
  number?: number;
}

interface IntroModelViewerProps {
  modelUrl: string;
  autoRotate?: boolean;
  className?: string;
  onStatusChange?: (status: { progress: number; loaded: boolean; error: string | null }) => void;
  /** Room labels drawn on the model */
  rooms?: IntroRoomLabel[];
  /** Clicking a label (visitors: open that room) */
  onRoomClick?: (sceneId: string) => void;
  /** Clicking the model surface (editor: place a label there) */
  onModelClick?: (position: [number, number, number]) => void;
  /** Label to emphasise (editor: the one being placed) */
  activeSceneId?: string | null;
  /** Hide exterior shell / outer walls to reveal inner layer */
  hideOuterLayer?: boolean;
}

/** Toggles visibility of outside walls, roof, and ceiling meshes to expose inner layout */
function applyOuterLayerVisibility(model: THREE.Object3D | null, hideOuter: boolean, renderer?: THREE.WebGLRenderer | null, cutHeight?: number) {
  if (!model) return;
  model.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const name = (child.name || '').toLowerCase();
      const isOuter =
        name.includes('outside') ||
        name.includes('outer') ||
        name.includes('roof') ||
        name.includes('shell') ||
        name.includes('wall top') ||
        name.includes('exterior') ||
        name.includes('ceiling');
      if (isOuter) {
        child.visible = !hideOuter;
      }
    }
  });

  if (renderer && cutHeight !== undefined) {
    if (hideOuter) {
      // Horizontal clipping plane slicing at ceiling level so interior rooms are open to view
      const cutPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), cutHeight);
      renderer.clippingPlanes = [cutPlane];
    } else {
      renderer.clippingPlanes = [];
    }
  }
}

/** Interactive 3D model: drag to orbit, scroll to zoom, gentle turntable spin until touched. */
export function IntroModelViewer({
  modelUrl,
  autoRotate = true,
  className = '',
  onStatusChange,
  rooms = [],
  onRoomClick,
  onModelClick,
  activeSceneId = null,
  hideOuterLayer = false,
}: IntroModelViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // The WebGL canvas lives in its own element, separate from the React-managed labels
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef(onStatusChange);
  statusRef.current = onStatusChange;
  const roomsRef = useRef(rooms);
  roomsRef.current = rooms;
  const modelClickRef = useRef(onModelClick);
  modelClickRef.current = onModelClick;
  const modelRef = useRef<THREE.Object3D | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const ceilingCutHeightRef = useRef<number>(MODEL_SIZE * 0.9);
  // Label elements, positioned every frame from their 3D points
  const labelElementsRef = useRef(new Map<string, HTMLElement>());

  // React to hideOuterLayer changes smoothly without re-downloading model
  useEffect(() => {
    applyOuterLayerVisibility(modelRef.current, hideOuterLayer, rendererRef.current, ceilingCutHeightRef.current);
  }, [hideOuterLayer]);

  useEffect(() => {
    const container = containerRef.current;
    const canvasHost = canvasHostRef.current;
    if (!container || !canvasHost) return;
    let disposed = false;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.localClippingEnabled = true;
    renderer.setSize(container.clientWidth, container.clientHeight);
    canvasHost.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(6, 12, 8);
    scene.add(sun);

    const camera = new THREE.PerspectiveCamera(40, container.clientWidth / Math.max(container.clientHeight, 1), 0.01, 1000);
    camera.position.set(12, 8, 14);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 1.2;
    // Stop the turntable once the viewer takes over
    const stopAutoRotate = () => { controls.autoRotate = false; };
    controls.addEventListener('start', stopAutoRotate);

    let model: THREE.Object3D | null = null;
    let shadow: THREE.Mesh | null = null;
    let mixer: THREE.AnimationMixer | null = null;
    const raycaster = new THREE.Raycaster();

    statusRef.current?.({ progress: 0, loaded: false, error: null });
    loadGlb(modelUrl, (progress) => statusRef.current?.({ progress, loaded: false, error: null }))
      .then((gltf) => {
        if (disposed) {
          disposeObject3D(gltf.scene);
          return;
        }
        model = gltf.scene;
        modelRef.current = model;

        // Center the model on the ground at the origin and scale it to a known size
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const scale = MODEL_SIZE / Math.max(size.x, size.y, size.z, 1e-6);
        model.scale.setScalar(scale);
        box.setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(new THREE.Vector3(center.x, box.min.y, center.z));
        scene.add(model);
        model.updateMatrixWorld(true);

        // Ceiling cut height for clipping plane
        const height = size.y * scale;
        ceilingCutHeightRef.current = height * 0.95;

        // Apply initial outer layer mode
        applyOuterLayerVisibility(model, hideOuterLayer, renderer, ceilingCutHeightRef.current);

        const footprint = Math.max(size.x, size.z) * scale;
        shadow = createGroundShadow(footprint * 0.75);
        shadow.position.y = 0.01;
        scene.add(shadow);

        // Frame the whole model from a three-quarter view
        const radius = new THREE.Box3().setFromObject(model).getBoundingSphere(new THREE.Sphere()).radius;
        controls.target.set(0, height * 0.4, 0);
        const distance = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.05;
        camera.position.set(distance * 0.62, height * 0.4 + distance * 0.45, distance * 0.65);
        camera.near = distance / 100;
        camera.far = distance * 20;
        camera.updateProjectionMatrix();
        controls.update();

        if (gltf.animations.length) {
          mixer = new THREE.AnimationMixer(model);
          gltf.animations.forEach(clip => mixer!.clipAction(clip).play());
        }
        statusRef.current?.({ progress: 1, loaded: true, error: null });
      })
      .catch((error) => {
        console.error('[IntroModel] Failed to load model:', error);
        if (!disposed) statusRef.current?.({ progress: 0, loaded: false, error: 'The 3D model could not be loaded.' });
      });

    // A click (not a drag) on the model surface reports that point, for placing labels
    let pressX = 0;
    let pressY = 0;
    const onPointerDown = (event: PointerEvent) => {
      pressX = event.clientX;
      pressY = event.clientY;
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!modelClickRef.current || !model) return;
      if (Math.hypot(event.clientX - pressX, event.clientY - pressY) > 5) return;
      const rect = renderer.domElement.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      ), camera);
      const hit = raycaster.intersectObject(model, true)[0];
      if (hit) {
        const p = hit.point;
        modelClickRef.current([+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)]);
      }
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    // Keep each label over its 3D point; dim it while the model hides that point
    const projected = new THREE.Vector3();
    const toPoint = new THREE.Vector3();
    const occluded = new Map<string, boolean>();
    let frameCount = 0;
    const updateLabels = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      const checkOcclusion = model && frameCount % 6 === 0;
      for (const room of roomsRef.current) {
        const element = labelElementsRef.current.get(room.sceneId);
        if (!element) continue;
        projected.set(room.position[0], room.position[1], room.position[2]).project(camera);
        if (projected.z > 1) {
          element.style.visibility = 'hidden';
          continue;
        }
        element.style.visibility = 'visible';
        element.style.transform = `translate(-50%, -100%) translate(${(projected.x + 1) / 2 * width}px, ${(1 - projected.y) / 2 * height}px)`;
        if (checkOcclusion) {
          toPoint.set(room.position[0], room.position[1], room.position[2]).sub(camera.position);
          const pointDistance = toPoint.length();
          raycaster.set(camera.position, toPoint.normalize());
          const hit = raycaster.intersectObject(model!, true)[0];
          occluded.set(room.sceneId, !!hit && hit.distance < pointDistance - MODEL_SIZE * 0.02);
        }
        element.style.opacity = occluded.get(room.sceneId) ? '0.45' : '1';
      }
    };

    const clock = new THREE.Clock();
    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      frameCount++;
      mixer?.update(clock.getDelta());
      controls.update();
      renderer.render(scene, camera);
      updateLabels();
    };
    animate();

    const resizeObserver = new ResizeObserver(() => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    });
    resizeObserver.observe(container);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      controls.removeEventListener('start', stopAutoRotate);
      controls.dispose();
      mixer?.stopAllAction();
      if (model) disposeObject3D(model);
      modelRef.current = null;
      rendererRef.current = null;
      if (shadow) {
        shadow.geometry.dispose();
        const material = shadow.material as THREE.MeshBasicMaterial;
        material.map?.dispose();
        material.dispose();
      }
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [modelUrl, autoRotate]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden touch-none ${onModelClick ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'} ${className}`}
    >
      <div ref={canvasHostRef} className="absolute inset-0" />
      {/* Number mapped room badges (positioned every frame) */}
      <div className="absolute inset-0 pointer-events-none">
        {rooms.map((room, idx) => {
          const roomNumber = room.number ?? (idx + 1);
          const isSelected = room.sceneId === activeSceneId;
          return (
            <div
              key={room.sceneId}
              ref={(element) => {
                if (element) labelElementsRef.current.set(room.sceneId, element);
                else labelElementsRef.current.delete(room.sceneId);
              }}
              className="absolute left-0 top-0 flex flex-col items-center transition-opacity duration-200"
              style={{ visibility: 'hidden' }}
            >
              <button
                type="button"
                onClick={onRoomClick ? () => onRoomClick(room.sceneId) : undefined}
                className={`whitespace-nowrap rounded-full pl-1.5 pr-3 py-1 text-xs font-semibold shadow-xl border flex items-center gap-1.5 transition-all ${
                  onRoomClick ? 'pointer-events-auto cursor-pointer hover:scale-105 active:scale-95' : ''
                } ${
                  isSelected
                    ? 'bg-blue-600 text-white border-blue-400 ring-4 ring-blue-500/30'
                    : 'bg-white/95 text-gray-900 border-white hover:bg-white'
                }`}
              >
                <span
                  className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                    isSelected ? 'bg-white text-blue-600' : 'bg-blue-600 text-white'
                  }`}
                >
                  {roomNumber}
                </span>
                <span className="max-w-[120px] truncate">{room.label}</span>
              </button>
              <span className={`w-0.5 h-3 ${isSelected ? 'bg-blue-400' : 'bg-white/90'}`} />
              <span className={`w-2 h-2 -mt-0.5 rounded-full border-2 border-white ${isSelected ? 'bg-blue-600' : 'bg-gray-900'}`} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface IntroModelScreenProps {
  modelUrl: string;
  title?: string;
  rooms?: IntroRoomLabel[];
  onEnter: () => void;
  /** A room label was clicked: open the tour at that scene */
  onEnterRoom?: (sceneId: string) => void;
  /** Modal close callback when re-opened during an active tour */
  onClose?: () => void;
}

/** Full-screen 3D intro shown before the 360° tour, with an "Enter tour" button, cutaway toggle, and number mapping directory. */
export default function IntroModelScreen({ modelUrl, title, rooms = [], onEnter, onEnterRoom, onClose }: IntroModelScreenProps) {
  const [status, setStatus] = useState<{ progress: number; loaded: boolean; error: string | null }>({ progress: 0, loaded: false, error: null });
  const [leaving, setLeaving] = useState(false);
  const [hideOuterLayer, setHideOuterLayer] = useState(false);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [showDirectory, setShowDirectory] = useState(false);

  const selectedRoom = useMemo(() => {
    return rooms.find(r => r.sceneId === selectedSceneId) || null;
  }, [rooms, selectedSceneId]);

  const leaveThen = (callback: () => void) => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(callback, 450);
  };

  const handleRoomPinClick = (sceneId: string) => {
    setSelectedSceneId(sceneId);
  };

  return (
    <div
      className={`absolute inset-0 z-[60] bg-[radial-gradient(ellipse_at_center,_#334155_0%,_#0f172a_70%)] transition-opacity duration-500 ${leaving ? 'opacity-0' : 'opacity-100'}`}
    >
      <IntroModelViewer
        modelUrl={modelUrl}
        onStatusChange={setStatus}
        rooms={status.loaded ? rooms : []}
        activeSceneId={selectedSceneId}
        hideOuterLayer={hideOuterLayer}
        onRoomClick={handleRoomPinClick}
      />

      {/* Top Header: Title & View Controls */}
      <div className="absolute top-5 left-5 right-5 flex items-start justify-between gap-4 pointer-events-none">
        <div>
          {title && <h1 className="text-white text-2xl sm:text-3xl font-bold drop-shadow">{title}</h1>}
          <p className="text-white/70 text-sm mt-1 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-blue-400" />
            3D Interactive Overview
          </p>
        </div>

        {/* View Controls: Remove outer layer + Number map directory */}
        {status.loaded && (
          <div className="flex items-center gap-2 pointer-events-auto">
            {/* Cutaway: Remove outer layer toggle */}
            <button
              type="button"
              onClick={() => setHideOuterLayer(v => !v)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold shadow-lg backdrop-blur transition-all cursor-pointer ${
                hideOuterLayer
                  ? 'bg-blue-600 text-white ring-2 ring-blue-400/50'
                  : 'bg-black/40 text-white/90 hover:bg-black/60 border border-white/10'
              }`}
              title="Remove outer walls & roof to display interior rooms"
            >
              {hideOuterLayer ? <EyeOff className="w-3.5 h-3.5 text-blue-200" /> : <Layers className="w-3.5 h-3.5 text-blue-400" />}
              <span>{hideOuterLayer ? 'Inner Layer (Cutaway)' : 'Remove Outer Layer'}</span>
            </button>

            {/* Room Directory / Number Mapping */}
            {rooms.length > 0 && (
              <button
                type="button"
                onClick={() => setShowDirectory(v => !v)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold shadow-lg backdrop-blur transition-all cursor-pointer ${
                  showDirectory
                    ? 'bg-white text-gray-900 ring-2 ring-white/50'
                    : 'bg-black/40 text-white/90 hover:bg-black/60 border border-white/10'
                }`}
              >
                <ListOrdered className="w-3.5 h-3.5 text-blue-400" />
                <span>Rooms ({rooms.length})</span>
              </button>
            )}

            {/* Close Button when opened during tour */}
            {onClose && (
              <button
                type="button"
                onClick={() => leaveThen(onClose)}
                className="p-2 rounded-full bg-black/40 text-white/90 hover:bg-black/70 hover:text-white border border-white/10 transition-colors cursor-pointer"
                title="Back to 360° Tour"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Selected Room Description Card */}
      {selectedRoom && (
        <div className="absolute top-20 right-5 z-20 w-80 max-w-[calc(100vw-40px)] rounded-2xl bg-white/95 p-4 shadow-2xl backdrop-blur border border-white/40 text-gray-900 pointer-events-auto animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold shadow-sm">
                {selectedRoom.number ?? (rooms.indexOf(selectedRoom) + 1)}
              </span>
              <h3 className="font-bold text-base text-gray-900 leading-tight">{selectedRoom.label}</h3>
            </div>
            <button
              type="button"
              onClick={() => setSelectedSceneId(null)}
              className="p-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="mt-2 text-xs text-gray-600 leading-relaxed">
            {selectedRoom.description?.trim() || 'High-definition 360° virtual view available for this space.'}
          </p>

          {onEnterRoom && (
            <button
              type="button"
              onClick={() => leaveThen(() => onEnterRoom(selectedRoom.sceneId))}
              className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 px-3 text-xs font-semibold text-white shadow-md hover:bg-blue-700 active:scale-[0.98] transition-all cursor-pointer"
            >
              <span>Enter 360° Room</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Room Directory Drawer (Number Mapping) */}
      {showDirectory && (
        <div className="absolute top-20 left-5 bottom-24 z-20 w-72 max-w-[calc(100vw-40px)] flex flex-col rounded-2xl bg-black/70 p-3 shadow-2xl backdrop-blur-md border border-white/10 text-white pointer-events-auto">
          <div className="flex items-center justify-between px-2 py-1 border-b border-white/10">
            <span className="text-xs font-semibold tracking-wide uppercase text-white/70">Number Mapping</span>
            <button
              type="button"
              onClick={() => setShowDirectory(false)}
              className="p-1 rounded-full text-white/50 hover:text-white hover:bg-white/10 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-2 flex-1 overflow-y-auto space-y-1.5 pr-1">
            {rooms.map((room, idx) => {
              const num = room.number ?? (idx + 1);
              const isSelected = room.sceneId === selectedSceneId;
              return (
                <div
                  key={room.sceneId}
                  onClick={() => setSelectedSceneId(room.sceneId)}
                  className={`p-2.5 rounded-xl transition-all cursor-pointer border ${
                    isSelected
                      ? 'bg-blue-600/30 border-blue-400 text-white'
                      : 'bg-white/5 border-white/5 hover:bg-white/10 text-white/90'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full flex items-center justify-center bg-blue-500 text-white text-[11px] font-bold shrink-0">
                      {num}
                    </span>
                    <span className="text-xs font-semibold flex-1 truncate">{room.label}</span>
                  </div>
                  {room.description && (
                    <p className="mt-1 text-[11px] text-white/60 line-clamp-2 pl-7">{room.description}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Loading / error */}
      {!status.loaded && !status.error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="w-48 h-1.5 rounded-full bg-white/20 overflow-hidden">
            <div className="h-full bg-white transition-all duration-200" style={{ width: `${Math.max(5, status.progress * 100)}%` }} />
          </div>
          <p className="text-white/80 text-sm mt-3">Loading 3D model…</p>
        </div>
      )}
      {status.error && (
        <div className="absolute inset-0 items-center justify-center pointer-events-none flex">
          <p className="text-white/80 text-sm bg-black/40 rounded-lg px-4 py-2">{status.error} You can still enter the tour.</p>
        </div>
      )}

      {/* Bottom Enter Tour bar */}
      <div className="absolute bottom-8 left-0 right-0 flex flex-col items-center gap-3 px-4 pointer-events-none">
        {status.loaded && (
          <p className="text-white/70 text-xs">
            Drag to rotate · Scroll to zoom{rooms.length > 0 ? ' · Click any numbered badge to view room details' : ''}
          </p>
        )}
        <button
          onClick={() => leaveThen(onClose || onEnter)}
          className="pointer-events-auto px-8 py-3 rounded-full bg-white text-gray-900 font-semibold shadow-2xl hover:scale-105 active:scale-95 transition-transform cursor-pointer flex items-center gap-2"
        >
          <Home className="w-4 h-4 text-blue-600" />
          <span>{onClose ? 'Back to 360° Tour' : 'Enter Virtual Tour'}</span>
          <ArrowRight className="w-4 h-4 text-gray-500" />
        </button>
      </div>
    </div>
  );
}
