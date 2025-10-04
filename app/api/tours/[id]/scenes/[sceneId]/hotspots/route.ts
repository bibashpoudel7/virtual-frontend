import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5555/api';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; sceneId: string } }
) {
  try {
    const sceneId = params.sceneId;
    const token = request.headers.get('Authorization')?.split('Bearer ')[1];
    
    // Call the backend API to get hotspots for this scene
    const response = await fetch(`${BACKEND_URL}scenes/${sceneId}/hotspots`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Failed to fetch hotspots');
    }

    const data = await response.json();
    // Backend returns array directly, wrap it for consistency
    return NextResponse.json({ hotspots: Array.isArray(data) ? data : [] });
    
  } catch (error) {
    console.error('Fetch hotspots error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch hotspots' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; sceneId: string } }
) {
  try {
    const url = new URL(request.url);
    const hotspotId = url.pathname.split('/').pop();
    const sceneId = params.sceneId;
    const token = request.headers.get('Authorization')?.split('Bearer ')[1];
    
    if (!hotspotId || hotspotId === 'hotspots') {
      throw new Error('Hotspot ID is required');
    }
    
    // Call the backend API to delete the hotspot
    const response = await fetch(`${BACKEND_URL}scenes/${sceneId}/hotspots/${hotspotId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Failed to delete hotspot');
    }

    return NextResponse.json({ success: true });
    
  } catch (error) {
    console.error('Delete hotspot error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete hotspot' },
      { status: 500 }
    );
  }
}