'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Tour } from '@/types/tour';
import { tourService } from '@/services/tourService';
import { useRouter } from 'next/navigation';
import { Icon } from '@iconify/react';
import DeleteModal from '@/components/modals/DeleteModal';
import { toast } from 'react-toastify';
import TourSkeleton from './TourSkeleton';
import TourPagination from './TourPagination';

interface TourWithSceneCount extends Tour {
  sceneCount: number;
}

interface PaginationData {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export default function TourList() {
  const [tours, setTours] = useState<TourWithSceneCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [paginationLoading, setPaginationLoading] = useState(false);
  const [frontendPaginationLoading, setFrontendPaginationLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [updatingTours, setUpdatingTours] = useState<Set<string>>(new Set());
  const [visibilityDropdowns, setVisibilityDropdowns] = useState<Set<string>>(new Set());
  const [pagination, setPagination] = useState<PaginationData>({
    page: 1,
    limit: 10,
    total: 0,
    total_pages: 0,
  });
  const [frontendPage, setFrontendPage] = useState(1); // Frontend pagination (6 per page)
  const FRONTEND_LIMIT = 6; // Display 6 tours per page in UI
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
        setUserRole(user.role === 'admin' ? 'admin' : 'user');
        setCurrentUserId(user.id || null);
      } catch (error) {
        console.error('Error parsing user data:', error);
      }
    }

    loadTours(1, true, true);

