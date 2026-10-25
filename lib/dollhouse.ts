/**
 * Dollhouse builder: turns a tour's 360° photos into a 3D model (.glb) of the property.
 *
 * For each room the user traces the floor corners in the photo. With a known camera height,
 * every corner click becomes a point on the floor, so the room is a prism: floor polygon
 * extruded to the ceiling height. Floors and walls are textured by "baking" the photo onto
 * them: each texel looks up the photo in the direction from the camera to that texel.
 * Rooms are then placed on a floor plan and the result is exported with GLTFExporter.
 *
 * Room space: the camera stands at (0, cameraHeight, 0) and the floor is y = 0.
 */

import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { CubeFace, CubeMapManifest } from '@/lib/cubemap-types';
import { sceneTileUrl } from '@/components/viewer/CubeMapViewer';
import { disposeObject3D } from '@/lib/glb-model';
import { BuildingScan, FloorPlanAnalysis, IntroModelRoom, Scene } from '@/types/tour';

/** A point on the floor plan: (x, z) in meters */
export type PlanPoint = [number, number];

export interface DollhouseRoom {
  /** The room's 360° photo, or PLAN_ROOM_PREFIX + n for a floor plan room without one */
  sceneId: string;
  /** Display name (floor plan rooms); photo rooms use the scene name */
  name?: string;
  /**
   * Shape and position come from a floor plan: moving or turning the camera keeps the
   * outline where it is on the plan instead of moving the room
   */
  fromPlan?: boolean;
  /** Floor corners in room space, in clicking order (the camera stands at 0, 0) */
  corners: PlanPoint[];
  /** Floor to ceiling, meters */
  ceilingHeight: number;
  /** Position on the floor plan, meters */
  offset: PlanPoint;
  /** Turn around the vertical axis, degrees */
  rotation: number;
  /** Has been placed on the floor plan (unplaced rooms get laid out automatically) */
  placed: boolean;
}

export interface DollhouseProject {
  version: 1;
  /** Height of the camera lens above the floor, meters (sets the scale of every room) */
  cameraHeight: number;
  rooms: DollhouseRoom[];
}

export const DOLLHOUSE_DEFAULTS = {
  cameraHeight: 1.5,
  ceilingHeight: 2.6,
  wallThickness: 0.12,
  pxPerMeter: 200,
};

export const PLAN_ROOM_PREFIX = 'plan:';
export const isPlanOnlyRoom = (room: DollhouseRoom) => room.sceneId.startsWith(PLAN_ROOM_PREFIX);

// The intro viewer normalizes every model to this size (see IntroModelScreen MODEL_SIZE)
const INTRO_MODEL_SIZE = 10;
const MAX_TEXTURE_SIZE = 2048;
const MAX_ROOM_RADIUS = 60; // meters; farther floor clicks are almost certainly mistakes
/** Tallest wall: room ceilings, or whole buildings photographed from outside */
export const MAX_WALL_HEIGHT = 60;

// Same face order and box as CubeMapViewer, so the photo is oriented exactly as in the tour
const FACE_ORDER = [CubeFace.RIGHT, CubeFace.LEFT, CubeFace.BOTTOM, CubeFace.TOP, CubeFace.FRONT, CubeFace.BACK];

