'use client';

import React, { useState, useRef } from 'react';
import { Image as ImageIcon, Upload, Trash2, Loader2, Check, AlertCircle, Link as LinkIcon, X } from 'lucide-react';

interface ThumbnailUploaderProps {
  value: string;
  tourId?: string;
  tourName?: string;
  onChange: (url: string) => void;
}

async function deleteFromStorage(fileUrl?: string) {
  if (!fileUrl) return;
  const isStorageUrl = fileUrl.includes('/thumbnails/') || fileUrl.includes('/uploads/thumbnails/');
  if (!isStorageUrl) return;

  try {
    await fetch('/api/delete-media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: fileUrl }),
    });
  } catch (err) {
    console.error('Failed to delete media from storage:', err);
  }
}

export default function ThumbnailUploader({
  value,
  tourId,
  tourName = 'Virtual Tour',
  onChange,
}: ThumbnailUploaderProps) {
  const [mode, setMode] = useState<'upload' | 'url'>('upload');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (file: File) => {
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      setError('Image file exceeds the 25MB limit.');
      return;
    }

    setUploading(true);
    setProgress(15);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (tourId) {
        formData.append('tourId', tourId);
      }

      const xhr = new XMLHttpRequest();

      const uploadPromise = new Promise<{ url: string; filename: string }>((resolve, reject) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 90);
            setProgress(pct);
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const res = JSON.parse(xhr.responseText);
              if (res.success && res.url) {
                setProgress(100);
                resolve(res);
              } else {
                reject(new Error(res.error || 'Upload failed'));
              }
            } catch (err) {
              reject(new Error('Invalid response from server'));
            }
          } else {
            try {
              const res = JSON.parse(xhr.responseText);
              reject(new Error(res.error || `Upload failed with status ${xhr.status}`));
            } catch {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('Network error during upload'));
        });

        xhr.open('POST', '/api/upload-image');
        xhr.send(formData);
      });

      const result = await uploadPromise;

      // If replacing an existing R2-uploaded image, delete the old file
      if (value && value !== result.url) {
        deleteFromStorage(value);
      }

      onChange(result.url);
    } catch (err: any) {
      console.error('Thumbnail upload error:', err);
      setError(err.message || 'Failed to upload thumbnail image');
    } finally {
      setUploading(false);
      setProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDelete = async () => {
    if (!value) return;
    const oldUrl = value;
    setDeleting(true);
    try {
      await deleteFromStorage(oldUrl);
      onChange('');
    } catch (err) {
      console.error('Failed to delete thumbnail:', err);
    } finally {
      setDeleting(false);
    }
  };

  const handleUrlChange = (newUrl: string) => {
    const trimmed = newUrl.trim();
    // If replacing an existing uploaded image with a manual URL, delete old upload
    if (value && value !== trimmed && (value.includes('/thumbnails/') || value.includes('/uploads/thumbnails/'))) {
      deleteFromStorage(value);
    }
    onChange(trimmed);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      handleFileUpload(file);
    }
  };

  return (
    <div className="p-5 sm:p-6 bg-amber-50/40 rounded-2xl border border-amber-200/80 space-y-5">
      {/* Header and Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <label className="block text-sm font-bold text-gray-900 flex items-center gap-1.5">
            <ImageIcon className="w-4 h-4 text-amber-600" />
            Property Thumbnail Image (Cover Image)
          </label>
          <p className="text-xs text-gray-600 mt-0.5">
            Manually upload a cover photo or enter an image link. Displayed on Google, showcase, and social share cards.
          </p>
        </div>

        <div className="flex items-center gap-1 bg-amber-100/70 p-1 rounded-lg text-xs font-semibold">
          <button
            type="button"
            onClick={() => setMode('upload')}
            className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
              mode === 'upload'
                ? 'bg-white text-amber-900 shadow-xs'
                : 'text-amber-700 hover:text-amber-900'
            }`}
          >
            Upload Photo
          </button>
          <button
            type="button"
            onClick={() => setMode('url')}
            className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
              mode === 'url'
                ? 'bg-white text-amber-900 shadow-xs'
                : 'text-amber-700 hover:text-amber-900'
            }`}
          >
            Enter Link
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-600" />
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-auto text-red-500 hover:text-red-700 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Active Thumbnail Preview Card */}
      <div className="flex flex-col sm:flex-row items-center sm:items-stretch gap-4 p-3.5 bg-white rounded-xl border border-amber-200/70 shadow-sm">
        <div className="w-56 h-32 sm:w-64 sm:h-36 rounded-lg overflow-hidden bg-gray-100 border border-amber-300 relative shrink-0 shadow-inner flex items-center justify-center">
          {value ? (
            <>
              <img
                src={value}
                alt={tourName}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
              <div className="absolute bottom-2 left-2 bg-black/75 backdrop-blur-sm text-white text-[11px] font-medium px-2 py-0.5 rounded shadow">
                Custom Thumbnail
              </div>
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 p-4 text-center">
              <ImageIcon className="w-8 h-8 mb-1.5 text-amber-300" />
              <span className="text-xs font-medium text-gray-500">No thumbnail added</span>
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col justify-between py-1 text-sm w-full">
          <div>
            {value ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 mb-1.5">
                    <Check className="w-3 h-3 text-emerald-600" />
                    Cover Photo Active
                  </span>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={handleDelete}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-md transition-colors cursor-pointer disabled:opacity-50"
                    title="Delete image from R2 storage and clear thumbnail"
                  >
                    {deleting ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Trash2 className="w-3 h-3" />
                    )}
                    Delete Thumbnail
                  </button>
                </div>
                <p className="text-xs text-gray-600 leading-relaxed mt-1">
                  This custom photo is active and will be displayed everywhere as the main cover for this virtual tour.
                </p>
                <p className="text-[11px] text-gray-400 mt-1 truncate" title={value}>
                  Source: {value}
                </p>
              </>
            ) : (
              <>
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 mb-1.5">
                  No Thumbnail Image Set
                </span>
                <p className="text-xs text-gray-600 leading-relaxed mt-1">
                  Upload an image below or paste a direct image URL. Landscape orientation (16:9 ratio, approx. 1200 × 630 px) is recommended.
                </p>
              </>
            )}
          </div>
          <p className="text-[11px] text-gray-400 mt-2">
            Tip: Deleting or replacing this photo automatically cleans up and removes the old file from Cloudflare R2 storage.
          </p>
        </div>
      </div>

      {/* Mode 1: File Upload */}
      {mode === 'upload' && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif,.jpg,.jpeg,.png,.webp,.avif"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileUpload(e.target.files[0]);
              }
            }}
          />

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all duration-200 ${
              dragOver
                ? 'border-amber-600 bg-amber-100/60 scale-[1.01]'
                : 'border-amber-300 hover:border-amber-500 bg-white hover:bg-amber-50/40 shadow-xs'
            }`}
          >
            {uploading ? (
              <div className="space-y-2 py-1">
                <Loader2 className="w-7 h-7 text-amber-600 animate-spin mx-auto" />
                <p className="text-xs font-semibold text-gray-800">Uploading thumbnail image... {progress}%</p>
                <div className="w-44 h-1.5 bg-amber-100 rounded-full mx-auto overflow-hidden">
                  <div
                    className="h-full bg-amber-600 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 py-1">
                <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
                  <Upload className="w-5 h-5" />
                </div>
                <div className="text-center sm:text-left">
                  <p className="text-sm font-bold text-gray-900">
                    {value ? 'Upload New Photo to Replace Thumbnail' : 'Upload Thumbnail Photo'}
                  </p>
                  <p className="text-xs text-gray-500">
                    Click to browse or drag &amp; drop an image (JPG, PNG, WebP up to 25MB)
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mode 2: Direct URL Input */}
      {mode === 'url' && (
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-gray-800">
            Paste Direct Image URL:
          </label>
          <div className="relative">
            <LinkIcon className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="url"
              value={value}
              onChange={(e) => handleUrlChange(e.target.value)}
              placeholder="https://... direct image link (.jpg, .png, .webp)"
              className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-gray-900 bg-white"
            />
          </div>
          <p className="text-[11px] text-gray-500">
            Enter any direct HTTPS image link. Replacing an uploaded photo will clean up the old file from R2.
          </p>
        </div>
      )}
    </div>
  );
}
