'use client';

import { useState, useEffect } from 'react';
import { Tour } from '@/types/tour';
import { tourService } from '@/services/tourService';
import { useRouter } from 'next/navigation';
import { Icon } from '@iconify/react';
import DeleteModal from '@/components/modals/DeleteModal';
import { toast } from 'react-toastify';

interface TourWithSceneCount extends Tour {
  sceneCount: number;
}

export default function TourList() {
  const [tours, setTours] = useState<TourWithSceneCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [updatingTours, setUpdatingTours] = useState<Set<string>>(new Set());
  const [visibilityDropdowns, setVisibilityDropdowns] = useState<Set<string>>(new Set());
  const [deleteModal, setDeleteModal] = useState<{
    open: boolean;
    tourId: string | null;
    tourName: string;
    isLoading: boolean;
  }>({
    open: false,
    tourId: null,
    tourName: '',
    isLoading: false
  });
  const router = useRouter();

  useEffect(() => {
    // Get user role and ID from localStorage
    const userData = localStorage.getItem('user_data');
    if (userData) {
      try {
        const user = JSON.parse(userData);
        const role = user.roles?.toString() || user.role?.toString() || null;
        setUserRole(role);
        setCurrentUserId(user.id || user.user_id || null);
      } catch (error) {
        console.error('Error parsing user data:', error);
      }
    }
    
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
        toursArray.map(async (tour): Promise<TourWithSceneCount> => {
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
      const successfulTours: TourWithSceneCount[] = [];
      toursWithSceneCounts.forEach(result => {
        if (result.status === 'fulfilled') {
          successfulTours.push(result.value);
        }
      });
      
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

  // Toggle visibility dropdown
  const toggleVisibilityDropdown = (tourId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    
    setVisibilityDropdowns(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tourId)) {
        newSet.delete(tourId);
      } else {
        newSet.clear(); // Close other dropdowns
        newSet.add(tourId);
      }
      return newSet;
    });
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      
      // Only close dropdown if clicking outside dropdown container AND not on delete button
      const isInsideDropdown = target.closest('.dropdown-container');
      const isDeleteButton = target.closest('[data-delete-button]');
      
      if (!isInsideDropdown && !isDeleteButton) {
        setVisibilityDropdowns(new Set());
      }
    };
    
    // Use mousedown instead of click to prevent conflicts
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Superadmin-only function to change tour publication status
  const changePublishStatus = async (tourId: string, newStatus: boolean, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent card click
    
    if (userRole !== '1') {
      toast.error('Only superadmins can change publication status');
      return;
    }
    
    // Close dropdown
    setVisibilityDropdowns(new Set());
    
    setUpdatingTours(prev => new Set(prev).add(tourId));
    
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}tours/${tourId}/publish`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken') || localStorage.getItem('auth_token')}`,
        },
        body: JSON.stringify({
          is_published: newStatus
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to update publication status');
      }
      
      // Update the tour in the local state
      setTours(prevTours => 
        prevTours.map(tour => 
          tour.id === tourId 
            ? { ...tour, is_published: newStatus }
            : tour
        )
      );
      
      // Show success toast
      toast.success(`Tour ${newStatus ? 'published' : 'unpublished'} successfully!`);
      
    } catch (error) {
      console.error('Error updating publication status:', error);
      toast.error('Failed to update publication status');
    } finally {
      setUpdatingTours(prev => {
        const newSet = new Set(prev);
        newSet.delete(tourId);
        return newSet;
      });
    }
  };

  // Function to open delete modal (for superadmins and tour owners)
  const openDeleteModal = (tourId: string, tourName: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent card click
    event.preventDefault(); // Prevent any default behavior
    
    // Close any open dropdowns first
    setVisibilityDropdowns(new Set());
    
    setDeleteModal({
      open: true,
      tourId,
      tourName,
      isLoading: false
    });
  };

  // Function to confirm delete tour (for superadmins and tour owners)
  const confirmDeleteTour = async () => {
    if (!deleteModal.tourId) return;
    
    setDeleteModal(prev => ({ ...prev, isLoading: true }));
    
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}tours/${deleteModal.tourId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken') || localStorage.getItem('auth_token')}`,
        },
      });
      
      if (!response.ok) {
        // Try to get error message from response
        let errorMessage = 'Failed to delete tour';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          // If response is not JSON, use status text
          errorMessage = response.statusText || errorMessage;
        }
        throw new Error(errorMessage);
      }
      
      // Remove the tour from the local state
      setTours(prevTours => prevTours.filter(tour => tour.id !== deleteModal.tourId));
      
      // Show success toast
      toast.success(`Tour "${deleteModal.tourName}" deleted successfully!`);
      
      // Close modal
      setDeleteModal({
        open: false,
        tourId: null,
        tourName: '',
        isLoading: false
      });
      
    } catch (error) {
      console.error('Error deleting tour:', error);
      
      // Show error toast
      toast.error(error instanceof Error ? error.message : 'Failed to delete tour');
      
      setDeleteModal(prev => ({ ...prev, isLoading: false }));
    }
  };

  // Close delete modal
  const closeDeleteModal = () => {
    if (deleteModal.isLoading) return; // Prevent closing while deleting
    
    setDeleteModal({
      open: false,
      tourId: null,
      tourName: '',
      isLoading: false
    });
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
              <div className="p-5 pb-4">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1 min-w-0 pr-4">
                    <div className="h-6 bg-gray-200 rounded w-3/4 mb-2"></div>
                    <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="h-6 bg-gray-200 rounded-full w-16"></div>
                    <div className="flex gap-1">
                      <div className="w-7 h-7 bg-gray-200 rounded"></div>
                      <div className="w-7 h-7 bg-gray-200 rounded"></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Content Section Skeleton */}
              <div className="px-5 pb-4 flex-1">
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
              <div className="px-5 pb-5 pt-3 border-t border-gray-100 mt-auto">
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
        <div className="flex items-center justify-between">
          <p className="text-gray-600">
            {userRole === '1' ? 'Manage all virtual tours (Superadmin)' : 'Manage your virtual tour collection'}
          </p>
          {/* {userRole === '1' && (
            <div className="text-sm text-blue-600 font-medium">
              🔧 Superadmin Mode: You can see and manage all tours
            </div>
          )} */}
        </div>
      </div>

      {tours.length === 0 ? (
        <div className="text-center py-12">
          <div className="mx-auto w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <Icon icon="material-symbols:video-library" className="w-12 h-12 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No tours yet</h3>
          <p className="text-gray-500 mb-4">Get started by creating your first virtual tour</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tours.map((tour) => (
            <div
              key={tour.id}
              className="bg-white border border-gray-200 rounded-xl hover:shadow-lg transition-all duration-200 cursor-pointer hover:border-blue-300 flex flex-col h-full relative group"
              onClick={() => router.push(`/admin/tours/${tour.id}`)}
            >
              {/* Loading overlay for updating tours */}
              {updatingTours.has(tour.id) && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm rounded-xl flex items-center justify-center z-10">
                  <Icon icon="eos-icons:loading" className="w-8 h-8 text-blue-600" />
                </div>
              )}
              
              {/* Header Section - Fixed Height */}
              <div className="p-5 pb-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0 pr-4">
                    <h3 className="text-xl font-bold text-gray-900 truncate group-hover:text-blue-600 transition-colors">{tour.name}</h3>
                    {tour.property_name && (
                      <p className="text-sm text-blue-600 font-medium mt-1 flex items-center">
                        <Icon icon="material-symbols:location-on" className="w-4 h-4 mr-1 flex-shrink-0" />
                        <span className="truncate">{tour.property_name}</span>
                      </p>
                    )}
                  </div>
                  
                  {/* Right side - Status and Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Status Badge */}
                    <span 
                      className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                        tour.is_published
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {tour.is_published ? 'Published' : 'Draft'}
                    </span>
                    
                    {/* Actions for Superadmins and Tour Owners */}
                    {(userRole === '1' || tour.user_id === currentUserId) && (
                      <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                        {/* Visibility Toggle - Only for Superadmins */}
                        {userRole === '1' && (
                          <div className="relative dropdown-container">
                            <button
                              onClick={(e) => toggleVisibilityDropdown(tour.id, e)}
                              disabled={updatingTours.has(tour.id)}
                              className="p-1.5 rounded-md bg-blue-50 text-blue-600 hover:bg-blue-100 hover:scale-105 transition-all disabled:opacity-50 cursor-pointer"
                              title="Change visibility"
                            >
                              <Icon icon="material-symbols:visibility-outline" className="w-4 h-4" />
                            </button>
                            
                            {/* Dropdown Menu */}
                            {visibilityDropdowns.has(tour.id) && (
                              <div 
                                className="absolute right-0 top-full mt-2 bg-white border border-gray-200 rounded-lg shadow-xl z-50 min-w-[140px] overflow-hidden"
                                style={{ position: 'absolute', zIndex: 9999 }}
                              >
                                <button
                                  onClick={(e) => changePublishStatus(tour.id, true, e)}
                                  disabled={tour.is_published}
                                  className={`w-full px-4 py-3 text-left text-sm hover:bg-gray-50 flex items-center gap-3 transition-colors ${
                                    tour.is_published ? 'text-gray-400 cursor-not-allowed bg-gray-50' : 'text-green-700 hover:bg-green-50 cursor-pointer'
                                  }`}
                                >
                                  <Icon icon="material-symbols:visibility" className="w-4 h-4" />
                                  Published
                                  {tour.is_published && <Icon icon="material-symbols:check" className="w-4 h-4 ml-auto text-green-600" />}
                                </button>
                                <div className="border-t border-gray-100"></div>
                                <button
                                  onClick={(e) => changePublishStatus(tour.id, false, e)}
                                  disabled={!tour.is_published}
                                  className={`w-full px-4 py-3 text-left text-sm hover:bg-gray-50 flex items-center gap-3 transition-colors ${
                                    !tour.is_published ? 'text-gray-400 cursor-not-allowed bg-gray-50' : 'text-yellow-700 hover:bg-yellow-50 cursor-pointer'
                                  }`}
                                >
                                  <Icon icon="material-symbols:visibility-off" className="w-4 h-4" />
                                  Draft
                                  {!tour.is_published && <Icon icon="material-symbols:check" className="w-4 h-4 ml-auto text-yellow-600" />}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                        
                        {/* Delete Button - For both Superadmins and Tour Owners */}
                        <button
                          onClick={(e) => openDeleteModal(tour.id, tour.name, e)}
                          className="p-1.5 rounded-md bg-red-50 text-red-600 hover:bg-red-100 hover:scale-105 transition-all cursor-pointer"
                          title="Delete tour"
                          data-delete-button
                        >
                          <Icon icon="material-symbols:delete" className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Content Section*/}
              <div className="px-5 pb-4 flex-1">
                <div className="space-y-3">
                  {/* Always show scenes count */}
                  <div className="flex items-center text-gray-700">
                    <Icon icon="material-symbols:image" className="w-5 h-5 mr-2 text-gray-400 flex-shrink-0" />
                    <span className="font-medium">Scenes:</span>
                    <span className="ml-1 text-gray-900">{tour.sceneCount}</span>
                  </div>

                  {/* Always show tour type */}
                  <div className="flex items-center text-gray-600">
                    {tour.property_name ? (
                      <>
                        <Icon icon="material-symbols:business" className="w-5 h-5 mr-2 text-blue-500 flex-shrink-0" />
                        <span className="text-sm font-medium text-blue-600">Property Tour</span>
                      </>
                    ) : (
                      <>
                        <Icon icon="material-symbols:explore" className="w-5 h-5 mr-2 text-gray-500 flex-shrink-0" />
                        <span className="text-sm font-medium text-gray-600">Standalone Tour</span>
                      </>
                    )}
                  </div>

                  {/* Features Section */}
                  <div className="space-y-2 min-h-[4rem]">
                    {tour.background_audio_url ? (
                      <div className="flex items-center text-green-600">
                        <Icon icon="material-symbols:volume-up" className="w-5 h-5 mr-2 flex-shrink-0" />
                        <span className="text-sm font-medium">Background audio</span>
                      </div>
                    ) : (
                      <div className="flex items-center text-gray-400">
                        <Icon icon="material-symbols:volume-off" className="w-5 h-5 mr-2 flex-shrink-0" />
                        <span className="text-sm">No background audio</span>
                      </div>
                    )}

                    {tour.autoplay_enabled ? (
                      <div className="flex items-center text-blue-600">
                        <Icon icon="material-symbols:play-circle" className="w-5 h-5 mr-2 flex-shrink-0" />
                        <span className="text-sm font-medium">Autoplay enabled</span>
                      </div>
                    ) : (
                      <div className="flex items-center text-gray-400">
                        <Icon icon="material-symbols:pause-circle" className="w-5 h-5 mr-2 flex-shrink-0" />
                        <span className="text-sm">Manual playback</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer Section */}
              <div className="px-5 pb-5 pt-3 border-t border-gray-100 mt-auto">
                <div className="flex items-center justify-between text-sm text-gray-500">
                  <span className="flex items-center">
                    <Icon icon="material-symbols:calendar-today" className="w-4 h-4 mr-1" />
                    Created: {new Date(tour.created_at).toLocaleDateString()}
                  </span>
                  <button className="text-blue-600 hover:text-blue-800 font-medium cursor-pointer flex items-center">
                    Edit
                    <Icon icon="material-symbols:arrow-forward" className="w-4 h-4 ml-1" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Delete Modal */}
      <DeleteModal
        open={deleteModal.open}
        isLoading={deleteModal.isLoading}
        title="Delete Virtual Tour"
        message={`Are you sure you want to delete "${deleteModal.tourName}"? This action cannot be undone and will permanently remove all scenes, hotspots, and associated data.`}
        onConfirm={confirmDeleteTour}
        onCancel={closeDeleteModal}
      />
    </div>
  );
}