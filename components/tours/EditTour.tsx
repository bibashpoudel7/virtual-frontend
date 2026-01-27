'use client';

import { useState, useEffect } from 'react';
import { Tour } from '@/types/tour';
import { tourService } from '@/services/tourService';

interface EditTourProps {
  tour: Tour;
  onSuccess?: (updatedTour: Tour) => void;
  onCancel?: () => void;
}

export default function EditTour({ tour, onSuccess, onCancel }: EditTourProps) {
  const [formData, setFormData] = useState({
    name: tour.name || '',
    categories: tour.categories || [],
    background_audio_url: tour.background_audio_url || '',
    is_published: tour.is_published || false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}tours/${tour.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken') || localStorage.getItem('auth_token')}`,
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error('Failed to update tour');
      }

      const updatedTour = await response.json();
      
      if (onSuccess) {
        onSuccess(updatedTour);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update tour');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Edit Tour</h2>
        {onCancel && (
          <button
            onClick={onCancel}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Tour Name */}
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

        {/* Categories */}
        <div>
          <label className="block text-sm font-bold text-gray-900 mb-2">
            Categories (Optional)
          </label>
          <div className="flex flex-wrap gap-2 mb-2 p-2 border border-gray-300 rounded-lg bg-gray-50 min-h-[42px]">
            {(formData.categories || []).map((cat) => (
              <span key={cat} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 capitalize">
                {cat}
                <button
                  type="button"
                  onClick={() => setFormData({
                    ...formData,
                    categories: formData.categories.filter(c => c !== cat)
                  })}
                  className="ml-1.5 text-blue-600 hover:text-blue-900 focus:outline-none cursor-pointer"
                >
                  ×
                </button>
              </span>
            ))}
            {(formData.categories || []).length === 0 && (
              <span className="text-gray-400 text-sm italic py-0.5">No categories selected</span>
            )}
          </div>

          <select
            value=""
            onChange={(e) => {
              const selectedValue = e.target.value;
              if (selectedValue && !formData.categories.includes(selectedValue)) {
                setFormData({
                  ...formData,
                  categories: [...formData.categories, selectedValue]
                });
              }
            }}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 cursor-pointer"
          >
            <option value="">+ Add Category...</option>
            <option value="education">Education</option>
            <option value="college">College</option>
            <option value="hospital">Hospital</option>
            <option value="hotel">Hotel</option>
            <option value="real-estate">Real Estate</option>
            <option value="industry">Industry</option>
            <option value="museum">Museum</option>
            <option value="showroom">Showroom</option>
            <option value="restaurant">Restaurant</option>
            <option value="office">Office</option>
            <option value="retail">Retail</option>
            <option value="event-venue">Event Venue</option>
            <option value="wedding-venue">Wedding Venue</option>
            <option value="gym">Gym</option>
            <option value="spa">Spa</option>
            <option value="apartment">Apartment</option>
            <option value="house">House</option>
            <option value="other">Other</option>
          </select>
          <p className="mt-1 text-xs text-gray-500">Add one or more categories to help organize your tour.</p>
        </div>

        {/* Background Audio */}
        <div>
          <label className="block text-sm font-bold text-gray-900 mb-2">Background Audio URL (Optional)</label>
          <input
            type="url"
            value={formData.background_audio_url}
            onChange={(e) => setFormData({ ...formData, background_audio_url: e.target.value })}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
            placeholder="https://audio.com/your-audio-link or direct audio URL"
          />
        </div>

        {/* Publication Status */}
        <div>
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={formData.is_published}
              onChange={(e) => setFormData({ ...formData, is_published: e.target.checked })}
              className="mr-3 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-sm font-bold text-gray-900">Published</span>
          </label>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {loading ? 'Updating...' : 'Update Tour'}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 cursor-pointer"
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
}