'use client';

import { useState, useRef, useEffect } from 'react';
import { Overlay } from '@/types/tour';
import { tourService } from '@/services/tourService';
import { storageUploader } from '@/lib/storage-upload';

interface OverlayEditorProps {
  sceneId: string;
  tourId: string;
  overlays: Overlay[];
  pendingPosition?: { yaw: number; pitch: number } | null;
  onOverlayAdded?: (overlay: Overlay) => void;
  onOverlayDeleted?: (overlayId: string) => void;
  onOverlayUpdated?: (overlay: Overlay) => void;
  deletingOverlayId?: string | null;
}

interface CreateOverlayRequest {
  kind: string;
  yaw: number;
  pitch: number;
  payload?: Record<string, any>;
  tour_id?: string;
}

// Enhanced overlay configuration for better UX
// const OVERLAY_CONFIG = {
//   text: {
//     icon: '📝',
//     label: 'Text Overlay',
//     description: 'Display rich text information',
//     defaultSize: { width: 300, height: 'auto' },
//     maxSize: { width: 600, height: 400 }
//   },
//   image: {
//     icon: '🖼️',
//     label: 'Image Overlay',
//     description: 'Show images with optional interactions',
//     defaultSize: { width: 200, height: 200 },
//     maxSize: { width: 800, height: 600 }
//   },
//   video: {
//     icon: '🎥',
//     label: 'Video Overlay',
//     description: 'Embed videos with controls',
//     defaultSize: { width: 400, height: 300 },
//     maxSize: { width: 1000, height: 800 }
//   },
// };

// Predefined overlay styles
// const OVERLAY_STYLES = [
//   { 
//     id: 'default', 
//     label: 'Default', 
//     className: 'bg-white text-black border border-gray-300',
//     previewClassName: 'bg-white text-black border border-gray-300'
//   },
//   { 
//     id: 'dark', 
//     label: 'Dark', 
//     className: 'bg-gray-900 text-white',
//     previewClassName: 'bg-gray-900 text-white'
//   },
//   { 
//     id: 'glass', 
//     label: 'Glass', 
//     className: 'bg-white/80 backdrop-blur text-black border border-gray-200',
//     previewClassName: 'bg-gray-100 text-black border border-gray-300'
//   },
//   { 
//     id: 'gradient', 
//     label: 'Gradient', 
//     className: 'bg-gradient-to-r from-blue-500 to-purple-600 text-white',
//     previewClassName: 'bg-gradient-to-r from-blue-500 to-purple-600 text-white'
//   },
//   { 
//     id: 'minimal', 
//     label: 'Minimal', 
//     className: 'bg-transparent border-2 border-white text-white',
//     previewClassName: 'bg-gray-800 border-2 border-white text-white'
//   },
// ];

