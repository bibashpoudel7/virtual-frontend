/**
 * GLB / glTF model overlays for the 360° viewer.
 *
 * A "model" overlay is placed inside the cube map (camera at origin, cube faces at ±50),
 * so models must sit closer than the cube walls to stay visible.
 */

import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { Overlay } from '@/types/tour';

export const MODEL_DEFAULTS = {
  distance: 20,
  size: 6,
  rotationX: 0,
  rotationY: 0,
  rotationZ: 0,
  autoRotate: false,
  autoRotateSpeed: 20, // degrees per second
  playAnimation: true,
};

// Cube map half-size is 50; keep models inside it with some margin
export const MAX_MODEL_DISTANCE = 45;
export const MIN_MODEL_DISTANCE = 3;

export const MAX_MODEL_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export interface ModelOverlayPayload {
  modelUrl?: string;
  title?: string;
  description?: string;
  distance?: number;
  size?: number;
  rotationX?: number;
  rotationY?: number;
  rotationZ?: number;
  autoRotate?: boolean;
  autoRotateSpeed?: number;
  playAnimation?: boolean;
}

const LIGHTS_NAME = '__glb_model_lights__';

let gltfLoader: GLTFLoader | null = null;

/** Load a .glb / .gltf with the shared loader (Draco + Meshopt support). */
export function loadGlb(url: string, onProgress?: (fraction: number) => void): Promise<GLTF> {
  return new Promise((resolve, reject) => {
    getLoader().load(
      url,
      resolve,
      (event) => {
        if (onProgress && event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
      },
      reject
    );
  });
}

function getLoader(): GLTFLoader {
  if (!gltfLoader) {
    const dracoLoader = new DRACOLoader();
    // Decoder files are copied to /public/draco from three/examples/jsm/libs/draco/gltf
    dracoLoader.setDecoderPath('/draco/');
    gltfLoader = new GLTFLoader();
    gltfLoader.setDRACOLoader(dracoLoader);
    gltfLoader.setMeshoptDecoder(MeshoptDecoder);
  }
  return gltfLoader;
}

export function parseModelPayload(overlay: Overlay): ModelOverlayPayload {
  if (!overlay.payload) return {};
  if (typeof overlay.payload === 'object') return overlay.payload as ModelOverlayPayload;
  try {
    return JSON.parse(overlay.payload);
  } catch {
    return {};
  }
}

export function isGlbFile(file: File): boolean {
  return /\.(glb|gltf)$/i.test(file.name);
}

export function glbContentType(file: File): string {
  return /\.gltf$/i.test(file.name) ? 'model/gltf+json' : 'model/gltf-binary';
}

/**
 * PBR materials in glTF are black under ambient light alone, so add a hemisphere +
 * directional light once per scene. MeshBasicMaterial cube faces are unaffected.
 */
export function ensureModelLights(scene: THREE.Scene) {
  if (scene.getObjectByName(LIGHTS_NAME)) return;

  const lights = new THREE.Group();
  lights.name = LIGHTS_NAME;

  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.5);
  hemi.position.set(0, 50, 0);
  lights.add(hemi);

  const dir = new THREE.DirectionalLight(0xffffff, 2);
  dir.position.set(10, 30, 20);
  lights.add(dir);

  scene.add(lights);
}

export function disposeObject3D(root: THREE.Object3D) {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (!material) return;
    const materials = Array.isArray(material) ? material : [material];
    materials.forEach((mat) => {
      Object.values(mat).forEach((value) => {
        if (value instanceof THREE.Texture) value.dispose();
      });
      mat.dispose();
    });
  });
}

function directionFromYawPitch(yaw: number, pitch: number): THREE.Vector3 {
  // Same convention as createOverlaySprite / CubeMapViewer hotspots
  const phi = THREE.MathUtils.degToRad(90 - pitch);
  const theta = THREE.MathUtils.degToRad(yaw + 180);
  return new THREE.Vector3(
    Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta)
  );
}

