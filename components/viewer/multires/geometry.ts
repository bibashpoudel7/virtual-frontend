import * as THREE from 'three';
import type { TileLevel } from '@/lib/multires-utils';
import { SPHERE_RADIUS } from './constants';

export function getTileKey(sceneId: string, level: number, col: number, row: number): string {
  return `${sceneId}:${level}:${col}:${row}`;
}

export function yawPitchToVector(yaw: number, pitch: number, radius: number = SPHERE_RADIUS): THREE.Vector3 {
  // Convert yaw and pitch to spherical coordinates
  // Yaw: horizontal rotation (0 = front, positive = right)
  // Pitch: vertical rotation (0 = horizon, positive = up)
  const phi = THREE.MathUtils.degToRad(90 - pitch);
  const theta = THREE.MathUtils.degToRad(yaw + 180);
  const x = radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  return new THREE.Vector3(x, y, z);
}

export function vectorToYawPitch(vector: THREE.Vector3): { yaw: number; pitch: number } {
  const normalized = vector.clone().normalize();
  const yaw = THREE.MathUtils.radToDeg(Math.atan2(normalized.z, normalized.x)) - 180;
  const pitch = THREE.MathUtils.radToDeg(Math.asin(normalized.y));
  return { yaw, pitch };
}

export function createTileGeometry(
  levelInfo: TileLevel,
  col: number,
  row: number,
  overlapPx = 0,
): THREE.BufferGeometry {
  const cols = levelInfo.cols || levelInfo.tilesX || 1;
  const rows = levelInfo.rows || levelInfo.tilesY || 1;
  
  const tilePhi = (Math.PI * 2) / cols;
  const tileTheta = Math.PI / rows;

  const tileSize = levelInfo.tileSize || levelInfo.width / cols;
  const overlapRatio = overlapPx > 0 && tileSize > 0 ? overlapPx / tileSize : 0.002;

  const phiOverlap = tilePhi * overlapRatio;
  const thetaOverlap = tileTheta * overlapRatio;

  // Correct phi calculation - tiles go from left to right in texture
  // But sphere phi goes counterclockwise from +X axis
  // We need to map texture columns correctly
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
  
  console.log('[createTileGeometry] Created tile geometry:', {
    col,
    row,
    phiStart,
    phiLength,
    thetaStart,
    thetaLength,
    radius: SPHERE_RADIUS,
    segments: { width: widthSegments, height: heightSegments }
  });
  
  return geometry;
}