    // Auto-refresh when user returns to tab (visibility change)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // User returned to tab, refresh data silently
        loadTours(1, true, true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const loadTours = async (page: number = 1, showLoading: boolean = true, replace: boolean = true) => {
    try {
      if (showLoading) {
        if (tours.length === 0) {
          setLoading(true);
        } else {
          setPaginationLoading(true);
        }
      }
      setError(null);

      // Backend fetches 10 tours per page
      const response = await tourService.listTours(page, 10);

      // New format with pagination
      const toursData = response.data || [];
      const paginationData = response.pagination || {
        page: 1,
        limit: 10,
        total: 0,
        total_pages: 0,
      };

      // Map tours and extract scene count from tour_scenes array populated by backend
      const successfulTours: TourWithSceneCount[] = toursData.map(tour => ({
        ...tour,
        sceneCount: tour.tour_scenes?.length || 0
      }));

      if (replace) {
        // Replace tours (for initial load or page navigation)
        setTours(successfulTours);
      } else {
        // Accumulate tours (for loading more data)
        setTours(prevTours => {
          // Merge tours, avoiding duplicates
          const existingIds = new Set(prevTours.map(t => t.id));
          const newTours = successfulTours.filter(t => !existingIds.has(t.id));
          return [...prevTours, ...newTours];
        });
      }

      setPagination(paginationData);

    } catch (err) {
      console.error('Error fetching tours:', err);
      setError(err instanceof Error ? err.message : 'Failed to load tours');
    } finally {
      setLoading(false);
      setPaginationLoading(false);
    }
  };

  const handleBackendPageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= pagination.total_pages) {
      loadTours(newPage, false, true);
      setFrontendPage(1); // Reset frontend page when backend page changes
    }
  };

  const handleFrontendPageChange = async (newPage: number) => {
    // Calculate total frontend pages based on total tours from backend
    const totalFrontendPages = Math.ceil(pagination.total / FRONTEND_LIMIT);

    if (newPage < 1 || newPage > totalFrontendPages) {
      return; // Invalid page
    }

    // Show loading for smooth transition
    setFrontendPaginationLoading(true);

    // Calculate which tours we need for this frontend page
    const startTourIndex = (newPage - 1) * FRONTEND_LIMIT;
    const endTourIndex = startTourIndex + FRONTEND_LIMIT - 1;

    // Check if we have enough tours loaded to display this page
    const toursNeeded = endTourIndex + 1;
    const toursAvailable = tours.length;

    if (toursNeeded > toursAvailable && pagination.page < pagination.total_pages) {
      const backendPageNeeded = Math.ceil(toursNeeded / 10); // Backend loads 10 per page

      if (backendPageNeeded > pagination.page) {
        await loadTours(backendPageNeeded, false, false);
      }
    }

    // Small delay for smooth skeleton transition
    setTimeout(() => {
      setFrontendPage(newPage);
      setFrontendPaginationLoading(false);
    }, 300);
  };

  // Calculate tours to display based on frontend pagination
  const startIndex = (frontendPage - 1) * FRONTEND_LIMIT;
  const endIndex = startIndex + FRONTEND_LIMIT;
  const displayedTours = tours.slice(startIndex, endIndex);

  // Calculate total frontend pages based on total tours from backend
  const frontendTotalPages = Math.ceil(pagination.total / FRONTEND_LIMIT);

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

  // Admins and the tour's owner can change publication status (the API enforces this too)
  const changePublishStatus = async (tourId: string, newStatus: boolean, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent card click

    const target = tours.find(t => t.id === tourId);
    if (userRole !== 'admin' && target?.user_id !== currentUserId) {
      toast.error('Only admins and the tour owner can change publication status');
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

  // Toggle featured status for homepage
  const handleToggleFeatured = async (tourId: string, currentStatus: boolean, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent card click

    // If the tour is already featured, do nothing (prevent accidental unfeaturing)
    if (currentStatus) {
      return;
    }

    // Only superadmins or tour owners can feature tours (logic handled in backend too)
    setUpdatingTours(prev => new Set(prev).add(tourId));

    try {
      const newStatus = !currentStatus;
      await tourService.toggleFeaturedStatus(tourId, newStatus);

      // Update the tours in state
      setTours(prevTours =>
        prevTours.map(tour => {
          if (tour.id === tourId) {
            return { ...tour, is_featured_on_homepage: newStatus };
          }
          // If we just featured a tour, unfeature all others locally (since backend only allows one)
          if (newStatus && tour.is_featured_on_homepage) {
            return { ...tour, is_featured_on_homepage: false };
          }
          return tour;
        })
      );

      toast.success(newStatus ? 'Tour featured on homepage!' : 'Tour unfeatured from homepage');

    } catch (error) {
      console.error('Error toggling featured status:', error);
      toast.error('Failed to update featured status');
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

      // Reload tours if current page becomes empty
      if (tours.length === 1 && pagination.page > 1) {
        // If this was the last tour on a page > 1, go to previous page
        loadTours(pagination.page - 1, false, true);
      } else {
        // Otherwise just reload current page
        loadTours(pagination.page, false, true);
      }

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
        <TourSkeleton count={6} />
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
            {userRole === 'admin' ? 'Manage all virtual tours (Admin)' : 'Manage your virtual tour collection'}
          </p>
          {pagination.total > 0 && (
            <div className="text-sm text-gray-500">
              {pagination.total} total tours
            </div>
          )}
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
        <>
          {/* Show skeleton during pagination loading - separate from actual cards */}
          {(paginationLoading || frontendPaginationLoading) ? (
            <TourSkeleton count={6} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {displayedTours?.map((tour) => (
                <div
                  key={tour.id}
                  className="group bg-white border border-gray-200 rounded-xl hover:shadow-xl transition-all duration-200 cursor-pointer hover:border-amber-400 flex flex-col h-full relative overflow-hidden"
                  onClick={() => router.push(`/admin/tours/${tour.id}`)}
                >
                  {/* Loading overlay for updating tours */}
                  {updatingTours.has(tour.id) && (
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm rounded-xl flex items-center justify-center z-20">
                      <Icon icon="eos-icons:loading" className="w-8 h-8 text-amber-600" />
                    </div>
                  )}

                  {/* Tour Thumbnail Banner */}
                  <div className="relative h-44 w-full bg-gray-100 overflow-hidden border-b border-gray-100 flex-shrink-0">
                    {(tour.cover_image_url || tour.thumbnail_url) ? (
                      <Image
                        src={tour.cover_image_url || tour.thumbnail_url || ''}
                        alt={tour.name}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-300"
                        unoptimized
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-amber-500/20 via-yellow-500/10 to-amber-700/20 flex flex-col items-center justify-center text-amber-700/60">
                        <Icon icon="material-symbols:360" className="w-10 h-10 mb-1" />
                        <span className="text-xs font-semibold">360° Virtual Tour</span>
                      </div>
                    )}
                    {/* Status Badge overlay */}
                    <div className="absolute top-3 left-3 z-10">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-semibold backdrop-blur-md shadow-sm ${tour.is_published
                          ? 'bg-emerald-600/90 text-white'
                          : 'bg-amber-600/90 text-white'
                          }`}
                      >
                        {tour.is_published ? 'Published' : 'Draft'}
                      </span>
                    </div>

                    {/* Location Badge overlay if set */}
                    {tour.location && (
                      <div className="absolute bottom-2 left-3 right-3 z-10">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-black/60 backdrop-blur-md text-white text-xs font-medium truncate max-w-full">
                          <Icon icon="material-symbols:location-on" className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                          <span className="truncate">{tour.location}</span>
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Header Section */}
                  <div className="p-5 pb-3">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0 pr-3">
                        <div className="relative group/title">
                          <h3 className="text-xl font-bold text-gray-900 truncate group-hover:text-amber-600 transition-colors">
                            {tour.name}
                          </h3>
                          
                          {/* Tooltip for full tour name when truncated */}
                          <div className="absolute bottom-full left-0 mb-2 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg opacity-0 group-hover/title:opacity-100 transition-opacity duration-200 pointer-events-none z-50 whitespace-nowrap">
                            {tour.name}
                            <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                          </div>
                        </div>
                      </div>

                      {/* Right side - Status and Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Category Badge - Show first category if any exist */}
                        {tour?.categories && tour?.categories?.length > 0 && tour?.categories[0] !== 'other' && (
                          <div className="relative">
                            <span className="group px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-900 capitalize cursor-default border border-amber-200/60">
                              {tour?.categories[0]}
                              {tour?.categories?.length > 1 && (
                                <span className="ml-1 text-amber-700">+{tour?.categories?.length - 1}</span>
                              )}
                              
                              {/* Tooltip showing all categories on hover */}
                              {tour?.categories?.length > 1 && (
                                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50 min-w-max">
                                  <div className="text-center">
                                    {tour?.categories?.map((cat, index) => (
                                      <span key={index} className="capitalize">
                                        {cat}{index < (tour?.categories?.length || 0) - 1 ? ', ' : ''}
                                      </span>
                                    ))}
                                  </div>
                                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                                </div>
                              )}
                            </span>
                          </div>
                        )}

                        {/* Actions for Superadmins and Tour Owners */}
                        {(userRole === 'admin' || tour?.user_id === currentUserId) && (
                          <div className="flex items-center gap-1 opacity-70 hover:opacity-100 transition-opacity">
                            {/* Visibility Toggle - admins and tour owners */}
                            {(userRole === 'admin' || tour?.user_id === currentUserId) && (
                              <div className="relative dropdown-container">
                                <button
                                  onClick={(e) => toggleVisibilityDropdown(tour.id, e)}
                                  disabled={updatingTours.has(tour.id)}
                                  className="p-1.5 rounded-md bg-amber-50 text-amber-700 hover:bg-amber-100 hover:scale-105 transition-all disabled:opacity-50 cursor-pointer"
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
                                      className={`w-full px-4 py-3 text-left text-sm hover:bg-gray-50 flex items-center gap-3 transition-colors ${tour.is_published ? 'text-gray-400 cursor-not-allowed bg-gray-50' : 'text-green-700 hover:bg-green-50 cursor-pointer'
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
                                      className={`w-full px-4 py-3 text-left text-sm hover:bg-gray-50 flex items-center gap-3 transition-colors ${!tour.is_published ? 'text-gray-400 cursor-not-allowed bg-gray-50' : 'text-yellow-700 hover:bg-yellow-50 cursor-pointer'
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

                            {/* Featured Button */}
                            <button
                              onClick={(e) => handleToggleFeatured(tour.id, tour.is_featured_on_homepage, e)}
                              disabled={updatingTours.has(tour.id)}
                              className={`p-1.5 rounded-md transition-all cursor-pointer hover:scale-110 ${tour.is_featured_on_homepage
                                ? 'bg-amber-100 text-amber-700 shadow-sm'
                                : 'bg-gray-50 text-gray-400 hover:bg-amber-50 hover:text-amber-600'
                                }`}
                              title={tour.is_featured_on_homepage ? "Unfeature from homepage" : "Feature on homepage"}
                            >
                              <Icon
                                icon={tour.is_featured_on_homepage ? "material-symbols:star" : "material-symbols:star-outline"}
                                className="w-4 h-4"
                              />
                            </button>

                            {/* Delete Button */}
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

                    {/* SEO Description snippet */}
                    {tour.description && (
                      <p className="text-xs text-gray-500 line-clamp-2 mt-1">
                        {tour.description}
                      </p>
                    )}
                  </div>

                  {/* Content Section*/}
                  <div className="px-5 pb-4 flex-1">
                    <div className="space-y-2.5">
                      {/* Scenes count */}
                      <div className="flex items-center text-gray-700 text-sm">
                        <Icon icon="material-symbols:image" className="w-4 h-4 mr-2 text-gray-400 flex-shrink-0" />
                        <span className="font-medium text-gray-600">Scenes:</span>
                        <span className="ml-1 text-gray-900 font-semibold">{tour.sceneCount}</span>
                      </div>

                      {/* Features Section */}
                      <div className="space-y-1.5">
                        {tour.background_audio_url ? (
                          <div className="flex items-center text-emerald-600 text-xs">
                            <Icon icon="material-symbols:volume-up" className="w-4 h-4 mr-2 flex-shrink-0" />
                            <span className="font-medium">Background audio enabled</span>
                          </div>
                        ) : (
                          <div className="flex items-center text-gray-400 text-xs">
                            <Icon icon="material-symbols:volume-off" className="w-4 h-4 mr-2 flex-shrink-0" />
                            <span>No background audio</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Footer Section */}
                  <div className="px-5 pb-4 pt-3 border-t border-gray-100 mt-auto">
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span className="flex items-center">
                        <Icon icon="material-symbols:calendar-today" className="w-3.5 h-3.5 mr-1" />
                        {new Date(tour.created_at).toLocaleDateString()}
                      </span>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/admin/tours/${tour.id}?tab=edit`);
                        }}
                        className="text-amber-700 hover:text-amber-900 font-semibold cursor-pointer flex items-center gap-1 group/btn"
                      >
                        Edit Details &amp; SEO
                        <Icon icon="material-symbols:arrow-forward" className="w-3.5 h-3.5 group-hover/btn:translate-x-0.5 transition-transform" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Clean Pagination - No descriptive text */}
          {frontendTotalPages > 1 && (
            <div className="mt-8 flex justify-center">
              <TourPagination
                currentPage={frontendPage}
                totalPages={frontendTotalPages}
                hasNext={frontendPage < frontendTotalPages}
                hasPrev={frontendPage > 1}
                onPageChange={handleFrontendPageChange}
                loading={frontendPaginationLoading || paginationLoading}
              />
            </div>
          )}
        </>
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