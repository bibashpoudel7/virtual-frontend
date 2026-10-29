import { NextRequest, NextResponse } from 'next/server';
import {
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput,
  type _Object,
} from '@aws-sdk/client-s3';
import {
  getR2Client,
  R2_BUCKET_NAME,
  R2_PUBLIC_URL,
  R2_ENDPOINT,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY
} from '@/lib/r2-client';

const s3Client = getR2Client();

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

export async function DELETE(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const key = url.searchParams.get('key');
    const prefix = url.searchParams.get('prefix');

    if (!key && !prefix) {
      return NextResponse.json(
        { error: 'key or prefix parameter is required' },
        { status: 400 }
      );
    }

    if (!s3Client) {
      return NextResponse.json(
        { error: 'R2 storage not configured' },
        { status: 500 }
      );
    }

    // 1. Delete single object by key
    if (key) {
      await s3Client.send(new DeleteObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
      }));
      return NextResponse.json({ success: true, deletedKey: key });
    }

    // 2. Delete all objects matching prefix (e.g., scenes/{sceneId}/)
    if (prefix) {
      let continuationToken: string | undefined = undefined;
      let totalDeleted = 0;

      do {
        const listResp: ListObjectsV2CommandOutput = await s3Client.send(
          new ListObjectsV2Command({
            Bucket: R2_BUCKET_NAME,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          })
        );

        if (listResp.Contents && listResp.Contents.length > 0) {
          const objectsToDelete = listResp.Contents
            .filter((item: _Object) => !!item.Key)
            .map((item: _Object) => ({ Key: item.Key! }));

          if (objectsToDelete.length > 0) {
            await s3Client.send(new DeleteObjectsCommand({
              Bucket: R2_BUCKET_NAME,
              Delete: {
                Objects: objectsToDelete,
                Quiet: true,
              },
            }));
            totalDeleted += objectsToDelete.length;
          }
        }

        continuationToken = listResp.IsTruncated ? listResp.NextContinuationToken : undefined;
      } while (continuationToken);

      console.log(`Deleted ${totalDeleted} objects from R2 bucket "${R2_BUCKET_NAME}" with prefix "${prefix}"`);
      return NextResponse.json({
        success: true,
        prefix,
        deletedCount: totalDeleted,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('R2 delete error:', error);
    return NextResponse.json(
      { error: 'Failed to delete from R2', details: error.message },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';

// Configure max body size for Next.js 13+ App Router
export const maxDuration = 60; // Maximum allowed duration for Vercel Hobby is 60 seconds
export const dynamic = 'force-dynamic';