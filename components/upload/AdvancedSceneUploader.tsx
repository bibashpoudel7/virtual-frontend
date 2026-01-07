'use client';

// frontend/components/upload/AdvancedSceneUploader.tsx
import { useState, useCallback, useRef, useEffect } from 'react';
import { storageUploader } from '@/lib/storage-upload';
import { 
  Upload, X, CheckCircle, AlertCircle, Loader2, 
  Image as ImageIcon, Grid3x3, CloudUpload, Save 
} from 'lucide-react';

interface AdvancedSceneUploaderProps {
  sceneId?: string;
  tourId?: string;
  sceneType?: 'image' | 'video' | '360';
  onComplete?: (data: any) => void;
  onCancel?: () => void;
  onPreviewReady?: (previewUrl: string) => void;
}

interface ProcessingStage {
  id: 'scene' | 'select' | 'process' | 'tiles' | 'upload' | 'save';
  name: string;
  status: 'pending' | 'processing' | 'complete' | 'error' | 'skipped';
  data?: any;
}

export default function AdvancedSceneUploader({ sceneId: initialSceneId, tourId, sceneType = '360', onComplete, onCancel, onPreviewReady }: AdvancedSceneUploaderProps) {
  const [sceneId, setSceneId] = useState<string>(initialSceneId || '');
  const [sceneName, setSceneName] = useState<string>('');
  const [needsSceneCreation, setNeedsSceneCreation] = useState(!initialSceneId);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [processedImage, setProcessedImage] = useState<Buffer | null>(null);
  const [tiles, setTiles] = useState<Map<string, Buffer>>(new Map());
  const [uploadedUrls, setUploadedUrls] = useState<Map<string, string>>(new Map());
  
  // Persist state key for this scene
  const stateKey = `upload_state_${sceneId}`;
  
  const [stages, setStages] = useState<ProcessingStage[]>(() => {
    const baseStages: ProcessingStage[] = [
      { id: 'select', name: 'Select Image', status: 'pending' },
      { id: 'process', name: 'Process Image', status: 'pending' },
      { id: 'tiles', name: 'Generate Tiles', status: 'pending' },
      { id: 'upload', name: 'Upload to Storage', status: 'pending' },
      { id: 'save', name: 'Save to Database', status: 'pending' },
    ];
    
    if (needsSceneCreation) {
      return [
        { id: 'scene', name: 'Create Scene', status: 'pending' },
        ...baseStages
      ];
    }
    
    return baseStages;
  });

  const [currentStage, setCurrentStage] = useState<string>(needsSceneCreation ? 'scene' : 'select');
  const [uploadProgress, setUploadProgress] = useState<Map<string, number>>(new Map());
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Load persisted state on mount
  useEffect(() => {
    const savedState = localStorage.getItem(stateKey);
    if (savedState) {
      try {
        const state = JSON.parse(savedState);
        setCurrentStage(state.currentStage || 'select');
        setStages(state.stages || stages);
        
        // Restore URLs if upload was completed
        if (state.uploadedUrls) {
          setUploadedUrls(new Map(Object.entries(state.uploadedUrls)));
        }
        
        // Auto-continue if process was interrupted
        if (state.currentStage && state.currentStage !== 'select' && state.currentStage !== 'save') {
          console.log('Resuming upload from stage:', state.currentStage);
        }
      } catch (err) {
        console.error('Failed to restore upload state:', err);
      }
    }
  }, [sceneId]);
  
  // Save state to localStorage whenever it changes
  const saveState = useCallback(() => {
    const state = {
      sceneId,
      currentStage,
      stages,
      uploadedUrls: Object.fromEntries(uploadedUrls),
      timestamp: Date.now()
    };
    localStorage.setItem(stateKey, JSON.stringify(state));
  }, [sceneId, currentStage, stages, uploadedUrls, stateKey]);
  
  // Clear saved state when complete
  const clearSavedState = useCallback(() => {
    localStorage.removeItem(stateKey);
  }, [stateKey]);

  // Update stage status
  const updateStage = (stageId: string, status: ProcessingStage['status'], data?: any) => {
    setStages(prev => prev.map(stage => 
      stage.id === stageId ? { ...stage, status, data } : stage
    ));
  };

  // Stage 0: Create Scene (if needed)
  const createScene = useCallback(async () => {
    if (!tourId || !sceneName.trim()) return;

    updateStage('scene', 'processing');

    try {
      const backendUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5555/api/';
      const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
      
      const response = await fetch(`${backendUrl}tours/${tourId}/scenes`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          name: sceneName,
          type: sceneType,
          yaw: 0,
          pitch: 0,
          fov: 75,
          order: 1,
          priority: 1
        })
      });

      if (!response.ok) throw new Error('Failed to create scene');
      
      const newScene = await response.json();
      setSceneId(newScene.id);
      updateStage('scene', 'complete', { sceneId: newScene.id });
      setCurrentStage('select');
      saveState();
    } catch (error) {
      updateStage('scene', 'error');
      saveState();
      console.error('Scene creation error:', error);
    }
  }, [tourId, sceneName, sceneType]);

  // Stage 1: Select File
  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    updateStage('select', 'complete', { file });
    saveState();
    
    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target?.result as string;
      setPreviewUrl(url);
      onPreviewReady?.(url);
    };
    reader.readAsDataURL(file);
    
    setCurrentStage('process');
  }, []);

  // Stage 2: Process Image on Server
  const processImage = useCallback(async () => {
    if (!selectedFile) return;

    updateStage('process', 'processing');

    try {
      // Send to server for Sharp processing
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('sceneId', sceneId);
      formData.append('operation', 'process');

      const response = await fetch('/api/process-image', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to process image');
      }

      const result = await response.json();
      
      // Convert base64 back to buffer
      const processed = Buffer.from(result.data, 'base64');

      setProcessedImage(processed);
      updateStage('process', 'complete', { 
        size: result.size,
        dimensions: result.dimensions 
      });
      setCurrentStage('tiles');
      saveState();
    } catch (error) {
      updateStage('process', 'error');
      saveState();
      console.error('Processing error:', error);
    }
  }, [selectedFile, sceneId]);

  // Stage 3: Generate Tiles on Server
  const generateTiles = useCallback(async () => {
    if (!processedImage) return;

    updateStage('tiles', 'processing');

    try {
      // Create a file from the processed buffer
      const processedBlob = new Blob([new Uint8Array(processedImage)], { type: 'image/jpeg' });
      const processedFile = new File([processedBlob], 'processed.jpg', { type: 'image/jpeg' });
      
      // Send to server for tile generation
      const formData = new FormData();
      formData.append('file', processedFile);
      formData.append('sceneId', sceneId);
      formData.append('operation', 'tiles');

      const response = await fetch('/api/process-image', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to generate tiles');
      }

      const result = await response.json();
      
      // Convert base64 tiles back to buffers
      const tilesMap = new Map<string, Buffer>();
      for (const [key, base64] of Object.entries(result.tiles)) {
        tilesMap.set(key, Buffer.from(base64 as string, 'base64'));
      }

      setTiles(tilesMap);
      
      // Store the manifest if it's returned (for cube maps)
      if (result.manifest) {
        localStorage.setItem(`manifest_${sceneId}`, JSON.stringify(result.manifest));
      }
      
      updateStage('tiles', 'complete', { count: result.count });
      setCurrentStage('upload');
      saveState();
    } catch (error) {
      updateStage('tiles', 'error');
      saveState();
      console.error('Tile generation error:', error);
    }
  }, [processedImage, sceneId]);

  // Stage 4: Upload to Storage using uploadMultiple
  const uploadToStorage = useCallback(async () => {
    if (!processedImage) return;

    updateStage('upload', 'processing');

    try {
      // Prepare all files for batch upload
      const filesToUpload: Array<{ file: Buffer; key: string; contentType: string }> = [];
      
      // Add main image
      const timestamp = Date.now();
      const mainKey = `scenes/${sceneId}/pano_${timestamp}.jpg`;
      filesToUpload.push({
        file: processedImage,
        key: mainKey,
        contentType: 'image/jpeg'
      });

      // Add all tiles
      if (tiles.size > 0) {
        for (const [filename, buffer] of tiles.entries()) {
          const key = `scenes/${sceneId}/tiles/${filename}`;
          filesToUpload.push({
            file: buffer,
            key,
            contentType: 'image/jpeg'
          });
        }
      }

      // Upload all files in parallel using uploadMultiple
      const uploadedUrls = await storageUploader.uploadMultiple(
        filesToUpload,
        (key, progress) => {
          setUploadProgress(prev => {
            const newProgress = new Map(prev);
            const displayKey = key.includes('pano_') ? 'main' : key.split('/').pop() || key;
            newProgress.set(displayKey, progress.percentage);
            return newProgress;
          });
        },
        5 // Upload 5 files concurrently
      );

      // Store URLs with correct keys
      const urls = new Map<string, string>();
      urls.set('main', uploadedUrls.get(mainKey) || '');
      
      // Add tile URLs
      for (const [key, url] of uploadedUrls.entries()) {
        if (key.includes('/tiles/')) {
          const filename = key.split('/').pop() || '';
          urls.set(filename, url);
        }
      }

      setUploadedUrls(urls);
      updateStage('upload', 'complete', { count: urls.size });
      setCurrentStage('save');
      saveState();
    } catch (error) {
      updateStage('upload', 'error');
      saveState();
      console.error('Upload error:', error);
    }
  }, [processedImage, tiles, sceneId]);

  // Stage 5: Save to Database
  const saveToDatabase = useCallback(async () => {
    if (!uploadedUrls.has('main')) return;

    updateStage('save', 'processing');

    try {
      // Get manifest from localStorage (stored by tile generation)
      let tilesManifest = null;
      const storedManifest = localStorage.getItem(`manifest_${sceneId}`);
      
      if (storedManifest) {
        // Use the cube map manifest from the API
        tilesManifest = JSON.parse(storedManifest);
        console.log('Manifest from localStorage (before adding URLs):', JSON.stringify(tilesManifest, null, 2));
        
        // Add URLs to the tiles in the manifest
        if (tilesManifest.type === 'cubemap') {
          // For cube maps, the tiles don't have URLs yet, we need to add them
          const tilesWithUrls:any = [];
          
          Array.from(uploadedUrls.entries())
            .filter(([key]) => key !== 'main' && key !== 'preview.jpg')
            .forEach(([key, url]) => {
              // Parse cube map tile format: face_l{level}_{x}_{y}.jpg
              const match = key.match(/(\w+)_l(\d+)_(\d+)_(\d+)\.jpg/);
              if (match) {
                const face = match[1];
                const level = parseInt(match[2]);
                const x = parseInt(match[3]);
                const y = parseInt(match[4]);
                
                tilesWithUrls.push({ 
                  face, 
                  level, 
                  x, 
                  y, 
                  key, 
                  url 
                });
              }
            });
          
          tilesManifest.tiles = tilesWithUrls;
          tilesManifest.preview = uploadedUrls.get('preview.jpg');
          console.log('Final manifest being saved to database:', JSON.stringify(tilesManifest, null, 2));
        }
      } else if (tiles.size > 0) {
        // Fallback: generate manifest from tiles (shouldn't happen with cube maps)
        console.warn('No manifest found, generating fallback manifest');
        tilesManifest = {
          type: 'cubemap',
          cubeSize: 4096,
          tileSize: 512,
          preview: uploadedUrls.get('preview.jpg'),
          faces: ['front', 'back', 'left', 'right', 'top', 'bottom'],
          levels: [
            { level: 1, size: 1024, tileSize: 512, tiles: 2 },
            { level: 2, size: 2048, tileSize: 512, tiles: 4 },
            { level: 3, size: 4096, tileSize: 512, tiles: 8 }
          ],
          tiles: []
        };
      }
      
      // Clean up localStorage
      localStorage.removeItem(`manifest_${sceneId}`);

      // Send URLs and manifest to backend for database storage
      const backendUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5555/api/';
      
      // Get auth token from localStorage or sessionStorage
      const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
      
      const response = await fetch(`${backendUrl}scenes/${sceneId}/update-images`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          mainImageUrl: uploadedUrls.get('main'),
          tilesManifest
        })
      });

      if (!response.ok) throw new Error('Failed to update scene');

      updateStage('save', 'complete');
      clearSavedState(); // Clear state on successful completion
      onComplete?.({
        sceneId,
        sceneName,
        mainImageUrl: uploadedUrls.get('main'),
        tilesManifest
      });
    } catch (error) {
      updateStage('save', 'error');
      saveState();
      console.error('Save error:', error);
    }
  }, [uploadedUrls, tiles, sceneId, onComplete]);

  // Skip to specific stage
  const skipToUpload = useCallback(() => {
    updateStage('tiles', 'skipped');
    setCurrentStage('upload');
  }, []);

  // Get stage action button
  const getStageAction = (stage: ProcessingStage) => {
    if (stage.status === 'processing') {
      return <Loader2 className="h-5 w-5 animate-spin" />;
    }
    
    if (stage.status === 'complete') {
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    }
    
    if (stage.status === 'error') {
      return <AlertCircle className="h-5 w-5 text-red-500" />;
    }

    if (currentStage === stage.id) {
      switch (stage.id) {
        case 'scene':
          return (
            <button
              onClick={createScene}
              disabled={!sceneName.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create Scene
            </button>
          );
        case 'select':
          return (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer"
            >
              Select File
            </button>
          );
        case 'process':
          return (
            <button
              onClick={processImage}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer"
            >
              Process Image
            </button>
          );
        case 'tiles':
          return (
            <div className="flex gap-2">
              <button
                onClick={generateTiles}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer"
              >
                Generate Tiles
              </button>
              <button
                onClick={skipToUpload}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 cursor-pointer"
              >
                Skip Tiles
              </button>
            </div>
          );
        case 'upload':
          return (
            <button
              onClick={uploadToStorage}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer"
            >
              Upload All
            </button>
          );
        case 'save':
          return (
            <button
              onClick={saveToDatabase}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 cursor-pointer"
            >
              Save to Database
            </button>
          );
      }
    }
    
    return null;
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg p-6 relative">
        {onCancel && (
          <button
            onClick={onCancel}
            className="absolute top-4 right-4 text-gray-600 hover:text-gray-800 z-10"
          >
            <X className="w-6 h-6 cursor-pointer" />
          </button>
        )}
        
        <div className="mb-6 pr-10">
          <h2 className="text-2xl font-bold text-gray-900">Advanced 360° Image Upload</h2>
          <p className="text-gray-600 mt-2">Upload and process your 360° panoramic image</p>
        </div>

        {needsSceneCreation && (
          <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <label className="block text-sm font-medium mb-2 text-gray-900">
              Scene Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={sceneName}
              onChange={(e) => setSceneName(e.target.value)}
              placeholder="e.g., Living Room, Entrance Hall"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder-gray-500"
            />
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Preview */}
        {previewUrl && (
          <div className="mb-6">
            <img 
              src={previewUrl} 
              alt="Preview" 
              className="w-full h-48 object-cover rounded-lg"
            />
            {selectedFile && (
              <p className="mt-2 text-sm text-gray-800 font-medium">
                {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
          </div>
        )}

        {/* Processing Stages */}
        <div className="space-y-4">
          {stages.map((stage) => (
            <div 
              key={stage.id}
              className={`p-4 border rounded-lg ${
                stage.status === 'complete' ? 'border-green-500 bg-green-50' :
                stage.status === 'error' ? 'border-red-500 bg-red-50' :
                stage.status === 'processing' ? 'border-blue-500 bg-blue-50' :
                stage.status === 'skipped' ? 'border-gray-300 bg-gray-50' :
                'border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {stage.id === 'scene' && <Save className="h-5 w-5 text-gray-700" />}
                  {stage.id === 'select' && <ImageIcon className="h-5 w-5 text-gray-700" />}
                  {stage.id === 'process' && <ImageIcon className="h-5 w-5 text-gray-700" />}
                  {stage.id === 'tiles' && <Grid3x3 className="h-5 w-5 text-gray-700" />}
                  {stage.id === 'upload' && <CloudUpload className="h-5 w-5 text-gray-700" />}
                  {stage.id === 'save' && <Save className="h-5 w-5 text-gray-700" />}
                  
                  <div>
                    <h3 className="font-medium text-gray-900">{stage.name}</h3>
                    {stage.data && (
                      <p className="text-sm text-gray-700">
                        {JSON.stringify(stage.data)}
                      </p>
                    )}
                  </div>
                </div>
                
                {getStageAction(stage)}
              </div>

              {/* Upload Progress */}
              {stage.id === 'upload' && stage.status === 'processing' && (
                <div className="mt-4 space-y-2">
                  {Array.from(uploadProgress.entries()).map(([key, progress]) => (
                    <div key={key}>
                      <div className="flex justify-between text-sm text-gray-800">
                        <span className="font-medium">{key}</span>
                        <span className="font-medium">{progress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Success Message */}
        {stages.every(s => s.status === 'complete' || s.status === 'skipped') && (
          <div className="mt-6 p-4 bg-green-100 border border-green-500 rounded-lg">
            <p className="text-green-700 font-medium">
              ✅ Upload complete! Your 360° image is ready.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}