'use client';

import { useState } from 'react';
import { Tour } from '@/types/tour';
import { tourService } from '@/services/tourService';
import { ArrowRight, ChevronDown, Loader2, Music } from 'lucide-react';
import TourSteps from './TourSteps';

interface CreateTourProps {
  onSuccess?: (tour: Tour) => void;
}

const TOUR_CATEGORIES = [
  ['education', 'Education'], ['college', 'College'], ['hospital', 'Hospital'], ['hotel', 'Hotel'],
  ['real-estate', 'Real Estate'], ['industry', 'Industry'], ['museum', 'Museum'], ['showroom', 'Showroom'],
  ['restaurant', 'Restaurant'], ['office', 'Office'], ['retail', 'Retail'], ['event-venue', 'Event Venue'],
  ['wedding-venue', 'Wedding Venue'], ['gym', 'Gym'], ['spa', 'Spa'], ['apartment', 'Apartment'],
  ['house', 'House'], ['other', 'Other'],
];

const EMPTY_FORM = {
  name: '',
  categories: [] as string[],
  is_published: false,
  autoplay_enabled: false,
  default_fov: 75,
  default_yaw_speed: 0.01,
  default_pitch_speed: 0.0,
  background_audio_url: '',
};

export default function CreateTour({ onSuccess }: CreateTourProps) {
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const tourData = {
        ...formData,
        name: formData.name.trim(),
        background_audio_url: formData.background_audio_url.trim() || undefined,
      };

      const tour = await tourService.createTour(tourData);
      
      // Reset form
      setFormData(EMPTY_FORM);
      
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

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto p-6 sm:p-8 bg-white rounded-xl shadow">
      <TourSteps current={0} className="mb-6 sm:mb-8" />

      <h2 className="text-2xl font-bold text-gray-900">Create a new virtual tour</h2>
      <p className="mt-1 mb-6 text-gray-600">
        Give your tour a name. You&apos;ll upload your 360° photos on the next screen.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      <div className="space-y-5">
        <div>
          <label htmlFor="tour-name" className="block text-sm font-semibold text-gray-900 mb-2">
            Tour name <span className="text-red-500">*</span>
          </label>
          <input
            id="tour-name"
            type="text"
            required
            autoFocus
            maxLength={100}
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
            placeholder="e.g. Grand Ballroom, Sunset Villa"
          />
        </div>

        <div>
          <label htmlFor="tour-category" className="block text-sm font-bold text-gray-900 mb-2">
            Categories <span className="font-normal text-gray-500">(optional)</span>
          </label>
          {formData.categories.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {formData.categories.map((cat) => (
                <span key={cat} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {TOUR_CATEGORIES.find(([value]) => value === cat)?.[1] || cat}
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, categories: formData.categories.filter(c => c !== cat) })}
                    className="ml-1.5 text-blue-600 hover:text-blue-900 cursor-pointer"
                    aria-label={`Remove ${cat}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <select
            id="tour-category"
            value=""
            onChange={(e) => {
              const value = e.target.value;
              if (value && !formData.categories.includes(value)) {
                setFormData({ ...formData, categories: [...formData.categories, value] });
              }
            }}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
          >
            <option value="">+ Add a category…</option>
            {TOUR_CATEGORIES.filter(([value]) => !formData.categories.includes(value)).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">Helps visitors find your tour.</p>
        </div>

        <details className="group rounded-lg border border-gray-200" open={Boolean(formData.background_audio_url)}>
          <summary className="flex items-center justify-between gap-2 px-4 py-3 cursor-pointer list-none select-none text-sm font-semibold text-gray-900">
            <span className="flex items-center gap-2">
              <Music className="w-4 h-4 text-gray-500" />
              Background music <span className="font-normal text-gray-500">(optional)</span>
            </span>
            <ChevronDown className="w-4 h-4 text-gray-500 transition-transform group-open:rotate-180" />
          </summary>
          <div className="px-4 pb-4">
            <input
              type="url"
              value={formData.background_audio_url}
              onChange={(e) => setFormData({ ...formData, background_audio_url: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
              placeholder="https://audio.com/your-audio-link"
            />
            <p className="mt-2 text-xs text-gray-600">
              Paste an audio.com, jumpshare.com or direct audio file link. Leave empty to use the default music.
            </p>
          </div>
        </details>

        <button
          type="submit"
          disabled={loading || !formData.name.trim()}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Creating tour...
            </>
          ) : (
            <>
              Create tour &amp; add photos
              <ArrowRight className="w-5 h-5" />
            </>
          )}
        </button>
        <p className="text-center text-xs text-gray-500">
          New tours start as a draft and stay private until they are published.
        </p>
      </div>
    </form>
  );
}
