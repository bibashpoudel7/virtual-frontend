import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5555/api/';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tourId } = await params;
    const token = request.headers.get('Authorization')?.split('Bearer ')[1];
    
    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    
    // Validate required fields
    if (!body.kind || !body.scene_id || body.yaw === undefined || body.pitch === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: kind, scene_id, yaw, pitch' },
        { status: 400 }
      );
    }

    // Prepare the hotspot data for the backend
    const hotspotData = {
      tour_id: tourId,
      scene_id: body.scene_id,
      kind: body.kind,
      yaw: body.yaw,
      pitch: body.pitch,
      payload: body.payload || {},
      target_scene_id: body.target_scene_id || ""
    };

    // Call the backend API to create the hotspot using the tour-specific endpoint
    const response = await fetch(`${BACKEND_URL}tours/${tourId}/scenes/${body.scene_id}/hotspots`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(hotspotData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Backend hotspot creation failed:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        requestData: hotspotData
      });
      
      let errorMessage = 'Failed to create hotspot';
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }
      
      return NextResponse.json(
        { error: errorMessage },
        { status: response.status }
      );
    }

    const createdHotspot = await response.json();

    return NextResponse.json({ hotspot: createdHotspot });
    
  } catch (error) {
    console.error('Hotspot creation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create hotspot' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tourId } = await params;
    const token = request.headers.get('Authorization')?.split('Bearer ')[1];
    
    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get all hotspots for the tour by fetching scenes first
    const scenesResponse = await fetch(`${BACKEND_URL}tours/${tourId}/scenes`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
    });

    if (!scenesResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch tour scenes' },
        { status: scenesResponse.status }
      );
    }

    const scenes = await scenesResponse.json();
    
    // Fetch hotspots for each scene
    const allHotspots = [];
    for (const scene of scenes) {
      try {
        const hotspotsResponse = await fetch(`${BACKEND_URL}scenes/${scene.id}/hotspots`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
        });

        if (hotspotsResponse.ok) {
          const sceneHotspots = await hotspotsResponse.json();
          allHotspots.push(...sceneHotspots);
        }
      } catch (error) {
        console.error(`Error fetching hotspots for scene ${scene.id}:`, error);
      }
    }

    return NextResponse.json({ hotspots: allHotspots });
    
  } catch (error) {
    console.error('Error fetching tour hotspots:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch hotspots' },
      { status: 500 }
    );
  }
}