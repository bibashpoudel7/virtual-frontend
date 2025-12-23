'use client';

import { useState } from 'react';
import { Scene } from '@/types/tour';
import AdvancedSceneUploader from '../upload/AdvancedSceneUploader';
import SceneDetailsModal from './SceneDetailsModal';

interface SceneCreationFlowProps {
  tourId: string;
  onSceneCreated: (scene: Scene) => void;
  onClose: () => void;
}

export default function SceneCreationFlow({ tourId, onSceneCreated, onClose }: SceneCreationFlowProps) {
  const [selectedType] = useState<'image' | 'video' | '360'>('360'); // Default to 360° panorama
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [createdSceneId, setCreatedSceneId] = useState<string | null>(null);

  const handleSceneCreated = (scene: Scene) => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    onSceneCreated(scene);
  };

  const handleClose = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-5xl w-full h-[85vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col h-full">
          <div className="flex-1 overflow-y-auto">
            <AdvancedSceneUploader
              sceneId={createdSceneId || ''}
              tourId={tourId}
              sceneType={selectedType}
              onComplete={(data) => {
                // Create scene with the uploaded data
                const newScene: Scene = {
                  id: data.sceneId || createdSceneId || '',
                  tour_id: tourId,
                  name: data.sceneName || 'New Scene',
                  type: selectedType,
                  order: 1,
                  yaw: 0,
                  pitch: 0,
                  fov: 75,
                  priority: 1,
                  src_original_url: data.mainImageUrl,
                  tiles_manifest: data.tilesManifest ? JSON.stringify(data.tilesManifest) : undefined,
                  hotspots: [],
                  overlays: [],
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                };
                handleSceneCreated(newScene);
              }}
              onCancel={handleClose}
            />
          </div>
        </div>
      </div>
    </div>
  );
}