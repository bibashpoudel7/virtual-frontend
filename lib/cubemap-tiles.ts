/**
 * Cube Map Tile Generation System
 * Creates Matterport-style cube map tiles from panoramic images
 * This file should only be imported server-side (API routes)
 */

import sharp from 'sharp';
import { CubeFace, CubeTile, CubeMapManifest } from './cubemap-types';

const R2_PUBLIC_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || 'https://test.thenimto.com';

/**
 * Convert cube face coordinates to equirectangular coordinates
 * Using standard cube map to equirectangular mapping
 */
function cubeFaceToEquirect(face: CubeFace, x: number, y: number, faceSize: number): { u: number, v: number } {
  // Normalize face coordinates to [-1, 1]
  const s = (2.0 * (x + 0.5) / faceSize) - 1.0;
  const t = (2.0 * (y + 0.5) / faceSize) - 1.0;
  
  // Calculate 3D vector based on cube face
  // Following standard cube map conventions
  let vec = { x: 0, y: 0, z: 0 };
  
  switch (face) {
    case CubeFace.FRONT: // Positive Z
      vec.x = s;
      vec.y = -t;
      vec.z = 1.0;
      break;
    case CubeFace.BACK: // Negative Z
      vec.x = -s;
      vec.y = -t;
      vec.z = -1.0;
      break;
    case CubeFace.RIGHT: // Positive X
      vec.x = 1.0;
      vec.y = -t;
      vec.z = -s;
      break;
    case CubeFace.LEFT: // Negative X
      vec.x = -1.0;
      vec.y = -t;
      vec.z = s;
      break;
    case CubeFace.TOP: // Positive Y (looking up)
      vec.x = s;
      vec.y = 1.0;
      vec.z = t;
      break;
    case CubeFace.BOTTOM: // Negative Y (looking down)
      vec.x = s;
      vec.y = -1.0;
      vec.z = -t;
      break;
  }
  
  // Normalize the vector
  const len = Math.sqrt(vec.x * vec.x + vec.y * vec.y + vec.z * vec.z);
  vec.x /= len;
  vec.y /= len;
  vec.z /= len;
  
  // Convert to spherical coordinates
  // theta is the azimuth angle (horizontal)
  // phi is the elevation angle (vertical)
  const theta = Math.atan2(vec.z, vec.x);
  const phi = Math.asin(Math.max(-1, Math.min(1, vec.y))); // Clamp to avoid NaN
  
  // Convert to equirectangular UV coordinates [0, 1]
  // u wraps horizontally (0 = -180°, 1 = +180°)
  // v goes vertically (0 = +90°, 1 = -90°)
  const u = (theta + Math.PI) / (2.0 * Math.PI);
  const v = (phi + Math.PI / 2.0) / Math.PI;

  return { u, v };
}

// Raw face data with metadata for lossless processing
interface RawFaceData {
  pixels: Buffer;
  width: number;
  height: number;
  channels: 1 | 2 | 3 | 4;
}

/**
 * Generate cube map faces with proper spherical projection
 * Returns raw pixel data to avoid quality loss from intermediate JPEG compression
 */
export async function generateCubeMapFromPanoramaRaw(
  panoramaBuffer: Buffer,
  cubeSize: number = 2048
): Promise<Map<CubeFace, RawFaceData>> {
  const faces = new Map<CubeFace, RawFaceData>();

  // Get panorama metadata and pixels
  const panorama = sharp(panoramaBuffer);
  const metadata = await panorama.metadata();
  const width = metadata.width || 4096;
  const height = metadata.height || 2048;

  console.log(`Converting ${width}x${height} equirectangular panorama to ${cubeSize}x${cubeSize} cube faces`);

  // Get raw panorama pixels
  const { data: panoramaPixels, info } = await panorama
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels as 1 | 2 | 3 | 4;

  // Generate each cube face
  for (const face of Object.values(CubeFace)) {
    // Create buffer for cube face
    const facePixels = Buffer.alloc(cubeSize * cubeSize * channels);

    // Sample pixels from panorama using proper spherical projection
    for (let y = 0; y < cubeSize; y++) {
      for (let x = 0; x < cubeSize; x++) {
        // Get equirectangular coordinates for this cube face pixel
        const { u, v } = cubeFaceToEquirect(face, x, y, cubeSize);

        // Sample from panorama with bilinear interpolation
        // Clamp v to valid range to prevent out of bounds
        const clampedV = Math.max(0, Math.min(1, v));

        // Calculate pixel coordinates in panorama
        const px = u * width;
        const py = clampedV * height;

        // Get integer pixel coordinates with wrapping for x
        const x0 = Math.floor(px) % width;
        const y0 = Math.floor(py);
        const x1 = (x0 + 1) % width; // Wrap horizontally
        const y1 = Math.min(y0 + 1, height - 1);

        // Calculate fractional parts for interpolation
        const fx = px - Math.floor(px);
        const fy = py - y0;

        // Clamp y coordinates
        const cy0 = Math.max(0, Math.min(height - 1, y0));
        const cy1 = Math.max(0, Math.min(height - 1, y1));

        // Bilinear interpolation for each channel
        for (let c = 0; c < channels; c++) {
          const idx00 = (cy0 * width + x0) * channels + c;
          const idx10 = (cy0 * width + x1) * channels + c;
          const idx01 = (cy1 * width + x0) * channels + c;
          const idx11 = (cy1 * width + x1) * channels + c;

          const v00 = panoramaPixels[idx00] || 0;
          const v10 = panoramaPixels[idx10] || 0;
          const v01 = panoramaPixels[idx01] || 0;
          const v11 = panoramaPixels[idx11] || 0;

          const v0 = v00 * (1 - fx) + v10 * fx;
          const v1 = v01 * (1 - fx) + v11 * fx;
          const value = Math.round(v0 * (1 - fy) + v1 * fy);

          facePixels[(y * cubeSize + x) * channels + c] = value;
        }
      }
    }

    // Store raw pixel data (no JPEG compression yet)
    faces.set(face, {
      pixels: facePixels,
      width: cubeSize,
      height: cubeSize,
      channels
    });
  }

  return faces;
}

