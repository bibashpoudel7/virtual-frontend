'use client';

import { useState, useEffect } from 'react';
import { Tour } from '@/types/tour';
import { tourService } from '@/services/tourService';
import { useRouter } from 'next/navigation';

export default function TourList() {
  const [tours, setTours] = useState<Tour[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    loadTours();
  }, []);

  const loadTours = async () => {
    try {
      setLoading(true);
      const data = await tourService.listTours();
      setTours(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tours');
    } finally {
      setLoading(false);
    }
  };

  console.log({tours})

  if (loading) return <div className="p-4">Loading tours...</div>;
  if (error) return <div className="p-4 text-red-500">Error: {error}</div>;

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Virtual Tours</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tours.map((tour) => (
          <div
            key={tour.id}
            className="border rounded-lg p-4 hover:shadow-lg transition-shadow cursor-pointer"
            onClick={() => router.push(`/tours/${tour.id}`)}
          >
            <h3 className="text-lg font-semibold mb-2">{tour.name}</h3>
            <div className="space-y-1 text-sm text-gray-600">
              <p>
                Status: {' '}
                <span className={tour.is_published ? 'text-green-600' : 'text-yellow-600'}>
                  {tour.is_published ? 'Published' : 'Draft'}
                </span>
              </p>
              <p>Scenes: {tour.tour_scenes?.length || 0}</p>
              {tour.autoplay_enabled && (
                <p className="text-blue-600">Autoplay enabled</p>
              )}
            </div>
          </div>
        ))}
      </div>
      {tours.length === 0 && (
        <p className="text-gray-500 text-center py-8">
          No tours found for this property
        </p>
      )}
    </div>
  );
}