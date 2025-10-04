'use client';

import { useState } from 'react';
import { Scene } from '@/types/tour';
import AdvancedSceneUploader from '../upload/AdvancedSceneUploader';
import SceneCreationFlow from './SceneCreationFlow';

interface SceneManagerProps {
  tourId: string;
  scenes: Scene[];
  onSceneUpdate?: (scenes: Scene[]) => void;
  handleSceneAdded?: (scene: Scene) => void;
}

export default function SceneManager({ tourId, scenes, onSceneUpdate, handleSceneAdded }: SceneManagerProps) {
  const [selectedScene, setSelectedScene] = useState<Scene | null>(null);
  const [showUploader, setShowUploader] = useState(false);
  const [showCreationFlow, setShowCreationFlow] = useState(false);

  const handleSceneClick = (scene: Scene) => {
    setSelectedScene(scene);
    setShowUploader(false);
  };

  const handleUploadComplete = (manifestUrl: string) => {
    if (selectedScene) {
      const updatedScene = {
        ...selectedScene,
        cubemap_manifest_url: manifestUrl
      };
      const updatedScenes  = scenes?.map(s => 
        s.id === selectedScene.id ? updatedScene : s
      );
      onSceneUpdate?.(updatedScenes);
      setSelectedScene(updatedScene);
    }
    setShowUploader(false);
  };

  const handleSceneCreated = (newScene: Scene) => {
    const updatedScenes = [...(scenes || []), newScene];
    onSceneUpdate?.(updatedScenes);
    handleSceneAdded?.(newScene);
    setShowCreationFlow(false);
    setSelectedScene(newScene);
  };

  return (
    <div className="flex h-full">
      <div className="w-1/3 border-r p-4 overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Scenes</h3>
          <button
            className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 cursor-pointer"
            onClick={() => setShowCreationFlow(true)}
          >
            Add Scene
          </button>
        </div>
        
        <div className="space-y-2">
          {scenes?.map((scene) => (
            <div
              key={scene.id}
              onClick={() => handleSceneClick(scene)}
              className={`p-3 rounded cursor-pointer transition-colors ${
                selectedScene?.id === scene.id
                  ? 'bg-blue-100 border-blue-500 border'
                  : 'bg-gray-50 hover:bg-gray-100'
              }`}
            >
              <div className="font-medium">{scene.name}</div>
              <div className="text-sm text-gray-600">
                Type: {scene.type} | Order: {scene.order}
              </div>
              {scene.src_original_url && (
                <div className="text-xs text-green-600 mt-1">✓ Has image</div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 p-4">
        {selectedScene ? (
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-semibold mb-4">{selectedScene.name}</h3>
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium mb-1">Scene Type</label>
                  <input
                    type="text"
                    value={selectedScene.type}
                    readOnly
                    className="w-full px-3 py-2 border rounded-md bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Order</label>
                  <input
                    type="number"
                    value={selectedScene.order}
                    readOnly
                    className="w-full px-3 py-2 border rounded-md bg-gray-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium mb-1">Yaw</label>
                  <input
                    type="number"
                    value={selectedScene.yaw}
                    step="0.1"
                    className="w-full px-3 py-2 border rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Pitch</label>
                  <input
                    type="number"
                    value={selectedScene.pitch}
                    step="0.1"
                    className="w-full px-3 py-2 border rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">FOV</label>
                  <input
                    type="number"
                    value={selectedScene.fov}
                    step="1"
                    min="30"
                    max="120"
                    className="w-full px-3 py-2 border rounded-md"
                  />
                </div>
              </div>

              {!showUploader ? (
                <div className="space-y-4">
                  {selectedScene.src_original_url ? (
                    <div className="p-4 bg-green-50 rounded">
                      <p className="text-green-700 font-medium">Scene has 360° image</p>
                      <p className="text-sm text-gray-600 mt-1">
                        URL: {selectedScene.src_original_url.substring(0, 50)}...
                      </p>
                      <button
                        onClick={() => setShowUploader(true)}
                        className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        Replace Image
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowUploader(true)}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      Upload Scene Image
                    </button>
                  )}
                </div>
              ) : (
                <AdvancedSceneUploader
                  sceneId={selectedScene.id}
                  onComplete={(data) => {
                    // Update scene with the uploaded URLs
                    const updatedScene = {
                      ...selectedScene,
                      src_original_url: data.mainImageUrl,
                      tiles_manifest: data.tilesManifest ? JSON.stringify(data.tilesManifest) : undefined
                    };
                    const updatedScenes = scenes?.map(s => 
                      s.id === selectedScene.id ? updatedScene : s
                    );
                    onSceneUpdate?.(updatedScenes);
                    setSelectedScene(updatedScene);
                    setShowUploader(false);
                  }}
                />
              )}

              <div className="mt-6 pt-6 border-t">
                <h4 className="font-medium mb-2">Statistics</h4>
                <div className="text-sm text-gray-600 space-y-1">
                  <p>Hotspots: {selectedScene.hotspots?.length || 0}</p>
                  <p>Overlays: {selectedScene.overlays?.length || 0}</p>
                  <p>Priority: {selectedScene.priority}</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-gray-500 mb-4">No scene selected</div>
              <button
                onClick={() => setShowCreationFlow(true)}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Create Your First Scene
              </button>
            </div>
          </div>
        )}
      </div>

      {showCreationFlow && (
        <SceneCreationFlow
          tourId={tourId}
          onSceneCreated={handleSceneCreated}
          onClose={() => setShowCreationFlow(false)}
        />
      )}
    </div>
  );
}