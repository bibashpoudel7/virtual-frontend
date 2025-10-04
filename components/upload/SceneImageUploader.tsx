'use client';

import { useState, useCallback, useRef } from 'react';
import { Upload, X, CheckCircle, AlertCircle, Loader2, Image as ImageIcon } from 'lucide-react';

interface SceneImageUploaderProps {
  sceneId: string;
  onUploadComplete?: (data: any) => void;
  onError?: (error: string) => void;
}

interface UploadProgress {
  stage: 'idle' | 'processing' | 'uploading' | 'tiles' | 'complete' | 'error';
  progress: number;
  message: string;
  details?: string;
}

export default function SceneImageUploader({
  sceneId,
  onUploadComplete,
  onError
}: SceneImageUploaderProps) {
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
    stage: 'idle',
    progress: 0,
    message: ''
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [enableTiles, setEnableTiles] = useState(true);
  const [uploadResult, setUploadResult] = useState<any>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      onError?.('Please select a valid image file (JPEG, PNG, or WebP)');
      return;
    }

    // Check file size (max 100MB)
    const maxSize = 100 * 1024 * 1024;
    if (file.size > maxSize) {
      onError?.('File size must be less than 100MB');
      return;
    }

    setSelectedFile(file);
    
    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewUrl(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Check image dimensions
    const img = new Image();
    img.onload = () => {
      const aspectRatio = img.width / img.height;
      if (Math.abs(aspectRatio - 2) > 0.3) {
        console.warn('Image aspect ratio is not 2:1 (equirectangular). It will be adjusted.');
      }
    };
    img.src = URL.createObjectURL(file);
  }, [onError]);

  const processAndUpload = useCallback(async () => {
    if (!selectedFile || !sceneId) return;

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      // Stage 1: Processing
      setUploadProgress({
        stage: 'processing',
        progress: 10,
        message: 'Processing image...',
        details: 'Optimizing for 360° viewing'
      });

      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('sceneId', sceneId);
      formData.append('generateTiles', enableTiles.toString());

      // Use XMLHttpRequest for progress tracking
      const xhr = new XMLHttpRequest();
      
      const uploadPromise = new Promise((resolve, reject) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percentComplete = Math.round((e.loaded / e.total) * 100);
            
            setUploadProgress(prev => ({
              ...prev,
              stage: percentComplete < 50 ? 'processing' : 'uploading',
              progress: Math.min(90, percentComplete),
              message: percentComplete < 50 
                ? 'Processing image...' 
                : enableTiles 
                  ? 'Generating multiresolution tiles...'
                  : 'Uploading to cloud storage...',
              details: `${Math.round(e.loaded / 1024)}KB / ${Math.round(e.total / 1024)}KB`
            }));
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status === 200) {
            const response = JSON.parse(xhr.responseText);
            resolve(response);
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('Upload failed'));
        });

        xhr.addEventListener('abort', () => {
          reject(new Error('Upload cancelled'));
        });
      });

      xhr.open('POST', '/api/process-and-upload');
      xhr.send(formData);

      const result = await uploadPromise;
      
      // Stage 3: Complete
      setUploadProgress({
        stage: 'complete',
        progress: 100,
        message: 'Upload complete!',
        details: enableTiles 
          ? `Generated ${result.tilesGenerated} tiles for optimal viewing`
          : 'Image processed and uploaded successfully'
      });

      setUploadResult(result);
      onUploadComplete?.(result);

    } catch (error) {
      console.error('Upload error:', error);
      
      setUploadProgress({
        stage: 'error',
        progress: 0,
        message: 'Upload failed',
        details: error instanceof Error ? error.message : 'An error occurred'
      });

      onError?.(error instanceof Error ? error.message : 'Upload failed');
    }
  }, [selectedFile, sceneId, enableTiles, onUploadComplete, onError]);

  const cancelUpload = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    setUploadProgress({
      stage: 'idle',
      progress: 0,
      message: ''
    });
  }, []);

  const reset = useCallback(() => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setUploadProgress({
      stage: 'idle',
      progress: 0,
      message: ''
    });
    setUploadResult(null);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const isUploading = uploadProgress.stage === 'processing' || 
                      uploadProgress.stage === 'uploading' || 
                      uploadProgress.stage === 'tiles';

  return (
    <div className="w-full max-w-2xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-bold mb-4">Upload 360° Panorama</h2>
        
        {/* File Input */}
        {!selectedFile && (
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-gray-400 cursor-pointer transition-colors"
          >
            <Upload className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-2 text-sm text-gray-600">
              Click to upload or drag and drop
            </p>
            <p className="text-xs text-gray-500 mt-1">
              JPEG, PNG or WebP (max 100MB)
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Recommended: 2:1 aspect ratio (equirectangular)
            </p>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Preview and Options */}
        {selectedFile && !isUploading && uploadProgress.stage !== 'complete' && (
          <div className="space-y-4">
            {previewUrl && (
              <div className="relative rounded-lg overflow-hidden bg-gray-100">
                <img 
                  src={previewUrl} 
                  alt="Preview" 
                  className="w-full h-48 object-cover"
                />
                <button
                  onClick={reset}
                  className="absolute top-2 right-2 p-1 bg-white rounded-full shadow-lg hover:bg-gray-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm font-medium text-gray-700">
                {selectedFile.name}
              </p>
              <p className="text-xs text-gray-500">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>

            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                id="enable-tiles"
                checked={enableTiles}
                onChange={(e) => setEnableTiles(e.target.checked)}
                className="h-4 w-4 text-blue-600 rounded"
              />
              <label htmlFor="enable-tiles" className="text-sm text-gray-700">
                Generate multiresolution tiles for faster loading
                <span className="block text-xs text-gray-500">
                  Recommended for large images (adds processing time)
                </span>
              </label>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={processAndUpload}
                className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Upload & Process
              </button>
              <button
                onClick={reset}
                className="py-2 px-4 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Upload Progress */}
        {isUploading && (
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <div className="flex-1">
                <p className="font-medium text-gray-900">
                  {uploadProgress.message}
                </p>
                {uploadProgress.details && (
                  <p className="text-sm text-gray-500">
                    {uploadProgress.details}
                  </p>
                )}
              </div>
            </div>

            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div 
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress.progress}%` }}
              />
            </div>

            <button
              onClick={cancelUpload}
              className="w-full py-2 px-4 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Cancel Upload
            </button>
          </div>
        )}

        {/* Success State */}
        {uploadProgress.stage === 'complete' && uploadResult && (
          <div className="space-y-4">
            <div className="flex items-center space-x-3 text-green-600">
              <CheckCircle className="h-8 w-8" />
              <div>
                <p className="font-medium">Upload Successful!</p>
                <p className="text-sm text-gray-600">
                  {uploadProgress.details}
                </p>
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg space-y-2">
              <p className="text-sm text-gray-600">
                <span className="font-medium">Dimensions:</span> {uploadResult.dimensions?.width} × {uploadResult.dimensions?.height}
              </p>
              <p className="text-sm text-gray-600">
                <span className="font-medium">Processed Size:</span> {(uploadResult.processedSize / 1024 / 1024).toFixed(2)} MB
              </p>
              {uploadResult.tilesGenerated > 0 && (
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Tiles Generated:</span> {uploadResult.tilesGenerated}
                </p>
              )}
            </div>

            <button
              onClick={reset}
              className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Upload Another Image
            </button>
          </div>
        )}

        {/* Error State */}
        {uploadProgress.stage === 'error' && (
          <div className="space-y-4">
            <div className="flex items-center space-x-3 text-red-600">
              <AlertCircle className="h-8 w-8" />
              <div>
                <p className="font-medium">{uploadProgress.message}</p>
                <p className="text-sm text-gray-600">
                  {uploadProgress.details}
                </p>
              </div>
            </div>

            <button
              onClick={reset}
              className="w-full py-2 px-4 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}