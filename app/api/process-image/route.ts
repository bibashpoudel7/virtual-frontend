import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { generateCubeMapTiles } from '@/lib/cubemap-tiles';

// frontend/app/api/process-image/route.ts
interface TileInfo {
  level: number;
  row: number;
  col: number;
  key: string;
  buffer: Buffer;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const operation = formData.get('operation') as string;
    const sceneId = formData.get('sceneId') as string;
    
    if (operation === 'process') {
      // Process the main image
      const file = formData.get('file') as File;
      if (!file) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 });
      }
      
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      
      // Get metadata
      const metadata = await sharp(buffer).metadata();
      console.log('Metadata:', metadata);
      const originalWidth = metadata.width || 4096;
      const originalHeight = metadata.height || 2048;
      
      console.log(`Processing image: ${originalWidth}x${originalHeight}`);
      
      // Process for optimal 360 panorama (preserve high resolution)
      let targetWidth = originalWidth;
      let targetHeight = originalHeight;
      
      // Ensure 2:1 aspect ratio
      if (targetWidth / targetHeight !== 2) {
        targetWidth = Math.min(16384, targetWidth); // Support up to 16K
        targetHeight = targetWidth / 2;
      }
      
      const processedImage = await sharp(buffer)
        .resize(targetWidth, targetHeight, {
          fit: 'fill',
          position: 'center',
          kernel: sharp.kernel.lanczos3,
          withoutEnlargement: true
        })
        .jpeg({
          quality: 95,
          progressive: true,
          mozjpeg: true,
          chromaSubsampling: '4:4:4'
        })
        .toBuffer();
      
      // Return as base64 for frontend
      const base64 = processedImage.toString('base64');
      
      return NextResponse.json({
        success: true,
        data: base64,
        size: processedImage.length,
        dimensions: `${targetWidth}x${targetHeight}`,
        originalDimensions: `${originalWidth}x${originalHeight}`
      });
      
    } else if (operation === 'tiles') {
      // Get the file from formData (AdvancedSceneUploader sends it as 'file')
      const file = formData.get('file') as File;
      if (!file) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 });
      }
      
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      
      // Get image metadata
      const metadata = await sharp(buffer).metadata();
      console.log({metadata})
      const originalWidth = metadata.width || 4096;
      const originalHeight = metadata.height || 2048;
      
      console.log(`\n=== Cube Map Tile Generation [${new Date().toISOString()}] ===`);
      console.log(`Image dimensions: ${originalWidth}x${originalHeight}`);
      
      // Generate cube map tiles
      const { tiles, manifest } = await generateCubeMapTiles(buffer, sceneId);
      
      console.log(`Total tiles generated: ${tiles.length}`);
      
      // Convert tiles to the format expected by AdvancedSceneUploader
      const tilesObject: Record<string, string> = {};
      tiles.forEach(tile => {
        tilesObject[tile.key] = tile.buffer.toString('base64');
      });
      
      return NextResponse.json({
        success: true,
        tiles: tilesObject,
        count: tiles.length,
        manifest: manifest
      });
    }
    
    return NextResponse.json({ error: 'Invalid operation' }, { status: 400 });
    
  } catch (error) {
    console.error('Process image error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Processing failed' },
      { status: 500 }
    );
  }
}

