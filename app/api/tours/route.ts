import { NextRequest, NextResponse } from 'next/server';

// Mock data for demo
let tours: any[] = [];

export async function GET() {
  // In production, fetch from backend
  return NextResponse.json(tours);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const newTour = {
      id: `tour-${Date.now()}`,
      ...body,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_published: false,
      scenes_count: body.scenes?.length || 0,
    };
    
    tours.push(newTour);
    
    return NextResponse.json(newTour, { status: 201 });
  } catch (error) {
    console.error('Create tour error:', error);
    return NextResponse.json(
      { error: 'Failed to create tour' },
      { status: 500 }
    );
  }
}