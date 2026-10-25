'use client';

import { useEffect, useMemo, useState } from 'react';
import { IntroModelRoom, Scene, Tour } from '@/types/tour';
import { tourService } from '@/services/tourService';
import { storageUploader } from '@/lib/storage-upload';
import { loadGlb, disposeObject3D } from '@/lib/glb-model';
import {
  DOLLHOUSE_DEFAULTS,
  DollhouseProject,
  DollhouseRoom,
  autoPlaceRooms,
  buildDollhouse,
  isPlanOnlyRoom,
  MAX_WALL_HEIGHT,
  parseCubeManifest,
  pointInPolygon,
  readDollhouseProject,
  reanchorRoom,
} from '@/lib/dollhouse';
import { IntroModelViewer, IntroRoomLabel } from '@/components/viewer/IntroModelScreen';
import RoomTracer from './RoomTracer';
import FloorPlanEditor from './FloorPlanEditor';
import FloorPlanImport, { FloorPlanImage } from './FloorPlanImport';

interface DollhouseBuilderProps {
  tour: Tour;
  onClose: () => void;
  /** The new model was uploaded and saved as the tour's intro */
  onSaved: (tour: Tour) => void;
}

type Step = 'plan' | 'trace' | 'arrange' | 'build';

const QUALITY_OPTIONS = [
  { label: 'Standard', pxPerMeter: 150, hint: 'Smaller file, loads fast on phones' },
  { label: 'High', pxPerMeter: 250, hint: 'Sharper floors and walls, bigger file' },
];

const draftKey = (tourId: string) => `dollhouse-draft:${tourId}`;

function readDraft(tourId: string): DollhouseProject | null {
  try {
    const raw = localStorage.getItem(draftKey(tourId));
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed?.version === 1 && Array.isArray(parsed.rooms) ? parsed : null;
  } catch {
    return null;
  }
}

function writeDraft(tourId: string, project: DollhouseProject | null) {
  try {
    if (project) localStorage.setItem(draftKey(tourId), JSON.stringify(project));
    else localStorage.removeItem(draftKey(tourId));
  } catch {
    // Storage unavailable: the draft just isn't kept
  }
}

