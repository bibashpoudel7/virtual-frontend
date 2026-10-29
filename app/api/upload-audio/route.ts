import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getR2Client, R2_BUCKET_NAME, R2_PUBLIC_URL } from '@/lib/r2-client';
import path from 'path';
import fs from 'fs/promises';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ALLOWED_AUDIO_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.opus'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const tourId = (formData.get('tourId') as string | null) || 'tour';

    if (!file) {
      return NextResponse.json(
        { error: 'No audio file provided' },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'Audio file too large. Maximum size is 50MB.' },
        { status: 400 }
      );
    }

    // Validate extension
    const ext = path.extname(file.name).toLowerCase();
    const isAudioType = file.type.startsWith('audio/') || ALLOWED_AUDIO_EXTENSIONS.includes(ext);

    if (!isAudioType && !ALLOWED_AUDIO_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        { error: 'Invalid file format. Please upload an audio file (.mp3, .wav, .m4a, .aac, .ogg, .flac).' },
        { status: 400 }
      );
    }

    const cleanExt = ext || '.mp3';
    const timestamp = Date.now();
    const sanitizedBase = path.basename(file.name, ext).replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 30);
    const key = `audio/${tourId}_${timestamp}_${sanitizedBase}${cleanExt}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = file.type || 'audio/mpeg';

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
        console.error('R2 upload failed, attempting local fallback:', r2Error);
      }
    }

    // 2. Fallback: Save to public/uploads/audio/
    try {
      const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'audio');
      await fs.mkdir(uploadDir, { recursive: true });

      const localFileName = `${tourId}_${timestamp}_${sanitizedBase}${cleanExt}`;
      const filePath = path.join(uploadDir, localFileName);
      await fs.writeFile(filePath, buffer);

      const localUrl = `/uploads/audio/${localFileName}`;
      return NextResponse.json({
        success: true,
        url: localUrl,
        filename: file.name,
        size: file.size,
      });
    } catch (fsError: any) {
      console.error('Local upload failed:', fsError);
      return NextResponse.json(
        { error: 'Failed to save audio file', details: fsError.message },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Audio upload error:', error);
    return NextResponse.json(
      { error: 'Audio upload failed', details: error.message },
      { status: 500 }
    );
  }
}
