import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getR2Client, R2_BUCKET_NAME, R2_PUBLIC_URL } from '@/lib/r2-client';
import path from 'path';
import fs from 'fs/promises';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.avif'];
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const tourId = (formData.get('tourId') as string | null) || 'tour';

    if (!file) {
      return NextResponse.json(
        { error: 'No image file provided' },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'Image file too large. Maximum size is 25MB.' },
        { status: 400 }
      );
    }

    // Validate extension
    const ext = path.extname(file.name).toLowerCase();
    const isImageType = file.type.startsWith('image/') || ALLOWED_IMAGE_EXTENSIONS.includes(ext);

    if (!isImageType && !ALLOWED_IMAGE_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        { error: 'Invalid file format. Please upload an image (.jpg, .jpeg, .png, .webp, .avif).' },
        { status: 400 }
      );
    }

    const cleanExt = ext || '.jpg';
    const timestamp = Date.now();
    const sanitizedBase = path.basename(file.name, ext).replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 30);
    const key = `thumbnails/${tourId}_${timestamp}_${sanitizedBase}${cleanExt}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = file.type || 'image/jpeg';

    // 1. Try uploading to Cloudflare R2
    const r2Client = getR2Client();
    if (r2Client) {
      try {
        await r2Client.send(
          new PutObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: key,
            Body: buffer,
            ContentType: contentType,
            CacheControl: 'public, max-age=31536000',
          })
        );

        const publicUrl = `${R2_PUBLIC_URL}/${key}`;
        return NextResponse.json({
          success: true,
          url: publicUrl,
          key,
          filename: file.name,
          size: file.size,
        });
      } catch (r2Error) {
        console.error('R2 image upload failed, attempting local fallback:', r2Error);
      }
    }

    // 2. Fallback: Save to public/uploads/thumbnails/
    try {
      const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'thumbnails');
      await fs.mkdir(uploadDir, { recursive: true });

      const localFileName = `${tourId}_${timestamp}_${sanitizedBase}${cleanExt}`;
      const filePath = path.join(uploadDir, localFileName);
      await fs.writeFile(filePath, buffer);

      const localUrl = `/uploads/thumbnails/${localFileName}`;
      return NextResponse.json({
        success: true,
        url: localUrl,
        filename: file.name,
        size: file.size,
      });
    } catch (fsError: any) {
      console.error('Local thumbnail upload failed:', fsError);
      return NextResponse.json(
        { error: 'Failed to save thumbnail image', details: fsError.message },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Thumbnail upload error:', error);
    return NextResponse.json(
      { error: 'Thumbnail upload failed', details: error.message },
      { status: 500 }
    );
  }
}
