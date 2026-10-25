'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Scene } from '@/types/tour';
import {
  PlanPoint,
  ceilingHeightFromRay,
  disposeSceneCube,
  floorPointFromRay,
  loadSceneCube,
} from '@/lib/dollhouse';

interface RoomTracerProps {
  scene: Scene;
  corners: PlanPoint[];
  ceilingHeight: number;
  cameraHeight: number;
  /** Next click sets the ceiling height instead of adding a corner */
  pickingCeiling: boolean;
  /** Clicking adds a corner (off for floor plan rooms, whose shape comes from the plan) */
  allowAddCorners?: boolean;
  onCornersChange: (corners: PlanPoint[]) => void;
  onCeilingPicked: (height: number | null) => void;
}

const CORNER_HIT_RADIUS = 14; // px

/** The traced edge (corner index → next corner) closest to `point`, on the floor plan. */
function nearestEdge(corners: PlanPoint[], [px, pz]: PlanPoint) {
  if (corners.length < 2) return null;
  let best: { index: number; distance: number } | null = null;
  const edges = corners.length >= 3 ? corners.length : 1;
  for (let i = 0; i < edges; i++) {
    const [ax, az] = corners[i];
    const [bx, bz] = corners[(i + 1) % corners.length];
    const ex = bx - ax;
    const ez = bz - az;
    const lengthSq = ex * ex + ez * ez;
    if (lengthSq < 1e-6) continue;
    const s = ((px - ax) * ex + (pz - az) * ez) / lengthSq;
    if (s <= 0.02 || s >= 0.98) continue; // near an end: that's a corner, not the middle of a wall
    const distance = Math.hypot(ax + ex * s - px, az + ez * s - pz);
    if (!best || distance < best.distance) best = { index: i, distance };
  }
  return best;
}

/**
 * 360° view of one room for tracing it: click where the walls meet the floor to add
 * corners, drag a corner to move it. The traced room is drawn over the photo, so
 * a correct trace lines up with the real walls, floor and ceiling.
 */
