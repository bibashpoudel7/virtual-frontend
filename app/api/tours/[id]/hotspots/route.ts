import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5555/api';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body = await request.json();
    const { id } = await params;
    const tourId = id;
    const sceneId = body.scene_id;
    const token = request.headers.get('Authorization')?.split('Bearer ')[1];
    
    // Call the backend API to create the hotspot
    const response = await fetch(`${BACKEND_URL}scenes/${sceneId}/hotspots`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Add authentication header if needed
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        ...body,
        tour_id: tourId,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Failed to create hotspot');
    }

    const data = await response.json();
    return NextResponse.json({ hotspot: data });
    
  } catch (error) {
    console.error('Create hotspot error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create hotspot' },
      { status: 500 }
    );
  }
}
