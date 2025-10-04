'use client';

import { useState } from 'react';
import { Hotspot, CreateHotspotRequest } from '@/types/tour';
import { tourService } from '@/services/tourService';

interface HotspotEditorProps {
  sceneId: string;
  hotspots: Hotspot[];
  onHotspotAdded?: (hotspot: Hotspot) => void;
  onHotspotDeleted?: (hotspotId: string) => void;
}

export default function HotspotEditor({ 
  sceneId, 
  hotspots, 
  onHotspotAdded,
  onHotspotDeleted 
}: HotspotEditorProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [selectedHotspot, setSelectedHotspot] = useState<Hotspot | null>(null);
  const [formData, setFormData] = useState<CreateHotspotRequest>({
    kind: 'navigation',
    yaw: 0,
    pitch: 0,
    payload: {}
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hotspotTypes = [
    { value: 'navigation', label: 'Navigation', icon: '🧭' },
    { value: 'info', label: 'Information', icon: 'ℹ️' },
    { value: 'image', label: 'Image', icon: '🖼️' },
    { value: 'video', label: 'Video', icon: '🎥' },
    { value: 'link', label: 'External Link', icon: '🔗' },
    { value: 'text', label: 'Text', icon: '📝' }
  ];

  const handleAddHotspot = async () => {
    setLoading(true);
    setError(null);

    try {
      const hotspot = await tourService.createHotspot(sceneId, formData);
      onHotspotAdded?.(hotspot);
      setIsAdding(false);
      setFormData({
        kind: 'navigation',
        yaw: 0,
        pitch: 0,
        payload: {}
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create hotspot');
    } finally {
      setLoading(false);
    }
  };

  const renderPayloadFields = () => {
    switch (formData.kind) {
      case 'navigation':
        return (
          <div>
            <label className="block text-sm font-medium mb-1">Target Scene ID</label>
            <input
              type="text"
              value={formData.payload?.targetSceneId || ''}
              onChange={(e) => setFormData({
                ...formData,
                payload: { ...formData.payload, targetSceneId: e.target.value }
              })}
              className="w-full px-3 py-2 border rounded-md"
              placeholder="Scene to navigate to"
            />
          </div>
        );
      
      case 'info':
      case 'text':
        return (
          <div>
            <label className="block text-sm font-medium mb-1">Text Content</label>
            <textarea
              value={formData.payload?.text || ''}
              onChange={(e) => setFormData({
                ...formData,
                payload: { ...formData.payload, text: e.target.value }
              })}
              className="w-full px-3 py-2 border rounded-md"
              rows={3}
              placeholder="Enter text content"
            />
          </div>
        );
      
      case 'image':
        return (
          <div>
            <label className="block text-sm font-medium mb-1">Image URL</label>
            <input
              type="url"
              value={formData.payload?.imageUrl || ''}
              onChange={(e) => setFormData({
                ...formData,
                payload: { ...formData.payload, imageUrl: e.target.value }
              })}
              className="w-full px-3 py-2 border rounded-md"
              placeholder="https://example.com/image.jpg"
            />
          </div>
        );
      
      case 'video':
        return (
          <div>
            <label className="block text-sm font-medium mb-1">Video URL</label>
            <input
              type="url"
              value={formData.payload?.videoUrl || ''}
              onChange={(e) => setFormData({
                ...formData,
                payload: { ...formData.payload, videoUrl: e.target.value }
              })}
              className="w-full px-3 py-2 border rounded-md"
              placeholder="https://example.com/video.mp4"
            />
          </div>
        );
      
      case 'link':
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Link URL</label>
              <input
                type="url"
                value={formData.payload?.linkUrl || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  payload: { ...formData.payload, linkUrl: e.target.value }
                })}
                className="w-full px-3 py-2 border rounded-md"
                placeholder="https://example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Link Text</label>
              <input
                type="text"
                value={formData.payload?.linkText || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  payload: { ...formData.payload, linkText: e.target.value }
                })}
                className="w-full px-3 py-2 border rounded-md"
                placeholder="Click here"
              />
            </div>
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Hotspots</h3>
        <button
          onClick={() => setIsAdding(!isAdding)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          {isAdding ? 'Cancel' : 'Add Hotspot'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
          {error}
        </div>
      )}

      {isAdding && (
        <div className="mb-6 p-4 border rounded-lg bg-gray-50">
          <h4 className="font-medium mb-3">New Hotspot</h4>
          
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Hotspot Type</label>
              <select
                value={formData.kind}
                onChange={(e) => setFormData({
                  ...formData,
                  kind: e.target.value,
                  payload: {}
                })}
                className="w-full px-3 py-2 border rounded-md"
              >
                {hotspotTypes.map(type => (
                  <option key={type.value} value={type.value}>
                    {type.icon} {type.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Yaw (Horizontal)</label>
                <input
                  type="number"
                  value={formData.yaw}
                  onChange={(e) => setFormData({
                    ...formData,
                    yaw: parseFloat(e.target.value)
                  })}
                  className="w-full px-3 py-2 border rounded-md"
                  step="0.1"
                  min="-180"
                  max="180"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Pitch (Vertical)</label>
                <input
                  type="number"
                  value={formData.pitch}
                  onChange={(e) => setFormData({
                    ...formData,
                    pitch: parseFloat(e.target.value)
                  })}
                  className="w-full px-3 py-2 border rounded-md"
                  step="0.1"
                  min="-90"
                  max="90"
                />
              </div>
            </div>

            {renderPayloadFields()}

            <button
              onClick={handleAddHotspot}
              disabled={loading}
              className="w-full py-2 px-4 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Hotspot'}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {hotspots.map((hotspot) => (
          <div
            key={hotspot.id}
            onClick={() => setSelectedHotspot(hotspot)}
            className={`p-3 border rounded cursor-pointer transition-colors ${
              selectedHotspot?.id === hotspot.id
                ? 'border-blue-500 bg-blue-50'
                : 'hover:bg-gray-50'
            }`}
          >
            <div className="flex justify-between items-start">
              <div>
                <span className="font-medium">
                  {hotspotTypes.find(t => t.value === hotspot.kind)?.icon} {hotspot.kind}
                </span>
                <div className="text-sm text-gray-600 mt-1">
                  Position: ({hotspot.yaw.toFixed(1)}°, {hotspot.pitch.toFixed(1)}°)
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onHotspotDeleted?.(hotspot.id);
                }}
                className="text-red-500 hover:text-red-700"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
        
        {hotspots.length === 0 && !isAdding && (
          <p className="text-gray-500 text-center py-4">
            No hotspots yet. Click "Add Hotspot" to create one.
          </p>
        )}
      </div>
    </div>
  );
}