/**
 * Generate cube map faces with proper spherical projection
 * Legacy function that returns JPEG buffers for backward compatibility
 */
export async function generateCubeMapFromPanorama(
  panoramaBuffer: Buffer,
  cubeSize: number = 2048
): Promise<Map<CubeFace, Buffer>> {
  const rawFaces = await generateCubeMapFromPanoramaRaw(panoramaBuffer, cubeSize);
  const faces = new Map<CubeFace, Buffer>();

  for (const [face, rawData] of rawFaces) {
    const faceBuffer = await sharp(rawData.pixels, {
      raw: {
        width: rawData.width,
        height: rawData.height,
        channels: rawData.channels
      }
    })
    .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
    .toBuffer();

    faces.set(face, faceBuffer);
  }

  return faces;
}

/**
 * Generate multi-resolution cube map tiles
 * Each level has its own tile size for optimal quality
 * Uses raw pixel data throughout to avoid quality loss from double JPEG compression
 */
export async function generateCubeMapTiles(
  panoramaBuffer: Buffer,
  sceneId: string,
  baseTileSize: number = 512,
  numLevels: number = 3 // Only generate levels 1 and 2 (level 0 is skipped)
): Promise<{
  tiles: Array<CubeTile & { buffer: Buffer }>;
  manifest: CubeMapManifest;
}> {
  // Base resolution matches highest level (level 2 = 2048x2048)
  const cubeSize = 2048;
  const tiles: Array<CubeTile & { buffer: Buffer }> = [];

  // Generate cube faces from panorama at full resolution - RAW pixels (no JPEG compression)
  const cubeFacesRaw = await generateCubeMapFromPanoramaRaw(panoramaBuffer, cubeSize);

  // Generate preview
  const previewBuffer = await sharp(panoramaBuffer)
    .resize(512, 256, { fit: 'fill' })
    .jpeg({ quality: 90 })
    .toBuffer();

  tiles.push({
    face: CubeFace.FRONT,
    level: -1,
    x: 0,
    y: 0,
    buffer: previewBuffer,
    key: 'preview.jpg'
  });

  // Generate tiles for each resolution level
  const levels = [];

  // Define tile sizes and resolutions for each level
  // All levels use 512px tiles for faster loading
  // Level 0 is skipped (not generated)
  const levelConfigs = [
    { resolution: 512, tileSize: 512 },    // Level 0: SKIPPED (not generated)
    { resolution: 1024, tileSize: 512 },   // Level 1: 2x2 tiles of 512x512
    { resolution: 2048, tileSize: 512 },   // Level 2: 4x4 tiles of 512x512
    { resolution: 4096, tileSize: 512 },   // Level 3: 8x8 tiles of 512x512
  ];

  for (let level = 1; level < numLevels; level++) {
    // Get configuration for this level
    const config = levelConfigs[Math.min(level, levelConfigs.length - 1)];
    const levelSize = config.resolution;
    const levelTileSize = config.tileSize;
    const tilesPerSide = Math.ceil(levelSize / levelTileSize);

    levels.push({
      level,
      size: levelSize,
      tileSize: levelTileSize,
      tiles: tilesPerSide
    });

    console.log(`Level ${level}: ${levelSize}x${levelSize} per face, ${tilesPerSide}x${tilesPerSide} tiles of ${levelTileSize}x${levelTileSize}`);

    // Generate tiles for each face at this level
    for (const [face, rawFaceData] of cubeFacesRaw) {
      // Resize raw face data for this level (still raw, no JPEG compression)
      const resizedRaw = await sharp(rawFaceData.pixels, {
        raw: {
          width: rawFaceData.width,
          height: rawFaceData.height,
          channels: rawFaceData.channels
        }
      })
        .resize(levelSize, levelSize, {
          kernel: sharp.kernel.lanczos3
        })
        .raw()
        .toBuffer();

      // Generate tiles
      for (let y = 0; y < tilesPerSide; y++) {
        for (let x = 0; x < tilesPerSide; x++) {
          const left = x * levelTileSize;
          const top = y * levelTileSize;
          const width = Math.min(levelTileSize, levelSize - left);
          const height = Math.min(levelTileSize, levelSize - top);

          // Extract tile from raw data and compress ONLY ONCE to JPEG
          const tileBuffer = await sharp(resizedRaw, {
            raw: {
              width: levelSize,
              height: levelSize,
              channels: rawFaceData.channels
            }
          })
            .extract({ left, top, width, height })
            .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
            .toBuffer();

          tiles.push({
            face,
            level,
            x,
            y,
            buffer: tileBuffer,
            key: `${face}_l${level}_${x}_${y}.jpg`
          });
        }
      }
    }
  }
  
  // Create manifest with variable tile sizes
  const manifest: CubeMapManifest = {
    type: 'cubemap',
    cubeSize,
    tileSize: baseTileSize, // Keep for backward compatibility
    levels,
    faces: Object.values(CubeFace),
    preview: `${R2_PUBLIC_URL}/scenes/${sceneId}/tiles/preview.jpg`
  };
  
  // Debug logging
  console.log('Generated manifest levels:', JSON.stringify(levels, null, 2));
  console.log('Total tiles generated:', tiles.length);
  
  return { tiles, manifest };
}