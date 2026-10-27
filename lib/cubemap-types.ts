/**
 * Cube Map Types
 * These types can be safely imported in both client and server components
 */

export enum CubeFace {
  RIGHT = 'right',   // +X
  LEFT = 'left',     // -X
  TOP = 'top',       // +Y
  BOTTOM = 'bottom', // -Y
  FRONT = 'front',   // +Z
  BACK = 'back'      // -Z
}

export interface CubeTile {
  face: CubeFace;
  level: number;
  x: number;
  y: number;
  buffer?: Buffer;
  key: string;
  url?: string;
}

export interface CubeMapManifest {
  type: 'cubemap';
  cubeSize: number;
  tileSize: number; // Default/base tile size for backward compatibility
  levels: Array<{
    level: number;
    size: number;
    tileSize: number; // Tile size for this specific level
    tiles: number;
  }>;
  faces: CubeFace[];
  preview?: string;
}