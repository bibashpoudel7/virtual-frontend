'use client';

import { useState, useRef } from 'react';
import { Hotspot } from '@/types/tour';

// Define proper types for the hotspot payloads
type HotspotPayload = {
  id?: string;
  kind?: string;
  yaw?: number;
  pitch?: number;
  icon?: string;
  iconType?: 'predefined' | 'custom';
  customIconUrl?: string;
  targetSceneId?: string;
  // Target camera direction after navigation (Matterport-style)
  targetYaw?: number;
  targetPitch?: number;
  transition?: string;
  title?: string;
  text?: string;
  imageSource?: 'url' | 'upload' | 'library';
  imageUrl?: string;
  imageData?: string;
  caption?: string;
  videoUrl?: string;
  autoplay?: boolean;
  loop?: boolean;
  linkUrl?: string;
  linkText?: string;
  openInNewTab?: boolean;
  customData?: string;
  label?: string;
  [key: string]: unknown; // Allow additional properties with unknown type
};

// Type for API request (different from internal state)
interface CreateHotspotApiRequest {
  kind: string;
  yaw: number;
  pitch: number;
  // Target camera direction after navigation (Matterport-style)
  target_yaw?: number;
  target_pitch?: number;
  payload: string; // Stringified HotspotPayload
  tour_id: string;
  target_scene_id: string;
}

// Type for internal form state
interface CreateHotspotFormState {
  kind: string;
  yaw: number;
  pitch: number;
  payload: HotspotPayload;
}

// Type guard for HotspotPayload
const isHotspotPayload = (payload: unknown): payload is HotspotPayload => {
  return typeof payload === 'object' && payload !== null;
};
import { tourService } from '@/services/tourService';
import Image from 'next/image';

interface EnhancedHotspotEditorProps {
  sceneId: string;
  tourId: string;
  scenes: any[]; // Array of available scenes for navigation
  hotspots: Hotspot[];
  onHotspotAdded?: (hotspot: Hotspot) => void;
  onHotspotDeleted?: (hotspotId: string) => void;
  onHotspotUpdated?: (hotspot: Hotspot) => void;
}

// Predefined hotspot icons
const HOTSPOT_ICONS = [
  { id: 'navigation', icon: '🧭', label: 'Navigation' },
  { id: 'info', icon: 'ℹ️', label: 'Information' },
  { id: 'arrow-right', icon: '➡️', label: 'Arrow Right' },
  { id: 'arrow-left', icon: '⬅️', label: 'Arrow Left' },
  { id: 'arrow-up', icon: '⬆️', label: 'Arrow Up' },
  { id: 'arrow-down', icon: '⬇️', label: 'Arrow Down' },
  { id: 'pin', icon: '📍', label: 'Pin' },
  { id: 'eye', icon: '👁️', label: 'View' },
  { id: 'door', icon: '🚪', label: 'Door' },
  { id: 'window', icon: '🪟', label: 'Window' },
  { id: 'camera', icon: '📷', label: 'Camera' },
  { id: 'video', icon: '🎥', label: 'Video' },
  { id: 'audio', icon: '🔊', label: 'Audio' },
  { id: 'document', icon: '📄', label: 'Document' },
  { id: 'link', icon: '🔗', label: 'Link' },
  { id: 'star', icon: '⭐', label: 'Star' },
  { id: 'heart', icon: '❤️', label: 'Heart' },
  { id: 'question', icon: '❓', label: 'Question' },
  { id: 'exclamation', icon: '❗', label: 'Important' },
  { id: 'plus', icon: '➕', label: 'Add' },
];

