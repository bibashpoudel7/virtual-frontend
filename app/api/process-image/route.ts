import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { generateCubeMapTiles } from '@/lib/cubemap-tiles';
import { getR2Client, R2_BUCKET_NAME, R2_PUBLIC_URL } from '@/lib/r2-client';
import { PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';

// Job status tracking across requests
export interface UploadJob {
  sceneId: string;
  status: 'idle' | 'processing' | 'complete' | 'error';
  stage: 'select' | 'process' | 'tiles' | 'upload' | 'save' | 'complete';
  progress: number;
  message?: string;
  data?: {
    sceneId: string;
    mainImageUrl: string;
    tilesManifest: any;
  };
  error?: string;
  startedAt?: number;
  updatedAt?: number;
}

declare global {
  var __sceneUploadJobs: Map<string, UploadJob> | undefined;
}

const jobs: Map<string, UploadJob> = globalThis.__sceneUploadJobs ?? new Map<string, UploadJob>();
globalThis.__sceneUploadJobs = jobs;

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const sceneId = url.searchParams.get('sceneId');

  if (!sceneId) {
    return NextResponse.json({ error: 'sceneId is required' }, { status: 400 });
  }

  const job = jobs.get(sceneId);
  if (job) {
    return NextResponse.json(job);
  }

  // Fallback: Check if scene already has images saved in database
  try {
    const backendUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.tour.thenimto.com/api/';
    const separator = backendUrl.endsWith('/') ? '' : '/';
    const authHeader = request.headers.get('authorization');
    const resp = await fetch(`${backendUrl}${separator}scenes/${sceneId}`, {
      headers: { ...(authHeader ? { Authorization: authHeader } : {}) },
      cache: 'no-store'
    });

    if (resp.ok) {
      const scene = await resp.json();
      if (scene && scene.src_original_url) {
        let manifest = null;
        if (scene.tiles_manifest) {
          try {
            manifest = typeof scene.tiles_manifest === 'string'
              ? JSON.parse(scene.tiles_manifest)
              : scene.tiles_manifest;
          } catch {
            manifest = null;
          }
        }

        const completedJob: UploadJob = {
          sceneId,
          status: 'complete',
          stage: 'complete',
          progress: 100,
          data: {
            sceneId,
            mainImageUrl: scene.src_original_url,
            tilesManifest: manifest
          }
        };
        return NextResponse.json(completedJob);
      }
    }
  } catch (err) {
    // Ignore fetch error
  }

  return NextResponse.json({
    sceneId,
    status: 'idle',
    stage: 'select',
    progress: 0
  });
}