export function parseCubeManifest(scene: Scene): CubeMapManifest | null {
  if (!scene.tiles_manifest) return null;
  try {
    const parsed = typeof scene.tiles_manifest === 'string' ? JSON.parse(scene.tiles_manifest) : scene.tiles_manifest;
    return parsed?.type === 'cubemap' && Array.isArray(parsed.levels) && parsed.levels.length ? parsed : null;
  } catch {
    return null;
  }
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Load a scene's photo as the same inside-out cube CubeMapViewer shows, using the sharpest
 * level whose faces are at most `maxFaceSize` pixels.
 */
export async function loadSceneCube(scene: Scene, maxFaceSize = MAX_TEXTURE_SIZE): Promise<THREE.Mesh> {
  const manifest = parseCubeManifest(scene);
  if (!manifest) throw new Error('This 360° photo has not been processed yet.');

  const levels = [...manifest.levels].sort((a, b) => a.size - b.size);
  const level = [...levels].reverse().find(l => l.size <= maxFaceSize) || levels[0];
  const tileSize = level.tileSize || manifest.tileSize || 512;
  const tilesPerSide = level.tiles || Math.ceil(level.size / tileSize);

  const textures = await Promise.all(FACE_ORDER.map(async (face) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = level.size;
    const ctx = canvas.getContext('2d')!;
    const jobs: Promise<boolean>[] = [];
    for (let y = 0; y < tilesPerSide; y++) {
      for (let x = 0; x < tilesPerSide; x++) {
        jobs.push(loadImage(sceneTileUrl(scene.id, `${face}_l${level.level}_${x}_${y}`)).then((img) => {
          if (!img) return false;
          const destX = x * tileSize;
          const destY = y * tileSize;
          ctx.drawImage(img, destX, destY, Math.min(tileSize, level.size - destX), Math.min(tileSize, level.size - destY));
          return true;
        }));
      }
    }
    const loaded = await Promise.all(jobs);
    if (!loaded.some(Boolean)) throw new Error(`Could not load the photo for “${scene.name}”.`);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false;
    return texture;
  }));

  const materials = textures.map(map => new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide }));
  return new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100), materials);
}

export function disposeSceneCube(cube: THREE.Mesh) {
  disposeObject3D(cube);
}

// ---------------------------------------------------------------------------
// Room geometry
// ---------------------------------------------------------------------------

/** Where a view ray from the camera hits the floor, or null when it points at/above the horizon. */
export function floorPointFromRay(direction: THREE.Vector3, cameraHeight: number): PlanPoint | null {
  if (direction.y > -0.02) return null;
  const t = cameraHeight / -direction.y;
  const x = direction.x * t;
  const z = direction.z * t;
  if (Math.hypot(x, z) > MAX_ROOM_RADIUS) return null;
  return [+x.toFixed(3), +z.toFixed(3)];
}

/**
 * Ceiling height from a click where a wall meets the ceiling: the ray is followed to the
 * nearest traced wall and the height there is read off.
 */
export function ceilingHeightFromRay(direction: THREE.Vector3, corners: PlanPoint[], cameraHeight: number): number | null {
  if (corners.length < 3 || direction.y <= 0.02) return null;
  let nearest = Infinity;
  for (let i = 0; i < corners.length; i++) {
    const [ax, az] = corners[i];
    const [bx, bz] = corners[(i + 1) % corners.length];
    const ex = bx - ax;
    const ez = bz - az;
    // Solve t * d = a + s * e  (t: along the ray, s: along the wall)
    const det = direction.x * -ez + ex * direction.z;
    if (Math.abs(det) < 1e-9) continue;
    const t = (ax * -ez + ex * az) / det;
    const s = (direction.x * az - direction.z * ax) / det;
    if (t > 0 && s >= -0.01 && s <= 1.01) nearest = Math.min(nearest, t);
  }
  if (!Number.isFinite(nearest)) return null;
  const height = cameraHeight + direction.y * nearest;
  return height > cameraHeight && height <= MAX_WALL_HEIGHT ? +height.toFixed(2) : null;
}

