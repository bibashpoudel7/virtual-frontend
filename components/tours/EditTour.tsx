'use client';

import { useState } from 'react';
import { Tour, Scene } from '@/types/tour';
import { MapPin, Image as ImageIcon, Music, Globe, Check, Sparkles, X } from 'lucide-react';
import AudioUploader from '@/components/ui/AudioUploader';
import ThumbnailUploader from '@/components/ui/ThumbnailUploader';

interface EditTourProps {
  tour: Tour;
  scenes?: Scene[];
  onSuccess?: (updatedTour: Tour) => void;
  onCancel?: () => void;
}

const CATEGORY_OPTIONS = [
  { value: 'restaurant', label: 'Restaurant & Dining' },
  { value: 'hotel', label: 'Hotel & Resort' },
  { value: 'wedding-venue', label: 'Wedding Venue' },
  { value: 'event-venue', label: 'Event Venue' },
  { value: 'cafe', label: 'Cafe & Bar' },
  { value: 'showroom', label: 'Showroom' },
  { value: 'real-estate', label: 'Real Estate' },
  { value: 'apartment', label: 'Apartment' },
  { value: 'house', label: 'House / Villa' },
  { value: 'hospital', label: 'Hospital & Clinic' },
  { value: 'education', label: 'Education & Campus' },
  { value: 'museum', label: 'Museum & Gallery' },
  { value: 'spa', label: 'Spa & Wellness' },
  { value: 'gym', label: 'Gym & Fitness' },
  { value: 'retail', label: 'Retail & Store' },
  { value: 'office', label: 'Office' },
  { value: 'other', label: 'Other' },
];

