'use client';

import { useEffect, useRef, useState } from 'react';
import { Layers, EyeOff } from 'lucide-react';
import { IntroModelRoom, Scene, Tour } from '@/types/tour';
import { tourService } from '@/services/tourService';
import { storageUploader } from '@/lib/storage-upload';
import { isGlbFile, glbContentType, MAX_MODEL_FILE_SIZE } from '@/lib/glb-model';
import { IntroModelViewer, IntroRoomLabel } from '@/components/viewer/IntroModelScreen';
import DollhouseBuilder from '@/components/tours/dollhouse/DollhouseBuilder';

interface IntroModelSettingsProps {
  tour: Tour;
  /** The tour's scenes, which room labels link to */
  scenes: Scene[];
  onTourUpdate: (tour: Tour) => void;
}

/** Tour setting: a 3D model (.glb) shown as an intro before the 360° tour starts. */
export default function IntroModelSettings({ tour, scenes, onTourUpdate }: IntroModelSettingsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'upload' | 'save' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlDraft, setUrlDraft] = useState('');
  const [showBuilder, setShowBuilder] = useState(false);
  const modelUrl = tour.intro_model_url || null;

  // Room labels are edited locally, then saved together
  const savedRooms = tour.intro_model_rooms || [];
  const [rooms, setRooms] = useState<IntroModelRoom[]>(savedRooms);
  const [placingSceneId, setPlacingSceneId] = useState<string | null>(null);
  const [highlightedSceneId, setHighlightedSceneId] = useState<string | null>(null);
  const [savingRooms, setSavingRooms] = useState(false);
  const [hideOuterLayer, setHideOuterLayer] = useState(false);
  const roomsDirty = JSON.stringify(rooms) !== JSON.stringify(savedRooms);

  useEffect(() => {
    setRooms(tour.intro_model_rooms || []);
    setPlacingSceneId(null);
    // Only reset the draft when switching tours
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour.id]);

  // Escape cancels placing a label
  useEffect(() => {
    if (!placingSceneId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPlacingSceneId(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [placingSceneId]);

  const updateRoom = (sceneId: string, changes: Partial<IntroModelRoom>) => {
    setRooms(current => {
      const existing = current.find(r => r.sceneId === sceneId);
      if (existing) return current.map(r => (r.sceneId === sceneId ? { ...r, ...changes } : r));
      if (!changes.position) return current;
      return [...current, { sceneId, position: changes.position, ...changes }];
    });
  };

  const removeRoom = (sceneId: string) => {
    setRooms(current => current.filter(r => r.sceneId !== sceneId));
    if (placingSceneId === sceneId) setPlacingSceneId(null);
  };

  const saveRooms = async () => {
    setSavingRooms(true);
    setError(null);
    try {
      // Keep labels, descriptions, and numbers for scenes not loaded here (scenes are paginated)
      const cleaned = rooms.map(({ sceneId, label, description, number, position }) => {
        const item: IntroModelRoom = { sceneId, position };
        if (label?.trim()) item.label = label.trim();
        if (description?.trim()) item.description = description.trim();
        if (typeof number === 'number' && !isNaN(number)) item.number = number;
        return item;
      });
      const payload = cleaned.length ? cleaned : null;
      const updated = await tourService.updateTour(tour.id, { intro_model_rooms: payload });
      onTourUpdate({ ...tour, ...updated, intro_model_rooms: payload });
      setRooms(cleaned);
      setPlacingSceneId(null);
    } catch (err) {
      console.error('Failed to save room labels:', err);
      setError('Could not save the room labels. Please try again.');
    } finally {
      setSavingRooms(false);
    }
  };

  const viewerRooms: IntroRoomLabel[] = rooms.flatMap((room, idx) => {
    const scene = scenes.find(s => s.id === room.sceneId);
    return scene
      ? [
          {
            ...room,
            number: room.number ?? (idx + 1),
            label: room.label?.trim() || scene.name || 'Room',
            description: room.description?.trim(),
          },
        ]
      : [];
  });
  const placingScene = scenes.find(s => s.id === placingSceneId);

  const saveModelUrl = async (url: string | null, action: 'save' | 'remove') => {
    setBusy(action);
    setError(null);
    try {
      // Removing the model also removes its room labels
      const changes: Partial<Tour> = url ? { intro_model_url: url } : { intro_model_url: null, intro_model_rooms: null };
      const updated = await tourService.updateTour(tour.id, changes);
      onTourUpdate({ ...tour, ...updated, ...changes });
      if (!url) {
        setRooms([]);
        setPlacingSceneId(null);
      }
      setShowUrlInput(false);
      setUrlDraft('');
    } catch (err) {
      console.error('Failed to save intro model:', err);
      setError('Could not save the 3D intro. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const handleFile = async (file: File) => {
    if (!isGlbFile(file)) {
      setError('Please choose a .glb file.');
      return;
    }
    if (file.size > MAX_MODEL_FILE_SIZE) {
      setError(`The file is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is ${MAX_MODEL_FILE_SIZE / 1024 / 1024} MB.`);
      return;
    }
    setBusy('upload');
    setError(null);
    try {
      const cleanFileName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
      const key = `tours/${tour.id}/intro/${Date.now()}_${cleanFileName}`;
      const url = await storageUploader.uploadFile(file, key, glbContentType(file));
      await saveModelUrl(url, 'save');
    } catch (err) {
      console.error('Failed to upload intro model:', err);
      setError('Upload failed. Please try again.');
      setBusy(null);
    }
  };

  return (
    <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <h3 className="text-sm font-semibold text-gray-900">3D intro model</h3>
          <p className="text-xs text-gray-600">
            {modelUrl
              ? 'Visitors see this 3D model first, then click “Enter tour” to start the 360° tour.'
              : 'Optional: show a 3D model (.glb) of the property before the 360° tour, like a dollhouse view.'}
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".glb,.gltf,model/gltf-binary"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = '';
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={!!busy}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 cursor-pointer disabled:opacity-50"
        >
          {busy === 'upload' ? 'Uploading…' : modelUrl ? 'Replace .glb' : 'Upload .glb'}
        </button>
        <button
          onClick={() => setShowBuilder(true)}
          disabled={!!busy || scenes.length === 0}
          title={scenes.length === 0 ? 'Add a 360° photo first' : 'Make a 3D model from this tour’s 360° photos'}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-blue-300 text-blue-700 hover:bg-blue-50 cursor-pointer disabled:opacity-50"
        >
          Build from 360° photos
        </button>
        <button
          onClick={() => setShowUrlInput(v => !v)}
          disabled={!!busy}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 cursor-pointer disabled:opacity-50"
        >
          Use a link
        </button>
        {modelUrl && (
          <button
            onClick={() => saveModelUrl(null, 'remove')}
            disabled={!!busy}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 cursor-pointer disabled:opacity-50"
          >
            {busy === 'remove' ? 'Removing…' : 'Remove'}
          </button>
        )}
      </div>

      {showUrlInput && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (urlDraft.trim()) saveModelUrl(urlDraft.trim(), 'save');
          }}
        >
          <input
            type="url"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            placeholder="https://…/model.glb"
            className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white text-gray-900"
          />
          <button
            type="submit"
            disabled={!urlDraft.trim() || !!busy}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 cursor-pointer disabled:opacity-50"
          >
            {busy === 'save' ? 'Saving…' : 'Save'}
          </button>
        </form>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {showBuilder && (
        <DollhouseBuilder
          tour={tour}
          onClose={() => setShowBuilder(false)}
          onSaved={(updated) => {
            onTourUpdate(updated);
            setRooms(updated.intro_model_rooms || []);
            setPlacingSceneId(null);
            setShowBuilder(false);
          }}
        />
      )}

      {modelUrl && (
        <div className="relative mt-3 h-80 rounded-lg overflow-hidden bg-[radial-gradient(ellipse_at_center,_#334155_0%,_#0f172a_75%)]">
          <IntroModelViewer
            modelUrl={modelUrl}
            autoRotate={false}
            rooms={viewerRooms}
            activeSceneId={placingSceneId}
            hideOuterLayer={hideOuterLayer}
            onModelClick={placingSceneId ? (position) => {
              updateRoom(placingSceneId, { position });
              setPlacingSceneId(null);
            } : undefined}
          />
          {/* Outer Layer / Cutaway toggle */}
          <div className="absolute top-2 right-2 flex items-center gap-1.5 z-10">
            <button
              type="button"
              onClick={() => setHideOuterLayer(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold shadow-lg backdrop-blur transition-all cursor-pointer ${
                hideOuterLayer
                  ? 'bg-blue-600 text-white ring-2 ring-blue-400/50'
                  : 'bg-black/60 text-white/90 hover:bg-black/80 border border-white/10'
              }`}
              title="Toggle outer walls & roof to display the inner layer"
            >
              {hideOuterLayer ? <EyeOff className="w-3.5 h-3.5 text-blue-200" /> : <Layers className="w-3.5 h-3.5 text-blue-400" />}
              <span>{hideOuterLayer ? 'Inner Layer (Cutaway)' : 'Remove Outer Layer'}</span>
            </button>
          </div>
          {placingScene && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full bg-blue-600 px-3 py-1 text-xs font-medium text-white shadow-lg">
              Click the model where “{placingScene.name || 'this room'}” is
              <button
                type="button"
                onClick={() => setPlacingSceneId(null)}
                className="rounded-full bg-white/20 px-2 hover:bg-white/30 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {modelUrl && (
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex-1 min-w-[200px]">
              <h4 className="text-sm font-semibold text-gray-900">Room labels</h4>
              <p className="text-xs text-gray-600">
                Pin a 360° photo to a spot on the model. Visitors can click the label to go straight to that room.
              </p>
            </div>
            {roomsDirty && (
              <button
                type="button"
                onClick={() => {
                  setRooms(savedRooms);
                  setPlacingSceneId(null);
                }}
                disabled={savingRooms}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 cursor-pointer disabled:opacity-50"
              >
                Discard
              </button>
            )}
            <button
              type="button"
              onClick={saveRooms}
              disabled={!roomsDirty || savingRooms}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 cursor-pointer disabled:opacity-50"
            >
              {savingRooms ? 'Saving…' : roomsDirty ? 'Save labels' : 'Saved'}
            </button>
          </div>

          {scenes.length === 0 ? (
            <p className="mt-2 text-xs text-gray-500">Add 360° photos first, then pin them to the model here.</p>
          ) : (
            <ul className="mt-2 divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
              {scenes.map((scene, sceneIdx) => {
                const room = rooms.find(r => r.sceneId === scene.id);
                const placing = placingSceneId === scene.id;
                const roomNum = room?.number ?? (sceneIdx + 1);
                return (
                  <li key={scene.id} className={`flex flex-col gap-2 p-3 ${placing ? 'bg-blue-50/70' : ''}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`w-2.5 h-2.5 rounded-full shrink-0 ${room ? 'bg-green-500' : 'bg-gray-300'}`}
                        title={room ? 'Pinned on the model' : 'Not pinned'}
                      />
                      {room && (
                        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold shrink-0">
                          {roomNum}
                        </span>
                      )}
                      <span className="flex-1 min-w-[120px] truncate text-sm font-medium text-gray-900">{scene.name || 'Untitled'}</span>
                      {room && (
                        <input
                          type="text"
                          value={room.label || ''}
                          onChange={(e) => updateRoom(scene.id, { label: e.target.value })}
                          placeholder={scene.name || 'Room Label'}
                          maxLength={40}
                          aria-label={`Label for ${scene.name || 'room'}`}
                          className="w-36 px-2.5 py-1 text-xs border border-gray-300 rounded-md bg-white text-gray-900"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => setPlacingSceneId(placing ? null : scene.id)}
                        disabled={savingRooms}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer disabled:opacity-50 ${placing
                          ? 'bg-blue-600 text-white'
                          : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
                          }`}
                      >
                        {placing ? 'Click the model…' : room ? 'Move Pin' : 'Place Pin'}
                      </button>
                      {room && (
                        <button
                          type="button"
                          onClick={() => removeRoom(scene.id)}
                          disabled={savingRooms}
                          className="px-2 py-1 rounded-md text-xs font-medium text-red-600 hover:bg-red-50 cursor-pointer disabled:opacity-50"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    {/* Room Description & Number mapping inputs */}
                    {room && (
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 pl-5 pt-1.5 border-t border-gray-100">
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[11px] font-medium text-gray-500">No:</span>
                          <input
                            type="number"
                            min={1}
                            max={99}
                            value={room.number ?? (rooms.indexOf(room) + 1)}
                            onChange={(e) => updateRoom(scene.id, { number: parseInt(e.target.value) || 1 })}
                            className="w-14 px-2 py-1 text-xs border border-gray-300 rounded-md bg-white text-gray-900 font-bold"
                            title="Number mapping for this room"
                          />
                        </div>
                        <div className="flex-1 w-full">
                          <input
                            type="text"
                            value={room.description || ''}
                            onChange={(e) => updateRoom(scene.id, { description: e.target.value })}
                            placeholder="Add room description (e.g. Dimensions, king bed, sea view)"
                            maxLength={200}
                            className="w-full px-2.5 py-1 text-xs border border-gray-300 rounded-md bg-white text-gray-900 placeholder:text-gray-400"
                          />
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
