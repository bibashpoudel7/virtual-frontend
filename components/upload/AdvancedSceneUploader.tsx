'use client';

// frontend/components/upload/AdvancedSceneUploader.tsx
import { useState, useCallback, useRef, useEffect } from 'react';
import {
  X, CheckCircle, AlertCircle, Loader2,
  Image as ImageIcon, Grid3x3, CloudUpload, Save, RefreshCw
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

export default function AdvancedSceneUploader({
  sceneId: initialSceneId,
  tourId,
  sceneType = '360',
  onComplete,
  onCancel,
  onPreviewReady
}: AdvancedSceneUploaderProps) {
  const [sceneId, setSceneId] = useState<string>(initialSceneId || '');
  const [sceneName, setSceneName] = useState<string>('');
  const [needsSceneCreation, setNeedsSceneCreation] = useState(!initialSceneId);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPipelineRunning, setIsPipelineRunning] = useState(false);
  const [serverMessage, setServerMessage] = useState<string>('');
  const [overallProgress, setOverallProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const activePollRef = useRef<NodeJS.Timeout | null>(null);

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

  // Helper to map background job state to visual stages
  const updateStagesFromJob = useCallback((job: any) => {
    if (!job) return;
    const stage = job.stage;
    const status = job.status;

    if (job.message) setServerMessage(job.message);
    if (typeof job.progress === 'number') {
      setOverallProgress(job.progress);
    }

    if (status === 'error') {
      setError(job.error || 'Processing failed');
      setStages(prev => prev.map(s => s.id === stage ? { ...s, status: 'error' } : s));
      return;
    }

    if (status === 'complete') {
      setStages(prev => prev.map(s => ({ ...s, status: 'complete' })));
      setCurrentStage('save');
      return;
    }

    const stageOrder = ['select', 'process', 'tiles', 'upload', 'save', 'complete'];
    const currentIdx = stageOrder.indexOf(stage);

    setStages(prev => prev.map(s => {
      if (s.id === 'scene') return { ...s, status: 'complete' };
      const thisIdx = stageOrder.indexOf(s.id);
      if (thisIdx < currentIdx) {
        return { ...s, status: 'complete' };
      } else if (thisIdx === currentIdx) {
        return { ...s, status: 'processing' };
      } else {
        return { ...s, status: 'pending' };
      }
    }));
    setCurrentStage(stage);
  }, []);

  // Check background job status on mount (handles page refresh!)
  useEffect(() => {
    if (!sceneId) return;

    let isMounted = true;

    const checkInitialJob = async () => {
      try {
        const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken') || '';
        const resp = await fetch(`/api/process-image?sceneId=${encodeURIComponent(sceneId)}`, {
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          cache: 'no-store'
        });

        if (!resp.ok || !isMounted) return;
        const job = await resp.json();

        if (job && job.status === 'processing') {
          setIsPipelineRunning(true);
          updateStagesFromJob(job);

          // Continue polling running background job
          if (activePollRef.current) clearInterval(activePollRef.current);
          activePollRef.current = setInterval(async () => {
            try {
              const pollResp = await fetch(`/api/process-image?sceneId=${encodeURIComponent(sceneId)}`, {
                cache: 'no-store'
              });
              if (pollResp.ok && isMounted) {
                const pollJob = await pollResp.json();
                updateStagesFromJob(pollJob);

                if (pollJob.status === 'complete') {
                  if (activePollRef.current) clearInterval(activePollRef.current);
                  setIsPipelineRunning(false);
                  if (pollJob.data) onComplete?.(pollJob.data);
                } else if (pollJob.status === 'error') {
                  if (activePollRef.current) clearInterval(activePollRef.current);
                  setIsPipelineRunning(false);
                }
              }
            } catch {
              // Ignore polling network glitches
            }
          }, 1500);
        } else if (job && job.status === 'complete' && job.data) {
          updateStagesFromJob(job);
        }
      } catch (err) {
        console.warn('Could not query background upload status:', err);
      }
    };

    checkInitialJob();

    return () => {
      isMounted = false;
      if (activePollRef.current) clearInterval(activePollRef.current);
    };
  }, [sceneId, onComplete, updateStagesFromJob]);

  // Automated pipeline runner: processes all stages automatically in sequence
  const startPipeline = useCallback(async (file: File, targetSceneId: string) => {
    if (!file || !targetSceneId) return;

    setIsPipelineRunning(true);
    setError(null);
    setOverallProgress(10);
    setServerMessage('Starting upload and server processing...');

    // Immediately mark select as complete, process as active
    setStages(prev => prev.map(s => {
      if (s.id === 'select' || s.id === 'scene') return { ...s, status: 'complete' };
      if (s.id === 'process') return { ...s, status: 'processing' };
      return { ...s, status: 'pending' };
    }));
    setCurrentStage('process');

    // Start background status poller
    if (activePollRef.current) clearInterval(activePollRef.current);
    activePollRef.current = setInterval(async () => {
      try {
        const resp = await fetch(`/api/process-image?sceneId=${encodeURIComponent(targetSceneId)}`, {
          cache: 'no-store'
        });
        if (resp.ok) {
          const job = await resp.json();
          if (job && job.status) {
            updateStagesFromJob(job);
            if (job.status === 'complete') {
              if (activePollRef.current) clearInterval(activePollRef.current);
              setIsPipelineRunning(false);
              if (job.data) onComplete?.(job.data);
            } else if (job.status === 'error') {
              if (activePollRef.current) clearInterval(activePollRef.current);
              setIsPipelineRunning(false);
              setError(job.error || 'Processing failed');
            }
          }
        }
      } catch {
        // Ignore
      }
    }, 1000);

    try {
      const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken') || '';
      const formData = new FormData();
      formData.append('file', file);
      formData.append('sceneId', targetSceneId);
      if (tourId) formData.append('tourId', tourId);
      if (token) formData.append('token', token);
      formData.append('operation', 'pipeline');

      const response = await fetch('/api/process-image', {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: formData,
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(errJson.error || `Upload failed with status ${response.status}`);
      }

      const result = await response.json();
      if (result.success) {
        if (activePollRef.current) clearInterval(activePollRef.current);
        setIsPipelineRunning(false);
        setOverallProgress(100);
        setServerMessage('Complete!');
        setStages(prev => prev.map(s => ({ ...s, status: 'complete' })));
        onComplete?.(result);
      }
    } catch (err: any) {
      if (activePollRef.current) clearInterval(activePollRef.current);
      setIsPipelineRunning(false);
      setError(err.message || 'Processing failed');
      setStages(prev => prev.map(s => s.status === 'processing' ? { ...s, status: 'error' } : s));
    }
  }, [tourId, onComplete, updateStagesFromJob]);

  // Stage 0: Create Scene (if needed)
  const createScene = useCallback(async () => {
    if (!tourId || !sceneName.trim()) return;

    setStages(prev => prev.map(s => s.id === 'scene' ? { ...s, status: 'processing' } : s));

    try {
      const backendUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.tour.thenimto.com/api/';
      const separator = backendUrl.endsWith('/') ? '' : '/';
      const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');

      const response = await fetch(`${backendUrl}${separator}tours/${tourId}/scenes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
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
      setNeedsSceneCreation(false);
      setStages(prev => prev.map(s => s.id === 'scene' ? { ...s, status: 'complete' } : s));
      setCurrentStage('select');
    } catch (err: any) {
      setStages(prev => prev.map(s => s.id === 'scene' ? { ...s, status: 'error' } : s));
      setError(err.message || 'Scene creation error');
    }
  }, [tourId, sceneName, sceneType]);

  // Stage 1: Select File - immediately kicks off automated processing
  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setError(null);

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target?.result as string;
      setPreviewUrl(url);
      onPreviewReady?.(url);
    };
    reader.readAsDataURL(file);

    // Automatically execute the entire pipeline
    if (sceneId) {
      startPipeline(file, sceneId);
    }
  }, [sceneId, onPreviewReady, startPipeline]);

  // Stage action icons/buttons
  const getStageAction = (stage: ProcessingStage) => {
    if (stage.status === 'processing') {
      return <Loader2 className="h-5 w-5 animate-spin text-blue-600" />;
    }

    if (stage.status === 'complete') {
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    }

    if (stage.status === 'error') {
      return <AlertCircle className="h-5 w-5 text-red-500" />;
    }

    if (stage.id === 'scene' && needsSceneCreation) {
      return (
        <button
          onClick={createScene}
          disabled={!sceneName.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
        >
          Create Scene
        </button>
      );
    }

    if (stage.id === 'select' && !isPipelineRunning) {
      return (
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer text-sm font-medium shadow-sm"
        >
          {selectedFile ? 'Change Photo' : 'Select Photo'}
        </button>
      );
    }

    return null;
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg p-6 relative">
        {onCancel && (
          <button
            onClick={onCancel}
            className="absolute top-4 right-4 text-gray-500 hover:text-gray-800 z-10 p-1 rounded-full hover:bg-gray-100 cursor-pointer"
            title="Close"
          >
            <X className="w-6 h-6" />
          </button>
        )}

        <div className="mb-6 pr-10">
          <h2 className="text-2xl font-bold text-gray-900">360° Photo Upload</h2>
          <p className="text-gray-600 text-sm mt-1">
            Upload your 360° panoramic image. Processing, tile generation, and cloud upload run automatically.
          </p>
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
              placeholder="e.g., Living Room, Main Gate, Balcony"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
            />
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
          disabled={isPipelineRunning}
        />

        {/* Image Preview */}
        {previewUrl && (
          <div className="mb-6">
            <img
              src={previewUrl}
              alt="Preview"
              className="w-full h-48 object-cover rounded-lg border border-gray-200 shadow-sm"
            />
            {selectedFile && (
              <p className="mt-2 text-sm text-gray-700 font-medium">
                {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
          </div>
        )}

        {/* Overall Progress Banner */}
        {isPipelineRunning && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-semibold text-blue-900 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                {serverMessage || 'Processing on server in background...'}
              </span>
              <span className="text-sm font-bold text-blue-900">{overallProgress}%</span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${Math.max(5, overallProgress)}%` }}
              />
            </div>
            <p className="text-xs text-blue-700 mt-2">
              You can navigate or refresh the page anytime — processing continues in the background on the server.
            </p>
          </div>
        )}

        {/* Error Notice */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-900">{error}</p>
                <p className="text-xs text-red-700 mt-1">Please try uploading again.</p>
              </div>
            </div>
            {selectedFile && sceneId && (
              <button
                onClick={() => startPipeline(selectedFile, sceneId)}
                className="px-3 py-1.5 bg-red-600 text-white rounded text-xs font-semibold hover:bg-red-700 flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Retry
              </button>
            )}
          </div>
        )}

        {/* Processing Stages List */}
        <div className="space-y-3">
          {stages.map((stage) => (
            <div
              key={stage.id}
              className={`p-4 border rounded-lg transition-colors ${
                stage.status === 'complete' ? 'border-green-400 bg-green-50/70' :
                stage.status === 'error' ? 'border-red-400 bg-red-50' :
                stage.status === 'processing' ? 'border-blue-400 bg-blue-50' :
                'border-gray-200 bg-gray-50/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {stage.id === 'scene' && <Save className="h-5 w-5 text-gray-600" />}
                  {stage.id === 'select' && <ImageIcon className="h-5 w-5 text-gray-600" />}
                  {stage.id === 'process' && <ImageIcon className="h-5 w-5 text-gray-600" />}
                  {stage.id === 'tiles' && <Grid3x3 className="h-5 w-5 text-gray-600" />}
                  {stage.id === 'upload' && <CloudUpload className="h-5 w-5 text-gray-600" />}
                  {stage.id === 'save' && <Save className="h-5 w-5 text-gray-600" />}

                  <div>
                    <h3 className="font-medium text-gray-900 text-sm">{stage.name}</h3>
                    {stage.status === 'processing' && (
                      <p className="text-xs text-blue-700 mt-0.5 font-medium animate-pulse">
                        {serverMessage || 'Running...'}
                      </p>
                    )}
                  </div>
                </div>

                {getStageAction(stage)}
              </div>
            </div>
          ))}
        </div>

        {/* Completed Status Banner */}
        {stages.every(s => s.status === 'complete') && (
          <div className="mt-6 p-4 bg-green-50 border border-green-300 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2 text-green-800 text-sm font-semibold">
              <CheckCircle className="w-5 h-5 text-green-600" />
              All steps complete! 360° photo and multi-res tiles are ready.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
