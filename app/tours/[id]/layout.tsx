import type { Metadata } from 'next';
import React from 'react';

type Props = {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
};

interface PublicTourData {
  id: string;
  slug?: string;
  name: string;
  description?: string;
  location?: string;
  cover_image_url?: string;
  thumbnail_url?: string;
  categories?: string[];
  is_published?: boolean;
}

const SITE_URL = process.env.NEXT_PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://thenimto.com';

async function fetchTour(id: string): Promise<PublicTourData | null> {
  try {
    const backendUrl =
      process.env.BACKEND_INTERNAL_URL ||
      process.env.NEXT_PUBLIC_API_BASE_URL ||
      'http://localhost:5555/api/';
    const base = backendUrl.endsWith('/') ? backendUrl : `${backendUrl}/`;

    const res = await fetch(`${base}tours/${id}/public`, {
      next: { revalidate: 60 },
    });

    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    console.error(`Error loading tour SEO data for ID ${id}:`, error);
    return null;
  }
}

function resolveImageUrl(image?: string): string {
  if (!image) {
    return `${SITE_URL}/TheNimto.png`;
  }
  if (image.startsWith('http://') || image.startsWith('https://')) {
    return image;
  }
  return `${SITE_URL}${image.startsWith('/') ? '' : '/'}${image}`;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const tour = await fetchTour(id);

  if (!tour) {
    return {
      title: '360° Virtual Tour | TheNimto',
      description: 'Explore immersive 360° virtual tours for dining, venues, and hospitality spaces on TheNimto.',
    };
  }

  const title = tour.location
    ? `${tour.name} — ${tour.location} | 360° Virtual Tour | TheNimto`
    : `${tour.name} | 360° Virtual Tour | TheNimto`;

  const description =
    tour.description?.trim() ||
    `Experience an immersive 360° virtual tour of ${tour.name}${
      tour.location ? ` located in ${tour.location}` : ''
    } on TheNimto. Explore interactive views, spaces, and dining atmosphere.`;

  const imageUrl = resolveImageUrl(tour.cover_image_url || tour.thumbnail_url);

  const keywords = [
    tour.name,
    tour.location,
    '360 virtual tour',
    'virtual tour Nepal',
    'TheNimto',
    'interactive 360 tour',
    'hospitality',
    'restaurant tour',
    'hotel tour',
    ...(tour.categories || []),
  ].filter(Boolean) as string[];

  const tourIdentifier = tour?.slug || id;

  return {
    title,
    description,
    keywords,
    alternates: {
      canonical: `/tours/${tourIdentifier}`,
    },
    openGraph: {
      type: 'website',
      url: `${SITE_URL}/tours/${tourIdentifier}`,
      title: `${tour.name}${tour.location ? ` (${tour.location})` : ''} - 360° Virtual Tour`,
      description,
      siteName: 'TheNimto Virtual Tours',
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: tour.name,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${tour.name}${tour.location ? ` (${tour.location})` : ''}`,
      description,
      images: [imageUrl],
    },
  };
}

export default async function TourLayout({ children, params }: Props) {
  const { id } = await params;
  const tour = await fetchTour(id);

  const imageUrl = resolveImageUrl(tour?.cover_image_url || tour?.thumbnail_url);
  const description =
    tour?.description?.trim() ||
    (tour
      ? `Experience an immersive 360° virtual tour of ${tour.name}${
          tour.location ? ` located in ${tour.location}` : ''
        } on TheNimto.`
      : 'Immersive 360° virtual tour on TheNimto.');

  const categoryType = tour?.categories?.includes('restaurant')
    ? 'Restaurant'
    : tour?.categories?.includes('hotel')
    ? 'Hotel'
    : tour?.categories?.includes('wedding-venue') || tour?.categories?.includes('event-venue')
    ? 'EventVenue'
    : 'TouristAttraction';

  const tourIdentifier = tour?.slug || id;

  const jsonLd = tour
    ? {
        '@context': 'https://schema.org',
        '@type': categoryType,
        name: tour.name,
        description,
        url: `${SITE_URL}/tours/${tourIdentifier}`,
        image: imageUrl,
        ...(tour.location
          ? {
              address: {
                '@type': 'PostalAddress',
                streetAddress: tour.location,
                addressLocality: tour.location,
              },
            }
          : {}),
        hasVirtualTour: `${SITE_URL}/tours/${tourIdentifier}`,
        isAccessibleForFree: true,
      }
    : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      {children}
    </>
  );
}
