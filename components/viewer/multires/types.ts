import * as THREE from 'three';
import type { MultiresManifest } from '@/lib/multires-utils';

export interface TileRequest {
  key: string;
  sceneId: string;
  level: number;
  col: number;
  row: number;
  priority: number;
}

export interface TileEntry {
  key: string;
  sceneId: string;
  level: number;
  col: number;
  row: number;
  mesh: THREE.Mesh;
  texture: THREE.Texture;
  lastUsed: number;
  pendingRemovalAt?: number;
}

export type ExtendedManifest = MultiresManifest & { basePath?: string };