/**
 * Create the overlay group for a GLB model. The group is returned immediately and the
 * model is attached when it finishes loading. Group structure:
 *   group (positioned, faces camera, holds userData.overlay)
 *     └─ pivot (user rotation + auto-rotate)
 *          └─ model (normalized to `size`, centered)
 */
export function createModelOverlay(
  overlay: Overlay,
  onError?: (overlay: Overlay, error: unknown) => void
): THREE.Group {
  const payload = parseModelPayload(overlay);
  const group = new THREE.Group();
  group.userData.overlay = overlay;
  group.userData.isModelOverlay = true;
  group.frustumCulled = false;

  const distance = THREE.MathUtils.clamp(
    Number(payload.distance) || MODEL_DEFAULTS.distance,
    MIN_MODEL_DISTANCE,
    MAX_MODEL_DISTANCE
  );
  const direction = directionFromYawPitch(overlay.yaw || 0, overlay.pitch || 0);
  group.position.copy(direction.multiplyScalar(distance));
  // Face the camera but stay upright
  group.lookAt(0, group.position.y, 0);

  const pivot = new THREE.Group();
  pivot.rotation.set(
    THREE.MathUtils.degToRad(Number(payload.rotationX) || 0),
    THREE.MathUtils.degToRad(Number(payload.rotationY) || 0),
    THREE.MathUtils.degToRad(Number(payload.rotationZ) || 0)
  );
  group.add(pivot);
  group.userData.pivot = pivot;
  group.userData.autoRotate = payload.autoRotate ?? MODEL_DEFAULTS.autoRotate;
  group.userData.autoRotateSpeed = THREE.MathUtils.degToRad(
    Number(payload.autoRotateSpeed) || MODEL_DEFAULTS.autoRotateSpeed
  );

  if (!payload.modelUrl) return group;

  getLoader().load(
    payload.modelUrl,
    (gltf: GLTF) => {
      const model = gltf.scene;

      // Overlay was removed while loading
      if (group.userData.disposed) {
        disposeObject3D(model);
        return;
      }

      // Normalize: largest dimension == size, centered on pivot
      const box = new THREE.Box3().setFromObject(model);
      const dims = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(dims.x, dims.y, dims.z) || 1;
      const scale = (Number(payload.size) || MODEL_DEFAULTS.size) / maxDim;
      model.scale.setScalar(scale);
      model.position.copy(center.multiplyScalar(-scale));

      model.traverse((node) => {
        node.frustumCulled = false;
      });
      pivot.add(model);

      if (gltf.animations.length > 0 && (payload.playAnimation ?? MODEL_DEFAULTS.playAnimation)) {
        const mixer = new THREE.AnimationMixer(model);
        gltf.animations.forEach((clip) => mixer.clipAction(clip).play());
        group.userData.mixer = mixer;
      }
    },
    undefined,
    (error) => {
      console.error('[GLB] Failed to load model:', payload.modelUrl, error);
      onError?.(overlay, error);
    }
  );

  return group;
}

/** Advance animations and auto-rotation for every model overlay in the group. */
export function updateModelOverlays(overlayGroup: THREE.Group, deltaSeconds: number) {
  overlayGroup.children.forEach((child) => {
    if (!child.userData.isModelOverlay) return;
    const mixer = child.userData.mixer as THREE.AnimationMixer | undefined;
    mixer?.update(deltaSeconds);
    if (child.userData.autoRotate && child.userData.pivot) {
      (child.userData.pivot as THREE.Object3D).rotation.y += child.userData.autoRotateSpeed * deltaSeconds;
    }
  });
}

/** Dispose an overlay group created by createModelOverlay. */
export function disposeModelOverlay(group: THREE.Object3D) {
  group.userData.disposed = true;
  const mixer = group.userData.mixer as THREE.AnimationMixer | undefined;
  mixer?.stopAllAction();
  disposeObject3D(group);
}
