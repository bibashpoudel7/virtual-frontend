import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tourId = id;
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    
    // Fetch tour details with scenes
    const tourResponse = await fetch(`${backendUrl}/api/tours/${tourId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!tourResponse.ok) {
      return NextResponse.json(
        { error: 'Tour not found' },
        { status: 404 }
      );
    }

    const tour = await tourResponse.json();
    
    // Only return tour if it's published
    if (!tour.is_published) {
      return NextResponse.json(
        { error: 'Tour not available' },
        { status: 403 }
      );
    }

    // Fetch scenes for this tour
    const scenesResponse = await fetch(`${backendUrl}/api/tours/${tourId}/scenes`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    let scenes = [];
    if (scenesResponse.ok) {
      scenes = await scenesResponse.json();
    }

    // Fetch hotspots for each scene
    const scenesWithHotspots = await Promise.all(
      scenes.map(async (scene: any) => {
        try {
          const hotspotsResponse = await fetch(
            `${backendUrl}/api/scenes/${scene.id}/hotspots`,
            {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
              },
            }
          );
          
          let hotspots = [];
          if (hotspotsResponse.ok) {
            hotspots = await hotspotsResponse.json();
          }
          
          return {
            ...scene,
            hotspots
          };
        } catch (error) {
          console.error(`Error fetching hotspots for scene ${scene.id}:`, error);
          return {
            ...scene,
            hotspots: []
          };
        }
      })
    );

    return NextResponse.json({
      tour,
      scenes: scenesWithHotspots
    });
  } catch (error) {
    console.error('Error fetching tour details:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tour details' },
      { status: 500 }
    );
  }
}