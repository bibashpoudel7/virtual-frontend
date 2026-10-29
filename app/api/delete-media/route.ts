import { NextRequest, NextResponse } from 'next/server';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getR2Client, R2_BUCKET_NAME } from '@/lib/r2-client';
import path from 'path';
import fs from 'fs/promises';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function extractKeyAndLocalPath(inputUrl?: string, explicitKey?: string) {
  let key = explicitKey;
  let localRelPath = '';

  if (inputUrl) {
    const match = inputUrl.match(/(thumbnails\/[^\s?#]+|audio\/[^\s?#]+)/);
    if (match) {
      key = key || match[1];
    }
    if (inputUrl.includes('/uploads/')) {
      const parts = inputUrl.split('/uploads/');
      if (parts[1]) {
        localRelPath = parts[1];
      }
    }
  }

  return { key, localRelPath };
}

async function performDelete(inputUrl?: string, explicitKey?: string) {
  const { key, localRelPath } = extractKeyAndLocalPath(inputUrl, explicitKey);

  let r2Deleted = false;
  let localDeleted = false;

  // 1. Try deleting from Cloudflare R2
  if (key) {
    const r2Client = getR2Client();
    if (r2Client) {
      try {
        await r2Client.send(
          new DeleteObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: key,
          })
        );
        r2Deleted = true;
      } catch (err) {
        console.error('R2 delete error:', err);
      }
    }
  }

  // 2. Try deleting local file if exists
  if (localRelPath) {
    try {
      const fullPath = path.join(process.cwd(), 'public', 'uploads', localRelPath);
      await fs.unlink(fullPath);
      localDeleted = true;
    } catch {
      // File may not exist locally, ignore
    }
  }

  return { success: true, key, r2Deleted, localDeleted };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { url, key } = body;
    const result = await performDelete(url, key);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('delete-media POST error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const url = searchParams.get('url') || undefined;
    const key = searchParams.get('key') || undefined;
    const result = await performDelete(url, key);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('delete-media DELETE error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
