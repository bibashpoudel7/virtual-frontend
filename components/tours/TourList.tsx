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
    
    // Auto-refresh when user returns to tab (visibility change)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // User returned to tab, refresh data silently
        loadTours();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const loadTours = async (forceRefresh = false) => {
    try {
      // Only show loading spinner on initial load, not on background refreshes
      if (tours.length === 0) {
        setLoading(true);
      }
      setError(null);
      
      // Skip cache if force refresh is requested or if we have no cached data
      if (!forceRefresh && tours.length === 0) {
        // Check if we have cached data
        const cacheKey = 'tours_cache';
        const cacheTimeKey = 'tours_cache_time';
        const cacheExpiry = 2 * 60 * 1000; // Reduced to 2 minutes for fresher data
        
        const cachedData = localStorage.getItem(cacheKey);
        const cacheTime = localStorage.getItem(cacheTimeKey);
        
        // Use cached data if it's fresh (less than 2 minutes old)
        if (cachedData && cacheTime) {
          const isDataFresh = Date.now() - parseInt(cacheTime) < cacheExpiry;
          if (isDataFresh) {
            const parsedData = JSON.parse(cachedData);
            setTours(parsedData);
            setLoading(false);
            
            // Still fetch fresh data in background for next time
            fetchFreshData(true); // Silent background refresh
            return;
          }
        }
      }
      
      // Fetch fresh data
      await fetchFreshData();
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tours');
      setLoading(false);
    }
  };

  const fetchFreshData = async (silent = false) => {
    try {
      const data = await tourService.listTours();
      
      // Handle null or empty response
      if (!data || data === null) {
        console.log('API returned null, clearing cache and showing empty state');
        setTours([]);
        // Clear cache when API returns null
        localStorage.removeItem('tours_cache');
        localStorage.removeItem('tours_cache_time');
        return;
      }
      
      // Ensure data is an array
      const toursArray = Array.isArray(data) ? data : [];
      
      // Fetch scene count for each tour with better error handling
      const toursWithSceneCounts = await Promise.allSettled(
        toursArray.map(async (tour) => {
          try {
            const scenes = await tourService.getScenes(tour.id);
            return { ...tour, sceneCount: scenes.length };
          } catch (err) {
            console.warn(`Failed to fetch scenes for tour ${tour.id}:`, err);
            return { ...tour, sceneCount: 0 };
          }
        })
      );
      
      // Extract successful results
      const successfulTours = toursWithSceneCounts
        .filter((result): result is PromiseFulfilledResult<TourWithSceneCount> => 
          result.status === 'fulfilled'
        )
        .map(result => result.value);
      
      setTours(successfulTours);
      
      // Only cache if we have valid data
      if (successfulTours.length > 0) {
        localStorage.setItem('tours_cache', JSON.stringify(successfulTours));
        localStorage.setItem('tours_cache_time', Date.now().toString());
      } else {
        // Clear cache if no tours found
        localStorage.removeItem('tours_cache');
        localStorage.removeItem('tours_cache_time');
      }
      
    } catch (err) {
      console.error('Error fetching tours:', err);
      // Clear cache on error to prevent stale data
      localStorage.removeItem('tours_cache');
      localStorage.removeItem('tours_cache_time');
      if (!silent) {
        throw err;
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Virtual Tours</h2>
          <p className="text-gray-600">Manage your virtual tour collection</p>
        </div>
        
        {/* Skeleton Loading */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, index) => (
            <div
              key={index}
              className="bg-white border border-gray-200 rounded-xl flex flex-col h-full animate-pulse"
            >
              {/* Header Section Skeleton */}
              <div className="p-6 pb-4">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1 pr-2">
                    <div className="h-6 bg-gray-200 rounded w-3/4 mb-2"></div>
                    <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                  </div>
                  <div className="h-6 bg-gray-200 rounded-full w-16 flex-shrink-0"></div>
                </div>
              </div>

              {/* Content Section Skeleton */}
              <div className="px-6 pb-4 flex-1">
                <div className="space-y-3">
                  {/* Scenes count skeleton */}
                  <div className="flex items-center">
                    <div className="w-5 h-5 bg-gray-200 rounded mr-2 flex-shrink-0"></div>
                    <div className="h-4 bg-gray-200 rounded w-20"></div>
                  </div>

                  {/* Tour type skeleton */}
                  <div className="flex items-center">
                    <div className="w-5 h-5 bg-gray-200 rounded mr-2 flex-shrink-0"></div>
                    <div className="h-4 bg-gray-200 rounded w-24"></div>
                  </div>

                  {/* Features skeleton */}
                  <div className="space-y-2 min-h-[4rem]">
                    <div className="flex items-center">
                      <div className="w-5 h-5 bg-gray-200 rounded mr-2 flex-shrink-0"></div>
                      <div className="h-4 bg-gray-200 rounded w-32"></div>
                    </div>
                    <div className="flex items-center">
                      <div className="w-5 h-5 bg-gray-200 rounded mr-2 flex-shrink-0"></div>
                      <div className="h-4 bg-gray-200 rounded w-28"></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer Section Skeleton */}
              <div className="px-6 pb-6 pt-3 border-t border-gray-100 mt-auto">
                <div className="flex items-center justify-between">
                  <div className="h-4 bg-gray-200 rounded w-32"></div>
                  <div className="h-4 bg-gray-200 rounded w-12"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
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
              className="bg-white border border-gray-200 rounded-xl hover:shadow-xl transition-all duration-200 cursor-pointer hover:border-blue-300 flex flex-col h-full"
              onClick={() => router.push(`/admin/tours/${tour.id}`)}
            >
              {/* Header Section - Fixed Height */}
              <div className="p-6 pb-4">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1 pr-2">
                    <h3 className="text-xl font-bold text-gray-900 truncate">{tour.name}</h3>
                    {tour.property_name && (
                      <p className="text-sm text-blue-600 font-medium mt-1">
                        📍 {tour.property_name}
                      </p>
                    )}
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium flex-shrink-0 ${tour.is_published
                      ? 'bg-green-100 text-green-800'
                      : 'bg-yellow-100 text-yellow-800'
                    }`}>
                    {tour.is_published ? 'Published' : 'Draft'}
                  </span>
                </div>
              </div>

              {/* Content Section - Flexible Height */}
              <div className="px-6 pb-4 flex-1">
                <div className="space-y-3">
                  {/* Always show scenes count */}
                  <div className="flex items-center text-gray-700">
                    <svg className="w-5 h-5 mr-2 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="font-medium">Scenes:</span>
                    <span className="ml-1 text-gray-900">{tour.sceneCount ?? 0}</span>
                  </div>

                  {/* Always show tour type */}
                  <div className="flex items-center text-gray-600">
                    {tour.property_name ? (
                      <>
                        <svg className="w-5 h-5 mr-2 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-4m-5 0H3m2 0h3M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 8h1m-1-4h1m4 4h1m-1-4h1" />
                        </svg>
                        <span className="text-sm font-medium text-blue-600">Property Tour</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5 mr-2 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        <span className="text-sm font-medium text-gray-600">Standalone Tour</span>
                      </>
                    )}
                  </div>

                  {/* Features Section - Always show with consistent spacing */}
                  <div className="space-y-2 min-h-[4rem]">
                    {tour.background_audio_url ? (
                      <div className="flex items-center text-green-600">
                        <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 14.142M5 7h4l1 1v8l-1 1H5a1 1 0 01-1-1V8a1 1 0 011-1z" />
                        </svg>
                        <span className="text-sm font-medium">Background audio</span>
                      </div>
                    ) : (
                      <div className="flex items-center text-gray-400">
                        <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 14.142M5 7h4l1 1v8l-1 1H5a1 1 0 01-1-1V8a1 1 0 011-1z" />
                        </svg>
                        <span className="text-sm">No background audio</span>
                      </div>
                    )}

                    {tour.autoplay_enabled ? (
                      <div className="flex items-center text-blue-600">
                        <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1.5a2.5 2.5 0 110 5H9m-3-5a5 5 0 1110 0m-3-5v2M7 10v5a2 2 0 002 2h1" />
                        </svg>
                        <span className="text-sm font-medium">Autoplay enabled</span>
                      </div>
                    ) : (
                      <div className="flex items-center text-gray-400">
                        <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-sm">Manual playback</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer Section - Fixed Height */}
              <div className="px-6 pb-6 pt-3 border-t border-gray-100 mt-auto">
                <div className="flex items-center justify-between text-sm text-gray-500">
                  <span>Created: {new Date(tour.created_at).toLocaleDateString()}</span>
                  <button className="text-blue-600 hover:text-blue-800 font-medium cursor-pointer">
                    Edit →
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}