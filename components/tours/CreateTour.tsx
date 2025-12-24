'use client';

import { useState, useEffect } from 'react';
import { Tour, Property } from '@/types/tour';
import { tourService } from '@/services/tourService';

interface CreateTourProps {
  propertyId?: string;
  onSuccess?: (tour: Tour) => void;
  preloadedData?: {
    userRole: string | null;
    isVenueCompany: boolean;
    properties: Property[];
    dataLoaded: boolean;
  };
}

export default function CreateTour({ propertyId, onSuccess, preloadedData }: CreateTourProps) {
  const [formData, setFormData] = useState({
    name: '',
    property_id: undefined as string | undefined,
    is_published: false,
    autoplay_enabled: false,
    default_fov: 75,
    default_yaw_speed: 0.01,
    default_pitch_speed: 0.0,
    background_audio_url: '',
  });
  const [properties, setProperties] = useState<Property[]>(preloadedData?.properties || []);
  const [loading, setLoading] = useState(false);
  const [loadingProperties, setLoadingProperties] = useState(!preloadedData?.dataLoaded);
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(preloadedData?.userRole || null);
  const [isVenueCompany, setIsVenueCompany] = useState<boolean>(preloadedData?.isVenueCompany || false);

  // Get user role from localStorage (fallback if not preloaded)
  useEffect(() => {
    if (!preloadedData?.userRole) {
      const userData = localStorage.getItem('user_data');
      if (userData) {
        try {
          const user = JSON.parse(userData);
          setUserRole(user.roles?.toString() || user.role?.toString() || null);
        } catch (error) {
          console.error('Error parsing user data:', error);
        }
      }
    }
  }, [preloadedData?.userRole]);

  // Check if user is a venue company (fallback if not preloaded)
  useEffect(() => {
    if (preloadedData?.dataLoaded) {
      // Use preloaded data
      setIsVenueCompany(preloadedData.isVenueCompany);
      setProperties(preloadedData.properties);
      setLoadingProperties(false);
      return;
    }

    // Fallback: load data if not preloaded
    const checkVenueCompany = async () => {
      if (userRole === '3') { // VENDOR
        try {
          const companyInfo = await tourService.getCompanyInfo();
          setIsVenueCompany(companyInfo.isVenueCompany || false);
        } catch (error) {
          console.error('Error getting company info:', error);
          setIsVenueCompany(false);
        }
      } else {
        setIsVenueCompany(false);
      }
    };

    if (userRole && !preloadedData?.dataLoaded) {
      checkVenueCompany();
    }
  }, [userRole, preloadedData]);

  // Determine if user can create property-based tours
  const canCreatePropertyTours = (userRole === '1') || (userRole === '3' && isVenueCompany); // SUPERADMIN or VENUE VENDOR
  const isCustomer = userRole === '2'; // CUSTOMER

  // Load approved properties (fallback if not preloaded)
  useEffect(() => {
    if (preloadedData?.dataLoaded) {
      // Data already loaded, skip
      return;
    }

    if (!canCreatePropertyTours) {
      setLoadingProperties(false);
      return;
    }

    const loadProperties = async () => {
      try {
        setLoadingProperties(true);
        const response = await tourService.getApprovedProperties();
        setProperties(response.properties);
        
        // If propertyId is provided, pre-select it
        if (propertyId) {
          const property = response.properties.find(p => p.id === propertyId);
          if (property) {
            setFormData(prev => ({ ...prev, property_id: propertyId }));
          }
        }
      } catch (err) {
        // Don't show error for property loading failure - just log it
        console.error('Error loading properties:', err);
        setProperties([]); // Set empty array so form still works
      } finally {
        setLoadingProperties(false);
      }
    };

    loadProperties();
  }, [propertyId, canCreatePropertyTours, preloadedData?.dataLoaded]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Create tour with or without property ID
      const tourData = {
        ...formData,
        background_audio_url: formData.background_audio_url || undefined,
      };

      // If no property is selected, it becomes a standalone tour
      if (!formData.property_id) {
        delete tourData.property_id;
      }

      const tour = await tourService.createTour(tourData);
      
      // Reset form
      setFormData({
        name: '',
        property_id: undefined,
        is_published: false,
        autoplay_enabled: false,
        default_fov: 75,
        default_yaw_speed: 0.01,
        default_pitch_speed: 0.0,
        background_audio_url: '',
      });
      
      // Call success callback to switch back to list view
      if (onSuccess) {
        onSuccess(tour);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create tour');
    } finally {
      setLoading(false);
    }
  };

  if (loadingProperties) {
    return (
      <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded mb-6"></div>
          <div className="space-y-4">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-10 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow">
      <h2 className="text-2xl font-bold mb-6 text-gray-900">Create New Virtual Tour</h2>
      
      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {/* Property Selection - Optional for all users */}
        {canCreatePropertyTours && (
          <div>
            <label className="block text-sm font-bold text-gray-900 mb-2">
              Select Property (Optional)
            </label>
            <select
              value={formData.property_id || ''}
              onChange={(e) => setFormData({ 
                ...formData, 
                property_id: e.target.value || undefined 
              })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
            >
              <option value="">Choose a venue property (or leave blank for standalone tour)...</option>
              {properties?.map((property) => (
                <option 
                  key={property.id} 
                  value={property.id}
                  disabled={property.hasTour}
                >
                  {property?.propertyName} - {property?.companyName}
                  {property?.hasTour ? ' (Already has tour)' : ''}
                </option>
              ))}
            </select>
            {properties?.length === 0 && (
              <p className="mt-1 text-sm text-gray-600">
                No approved venue properties found. You can still create a standalone virtual tour.
              </p>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-bold text-gray-900 mb-2">
            Tour Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
            placeholder="Enter tour name"
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-900 mb-2">Background Audio URL (Optional)</label>
          <input
            type="url"
            value={formData.background_audio_url}
            onChange={(e) => setFormData({ ...formData, background_audio_url: e.target.value })}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
            placeholder="https://audio.com/your-audio-link or direct audio URL"
          />
          <p className="mt-1 text-xs text-gray-600">
            💡 Supports audio.com, jumpshare.com, or direct audio file URLs. Leave empty for default background music.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-bold text-gray-900 mb-2">Default FOV</label>
            <input
              type="number"
              value={formData.default_fov}
              onChange={(e) => setFormData({ 
                ...formData, 
                default_fov: parseFloat(e.target.value) 
              })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
              min="30"
              max="120"
              step="1"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-900 mb-2">Yaw Speed</label>
            <input
              type="number"
              value={formData.default_yaw_speed}
              onChange={(e) => setFormData({ 
                ...formData, 
                default_yaw_speed: parseFloat(e.target.value) 
              })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
              step="0.001"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-900 mb-2">Pitch Speed</label>
            <input
              type="number"
              value={formData.default_pitch_speed}
              onChange={(e) => setFormData({ 
                ...formData, 
                default_pitch_speed: parseFloat(e.target.value) 
              })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
              step="0.001"
            />
          </div>
        </div>

        <div className="space-y-3">
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={formData.is_published}
              onChange={(e) => setFormData({ ...formData, is_published: e.target.checked })}
              className="mr-3 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-sm font-bold text-gray-900">Publish immediately</span>
          </label>

          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={formData.autoplay_enabled}
              onChange={(e) => setFormData({ ...formData, autoplay_enabled: e.target.checked })}
              className="mr-3 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-sm font-bold text-gray-900">Enable autoplay</span>
          </label>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {loading ? 'Creating Tour...' : 'Create Virtual Tour'}
        </button>
      </div>
    </form>
  );
}