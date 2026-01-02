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
  // Add 180 degrees to yaw to align with the sphere texture orientation
  const phi = THREE.MathUtils.degToRad(90 - pitch);
  const theta = THREE.MathUtils.degToRad(yaw + 180);
  const x = radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  
  return new THREE.Vector3(x, y, z);
}

export function vectorToYawPitch(vector: THREE.Vector3): { yaw: number; pitch: number } {
  const normalized = vector.clone().normalize();
  
  // Reverse the exact math from yawPitchToVector
  // From yawPitchToVector:
  // phi = THREE.MathUtils.degToRad(90 - pitch)
  // theta = THREE.MathUtils.degToRad(yaw)
  // x = radius * Math.sin(phi) * Math.cos(theta)
  // y = radius * Math.cos(phi)  
  // z = radius * Math.sin(phi) * Math.sin(theta)
  
  // Calculate phi from y coordinate
  // y = radius * Math.cos(phi) => phi = Math.acos(y / radius)
  const phi = Math.acos(Math.max(-1, Math.min(1, normalized.y)));
  
  // Calculate pitch from phi
  // phi = THREE.MathUtils.degToRad(90 - pitch) => pitch = 90 - THREE.MathUtils.radToDeg(phi)
  const pitch = 90 - THREE.MathUtils.radToDeg(phi);
  
  // Calculate theta from x and z coordinates
  // x = radius * Math.sin(phi) * Math.cos(theta)
  // z = radius * Math.sin(phi) * Math.sin(theta)
  // theta = Math.atan2(z / (radius * Math.sin(phi)), x / (radius * Math.sin(phi)))
  // theta = Math.atan2(z, x)
  const theta = Math.atan2(normalized.z, normalized.x);
  
  // Calculate yaw from theta
  // theta = THREE.MathUtils.degToRad(yaw + 180) => yaw = THREE.MathUtils.radToDeg(theta) - 180
  let yaw = THREE.MathUtils.radToDeg(theta) - 180;
  
  // Normalize yaw to [-180, 180] range
  while (yaw > 180) yaw -= 360;
  while (yaw < -180) yaw += 360;
  
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

  // Phi calculation for equirectangular projection
  // In equirectangular: left edge = 0, right edge = 2*PI
  // Three.js sphere: phi goes from 0 to 2*PI around the equator
  // The tiles are created left-to-right, so col 0 = leftmost
  let phiStart = col * tilePhi - phiOverlap;
  let phiLength = tilePhi + phiOverlap * 2;
  const fullPhi = Math.PI * 2;

  // Clamp to valid range
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

  // More segments for smoother rendering, especially at lower levels
  const segmentMultiplier = levelInfo.level <= 1 ? 8 : 4;
  const widthSegments = Math.max(64, segmentMultiplier * 8);
  const heightSegments = Math.max(32, segmentMultiplier * 4);

  const geometry = new THREE.SphereGeometry(
    SPHERE_RADIUS,
    widthSegments,
    heightSegments,
    phiStart,
    phiLength,
    thetaStart,
    thetaLength,
  );
  
  // Scale to create inside-out sphere
  geometry.scale(-1, 1, 1);
  
  return geometry;
}
