'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, Plus, Save, Eye, Edit, Trash2, Move, Lock } from 'lucide-react';
import PhotoViewer360 from './PhotoViewer360';
import HotspotEditor from './HotspotEditor';
import LocalPaymentModal from './LocalPaymentModal';
import { useAuth } from '@/contexts/AuthContext';
import axios from 'axios';

interface Scene {
  id: string;
  name: string;
  imageUrl?: string;
  order: number;
  hotspots: Hotspot[];
}

interface Hotspot {
  id: string;
  yaw: number;
  pitch: number;
  kind: string;
  payload: any;
}

interface Tour {
  id?: string;
  name: string;
  scenes: Scene[];
}

export default function TourCreator() {
  const { user, isAuthenticated, checkPaymentRequired, getAuthHeaders } = useAuth();
  const [tour, setTour] = useState<Tour>({
    name: 'New Virtual Tour',
    scenes: [],
  });
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [showHotspotEditor, setShowHotspotEditor] = useState(false);
  const [selectedHotspot, setSelectedHotspot] = useState<Hotspot | null>(null);
  const [pendingHotspotPosition, setPendingHotspotPosition] = useState<{ yaw: number; pitch: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [requiresPayment, setRequiresPayment] = useState(false);

  const currentScene = tour.scenes[currentSceneIndex];

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    setUploading(true);
    try {
      // Create FormData for upload
      const formData = new FormData();
      formData.append('image', acceptedFiles[0]);

      // Upload to backend
      const uploadResponse = await axios.post('/api/upload/360', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const newScene: Scene = {
        id: `scene-${Date.now()}`,
        name: `Scene ${tour.scenes.length + 1}`,
        imageUrl: uploadResponse.data.url,
        order: tour.scenes.length,
        hotspots: [],
      };

      setTour((prev) => ({
        ...prev,
        scenes: [...prev.scenes, newScene],
      }));
      setCurrentSceneIndex(tour.scenes.length);
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Failed to upload image');
    } finally {
      setUploading(false);
    }
  }, [tour.scenes.length]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpg', '.jpeg', '.png'],
    },
    maxFiles: 1,
  });

  const handleAddHotspot = (yaw: number, pitch: number) => {
    setPendingHotspotPosition({ yaw, pitch });
    setSelectedHotspot(null);
    setShowHotspotEditor(true);
  };

  const handleSaveHotspot = (hotspotData: Partial<Hotspot>) => {
    if (!currentScene) return;

    const newHotspot: Hotspot = {
      id: hotspotData.id || `hotspot-${Date.now()}`,
      yaw: pendingHotspotPosition?.yaw || hotspotData.yaw || 0,
      pitch: pendingHotspotPosition?.pitch || hotspotData.pitch || 0,
      kind: hotspotData.kind || 'navigation',
      payload: hotspotData.payload || {},
    };

    const updatedScenes = [...tour.scenes];
    const sceneIndex = tour.scenes.indexOf(currentScene);

    if (hotspotData.id) {
      // Update existing hotspot
      const hotspotIndex = currentScene.hotspots.findIndex((h) => h.id === hotspotData.id);
      updatedScenes[sceneIndex].hotspots[hotspotIndex] = newHotspot;
    } else {
      // Add new hotspot
      updatedScenes[sceneIndex].hotspots.push(newHotspot);
    }

    setTour((prev) => ({ ...prev, scenes: updatedScenes }));
    setPendingHotspotPosition(null);
  };

  const handleDeleteHotspot = (hotspotId: string) => {
    if (!currentScene) return;

    const updatedScenes = [...tour.scenes];
    const sceneIndex = tour.scenes.indexOf(currentScene);
    updatedScenes[sceneIndex].hotspots = currentScene.hotspots.filter(
      (h) => h.id !== hotspotId
    );

    setTour((prev) => ({ ...prev, scenes: updatedScenes }));
  };

  const handleHotspotClick = (hotspot: Hotspot) => {
    if (editMode) {
      setSelectedHotspot(hotspot);
      setShowHotspotEditor(true);
    } else if (hotspot.kind === 'navigation' && hotspot.payload.targetSceneId) {
      const targetIndex = tour.scenes.findIndex((s) => s.id === hotspot.payload.targetSceneId);
      if (targetIndex !== -1) {
        setCurrentSceneIndex(targetIndex);
      }
    }
  };

  const handleDeleteScene = (sceneId: string) => {
    const updatedScenes = tour.scenes.filter((s) => s.id !== sceneId);
    setTour((prev) => ({ ...prev, scenes: updatedScenes }));
    if (currentSceneIndex >= updatedScenes.length) {
      setCurrentSceneIndex(Math.max(0, updatedScenes.length - 1));
    }
  };

  useEffect(() => {
    // Check if payment is required when component mounts
    const checkPayment = async () => {
      if (isAuthenticated) {
        const paymentRequired = await checkPaymentRequired();
        setRequiresPayment(paymentRequired);
      }
    };
    checkPayment();
  }, [isAuthenticated]);

  const handleSaveTour = async () => {
    if (!isAuthenticated) {
      alert('Please log in to save tours');
      return;
    }

    // Check if payment is required
    if (requiresPayment) {
      setShowPaymentModal(true);
      return;
    }

    try {
      const response = await axios.post('/api/tours', tour, {
        headers: getAuthHeaders()
      });
      
      if (response.status === 402) {
        // Payment required
        setShowPaymentModal(true);
        return;
      }
      
      setTour(response.data);
      alert('Tour saved successfully!');
    } catch (error: any) {
      if (error.response?.status === 402) {
        setShowPaymentModal(true);
      } else if (error.response?.status === 401) {
        alert('Please log in to save tours');
      } else {
        console.error('Save failed:', error);
        alert('Failed to save tour');
      }
    }
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="w-80 bg-white shadow-lg flex flex-col">
        <div className="p-4 border-b">
          <input
            type="text"
            value={tour.name}
            onChange={(e) => setTour((prev) => ({ ...prev, name: e.target.value }))}
            className="w-full px-3 py-2 text-lg font-semibold border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Tour Name"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Scenes</h3>
            <div className="space-y-2">
              {tour.scenes.map((scene, index) => (
                <div
                  key={scene.id}
                  className={`p-3 rounded-md border-2 cursor-pointer transition-colors ${
                    index === currentSceneIndex
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => setCurrentSceneIndex(index)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Move size={16} className="text-gray-400" />
                      <span className="font-medium">{scene.name}</span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteScene(scene.id);
                      }}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {scene.hotspots.length} hotspots
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              isDragActive
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <input {...getInputProps()} />
            <Upload size={32} className="mx-auto mb-2 text-gray-400" />
            <p className="text-sm text-gray-600">
              {isDragActive
                ? 'Drop the 360° image here'
                : 'Drag & drop a 360° image, or click to select'}
            </p>
            {uploading && <p className="text-sm text-blue-600 mt-2">Uploading...</p>}
          </div>
        </div>

        <div className="p-4 border-t space-y-2">
          <button
            onClick={() => setEditMode(!editMode)}
            className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md transition-colors ${
              editMode
                ? 'bg-yellow-500 text-white hover:bg-yellow-600'
                : 'bg-gray-200 hover:bg-gray-300'
            }`}
          >
            <Edit size={18} />
            {editMode ? 'Exit Edit Mode' : 'Edit Mode'}
          </button>
          <button
            onClick={handleSaveTour}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
          >
            <Save size={18} />
            Save Tour
          </button>
        </div>
      </div>

      {/* Main Viewer */}
      <div className="flex-1 relative">
        {currentScene ? (
          <>
            <PhotoViewer360
              imageUrl={currentScene.imageUrl!}
              hotspots={currentScene.hotspots}
              onHotspotClick={handleHotspotClick}
              onAddHotspot={editMode ? handleAddHotspot : undefined}
              editMode={editMode}
            />
            {editMode && (
              <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg p-4">
                <h3 className="font-semibold mb-2">Edit Mode</h3>
                <p className="text-sm text-gray-600">
                  Click anywhere on the image to add a hotspot
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Eye size={64} className="mx-auto mb-4 text-gray-300" />
              <h2 className="text-xl font-semibold text-gray-700 mb-2">No Scene Selected</h2>
              <p className="text-gray-500">Upload a 360° image to get started</p>
            </div>
          </div>
        )}
      </div>

      {/* Hotspot Editor Modal */}
      {showHotspotEditor && (
        <HotspotEditor
          hotspot={selectedHotspot}
          onSave={handleSaveHotspot}
          onDelete={selectedHotspot ? handleDeleteHotspot : undefined}
          onClose={() => {
            setShowHotspotEditor(false);
            setSelectedHotspot(null);
            setPendingHotspotPosition(null);
          }}
        />
      )}

      {/* Payment Modal */}
      {showPaymentModal && (
        <LocalPaymentModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          tourId={tour.id || 'new'}
          onSuccess={() => {
            setShowPaymentModal(false);
            setRequiresPayment(false);
            handleSaveTour();
          }}
        />
      )}

      {/* Authentication Warning */}
      {!isAuthenticated && (
        <div className="fixed bottom-4 left-4 right-4 bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded-lg shadow-lg max-w-md mx-auto">
          <div className="flex items-center gap-2">
            <Lock size={20} />
            <p className="text-sm">Please log in to save and publish tours</p>
          </div>
        </div>
      )}
    </div>
  );
}