export default function RoomTracer({
  scene,
  corners,
  ceilingHeight,
  cameraHeight,
  pickingCeiling,
  allowAddCorners = true,
  onCornersChange,
  onCeilingPicked,
}: RoomTracerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  // Latest props for the long-lived three.js handlers
  const propsRef = useRef({ corners, ceilingHeight, cameraHeight, pickingCeiling, allowAddCorners, onCornersChange, onCeilingPicked });
  propsRef.current = { corners, ceilingHeight, cameraHeight, pickingCeiling, allowAddCorners, onCornersChange, onCeilingPicked };
  const redrawRef = useRef<() => void>(() => {});
  const markerElementsRef = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.domElement.style.display = 'block';
    container.prepend(renderer.domElement);

    const threeScene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(80, container.clientWidth / Math.max(container.clientHeight, 1), 0.05, 500);

    // Look toward the scene's starting view, tilted down so the floor is in sight
    let lon = (scene.yaw || 0) + 180;
    let lat = -25;
    const applyLook = () => {
      lat = THREE.MathUtils.clamp(lat, -89, 89);
      const phi = THREE.MathUtils.degToRad(lat);
      const theta = THREE.MathUtils.degToRad(lon);
      camera.lookAt(Math.cos(phi) * Math.cos(theta), Math.sin(phi), Math.cos(phi) * Math.sin(theta));
    };
    applyLook();

    let cube: THREE.Mesh | null = null;
    loadSceneCube(scene, 2048)
      .then((mesh) => {
        if (disposed) {
          disposeSceneCube(mesh);
          return;
        }
        cube = mesh;
        threeScene.add(mesh);
        setStatus('ready');
      })
      .catch((err) => {
        console.error('[Dollhouse] Failed to load room photo:', err);
        if (!disposed) {
          setError(err instanceof Error ? err.message : 'Could not load this photo.');
          setStatus('error');
        }
      });

    // Traced room drawn on top of the photo: floor outline, ceiling outline, wall edges
    const overlayMaterial = new THREE.LineBasicMaterial({ color: 0x22d3ee, depthTest: false, transparent: true });
    const ceilingMaterial = new THREE.LineBasicMaterial({ color: 0xfacc15, depthTest: false, transparent: true });
    const overlay = new THREE.Group();
    overlay.renderOrder = 10;
    threeScene.add(overlay);

    const redraw = () => {
      overlay.children.forEach((child) => (child as THREE.Line).geometry.dispose());
      overlay.clear();
      const { corners: points, ceilingHeight: ceiling, cameraHeight: eyeHeight } = propsRef.current;
      if (points.length < 2) return;
      const floorY = -eyeHeight;
      const ceilingY = ceiling - eyeHeight;
      const ring = (y: number) => {
        const vertices = points.map(([x, z]) => new THREE.Vector3(x, y, z));
        if (points.length >= 3) vertices.push(vertices[0].clone());
        return new THREE.BufferGeometry().setFromPoints(vertices);
      };
      const floorLine = new THREE.Line(ring(floorY), overlayMaterial);
      floorLine.renderOrder = 10;
      overlay.add(floorLine);
      if (points.length >= 3) {
        const ceilingLine = new THREE.Line(ring(ceilingY), ceilingMaterial);
        ceilingLine.renderOrder = 10;
        const edges = new THREE.LineSegments(
          new THREE.BufferGeometry().setFromPoints(points.flatMap(([x, z]) => [new THREE.Vector3(x, floorY, z), new THREE.Vector3(x, ceilingY, z)])),
          overlayMaterial
        );
        edges.renderOrder = 10;
        overlay.add(ceilingLine, edges);
      }
    };
    redrawRef.current = redraw;
    redraw();

    // Corner markers are HTML elements kept over their floor points
    const projected = new THREE.Vector3();
    const cornerScreen = (index: number) => {
      const [x, z] = propsRef.current.corners[index];
      projected.set(x, -propsRef.current.cameraHeight, z).project(camera);
      if (projected.z > 1) return null;
      return {
        x: (projected.x + 1) / 2 * container.clientWidth,
        y: (1 - projected.y) / 2 * container.clientHeight,
      };
    };
    const updateMarkers = () => {
      markerElementsRef.current.forEach((element, index) => {
        if (!element || index >= propsRef.current.corners.length) return;
        const screen = cornerScreen(index);
        if (!screen) {
          element.style.visibility = 'hidden';
          return;
        }
        element.style.visibility = 'visible';
        element.style.transform = `translate(-50%, -50%) translate(${screen.x}px, ${screen.y}px)`;
      });
    };

    const raycaster = new THREE.Raycaster();
    const rayDirection = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      ), camera);
      return raycaster.ray.direction.clone();
    };

    // Pointer: drag empty space to look around, drag a corner to move it, click to add a corner
    let drag: { mode: 'look' | 'corner'; index: number; startX: number; startY: number; lastX: number; lastY: number; moved: boolean } | null = null;
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      let hitIndex = -1;
      if (!propsRef.current.pickingCeiling) {
        propsRef.current.corners.forEach((_, index) => {
          const screen = cornerScreen(index);
          if (screen && Math.hypot(screen.x - px, screen.y - py) <= CORNER_HIT_RADIUS) hitIndex = index;
        });
      }
      drag = { mode: hitIndex >= 0 ? 'corner' : 'look', index: hitIndex, startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY, moved: false };
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!drag) return;
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4) drag.moved = true;
      if (drag.mode === 'look') {
        const degreesPerPixel = camera.fov / Math.max(container.clientHeight, 1);
        lon -= (event.clientX - drag.lastX) * degreesPerPixel;
        lat += (event.clientY - drag.lastY) * degreesPerPixel;
        applyLook();
      } else if (drag.moved) {
        const point = floorPointFromRay(rayDirection(event), propsRef.current.cameraHeight);
        if (point) {
          const next = [...propsRef.current.corners];
          next[drag.index] = point;
          propsRef.current.onCornersChange(next);
        }
      }
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
    };
    const onPointerUp = (event: PointerEvent) => {
      const finished = drag;
      drag = null;
      if (!finished || finished.moved || finished.mode === 'corner') return;
      const direction = rayDirection(event);
      const { corners: points, cameraHeight: eyeHeight } = propsRef.current;
      if (propsRef.current.pickingCeiling) {
        propsRef.current.onCeilingPicked(ceilingHeightFromRay(direction, points, eyeHeight));
        return;
      }
      if (!propsRef.current.allowAddCorners) return;
      const point = floorPointFromRay(direction, eyeHeight);
      if (!point) return;
      // Near-miss on corner 1 once the room is closed: don't add a duplicate corner
      const tolerance = Math.max(0.15, 0.04 * Math.hypot(point[0], point[1]));
      if (points.length >= 3 && Math.hypot(point[0] - points[0][0], point[1] - points[0][1]) < tolerance) return;
      // Click on an existing wall line: insert a corner there instead of adding one at the end
      const edge = nearestEdge(points, point);
      if (edge && edge.distance < tolerance) {
        propsRef.current.onCornersChange([...points.slice(0, edge.index + 1), point, ...points.slice(edge.index + 1)]);
        return;
      }
      propsRef.current.onCornersChange([...points, point]);
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      camera.fov = THREE.MathUtils.clamp(camera.fov + event.deltaY * 0.05, 30, 100);
      camera.updateProjectionMatrix();
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      renderer.render(threeScene, camera);
      updateMarkers();
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
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      if (cube) disposeSceneCube(cube);
      overlay.children.forEach((child) => (child as THREE.Line).geometry.dispose());
      overlayMaterial.dispose();
      ceilingMaterial.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      redrawRef.current = () => {};
    };
  }, [scene]);

  useEffect(() => {
    redrawRef.current();
  }, [corners, ceilingHeight, cameraHeight]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden bg-gray-900 touch-none select-none ${pickingCeiling ? 'cursor-crosshair' : 'cursor-pointer'}`}
    >
      {corners.map((_, index) => (
        <div
          key={index}
          ref={(element) => { markerElementsRef.current[index] = element; }}
          className="absolute left-0 top-0 pointer-events-none flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-cyan-500 text-[10px] font-bold text-white shadow"
          style={{ visibility: 'hidden' }}
        >
          {index + 1}
        </div>
      ))}
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">Loading photo…</div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-red-300">{error}</div>
      )}
    </div>
  );
}
