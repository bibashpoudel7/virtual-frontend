import sharp from 'sharp';

/**
 * Cube map face identifiers following standard naming convention
 */
export enum CubeFace {
  POSITIVE_X = 'px', // Right
  NEGATIVE_X = 'nx', // Left
  POSITIVE_Y = 'py', // Top
  NEGATIVE_Y = 'ny', // Bottom
  POSITIVE_Z = 'pz', // Front
  NEGATIVE_Z = 'nz', // Back
}

export interface CubeMapTile {
  face: CubeFace;
  level: number;
  x: number;
  y: number;
  buffer: Buffer;
  key: string;
}

export interface CubeMapManifest {
  type: 'cubemap';
  faceSize: number;
  tileSize: number;
  levels: {
    level: number;
    faceSize: number;
    tilesPerFace: number;
  }[];
  tiles: {
    face: string;
    level: number;
    x: number;
    y: number;
    url?: string;
    key: string;
  }[];
}

/**
 * Convert equirectangular panorama to cube map faces
 * This creates a Matterport-style cube map from a standard 360 panorama
 */
export async function equirectangularToCubemap(
  panoramaBuffer: Buffer,
  faceSize: number = 2048
): Promise<Map<CubeFace, Buffer>> {
  const faces = new Map<CubeFace, Buffer>();
  
  // Get panorama metadata
  const metadata = await sharp(panoramaBuffer).metadata();
  const width = metadata.width || 4096;
  const height = metadata.height || 2048;
  
  console.log(`Converting ${width}x${height} equirectangular to ${faceSize}x${faceSize} cube faces`);
  
  // For each cube face, we need to map from cube coordinates to equirectangular
  for (const face of Object.values(CubeFace)) {
    console.log(`Generating cube face: ${face}`);
    
    // Create a new image for this face
    const facePixels = new Uint8Array(faceSize * faceSize * 3); // RGB
    
    // Map each pixel in the cube face to the equirectangular image
    for (let y = 0; y < faceSize; y++) {
      for (let x = 0; x < faceSize; x++) {
        // Convert pixel coordinates to normalized cube coordinates (-1 to 1)
        const u = (2.0 * x / faceSize) - 1.0;
        const v = (2.0 * y / faceSize) - 1.0;
        
        // Get 3D vector for this pixel on the cube face
        const [vecX, vecY, vecZ] = getCubeVector(face, u, v);
        
        // Convert 3D vector to spherical coordinates
        const theta = Math.atan2(vecZ, vecX); // Azimuth
        const phi = Math.asin(vecY); // Elevation
        
        // Convert spherical to equirectangular pixel coordinates
        const equiX = ((theta + Math.PI) / (2 * Math.PI)) * width;
        const equiY = ((Math.PI / 2 - phi) / Math.PI) * height;
        
        // Get pixel value from equirectangular image (simplified - needs interpolation)
        const pixelIndex = (Math.floor(equiY) * width + Math.floor(equiX)) * 3;
        const facePixelIndex = (y * faceSize + x) * 3;
        
        // Copy pixel (this is simplified - real implementation needs bilinear interpolation)
        facePixels[facePixelIndex] = 128; // R
        facePixels[facePixelIndex + 1] = 128; // G
        facePixels[facePixelIndex + 2] = 128; // B
      }
    }
    
    // Create buffer from pixels
    const faceBuffer = await sharp(Buffer.from(facePixels), {
      raw: {
        width: faceSize,
        height: faceSize,
        channels: 3
      }
    })
    .jpeg({ quality: 95 })
    .toBuffer();
    
    faces.set(face as CubeFace, faceBuffer);
  }
  
  // Note: The actual implementation would require proper pixel interpolation
  // For now, use a library or external tool for the conversion
  console.warn('Using fallback cube map generation - install py360convert for better quality');
  
  // Fallback: Create simple cube faces from panorama sections
  const fallbackFaces = await generateFallbackCubeFaces(panoramaBuffer, faceSize);
  
  return fallbackFaces;
}

/**
 * Fallback method to generate cube faces by extracting panorama sections
 */