/** Full-screen tool that builds the tour's 3D intro model from its 360° photos. */
export default function DollhouseBuilder({ tour, onClose, onSaved }: DollhouseBuilderProps) {
  const [scenes, setScenes] = useState<Scene[] | null>(null);
  const [project, setProject] = useState<DollhouseProject | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('trace');
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [pickingCeiling, setPickingCeiling] = useState(false);
  const [ceilingHint, setCeilingHint] = useState<string | null>(null);
  // Shown under the arrange view; only kept for this session
  const [planImage, setPlanImage] = useState<FloorPlanImage | null>(null);

  const [quality, setQuality] = useState(QUALITY_OPTIONS[0].pxPerMeter);
  const [building, setBuilding] = useState<{ done: number; total: number; room: string } | null>(null);
  const [built, setBuilt] = useState<{ url: string; glb: ArrayBuffer; labels: IntroModelRoom[]; projectJson: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);

  // Load every scene (the admin page only has one page of them), then the saved project:
  // an unsaved draft first, else the one stored inside the current dollhouse .glb
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all = (await tourService.getAllScenes(tour.id)).sort((a, b) => a.order - b.order);
        let restored = readDraft(tour.id);
        if (!restored && tour.intro_model_url) {
          try {
            const gltf = await loadGlb(tour.intro_model_url);
            restored = readDollhouseProject(gltf.scene);
            disposeObject3D(gltf.scene);
          } catch {
            // Not loadable or not a dollhouse: start fresh
          }
        }
        if (cancelled) return;
        const usable = all.filter(s => parseCubeManifest(s));
        setScenes(usable);
        setProject(restored || { version: 1, cameraHeight: DOLLHOUSE_DEFAULTS.cameraHeight, rooms: [] });
        setSelectedSceneId(usable[0]?.id || null);
        // A new dollhouse starts at the (optional) floor plan step
        setStep(restored?.rooms.length ? 'trace' : 'plan');
      } catch (err) {
        console.error('[Dollhouse] Failed to load scenes:', err);
        if (!cancelled) setLoadError('Could not load the 360° photos for this tour.');
      }
    })();
    return () => { cancelled = true; };
  }, [tour.id, tour.intro_model_url]);

  useEffect(() => {
    if (project) writeDraft(tour.id, project);
  }, [project, tour.id]);

  useEffect(() => () => { if (built) URL.revokeObjectURL(built.url); }, [built]);
  useEffect(() => () => { if (planImage) URL.revokeObjectURL(planImage.url); }, [planImage]);

  // Escape cancels ceiling picking, then closes
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (pickingCeiling) setPickingCeiling(false);
      else if (!building && !saving) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pickingCeiling, building, saving, onClose]);

  const tracedRooms = useMemo(
    () => (project?.rooms || []).filter(r => r.corners.length >= 3 && (isPlanOnlyRoom(r) || scenes?.some(s => s.id === r.sceneId))),
    [project, scenes]
  );
  const selectedScene = scenes?.find(s => s.id === selectedSceneId) || null;
  const selectedRoom = project?.rooms.find(r => r.sceneId === selectedSceneId) || null;
  // Photo taken outside the traced shape: a building from the street, so walls can be much taller
  const selectedIsExterior = !!selectedRoom && selectedRoom.corners.length >= 3 && !pointInPolygon([0, 0], selectedRoom.corners);
  const projectJson = useMemo(() => JSON.stringify({ ...project, rooms: tracedRooms }), [project, tracedRooms]);
  const builtIsCurrent = !!built && built.projectJson === projectJson;

  const updateRoom = (sceneId: string, changes: Partial<DollhouseRoom>) => {
    setProject(current => {
      if (!current) return current;
      const exists = current.rooms.some(r => r.sceneId === sceneId);
      const rooms = exists
        ? current.rooms.map(r => (r.sceneId === sceneId ? { ...r, ...changes } : r))
        : [...current.rooms, {
          sceneId,
          corners: [],
          ceilingHeight: DOLLHOUSE_DEFAULTS.ceilingHeight,
          offset: [0, 0] as [number, number],
          rotation: 0,
          placed: false,
          ...changes,
        }];
      return { ...current, rooms };
    });
  };

  const goTo = (next: Step) => {
    setPickingCeiling(false);
    if (next !== 'trace' && project) {
      setProject({ ...project, rooms: autoPlaceRooms(project.rooms) });
      if (!tracedRooms.some(r => r.sceneId === selectedSceneId)) setSelectedSceneId(tracedRooms[0]?.sceneId || null);
    }
    setStep(next);
  };

  const runBuild = async () => {
    if (!project || !scenes) return;
    setBuildError(null);
    setBuilding({ done: 0, total: tracedRooms.length, room: '' });
    try {
      const result = await buildDollhouse({ ...project, rooms: tracedRooms }, scenes, {
        pxPerMeter: quality,
        onProgress: (done, total, room) => setBuilding({ done, total, room }),
      });
      const url = URL.createObjectURL(new Blob([result.glb], { type: 'model/gltf-binary' }));
      setBuilt({ url, glb: result.glb, labels: result.labels, projectJson });
    } catch (err) {
      console.error('[Dollhouse] Build failed:', err);
      setBuildError(err instanceof Error ? err.message : 'Building the model failed.');
    } finally {
      setBuilding(null);
    }
  };

  const saveAsIntro = async () => {
    if (!built) return;
    setSaving(true);
    setBuildError(null);
    try {
      const file = new File([built.glb], 'dollhouse.glb', { type: 'model/gltf-binary' });
      const url = await storageUploader.uploadFile(file, `tours/${tour.id}/intro/${Date.now()}_dollhouse.glb`, 'model/gltf-binary');
      const changes: Partial<Tour> = { intro_model_url: url, intro_model_rooms: built.labels };
      const updated = await tourService.updateTour(tour.id, changes);
      writeDraft(tour.id, null);
      onSaved({ ...tour, ...updated, ...changes });
    } catch (err) {
      console.error('[Dollhouse] Save failed:', err);
      setBuildError('Could not upload the model. Please try again.');
      setSaving(false);
    }
  };

  const previewLabels: IntroRoomLabel[] = (built?.labels || []).map(label => ({
    ...label,
    label: scenes?.find(s => s.id === label.sceneId)?.name || 'Room',
  }));

  const steps: { id: Step; label: string; enabled: boolean }[] = [
    { id: 'plan', label: 'Floor plan', enabled: true },
    { id: 'trace', label: '1. Rooms', enabled: true },
    { id: 'arrange', label: '2. Arrange', enabled: tracedRooms.length > 0 },
    { id: 'build', label: '3. Build', enabled: tracedRooms.length > 0 },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-white text-gray-900">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 px-4 py-2">
        <h2 className="text-base font-semibold">Build a 3D dollhouse</h2>
        <nav className="flex gap-1">
          {steps.map(s => (
            <button
              key={s.id}
              type="button"
              disabled={!s.enabled || !!building || saving}
              onClick={() => goTo(s.id)}
              className={`rounded-full px-3 py-1 text-sm font-medium cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${step === s.id ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
            >
              {s.label}
            </button>
          ))}
        </nav>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          disabled={!!building || saving}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 cursor-pointer disabled:opacity-50"
        >
          Close
        </button>
      </div>

      {loadError && <div className="p-6 text-sm text-red-600">{loadError}</div>}
      {!loadError && (!scenes || !project) && <div className="p-6 text-sm text-gray-600">Loading 360° photos…</div>}
      {scenes && project && scenes.length === 0 && (
        <div className="p-6 text-sm text-gray-600">This tour has no processed 360° photos yet. Add photos first.</div>
      )}

      {scenes && project && scenes.length > 0 && (
        // Kept mounted so the uploaded plan and its rooms survive switching steps
        <div className={step === 'plan' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
          <FloorPlanImport
            tourId={tour.id}
            scenes={scenes}
            hasRooms={project.rooms.length > 0}
            buildingScan={tour.building_scan}
            onApply={(rooms, plan) => {
              setProject({ ...project, rooms });
              setPlanImage(plan);
              setSelectedSceneId(rooms.find(r => !isPlanOnlyRoom(r))?.sceneId || rooms[0]?.sceneId || null);
              setPickingCeiling(false);
              setStep('arrange');
            }}
          />
        </div>
      )}

      {scenes && project && scenes.length > 0 && step === 'trace' && (
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {/* Room list */}
          <aside className="max-h-40 overflow-y-auto border-b border-gray-200 md:max-h-none md:w-64 md:border-b-0 md:border-r">
            <ul>
              {scenes.map(scene => {
                const room = project.rooms.find(r => r.sceneId === scene.id);
                const traced = !!room && room.corners.length >= 3;
                return (
                  <li key={scene.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSceneId(scene.id);
                        setPickingCeiling(false);
                      }}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm cursor-pointer ${scene.id === selectedSceneId ? 'bg-blue-50 text-blue-900' : 'hover:bg-gray-50'}`}
                    >
                      <span className={`h-2 w-2 shrink-0 rounded-full ${traced ? 'bg-green-500' : room?.corners.length ? 'bg-amber-400' : 'bg-gray-300'}`} />
                      <span className="flex-1 truncate">{scene.name || 'Untitled'}</span>
                      <span className="text-xs text-gray-500">{room?.fromPlan ? 'From floor plan' : traced ? `${room!.corners.length} corners` : 'Not traced'}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-gray-200 p-3 text-xs text-gray-600">
              <label className="block font-medium text-gray-800" htmlFor="dollhouse-camera-height">Camera height</label>
              <p className="mb-1">How high the camera lens was above the floor. Sets the size of every room.</p>
              <div className="flex items-center gap-1">
                <input
                  id="dollhouse-camera-height"
                  type="number"
                  min={0.3}
                  max={3}
                  step={0.05}
                  value={project.cameraHeight}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    if (value >= 0.3 && value <= 3) setProject({ ...project, cameraHeight: value });
                  }}
                  className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm"
                />
                <span>m</span>
              </div>
            </div>
          </aside>

          {/* Tracer */}
          {selectedScene && (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-3 py-2 text-sm">
                <p className="mr-auto text-gray-700">
                  {pickingCeiling
                    ? 'Click a spot where a wall meets the ceiling.'
                    : selectedRoom?.fromPlan
                      ? 'From the floor plan: turn the photo until the outline sits on the walls. If it is off-centre, move the camera spot in Arrange.'
                      : 'Click each corner where the walls meet the floor, going around the room. Drag a number to move it; click on a line to add a corner in it.'}
                </p>
                {selectedRoom?.fromPlan ? (
                  <>
                    <label htmlFor="dollhouse-turn" className="text-xs text-gray-700">Turn photo</label>
                    <input
                      id="dollhouse-turn"
                      type="range"
                      min={-180}
                      max={180}
                      step={1}
                      value={selectedRoom.rotation}
                      onChange={(e) => {
                        const turned = reanchorRoom(selectedRoom, selectedRoom.offset, Number(e.target.value));
                        updateRoom(selectedScene.id, { rotation: turned.rotation, corners: turned.corners });
                      }}
                      className="w-40"
                    />
                    <span className="w-10 text-right text-xs tabular-nums text-gray-600">{selectedRoom.rotation}°</span>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={!selectedRoom?.corners.length}
                      onClick={() => updateRoom(selectedScene.id, { corners: selectedRoom!.corners.slice(0, -1) })}
                      className="rounded-md border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-100 cursor-pointer disabled:opacity-40"
                    >
                      Undo corner
                    </button>
                    <button
                      type="button"
                      disabled={!selectedRoom?.corners.length}
                      onClick={() => updateRoom(selectedScene.id, { corners: [] })}
                      className="rounded-md px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 cursor-pointer disabled:opacity-40"
                    >
                      Clear
                    </button>
                  </>
                )}
              </div>
              <div className="relative min-h-0 flex-1">
                <RoomTracer
                  scene={selectedScene}
                  corners={selectedRoom?.corners || []}
                  ceilingHeight={selectedRoom?.ceilingHeight || DOLLHOUSE_DEFAULTS.ceilingHeight}
                  cameraHeight={project.cameraHeight}
                  pickingCeiling={pickingCeiling}
                  allowAddCorners={!selectedRoom?.fromPlan}
                  onCornersChange={(corners) => updateRoom(selectedScene.id, { corners })}
                  onCeilingPicked={(height) => {
                    setPickingCeiling(false);
                    if (height) {
                      updateRoom(selectedScene.id, { ceilingHeight: height });
                      setCeilingHint(null);
                    } else {
                      setCeilingHint('That click didn’t land on a traced wall above eye level. Click straight above one of the traced walls, where it meets the ceiling or roof line.');
                    }
                  }}
                />
              </div>
              <div className="flex flex-wrap items-center gap-3 border-t border-gray-200 px-3 py-2 text-sm">
                <label htmlFor="dollhouse-ceiling" className="text-gray-700">{selectedIsExterior ? 'Building height' : 'Ceiling height'}</label>
                <input
                  id="dollhouse-ceiling"
                  type="range"
                  min={1.8}
                  max={selectedIsExterior ? MAX_WALL_HEIGHT : 6}
                  step={0.05}
                  value={selectedRoom?.ceilingHeight || DOLLHOUSE_DEFAULTS.ceilingHeight}
                  onChange={(e) => updateRoom(selectedScene.id, { ceilingHeight: Number(e.target.value) })}
                  className="w-40"
                />
                <span className="w-14 tabular-nums text-gray-700">{(selectedRoom?.ceilingHeight || DOLLHOUSE_DEFAULTS.ceilingHeight).toFixed(2)} m</span>
                <button
                  type="button"
                  disabled={(selectedRoom?.corners.length || 0) < 3}
                  onClick={() => {
                    setPickingCeiling(v => !v);
                    setCeilingHint(null);
                  }}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer disabled:opacity-40 ${pickingCeiling ? 'bg-amber-500 text-white' : 'border border-gray-300 text-gray-700 hover:bg-gray-100'}`}
                >
                  {pickingCeiling ? 'Cancel' : 'Click the ceiling'}
                </button>
                <span className="text-xs text-gray-500">The yellow line should sit on the ceiling edge.</span>
                {ceilingHint && <span className="text-xs text-amber-700">{ceilingHint}</span>}
                <div className="flex-1" />
                <button
                  type="button"
                  disabled={!tracedRooms.length}
                  onClick={() => goTo('arrange')}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 cursor-pointer disabled:opacity-50"
                >
                  Next: arrange rooms
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {scenes && project && step === 'arrange' && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            <FloorPlanEditor
              rooms={tracedRooms}
              scenes={scenes}
              planImage={planImage}
              selectedSceneId={selectedSceneId}
              onSelect={setSelectedSceneId}
              onRoomChange={updateRoom}
            />
          </div>
          <div className="flex justify-end border-t border-gray-200 px-3 py-2">
            <button
              type="button"
              onClick={() => goTo('build')}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 cursor-pointer"
            >
              Next: build
            </button>
          </div>
        </div>
      )}

      {scenes && project && step === 'build' && (
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <aside className="space-y-4 border-b border-gray-200 p-4 text-sm md:w-80 md:border-b-0 md:border-r">
            <p className="text-gray-700">
              {tracedRooms.length} room{tracedRooms.length === 1 ? '' : 's'} will be built. Each photo is projected onto its room’s floor and walls.
            </p>
            <fieldset className="space-y-2">
              <legend className="mb-1 font-medium text-gray-900">Texture quality</legend>
              {QUALITY_OPTIONS.map(option => (
                <label key={option.pxPerMeter} className="flex cursor-pointer items-start gap-2">
                  <input
                    type="radio"
                    name="dollhouse-quality"
                    checked={quality === option.pxPerMeter}
                    onChange={() => setQuality(option.pxPerMeter)}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium">{option.label}</span>
                    <span className="block text-xs text-gray-500">{option.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <button
              type="button"
              onClick={runBuild}
              disabled={!!building || saving}
              className="w-full rounded-lg bg-blue-600 px-3 py-2 font-medium text-white hover:bg-blue-700 cursor-pointer disabled:opacity-50"
            >
              {building
                ? `Building ${Math.min(building.done + 1, building.total)} of ${building.total}${building.room ? `: ${building.room}` : ''}…`
                : built ? 'Rebuild' : 'Build model'}
            </button>
            {built && (
              <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-gray-700">
                  Model ready: {(built.glb.byteLength / 1024 / 1024).toFixed(1)} MB
                  {!builtIsCurrent && <span className="block text-xs text-amber-700">You changed rooms since this build. Rebuild to include the changes.</span>}
                </p>
                <button
                  type="button"
                  onClick={saveAsIntro}
                  disabled={saving || !!building}
                  className="w-full rounded-lg bg-green-600 px-3 py-2 font-medium text-white hover:bg-green-700 cursor-pointer disabled:opacity-50"
                >
                  {saving ? 'Uploading…' : 'Use as 3D intro'}
                </button>
                <p className="text-xs text-gray-500">
                  {tour.intro_model_url ? 'Replaces the current 3D intro and its room labels. ' : ''}
                  Each room gets a clickable label; you can move them afterwards.
                </p>
              </div>
            )}
            {buildError && <p className="text-xs text-red-600">{buildError}</p>}
          </aside>
          <div className="relative min-h-[320px] flex-1 bg-[radial-gradient(ellipse_at_center,_#334155_0%,_#0f172a_75%)]">
            {built ? (
              <IntroModelViewer key={built.url} modelUrl={built.url} rooms={previewLabels} />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white/70">
                {building ? 'Projecting photos onto the rooms…' : 'Build the model to preview it here.'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
