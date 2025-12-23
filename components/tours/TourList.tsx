'use client';

import { useState, useEffect } from 'react';
import { Tour } from '@/types/tour';
import { tourService } from '@/services/tourService';
import { useRouter } from 'next/navigation';

interface TourWithSceneCount extends Tour {
  sceneCount?: number;
}

export default function TourList() {
  const [tours, setTours] = useState<TourWithSceneCount[]>([]);
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
      
      // Fetch scene count for each tour
      const toursWithSceneCounts = await Promise.all(
        data.map(async (tour) => {
          try {
            const scenes = await tourService.getScenes(tour.id);
            return { ...tour, sceneCount: scenes.length };
          } catch (err) {
            console.error(`Failed to fetch scenes for tour ${tour.id}:`, err);
            return { ...tour, sceneCount: 0 };
          }
        })
      );
      
      setTours(toursWithSceneCounts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tours');
    } finally {
      setLoading(false);
    }
  };

  console.log({ tours })

  if (loading) return <div className="p-4">Loading tours...</div>;
  if (error) return <div className="p-4 text-red-500">Error: {error}</div>;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Virtual Tours</h2>
        <p className="text-gray-600">Manage your virtual tour collection</p>
      </div>

      {tours.length === 0 ? (
        <div className="text-center py-12">
          <div className="mx-auto w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No tours yet</h3>
          <p className="text-gray-500 mb-4">Get started by creating your first virtual tour</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tours.map((tour) => (
            <div
              key={tour.id}
              className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-xl transition-all duration-200 cursor-pointer hover:border-blue-300"
              onClick={() => router.push(`/admin/tours/${tour.id}`)}
            >
              <div className="flex items-start justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-900 truncate pr-2">{tour.name}</h3>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${tour.is_published
                    ? 'bg-green-100 text-green-800'
                    : 'bg-yellow-100 text-yellow-800'
                  }`}>
                  {tour.is_published ? 'Published' : 'Draft'}
                </span>
              </div>

              <div className="space-y-3">
                <div className="flex items-center text-gray-700">
                  <svg className="w-5 h-5 mr-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="font-medium">Scenes:</span>
                  <span className="ml-1 text-gray-900">{tour.sceneCount ?? 0}</span>
                </div>

                {tour.background_audio_url && (
                  <div className="flex items-center text-green-600">
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 14.142M5 7h4l1 1v8l-1 1H5a1 1 0 01-1-1V8a1 1 0 011-1z" />
                    </svg>
                    <span className="text-sm font-medium">Background audio</span>
                  </div>
                )}

                {tour.autoplay_enabled && (
                  <div className="flex items-center text-blue-600">
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1.5a2.5 2.5 0 110 5H9m-3-5a5 5 0 1110 0m-3-5v2M7 10v5a2 2 0 002 2h1" />
                    </svg>
                    <span className="text-sm font-medium">Autoplay enabled</span>
                  </div>
                )}

                <div className="pt-3 border-t border-gray-100">
                  <div className="flex items-center justify-between text-sm text-gray-500">
                    <span>Created: {new Date(tour.created_at).toLocaleDateString()}</span>
                    <button className="text-blue-600 hover:text-blue-800 font-medium cursor-pointer">
                      Edit →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}