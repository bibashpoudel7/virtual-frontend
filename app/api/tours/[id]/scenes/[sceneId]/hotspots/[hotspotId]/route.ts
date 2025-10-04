import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5555/api';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; sceneId: string; hotspotId: string } }
) {
  try {
    const { sceneId, hotspotId } = params;
    const token = request.headers.get('Authorization')?.split('Bearer ')[1];
    
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

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string; sceneId: string; hotspotId: string } }
) {
  try {
    const body = await request.json();
    const { sceneId, hotspotId } = params;
    const token = request.headers.get('Authorization')?.split('Bearer ')[1];
    
    // Call the backend API to update the hotspot
    const response = await fetch(`${BACKEND_URL}scenes/${sceneId}/hotspots/${hotspotId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Failed to update hotspot');
    }

    const data = await response.json();
    return NextResponse.json({ hotspot: data });
    
  } catch (error) {
    console.error('Update hotspot error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update hotspot' },
      { status: 500 }
    );
  }
}