export default function EnhancedHotspotEditor({ 
  sceneId,
  tourId,
  scenes = [],
  hotspots, 
  onHotspotAdded,
  onHotspotDeleted,
  onHotspotUpdated 
}: EnhancedHotspotEditorProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [selectedHotspot, setSelectedHotspot] = useState<Hotspot | null>(null);
  const [formData, setFormData] = useState<CreateHotspotFormState>(() => ({
    kind: 'navigation',
    yaw: 0,
    pitch: 0,
    payload: { 
      icon: 'navigation',
      iconType: 'predefined',
      targetSceneId: '' 
    }
  }));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customIcon, setCustomIcon] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hotspotTypes = [
    { value: 'navigation', label: 'Navigation', description: 'Navigate to another scene' },
    { value: 'info', label: 'Information', description: 'Show information popup' },
    { value: 'image', label: 'Image', description: 'Display an image' },
    { value: 'video', label: 'Video', description: 'Play a video' },
    { value: 'link', label: 'External Link', description: 'Open external URL' },
    { value: 'text', label: 'Text', description: 'Display text content' },
    { value: 'custom', label: 'Custom Icon', description: 'Use your own icon' }
  ];

  const handleIconUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        setError('Icon file size must be less than 5MB');
        return;
      }

      setCustomIcon(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
        setFormData({
          ...formData,
          payload: { 
            ...formData.payload, 
            customIconUrl: reader.result as string,
            iconType: 'custom'
          }
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePredefinedIconSelect = (iconId: string) => {
    setFormData({
      ...formData,
      payload: { 
        ...formData.payload, 
        icon: iconId,
        iconType: 'predefined'
      }
    });
    setCustomIcon(null);
    setPreviewUrl(null);
  };

  const handleAddHotspot = async () => {
    setLoading(true);
    setError(null);

    try {
      // Create a copy of formData to avoid direct state mutation
      const hotspotData = { ...formData };
      
      // Handle custom icon if present
      if (customIcon && formData.kind === 'custom' && previewUrl) {
        hotspotData.payload = {
          ...hotspotData.payload,
          customIconUrl: previewUrl,
          iconType: 'custom'
        };
      }

      // Prepare the API request with proper typing
      const apiRequest: CreateHotspotApiRequest = {
        kind: hotspotData.kind,
        yaw: hotspotData.yaw,
        pitch: hotspotData.pitch,
        // Include target camera direction if specified
        target_yaw: hotspotData.payload?.targetYaw,
        target_pitch: hotspotData.payload?.targetPitch,
        payload: JSON.stringify(hotspotData.payload),
        tour_id: tourId,
        target_scene_id: hotspotData.payload?.targetSceneId || sceneId // Default to current scene if not specified
      };

      // Call the service with the properly typed request
      // We need to cast the payload to any here because the service expects a different type
      const hotspot = await tourService.createHotspot(sceneId, {
        ...apiRequest,
        payload: JSON.parse(apiRequest.payload) // Parse back to object for the service
      } as any);
      onHotspotAdded?.(hotspot);
      setIsAdding(false);
      setFormData({
        kind: 'navigation',
        yaw: 0,
        pitch: 0,
        payload: { icon: 'navigation', targetSceneId: '' }
      });
      setCustomIcon(null);
      setPreviewUrl(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create hotspot');
    } finally {
      setLoading(false);
    }
  };

  const renderIconSelector = () => {
    return (
      <div className="space-y-3">
        <label className="block text-sm font-medium mb-1">Select Icon</label>
        
        {/* Predefined Icons Grid */}
        <div className="grid grid-cols-10 gap-2 p-3 border rounded-lg bg-gray-50">
          {HOTSPOT_ICONS.map((icon) => (
            <button
              key={icon.id}
              type="button"
              onClick={() => handlePredefinedIconSelect(icon.id)}
              className={`p-2 text-2xl hover:bg-white rounded transition-colors ${
                formData.payload?.icon === icon.id ? 'bg-white ring-2 ring-blue-500' : ''
              }`}
              title={icon.label}
            >
              {icon.icon}
            </button>
          ))}
        </div>

        {/* Custom Icon Upload */}
        <div className="border-t pt-3">
          <label className="block text-sm font-medium mb-2">Or upload custom icon</label>
          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Choose File
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleIconUpload}
              className="hidden"
            />
            {customIcon && (
              <span className="text-sm text-gray-600">{customIcon.name}</span>
            )}
          </div>
          
          {previewUrl && (
            <div className="mt-3 p-3 border rounded-lg bg-white">
              <p className="text-sm text-gray-600 mb-2">Custom Icon Preview:</p>
              <img 
                src={previewUrl} 
                alt="Custom icon preview" 
                className="w-16 h-16 object-contain"
              />
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderPayloadFields = () => {
    switch (formData.kind) {
      case 'navigation':
        return (
          <>
            {renderIconSelector()}
            <div>
              <label className="block text-sm font-medium mb-1">Target Scene</label>
              <select
                value={formData.payload?.targetSceneId || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  payload: { ...formData.payload, targetSceneId: e.target.value }
                })}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="">Select a scene...</option>
                {scenes.filter(s => s.id !== sceneId).map(scene => (
                  <option key={scene.id} value={scene.id}>
                    {scene.name} (Order: {scene.order})
                  </option>
                ))}
              </select>
            </div>

            {/* Target Camera Direction (Matterport-style) */}
            <div className="p-3 border rounded-lg bg-blue-50">
              <label className="block text-sm font-medium mb-2 text-blue-800">
                Target Camera Direction (where to look after navigation)
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">
                    Target Yaw (Horizontal)
                    <span className="text-gray-400 ml-1">-360° to 360°</span>
                  </label>
                  <input
                    type="number"
                    value={formData.payload?.targetYaw ?? ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      payload: {
                        ...formData.payload,
                        targetYaw: e.target.value ? parseFloat(e.target.value) : undefined
                      }
                    })}
                    className="w-full px-3 py-2 border rounded-md"
                    step="1"
                    placeholder="Auto (face walking direction)"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">
                    Target Pitch (Vertical)
                    <span className="text-gray-400 ml-1">-90° to 90°</span>
                  </label>
                  <input
                    type="number"
                    value={formData.payload?.targetPitch ?? ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      payload: {
                        ...formData.payload,
                        targetPitch: e.target.value ? parseFloat(e.target.value) : undefined
                      }
                    })}
                    className="w-full px-3 py-2 border rounded-md"
                    step="1"
                    min="-90"
                    max="90"
                    placeholder="0 (level view)"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Leave empty to face the walking direction. Set values to look at a specific direction in the target scene.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Transition Effect</label>
              <select
                value={formData.payload?.transition || 'fade'}
                onChange={(e) => setFormData({
                  ...formData,
                  payload: { ...formData.payload, transition: e.target.value }
                })}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="fade">Fade</option>
                <option value="slide">Slide</option>
                <option value="zoom">Zoom</option>
                <option value="none">None</option>
              </select>
            </div>
          </>
        );
      
      case 'info':
      case 'text':
        return (
          <>
            {renderIconSelector()}
            <div>
              <label className="block text-sm font-medium mb-1">Title</label>
              <input
                type="text"
                value={formData.payload?.title || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  payload: { ...formData.payload, title: e.target.value }
                })}
                className="w-full px-3 py-2 border rounded-md"
                placeholder="Hotspot title"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Content</label>
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
          </>
        );
      
      case 'image':
        return (
          <>
            {renderIconSelector()}
            <div>
              <label className="block text-sm font-medium mb-1">Image Selection</label>
              <div className="space-y-2">
                <select
                  value={(formData.payload?.imageSource as 'url' | 'upload' | 'library') || 'url'}
                  onChange={(e) => {
                    const value = e.target.value as 'url' | 'upload' | 'library';
                    setFormData({
                      ...formData,
                      payload: { 
                        ...formData.payload, 
                        imageSource: value 
                      }
                    });
                  }}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="url">From URL</option>
                  <option value="upload">Upload Image</option>
                  <option value="library">From Library</option>
                </select>

                {formData.payload?.imageSource === 'url' && (
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
                )}

                {formData.payload?.imageSource === 'upload' && (
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onloadend = () => {
                          setFormData({
                            ...formData,
                            payload: { 
                              ...formData.payload, 
                              imageData: reader.result as string 
                            }
                          });
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                    className="w-full px-3 py-2 border rounded-md"
                  />
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Caption (optional)</label>
              <input
                type="text"
                value={formData.payload?.caption || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  payload: { ...formData.payload, caption: e.target.value }
                })}
                className="w-full px-3 py-2 border rounded-md"
                placeholder="Image caption"
              />
            </div>
          </>
        );
      
      case 'video':
        return (
          <>
            {renderIconSelector()}
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
                placeholder="https://example.com/video.mp4 or YouTube URL"
              />
            </div>
            <div className="flex items-center space-x-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.payload?.autoplay || false}
                  onChange={(e) => setFormData({
                    ...formData,
                    payload: { ...formData.payload, autoplay: e.target.checked }
                  })}
                  className="mr-2"
                />
                <span className="text-sm">Autoplay</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.payload?.loop || false}
                  onChange={(e) => setFormData({
                    ...formData,
                    payload: { ...formData.payload, loop: e.target.checked }
                  })}
                  className="mr-2"
                />
                <span className="text-sm">Loop</span>
              </label>
            </div>
          </>
        );
      
      case 'link':
        return (
          <>
            {renderIconSelector()}
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
            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.payload?.openInNewTab || false}
                  onChange={(e) => setFormData({
                    ...formData,
                    payload: { ...formData.payload, openInNewTab: e.target.checked }
                  })}
                  className="mr-2"
                />
                <span className="text-sm">Open in new tab</span>
              </label>
            </div>
          </>
        );

      case 'custom':
        return (
          <>
            {renderIconSelector()}
            <div>
              <label className="block text-sm font-medium mb-1">Custom Action (JSON)</label>
              <textarea
                value={formData.payload?.customData || '{}'}
                onChange={(e) => setFormData({
                  ...formData,
                  payload: { ...formData.payload, customData: e.target.value }
                })}
                className="w-full px-3 py-2 border rounded-md font-mono text-sm"
                rows={4}
                placeholder='{"action": "custom", "data": {...}}'
              />
            </div>
          </>
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
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        >
          {isAdding ? 'Cancel' : '+ Add Hotspot'}
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
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Hotspot Type</label>
              <select
                value={formData.kind}
                onChange={(e) => setFormData({
                  ...formData,
                  kind: e.target.value,
                  payload: { icon: 'navigation' }
                })}
                className="w-full px-3 py-2 border rounded-md"
              >
                {hotspotTypes.map(type => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {hotspotTypes.find(t => t.value === formData.kind)?.description}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Yaw (Horizontal) 
                  <span className="text-xs text-gray-500 ml-1">-180° to 180°</span>
                </label>
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
                <label className="block text-sm font-medium mb-1">
                  Pitch (Vertical)
                  <span className="text-xs text-gray-500 ml-1">-90° to 90°</span>
                </label>
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

            <div className="flex space-x-3">
              <button
                onClick={handleAddHotspot}
                disabled={loading}
                className="flex-1 py-2 px-4 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Creating...' : 'Create Hotspot'}
              </button>
              <button
                onClick={() => {
                  setIsAdding(false);
                  setFormData({
                    kind: 'navigation',
                    yaw: 0,
                    pitch: 0,
                    payload: { icon: 'navigation' }
                  });
                  setCustomIcon(null);
                  setPreviewUrl(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {hotspots.map((hotspot) => {
          let icon = '📍';
          try {
            let payload: HotspotPayload = {};
            
            if (typeof hotspot.payload === 'string') {
              try {
                const parsed = JSON.parse(hotspot.payload);
                if (isHotspotPayload(parsed)) {
                  payload = parsed;
                }
              } catch (e) {
                console.error('Failed to parse hotspot payload:', e);
              }
            } else if (hotspot.payload && typeof hotspot.payload === 'object') {
              // Safely create a new object with only the properties we expect
              const src = hotspot.payload as Record<string, unknown>;
              // Define allowed keys for type safety
              const allowedKeys = new Set([
                'icon', 'iconType', 'customIconUrl', 'targetSceneId',
                'transition', 'title', 'text', 'imageSource', 'imageUrl',
                'imageData', 'caption', 'videoUrl', 'autoplay', 'loop',
                'linkUrl', 'linkText', 'openInNewTab', 'customData'
              ]);
              
              payload = Object.fromEntries(
                Object.entries(src).filter(([key]) => allowedKeys.has(key))
              ) as HotspotPayload;
            }
            
            icon = payload?.icon || 
                   HOTSPOT_ICONS.find(i => i.id === (payload?.icon || hotspot.kind))?.icon || 
                   '📍';
          } catch (e) {
            console.error('Error processing hotspot:', e);
          }
          
          return (
            <div
              key={hotspot.id}
              onClick={() => setSelectedHotspot(hotspot)}
              className={`p-3 border rounded cursor-pointer transition-all ${
                selectedHotspot?.id === hotspot.id
                  ? 'border-blue-500 bg-blue-50 shadow-sm'
                  : 'hover:bg-gray-50'
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="flex items-start space-x-3">
                  <span className="text-2xl">{icon}</span>
                  <div>
                    <span className="font-medium capitalize">{hotspot.kind}</span>
                    <div className="text-sm text-gray-600 mt-1">
                      Position: ({hotspot.yaw.toFixed(1)}°, {hotspot.pitch.toFixed(1)}°)
                    </div>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('Are you sure you want to delete this hotspot?')) {
                      if(hotspot.id){
                        onHotspotDeleted?.(hotspot.id);
                      }
                    }
                  }}
                  className="text-red-500 hover:text-red-700 p-1"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          );
        })}
        
        {hotspots.length === 0 && !isAdding && (
          <div className="text-center py-8">
            <p className="text-gray-500 mb-2">No hotspots yet</p>
            <p className="text-sm text-gray-400">Click "Add Hotspot" to create your first hotspot</p>
          </div>
        )}
      </div>
    </div>
  );
}