export default function OverlayEditor({
  sceneId,
  tourId,
  overlays = [],
  pendingPosition,
  onOverlayAdded,
  onOverlayDeleted,
  onOverlayUpdated,
  deletingOverlayId
}: OverlayEditorProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [selectedOverlay, setSelectedOverlay] = useState<Overlay | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editFormData, setEditFormData] = useState<any>(null);
  const [formData, setFormData] = useState<CreateOverlayRequest>({
    kind: 'text',
    yaw: pendingPosition?.yaw || 0,
    pitch: pendingPosition?.pitch || 0,
    payload: {
    }
  });
  const [loading, setLoading] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedImage, setUploadedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Update formData when pendingPosition changes
  useEffect(() => {
    if (pendingPosition && isAdding) {
      setFormData(prev => ({
        ...prev,
        yaw: pendingPosition.yaw,
        pitch: pendingPosition.pitch
      }));
    }
  }, [pendingPosition, isAdding]);

  const overlayTypes = [
    { value: 'text', label: 'Text Overlay', icon: '📝', description: 'Display text information' },
    { value: 'image', label: 'Image Overlay', icon: '🖼️', description: 'Show an image' },
    { value: 'video', label: 'Video Overlay', icon: '🎥', description: 'Embed a video' },
    // { value: 'html', label: 'Custom HTML', icon: '�', edescription: 'Custom HTML content' },
    // { value: 'badge', label: 'Badge/Label', icon: '🏷️', description: 'Show a badge or label' },
    // { value: 'tooltip', label: 'Tooltip', icon: '💬', description: 'Hover tooltip' },
  ];

  // Animation options (commented out - not currently used in rendering)
  // const animations = [
  //   { value: 'none', label: 'None' },
  //   { value: 'fade', label: 'Fade In' },
  //   { value: 'slide-up', label: 'Slide Up' },
  //   { value: 'slide-down', label: 'Slide Down' },
  //   { value: 'zoom', label: 'Zoom In' },
  //   { value: 'bounce', label: 'Bounce' },
  //   { value: 'rotate', label: 'Rotate' },
  // ];

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

        if (isEditing) {
          setEditFormData({
            ...editFormData,
            payload: {
              ...editFormData.payload,
              imageData: reader.result as string,
              imageName: file.name
            }
          });
        } else {
          setFormData({
            ...formData,
            payload: {
              ...formData.payload,
              imageData: reader.result as string,
              imageName: file.name
            }
          });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleEditOverlay = (overlay: Overlay) => {
    setSelectedOverlay(overlay);
    setIsEditing(true);

    // Parse the overlay payload
    let payload: any = {};
    try {
      payload = typeof overlay.payload === 'string'
        ? JSON.parse(overlay.payload)
        : overlay.payload || {};
    } catch {
      payload = {};
    }

    // Set edit form data with overlay values
    setEditFormData({
      kind: overlay.kind,
      yaw: overlay.yaw,
      pitch: overlay.pitch,
      payload: {
        text: payload.text || '',
        imageUrl: payload.imageUrl || '',
        imageSource: payload.imageSource || 'url',
        videoUrl: payload.videoUrl || '',
        width: payload.width || 200,
        height: payload.height || 200,
        clickable: payload.clickable || false,
        clickUrl: payload.clickUrl || '',
        ...payload
      }
    });
  };

  const handleUpdateOverlay = async () => {
    if (!selectedOverlay || !editFormData) return;

    setEditLoading(true);
    setError(null);

    try {
      const finalPayload = { ...editFormData.payload };

      // Handle image upload if needed
      if (editFormData.kind === 'image' && uploadedImage) {
        try {
          // Generate a unique key for the image
          const timestamp = Date.now();
          const cleanFileName = uploadedImage.name.replace(/[^a-zA-Z0-9.]/g, '_');
          const key = `tours/${tourId}/overlays/${timestamp}-${cleanFileName}`;

          // Upload to R2
          const imageUrl = await storageUploader.uploadFile(
            uploadedImage,
            key,
            uploadedImage.type
          );

          // Update payload with the uploaded URL
          finalPayload.imageUrl = imageUrl;
          finalPayload.imageSource = 'url'; // Switch to URL source after upload

          // Remove temporary image data used for preview
          delete (finalPayload as any).imageData;
          delete (finalPayload as any).imageName;
        } catch (uploadError) {
          console.error('Failed to upload image to R2:', uploadError);
          throw new Error('Failed to upload image to cloud storage. Please try again.');
        }
      }

      const updatedOverlay = {
        ...selectedOverlay,
        kind: editFormData.kind,
        yaw: editFormData.yaw,
        pitch: editFormData.pitch,
        payload: JSON.stringify(finalPayload)
      };

      const response = await tourService.updateOverlay(sceneId, selectedOverlay.id!, updatedOverlay);
      onOverlayUpdated?.(response);

      // Reset editing state
      setIsEditing(false);
      setSelectedOverlay(null);
      setEditFormData(null);
      setUploadedImage(null);
      setImagePreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update overlay');
    } finally {
      setEditLoading(false);
    }
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setSelectedOverlay(null);
    setEditFormData(null);
    setUploadedImage(null);
    setImagePreview(null);
  };

  const renderEditOverlayFields = () => {
    if (!editFormData) return null;

    switch (editFormData.kind) {
      case 'text':
        return (
          <>
            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-900">Text Content</label>
              <textarea
                value={editFormData.payload?.text || ''}
                onChange={(e) => setEditFormData({
                  ...editFormData,
                  payload: { ...editFormData.payload, text: e.target.value }
                })}
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-gray-900 bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                rows={3}
                placeholder="Enter text to display"
              />
            </div>

            {/* <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-900">Font Size</label>
                <select
                  value={editFormData.payload?.fontSize || 'medium'}
                  onChange={(e) => setEditFormData({
                    ...editFormData,
                    payload: { ...editFormData.payload, fontSize: e.target.value }
                  })}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-gray-900 bg-white cursor-pointer focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                >
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
                  <option value="xlarge">Extra Large</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-900">Text Align</label>
                <select
                  value={editFormData.payload?.textAlign || 'center'}
                  onChange={(e) => setEditFormData({
                    ...editFormData,
                    payload: { ...editFormData.payload, textAlign: e.target.value }
                  })}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-gray-900 bg-white cursor-pointer focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                >
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </div>
            </div> */}

            {/* <div>
              <label className="block text-sm font-semibold mb-2 text-gray-900">Style</label>
              <div className="grid grid-cols-3 gap-2">
                {OVERLAY_STYLES.map((style) => (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() => setEditFormData({
                      ...editFormData,
                      payload: { ...editFormData.payload, style: style.id }
                    })}
                    className={`p-2 rounded-lg border-2 transition-all cursor-pointer ${
                      editFormData.payload?.style === style.id 
                        ? 'border-purple-500 ring-2 ring-purple-200 shadow-md' 
                        : 'border-gray-200 hover:border-purple-300 hover:shadow-sm'
                    }`}
                  >
                    <div className={`px-3 py-2 rounded text-xs font-medium ${style.previewClassName || style.className}`}>
                      {style.label}
                    </div>
                  </button>
                ))}
              </div>
            </div> */}
          </>
        );

      // Add other overlay types here (image, video) - similar pattern
      case 'image':
        return (
          <>
            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-900">Title</label>
              <input
                type="text"
                value={editFormData.payload?.title || ''}
                onChange={(e) => setEditFormData({
                  ...editFormData,
                  payload: { ...editFormData.payload, title: e.target.value }
                })}
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-gray-900 bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                placeholder="e.g., Dramatic and Functional"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-900">Description</label>
              <textarea
                value={editFormData.payload?.description || ''}
                onChange={(e) => setEditFormData({
                  ...editFormData,
                  payload: { ...editFormData.payload, description: e.target.value }
                })}
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-gray-900 bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                rows={3}
                placeholder="Detailed description that will appear in the modal sidebar..."
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-900">Image Source</label>
              <div className="space-y-3">
                <select
                  value={editFormData.payload?.imageSource || (editFormData.payload?.imageUrl ? 'url' : 'upload')}
                  onChange={(e) => setEditFormData({
                    ...editFormData,
                    payload: { ...editFormData.payload, imageSource: e.target.value }
                  })}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-gray-900 bg-white cursor-pointer focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                >
                  <option value="upload">Upload Image</option>
                  <option value="url">From URL</option>
                </select>

                {editFormData.payload?.imageSource === 'url' && (
                  <input
                    type="url"
                    value={editFormData.payload?.imageUrl || ''}
                    onChange={(e) => setEditFormData({
                      ...editFormData,
                      payload: { ...editFormData.payload, imageUrl: e.target.value }
                    })}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-gray-900 bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                    placeholder="https://example.com/image.jpg"
                  />
                )}

                {(editFormData.payload?.imageSource === 'upload' || !editFormData.payload?.imageSource) && (
                  <div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 border-2 border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-colors cursor-pointer font-medium text-gray-900"
                    >
                      {editFormData.payload?.imageUrl ? 'Change Image' : 'Choose Image'}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                    {uploadedImage && (
                      <span className="ml-3 text-sm text-gray-800 font-medium">{uploadedImage.name}</span>
                    )}
                  </div>
                )}

                {(imagePreview || editFormData.payload?.imageUrl) && (
                  <div className="mt-3 p-3 border-2 border-gray-200 rounded-lg bg-gray-50">
                    <p className="text-sm text-gray-800 font-semibold mb-2">Preview:</p>
                    <img
                      src={imagePreview || editFormData.payload?.imageUrl}
                      alt="Preview"
                      className="max-w-full h-32 object-contain rounded"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-900">Width</label>
                <input
                  type="number"
                  value={editFormData.payload?.width || 200}
                  onChange={(e) => setEditFormData({
                    ...editFormData,
                    payload: { ...editFormData.payload, width: parseInt(e.target.value) }
                  })}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-gray-900 bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                  min="50"
                  max="800"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-900">Height</label>
                <input
                  type="number"
                  value={editFormData.payload?.height || 200}
                  onChange={(e) => setEditFormData({
                    ...editFormData,
                    payload: { ...editFormData.payload, height: parseInt(e.target.value) }
                  })}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-gray-900 bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                  min="50"
                  max="800"
                />
              </div>
            </div>

            <div>
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={editFormData.payload?.clickable || false}
                  onChange={(e) => setEditFormData({
                    ...editFormData,
                    payload: { ...editFormData.payload, clickable: e.target.checked }
                  })}
                  className="mr-3 w-4 h-4 text-purple-600 cursor-pointer"
                />
                <span className="text-sm font-medium text-gray-900">Make image clickable</span>
              </label>
            </div>

            {editFormData.payload?.clickable && (
              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-900">Click Action URL</label>
                <input
                  type="url"
                  value={editFormData.payload?.clickUrl || ''}
                  onChange={(e) => setEditFormData({
                    ...editFormData,
                    payload: { ...editFormData.payload, clickUrl: e.target.value }
                  })}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-gray-900 bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                  placeholder="https://example.com or www.example.com"
                />
              </div>
            )}
          </>
        );

      case 'video':
        return (
          <>
            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-900">Title</label>
              <input
                type="text"
                value={editFormData.payload?.title || ''}
                onChange={(e) => setEditFormData({
                  ...editFormData,
                  payload: { ...editFormData.payload, title: e.target.value }
                })}
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-gray-900 bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                placeholder="e.g., Best Places to Live in the US"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-900">Description</label>
              <textarea
                value={editFormData.payload?.description || ''}
                onChange={(e) => setEditFormData({
                  ...editFormData,
                  payload: { ...editFormData.payload, description: e.target.value }
                })}
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-gray-900 bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                rows={3}
                placeholder="Detailed description that will appear in the modal sidebar..."
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-900">Video URL</label>
              <input
                type="url"
                value={editFormData.payload?.videoUrl || ''}
                onChange={(e) => setEditFormData({
                  ...editFormData,
                  payload: { ...editFormData.payload, videoUrl: e.target.value }
                })}
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-gray-900 bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                placeholder="YouTube, Vimeo, or direct video URL"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-900">Width</label>
                <input
                  type="number"
                  value={editFormData.payload?.width || 400}
                  onChange={(e) => setEditFormData({
                    ...editFormData,
                    payload: { ...editFormData.payload, width: parseInt(e.target.value) }
                  })}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-gray-900 bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                  min="200"
                  max="1000"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-900">Height</label>
                <input
                  type="number"
                  value={editFormData.payload?.height || 300}
                  onChange={(e) => setEditFormData({
                    ...editFormData,
                    payload: { ...editFormData.payload, height: parseInt(e.target.value) }
                  })}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-gray-900 bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                  min="150"
                  max="800"
                />
              </div>
            </div>
          </>
        );

      default:
        return (
          <div className="text-center py-4 text-gray-500">
            <p>Editing for {editFormData.kind} overlays coming soon...</p>
          </div>
        );
    }
  };

  const handleAddOverlay = async () => {
    setLoading(true);
    setError(null);

    try {
      const finalPayload = { ...formData.payload };

      // Handle image upload if needed
      if (formData.kind === 'image' && uploadedImage) {
        try {
          // Generate a unique key for the image
          const timestamp = Date.now();
          const cleanFileName = uploadedImage.name.replace(/[^a-zA-Z0-9.]/g, '_');
          const key = `tours/${tourId}/overlays/${timestamp}-${cleanFileName}`;

          // Upload to R2
          const imageUrl = await storageUploader.uploadFile(
            uploadedImage,
            key,
            uploadedImage.type
          );

          // Update payload with the uploaded URL
          finalPayload.imageUrl = imageUrl;
          finalPayload.imageSource = 'url'; // Switch to URL source after upload

          // Remove temporary image data used for preview
          delete (finalPayload as any).imageData;
          delete (finalPayload as any).imageName;
        } catch (uploadError) {
          console.error('Failed to upload image to R2:', uploadError);
          throw new Error('Failed to upload image to cloud storage. Please try again.');
        }
      }

      const overlayData = {
        ...formData,
        payload: JSON.stringify(finalPayload),
        tour_id: tourId,
      };

      const response = await tourService.createOverlay(sceneId, overlayData);
      onOverlayAdded?.(response);

      // Reset form
      setIsAdding(false);
      setFormData({
        kind: 'text',
        yaw: 0,
        pitch: 0,
        payload: {
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
              <label className="block text-sm font-semibold mb-2 text-gray-900">Text Content</label>
              <textarea
                value={formData.payload?.text || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  payload: { ...formData.payload, text: e.target.value }
                })}
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-gray-900 bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                rows={3}
                placeholder="Enter text to display"
              />
            </div>

            {/* <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-900">Font Size</label>
                <select
                  value={formData.payload?.fontSize || 'medium'}
                  onChange={(e) => setFormData({
                    ...formData,
                    payload: { ...formData.payload, fontSize: e.target.value }
                  })}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-gray-900 bg-white cursor-pointer focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                >
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
                  <option value="xlarge">Extra Large</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-900">Text Align</label>
                <select
                  value={formData.payload?.textAlign || 'center'}
                  onChange={(e) => setFormData({
                    ...formData,
                    payload: { ...formData.payload, textAlign: e.target.value }
                  })}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-gray-900 bg-white cursor-pointer focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                >
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </div>
            </div> */}

            {/* <div>
              <label className="block text-sm font-semibold mb-2 text-gray-900">Style</label>
              <div className="grid grid-cols-3 gap-2">
                {OVERLAY_STYLES.map((style) => (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() => setFormData({
                      ...formData,
                      payload: { ...formData.payload, style: style.id }
                    })}
                    className={`p-2 rounded-lg border-2 transition-all cursor-pointer ${
                      formData.payload?.style === style.id 
                        ? 'border-purple-500 ring-2 ring-purple-200 shadow-md' 
                        : 'border-gray-200 hover:border-purple-300 hover:shadow-sm'
                    }`}
                  >
                    <div className={`px-3 py-2 rounded text-xs font-medium ${style.previewClassName || style.className}`}>
                      {style.label}
                    </div>
                  </button>
                ))}
              </div>
            </div> */}
          </>
        );

      case 'image':
        return (
          <>
            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-900">Title</label>
              <input
                type="text"
                value={formData.payload?.title || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  payload: { ...formData.payload, title: e.target.value }
                })}
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-gray-900 bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                placeholder="e.g., Dramatic and Functional"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-900">Description</label>
              <textarea
                value={formData.payload?.description || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  payload: { ...formData.payload, description: e.target.value }
                })}
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-gray-900 bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                rows={3}
                placeholder="Detailed description that will appear in the modal sidebar..."
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-900">Image Source</label>
              <div className="space-y-3">
                <select
                  value={formData.payload?.imageSource || 'url'}
                  onChange={(e) => setFormData({
                    ...formData,
                    payload: { ...formData.payload, imageSource: e.target.value }
                  })}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-gray-900 bg-white cursor-pointer focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                >
                  <option value="upload">Upload Image</option>
                  <option value="url">From URL</option>
                  {/* <option value="library">From Library</option> */}
                </select>

                {formData.payload?.imageSource === 'url' && (
                  <input
                    type="url"
                    value={formData.payload?.imageUrl || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      payload: { ...formData.payload, imageUrl: e.target.value }
                    })}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-gray-900 bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                    placeholder="https://example.com/image.jpg"
                  />
                )}

                {(formData.payload?.imageSource === 'upload' || !formData.payload?.imageSource) && (
                  <div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 border-2 border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-colors cursor-pointer font-medium text-gray-900"
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
                      <span className="ml-3 text-sm text-gray-800 font-medium">{uploadedImage.name}</span>
                    )}
                  </div>
                )}

                {imagePreview && (
                  <div className="mt-3 p-3 border-2 border-gray-200 rounded-lg bg-gray-50">
                    <p className="text-sm text-gray-800 font-semibold mb-2">Preview:</p>
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="max-w-full h-32 object-contain rounded"
                    />
                  </div>
                )}

                {/* {formData.payload?.imageSource === 'library' && (
                  <div className="grid grid-cols-4 gap-2 p-3 border-2 border-gray-200 rounded-lg bg-gray-50">
                    <p className="col-span-4 text-sm text-gray-800 font-semibold mb-2">Select from library:</p>
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
                )} */}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-900">Width</label>
                <input
                  type="number"
                  value={formData.payload?.width || 200}
                  onChange={(e) => setFormData({
                    ...formData,
                    payload: { ...formData.payload, width: parseInt(e.target.value) }
                  })}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-gray-900 bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                  min="50"
                  max="800"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-900">Height</label>
                <input
                  type="number"
                  value={formData.payload?.height || 200}
                  onChange={(e) => setFormData({
                    ...formData,
                    payload: { ...formData.payload, height: parseInt(e.target.value) }
                  })}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-gray-900 bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                  min="50"
                  max="800"
                />
              </div>
            </div>

            <div>
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.payload?.clickable || false}
                  onChange={(e) => setFormData({
                    ...formData,
                    payload: { ...formData.payload, clickable: e.target.checked }
                  })}
                  className="mr-3 w-4 h-4 text-purple-600 cursor-pointer"
                />
                <span className="text-sm font-medium text-gray-900">Make image clickable</span>
              </label>
            </div>

            {formData.payload?.clickable && (
              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-900">Click Action URL</label>
                <input
                  type="url"
                  value={formData.payload?.clickUrl || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    payload: { ...formData.payload, clickUrl: e.target.value }
                  })}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-gray-900 bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                  placeholder="https://example.com or www.example.com"
                />
              </div>
            )}
          </>
        );

      case 'video':
        return (
          <>
            {/* Title and Description Fields */}
            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-900">Title</label>
              <input
                type="text"
                value={formData.payload?.title || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  payload: { ...formData.payload, title: e.target.value }
                })}
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-gray-900 bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                placeholder="e.g., Best Places to Live in the US"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-900">Description</label>
              <textarea
                value={formData.payload?.description || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  payload: { ...formData.payload, description: e.target.value }
                })}
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-gray-900 bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                rows={3}
                placeholder="Detailed description that will appear in the modal sidebar..."
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-900">Video URL</label>
              <input
                type="url"
                value={formData.payload?.videoUrl || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  payload: { ...formData.payload, videoUrl: e.target.value }
                })}
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-gray-900 bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                placeholder="YouTube, Vimeo, or direct video URL"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-900">Width</label>
                <input
                  type="number"
                  value={formData.payload?.width || 400}
                  onChange={(e) => setFormData({
                    ...formData,
                    payload: { ...formData.payload, width: parseInt(e.target.value) }
                  })}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-gray-900 bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                  min="200"
                  max="1000"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-900">Height</label>
                <input
                  type="number"
                  value={formData.payload?.height || 300}
                  onChange={(e) => setFormData({
                    ...formData,
                    payload: { ...formData.payload, height: parseInt(e.target.value) }
                  })}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-gray-900 bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                  min="150"
                  max="800"
                />
              </div>
            </div>

            {/* <div className="flex items-center space-x-6">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.payload?.autoplay || false}
                  onChange={(e) => setFormData({
                    ...formData,
                    payload: { ...formData.payload, autoplay: e.target.checked }
                  })}
                  className="mr-3 w-4 h-4 text-purple-600 cursor-pointer"
                />
                <span className="text-sm font-medium text-gray-900">Autoplay</span>
              </label>
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.payload?.muted || false}
                  onChange={(e) => setFormData({
                    ...formData,
                    payload: { ...formData.payload, muted: e.target.checked }
                  })}
                  className="mr-3 w-4 h-4 text-purple-600 cursor-pointer"
                />
                <span className="text-sm font-medium text-gray-900">Muted</span>
              </label>
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.payload?.loop || false}
                  onChange={(e) => setFormData({
                    ...formData,
                    payload: { ...formData.payload, loop: e.target.checked }
                  })}
                  className="mr-3 w-4 h-4 text-purple-600 cursor-pointer"
                />
                <span className="text-sm font-medium text-gray-900">Loop</span>
              </label>
            </div> */}
          </>
        );

      // case 'badge':
      //   return (
      //     <>
      //       <div>
      //         <label className="block text-sm font-semibold mb-2 text-gray-900">Badge Text</label>
      //         <input
      //           type="text"
      //           value={formData.payload?.text || ''}
      //           onChange={(e) => setFormData({
      //             ...formData,
      //             payload: { ...formData.payload, text: e.target.value }
      //           })}
      //           className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-gray-900 bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
      //           placeholder="NEW, HOT, SALE, etc."
      //           maxLength={20}
      //         />
      //       </div>

      //       <div>
      //         <label className="block text-sm font-semibold mb-2 text-gray-900">Badge Color</label>
      //         <div className="grid grid-cols-4 gap-2">
      //           {['red', 'blue', 'green', 'yellow', 'purple', 'pink', 'gray', 'black'].map((color) => (
      //             <button
      //               key={color}
      //               type="button"
      //               onClick={() => setFormData({
      //                 ...formData,
      //                 payload: { ...formData.payload, color }
      //               })}
      //               className={`p-3 rounded-lg border-2 transition-all cursor-pointer ${
      //                 formData.payload?.color === color 
      //                   ? 'border-purple-500 ring-2 ring-purple-200 shadow-md' 
      //                   : 'border-gray-200 hover:border-purple-300 hover:shadow-sm'
      //               }`}
      //               style={{ backgroundColor: color }}
      //               title={color}
      //             >
      //               <span className="sr-only">{color}</span>
      //             </button>
      //           ))}
      //         </div>
      //       </div>
      //     </>
      //   );

      // case 'html':
      //   return (
      //     <>
      //       <div>
      //         <label className="block text-sm font-semibold mb-2 text-gray-900">Custom HTML</label>
      //         <textarea
      //           value={formData.payload?.html || ''}
      //           onChange={(e) => setFormData({
      //             ...formData,
      //             payload: { ...formData.payload, html: e.target.value }
      //           })}
      //           className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg font-mono text-sm text-gray-900 bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
      //           rows={6}
      //           placeholder="<div>Your custom HTML here</div>"
      //         />
      //       </div>
      //       <div>
      //         <label className="block text-sm font-semibold mb-2 text-gray-900">Custom CSS (optional)</label>
      //         <textarea
      //           value={formData.payload?.css || ''}
      //           onChange={(e) => setFormData({
      //             ...formData,
      //             payload: { ...formData.payload, css: e.target.value }
      //           })}
      //           className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg font-mono text-sm text-gray-900 bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
      //           rows={3}
      //           placeholder=".my-class { color: red; }"
      //         />
      //       </div>
      //     </>
      //   );

      default:
        return null;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Overlays</h3>
        <button
          onClick={() => {
            setIsAdding(!isAdding);
            if (!isAdding) {
              // Reset form when starting to add a new overlay
              setFormData({
                kind: 'text',
                yaw: pendingPosition?.yaw || 0,
                pitch: pendingPosition?.pitch || 0,
                payload: {
                  // Removed unused style and animation properties
                }
              });
              setUploadedImage(null);
              setImagePreview(null);
              setError(null);
            }
          }}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors cursor-pointer font-medium"
        >
          {isAdding ? 'Cancel' : '+ Add Overlay'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-800 rounded-lg border border-red-200">
          {error}
        </div>
      )}

      {isAdding && (
        <div className="mb-6 p-4 border-2 border-gray-200 rounded-lg bg-gray-50">
          <h4 className="font-semibold mb-3 text-gray-900">New Overlay</h4>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-900">Overlay Type</label>
              <select
                value={formData.kind}
                onChange={(e) => {
                  const newKind = e.target.value;
                  const newPayload: any = { style: 'default', animation: 'fade' };
                  if (newKind === 'image') {
                    newPayload.imageSource = 'url';
                  }
                  setFormData({
                    ...formData,
                    kind: newKind,
                    payload: newPayload
                  });
                }}
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-gray-900 bg-white cursor-pointer focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
              >
                {overlayTypes.map(type => (
                  <option key={type.value} value={type.value}>
                    {type.icon} {type.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-700 mt-1 font-medium">
                {overlayTypes.find(t => t.value === formData.kind)?.description}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-900">
                  X Position (Yaw)
                  <span className="text-xs text-gray-600 ml-1 font-normal">-180° to 180°</span>
                </label>
                <input
                  type="number"
                  value={formData.yaw}
                  onChange={(e) => setFormData({
                    ...formData,
                    yaw: parseFloat(e.target.value)
                  })}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-gray-900 bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                  step="0.1"
                  min="-180"
                  max="180"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-900">
                  Y Position (Pitch)
                  <span className="text-xs text-gray-600 ml-1 font-normal">-90° to 90°</span>
                </label>
                <input
                  type="number"
                  value={formData.pitch}
                  onChange={(e) => setFormData({
                    ...formData,
                    pitch: parseFloat(e.target.value)
                  })}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-gray-900 bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                  step="0.1"
                  min="-90"
                  max="90"
                />
              </div>
            </div>

            {/* <div>
              <label className="block text-sm font-semibold mb-2 text-gray-900">Animation</label>
              <select
                value={formData.payload?.animation || 'fade'}
                onChange={(e) => setFormData({
                  ...formData,
                  payload: { ...formData.payload, animation: e.target.value }
                })}
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-gray-900 bg-white cursor-pointer focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
              >
                {animations.map(anim => (
                  <option key={anim.value} value={anim.value}>
                    {anim.label}
                  </option>
                ))}
              </select>
            </div> */}

            {renderOverlayFields()}

            {/* <div>
              <label className="block text-sm font-semibold mb-2 text-gray-900">Display Options</label>
              <div className="space-y-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.payload?.alwaysVisible || false}
                    onChange={(e) => setFormData({
                      ...formData,
                      payload: { ...formData.payload, alwaysVisible: e.target.checked }
                    })}
                    className="mr-3 w-4 h-4 text-purple-600 cursor-pointer"
                  />
                  <span className="text-sm font-medium text-gray-900">Always visible</span>
                </label>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.payload?.hideOnMobile || false}
                    onChange={(e) => setFormData({
                      ...formData,
                      payload: { ...formData.payload, hideOnMobile: e.target.checked }
                    })}
                    className="mr-3 w-4 h-4 text-purple-600 cursor-pointer"
                  />
                  <span className="text-sm font-medium text-gray-900">Hide on mobile devices</span>
                </label>
              </div>
            </div> */}

            <div className="flex space-x-3 pt-4 border-t border-gray-200">
              <button
                onClick={handleAddOverlay}
                disabled={loading}
                className="flex-1 py-3 px-4 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer font-semibold"
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
                    payload: { /* Removed unused style and animation properties */ }
                  });
                  setUploadedImage(null);
                  setImagePreview(null);
                }}
                className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-colors cursor-pointer font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Overlay Form */}
      {isEditing && selectedOverlay && editFormData && (
        <div className="mb-6 p-4 border-2 border-blue-200 rounded-lg bg-blue-50">
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-semibold text-gray-900">Edit {selectedOverlay.kind} Overlay</h4>
            <button
              onClick={cancelEditing}
              className="text-gray-500 hover:text-gray-700"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-900">
                  X Position (Yaw)
                  <span className="text-xs text-gray-600 ml-1 font-normal">-180° to 180°</span>
                </label>
                <input
                  type="number"
                  value={editFormData.yaw}
                  onChange={(e) => setEditFormData({
                    ...editFormData,
                    yaw: parseFloat(e.target.value)
                  })}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-gray-900 bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                  step="0.1"
                  min="-180"
                  max="180"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-900">
                  Y Position (Pitch)
                  <span className="text-xs text-gray-600 ml-1 font-normal">-90° to 90°</span>
                </label>
                <input
                  type="number"
                  value={editFormData.pitch}
                  onChange={(e) => setEditFormData({
                    ...editFormData,
                    pitch: parseFloat(e.target.value)
                  })}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-gray-900 bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                  step="0.1"
                  min="-90"
                  max="90"
                />
              </div>
            </div>

            {/* <div>
              <label className="block text-sm font-semibold mb-2 text-gray-900">Animation</label>
              <select
                value={editFormData.payload?.animation || 'fade'}
                onChange={(e) => setEditFormData({
                  ...editFormData,
                  payload: { ...editFormData.payload, animation: e.target.value }
                })}
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-gray-900 bg-white cursor-pointer focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
              >
                {animations.map(anim => (
                  <option key={anim.value} value={anim.value}>
                    {anim.label}
                  </option>
                ))}
              </select>
            </div> */}

            {renderEditOverlayFields()}

            {/* <div>
              <label className="block text-sm font-semibold mb-2 text-gray-900">Display Options</label>
              <div className="space-y-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editFormData.payload?.alwaysVisible || false}
                    onChange={(e) => setEditFormData({
                      ...editFormData,
                      payload: { ...editFormData.payload, alwaysVisible: e.target.checked }
                    })}
                    className="mr-3 w-4 h-4 text-purple-600 cursor-pointer"
                  />
                  <span className="text-sm font-medium text-gray-900">Always visible</span>
                </label>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editFormData.payload?.hideOnMobile || false}
                    onChange={(e) => setEditFormData({
                      ...editFormData,
                      payload: { ...editFormData.payload, hideOnMobile: e.target.checked }
                    })}
                    className="mr-3 w-4 h-4 text-purple-600 cursor-pointer"
                  />
                  <span className="text-sm font-medium text-gray-900">Hide on mobile devices</span>
                </label>
              </div>
            </div> */}

            <div className="flex space-x-3 pt-4 border-t border-gray-200">
              <button
                onClick={handleUpdateOverlay}
                disabled={editLoading}
                className="flex-1 py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer font-semibold"
              >
                {editLoading ? 'Updating...' : 'Update Overlay'}
              </button>
              <button
                onClick={cancelEditing}
                className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-colors cursor-pointer font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {overlays.map((overlay) => {
          const overlayType = overlayTypes.find(t => t.value === overlay.kind);

          return (
            <div
              key={overlay.id}
              onClick={() => handleEditOverlay(overlay)}
              className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${selectedOverlay?.id === overlay.id && isEditing
                ? 'border-blue-500 bg-blue-50 shadow-md'
                : 'border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                }`}
            >
              <div className="flex justify-between items-start">
                <div className="flex items-start space-x-3">
                  <span className="text-2xl">{overlayType?.icon || '📝'}</span>
                  <div>
                    <span className="font-semibold capitalize text-gray-900">{overlay.kind} Overlay</span>
                    <div className="text-sm text-gray-600 mt-1 font-medium">
                      Position: ({overlay.yaw.toFixed(1)}°, {overlay.pitch.toFixed(1)}°)
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditOverlay(overlay);
                    }}
                    className="text-blue-500 hover:text-blue-700 hover:bg-blue-100 p-2 rounded-full transition-all cursor-pointer"
                    title="Edit overlay"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (overlay.id && confirm('Are you sure you want to delete this overlay?')) {
                        onOverlayDeleted?.(overlay.id);
                      }
                    }}
                    disabled={deletingOverlayId === overlay.id}
                    className="text-red-500 hover:text-red-700 hover:bg-red-100 p-2 rounded-full transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Delete overlay"
                  >
                    {deletingOverlayId === overlay.id ? (
                      <svg className="animate-spin w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {overlays.length === 0 && !isAdding && (
          <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
            <div className="text-4xl mb-3">✨</div>
            <p className="text-gray-700 font-semibold mb-2">No overlays yet</p>
            <p className="text-sm text-gray-600">Click &quot;Add Overlay&quot; to create your first overlay</p>
          </div>
        )}
      </div>
    </div>
  );
}