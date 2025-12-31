'use client';

import { useState, useEffect, useCallback } from 'react';
import { Scene } from '@/types/tour';
import { HotspotsAPI } from '@/lib/api/hotspots';
import AdvancedSceneUploader from '../upload/AdvancedSceneUploader';
import SimplePanoramaPreview from './SimplePanoramaPreview';
import DeleteModal from '@/components/modals/DeleteModal';
import { toast } from 'react-toastify';
import { tourService } from '@/services/tourService';

interface SceneManagerProps {
  tourId: string;
  scenes: Scene[];
  onSceneUpdate?: (scenes: Scene[]) => void;
  handleSceneAdded?: (scene: Scene) => void;
  isActive?: boolean; // Track if this tab is active
}

export default function SceneManager({ tourId, scenes, onSceneUpdate, handleSceneAdded, isActive = true }: SceneManagerProps) {
  const [selectedScene, setSelectedScene] = useState<Scene | null>(null);
  const [showUploader, setShowUploader] = useState(false);
  const [showInlineCreation, setShowInlineCreation] = useState(false);
  const [tempPreviewUrl, setTempPreviewUrl] = useState<string | null>(null); 
  const [newSceneName, setNewSceneName] = useState('');
  const [newSceneType, setNewSceneType] = useState<'360' | 'image' | 'video'>('360');
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editedValues, setEditedValues] = useState<{ yaw: number, pitch: number, fov: number, order: number, type: string }>({
    yaw: 0,
    pitch: 0,
    fov: 75,
    order: 1,
    type: '360'
  });
  const [saveTimeout, setSaveTimeout] = useState<NodeJS.Timeout | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [tourOwnership, setTourOwnership] = useState<{
    isOwner: boolean;
    isSuperadmin: boolean;
    loading: boolean;
  }>({
    isOwner: false,
    isSuperadmin: false,
    loading: true
  });
  const [deleteModal, setDeleteModal] = useState<{
    open: boolean;
    sceneId: string | null;
    sceneName: string;
    isLoading: boolean;
  }>({
    open: false,
    sceneId: null,
    sceneName: '',
    isLoading: false
  });

  // Fetch hotspots and overlays for a scene
  const fetchSceneDetails = async (scene: Scene) => {
    try {
      const [hotspots, overlays] = await Promise.all([
        tourService.listHotspots(scene.id),
        tourService.listOverlays(scene.id)
      ]);
      
      const updatedScene = {
        ...scene,
        hotspots: hotspots || [],
        overlays: overlays || []
      };
      
      // Update the scene in the scenes array
      const updatedScenes = scenes?.map(s => 
        s.id === scene.id ? updatedScene : s
      ) || [];
      onSceneUpdate?.(updatedScenes);
      
      return updatedScene;
    } catch (error) {
      console.error('Failed to fetch scene details:', error);
      return scene;
    }
  };

  // Get current user ID and check tour ownership for delete permissions
  useEffect(() => {
    const checkTourOwnership = async () => {
      const userData = localStorage.getItem('user_data');
      if (!userData) {
        setTourOwnership({ isOwner: false, isSuperadmin: false, loading: false });
        return;
      }

      try {
        const user = JSON.parse(userData);
        const userId = user.id || user.user_id || null;
        const role = user.roles?.toString() || user.role?.toString() || null;
        
        setCurrentUserId(userId);
        setUserRole(role);

        // Check if user is superadmin
        const isSuperadmin = role === '1';
        
        if (isSuperadmin) {
          setTourOwnership({ isOwner: true, isSuperadmin: true, loading: false });
          return;
        }

        if (!userId) {
          setTourOwnership({ isOwner: false, isSuperadmin: false, loading: false });
          return;
        }

        // Check tour ownership by fetching tour details
        const tour = await tourService.getTour(tourId);
        const isOwner = tour.user_id === userId;
        setTourOwnership({ isOwner, isSuperadmin: false, loading: false });
      } catch (error) {
        console.error('Error checking tour ownership:', error);
        setTourOwnership({ isOwner: false, isSuperadmin: false, loading: false });
      }
    };

    checkTourOwnership();
  }, [tourId]);

  // Fetch hotspots and overlays for all scenes when scenes change
  useEffect(() => {
    const fetchAllSceneDetails = async () => {
      if (!scenes || scenes.length === 0) return;
      
      // Only fetch for scenes that don't have hotspots/overlays data yet
      const scenesToUpdate = scenes.filter(scene => 
        !scene.hotspots || !scene.overlays
      );
      
      if (scenesToUpdate.length === 0) return;
      
      try {
        const updatedScenes = await Promise.all(
          scenes.map(async (scene) => {
            if (!scene.hotspots || !scene.overlays) {
              const [hotspots, overlays] = await Promise.all([
                tourService.listHotspots(scene.id),
                tourService.listOverlays(scene.id)
              ]);
              
              return {
                ...scene,
                hotspots: hotspots || [],
                overlays: overlays || []
              };
            }
            return scene;
          })
        );
        
        onSceneUpdate?.(updatedScenes);
      } catch (error) {
        console.error('Failed to fetch scene details:', error);
      }
    };

    fetchAllSceneDetails();
  }, [scenes?.length]); // Only run when scenes array length changes

  const handleSceneClick = async (scene: Scene) => {
    setSelectedScene(scene);
    setShowUploader(false);
    setShowInlineCreation(false); 
    setTempPreviewUrl(null); 
    setEditedValues({
      yaw: scene.yaw || 0,
      pitch: scene.pitch || 0,
      fov: scene.fov || 75,
      order: scene.order || 1,
      type: scene.type || '360'
    });
    
    // Fetch hotspots and overlays for this scene if not already loaded
    if (!scene.hotspots || !scene.overlays || scene.hotspots.length === 0 && scene.overlays.length === 0) {
      const updatedScene = await fetchSceneDetails(scene);
      setSelectedScene(updatedScene);
    }
  };


  const createNewScene = async () => {
    if (!newSceneName.trim()) {
      setError('Scene name is required');
      return;
    }

    try {
      setIsCreating(true);
      setError(null);
      
      const backendUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5555/api/';
      const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');

      if (!token) {
        throw new Error('Authentication required. Please log in.');
      }

      const response = await fetch(`${backendUrl}tours/${tourId}/scenes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: newSceneName,
          type: newSceneType,
          yaw: 0,
          pitch: 0,
          fov: 75,
          order: (scenes?.length || 0) + 1,
          priority: 1
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || `Failed to create scene (${response.status}: ${response.statusText})`;
        throw new Error(errorMessage);
      }

      const newScene = await response.json();

      // Add to scenes list and select it
      const updatedScenes = [...(scenes || []), newScene];
      onSceneUpdate?.(updatedScenes);
      handleSceneAdded?.(newScene);

      // Select the new scene and show uploader
      setSelectedScene(newScene);
      setShowInlineCreation(false);
      setShowUploader(true);

      // Reset form
      setNewSceneName('');
      setNewSceneType('360');

    } catch (error) {
      console.error('Scene creation error:', error);
      setError(error instanceof Error ? error.message : 'Failed to create scene');
    } finally {
      setIsCreating(false);
    }
  };

  // Function to open delete modal
  const openDeleteModal = (sceneId: string, sceneName: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent scene selection
    event.preventDefault();
    
    setDeleteModal({
      open: true,
      sceneId,
      sceneName,
      isLoading: false
    });
  };

  // Function to confirm delete scene
  const confirmDeleteScene = async () => {
    if (!deleteModal.sceneId) return;
    
    setDeleteModal(prev => ({ ...prev, isLoading: true }));
    
    try {
      await tourService.deleteScene(deleteModal.sceneId);
      
      // Remove the scene from the local state
      const updatedScenes = scenes?.filter(scene => scene.id !== deleteModal.sceneId) || [];
      onSceneUpdate?.(updatedScenes);
      
      // If the deleted scene was selected, clear selection
      if (selectedScene?.id === deleteModal.sceneId) {
        setSelectedScene(null);
        setShowUploader(false);
        setShowInlineCreation(false);
      }
      
      // Show success toast
      toast.success(`Scene "${deleteModal.sceneName}" deleted successfully!`);
      
      // Close modal
      setDeleteModal({
        open: false,
        sceneId: null,
        sceneName: '',
        isLoading: false
      });
      
    } catch (error) {
      console.error('Error deleting scene:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete scene');
      setDeleteModal(prev => ({ ...prev, isLoading: false }));
    }
  };

  // Close delete modal
  const closeDeleteModal = () => {
    if (deleteModal.isLoading) return; // Prevent closing while deleting
    
    setDeleteModal({
      open: false,
      sceneId: null,
      sceneName: '',
      isLoading: false
    });
  };

  // Update edited values when selected scene changes
  useEffect(() => {
    if (selectedScene) {
      setEditedValues({
        yaw: selectedScene.yaw || 0,
        pitch: selectedScene.pitch || 0,
        fov: selectedScene.fov || 75,
        order: selectedScene.order || 1,
        type: selectedScene.type || '360'
      });
    }
  }, [selectedScene]);

  // Update selected scene when scenes array changes (to reflect updates)
  useEffect(() => {
    if (selectedScene && scenes) {
      const updatedSelectedScene = scenes.find(s => s.id === selectedScene.id);
      if (updatedSelectedScene &&
        (updatedSelectedScene.yaw !== selectedScene.yaw ||
          updatedSelectedScene.pitch !== selectedScene.pitch ||
          updatedSelectedScene.fov !== selectedScene.fov)) {
        setSelectedScene(updatedSelectedScene);
      }
    }
  }, [scenes, selectedScene]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeout) {
        clearTimeout(saveTimeout);
      }
    };
  }, [saveTimeout]);

  const handleValueChange = (field: 'yaw' | 'pitch' | 'fov' | 'order', value: number) => {
    setEditedValues(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleTypeChange = (type: string) => {
    setEditedValues(prev => ({
      ...prev,
      type
    }));
  };

  const saveSceneChanges = async () => {
    if (!selectedScene) return;

    try {
      const backendUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5555/api/';
      const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');

      const sceneTourId = selectedScene.tour_id || tourId;
      if (!sceneTourId) {
        throw new Error('Missing tour_id for scene update');
      }

      const updateData = {
        ...selectedScene,
        tour_id: sceneTourId,
        yaw: editedValues.yaw,
        pitch: editedValues.pitch,
        fov: editedValues.fov,
        order: editedValues.order,
        type: editedValues.type,
        name: selectedScene.name,
        priority: selectedScene.priority || 1,
        hotspots: selectedScene.hotspots || [],
        overlays: selectedScene.overlays || []
      };

      const response = await fetch(`${backendUrl}scenes/${selectedScene.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(updateData)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', errorText);
        throw new Error(`Failed to update scene in database: ${response.status}`);
      }

      const apiResponse = await response.json();

      const updatedScene = {
        ...selectedScene,
        ...apiResponse,
        tour_id: sceneTourId,
        yaw: editedValues.yaw,
        pitch: editedValues.pitch,
        fov: editedValues.fov,
        order: editedValues.order,
        type: editedValues.type as 'image' | 'video' | '360'
      };

      // Update local state
      const updatedScenes = scenes?.map(s =>
        s.id === selectedScene.id ? updatedScene : s
      );
      onSceneUpdate?.(updatedScenes);
      setSelectedScene(updatedScene);
    } catch (error) {
      console.error('Failed to update scene:', error);
    }
  };

  const debouncedSave = useCallback(() => {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }
    const timeout = setTimeout(() => {
      saveSceneChanges();
    }, 500);
    setSaveTimeout(timeout);
  }, [saveTimeout, selectedScene, editedValues]);

  const immediateSave = () => {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      setSaveTimeout(null);
    }
    saveSceneChanges();
  };

  return (
    <>
      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          border: 2px solid #ffffff;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        .slider::-moz-range-thumb {
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          border: 2px solid #ffffff;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        .slider::-webkit-slider-track {
          height: 8px;
          background: #e5e7eb;
          border-radius: 4px;
        }
        .slider::-moz-range-track {
          height: 8px;
          background: #e5e7eb;
          border-radius: 4px;
        }
      `}</style>
      <div className="flex h-full">
        <div className="w-1/3 border-r p-4 overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Scenes</h3>
            <button
              className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 cursor-pointer"
              onClick={() => {
                setShowInlineCreation(true);
                setSelectedScene(null);
                setShowUploader(false);
                setTempPreviewUrl(null);
              }}
            >
              Add Scene
            </button>
          </div>

          <div className="space-y-2">
            {scenes?.map((scene) => (
              <div
                key={scene.id}
                className={`p-3 rounded cursor-pointer transition-colors relative group ${selectedScene?.id === scene.id
                  ? 'bg-blue-100 border-blue-500 border'
                  : 'bg-gray-50 hover:bg-gray-100'
                  }`}
              >
                <div onClick={() => handleSceneClick(scene)} className="flex-1">
                  <div className="font-medium text-gray-900">{scene.name}</div>
                  <div className="text-sm text-gray-700">
                    Type: {scene.type} | Order: {scene.order}
                  </div>
                  {scene.src_original_url && (
                    <div className="text-xs text-green-600 mt-1">✓ Has image</div>
                  )}
                </div>
                
                {/* Delete button - show always for selected scene, on hover for others */}
                {(tourOwnership.isOwner || tourOwnership.isSuperadmin) && !tourOwnership.loading && (
                  <button
                    onClick={(e) => openDeleteModal(scene.id, scene.name, e)}
                    className={`absolute top-2 right-2 p-1 rounded bg-red-50 text-red-600 hover:bg-red-100 transition-opacity cursor-pointer ${
                      selectedScene?.id === scene.id 
                        ? 'opacity-100' // Always visible for selected scene
                        : 'opacity-0 group-hover:opacity-100' // Show on hover for non-selected scenes
                    }`}
                    title="Delete scene"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 p-4">
          {showInlineCreation ? (
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-semibold mb-4 text-gray-900">Create New Scene</h3>

                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-900">
                      Scene Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={newSceneName}
                      onChange={(e) => {
                        setNewSceneName(e.target.value);
                        if (error) setError(null); // Clear error when user types
                      }}
                      placeholder="e.g., Living Room, Entrance Hall"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder-gray-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-900">Scene Type</label>
                    <select
                      value={newSceneType}
                      onChange={(e) => setNewSceneType(e.target.value as '360' | 'image' | 'video')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                    >
                      <option value="360">360° Panorama</option>
                      <option value="image">Static Image</option>
                      <option value="video">Video</option>
                    </select>
                  </div>

                  {/* Error Display */}
                  {error && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-red-700 text-sm">{error}</p>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={createNewScene}
                      disabled={!newSceneName.trim() || isCreating}
                      className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2"
                    >
                      {isCreating && (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      )}
                      {isCreating ? 'Creating...' : 'Create Scene & Upload Image'}
                    </button>
                    <button
                      onClick={() => {
                        setShowInlineCreation(false);
                        setNewSceneName('');
                        setNewSceneType('360');
                        setError(null);
                      }}
                      disabled={isCreating}
                      className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>

                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <h4 className="font-medium text-blue-900 mb-2">What happens next?</h4>
                    <ul className="text-sm text-blue-800 space-y-1">
                      <li>• Scene will be created with the name and type you specified</li>
                      <li>• You'll be taken to the image upload interface</li>
                      <li>• Upload your 360° panoramic image</li>
                      <li>• Adjust viewing angles and settings in real-time</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          ) : selectedScene ? (
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-semibold mb-4 text-gray-900">{selectedScene.name}</h3>

                {/* Interactive 360° Preview */}
                {(selectedScene.src_original_url || tempPreviewUrl) && (
                  <div className="mb-6">
                    <label className="block text-sm font-medium mb-2 text-gray-900">
                      360° Interactive Preview
                      {tempPreviewUrl && !selectedScene.src_original_url && (
                        <span className="ml-2 text-xs text-orange-600 font-normal">
                          (Preview - not saved yet)
                        </span>
                      )}
                    </label>
                    <div className="relative h-64 bg-gray-100 rounded-lg overflow-hidden border">
                      <SimplePanoramaPreview
                        imageUrl={selectedScene.src_original_url || tempPreviewUrl!}
                        yaw={editedValues.yaw}
                        pitch={editedValues.pitch}
                        fov={editedValues.fov}
                        onCameraChange={(newYaw, newPitch, newFov) => {
                          setEditedValues(prev => ({
                            ...prev,
                            yaw: newYaw,
                            pitch: newPitch,
                            fov: newFov
                          }));
                          // Only auto-save if the scene is already saved to database
                          if (selectedScene.src_original_url) {
                            debouncedSave();
                          }
                        }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Drag to rotate • Scroll to zoom • Changes are reflected in real-time
                      {tempPreviewUrl && !selectedScene.src_original_url && (
                        <span className="text-orange-600"> • Save image to persist changes</span>
                      )}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-900">Scene Type</label>
                    <select
                      value={editedValues.type}
                      onChange={(e) => {
                        handleTypeChange(e.target.value);
                        immediateSave();
                      }}
                      className="w-full px-3 py-2 border rounded-md text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="360">360° Panorama</option>
                      <option value="image">Static Image</option>
                      <option value="video">Video</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-900">Order</label>
                    <input
                      type="number"
                      value={editedValues.order}
                      onChange={(e) => handleValueChange('order', parseInt(e.target.value) || 1)}
                      onBlur={immediateSave}
                      min="1"
                      className="w-full px-3 py-2 border rounded-md text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="space-y-6 mb-6">
                  <div>
                    <label className="block text-sm font-medium mb-3 text-gray-900">
                      Yaw (Horizontal Rotation): {editedValues.yaw.toFixed(1)}°
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        value={editedValues.yaw}
                        onChange={(e) => {
                          const newValue = parseFloat(e.target.value);
                          handleValueChange('yaw', newValue);
                          debouncedSave(); 
                        }}
                        onMouseUp={immediateSave}
                        onTouchEnd={immediateSave}
                        min="-180"
                        max="180"
                        step="0.1"
                        className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                      />
                      <input
                        type="number"
                        value={editedValues.yaw.toFixed(1)}
                        onChange={(e) => handleValueChange('yaw', parseFloat(e.target.value) || 0)}
                        onBlur={immediateSave}
                        step="0.1"
                        min="-180"
                        max="180"
                        className="w-20 px-2 py-1 border rounded text-sm text-gray-900"
                      />
                      <span className="text-sm text-gray-500">°</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-3 text-gray-900">
                      Pitch (Vertical Rotation): {editedValues.pitch.toFixed(1)}°
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        value={editedValues.pitch}
                        onChange={(e) => {
                          const newValue = parseFloat(e.target.value);
                          handleValueChange('pitch', newValue);
                          debouncedSave(); 
                        }}
                        onMouseUp={immediateSave}
                        onTouchEnd={immediateSave}
                        min="-90"
                        max="90"
                        step="0.1"
                        className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                      />
                      <input
                        type="number"
                        value={editedValues.pitch.toFixed(1)}
                        onChange={(e) => handleValueChange('pitch', parseFloat(e.target.value) || 0)}
                        onBlur={immediateSave}
                        step="0.1"
                        min="-90"
                        max="90"
                        className="w-20 px-2 py-1 border rounded text-sm text-gray-900"
                      />
                      <span className="text-sm text-gray-500">°</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-3 text-gray-900">
                      Field of View (FOV): {editedValues.fov.toFixed(0)}°
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        value={editedValues.fov}
                        onChange={(e) => {
                          const newValue = parseFloat(e.target.value);
                          handleValueChange('fov', newValue);
                          debouncedSave(); // Debounced save during dragging
                        }}
                        onMouseUp={immediateSave}
                        onTouchEnd={immediateSave}
                        min="30"
                        max="120"
                        step="1"
                        className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                      />
                      <input
                        type="number"
                        value={editedValues.fov.toFixed(0)}
                        onChange={(e) => handleValueChange('fov', parseFloat(e.target.value) || 75)}
                        onBlur={immediateSave}
                        step="1"
                        min="30"
                        max="120"
                        className="w-20 px-2 py-1 border rounded text-sm text-gray-900"
                      />
                      <span className="text-sm text-gray-500">°</span>
                    </div>
                  </div>
                </div>

                {!showUploader ? (
                  <div className="space-y-4">
                    {selectedScene.src_original_url ? (
                      <div className="p-4 bg-green-50 rounded">
                        <p className="text-green-700 font-medium">Scene has 360° image</p>
                        <p className="text-sm text-gray-700 mt-1">
                          URL: {selectedScene.src_original_url.substring(0, 50)}...
                        </p>
                        <button
                          onClick={() => {
                            setShowUploader(true);
                            setTempPreviewUrl(null); 
                          }}
                          className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 cursor-pointer"
                        >
                          Replace Image
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setShowUploader(true);
                          setTempPreviewUrl(null);
                        }}
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 cursor-pointer"
                      >
                        Upload Scene Image
                      </button>
                    )}
                  </div>
                ) : (
                  <AdvancedSceneUploader
                    sceneId={selectedScene.id}
                    onPreviewReady={(previewUrl) => {
                      setTempPreviewUrl(previewUrl);
                    }}
                    onComplete={(data) => {
                      // Update scene with the uploaded URLs AND current edited values
                      const updatedScene = {
                        ...selectedScene,
                        src_original_url: data.mainImageUrl,
                        tiles_manifest: data.tilesManifest ? JSON.stringify(data.tilesManifest) : undefined,
                        // Apply any changes made during preview
                        yaw: editedValues.yaw,
                        pitch: editedValues.pitch,
                        fov: editedValues.fov,
                        order: editedValues.order,
                        type: editedValues.type as 'image' | 'video' | '360'
                      };
                      const updatedScenes = scenes?.map(s =>
                        s.id === selectedScene.id ? updatedScene : s
                      );
                      onSceneUpdate?.(updatedScenes);
                      setSelectedScene(updatedScene);
                      setTempPreviewUrl(null); 
                      setShowUploader(false);
                    }}
                    onCancel={() => {
                      setTempPreviewUrl(null); 
                      setShowUploader(false);
                    }}
                  />
                )}

                <div className="mt-6 pt-6 border-t">
                  <h4 className="font-medium mb-2 text-gray-900">Scene Details</h4>
                  <div className="text-sm text-gray-700 space-y-1">
                    <p>Hotspots: {selectedScene.hotspots?.length || 0}</p>
                    <p>Overlays: {selectedScene.overlays?.length || 0}</p>
                    <p>Priority: {selectedScene.priority}</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-md mx-auto">
                {scenes && scenes.length === 0 ? (
                  <div className="space-y-6">
                    {/* Icon */}
                    <div className="mx-auto w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center">
                      <svg className="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    
                    {/* Title and Description */}
                    <div>
                      <h3 className="text-xl font-semibold text-gray-900 mb-2">No Scenes Yet</h3>
                      <p className="text-gray-600 mb-6 leading-relaxed">
                        Start building your virtual tour by creating your first scene. 
                        Upload 360° panoramic images to create immersive experiences for your visitors.
                      </p>
                    </div>

                    {/* Action Button */}
                    <button
                      onClick={() => {
                        setShowInlineCreation(true);
                        setSelectedScene(null);
                        setShowUploader(false);
                        setTempPreviewUrl(null);
                      }}
                      className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors cursor-pointer font-medium shadow-sm mb-8"
                    >
                      Create Your First Scene
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Icon for scene selection */}
                    <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </div>
                    
                    <div className='mb-8'>
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No Scene Selected</h3>
                      <p className="text-gray-600 text-sm leading-relaxed">
                        Select a scene from the left panel to view and edit its details, 
                        adjust viewing angles, or upload new images.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>


      </div>
      
      {/* Delete Modal */}
      <DeleteModal
        open={deleteModal.open}
        isLoading={deleteModal.isLoading}
        title="Delete Scene"
        message={`Are you sure you want to delete "${deleteModal.sceneName}"? This action cannot be undone and will permanently remove the scene and all its associated hotspots and overlays.`}
        onConfirm={confirmDeleteScene}
        onCancel={closeDeleteModal}
      />
    </>
  );
}