async function generateAdvancedTiles(
  buffer: Buffer,
  originalWidth: number,
  originalHeight: number,
  sceneId: string
): Promise<TileInfo[]> {
  // Dynamic tile size based on image size
  // Larger images need larger tiles to avoid too many tiles
  let tileSize = 512;
  if (originalWidth > 8192) {
    tileSize = 1024; // Use 1024x1024 tiles for very large images
  }
  console.log(`Using tile size: ${tileSize}x${tileSize}`);
  
  const tiles: TileInfo[] = [];
  
  // Generate preview first (fast)
  // Apply nadir patch if needed (fill bottom area)
  const preview = await sharp(buffer)
    .resize(512, 256, { fit: 'fill' })
    .jpeg({ quality: 70 })
    .toBuffer();
  
  tiles.push({
    level: -1,
    row: 0,
    col: 0,
    key: 'preview.jpg',
    buffer: preview
  });
  
  // Dynamic 3-level pyramid based on original image size
  // Ensure proper 2:1 aspect ratio for 360 panoramas
  const baseWidth = Math.min(originalWidth, 12288); // Cap at 12K max
  const baseHeight = baseWidth / 2;
  
  // Calculate scale factors for each level
  const levels = [
    {
      level: 0,
      width: Math.round(baseWidth / 4), // Lowest res: 1/4 of base
      height: Math.round(baseHeight / 4),
      scale: 4
    },
    {
      level: 1,
      width: Math.round(baseWidth / 2), // Medium res: 1/2 of base
      height: Math.round(baseHeight / 2),
      scale: 2
    },
    {
      level: 2,
      width: baseWidth, // Full res
      height: baseHeight,
      scale: 1
    }
  ];
  
  console.log(`Image ${originalWidth}x${originalHeight} → Levels:`, levels);
  
  console.log(`\\nGenerating ${levels.length} resolution levels for optimal 360° panorama:`);
  
  // Generate tiles for each level
  for (const levelConfig of levels) {
    const { level, width: levelWidth, height: levelHeight, scale } = levelConfig;
    
    const cols = Math.ceil(levelWidth / tileSize);
    const rows = Math.ceil(levelHeight / tileSize);
    const totalTiles = cols * rows;
    
    console.log(`  Level ${level}: ${levelWidth}x${levelHeight} px, ${cols}x${rows} tiles (${tileSize}x${tileSize} each) = ${totalTiles} tiles total`);
    
    // Resize image for this level
    // For highest level, use original if dimensions match
    let levelImage;
    if (level === 2 && levelWidth >= originalWidth * 0.9) {
      // Use original for highest level to preserve quality
      levelImage = buffer;
      console.log(`    Using original image for level ${level}`);
    } else {
      // Resize for lower levels
      levelImage = await sharp(buffer)
        .resize(levelWidth, levelHeight, {
          fit: 'fill',
          kernel: sharp.kernel.lanczos3, // High quality resizing
          withoutEnlargement: true // Don't enlarge beyond original
        })
        .jpeg({ 
          quality: 100, // Maximum quality for resized levels
          chromaSubsampling: '4:4:4'
        })
        .toBuffer();
    }
    
    console.log(`    Resized to ${levelWidth}x${levelHeight} for level ${level}`);
    
    // Generate tiles for this level in parallel batches
    const tilePromises = [];
    
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = col * tileSize;
        const y = row * tileSize;
        const w = Math.min(tileSize, levelWidth - x);
        const h = Math.min(tileSize, levelHeight - y);
        
        // Create promise for each tile
        const tilePromise = (async () => {
          let tileBuffer;
          if (w === tileSize && h === tileSize) {
            // Full tile
            tileBuffer = await sharp(levelImage)
              .extract({
                left: x,
                top: y,
                width: w,
                height: h
              })
              .jpeg({
                quality: 98, // Very high quality to minimize artifacts
                progressive: false, // Disable progressive for better color accuracy
                mozjpeg: false, // Disable mozjpeg which can cause color shifts
                chromaSubsampling: '4:4:4', // Best color quality
                force: true
              })
              .toBuffer();
          } else {
            // Edge tile - only extract what's available, no padding
            // This prevents white/black borders on edge tiles
            console.log(`Edge tile at [${row},${col}]: ${w}x${h}`);
            
            // Just extract the partial tile without resizing
            // The viewer will handle partial tiles correctly
            tileBuffer = await sharp(levelImage)
              .extract({
                left: x,
                top: y,
                width: w,
                height: h
              })
              .jpeg({
                quality: 98, // Very high quality to minimize artifacts
                progressive: false, // Disable progressive for better color accuracy
                mozjpeg: false, // Disable mozjpeg which can cause color shifts
                chromaSubsampling: '4:4:4', // Best color quality
                force: true
              })
              .toBuffer();
          }
          
          return {
            level,
            row,
            col,
            key: `l${level}_${row}_${col}.jpg`,
            buffer: tileBuffer
          };
        })();
        
        tilePromises.push(tilePromise);
      }
    }
    
    // Process tiles in parallel (batch of 10 at a time to avoid memory issues)
    const batchSize = 10;
    for (let i = 0; i < tilePromises.length; i += batchSize) {
      const batch = tilePromises.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch);
      tiles.push(...batchResults);
    }
    
    console.log(`    Generated ${tilePromises.length} tiles for level ${level}`);
  }
  
  // Log summary
  const tileCounts = new Map<number, number>();
  tiles.forEach(tile => {
    if (tile.level >= 0) {
      tileCounts.set(tile.level, (tileCounts.get(tile.level) || 0) + 1);
    }
  });
  
  console.log('\nTile generation summary:');
  tileCounts.forEach((count, level) => {
    console.log(`  Level ${level}: ${count} tiles`);
  });
  console.log(`  Preview: 1 file`);
  console.log(`  Total: ${tiles.length} files`);
  
  return tiles;
}

export const runtime = 'nodejs';
export const maxDuration = 60;