export function pointInPolygon([x, z]: PlanPoint, polygon: PlanPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i];
    const [xj, zj] = polygon[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Unit normal of edge i (corner i → i + 1) pointing into the room. */
function inwardNormal(polygon: PlanPoint[], i: number): PlanPoint {
  const [ax, az] = polygon[i];
  const [bx, bz] = polygon[(i + 1) % polygon.length];
  const length = Math.hypot(bx - ax, bz - az) || 1;
  const normal: PlanPoint = [-(bz - az) / length, (bx - ax) / length];
  const probe: PlanPoint = [(ax + bx) / 2 + normal[0] * 1e-3, (az + bz) / 2 + normal[1] * 1e-3];
  return pointInPolygon(probe, polygon) ? normal : [-normal[0], -normal[1]];
}

/** Room space → floor plan (same transform as the room's group: rotate around Y, then move). */
export function roomToPlan(room: DollhouseRoom, [x, z]: PlanPoint): PlanPoint {
  const angle = THREE.MathUtils.degToRad(room.rotation);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [x * cos + z * sin + room.offset[0], -x * sin + z * cos + room.offset[1]];
}

/** Floor plan → room space (inverse of roomToPlan). */
export function planToRoom(room: DollhouseRoom, [px, pz]: PlanPoint): PlanPoint {
  const angle = THREE.MathUtils.degToRad(room.rotation);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = px - room.offset[0];
  const dz = pz - room.offset[1];
  return [+(dx * cos - dz * sin).toFixed(3), +(dx * sin + dz * cos).toFixed(3)];
}

/** Move/turn the camera of a room while its outline stays put on the floor plan. */
export function reanchorRoom(room: DollhouseRoom, offset: PlanPoint, rotation: number): DollhouseRoom {
  const outline = room.corners.map(c => roomToPlan(room, c));
  const next = { ...room, offset, rotation };
  return { ...next, corners: outline.map(p => planToRoom(next, p)) };
}

function polygonCentroid(points: PlanPoint[]): PlanPoint {
  let area = 0;
  let cx = 0;
  let cz = 0;
  points.forEach(([x1, z1], i) => {
    const [x2, z2] = points[(i + 1) % points.length];
    const cross = x1 * z2 - x2 * z1;
    area += cross;
    cx += (x1 + x2) * cross;
    cz += (z1 + z2) * cross;
  });
  if (Math.abs(area) < 1e-9) {
    return [points.reduce((s, p) => s + p[0], 0) / points.length, points.reduce((s, p) => s + p[1], 0) / points.length];
  }
  return [cx / (3 * area), cz / (3 * area)];
}

/** A point inside the polygon: the centroid, or for odd shapes the middle of its largest triangle. */
export function interiorPoint(points: PlanPoint[]): PlanPoint {
  const centroid = polygonCentroid(points);
  if (pointInPolygon(centroid, points)) return centroid;
  let best: PlanPoint = points[0];
  let bestArea = -1;
  THREE.ShapeUtils.triangulateShape(points.map(([x, z]) => new THREE.Vector2(x, z)), []).forEach(([a, b, c]) => {
    const [ax, az] = points[a];
    const [bx, bz] = points[b];
    const [cx, cz] = points[c];
    const area = Math.abs((bx - ax) * (cz - az) - (cx - ax) * (bz - az));
    if (area > bestArea) {
      bestArea = area;
      best = [(ax + bx + cx) / 3, (az + bz + cz) / 3];
    }
  });
  return best;
}

/**
 * Turn floor plan rooms into dollhouse rooms. `aspect` is the plan image's height / width.
 * Each photo's camera starts in the middle of its room; the user then drags it to where the
 * photo was taken and turns it until the photo lines up.
 */
export function roomsFromFloorPlan(
  analysis: FloorPlanAnalysis,
  aspect: number,
  planWidthMeters: number,
  ceilingHeight: number
): DollhouseRoom[] {
  return analysis.rooms
    .filter(r => r.corners.length >= 3)
    .map((planRoom, index) => planRoomToDollhouse(
      planRoom.corners.map(c => [c.x * planWidthMeters, c.y * planWidthMeters * aspect]),
      planRoom.scene_id || `${PLAN_ROOM_PREFIX}${index}`,
      planRoom.name,
      ceilingHeight
    ));
}

/**
 * Turn a phone scan into dollhouse rooms. The scan already measured where each photo was
 * taken; rooms without a photo spot start with the camera in the middle.
 */
export function roomsFromBuildingScan(scan: BuildingScan): DollhouseRoom[] {
  return scan.rooms
    .filter(r => r.corners.length >= 3)
    .map((scanRoom, index) => planRoomToDollhouse(
      scanRoom.corners,
      scanRoom.scene_id || `${PLAN_ROOM_PREFIX}${index}`,
      scanRoom.name,
      scanRoom.ceiling_height || DOLLHOUSE_DEFAULTS.ceilingHeight,
      scanRoom.photo_spot
    ));
}

function planRoomToDollhouse(outline: PlanPoint[], sceneId: string, name: string, ceilingHeight: number, camera?: PlanPoint | null): DollhouseRoom {
  const rounded = outline.map(([x, z]) => [+x.toFixed(3), +z.toFixed(3)] as PlanPoint);
  const spot = camera && pointInPolygon(camera, rounded) ? camera : interiorPoint(rounded);
  const room: DollhouseRoom = {
    sceneId,
    name,
    fromPlan: true,
    corners: [],
    ceilingHeight,
    offset: [+spot[0].toFixed(3), +spot[1].toFixed(3)],
    rotation: 0,
    placed: true,
  };
  return { ...room, corners: rounded.map(p => planToRoom(room, p)) };
}

export function polygonBounds(points: PlanPoint[]) {
  const xs = points.map(p => p[0]);
  const zs = points.map(p => p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

/** Lay out rooms that have never been placed in a row to the right of the placed ones. */
export function autoPlaceRooms(rooms: DollhouseRoom[]): DollhouseRoom[] {
  const placed = rooms.filter(r => r.placed && r.corners.length >= 3);
  let cursor = placed.length
    ? Math.max(...placed.map(r => polygonBounds(r.corners.map(c => roomToPlan(r, c))).maxX)) + 1
    : 0;
  return rooms.map((room) => {
    if (room.placed || room.corners.length < 3) return room;
    const bounds = polygonBounds(room.corners);
    const next = { ...room, placed: true, rotation: 0, offset: [+(cursor - bounds.minX).toFixed(2), 0] as PlanPoint };
    cursor += bounds.maxX - bounds.minX + 1;
    return next;
  });
}

// ---------------------------------------------------------------------------
// Baking the photo onto floors and walls
// ---------------------------------------------------------------------------

const BAKE_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const BAKE_FRAGMENT = /* glsl */ `
  uniform samplerCube env;
  uniform vec3 origin;
  uniform vec3 axisU;
  uniform vec3 axisV;
  uniform vec3 eye;
  varying vec2 vUv;

  vec3 toSRGB(vec3 c) {
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
  }

  void main() {
    vec3 point = origin + vUv.x * axisU + vUv.y * axisV;
    vec3 color = textureCube(env, normalize(point - eye)).rgb;
    gl_FragColor = vec4(toSRGB(color), 1.0);
  }
`;

/** Renders a photo into a cube texture, then bakes planar patches of it into canvases. */
class TextureBaker {
  private renderer = new THREE.WebGLRenderer({ antialias: false });
  private env: THREE.WebGLCubeRenderTarget;
  private cubeCamera: THREE.CubeCamera;
  private captureScene = new THREE.Scene();
  private quadScene = new THREE.Scene();
  private quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private material: THREE.ShaderMaterial;

  constructor() {
    const size = Math.min(MAX_TEXTURE_SIZE, this.renderer.capabilities.maxCubemapSize);
    this.env = new THREE.WebGLCubeRenderTarget(size, {
      colorSpace: THREE.SRGBColorSpace,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
    });
    this.cubeCamera = new THREE.CubeCamera(0.1, 1000, this.env);
    this.material = new THREE.ShaderMaterial({
      vertexShader: BAKE_VERTEX,
      fragmentShader: BAKE_FRAGMENT,
      uniforms: {
        env: { value: this.env.texture },
        origin: { value: new THREE.Vector3() },
        axisU: { value: new THREE.Vector3() },
        axisV: { value: new THREE.Vector3() },
        eye: { value: new THREE.Vector3() },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
  }

  /** Use this photo for the next bakes. */
  capture(cube: THREE.Mesh) {
    this.captureScene.add(cube);
    this.cubeCamera.update(this.renderer, this.captureScene);
    this.captureScene.remove(cube);
  }

  /** Bake the patch origin + u * axisU + v * axisV (u, v in 0..1) as seen from `eye`. */
  bake(origin: THREE.Vector3, axisU: THREE.Vector3, axisV: THREE.Vector3, eye: THREE.Vector3, width: number, height: number) {
    const uniforms = this.material.uniforms;
    uniforms.origin.value.copy(origin);
    uniforms.axisU.value.copy(axisU);
    uniforms.axisV.value.copy(axisV);
    uniforms.eye.value.copy(eye);

    const target = new THREE.WebGLRenderTarget(width, height);
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCamera);
    const pixels = new Uint8Array(width * height * 4);
    this.renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
    this.renderer.setRenderTarget(null);
    target.dispose();

    // GL rows start at the bottom (v = 0); canvas rows start at the top
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    const image = ctx.createImageData(width, height);
    const rowBytes = width * 4;
    for (let row = 0; row < height; row++) {
      image.data.set(pixels.subarray(row * rowBytes, (row + 1) * rowBytes), (height - 1 - row) * rowBytes);
    }
    ctx.putImageData(image, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.userData.mimeType = 'image/jpeg'; // GLTFExporter: JPEG keeps photo textures small
    return texture;
  }

  dispose() {
    this.env.dispose();
    this.material.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

/** Collects triangles, flipping winding so each face points along the normal it was given. */
class MeshBuilder {
  positions: number[] = [];
  uvs: number[] = [];
  indices: number[] = [];

  addTriangle(points: THREE.Vector3[], uvs: number[][], normal: THREE.Vector3) {
    const base = this.positions.length / 3;
    points.forEach((p, i) => {
      this.positions.push(p.x, p.y, p.z);
      this.uvs.push(uvs[i][0], uvs[i][1]);
    });
    const faceNormal = new THREE.Vector3().subVectors(points[1], points[0]).cross(new THREE.Vector3().subVectors(points[2], points[0]));
    if (faceNormal.dot(normal) >= 0) this.indices.push(base, base + 1, base + 2);
    else this.indices.push(base, base + 2, base + 1);
  }

  /** Quad a-b-c-d (in order around its edge) */
  addQuad(points: THREE.Vector3[], normal: THREE.Vector3, uvs = [[0, 0], [1, 0], [1, 1], [0, 1]]) {
    this.addTriangle([points[0], points[1], points[2]], [uvs[0], uvs[1], uvs[2]], normal);
    this.addTriangle([points[0], points[2], points[3]], [uvs[0], uvs[2], uvs[3]], normal);
  }

  toGeometry() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.setIndex(this.indices);
    geometry.computeVertexNormals();
    return geometry;
  }
}

const textureSize = (meters: number, pxPerMeter: number) =>
  THREE.MathUtils.clamp(Math.round(meters * pxPerMeter), 32, MAX_TEXTURE_SIZE);

// Rooms without a photo: plain floor and walls
const PLAIN_FLOOR_COLOR = 0xd6c3a5;
const PLAIN_WALL_COLOR = 0xf5f5f4;

function buildRoom(room: DollhouseRoom, cameraHeight: number, baker: TextureBaker | null, pxPerMeter: number, shellMaterials: THREE.Material[]) {
  const group = new THREE.Group();
  const corners = room.corners;
  const height = room.ceilingHeight;
  const eye = new THREE.Vector3(0, cameraHeight, 0);
  const up = new THREE.Vector3(0, 1, 0);
  const v3 = ([x, z]: PlanPoint, y: number) => new THREE.Vector3(x, y, z);

  // Photo taken outside the traced shape (a building from the street): the photo belongs on
  // the outside of the walls facing the camera, and the inside can't be seen at all
  if (!pointInPolygon([0, 0], corners)) {
    return buildExterior(room, eye, baker, pxPerMeter, shellMaterials);
  }

  // Floor: one texture over the polygon's bounding box
  const { minX, maxX, minZ, maxZ } = polygonBounds(corners);
  const width = Math.max(maxX - minX, 0.01);
  const depth = Math.max(maxZ - minZ, 0.01);
  const floorMap = baker?.bake(
    new THREE.Vector3(minX, 0, minZ), new THREE.Vector3(width, 0, 0), new THREE.Vector3(0, 0, depth), eye,
    textureSize(width, pxPerMeter), textureSize(depth, pxPerMeter)
  );
  const floor = new MeshBuilder();
  const contour = corners.map(([x, z]) => new THREE.Vector2(x, z));
  THREE.ShapeUtils.triangulateShape(contour, []).forEach((triangle) => {
    floor.addTriangle(
      triangle.map(i => v3(corners[i], 0)),
      triangle.map(i => [(corners[i][0] - minX) / width, (corners[i][1] - minZ) / depth]),
      up
    );
  });
  const floorMesh = new THREE.Mesh(
    floor.toGeometry(),
    floorMap ? new THREE.MeshBasicMaterial({ map: floorMap }) : new THREE.MeshStandardMaterial({ color: PLAIN_FLOOR_COLOR, roughness: 0.8 })
  );
  floorMesh.name = 'Floor';
  group.add(floorMesh);

  // Outer outline: corners pushed out by the wall thickness, mitered at each corner
  const thickness = DOLLHOUSE_DEFAULTS.wallThickness;
  const outer = corners.map((corner, i) => {
    const before = inwardNormal(corners, (i - 1 + corners.length) % corners.length);
    const after = inwardNormal(corners, i);
    let mx = -(before[0] + after[0]);
    let mz = -(before[1] + after[1]);
    const length = Math.hypot(mx, mz);
    if (length < 1e-6) {
      mx = -after[0];
      mz = -after[1];
    } else {
      mx /= length;
      mz /= length;
    }
    const miter = thickness / Math.max(mx * -after[0] + mz * -after[1], 0.3);
    return [corner[0] + mx * miter, corner[1] + mz * miter] as PlanPoint;
  });

  const outside = new MeshBuilder();
  const tops = new MeshBuilder();
  corners.forEach((a, i) => {
    const next = (i + 1) % corners.length;
    const b = corners[next];
    const inward = inwardNormal(corners, i);
    const inwardVector = new THREE.Vector3(inward[0], 0, inward[1]);
    const wallLength = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (wallLength < 0.01) return;

    // Inside face, textured from the photo
    const map = baker?.bake(
      v3(a, 0), new THREE.Vector3(b[0] - a[0], 0, b[1] - a[1]), new THREE.Vector3(0, height, 0), eye,
      textureSize(wallLength, pxPerMeter), textureSize(height, pxPerMeter)
    );
    const wall = new MeshBuilder();
    wall.addQuad([v3(a, 0), v3(b, 0), v3(b, height), v3(a, height)], inwardVector);
    const wallMesh = new THREE.Mesh(
      wall.toGeometry(),
      map ? new THREE.MeshBasicMaterial({ map }) : new THREE.MeshStandardMaterial({ color: PLAIN_WALL_COLOR, roughness: 0.9 })
    );
    wallMesh.name = `Wall ${i + 1}`;
    group.add(wallMesh);

    // Outside face and top of the wall, plain
    const oa = outer[i];
    const ob = outer[next];
    outside.addQuad([v3(oa, 0), v3(ob, 0), v3(ob, height), v3(oa, height)], inwardVector.clone().negate());
    tops.addQuad([v3(a, height), v3(b, height), v3(ob, height), v3(oa, height)], up);
  });

  const outsideMesh = new THREE.Mesh(outside.toGeometry(), shellMaterials[0]);
  outsideMesh.name = 'Outside walls';
  const topsMesh = new THREE.Mesh(tops.toGeometry(), shellMaterials[1]);
  topsMesh.name = 'Wall tops';
  group.add(outsideMesh, topsMesh);
  return group;
}

/** A building seen from outside: photo on the walls facing the camera, plain sides and roof. */
function buildExterior(room: DollhouseRoom, eye: THREE.Vector3, baker: TextureBaker | null, pxPerMeter: number, shellMaterials: THREE.Material[]) {
  const group = new THREE.Group();
  const corners = room.corners;
  const height = room.ceilingHeight;
  const up = new THREE.Vector3(0, 1, 0);
  const v3 = ([x, z]: PlanPoint, y: number) => new THREE.Vector3(x, y, z);

  corners.forEach((a, i) => {
    const b = corners[(i + 1) % corners.length];
    const wallLength = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (wallLength < 0.01) return;
    const inward = inwardNormal(corners, i);
    const outward = new THREE.Vector3(-inward[0], 0, -inward[1]);
    // The camera (at x = z = 0) sees this face when it is on the face's outer side
    const midX = (a[0] + b[0]) / 2;
    const midZ = (a[1] + b[1]) / 2;
    const facesCamera = outward.x * -midX + outward.z * -midZ > 0;
    const map = facesCamera ? baker?.bake(
      v3(a, 0), new THREE.Vector3(b[0] - a[0], 0, b[1] - a[1]), new THREE.Vector3(0, height, 0), eye,
      textureSize(wallLength, pxPerMeter), textureSize(height, pxPerMeter)
    ) : undefined;
    const wall = new MeshBuilder();
    wall.addQuad([v3(a, 0), v3(b, 0), v3(b, height), v3(a, height)], outward);
    const wallMesh = new THREE.Mesh(wall.toGeometry(), map ? new THREE.MeshBasicMaterial({ map }) : shellMaterials[0]);
    wallMesh.name = `Facade ${i + 1}`;
    group.add(wallMesh);
  });

  const roof = new MeshBuilder();
  THREE.ShapeUtils.triangulateShape(corners.map(([x, z]) => new THREE.Vector2(x, z)), []).forEach((triangle) => {
    roof.addTriangle(triangle.map(i => v3(corners[i], height)), triangle.map(() => [0, 0]), up);
  });
  const roofMesh = new THREE.Mesh(roof.toGeometry(), shellMaterials[1]);
  roofMesh.name = 'Roof';
  group.add(roofMesh);
  return group;
}

export interface DollhouseBuildResult {
  glb: ArrayBuffer;
  /** Room labels in the intro viewer's normalized model space */
  labels: IntroModelRoom[];
}

/** Build the dollhouse for every traced room and export it as a binary glTF (.glb). */
export async function buildDollhouse(
  project: DollhouseProject,
  scenes: Scene[],
  options: { pxPerMeter?: number; onProgress?: (done: number, total: number, roomName: string) => void } = {}
): Promise<DollhouseBuildResult> {
  const pxPerMeter = options.pxPerMeter || DOLLHOUSE_DEFAULTS.pxPerMeter;
  const rooms = project.rooms.filter(r => r.corners.length >= 3 && (isPlanOnlyRoom(r) || scenes.some(s => s.id === r.sceneId)));
  if (!rooms.length) throw new Error('Trace at least one room first.');

  const root = new THREE.Group();
  root.name = 'Dollhouse';
  const shellMaterials = [
    new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.9 }),
  ];
  const labelAnchors: { sceneId: string; object: THREE.Object3D }[] = [];

  const baker = new TextureBaker();
  try {
    for (const [index, room] of rooms.entries()) {
      const scene = scenes.find(s => s.id === room.sceneId);
      const name = scene?.name || room.name || `Room ${index + 1}`;
      options.onProgress?.(index, rooms.length, name);
      if (scene) {
        const cube = await loadSceneCube(scene);
        baker.capture(cube);
        disposeSceneCube(cube);
      }

      const group = buildRoom(room, project.cameraHeight, scene ? baker : null, pxPerMeter, shellMaterials);
      group.name = name;
      group.position.set(room.offset[0], 0, room.offset[1]);
      group.rotation.y = THREE.MathUtils.degToRad(room.rotation);
      root.add(group);

      // Label where the photo was taken, about waist height (rooms without a photo have nothing to open)
      if (scene) {
        const anchor = new THREE.Object3D();
        anchor.position.set(0, Math.min(1, room.ceilingHeight * 0.5), 0);
        group.add(anchor);
        labelAnchors.push({ sceneId: room.sceneId, object: anchor });
      }
    }
    options.onProgress?.(rooms.length, rooms.length, '');
  } finally {
    baker.dispose();
  }

  // Label positions, normalized the same way IntroModelViewer normalizes the loaded model
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = INTRO_MODEL_SIZE / Math.max(size.x, size.y, size.z, 1e-6);
  const labels: IntroModelRoom[] = labelAnchors.map(({ sceneId, object }) => {
    const p = object.getWorldPosition(new THREE.Vector3());
    return {
      sceneId,
      position: [
        +((p.x - center.x) * scale).toFixed(3),
        +((p.y - box.min.y) * scale).toFixed(3),
        +((p.z - center.z) * scale).toFixed(3),
      ],
    };
  });
  labelAnchors.forEach(({ object }) => object.removeFromParent());

  // Keep the project in the file (glTF extras) so the dollhouse can be edited again later
  root.userData.dollhouse = project;

  try {
    const glb = await new GLTFExporter().parseAsync(root, { binary: true });
    return { glb: glb as ArrayBuffer, labels };
  } finally {
    disposeObject3D(root);
  }
}

/** Read the builder project back from a dollhouse .glb made by buildDollhouse. */
export function readDollhouseProject(model: THREE.Object3D): DollhouseProject | null {
  let project: DollhouseProject | null = null;
  model.traverse((node) => {
    const data = node.userData?.dollhouse;
    if (!project && data?.version === 1 && Array.isArray(data.rooms)) project = data;
  });
  return project;
}
