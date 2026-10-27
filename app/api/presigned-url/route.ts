import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// R2 configuration - use server-side env vars (without NEXT_PUBLIC)
const R2_ACCOUNT_ID = process.env.NEXT_PUBLIC_R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.NEXT_PUBLIC_R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.NEXT_PUBLIC_R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.NEXT_PUBLIC_R2_BUCKET_NAME || 'test';
const R2_PUBLIC_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || 'https://test.thenimto.com';

// Create S3 client configured for R2
const s3Client = R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY ? new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
  // Use path-style URLs for R2 (bucket in path, not hostname)
  forcePathStyle: true,
}) : null;

export async function POST(request: NextRequest) {
  try {
    const { key, contentType = 'image/jpeg' } = await request.json();

    if (!key) {
      return NextResponse.json(
        { error: 'Key is required' },
        { status: 400 }
      );
    }

    if (!s3Client) {
      return NextResponse.json(
        { error: 'R2 not configured' },
        { status: 500 }
      );
    }

    // Generate presigned URL
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 3600 // 1 hour
    });

    // Log the generated URL for debugging
    console.log('Generated presigned URL:', uploadUrl);
    console.log('R2 Account ID:', R2_ACCOUNT_ID);
    console.log('Bucket:', R2_BUCKET_NAME);

    // Return presigned URL and public URL
    return NextResponse.json({
      uploadUrl,
      publicUrl: `${R2_PUBLIC_URL}/${key}`,
    });

  } catch (error) {
    console.error('Failed to generate presigned URL:', error);
    return NextResponse.json(
      { error: 'Failed to generate presigned URL' },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';