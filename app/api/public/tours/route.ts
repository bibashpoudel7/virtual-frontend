import { NextRequest, NextResponse } from 'next/server';

// This is a public endpoint that doesn't require authentication
export async function GET(request: NextRequest) {
  try {
    // In production, replace with your actual backend API URL
    const backendUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5555/api/';
    
    // Fetch all published tours from backend without auth
    const response = await fetch(`${backendUrl}tours/public`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      // If the backend doesn't have a public endpoint yet, 
      // fetch from regular endpoint (you may need to adjust this based on your backend)
      const fallbackResponse = await fetch(`${backendUrl}api/tours`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!fallbackResponse.ok) {
        throw new Error('Failed to fetch tours');
      }

      const tours = await fallbackResponse.json();
      // Filter only published tours for public viewing
      const publicTours = tours.filter((tour: any) => tour.is_published === true);
      return NextResponse.json(publicTours);
    }

    const tours = await response.json();
    return NextResponse.json(tours);
  } catch (error) {
    console.error('Error fetching public tours:', error);
    // Return empty array if backend is not available
    return NextResponse.json([]);
  }
}