'use client';

import { useState } from 'react';
import { Tour } from '@/types/tour';
import { tourService } from '@/services/tourService';

interface CreateTourProps {
  propertyId?: string;
  onSuccess?: (tour: Tour) => void;
}

export default function CreateTour({ propertyId, onSuccess }: CreateTourProps) {
  const [formData, setFormData] = useState({
    name: '',
    // property_id is handled by backend from JWT context, not sent from frontend
    is_published: false,
    autoplay_enabled: false,
    default_fov: 75,
    default_yaw_speed: 0.01,
    default_pitch_speed: 0.0,
    background_audio_url: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const tour = await tourService.createTour({
        ...formData,
        background_audio_url: formData.background_audio_url || undefined,
      });
      onSuccess?.(tour);
      setFormData({
        name: '',
        // property_id is handled by backend from JWT context
        is_published: false,
        autoplay_enabled: false,
        default_fov: 75,
        default_yaw_speed: 0.01,
        default_pitch_speed: 0.0,
        background_audio_url: '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create tour');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow">
      <h2 className="text-2xl font-bold mb-6">Create New Tour</h2>
      
      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Tour Name</label>
          <input
            type="text"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
            placeholder="Enter tour name"
          />
        </div>


        <div>
          <label className="block text-sm font-medium mb-1">Background Audio URL</label>
          <input
            type="url"
            value={formData.background_audio_url}
            onChange={(e) => setFormData({ ...formData, background_audio_url: e.target.value })}
            className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
            placeholder="Optional audio URL"
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Default FOV</label>
            <input
              type="number"
              value={formData.default_fov}
              onChange={(e) => setFormData({ 
                ...formData, 
                default_fov: parseFloat(e.target.value) 
              })}
              className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
              min="30"
              max="120"
              step="1"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Yaw Speed</label>
            <input
              type="number"
              value={formData.default_yaw_speed}
              onChange={(e) => setFormData({ 
                ...formData, 
                default_yaw_speed: parseFloat(e.target.value) 
              })}
              className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
              step="0.001"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Pitch Speed</label>
            <input
              type="number"
              value={formData.default_pitch_speed}
              onChange={(e) => setFormData({ 
                ...formData, 
                default_pitch_speed: parseFloat(e.target.value) 
              })}
              className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
              step="0.001"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={formData.is_published}
              onChange={(e) => setFormData({ ...formData, is_published: e.target.checked })}
              className="mr-2"
            />
            <span className="text-sm font-medium">Publish immediately</span>
          </label>

          <label className="flex items-center">
            <input
              type="checkbox"
              checked={formData.autoplay_enabled}
              onChange={(e) => setFormData({ ...formData, autoplay_enabled: e.target.checked })}
              className="mr-2"
            />
            <span className="text-sm font-medium">Enable autoplay</span>
          </label>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Creating...' : 'Create Tour'}
        </button>
      </div>
    </form>
  );
}