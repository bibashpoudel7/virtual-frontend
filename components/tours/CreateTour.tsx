'use client';

import { useState } from 'react';
import { Tour } from '@/types/tour';
import { tourService } from '@/services/tourService';
import { ArrowRight, ChevronDown, Loader2, MapPin, Music } from 'lucide-react';
import TourSteps from './TourSteps';
import AudioUploader from '@/components/ui/AudioUploader';
import ThumbnailUploader from '@/components/ui/ThumbnailUploader';

interface CreateTourProps {
  onSuccess?: (tour: Tour) => void;
}

const TOUR_CATEGORIES = [
  ['restaurant', 'Restaurant & Dining'], ['hotel', 'Hotel & Resort'], ['wedding-venue', 'Wedding Venue'],
  ['event-venue', 'Event Venue'], ['cafe', 'Cafe & Bar'], ['showroom', 'Showroom'],
  ['real-estate', 'Real Estate'], ['apartment', 'Apartment'], ['house', 'House / Villa'],
  ['museum', 'Museum & Gallery'], ['spa', 'Spa & Wellness'], ['education', 'Education'],
  ['college', 'College'], ['hospital', 'Hospital'], ['industry', 'Industry'],
  ['office', 'Office'], ['retail', 'Retail'], ['gym', 'Gym'], ['other', 'Other'],
];

const EMPTY_FORM = {
  name: '',
  description: '',
  location: '',
  cover_image_url: '',
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
        location: formData.location.trim() || undefined,
        description: formData.description.trim() || undefined,
        cover_image_url: formData.cover_image_url.trim() || undefined,
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
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-gray-900"
            placeholder="e.g. Grand Ballroom, The Heritage Garden"
          />
        </div>

        <div>
          <label htmlFor="tour-location" className="block text-sm font-semibold text-gray-900 mb-2 flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-amber-600" />
            Location / Address <span className="font-normal text-gray-500">(optional)</span>
          </label>
          <input
            id="tour-location"
            type="text"
            maxLength={150}
            value={formData.location}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-gray-900"
            placeholder="e.g. Jhamsikhel, Lalitpur, Nepal"
          />
          <p className="mt-1 text-xs text-gray-500">Helps with local SEO and informs visitors where this property is.</p>
        </div>

        <div>
          <label htmlFor="tour-desc" className="block text-sm font-semibold text-gray-900 mb-2">
            Property / Venue Description <span className="font-normal text-gray-500">(optional)</span>
          </label>
          <textarea
            id="tour-desc"
            rows={3}
            maxLength={500}
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-gray-900"
            placeholder="Brief overview of the property, dining atmosphere, or venue highlights for Google and visitors."
          />
          <p className="mt-1 text-xs text-gray-500">Used as the SEO description for Google and social media share previews.</p>
        </div>

        {/* Thumbnail Image Uploader */}
        <div>
          <ThumbnailUploader
            value={formData.cover_image_url}
            tourName={formData.name || 'Tour Thumbnail'}
            onChange={(url) => setFormData({ ...formData, cover_image_url: url })}
          />
        </div>

        <div>
          <label htmlFor="tour-category" className="block text-sm font-bold text-gray-900 mb-2">
            Categories <span className="font-normal text-gray-500">(optional)</span>
          </label>
          {formData.categories.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {formData.categories.map((cat) => (
                <span key={cat} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                  {TOUR_CATEGORIES.find(([value]) => value === cat)?.[1] || cat}
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, categories: formData.categories.filter(c => c !== cat) })}
                    className="ml-1.5 text-amber-700 hover:text-amber-950 cursor-pointer"
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
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-gray-900"
          >
            <option value="">+ Add a category…</option>
            {TOUR_CATEGORIES.filter(([value]) => !formData.categories.includes(value)).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">Helps visitors find your tour.</p>
        </div>

        <details className="group rounded-xl border border-gray-200" open={Boolean(formData.background_audio_url)}>
          <summary className="flex items-center justify-between gap-2 px-4 py-3 cursor-pointer list-none select-none text-sm font-semibold text-gray-900">
            <span className="flex items-center gap-2">
              <Music className="w-4 h-4 text-amber-600" />
              Background Music &amp; Audio <span className="font-normal text-gray-500">(optional)</span>
            </span>
            <ChevronDown className="w-4 h-4 text-gray-500 transition-transform group-open:rotate-180" />
          </summary>
          <div className="px-4 pb-4">
            <AudioUploader
              value={formData.background_audio_url}
              onChange={(url) => setFormData({ ...formData, background_audio_url: url })}
              label="Background Music"
              helperText="Upload an audio file (MP3, WAV, M4A) or paste a link. Plays ambient music for visitors."
            />
          </div>
        </details>

        <button
          type="submit"
          disabled={loading || !formData.name.trim()}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-amber-600 text-white font-semibold rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-sm hover:shadow"
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
