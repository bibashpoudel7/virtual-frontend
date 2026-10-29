'use client';

import React, { useState, useRef } from 'react';
import { Music, Upload, X, Loader2, Link as LinkIcon, CheckCircle2, AlertCircle } from 'lucide-react';

interface AudioUploaderProps {
  value: string;
  tourId?: string;
  onChange: (url: string) => void;
  label?: string;
  helperText?: string;
}

async function deleteFromStorage(fileUrl?: string) {
  if (!fileUrl) return;
  const isStorageUrl = fileUrl.includes('/audio/') || fileUrl.includes('/uploads/audio/');
  if (!isStorageUrl) return;

  try {
    await fetch('/api/delete-media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: fileUrl }),
    });
  } catch (err) {
    console.error('Failed to delete audio from storage:', err);
  }
}

export default function AudioUploader({
  value,
  tourId,
  onChange,
  label = 'Background Audio',
  helperText = 'Upload an MP3/WAV/M4A audio file or paste an audio link. This plays automatically as ambient music.',
}: AudioUploaderProps) {
  const [mode, setMode] = useState<'upload' | 'url'>('upload');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (file: File) => {
    if (!file) return;

    // Validate size (50MB)
    if (file.size > 50 * 1024 * 1024) {
      setError('Audio file exceeds the 50MB limit.');
      return;
    }

    setUploading(true);
    setProgress(10);
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

        xhr.open('POST', '/api/upload-audio');
        xhr.send(formData);
      });

      const result = await uploadPromise;

      // If replacing an existing R2 audio file, delete old file from storage
      if (value && value !== result.url) {
        deleteFromStorage(value);
      }

      onChange(result.url);
    } catch (err: any) {
      console.error('Audio upload error:', err);
      setError(err.message || 'Failed to upload audio file');
    } finally {
      setUploading(false);
      setProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      handleFileUpload(file);
    }
  };

  const isUploadedUrl = value && (value.includes('/audio/') || value.includes('/uploads/audio/'));

  return (
    <div className="p-4 sm:p-5 bg-amber-50/40 rounded-2xl border border-amber-200/80 space-y-4">
      {/* Header and Mode switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <label className="block text-sm font-bold text-gray-900 flex items-center gap-1.5">
            <Music className="w-4 h-4 text-amber-600" />
            {label}
          </label>
          {helperText && (
            <p className="text-xs text-gray-600 mt-0.5">{helperText}</p>
          )}
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
            Upload File
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

      {/* Mode 1: File Uploader */}
      {mode === 'upload' && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/mp3,audio/mpeg,audio/wav,audio/x-m4a,audio/m4a,audio/aac,audio/ogg,audio/flac,.mp3,.wav,.m4a,.aac,.ogg,.flac"
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
                : 'border-amber-300 hover:border-amber-500 bg-white hover:bg-amber-50/30'
            }`}
          >
            {uploading ? (
              <div className="space-y-2 py-2">
                <Loader2 className="w-8 h-8 text-amber-600 animate-spin mx-auto" />
                <p className="text-xs font-semibold text-gray-800">Uploading audio file... {progress}%</p>
                <div className="w-48 h-2 bg-amber-100 rounded-full mx-auto overflow-hidden">
                  <div
                    className="h-full bg-amber-600 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-1.5 py-1">
                <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
                  <Upload className="w-5 h-5" />
                </div>
                <p className="text-sm font-semibold text-gray-800">
                  Click to upload or drag &amp; drop audio file
                </p>
                <p className="text-xs text-gray-500">
                  Supports MP3, WAV, M4A, AAC, OGG up to 50MB
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mode 2: Direct URL Input */}
      {mode === 'url' && (
        <div className="space-y-1.5">
          <div className="relative">
            <LinkIcon className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="url"
              value={value}
              onChange={(e) => {
                const newUrl = e.target.value.trim();
                if (value && value !== newUrl && (value.includes('/audio/') || value.includes('/uploads/audio/'))) {
                  deleteFromStorage(value);
                }
                onChange(newUrl);
              }}
              placeholder="https://audio.com/track or direct .mp3 link"
              className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-gray-900 bg-white"
            />
          </div>
          <p className="text-[11px] text-gray-500">
            Paste a link from audio.com, jumpshare.com, dropbox.com, or direct audio hosting. Replacing an uploaded track cleans up R2.
          </p>
        </div>
      )}

      {/* Audio Player Preview */}
      {value && value.trim() !== '' && (
        <div className="p-3.5 bg-white rounded-xl border border-amber-200/90 shadow-sm space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <div className="min-w-0">
                <span className="text-xs font-bold text-gray-800 block truncate">
                  {isUploadedUrl ? 'Uploaded Audio Track' : 'Linked Audio Source'}
                </span>
                <span className="text-[11px] text-gray-500 truncate block max-w-sm" title={value}>
                  {value}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                const oldUrl = value;
                onChange('');
                if (oldUrl) {
                  deleteFromStorage(oldUrl);
                }
              }}
              className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-800 px-2.5 py-1 rounded-md hover:bg-red-50 transition-colors cursor-pointer flex-shrink-0"
              title="Remove audio and delete file from R2"
            >
              <X className="w-3.5 h-3.5" />
              Remove
            </button>
          </div>

          {/* Embedded Audio Player */}
          <div className="pt-1 border-t border-gray-100">
            <audio
              controls
              src={value}
              preload="metadata"
              className="w-full h-9 rounded-md"
            >
              Your browser does not support the audio element.
            </audio>
          </div>
        </div>
      )}
    </div>
  );
}
