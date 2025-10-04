import * as THREE from 'three';
import type { TileEntry } from './types';

export function disposeTileEntry(entry: TileEntry) {
  if (entry.mesh.parent) {
    entry.mesh.parent.remove(entry.mesh);
  }
  if (entry.mesh.material instanceof THREE.Material) {
    entry.mesh.material.dispose();
  }
  entry.texture.dispose();
}