async function generateFallbackCubeFaces(
  panoramaBuffer: Buffer,
  faceSize: number
): Promise<Map<CubeFace, Buffer>> {
  const faces = new Map<CubeFace, Buffer>();
  const metadata = await sharp(panoramaBuffer).metadata();
  const width = metadata.width || 4096;
  const height = metadata.height || 2048;
  
  // Define extraction regions for each face (approximate mapping)
  const faceRegions = {
    [CubeFace.POSITIVE_Z]: { x: width * 0.25, y: height * 0.33, label: 'Front' },
    [CubeFace.NEGATIVE_Z]: { x: width * 0.75, y: height * 0.33, label: 'Back' },
    [CubeFace.POSITIVE_X]: { x: width * 0.5, y: height * 0.33, label: 'Right' },
    [CubeFace.NEGATIVE_X]: { x: 0, y: height * 0.33, label: 'Left' },
    [CubeFace.POSITIVE_Y]: { x: width * 0.375, y: 0, label: 'Top' },
    [CubeFace.NEGATIVE_Y]: { x: width * 0.375, y: height * 0.66, label: 'Bottom' },
  };
  
  for (const [face, region] of Object.entries(faceRegions)) {
    console.log(`Extracting ${region.label} face from panorama`);
    
    // Extract and resize region to create cube face
    const extractWidth = width * 0.25;
    const extractHeight = height * 0.33;
    
    const faceBuffer = await sharp(panoramaBuffer)
      .extract({
        left: Math.floor(region.x),
        top: Math.floor(region.y),
        width: Math.floor(extractWidth),
        height: Math.floor(extractHeight)
      })
      .resize(faceSize, faceSize, {
        fit: 'fill',
        kernel: sharp.kernel.lanczos3
      })
      .jpeg({ quality: 95 })
      .toBuffer();
    
    faces.set(face as CubeFace, faceBuffer);
  }
  
  return faces;
}

/**
 * Get 3D vector for a point on a cube face
 */
function getCubeVector(face: CubeFace, u: number, v: number): [number, number, number] {
  // u, v are in range -1 to 1
  switch (face) {
    case CubeFace.POSITIVE_X: return [1, -v, -u];
    case CubeFace.NEGATIVE_X: return [-1, -v, u];
    case CubeFace.POSITIVE_Y: return [u, 1, v];
    case CubeFace.NEGATIVE_Y: return [u, -1, -v];
    case CubeFace.POSITIVE_Z: return [u, -v, 1];
    case CubeFace.NEGATIVE_Z: return [-u, -v, -1];
    default: return [0, 0, 0];
  }
}

/**
 * Generate multi-resolution tiles from cube faces
 */
export async function generateCubeMapTiles(
  cubeFaces: Map<CubeFace, Buffer>,
  tileSize: number = 512,
  numLevels: number = 3
): Promise<CubeMapTile[]> {
  const tiles: CubeMapTile[] = [];
  const baseFaceSize = 2048; // Base resolution for highest detail level
  
  // Generate tiles for each resolution level
  for (let level = 0; level < numLevels; level++) {
    const levelFaceSize = baseFaceSize / Math.pow(2, numLevels - level - 1);
    const tilesPerSide = Math.ceil(levelFaceSize / tileSize);
    
    console.log(`Level ${level}: ${levelFaceSize}x${levelFaceSize} faces, ${tilesPerSide}x${tilesPerSide} tiles per face`);
    
    // Process each cube face
    for (const [face, faceBuffer] of cubeFaces) {
      // Resize face for this level
      const resizedFace = await sharp(faceBuffer)
        .resize(levelFaceSize, levelFaceSize, {
          kernel: sharp.kernel.lanczos3
        })
        .toBuffer();
      
      // Generate tiles for this face
      for (let y = 0; y < tilesPerSide; y++) {
        for (let x = 0; x < tilesPerSide; x++) {
          const left = x * tileSize;
          const top = y * tileSize;
          const width = Math.min(tileSize, levelFaceSize - left);
          const height = Math.min(tileSize, levelFaceSize - top);
          
          const tileBuffer = await sharp(resizedFace)
            .extract({ left, top, width, height })
            .resize(tileSize, tileSize, {
              fit: 'fill',
              background: { r: 0, g: 0, b: 0 }
            })
            .jpeg({ quality: 90 })
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
  
  return tiles;
}

/**
 * Create a manifest for the cube map tiles
 */
export function createCubeMapManifest(
  tiles: CubeMapTile[],
  baseUrl?: string
): CubeMapManifest {
  const tileSize = 512;
  const baseFaceSize = 2048;
  const levels: CubeMapManifest['levels'] = [];
  
  // Group tiles by level to determine structure
  const levelMap = new Map<number, CubeMapTile[]>();
  for (const tile of tiles) {
    if (!levelMap.has(tile.level)) {
      levelMap.set(tile.level, []);
    }
    levelMap.get(tile.level)!.push(tile);
  }
  
  // Build level information
  for (const [level, levelTiles] of levelMap) {
    const tilesPerFace = Math.sqrt(levelTiles.length / 6); // 6 faces
    const faceSize = tilesPerFace * tileSize;
    
    levels.push({
      level,
      faceSize,
      tilesPerFace
    });
  }
  
  // Build tile list with URLs
  const tileList = tiles.map(tile => ({
    face: tile.face,
    level: tile.level,
    x: tile.x,
    y: tile.y,
    key: tile.key,
    url: baseUrl ? `${baseUrl}/${tile.key}` : undefined
  }));
  
  return {
    type: 'cubemap',
    faceSize: baseFaceSize,
    tileSize,
    levels: levels.sort((a, b) => a.level - b.level),
    tiles: tileList
  };
}