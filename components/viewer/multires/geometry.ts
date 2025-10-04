import * as THREE from 'three';
import type { TileLevel } from '@/lib/multires-utils';
import { SPHERE_RADIUS } from './constants';

export function getTileKey(sceneId: string, level: number, col: number, row: number): string {
  return `${sceneId}:${level}:${col}:${row}`;
}

export function yawPitchToVector(yaw: number, pitch: number, radius: number = SPHERE_RADIUS): THREE.Vector3 {
  const phi = THREE.MathUtils.degToRad(90 - pitch);
  const theta = THREE.MathUtils.degToRad(yaw + 180);
  const x = radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  return new THREE.Vector3(x, y, z);
}

export function vectorToYawPitch(vector: THREE.Vector3): { yaw: number; pitch: number } {
  const normalized = vector.clone().normalize();
  const yaw = THREE.MathUtils.radToDeg(Math.atan2(normalized.z, normalized.x));
  const pitch = THREE.MathUtils.radToDeg(Math.asin(normalized.y));
  return { yaw, pitch };
}

export function createTileGeometry(
  levelInfo: TileLevel,
  col: number,
  row: number,
  overlapPx = 0,
): THREE.BufferGeometry {
  const tilePhi = (Math.PI * 2) / Math.max(1, levelInfo.cols || levelInfo.tilesX || 1);
  const tileTheta = Math.PI / Math.max(1, levelInfo.rows || levelInfo.tilesY || 1);

  const tileSize = levelInfo.tileSize || levelInfo.width / Math.max(1, levelInfo.cols);
  const overlapRatio = overlapPx > 0 && tileSize > 0 ? overlapPx / tileSize : 0.002;

  const phiOverlap = tilePhi * overlapRatio;
  const thetaOverlap = tileTheta * overlapRatio;

  let phiStart = col * tilePhi - phiOverlap;
  let phiLength = tilePhi + phiOverlap * 2;
  const fullPhi = Math.PI * 2;

  if (phiStart < 0) {
    phiLength += phiStart;
    phiStart = 0;
  }
  if (phiStart + phiLength > fullPhi) {
    phiLength = fullPhi - phiStart;
  }

  let thetaStart = row * tileTheta - thetaOverlap;
  let thetaLength = tileTheta + thetaOverlap * 2;
  const maxTheta = Math.PI;

  if (thetaStart < 0) {
    thetaLength += thetaStart;
    thetaStart = 0;
  }
  if (thetaStart + thetaLength > maxTheta) {
    thetaLength = maxTheta - thetaStart;
  }

  const widthSegments = Math.max(32, (levelInfo.cols || 1) * 4);
  const heightSegments = Math.max(16, (levelInfo.rows || 1) * 4);

  const geometry = new THREE.SphereGeometry(
    SPHERE_RADIUS,
    widthSegments,
    heightSegments,
    phiStart,
    phiLength,
    thetaStart,
    thetaLength,
  );
  geometry.scale(-1, 1, 1);
  return geometry;
}
