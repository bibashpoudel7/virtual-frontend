'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
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
  // Label elements, positioned every frame from their 3D points
  const labelElementsRef = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    const container = containerRef.current;
    const canvasHost = canvasHostRef.current;
    if (!container || !canvasHost) return;
    let disposed = false;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.setSize(container.clientWidth, container.clientHeight);
    canvasHost.appendChild(renderer.domElement);

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

        const footprint = Math.max(size.x, size.z) * scale;
        shadow = createGroundShadow(footprint * 0.75);
        shadow.position.y = 0.01;
        scene.add(shadow);

        // Frame the whole model from a three-quarter view
        const height = size.y * scale;
        const radius = new THREE.Box3().setFromObject(model).getBoundingSphere(new THREE.Sphere()).radius;
        controls.target.set(0, height * 0.4, 0);
        const distance = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.05;
        camera.position.set(distance * 0.62, height * 0.4 + distance * 0.45, distance * 0.65);
        camera.near = distance / 100;
        camera.far = distance * 20;
        camera.updateProjectionMatrix();
        controls.minDistance = radius * 0.6;
        controls.maxDistance = distance * 2.5;
        controls.maxPolarAngle = Math.PI * 0.495; // don't go under the ground
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
        element.style.opacity = occluded.get(room.sceneId) ? '0.35' : '1';
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
      {/* Room labels (positioned every frame) */}
      <div className="absolute inset-0 pointer-events-none">
        {rooms.map(room => (
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
              className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold shadow-lg border ${onRoomClick ? 'pointer-events-auto cursor-pointer hover:scale-105 transition-transform' : ''} ${room.sceneId === activeSceneId
                ? 'bg-blue-600 text-white border-blue-300'
                : 'bg-white/95 text-gray-900 border-white'
                }`}
            >
              {room.label}
            </button>
            <span className={`w-0.5 h-3 ${room.sceneId === activeSceneId ? 'bg-blue-300' : 'bg-white/90'}`} />
            <span className={`w-2 h-2 -mt-0.5 rounded-full border-2 border-white ${room.sceneId === activeSceneId ? 'bg-blue-600' : 'bg-gray-900'}`} />
          </div>
        ))}
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
}

/** Full-screen 3D intro shown before the 360° tour, with an "Enter tour" button. */
export default function IntroModelScreen({ modelUrl, title, rooms = [], onEnter, onEnterRoom }: IntroModelScreenProps) {
  const [status, setStatus] = useState<{ progress: number; loaded: boolean; error: string | null }>({ progress: 0, loaded: false, error: null });
  const [leaving, setLeaving] = useState(false);

  const leaveThen = (callback: () => void) => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(callback, 450);
  };

  return (
    <div
      className={`absolute inset-0 z-[60] bg-[radial-gradient(ellipse_at_center,_#334155_0%,_#0f172a_70%)] transition-opacity duration-500 ${leaving ? 'opacity-0' : 'opacity-100'}`}
    >
      <IntroModelViewer
        modelUrl={modelUrl}
        onStatusChange={setStatus}
        rooms={status.loaded ? rooms : []}
        onRoomClick={onEnterRoom ? (sceneId) => leaveThen(() => onEnterRoom(sceneId)) : undefined}
      />

      {/* Title */}
      <div className="absolute top-5 left-5 right-5 pointer-events-none">
        {title && <h1 className="text-white text-2xl sm:text-3xl font-bold drop-shadow">{title}</h1>}
        <p className="text-white/70 text-sm mt-1">3D overview</p>
      </div>

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
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-white/80 text-sm bg-black/40 rounded-lg px-4 py-2">{status.error} You can still enter the tour.</p>
        </div>
      )}

      {/* Enter */}
      <div className="absolute bottom-8 left-0 right-0 flex flex-col items-center gap-3 px-4 pointer-events-none">
        {status.loaded && (
          <p className="text-white/70 text-xs">
            Drag to rotate · Scroll or pinch to zoom{rooms.length > 0 && onEnterRoom ? ' · Click a room to go there' : ''}
          </p>
        )}
        <button
          onClick={() => leaveThen(onEnter)}
          className="pointer-events-auto px-8 py-3 rounded-full bg-white text-gray-900 font-semibold shadow-2xl hover:scale-105 transition-transform cursor-pointer"
        >
          Enter tour →
        </button>
      </div>
    </div>
  );
}
