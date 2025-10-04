import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // In production, fetch from backend
  return NextResponse.json({
    id: params.id,
    name: 'Sample Tour',
    scenes: [],
    is_published: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    
    // In production, update in backend
    return NextResponse.json({
      id: params.id,
      ...body,
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Update tour error:', error);
    return NextResponse.json(
      { error: 'Failed to update tour' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // In production, delete from backend
  return NextResponse.json({ success: true }, { status: 204 });
}