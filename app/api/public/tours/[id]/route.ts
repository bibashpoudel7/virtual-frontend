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
    // Request a large limit to get all scenes for the full tour viewer
    const scenesResponse = await fetch(`${backendUrl}tours/${tourId}/scenes/public?limit=500`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    let scenes = [];
    if (scenesResponse.ok) {
      const data = await scenesResponse.json();
      scenes = data.datas || [];
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


    return NextResponse.json({
      tour,
      scenes: scenes,
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