export default function EditTour({ tour, scenes = [], onSuccess, onCancel }: EditTourProps) {
  const [formData, setFormData] = useState({
    name: tour.name || '',
    description: tour.description || '',
    location: tour.location || '',
    cover_image_url: tour.cover_image_url || '',
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
      const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5555/api/';
      const separator = baseUrl.endsWith('/') ? '' : '/';
      const token = localStorage.getItem('accessToken') || localStorage.getItem('auth_token');

      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        location: formData.location.trim() || null,
        cover_image_url: formData.cover_image_url.trim() || null,
        categories: formData.categories,
        background_audio_url: formData.background_audio_url.trim() || null,
        is_published: formData.is_published,
      };

      const response = await fetch(`${baseUrl}${separator}tours/${tour.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Failed to update tour details');
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
    <div className="max-w-3xl mx-auto p-6 sm:p-8 bg-white rounded-2xl shadow-xl border border-amber-100">
      <div className="flex items-center justify-between pb-6 border-b border-amber-100 mb-6">
        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 mb-2">
            <Sparkles className="w-3.5 h-3.5 text-amber-600" /> SEO &amp; Property Details
          </span>
          <h2 className="text-2xl font-bold text-gray-900">Edit Tour Details</h2>
          <p className="text-sm text-gray-600 mt-1">
            Update your property name, SEO description, location, and thumbnail image for search engines &amp; social sharing.
          </p>
        </div>
        {onCancel && (
          <button
            onClick={onCancel}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Tour / Property Name */}
        <div>
          <label className="block text-sm font-bold text-gray-900 mb-2">
            Property / Tour Name <span className="text-amber-600">*</span>
          </label>
          <input
            type="text"
            required
            maxLength={120}
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-gray-900 transition-all placeholder:text-gray-400"
            placeholder="e.g. The Heritage Garden & Dining"
          />
        </div>

        {/* Property Location */}
        <div>
          <label className="block text-sm font-bold text-gray-900 mb-2 flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-amber-600" />
            Property Location / Address
          </label>
          <input
            type="text"
            maxLength={200}
            value={formData.location}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-gray-900 transition-all placeholder:text-gray-400"
            placeholder="e.g. Jhamsikhel, Lalitpur, Nepal"
          />
          <p className="mt-1.5 text-xs text-gray-500">
            Helps visitors discover your venue and enhances Google local search &amp; map listings.
          </p>
        </div>

        {/* Property Description for SEO */}
        <div>
          <label className="block text-sm font-bold text-gray-900 mb-2">
            Property Description &amp; SEO Summary
          </label>
          <textarea
            rows={4}
            maxLength={600}
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-gray-900 transition-all placeholder:text-gray-400"
            placeholder="Describe the dining atmosphere, culinary highlights, seating capacity, or venue amenities. This appears on Google search results, social media preview cards, and the public showcase."
          />
          <div className="flex justify-between items-center mt-1 text-xs text-gray-500">
            <span>Optimal SEO length: 120-160 characters.</span>
            <span>{formData.description.length}/600</span>
          </div>
        </div>

        {/* Property Thumbnail Image (Upload Photo or Enter Link) */}
        <ThumbnailUploader
          value={formData.cover_image_url}
          tourId={tour.id}
          tourName={formData.name || tour.name}
          onChange={(url) => setFormData({ ...formData, cover_image_url: url })}
        />

        {/* Categories */}
        <div>
          <label className="block text-sm font-bold text-gray-900 mb-2">
            Categories &amp; Venue Types
          </label>
          <div className="flex flex-wrap gap-2 mb-2 p-3 border border-gray-300 rounded-xl bg-amber-50/30 min-h-[48px]">
            {(formData.categories || []).map((cat) => (
              <span
                key={cat}
                className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-900 capitalize border border-amber-200"
              >
                {CATEGORY_OPTIONS.find((c) => c.value === cat)?.label || cat}
                <button
                  type="button"
                  onClick={() =>
                    setFormData({
                      ...formData,
                      categories: formData.categories.filter((c) => c !== cat),
                    })
                  }
                  className="ml-2 text-amber-700 hover:text-amber-950 focus:outline-none cursor-pointer"
                  aria-label={`Remove category ${cat}`}
                >
                  ×
                </button>
              </span>
            ))}
            {(formData.categories || []).length === 0 && (
              <span className="text-gray-400 text-sm italic py-1">No categories selected</span>
            )}
          </div>

          <select
            value=""
            onChange={(e) => {
              const selectedValue = e.target.value;
              if (selectedValue && !formData.categories.includes(selectedValue)) {
                setFormData({
                  ...formData,
                  categories: [...formData.categories, selectedValue],
                });
              }
            }}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-gray-900 cursor-pointer"
          >
            <option value="">+ Add Venue Category...</option>
            {CATEGORY_OPTIONS.filter((c) => !formData.categories.includes(c.value)).map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {/* Background Audio with File Upload & Audio Preview */}
        <AudioUploader
          value={formData.background_audio_url}
          tourId={tour.id}
          onChange={(url) => setFormData({ ...formData, background_audio_url: url })}
          label="Background Audio Music (Optional)"
          helperText="Upload an audio file (MP3, WAV, M4A, OGG) or paste a link. Plays ambient background music for visitors."
        />

        {/* Publication Status */}
        <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
          <label className="flex items-center cursor-pointer select-none">
            <input
              type="checkbox"
              checked={formData.is_published}
              onChange={(e) => setFormData({ ...formData, is_published: e.target.checked })}
              className="mr-3 w-5 h-5 text-amber-600 border-gray-300 rounded focus:ring-amber-500 cursor-pointer accent-amber-600"
            />
            <div>
              <span className="text-sm font-bold text-gray-900 block flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-amber-600" />
                Publish Tour Publicly
              </span>
              <span className="text-xs text-gray-500">
                When checked, this tour is live, visible in showcase, and indexable by search engines.
              </span>
            </div>
          </label>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 py-3 px-6 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white font-semibold rounded-xl shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all duration-200"
          >
            {loading ? 'Saving Changes...' : 'Save Tour & SEO Details'}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-6 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 font-medium cursor-pointer transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
