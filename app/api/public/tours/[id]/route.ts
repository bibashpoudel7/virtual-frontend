import { NextRequest, NextResponse } from 'next/server';

interface CachedTourPayload {
  payload: { tour: any; scenes: any[]; playTours: any[] };
  timestamp: number;
}

const CACHE_TTL_MS = 30_000; // 30s fresh in-memory cache + background revalidation
const tourCache = new Map<string, CachedTourPayload>();
const inflightRequests = new Map<string, Promise<{ tour: any; scenes: any[]; playTours: any[] } | null>>();

async function fetchTourPayloadFromBackend(tourId: string, backendUrl: string) {
  const existing = inflightRequests.get(tourId);
  if (existing) return existing;

  const promise = (async () => {
    try {
      // Fire all 3 backend requests simultaneously (backend resolves both slug and UUID)
      const [tourResponse, scenesResponse, playToursResponse] = await Promise.all([
        fetch(`${backendUrl}tours/${tourId}/public`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          next: { revalidate: 30 }
        }),
        fetch(`${backendUrl}tours/${tourId}/scenes/public?limit=500`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          next: { revalidate: 30 }
        }),
        fetch(`${backendUrl}tours/${tourId}/play-tours/public`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          next: { revalidate: 30 }
        })
      ]);

      if (!tourResponse.ok) {
        return null;
      }

      const [tour, scenesData, playToursData] = await Promise.all([
        tourResponse.json(),
        scenesResponse.ok ? scenesResponse.json() : Promise.resolve({ datas: [] }),
        playToursResponse.ok ? playToursResponse.json() : Promise.resolve([])
      ]);

      const payload = {
        tour,
        scenes: scenesData?.datas || [],
        playTours: playToursData || []
      };

      const entry: CachedTourPayload = { payload, timestamp: Date.now() };
      tourCache.set(tourId, entry);
      if (tour?.id) tourCache.set(tour.id, entry);
      if (tour?.slug) tourCache.set(tour.slug, entry);

      return payload;
    } finally {
      inflightRequests.delete(tourId);
    }
  })();

  inflightRequests.set(tourId, promise);
  return promise;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tourId } = await params;
    const backendUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5555/api/';

    const cached = tourCache.get(tourId);
    if (cached) {
      // If stale, trigger non-blocking background refresh while returning cached data immediately
      if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
        void fetchTourPayloadFromBackend(tourId, backendUrl);
      }
      return NextResponse.json(cached.payload, {
        headers: {
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120'
        }
      });
    }

    const payload = await fetchTourPayloadFromBackend(tourId, backendUrl);
    if (!payload) {
      return NextResponse.json(
        { error: 'Tour not found or not available for public viewing' },
        { status: 404 }
      );
    }

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120'
      }
    });
  } catch (error) {
    console.error('Error fetching tour details:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tour details' },
      { status: 500 }
    );
  }
}