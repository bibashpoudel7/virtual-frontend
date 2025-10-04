'use client';

import { useState } from 'react';
import { Scene } from '@/types/tour';
import SceneUploadPreview from './SceneUploadPreview';
import SceneDetailsModal from './SceneDetailsModal';

interface SceneCreationFlowProps {
  tourId: string;
  onSceneCreated: (scene: Scene) => void;
  onClose: () => void;
}

export default function SceneCreationFlow({ tourId, onSceneCreated, onClose }: SceneCreationFlowProps) {
  const [step, setStep] = useState<'upload' | 'details'>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleImageSelected = (file: File, url: string) => {
    setSelectedFile(file);
    setPreviewUrl(url);
    setStep('details');
  };

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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full h-[85vh] overflow-hidden">
        {step === 'upload' ? (
          <SceneUploadPreview
            tourId={tourId}
            onImageSelected={handleImageSelected}
            onCancel={handleClose}
          />
        ) : (
          <SceneDetailsModal
            tourId={tourId}
            imageFile={selectedFile || undefined}
            previewUrl={previewUrl || undefined}
            onClose={handleClose}
            onSceneCreated={handleSceneCreated}
          />
        )}
      </div>
    </div>
  );
}