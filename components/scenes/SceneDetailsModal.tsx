'use client';

import { useState, useEffect } from 'react';
import { Scene } from '@/types/tour';
import { tourService } from '@/services/tourService';
import SimplePanoramaPreview from './SimplePanoramaPreview';
import AdvancedSceneUploader from '../upload/AdvancedSceneUploader';

interface SceneDetailsModalProps {
  tourId: string;
  imageFile?: File;
  previewUrl?: string;
  onClose: () => void;
  onSceneCreated: (scene: Scene) => void;
}

export default function SceneDetailsModal({ 
  tourId, 
  imageFile, 
  previewUrl, 
  onClose, 
  onSceneCreated 
}: SceneDetailsModalProps) {
  const [sceneName, setSceneName] = useState('');
  const [sceneType, setSceneType] = useState<'image' | 'video' | '360'>('360');
  const [yaw, setYaw] = useState(0);
  const [pitch, setPitch] = useState(0);
  const [fov, setFov] = useState(75);
  const [order, setOrder] = useState(1);
  const [priority, setPriority] = useState(1);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvancedUploader, setShowAdvancedUploader] = useState(false);
  const [createdSceneId, setCreatedSceneId] = useState<string | null>(null);

  useEffect(() => {
    const fetchExistingScenes = async () => {
      try {
        const scenes = await tourService.getScenes(tourId);
        const maxOrder = scenes.reduce((max, scene) => Math.max(max, scene.order), 0);
        setOrder(maxOrder + 1);
      } catch (err) {
        console.error('Failed to fetch scenes:', err);
      }
    };
    fetchExistingScenes();
  }, [tourId]);

  const handleCreateScene = async () => {
    if (!sceneName.trim()) {
      setError('Please enter a scene name');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const sceneData: Partial<Scene> = {
        name: sceneName,
        type: sceneType,
        yaw,
        pitch,
        fov,
        order,
        priority,
        tour_id: tourId,
      };
      
      const newScene = await tourService.createScene(tourId, sceneData);
      setCreatedSceneId(newScene.id);

      // If image is selected, show advanced uploader
      if (imageFile && previewUrl) {
        setShowAdvancedUploader(true);
        setIsCreating(false);
      } else {
        // No image, just complete
        onSceneCreated(newScene);
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create scene');
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-xl font-bold">Create New Scene</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg">
              {error}
            </div>
          )}

          {previewUrl && (
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">360° Interactive Preview</label>
              <div className="relative h-96 bg-gray-100 rounded-lg overflow-hidden">
                <SimplePanoramaPreview
                  imageUrl={previewUrl}
                  yaw={yaw}
                  pitch={pitch}
                  fov={fov}
                  onCameraChange={(newYaw, newPitch, newFov) => {
                    setYaw(newYaw);
                    setPitch(newPitch);
                    setFov(newFov);
                  }}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-4">

              <div>
                <label className="block text-sm font-medium mb-2">
                  Scene Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={sceneName}
                  onChange={(e) => setSceneName(e.target.value)}
                  placeholder="e.g., Living Room, Entrance Hall"
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Scene Type</label>
                <select
                  value={sceneType}
                  onChange={(e) => setSceneType(e.target.value as '360' | 'image' | 'video')}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="360">360° Panorama</option>
                  <option value="image">Static Image</option>
                  <option value="video">Video</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Order</label>
                  <input
                    type="number"
                    value={order}
                    onChange={(e) => setOrder(parseInt(e.target.value) || 1)}
                    min="1"
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Priority</label>
                  <input
                    type="number"
                    value={priority}
                    onChange={(e) => setPriority(parseInt(e.target.value) || 1)}
                    min="1"
                    max="10"
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="font-medium mb-3">Initial Camera Settings</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Yaw (Horizontal Rotation)
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        value={yaw}
                        onChange={(e) => setYaw(parseFloat(e.target.value))}
                        min="-180"
                        max="180"
                        step="1"
                        className="flex-1"
                      />
                      <input
                        type="number"
                        value={Math.round(yaw)}
                        onChange={(e) => setYaw(parseFloat(e.target.value) || 0)}
                        className="w-20 px-2 py-1 border rounded text-sm"
                      />
                      <span className="text-sm text-gray-500">°</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Pitch (Vertical Rotation)
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        value={pitch}
                        onChange={(e) => setPitch(parseFloat(e.target.value))}
                        min="-90"
                        max="90"
                        step="1"
                        className="flex-1"
                      />
                      <input
                        type="number"
                        value={Math.round(pitch)}
                        onChange={(e) => setPitch(parseFloat(e.target.value) || 0)}
                        className="w-20 px-2 py-1 border rounded text-sm"
                      />
                      <span className="text-sm text-gray-500">°</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Field of View (FOV)
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        value={fov}
                        onChange={(e) => setFov(parseFloat(e.target.value))}
                        min="30"
                        max="120"
                        step="1"
                        className="flex-1"
                      />
                      <input
                        type="number"
                        value={Math.round(fov)}
                        onChange={(e) => setFov(parseFloat(e.target.value) || 75)}
                        className="w-20 px-2 py-1 border rounded text-sm"
                      />
                      <span className="text-sm text-gray-500">°</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 p-4 rounded-lg">
                <h4 className="font-medium text-blue-900 mb-2">Interactive Controls</h4>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• Drag the preview image to adjust rotation</li>
                  <li>• Scroll on the preview to zoom in/out</li>
                  <li>• Use sliders for precise adjustments</li>
                  <li>• Changes are reflected immediately in the preview</li>
                  <li>• These settings determine the initial view when the scene loads</li>
                </ul>
              </div>
            </div>
          </div>

          {showAdvancedUploader && createdSceneId && (
            <div className="mt-6">
              <h3 className="font-medium mb-4">Upload and Process Image</h3>
              <AdvancedSceneUploader 
                sceneId={createdSceneId}
                onComplete={(data) => {
                  // Scene already exists, just update it with the URLs
                  tourService.getScenes(tourId).then(updatedScenes => {
                    onSceneCreated(updatedScenes[0]);
                    onClose();
                  });
                }}
              />
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isCreating}
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCreateScene}
            disabled={isCreating || !sceneName.trim()}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isCreating ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Creating Scene...
              </>
            ) : (
              'Create Scene'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}