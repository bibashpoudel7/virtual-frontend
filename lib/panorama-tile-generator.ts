import sharp from 'sharp';

const R2_PUBLIC_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || 'https://test.thenimto.com';

export interface TileInfo {
  level: number;
  row: number;
  col: number;
  key: string;
  buffer?: Buffer;
  url?: string;
}

export interface PanoramaManifest {
  type: 'multires';
  originalWidth: number;
  originalHeight: number;
  tileSize: number;
  levels: {
    level: number;
    width: number;
    height: number;
    tilesX: number;
    tilesY: number;
  }[];
  tiles: TileInfo[];
  preview?: string;
  format: string;
}

/**
 * Generate optimized multi-resolution tiles for 360 panorama viewing
 * Similar to how Matterport and Google Street View handle panoramas
 */
export async function generateOptimizedPanoramaTiles(
  buffer: Buffer,
  sceneId: string,
  maxSize: number = 8192,
  tileSize: number = 512
): Promise<{ tiles: TileInfo[]; manifest: PanoramaManifest }> {
  // Get image metadata
  const metadata = await sharp(buffer).metadata();
  const originalWidth = metadata.width || 4096;
  const originalHeight = metadata.height || 2048;
  
  console.log(`Generating optimized tiles for ${originalWidth}x${originalHeight} panorama`);
  
  // Ensure proper 2:1 aspect ratio for equirectangular projection
  let processedWidth = originalWidth;
  let processedHeight = originalHeight;
  
  if (Math.abs(processedWidth / processedHeight - 2) > 0.1) {
    console.log('Adjusting aspect ratio to 2:1 for proper spherical mapping');
    processedWidth = Math.min(maxSize, originalWidth);
    processedHeight = processedWidth / 2;
    
    buffer = await sharp(buffer)
      .resize(processedWidth, processedHeight, {
        fit: 'fill',
        kernel: sharp.kernel.lanczos3
      })
      .toBuffer();
  }
  
  const tiles: TileInfo[] = [];
  
  // Generate preview (low-res version for quick loading)
  const preview = await sharp(buffer)
    .resize(1024, 512, {
      fit: 'fill',
      kernel: sharp.kernel.lanczos3
    })
    .jpeg({ quality: 80, progressive: true })
    .toBuffer();
  
  tiles.push({
    level: -1,
    row: 0,
    col: 0,
    key: 'preview.jpg',
    buffer: preview
  });
  
  // Calculate pyramid levels
  // Level 0: Lowest resolution (loads first)
  // Level N: Highest resolution (loads as user zooms in)
  const levels = [];
  const numLevels = Math.ceil(Math.log2(processedWidth / 1024)) + 1;
  
  for (let level = 0; level < Math.min(numLevels, 4); level++) {
    const scale = Math.pow(2, level);
    const levelWidth = Math.min(processedWidth, 1024 * scale);
    const levelHeight = levelWidth / 2;
    
    levels.push({
      level,
      width: levelWidth,
      height: levelHeight,
      tilesX: Math.ceil(levelWidth / tileSize),
      tilesY: Math.ceil(levelHeight / tileSize)
    });
  }
  
  console.log('Generating pyramid levels:', levels);
  
  // Generate tiles for each level
  for (const levelInfo of levels) {
    const { level, width, height, tilesX, tilesY } = levelInfo;
    
    console.log(`Level ${level}: ${width}x${height}, ${tilesX}x${tilesY} tiles`);
    
    // Resize image for this level
    const levelBuffer = await sharp(buffer)
      .resize(width, height, {
        kernel: sharp.kernel.lanczos3,
        withoutEnlargement: true
      })
      .toBuffer();
    
    // Generate tiles
    for (let row = 0; row < tilesY; row++) {
      for (let col = 0; col < tilesX; col++) {
        const x = col * tileSize;
        const y = row * tileSize;
        const w = Math.min(tileSize, width - x);
        const h = Math.min(tileSize, height - y);
        
        // Extract tile with proper handling of edges
        const tileBuffer = await sharp(levelBuffer)
          .extract({
            left: x,
            top: y,
            width: w,
            height: h
          })
          .jpeg({
            quality: 95,
            progressive: false,
            chromaSubsampling: '4:4:4'
          })
          .toBuffer();
        
        tiles.push({
          level,
          row,
          col,
          key: `l${level}_${row}_${col}.jpg`,
          buffer: tileBuffer
        });
      }
    }
  }
  
  // Create manifest
  const manifest: PanoramaManifest = {
    type: 'multires',
    originalWidth: processedWidth,
    originalHeight: processedHeight,
    tileSize,
    levels,
    tiles: tiles.map(t => ({
      level: t.level,
      row: t.row,
      col: t.col,
      key: t.key,
      url: `${R2_PUBLIC_URL}/scenes/${sceneId}/tiles/${t.key}`
    })),
    preview: `${R2_PUBLIC_URL}/scenes/${sceneId}/tiles/preview.jpg`,
    format: 'jpg'
  };
  
  return { tiles, manifest };
}

/**
 * Validate that a panorama has correct dimensions and format
 */
export async function validatePanorama(buffer: Buffer): Promise<{
  valid: boolean;
  width: number;
  height: number;
  aspectRatio: number;
  message?: string;
}> {
  const metadata = await sharp(buffer).metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;
  const aspectRatio = width / height;
  
  if (width < 2048) {
    return {
      valid: false,
      width,
      height,
      aspectRatio,
      message: 'Image width should be at least 2048px for good quality'
    };
  }
  
  if (Math.abs(aspectRatio - 2) > 0.1) {
    return {
      valid: false,
      width,
      height,
      aspectRatio,
      message: 'Image should have 2:1 aspect ratio for 360° panoramas'
    };
  }
  
  return {
    valid: true,
    width,
    height,
    aspectRatio
  };
}