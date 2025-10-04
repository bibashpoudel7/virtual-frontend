import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// R2 configuration
const R2_ACCOUNT_ID = process.env.NEXT_PUBLIC_R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.NEXT_PUBLIC_R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.NEXT_PUBLIC_R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.NEXT_PUBLIC_R2_BUCKET_NAME || 'test';
const R2_PUBLIC_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || 'https://test.thenimto.com';

// Log configuration for debugging
console.log('R2 Configuration:', {
  accountId: R2_ACCOUNT_ID ? 'Set' : 'Not set',
  accessKeyId: R2_ACCESS_KEY_ID ? 'Set' : 'Not set',
  secretKey: R2_SECRET_ACCESS_KEY ? 'Set' : 'Not set',
  bucket: R2_BUCKET_NAME,
  publicUrl: R2_PUBLIC_URL
});

// Create S3 client for R2
const s3Client = R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_ACCOUNT_ID ? new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true, // Use path-style URLs for R2
}) : null;

export async function PUT(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const key = url.searchParams.get('key');
    const contentType = request.headers.get('content-type') || 'image/jpeg';
    
    if (!key) {
      return NextResponse.json(
        { error: 'Key is required' },
        { status: 400 }
      );
    }

    if (!s3Client) {
      const missingVars = [];
      if (!R2_ACCOUNT_ID) missingVars.push('NEXT_PUBLIC_R2_ACCOUNT_ID');
      if (!R2_ACCESS_KEY_ID) missingVars.push('NEXT_PUBLIC_R2_ACCESS_KEY_ID');
      if (!R2_SECRET_ACCESS_KEY) missingVars.push('NEXT_PUBLIC_R2_SECRET_ACCESS_KEY');
      
      return NextResponse.json(
        { 
          error: 'R2 storage not configured',
          missing: missingVars,
          message: `Please set the following environment variables: ${missingVars.join(', ')}`
        },
        { status: 500 }
      );
    }

    // Get the file data
    const blob = await request.blob();
    const buffer = Buffer.from(await blob.arrayBuffer());
    
    // Upload to R2
    try {
      const command = new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        // Add cache control for public assets
        CacheControl: 'public, max-age=31536000',
      });

      await s3Client.send(command);
      
      // Return the public URL
      const publicUrl = `${R2_PUBLIC_URL}/${key}`;
      
      return NextResponse.json({
        success: true,
        url: publicUrl,
        key: key,
      });
    } catch (uploadError:any) {
      console.error('R2 upload error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload to R2', details: uploadError.message },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to process upload' },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';

// Configure max body size for Next.js 13+ App Router
export const maxDuration = 60; // Maximum allowed duration for Vercel Hobby is 60 seconds
export const dynamic = 'force-dynamic';