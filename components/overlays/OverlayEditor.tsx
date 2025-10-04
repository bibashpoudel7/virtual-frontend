'use client';

import { useState, useRef } from 'react';
import { Overlay } from '@/types/tour';
import { tourService } from '@/services/tourService';

interface OverlayEditorProps {
  sceneId: string;
  overlays: Overlay[];
  onOverlayAdded?: (overlay: Overlay) => void;
  onOverlayDeleted?: (overlayId: string) => void;
  onOverlayUpdated?: (overlay: Overlay) => void;
}

interface CreateOverlayRequest {
  kind: string;
  yaw: number;
  pitch: number;
  payload?: Record<string, any>;
}

// Predefined overlay styles
const OVERLAY_STYLES = [
  { id: 'default', label: 'Default', className: 'bg-white text-black' },
  { id: 'dark', label: 'Dark', className: 'bg-gray-900 text-white' },
  { id: 'glass', label: 'Glass', className: 'bg-white/80 backdrop-blur text-black' },
  { id: 'gradient', label: 'Gradient', className: 'bg-gradient-to-r from-blue-500 to-purple-600 text-white' },
  { id: 'minimal', label: 'Minimal', className: 'bg-transparent border-2 border-white text-white' },
];

export default function OverlayEditor({ 
  sceneId, 
  overlays = [], 
  onOverlayAdded,
  onOverlayDeleted,
  onOverlayUpdated 
}: OverlayEditorProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [selectedOverlay, setSelectedOverlay] = useState<Overlay | null>(null);
  const [formData, setFormData] = useState<CreateOverlayRequest>({
    kind: 'text',
    yaw: 0,
    pitch: 0,
    payload: {
      style: 'default',
      animation: 'fade'
    }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedImage, setUploadedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const overlayTypes = [
    { value: 'text', label: 'Text Overlay', icon: '📝', description: 'Display text information' },
    { value: 'image', label: 'Image Overlay', icon: '🖼️', description: 'Show an image' },
    { value: 'video', label: 'Video Overlay', icon: '🎥', description: 'Embed a video' },
    { value: 'html', label: 'Custom HTML', icon: '🌐', description: 'Custom HTML content' },
    { value: 'badge', label: 'Badge/Label', icon: '🏷️', description: 'Show a badge or label' },
    { value: 'tooltip', label: 'Tooltip', icon: '💬', description: 'Hover tooltip' },
  ];

  const animations = [
    { value: 'none', label: 'None' },
    { value: 'fade', label: 'Fade In' },
    { value: 'slide-up', label: 'Slide Up' },
    { value: 'slide-down', label: 'Slide Down' },
    { value: 'zoom', label: 'Zoom In' },
    { value: 'bounce', label: 'Bounce' },
    { value: 'rotate', label: 'Rotate' },
  ];

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        setError('Image file size must be less than 10MB');
        return;
      }

      setUploadedImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
        setFormData({
          ...formData,
          payload: { 
            ...formData.payload, 
            imageData: reader.result as string,
            imageName: file.name
          }
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddOverlay = async () => {
    setLoading(true);
    setError(null);

    try {
      // Here you would typically upload the image to your storage service first
      // For now, we'll include the base64 data in the payload
      
      const response = await tourService.createOverlay(sceneId, formData);
      onOverlayAdded?.(response);
      
      // Reset form
      setIsAdding(false);
      setFormData({
        kind: 'text',
        yaw: 0,
        pitch: 0,
        payload: {
          style: 'default',
          animation: 'fade'
        }
      });
      setUploadedImage(null);
      setImagePreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create overlay');
    } finally {
      setLoading(false);
    }
  };

  const renderOverlayFields = () => {
    switch (formData.kind) {
      case 'text':
        return (
          <>
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
                placeholder="Enter text to display"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Font Size</label>
                <select
                  value={formData.payload?.fontSize || 'medium'}
                  onChange={(e) => setFormData({
                    ...formData,
                    payload: { ...formData.payload, fontSize: e.target.value }
                  })}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
                  <option value="xlarge">Extra Large</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Text Align</label>
                <select
                  value={formData.payload?.textAlign || 'center'}
                  onChange={(e) => setFormData({
                    ...formData,
                    payload: { ...formData.payload, textAlign: e.target.value }
                  })}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Style</label>
              <div className="grid grid-cols-3 gap-2">
                {OVERLAY_STYLES.map((style) => (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() => setFormData({
                      ...formData,
                      payload: { ...formData.payload, style: style.id }
                    })}
                    className={`p-2 rounded border-2 transition-all ${
                      formData.payload?.style === style.id 
                        ? 'border-blue-500 ring-2 ring-blue-200' 
                        : 'border-gray-200'
                    }`}
                  >
                    <div className={`px-3 py-1 rounded text-xs ${style.className}`}>
                      {style.label}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </>
        );
      
      case 'image':
        return (
          <>
            <div>
              <label className="block text-sm font-medium mb-1">Image Source</label>
              <div className="space-y-3">
                <select
                  value={formData.payload?.imageSource || 'upload'}
                  onChange={(e) => setFormData({
                    ...formData,
                    payload: { ...formData.payload, imageSource: e.target.value }
                  })}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="upload">Upload Image</option>
                  <option value="url">From URL</option>
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

                {(formData.payload?.imageSource === 'upload' || !formData.payload?.imageSource) && (
                  <div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      Choose Image
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                    {uploadedImage && (
                      <span className="ml-3 text-sm text-gray-600">{uploadedImage.name}</span>
                    )}
                  </div>
                )}

                {imagePreview && (
                  <div className="mt-3 p-3 border rounded-lg bg-gray-50">
                    <p className="text-sm text-gray-600 mb-2">Preview:</p>
                    <img 
                      src={imagePreview} 
                      alt="Preview" 
                      className="max-w-full h-32 object-contain rounded"
                    />
                  </div>
                )}

                {formData.payload?.imageSource === 'library' && (
                  <div className="grid grid-cols-4 gap-2 p-3 border rounded-lg bg-gray-50">
                    <p className="col-span-4 text-sm text-gray-600 mb-2">Select from library:</p>
                    {/* This would be populated with images from your media library */}
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                      <button
                        key={i}
                        type="button"
                        className="aspect-square bg-gray-200 rounded hover:ring-2 hover:ring-blue-500"
                        onClick={() => setFormData({
                          ...formData,
                          payload: { 
                            ...formData.payload, 
                            libraryImageId: `image-${i}` 
                          }
                        })}
                      >
                        <span className="text-gray-400">📷</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Width</label>
                <input
                  type="number"
                  value={formData.payload?.width || 200}
                  onChange={(e) => setFormData({
                    ...formData,
                    payload: { ...formData.payload, width: parseInt(e.target.value) }
                  })}
                  className="w-full px-3 py-2 border rounded-md"
                  min="50"
                  max="800"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Height</label>
                <input
                  type="number"
                  value={formData.payload?.height || 200}
                  onChange={(e) => setFormData({
                    ...formData,
                    payload: { ...formData.payload, height: parseInt(e.target.value) }
                  })}
                  className="w-full px-3 py-2 border rounded-md"
                  min="50"
                  max="800"
                />
              </div>
            </div>

            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.payload?.clickable || false}
                  onChange={(e) => setFormData({
                    ...formData,
                    payload: { ...formData.payload, clickable: e.target.checked }
                  })}
                  className="mr-2"
                />
                <span className="text-sm">Make image clickable</span>
              </label>
            </div>

            {formData.payload?.clickable && (
              <div>
                <label className="block text-sm font-medium mb-1">Click Action URL</label>
                <input
                  type="url"
                  value={formData.payload?.clickUrl || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    payload: { ...formData.payload, clickUrl: e.target.value }
                  })}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder="https://example.com"
                />
              </div>
            )}
          </>
        );
      
      case 'video':
        return (
          <>
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
                placeholder="YouTube, Vimeo, or direct video URL"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Width</label>
                <input
                  type="number"
                  value={formData.payload?.width || 400}
                  onChange={(e) => setFormData({
                    ...formData,
                    payload: { ...formData.payload, width: parseInt(e.target.value) }
                  })}
                  className="w-full px-3 py-2 border rounded-md"
                  min="200"
                  max="1000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Height</label>
                <input
                  type="number"
                  value={formData.payload?.height || 300}
                  onChange={(e) => setFormData({
                    ...formData,
                    payload: { ...formData.payload, height: parseInt(e.target.value) }
                  })}
                  className="w-full px-3 py-2 border rounded-md"
                  min="150"
                  max="800"
                />
              </div>
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
                  checked={formData.payload?.muted || false}
                  onChange={(e) => setFormData({
                    ...formData,
                    payload: { ...formData.payload, muted: e.target.checked }
                  })}
                  className="mr-2"
                />
                <span className="text-sm">Muted</span>
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

      case 'badge':
        return (
          <>
            <div>
              <label className="block text-sm font-medium mb-1">Badge Text</label>
              <input
                type="text"
                value={formData.payload?.text || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  payload: { ...formData.payload, text: e.target.value }
                })}
                className="w-full px-3 py-2 border rounded-md"
                placeholder="NEW, HOT, SALE, etc."
                maxLength={20}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Badge Color</label>
              <div className="grid grid-cols-4 gap-2">
                {['red', 'blue', 'green', 'yellow', 'purple', 'pink', 'gray', 'black'].map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setFormData({
                      ...formData,
                      payload: { ...formData.payload, color }
                    })}
                    className={`p-2 rounded border-2 ${
                      formData.payload?.color === color 
                        ? 'border-blue-500 ring-2 ring-blue-200' 
                        : 'border-gray-200'
                    }`}
                    style={{ backgroundColor: color }}
                  >
                    <span className="sr-only">{color}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        );

      case 'html':
        return (
          <>
            <div>
              <label className="block text-sm font-medium mb-1">Custom HTML</label>
              <textarea
                value={formData.payload?.html || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  payload: { ...formData.payload, html: e.target.value }
                })}
                className="w-full px-3 py-2 border rounded-md font-mono text-sm"
                rows={6}
                placeholder="<div>Your custom HTML here</div>"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Custom CSS (optional)</label>
              <textarea
                value={formData.payload?.css || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  payload: { ...formData.payload, css: e.target.value }
                })}
                className="w-full px-3 py-2 border rounded-md font-mono text-sm"
                rows={3}
                placeholder=".my-class { color: red; }"
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
        <h3 className="text-lg font-semibold">Overlays</h3>
        <button
          onClick={() => setIsAdding(!isAdding)}
          className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
        >
          {isAdding ? 'Cancel' : '+ Add Overlay'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
          {error}
        </div>
      )}

      {isAdding && (
        <div className="mb-6 p-4 border rounded-lg bg-gray-50">
          <h4 className="font-medium mb-3">New Overlay</h4>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Overlay Type</label>
              <select
                value={formData.kind}
                onChange={(e) => setFormData({
                  ...formData,
                  kind: e.target.value,
                  payload: { style: 'default', animation: 'fade' }
                })}
                className="w-full px-3 py-2 border rounded-md"
              >
                {overlayTypes.map(type => (
                  <option key={type.value} value={type.value}>
                    {type.icon} {type.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {overlayTypes.find(t => t.value === formData.kind)?.description}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">
                  X Position (Yaw)
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
                  Y Position (Pitch)
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

            <div>
              <label className="block text-sm font-medium mb-1">Animation</label>
              <select
                value={formData.payload?.animation || 'fade'}
                onChange={(e) => setFormData({
                  ...formData,
                  payload: { ...formData.payload, animation: e.target.value }
                })}
                className="w-full px-3 py-2 border rounded-md"
              >
                {animations.map(anim => (
                  <option key={anim.value} value={anim.value}>
                    {anim.label}
                  </option>
                ))}
              </select>
            </div>

            {renderOverlayFields()}

            <div>
              <label className="block text-sm font-medium mb-1">Display Options</label>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.payload?.alwaysVisible || false}
                    onChange={(e) => setFormData({
                      ...formData,
                      payload: { ...formData.payload, alwaysVisible: e.target.checked }
                    })}
                    className="mr-2"
                  />
                  <span className="text-sm">Always visible</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.payload?.hideOnMobile || false}
                    onChange={(e) => setFormData({
                      ...formData,
                      payload: { ...formData.payload, hideOnMobile: e.target.checked }
                    })}
                    className="mr-2"
                  />
                  <span className="text-sm">Hide on mobile devices</span>
                </label>
              </div>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={handleAddOverlay}
                disabled={loading}
                className="flex-1 py-2 px-4 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Creating...' : 'Create Overlay'}
              </button>
              <button
                onClick={() => {
                  setIsAdding(false);
                  setFormData({
                    kind: 'text',
                    yaw: 0,
                    pitch: 0,
                    payload: { style: 'default', animation: 'fade' }
                  });
                  setUploadedImage(null);
                  setImagePreview(null);
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
        {overlays.map((overlay) => {
          const overlayType = overlayTypes.find(t => t.value === overlay.kind);
          
          return (
            <div
              key={overlay.id}
              onClick={() => setSelectedOverlay(overlay)}
              className={`p-3 border rounded cursor-pointer transition-all ${
                selectedOverlay?.id === overlay.id
                  ? 'border-purple-500 bg-purple-50 shadow-sm'
                  : 'hover:bg-gray-50'
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="flex items-start space-x-3">
                  <span className="text-2xl">{overlayType?.icon || '📝'}</span>
                  <div>
                    <span className="font-medium capitalize">{overlay.kind} Overlay</span>
                    <div className="text-sm text-gray-600 mt-1">
                      Position: ({overlay.yaw.toFixed(1)}°, {overlay.pitch.toFixed(1)}°)
                    </div>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('Are you sure you want to delete this overlay?')) {
                      onOverlayDeleted?.(overlay.id);
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
        
        {overlays.length === 0 && !isAdding && (
          <div className="text-center py-8">
            <p className="text-gray-500 mb-2">No overlays yet</p>
            <p className="text-sm text-gray-400">Click "Add Overlay" to create your first overlay</p>
          </div>
        )}
      </div>
    </div>
  );
}