export async function POST(request: NextRequest) {
  let sceneId = '';
  try {
    const formData = await request.formData();
    const operation = (formData.get('operation') as string) || 'pipeline';
    sceneId = (formData.get('sceneId') as string) || '';
    const token = (formData.get('token') as string) || request.headers.get('authorization') || '';

    // Legacy operation: process only (single base64 return)
    if (operation === 'process') {
      const file = formData.get('file') as File;
      if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const metadata = await sharp(buffer).metadata();
      const originalWidth = metadata.width || 4096;
      const originalHeight = metadata.height || 2048;
      let targetWidth = originalWidth;
      let targetHeight = originalHeight;
      if (targetWidth > 8192) {
        targetWidth = 8192;
        targetHeight = 4096;
      } else if (targetWidth / targetHeight !== 2) {
        targetWidth = Math.min(8192, targetWidth);
        targetHeight = Math.round(targetWidth / 2);
      }
      const processedImage = await sharp(buffer)
        .resize(targetWidth, targetHeight, {
          fit: 'fill',
          position: 'center',
          kernel: sharp.kernel.lanczos3,
          withoutEnlargement: true
        })
        .jpeg({ quality: 85, progressive: true, mozjpeg: true, chromaSubsampling: '4:2:0' })
        .toBuffer();

      return NextResponse.json({
        success: true,
        data: processedImage.toString('base64'),
        size: processedImage.length,
        dimensions: `${targetWidth}x${targetHeight}`
      });
    }

    // Legacy operation: tiles only
    if (operation === 'tiles') {
      const file = formData.get('file') as File;
      if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const { tiles, manifest } = await generateCubeMapTiles(buffer, sceneId);
      const tilesObject: Record<string, string> = {};
      tiles.forEach(tile => {
        tilesObject[tile.key] = tile.buffer.toString('base64');
      });
      return NextResponse.json({
        success: true,
        tiles: tilesObject,
        count: tiles.length,
        manifest
      });
    }

    // Full automatic pipeline (Process -> Generate Tiles -> Upload R2 -> Save DB)
    const file = formData.get('file') as File;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (!sceneId) {
      return NextResponse.json({ error: 'sceneId is required' }, { status: 400 });
    }

    const s3Client = getR2Client();
    if (!s3Client) {
      return NextResponse.json({ error: 'Cloudflare R2 storage is not configured' }, { status: 500 });
    }

    // Initialize job state
    const currentJob: UploadJob = {
      sceneId,
      status: 'processing',
      stage: 'process',
      progress: 10,
      message: 'Processing 360° image...',
      startedAt: Date.now(),
      updatedAt: Date.now()
    };
    jobs.set(sceneId, currentJob);

    // Read upload into buffer
    const arrayBuffer = await file.arrayBuffer();
    const rawBuffer = Buffer.from(arrayBuffer);

    // 1. Process 360 panorama image
    currentJob.stage = 'process';
    currentJob.progress = 20;
    currentJob.message = 'Optimizing high-resolution panorama...';
    currentJob.updatedAt = Date.now();

    const metadata = await sharp(rawBuffer).metadata();
    const originalWidth = metadata.width || 4096;
    const originalHeight = metadata.height || 2048;
    let targetWidth = originalWidth;
    let targetHeight = originalHeight;
    if (targetWidth > 8192) {
      targetWidth = 8192;
      targetHeight = 4096;
    } else if (targetWidth / targetHeight !== 2) {
      targetWidth = Math.min(8192, targetWidth);
      targetHeight = Math.round(targetWidth / 2);
    }

    const processedBuffer = await sharp(rawBuffer)
      .resize(targetWidth, targetHeight, {
        fit: 'fill',
        position: 'center',
        withoutEnlargement: true
      })
      .jpeg({ quality: 85, progressive: true })
      .toBuffer();

    // 2. Generate multi-resolution cubemap tiles
    currentJob.stage = 'tiles';
    currentJob.progress = 40;
    currentJob.message = 'Generating multi-resolution cubemap tiles...';
    currentJob.updatedAt = Date.now();

    const { tiles, manifest } = await generateCubeMapTiles(processedBuffer, sceneId);

    // 3. Upload main image and tiles directly to R2
    currentJob.stage = 'upload';
    currentJob.progress = 60;
    currentJob.message = 'Uploading tiles to cloud storage...';
    currentJob.updatedAt = Date.now();

    // If replacing an existing image, delete old panorama files from R2 first
    try {
      const oldPanos = await s3Client.send(new ListObjectsV2Command({
        Bucket: R2_BUCKET_NAME,
        Prefix: `scenes/${sceneId}/pano_`
      }));
      if (oldPanos.Contents && oldPanos.Contents.length > 0) {
        const toDelete = oldPanos.Contents
          .filter(item => !!item.Key)
          .map(item => ({ Key: item.Key! }));
        if (toDelete.length > 0) {
          await s3Client.send(new DeleteObjectsCommand({
            Bucket: R2_BUCKET_NAME,
            Delete: { Objects: toDelete, Quiet: true }
          }));
        }
      }
    } catch (cleanupErr) {
      console.warn('Could not clean up previous panorama files from R2:', cleanupErr);
    }

    const timestamp = Date.now();
    const mainKey = `scenes/${sceneId}/pano_${timestamp}.jpg`;
    const mainImageUrl = `${R2_PUBLIC_URL}/${mainKey}`;

    // Upload main panorama
    await s3Client.send(new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: mainKey,
      Body: processedBuffer,
      ContentType: 'image/jpeg',
      CacheControl: 'public, max-age=31536000'
    }));

    // Upload all tiles in concurrent batches (30 parallel uploads per batch)
    const batchSize = 30;
    for (let i = 0; i < tiles.length; i += batchSize) {
      const batch = tiles.slice(i, i + batchSize);
      await Promise.all(batch.map(tile => {
        const tileKey = tile.key === 'preview.jpg'
          ? `scenes/${sceneId}/tiles/preview.jpg`
          : `scenes/${sceneId}/tiles/${tile.key}`;

        return s3Client.send(new PutObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: tileKey,
          Body: tile.buffer,
          ContentType: 'image/jpeg',
          CacheControl: 'public, max-age=31536000'
        }));
      }));

      const progressPercent = 60 + Math.round(((i + batch.length) / tiles.length) * 25);
      currentJob.progress = progressPercent;
      currentJob.message = `Uploaded ${Math.min(i + batch.length, tiles.length)} of ${tiles.length} tiles...`;
      currentJob.updatedAt = Date.now();
    }

    // Assemble final manifest
    const tilesWithUrls = tiles
      .filter(t => t.key !== 'preview.jpg')
      .map(t => ({
        face: t.face,
        level: t.level,
        x: t.x,
        y: t.y,
        key: t.key,
        url: `${R2_PUBLIC_URL}/scenes/${sceneId}/tiles/${t.key}`
      }));

    const finalManifest = {
      ...manifest,
      preview: `${R2_PUBLIC_URL}/scenes/${sceneId}/tiles/preview.jpg`,
      tiles: tilesWithUrls
    };

    // 4. Save to Database
    currentJob.stage = 'save';
    currentJob.progress = 90;
    currentJob.message = 'Saving scene data to database...';
    currentJob.updatedAt = Date.now();

    const backendUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.tour.thenimto.com/api/';
    const separator = backendUrl.endsWith('/') ? '' : '/';
    const authVal = token ? (token.startsWith('Bearer ') ? token : `Bearer ${token}`) : '';

    const saveResp = await fetch(`${backendUrl}${separator}scenes/${sceneId}/update-images`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authVal ? { Authorization: authVal } : {})
      },
      body: JSON.stringify({
        mainImageUrl,
        tilesManifest: finalManifest
      })
    });

    if (!saveResp.ok) {
      const errText = await saveResp.text();
      throw new Error(`Database save failed: ${errText || saveResp.statusText}`);
    }

    // 5. Complete
    const completeData = {
      sceneId,
      mainImageUrl,
      tilesManifest: finalManifest
    };

    currentJob.status = 'complete';
    currentJob.stage = 'complete';
    currentJob.progress = 100;
    currentJob.message = 'Upload and processing complete!';
    currentJob.data = completeData;
    currentJob.updatedAt = Date.now();

    return NextResponse.json({
      success: true,
      ...completeData
    });

  } catch (error: any) {
    console.error('Pipeline process error:', error);
    if (sceneId && jobs.has(sceneId)) {
      const j = jobs.get(sceneId)!;
      j.status = 'error';
      j.error = error.message || 'Processing failed';
      j.updatedAt = Date.now();
    }
    return NextResponse.json(
      { error: error.message || 'Processing failed' },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
export const maxDuration = 300; // Allow up to 5 minutes for large 360 files
