import { NextRequest, NextResponse } from 'next/server';

// Server-side address of the Go API (inside Docker this can differ from the browser's URL)
const API_BASE = process.env.INTERNAL_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5555/api/';
const EMBED_KEY_PATTERN = /^vt_[A-Za-z0-9_-]{20,64}$/;
// Same shape the backend accepts: optional "*." wildcard, host, optional port
const DOMAIN_PATTERN = /^(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:[0-9]{1,5})?$/;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const slugCache = new Map<string, string>();

async function resolveSlugForUuid(tourId: string): Promise<string | null> {
  const cached = slugCache.get(tourId);
  if (cached) return cached;
  try {
    const response = await fetch(apiUrl(`tours/${tourId}/public`), { next: { revalidate: 300 } });
    if (response.ok) {
      const tour = await response.json();
      if (tour?.slug && /^[A-Za-z0-9-]+$/.test(tour.slug)) {
        slugCache.set(tourId, tour.slug);
        return tour.slug;
      }
    }
  } catch {
    // Ignore lookup error
  }
  return null;
}

interface EmbedLookup {
  tour_id: string;
  slug?: string;
  allowed_domains: string[];
}

function apiUrl(path: string) {
  return `${API_BASE.endsWith('/') ? API_BASE : `${API_BASE}/`}${path}`;
}

// CSP frame-ancestors for an embed key: its allowed domains, or any site when none are set
function frameAncestors(domains: string[]) {
  const sources = domains
    .filter((d) => DOMAIN_PATTERN.test(d))
    .flatMap((d) => (/^(localhost|127\.0\.0\.1)(:|$)/.test(d) ? [`http://${d}`, `https://${d}`] : [`https://${d}`]));
  return sources.length > 0 ? `'self' ${sources.join(' ')}` : '*';
}

function embedUnavailable(status = 404) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tour unavailable</title></head>
<body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#111827;color:#e5e7eb;font-family:system-ui,sans-serif;text-align:center">
<div><p style="font-size:18px;font-weight:600;margin:0 0 8px">This virtual tour is not available</p>
<p style="font-size:14px;color:#9ca3af;margin:0">The embed key is invalid, revoked, or the tour is not published.</p></div></body></html>`;
  return new NextResponse(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': 'frame-ancestors *', 'Cache-Control': 'no-store' },
  });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // /embed/<key>: only admin-issued, active keys for published tours may be framed by other sites
  if (pathname.startsWith('/embed/')) {
    const key = pathname.split('/')[2] || '';
    if (!EMBED_KEY_PATTERN.test(key)) return embedUnavailable();

    let lookup: EmbedLookup;
    try {
      const response = await fetch(apiUrl(`embed/${key}`), { cache: 'no-store' });
      if (!response.ok) return embedUnavailable(response.status === 404 ? 404 : 502);
      lookup = await response.json();
    } catch {
      return embedUnavailable(503);
    }
    if (!lookup?.tour_id || !/^[A-Za-z0-9-]+$/.test(lookup.tour_id)) return embedUnavailable();

    let targetTour = lookup.slug && /^[A-Za-z0-9-]+$/.test(lookup.slug) ? lookup.slug : lookup.tour_id;
    if (UUID_PATTERN.test(targetTour)) {
      const resolvedSlug = await resolveSlugForUuid(targetTour);
      if (resolvedSlug) targetTour = resolvedSlug;
    }

    const url = request.nextUrl.clone();
    url.pathname = `/tours/${targetTour}`;
    url.searchParams.set('embed', '1');
    const response = NextResponse.rewrite(url);
    response.headers.set('Content-Security-Policy', `frame-ancestors ${frameAncestors(lookup.allowed_domains || [])}`);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }

  // Redirect raw UUID /tours/<uuid> URLs directly to /tours/<slug> so all API calls use the slug
  const tourSegment = pathname.split('/')[2] || '';
  if (pathname.startsWith('/tours/') && UUID_PATTERN.test(tourSegment) && request.nextUrl.searchParams.get('embed') !== '1') {
    const resolvedSlug = await resolveSlugForUuid(tourSegment);
    if (resolvedSlug) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = `/tours/${resolvedSlug}`;
      return NextResponse.redirect(redirectUrl, 308);
    }
  }

  // /tours/<id>: viewable directly, but only our own site may put it in a frame
  const response = NextResponse.next();
  response.headers.set('Content-Security-Policy', "frame-ancestors 'self'");
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  return response;
}

export const config = {
  matcher: ['/tours/:path*', '/embed/:path*'],
};
