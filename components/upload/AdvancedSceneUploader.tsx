'use client';

// frontend/components/upload/AdvancedSceneUploader.tsx
import { useState, useCallback, useRef, useEffect } from 'react';
import { storageUploader } from '@/lib/storage-upload';
import { 
  Upload, X, CheckCircle, AlertCircle, Loader2, 
  Image as ImageIcon, Grid3x3, CloudUpload, Save 
} from 'lucide-react';

interface AdvancedSceneUploaderProps {
  sceneId: string;
  onComplete?: (data: any) => void;
}

interface ProcessingStage {
  id: 'select' | 'process' | 'tiles' | 'upload' | 'save';
  name: string;
  status: 'pending' | 'processing' | 'complete' | 'error' | 'skipped';
  data?: any;
}

export default function AdvancedSceneUploader({ sceneId, onComplete }: AdvancedSceneUploaderProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [processedImage, setProcessedImage] = useState<Buffer | null>(null);
  const [tiles, setTiles] = useState<Map<string, Buffer>>(new Map());
  const [uploadedUrls, setUploadedUrls] = useState<Map<string, string>>(new Map());
  
  // Persist state key for this scene
  const stateKey = `upload_state_${sceneId}`;
  
  const [stages, setStages] = useState<ProcessingStage[]>([
    { id: 'select', name: 'Select Image', status: 'pending' },
    { id: 'process', name: 'Process Image', status: 'pending' },
    { id: 'tiles', name: 'Generate Tiles', status: 'pending' },
    { id: 'upload', name: 'Upload to Storage', status: 'pending' },
    { id: 'save', name: 'Save to Database', status: 'pending' },
  ]);

  const [currentStage, setCurrentStage] = useState<string>('select');
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
      setPreviewUrl(e.target?.result as string);
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
      const processedBlob = new Blob([processedImage], { type: 'image/jpeg' });
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
      // Create comprehensive tiles manifest JSON - automatically generate levels based on tiles
      let tilesManifest = null;
      
      if (tiles.size > 0) {
        // Parse all tiles to determine levels
        const tilesByLevel = new Map<number, Array<{col: number, row: number}>>();
        const allTiles:any = [];
        
        Array.from(uploadedUrls.entries())
          .filter(([key]) => key.startsWith('l'))
          .forEach(([key, url]) => {
            const match = key.match(/l(\d+)_(\d+)_(\d+)\.jpg/);
            if (match) {
              const level = parseInt(match[1]);
              const row = parseInt(match[2]);
              const col = parseInt(match[3]);
              
              allTiles.push({ key, url, level, row, col });
              
              if (!tilesByLevel.has(level)) {
                tilesByLevel.set(level, []);
              }
              tilesByLevel.get(level)!.push({ col, row });
            }
          });
        
        // Generate level information based on actual tiles
        const levels = Array.from(tilesByLevel.entries())
          .sort((a, b) => a[0] - b[0]) // Sort by level number
          .map(([level, tiles]) => {
            const maxCol = Math.max(...tiles.map(t => t.col));
            const maxRow = Math.max(...tiles.map(t => t.row));
            
            // Calculate dimensions from tile count and tile size
            // Use 1024 for large images, 512 for normal
            const tileSize = (maxCol + 1) > 16 ? 1024 : 512;
            const width = (maxCol + 1) * tileSize;
            const height = (maxRow + 1) * tileSize;
            
            return {
              level,
              width,
              height,
              tilesX: maxCol + 1,
              tilesY: maxRow + 1
            };
          });
        
        // Determine tile size from the highest level
        const maxCols = Math.max(...levels.map(l => l.tilesX));
        const detectedTileSize = maxCols > 16 ? 1024 : 512;
        
        tilesManifest = {
          type: 'multires',
          tileSize: detectedTileSize, // Dynamic tile size
          dimensions: {
            width: levels[levels.length - 1]?.width || 4096,  // Use highest level dimensions
            height: levels[levels.length - 1]?.height || 2048
          },
          preview: uploadedUrls.get('preview.jpg'),
          levels,
          tiles: allTiles
        };
      }

      // Send URLs and manifest to backend for database storage
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5555';
      
      // Get auth token from localStorage or sessionStorage
      const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
      
      const response = await fetch(`${backendUrl}/api/scenes/${sceneId}/update-images`, {
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
        case 'select':
          return (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Select File
            </button>
          );
        case 'process':
          return (
            <button
              onClick={processImage}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Process Image
            </button>
          );
        case 'tiles':
          return (
            <div className="flex gap-2">
              <button
                onClick={generateTiles}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Generate Tiles
              </button>
              <button
                onClick={skipToUpload}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
              >
                Skip Tiles
              </button>
            </div>
          );
        case 'upload':
          return (
            <button
              onClick={uploadToStorage}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Upload All
            </button>
          );
        case 'save':
          return (
            <button
              onClick={saveToDatabase}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
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
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-bold mb-6">Advanced 360° Image Upload</h2>

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
              <p className="mt-2 text-sm text-gray-600">
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
                  {stage.id === 'select' && <ImageIcon className="h-5 w-5" />}
                  {stage.id === 'process' && <ImageIcon className="h-5 w-5" />}
                  {stage.id === 'tiles' && <Grid3x3 className="h-5 w-5" />}
                  {stage.id === 'upload' && <CloudUpload className="h-5 w-5" />}
                  {stage.id === 'save' && <Save className="h-5 w-5" />}
                  
                  <div>
                    <h3 className="font-medium">{stage.name}</h3>
                    {stage.data && (
                      <p className="text-sm text-gray-600">
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
                      <div className="flex justify-between text-sm text-gray-600">
                        <span>{key}</span>
                        <span>{progress}%</span>
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