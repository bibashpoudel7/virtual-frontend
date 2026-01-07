import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tourId = id;
    const backendUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5555/api/';

    // Fetch tour details using public endpoint
    const tourResponse = await fetch(`${backendUrl}tours/${tourId}/public`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!tourResponse.ok) {
      return NextResponse.json(
        { error: 'Tour not found or not available for public viewing' },
        { status: tourResponse.status }
      );
    }

    const tour = await tourResponse.json();

    // Fetch scenes for this tour using public endpoint
    const scenesResponse = await fetch(`${backendUrl}tours/${tourId}/scenes/public`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    let scenes = [];
    if (scenesResponse.ok) {
      scenes = await scenesResponse.json();
    }

    // Fetch play tours for this tour
    const playToursResponse = await fetch(`${backendUrl}tours/${tourId}/play-tours/public`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    let playTours = [];
    if (playToursResponse.ok) {
      playTours = await playToursResponse.json();
    }

    // Fetch hotspots and overlays for each scene using public endpoint
    const scenesWithHotspotsAndOverlays = await Promise.all(
      scenes.map(async (scene: any) => {
        try {
          // Fetch hotspots
          const hotspotsResponse = await fetch(
            `${backendUrl}scenes/${scene.id}/hotspots/public`,
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

          // Fetch overlays
          const overlaysResponse = await fetch(
            `${backendUrl}scenes/${scene.id}/overlays/public`,
            {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
              },
            }
          );

          let overlays = [];
          if (overlaysResponse.ok) {
            overlays = await overlaysResponse.json();
          }

          return {
            ...scene,
            hotspots,
            overlays
          };
        } catch (error) {
          console.error(`Error fetching hotspots/overlays for scene ${scene.id}:`, error);
          return {
            ...scene,
            hotspots: [],
            overlays: []
          };
        }
      })
    );

    return NextResponse.json({
      tour,
      scenes: scenesWithHotspotsAndOverlays,
      playTours
    });
  } catch (error) {
    console.error('Error fetching tour details:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tour details' },
      { status: 500 }
    );
  }
}