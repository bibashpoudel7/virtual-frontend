import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// R2 configuration
// This route runs on the server, so it reads server-only variables (same names as virtual-backend/.env).
// NEXT_PUBLIC_* names are kept as a fallback, but anything NEXT_PUBLIC_ is bundled into browser JS,
// so the secret key should not be stored under that prefix.
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || process.env.NEXT_PUBLIC_R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY || process.env.NEXT_PUBLIC_R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_KEY || process.env.NEXT_PUBLIC_R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET || process.env.NEXT_PUBLIC_R2_BUCKET_NAME || 'test';
const R2_PUBLIC_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || 'https://test.thenimto.com';
const R2_ENDPOINT = process.env.R2_ENDPOINT || (R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : '');

// Log configuration for debugging
console.log('R2 Configuration:', {
  accountId: R2_ACCOUNT_ID ? 'Set' : 'Not set',
  accessKeyId: R2_ACCESS_KEY_ID ? 'Set' : 'Not set',
  secretKey: R2_SECRET_ACCESS_KEY ? 'Set' : 'Not set',
  endpoint: R2_ENDPOINT || 'Not set',
  bucket: R2_BUCKET_NAME,
  publicUrl: R2_PUBLIC_URL
});

// Create S3 client for R2
const s3Client = R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_ENDPOINT ? new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
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
      if (!R2_ENDPOINT) missingVars.push('R2_ENDPOINT or R2_ACCOUNT_ID');
      if (!R2_ACCESS_KEY_ID) missingVars.push('R2_ACCESS_KEY');
      if (!R2_SECRET_ACCESS_KEY) missingVars.push('R2_SECRET_KEY');
      
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
      console.log('Attempting R2 upload:', {
        bucket: R2_BUCKET_NAME,
        key: key,
        contentType: contentType,
        endpoint: R2_ENDPOINT,
        hasCredentials: !!(R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY)
      });

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
      console.error('R2 upload error:', uploadError.message || uploadError);
      console.error('Error details:', {
        code: uploadError.Code,
        statusCode: uploadError.$metadata?.httpStatusCode,
        requestId: uploadError.$metadata?.requestId,
        fault: uploadError.$fault,
        bucket: R2_BUCKET_NAME,
        key: key
      });
      
      // Provide more specific error messages
      let errorMessage = 'Failed to upload to R2';
      if (uploadError.Code === 'Unauthorized' || uploadError.$metadata?.httpStatusCode === 403) {
        errorMessage = 'R2 authentication failed. Please check your R2 access keys and permissions.';
      } else if (uploadError.Code === 'NoSuchBucket') {
        errorMessage = `R2 bucket "${R2_BUCKET_NAME}" not found. Please check your bucket configuration.`;
      }
      
      return NextResponse.json(
        { 
          error: errorMessage, 
          details: uploadError.message,
          code: uploadError.Code 
        },
        { status: uploadError.$metadata?.httpStatusCode || 500 }
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