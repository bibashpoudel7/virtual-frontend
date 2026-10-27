'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import Toast, { ToastType } from '../ui/Toast';
import { Tour, Scene, PlayTour, PlayTourScene } from '@/types/tour';
import PlayTourOverlay from '../tours/PlayTourOverlay';
import { tourService } from '@/services/tourService';
import { getSceneThumbnail } from '@/lib/scene-thumbnail';
import { buildCameraPath, parseWaypoints, CameraPoint, createCameraPathPlayer, hasPointTiming, DEFAULT_POINT_MOVE_MS } from '@/lib/camera-path';

const R2_PUBLIC_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || 'https://test.thenimto.com';

// Seconds field you can clear and retype freely: shows your typing as-is, saves each valid
// value (in ms) as you type, and snaps back to the saved value when you leave the field
function SecondsInput({ valueMs, onCommit, min = 0, allowEmpty = false, placeholder, className, title }: {
    valueMs: number | undefined;
    onCommit: (ms: number | undefined) => void;
    min?: number;
    allowEmpty?: boolean;
    placeholder?: string;
    className?: string;
    title?: string;
}) {
    const [draft, setDraft] = useState<string | null>(null);
    return (
        <input
            type="number"
            step={0.5}
            min={min}
            value={draft ?? (valueMs === undefined ? '' : String(valueMs / 1000))}
            placeholder={placeholder}
            title={title}
            className={className}
            onChange={(e) => {
                const text = e.target.value;
                setDraft(text);
                if (text.trim() === '') {
                    if (allowEmpty) onCommit(undefined);
                    return;
                }
                const seconds = parseFloat(text);
                if (Number.isFinite(seconds) && seconds >= min) onCommit(Math.round(seconds * 1000));
            }}
            onBlur={() => setDraft(null)}
        />
    );
}

interface PlayTourEditorProps {
    tourId: string;
    scenes: Scene[];
    currentYaw?: number;
    currentPitch?: number;
    currentFov?: number;
    onPreviewScene?: (sceneId: string, yaw: number, pitch: number, fov: number) => void;
    onPlaySceneAnimation?: (sceneId: string, startYaw: number, startPitch: number, startFov: number, endYaw: number, endPitch: number, endFov: number, duration: number, transitionDirection?: string, waypoints?: PlayTourScene['waypoints'], startHold?: number) => void;
    // The path to draw in the viewer (start → points → end) for the step being worked on
    onPathPreview?: (preview: { sceneId: string; points: CameraPoint[]; onPointMove: (index: number, yaw: number, pitch: number) => void } | null) => void;
    // While drawing, the viewer hands clicks on the photo to this handler
    onPathDrawingChange?: (handler: ((yaw: number, pitch: number) => void) | null) => void;
}

export default function PlayTourEditor({
    tourId,
    scenes,
    currentYaw = 0,
    currentPitch = 0,
    currentFov = 75,
    onPreviewScene,
    onPlaySceneAnimation,
    onPathPreview,
    onPathDrawingChange,
    onClose
}: PlayTourEditorProps & { onClose?: () => void }) {
    const [playTours, setPlayTours] = useState<PlayTour[]>([]);
    const [selectedPlayTour, setSelectedPlayTour] = useState<PlayTour | null>(null);
    // const [isCreating, setIsCreating] = useState(false);
    // const [newTourName, setNewTourName] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
    const [draggedSceneIndex, setDraggedSceneIndex] = useState<number | null>(null);
    const [collapsedScenes, setCollapsedScenes] = useState<Set<string>>(new Set());

    // Toast state
    const [toastVisible, setToastVisible] = useState(false);
    const [toastMessage, setToastMessage] = useState('');
    const [toastType, setToastType] = useState<ToastType>('success');

    // Live preview: replay the camera move in the viewer whenever a step's settings change
    const [livePreview, setLivePreview] = useState(true);
    const previewTimerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => () => {
        if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    }, []);

    const fmt = (value: number, digits = 1) => (Number.isFinite(value) ? value.toFixed(digits) : '–');

    const isSamePosition = (ps: PlayTourScene) =>
        Math.abs(ps.start_yaw - ps.end_yaw) < 0.5 &&
        Math.abs(ps.start_pitch - ps.end_pitch) < 0.5 &&
        Math.abs(ps.start_fov - ps.end_fov) < 0.5;

    const playStep = (ps: PlayTourScene) => {
        onPlaySceneAnimation?.(
            ps.scene_id,
            ps.start_yaw, ps.start_pitch, ps.start_fov,
            ps.end_yaw, ps.end_pitch, ps.end_fov,
            ps.move_duration,
            ps.transition_direction,
            ps.waypoints,
            ps.start_hold
        );
        setFocusedPathId(ps.id);
    };

    // Debounced so typing a duration doesn't restart the animation on every keystroke
    const previewStep = (ps: PlayTourScene, delayMs = 0) => {
        if (!livePreview) return;
        if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
        previewTimerRef.current = setTimeout(() => playStep(ps), delayMs);
    };

    const toggleSceneCollapse = (sceneId: string) => {
        setCollapsedScenes(prev => {
            const newSet = new Set(prev);
            if (newSet.has(sceneId)) {
                newSet.delete(sceneId);
            } else {
                newSet.add(sceneId);
            }
            return newSet;
        });
    };

    useEffect(() => {
        loadPlayTours();
    }, [tourId]);

    const loadPlayTours = async () => {
        try {
            setLoading(true);
            const tours = await tourService.listPlayTours(tourId);
            setPlayTours(tours);
            // Auto-select first tour if exists
            if (tours.length > 0) {
                setSelectedPlayTour(tours[0]);
            }
        } catch (err) {
            setError('Failed to load play tours');
        } finally {
            setLoading(false);
        }
    };

    const handleCreatePlayTour = async () => {
        try {
            setSaving(true);
            const newTour = await tourService.createPlayTour(tourId, {
                // name: newTourName,
                name: "Main Tour",
                tour_id: tourId,
                play_tour_scenes: []
            });
            setPlayTours([...playTours, newTour]);
            // setNewTourName('');
            // setIsCreating(false);
            setSelectedPlayTour(newTour);
        } catch (err) {
            setError('Failed to create play tour');
        } finally {
            setSaving(false);
        }
    };

    const handleAddSceneToPlayTour = (sceneId: string) => {
        if (!selectedPlayTour) return;

        const newScene: PlayTourScene = {
            id: `temp-${Date.now()}`,
            play_tour_id: selectedPlayTour.id,
            scene_id: sceneId,
            sequence_order: selectedPlayTour.play_tour_scenes.length + 1,
            start_yaw: currentYaw,
            start_pitch: currentPitch,
            start_fov: currentFov,
            end_yaw: currentYaw,
            end_pitch: currentPitch,
            end_fov: currentFov,
            move_duration: 5000,
            wait_duration: 1000,
            transition_direction: 'forward',
        } as any;

        setSelectedPlayTour({
            ...selectedPlayTour,
            play_tour_scenes: [...selectedPlayTour.play_tour_scenes, newScene]
        });

        if (livePreview) {
            onPreviewScene?.(sceneId, newScene.start_yaw, newScene.start_pitch, newScene.start_fov);
        }
    };

    const handleRemoveSceneFromPlayTour = (index: number) => {
        if (!selectedPlayTour) return;
        const updatedScenes = [...selectedPlayTour.play_tour_scenes];
        updatedScenes.splice(index, 1);
        // Reorder
        updatedScenes.forEach((s, i) => { s.sequence_order = i + 1; });

        setSelectedPlayTour({
            ...selectedPlayTour,
            play_tour_scenes: updatedScenes
        });
    };

    const handleUpdateSceneOrder = (index: number, direction: 'up' | 'down') => {
        if (!selectedPlayTour) return;
        const updatedScenes = [...selectedPlayTour.play_tour_scenes];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;

        if (targetIndex < 0 || targetIndex >= updatedScenes.length) return;

        const [movedScene] = updatedScenes.splice(index, 1);
        updatedScenes.splice(targetIndex, 0, movedScene);

        // Update sequence orders
        updatedScenes.forEach((s, i) => { s.sequence_order = i + 1; });

        setSelectedPlayTour({
            ...selectedPlayTour,
            play_tour_scenes: updatedScenes
        });
    };

    const handleUpdateSceneParams = (index: number, params: Partial<PlayTourScene>) => {
        if (!selectedPlayTour) return;
        const updatedScenes = [...selectedPlayTour.play_tour_scenes];
        updatedScenes[index] = { ...updatedScenes[index], ...params };

        setSelectedPlayTour({
            ...selectedPlayTour,
            play_tour_scenes: updatedScenes
        });

        return updatedScenes[index];
    };

    const handleCapturePosition = (index: number, type: 'start' | 'end') => {
        const capturedId = selectedPlayTour?.play_tour_scenes[index]?.id;
        if (capturedId) setFocusedPathId(capturedId);
        if (type === 'start') {
            const updated = handleUpdateSceneParams(index, {
                start_yaw: currentYaw,
                start_pitch: currentPitch,
                start_fov: currentFov
            });
            if (updated && livePreview) onPreviewScene?.(updated.scene_id, updated.start_yaw, updated.start_pitch, updated.start_fov);
        } else {
            const updated = handleUpdateSceneParams(index, {
                end_yaw: currentYaw,
                end_pitch: currentPitch,
                end_fov: currentFov
            });
            // Show the full move from start to the new end position
            if (updated) previewStep(updated);
        }
    };

    // Curved path: extra points the camera passes through between start and end
    const [drawingPathFor, setDrawingPathFor] = useState<string | null>(null);
    const dragPressTargetRef = useRef<HTMLElement | null>(null);
    const [focusedPathId, setFocusedPathId] = useState<string | null>(null);
    const currentFovRef = useRef(currentFov);
    currentFovRef.current = currentFov;

    const updateWaypoints = useCallback((playSceneId: string, update: (points: CameraPoint[]) => CameraPoint[]) => {
        setSelectedPlayTour(prev => prev && {
            ...prev,
            play_tour_scenes: prev.play_tour_scenes.map(s =>
                s.id === playSceneId ? { ...s, waypoints: update(parseWaypoints(s.waypoints)) } : s
            ),
        });
        setFocusedPathId(playSceneId);
    }, []);

    // Dragging a marker on the photo: index 0 is S (start view), the last is E (end view)
    const movePathPoint = useCallback((playSceneId: string, index: number, yaw: number, pitch: number) => {
        setSelectedPlayTour(prev => prev && {
            ...prev,
            play_tour_scenes: prev.play_tour_scenes.map(s => {
                if (s.id !== playSceneId) return s;
                const points = parseWaypoints(s.waypoints);
                if (index === 0) return { ...s, start_yaw: yaw, start_pitch: pitch };
                if (index === points.length + 1) return { ...s, end_yaw: yaw, end_pitch: pitch };
                return { ...s, waypoints: points.map((p, i) => (i === index - 1 ? { ...p, yaw, pitch } : p)) };
            }),
        });
    }, []);

    const startDrawingPath = (ps: PlayTourScene) => {
        setDrawingPathFor(ps.id);
        setFocusedPathId(ps.id);
        // Drawing happens on this step's photo, starting from its start view
        onPreviewScene?.(ps.scene_id, ps.start_yaw, ps.start_pitch, ps.start_fov);
    };

    // Route clicks on the photo to the step being drawn
    useEffect(() => {
        if (!drawingPathFor) return;
        onPathDrawingChange?.((yaw, pitch) => {
            updateWaypoints(drawingPathFor, points => [...points, { yaw, pitch, fov: currentFovRef.current }]);
        });
        return () => onPathDrawingChange?.(null);
    }, [drawingPathFor, onPathDrawingChange, updateWaypoints]);

    // Show the focused step's path in the viewer
    const pathPreviewScene = selectedPlayTour?.play_tour_scenes.find(s => s.id === (drawingPathFor || focusedPathId));
    const pathPreviewKey = pathPreviewScene ? JSON.stringify([
        pathPreviewScene.scene_id, pathPreviewScene.start_yaw, pathPreviewScene.start_pitch, pathPreviewScene.start_fov,
        pathPreviewScene.end_yaw, pathPreviewScene.end_pitch, pathPreviewScene.end_fov,
        pathPreviewScene.waypoints, pathPreviewScene.transition_direction,
    ]) : '';
    useEffect(() => {
        if (!pathPreviewScene) {
            onPathPreview?.(null);
            return;
        }
        const playSceneId = pathPreviewScene.id;
        onPathPreview?.({
            sceneId: pathPreviewScene.scene_id,
            points: buildCameraPath(pathPreviewScene, pathPreviewScene.transition_direction),
            onPointMove: (index, yaw, pitch) => movePathPoint(playSceneId, index, yaw, pitch),
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pathPreviewKey, onPathPreview]);
    useEffect(() => () => onPathPreview?.(null), [onPathPreview]);

    // Edits stay local until "Save Changes": compare against what was last loaded or saved
    const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
    const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
    useEffect(() => {
        setSavedSnapshot(selectedPlayTour ? JSON.stringify(selectedPlayTour) : null);
        // Only when a different play tour is opened, not on every edit
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedPlayTour?.id]);
    const hasUnsavedChanges = !!selectedPlayTour && savedSnapshot !== null && JSON.stringify(selectedPlayTour) !== savedSnapshot;

    // Warn before leaving the page with unsaved edits
    useEffect(() => {
        if (!hasUnsavedChanges) return;
        const onBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [hasUnsavedChanges]);

    // silent: auto-save (no toast); errors are always shown
    const handleSavePlayTour = async (silent = false) => {
        if (!selectedPlayTour) return;
        try {
            setSaving(true);
            const savedJson = JSON.stringify(selectedPlayTour);
            const updated = await tourService.updatePlayTour(selectedPlayTour.id, selectedPlayTour);
            setPlayTours(prev => prev.map(t => t.id === updated.id ? updated : t));
            setSavedSnapshot(savedJson);
            setLastSavedAt(Date.now());

            if (!silent) {
                setToastMessage('Play Tour saved successfully');
                setToastType('success');
                setToastVisible(true);
            }
        } catch (err) {
            setError('Failed to save play tour');
            setToastMessage('Auto-save failed. Check your connection and click Save.');
            setToastType('error');
            setToastVisible(true);
        } finally {
            setSaving(false);
        }
    };

    // Auto-save: 1.5 s after the last edit (one save at a time; edits made during a save re-arm it)
    const selectedPlayTourJson = selectedPlayTour ? JSON.stringify(selectedPlayTour) : '';
    useEffect(() => {
        if (!hasUnsavedChanges || saving) return;
        const timer = setTimeout(() => handleSavePlayTour(true), 1500);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedPlayTourJson, hasUnsavedChanges, saving]);

    const handleDeletePlayTour = async (id: string) => {
        if (!confirm('Are you sure you want to delete this play tour?')) return;
        try {
            setSaving(true);
            await tourService.deletePlayTour(id);
            setPlayTours(playTours.filter(t => t.id !== id));
            if (selectedPlayTour?.id === id) setSelectedPlayTour(null);
        } catch (err) {
            setError('Failed to delete play tour');
        } finally {
            setSaving(false);
        }
    };
    // Drag and Drop Reordering Logic
    const handleDragStart = (e: React.DragEvent, index: number) => {
        setDraggedSceneIndex(index);
        e.dataTransfer.effectAllowed = 'move';
        // Optional: Custom drag image if needed
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault(); // Allow dropping
        if (draggedSceneIndex === null || draggedSceneIndex === index) return;
        if (!selectedPlayTour) return;

        const updatedScenes = [...selectedPlayTour.play_tour_scenes];
        const draggedItem = updatedScenes[draggedSceneIndex];

        // Remove from old index
        updatedScenes.splice(draggedSceneIndex, 1);
        // Insert at new index
        updatedScenes.splice(index, 0, draggedItem);

        // Update sequence order
        updatedScenes.forEach((s, i) => { s.sequence_order = i + 1; });

        setSelectedPlayTour({
            ...selectedPlayTour,
            play_tour_scenes: updatedScenes
        });
        setDraggedSceneIndex(index);
    };

    const handleDragEnd = () => {
        setDraggedSceneIndex(null);
    };

    return (
        <div className="flex flex-col h-full bg-white text-gray-900 w-full">
            <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center sticky top-0 z-10">
                <h2 className="text-lg font-bold text-gray-800">Play Tour</h2>
                <div className="flex gap-2">
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="bg-gray-200 hover:bg-gray-300 text-gray-700 p-1.5 rounded-full transition-colors cursor-pointer"
                            title="Close"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>

            {error && (
                <div className="p-3 m-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg animate-pulse">
                    {error}
                </div>
            )}

            {!selectedPlayTour ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8">
                    {loading ? (
                        <div className="p-4 text-center text-gray-400">Loading...</div>
                    ) : (
                        <div className="text-center">
                            <h3 className="text-lg font-semibold text-gray-800 mb-2">No Play Tour Found</h3>
                            <p className="text-sm text-gray-500 mb-4">Create a play tour to start automating scene sequences.</p>
                            <button
                                onClick={handleCreatePlayTour}
                                disabled={saving}
                                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer shadow-md disabled:opacity-50"
                            >
                                {saving ? 'Creating...' : '+ Create Play Tour'}
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                <div className="flex-1 flex flex-col">
                    <div className="h-14 px-3 bg-white border-b border-gray-100 flex items-center justify-between sticky top-0 z-20 shadow-sm">
                        <span className="font-bold text-gray-800 truncate px-2 text-sm">
                            Tour Actions
                        </span>
                        <label
                            className="ml-auto mr-3 flex items-center gap-1.5 text-xs font-semibold text-gray-700 cursor-pointer select-none whitespace-nowrap"
                            title="Replay the camera move in the viewer whenever you change a step"
                        >
                            <input
                                type="checkbox"
                                checked={livePreview}
                                onChange={(e) => setLivePreview(e.target.checked)}
                                className="accent-purple-600"
                            />
                            Live preview
                        </label>
                        {/* Auto-save status */}
                        <span className="mr-2 flex items-center gap-1 text-[10px] font-bold whitespace-nowrap" title="Changes save automatically a moment after you stop editing">
                            {saving ? (
                                <span className="text-gray-500">Saving…</span>
                            ) : hasUnsavedChanges ? (
                                <span className="flex items-center gap-1 text-amber-700"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />Unsaved</span>
                            ) : lastSavedAt ? (
                                <span className="text-green-700">✓ Saved</span>
                            ) : null}
                        </span>
                        <button
                            onClick={() => handleSavePlayTour()}
                            disabled={saving || !hasUnsavedChanges}
                            className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 shadow-sm"
                            title="Save now (changes also save automatically)"
                        >
                            Save
                        </button>
                    </div>

                    <div className="p-4 bg-white">
                        <h3 className="text-sm font-bold text-gray-800 mb-3 border-b border-gray-100 pb-2">Add Scenes</h3>
                        <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1">
                            {scenes.map(s => (
                                <button
                                    key={s.id}
                                    onClick={() => handleAddSceneToPlayTour(s.id)}
                                    className="text-xs p-2 bg-gray-50 border border-gray-200 rounded-lg hover:border-purple-300 hover:bg-purple-50 transition-all text-left truncate font-medium text-gray-700 cursor-pointer"
                                    title={s.name}
                                >
                                    {s.src_original_url && (
                                        <img
                                            src={(() => {
                                                // 1. Try manifest preview first (most reliable)
                                                if (s.tiles_manifest) {
                                                    try {
                                                        const manifest = typeof s.tiles_manifest === 'string'
                                                            ? JSON.parse(s.tiles_manifest)
                                                            : s.tiles_manifest;
                                                        if (manifest.preview) return manifest.preview;
                                                    } catch (e) {
                                                        // Ignore parse error
                                                    }
                                                }
                                                // 2. Try thumb convention
                                                return s.src_original_url.replace(/\.(jpg|jpeg|png)$/i, '_thumb.$1');
                                            })()}
                                            alt={s.name}
                                            className="w-full h-12 object-cover rounded mb-1"
                                            loading="lazy"
                                            onError={(e) => {
                                                const img = e.currentTarget;
                                                // const currentSrc = img.src;

                                                if (!img.dataset.fallbackState) {
                                                    img.dataset.fallbackState = 'thumb_failed';
                                                    // If we started with manifest/thumb and it failed, try standardized tiles path
                                                    img.src = `${R2_PUBLIC_URL}/scenes/${s.id}/tiles/preview.jpg`;
                                                } else if (img.dataset.fallbackState === 'thumb_failed') {
                                                    img.dataset.fallbackState = 'tiles_preview_failed';
                                                    // Try root preview path (legacy/simple upload)
                                                    img.src = `${R2_PUBLIC_URL}/scenes/${s.id}/preview.jpg`;
                                                } else if (img.dataset.fallbackState === 'tiles_preview_failed') {
                                                    img.dataset.fallbackState = 'root_preview_failed';
                                                    // Final resort: Original image (heavy)
                                                    img.src = s.src_original_url || '';
                                                } else {
                                                    // Everything failed
                                                    img.style.display = 'none';
                                                }
                                            }}
                                        />
                                    )}
                                    {s.name || 'Untitled Scene'}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="p-4 flex-1">
                        <h3 className="text-sm font-bold text-gray-800 mb-1">Scenes in Tour</h3>
                        <p className="text-xs text-gray-400 mb-3 pb-2 border-b border-gray-100 italic">
                            Drag items to reorder the sequence
                        </p>
                        <div className="space-y-4">
                            {selectedPlayTour.play_tour_scenes
                                .sort((a, b) => a.sequence_order - b.sequence_order)
                                .map((ps, idx) => {
                                    const scene = scenes.find(s => s.id === ps.scene_id);
                                    const isEditingScene = editingSceneId === ps.id;

                                    return (
                                        <div
                                            key={ps.id}
                                            draggable
                                            // dragstart's target is always the card, so remember where the press began
                                            onPointerDownCapture={(e) => { dragPressTargetRef.current = e.target as HTMLElement; }}
                                            onDragStart={(e) => {
                                                // Reorder only when the step's header row is grabbed (not sliders, inputs or buttons)
                                                const pressed = dragPressTargetRef.current;
                                                if (!pressed?.closest('[data-drag-handle]') || pressed.closest('button, input, textarea, select')) {
                                                    e.preventDefault();
                                                    return;
                                                }
                                                handleDragStart(e, idx);
                                            }}
                                            onDragOver={(e) => handleDragOver(e, idx)}
                                            onDragEnd={handleDragEnd}
                                            className={`border rounded-xl shadow-sm hover:shadow-md transition-all bg-white mb-2 ${draggedSceneIndex === idx
                                                ? 'opacity-40 border-dashed border-purple-500'
                                                : focusedPathId === ps.id
                                                    ? 'border-purple-500 ring-2 ring-purple-300'
                                                    : 'border-gray-200'
                                                }`}
                                        >
                                            {/* Clicking a step selects it and shows its scene in the viewer */}
                                            {/* Stays pinned under "Tour Actions" while this step's settings scroll */}
                                            <div
                                                data-drag-handle
                                                className={`p-3 flex items-center justify-between cursor-pointer sticky top-14 z-10 rounded-t-xl border-b border-gray-100 ${collapsedScenes.has(ps.id) ? 'rounded-b-xl' : ''} ${focusedPathId === ps.id ? 'bg-purple-50' : 'bg-gray-50 hover:bg-gray-100'}`}
                                                onClick={() => {
                                                    setFocusedPathId(ps.id);
                                                    onPreviewScene?.(ps.scene_id, ps.start_yaw, ps.start_pitch, ps.start_fov);
                                                }}
                                                title="Show this step in the viewer"
                                            >
                                                <div className="flex items-center gap-2 min-w-0">
                                                    {/* Drag Handle Icon */}
                                                    <svg className="w-4 h-4 text-gray-400 hover:text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                                                    </svg>
                                                    <span className="bg-purple-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold">
                                                        {ps.sequence_order}
                                                    </span>
                                                    {scene && getSceneThumbnail(scene) && (
                                                        <img
                                                            src={getSceneThumbnail(scene)}
                                                            alt=""
                                                            className="w-10 h-6 flex-shrink-0 rounded object-cover border border-gray-200"
                                                        />
                                                    )}
                                                    <span className="text-xs font-bold text-gray-700 truncate max-w-[80px]">
                                                        {scene?.name || 'Unknown Scene'}
                                                    </span>
                                                </div>
                                                {/* Step buttons act on their own and don't also select the step */}
                                                <div className="flex gap-1 items-center" onClick={(e) => e.stopPropagation()}>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); toggleSceneCollapse(ps.id); }}
                                                        className="p-1 text-gray-700 hover:text-purple-600 rounded hover:bg-purple-100 mr-1 transition-colors cursor-pointer"
                                                        title={collapsedScenes.has(ps.id) ? "Expand" : "Collapse"}
                                                    >
                                                        {collapsedScenes.has(ps.id) ? <ChevronDown size={18} strokeWidth={2.5} /> : <ChevronUp size={18} strokeWidth={2.5} />}
                                                    </button>
                                                    <button
                                                        onClick={() => playStep(ps)}
                                                        className="px-2 py-1 bg-green-500 hover:bg-green-600 text-white rounded text-[10px] font-bold cursor-pointer flex items-center gap-1 whitespace-nowrap flex-shrink-0"
                                                        title="Play camera animation with curve effect"
                                                    >
                                                        ▶ Play
                                                    </button>
                                                    <button
                                                        onClick={() => handleUpdateSceneOrder(idx, 'up')}
                                                        disabled={idx === 0}
                                                        className="p-1 text-gray-400 hover:text-purple-600 disabled:opacity-30 cursor-pointer"
                                                    >
                                                        ▲
                                                    </button>
                                                    <button
                                                        onClick={() => handleUpdateSceneOrder(idx, 'down')}
                                                        disabled={idx === selectedPlayTour.play_tour_scenes.length - 1}
                                                        className="p-1 text-gray-400 hover:text-purple-600 disabled:opacity-30 cursor-pointer"
                                                    >
                                                        ▼
                                                    </button>
                                                    <button
                                                        onClick={() => handleRemoveSceneFromPlayTour(idx)}
                                                        className="p-1 text-red-400 hover:text-red-600 cursor-pointer"
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            </div>

                                            {!collapsedScenes.has(ps.id) && (
                                                <div className="p-3 space-y-4 bg-white rounded-b-xl">
                                                    {/* 1. Camera path */}
                                                    <section className="space-y-3">
                                                        <h4 className="text-[11px] font-bold text-gray-800 uppercase tracking-wide">Camera path</h4>

                                                        {/* Live readout of the viewer camera: what "Set from view" will save */}
                                                        <div className="rounded-lg bg-gray-900 text-white px-3 py-2">
                                                            <div className="flex items-center justify-between">
                                                                <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-gray-300">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                                                                    Current view
                                                                </span>
                                                                <span className="font-mono text-xs tabular-nums">
                                                                    Y {fmt(currentYaw)}° · P {fmt(currentPitch)}° · F {fmt(currentFov, 0)}
                                                                </span>
                                                            </div>
                                                            <p className="mt-1 text-[10px] text-gray-400">Drag the view to aim, scroll to zoom, then set start or end.</p>
                                                        </div>

                                                        <div className="grid grid-cols-2 gap-2">
                                                            {([
                                                                { type: 'start' as const, label: 'Start', yaw: ps.start_yaw, pitch: ps.start_pitch, fov: ps.start_fov, accent: 'purple' },
                                                                { type: 'end' as const, label: 'End', yaw: ps.end_yaw, pitch: ps.end_pitch, fov: ps.end_fov, accent: 'teal' },
                                                            ]).map((pos) => (
                                                                <div
                                                                    key={pos.type}
                                                                    className={`rounded-lg border p-2 space-y-2 ${pos.accent === 'purple' ? 'border-purple-200 bg-purple-50/40' : 'border-teal-200 bg-teal-50/40'}`}
                                                                >
                                                                    <div className={`text-[10px] font-bold uppercase ${pos.accent === 'purple' ? 'text-purple-700' : 'text-teal-700'}`}>
                                                                        {pos.label} position
                                                                    </div>
                                                                    <dl className="grid grid-cols-3 gap-1 text-[10px] text-gray-700 font-mono tabular-nums">
                                                                        <div><dt className="text-gray-400">Y</dt><dd>{fmt(pos.yaw)}°</dd></div>
                                                                        <div><dt className="text-gray-400">P</dt><dd>{fmt(pos.pitch)}°</dd></div>
                                                                        <div><dt className="text-gray-400">F</dt><dd>{fmt(pos.fov, 0)}</dd></div>
                                                                    </dl>
                                                                    <button
                                                                        onClick={() => handleCapturePosition(idx, pos.type)}
                                                                        className={`w-full text-[10px] font-bold text-white px-2 py-1.5 rounded transition-colors cursor-pointer ${pos.accent === 'purple' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-teal-600 hover:bg-teal-700'}`}
                                                                        title={`Save the current view as the ${pos.label.toLowerCase()} position`}
                                                                    >
                                                                        Set {pos.label.toLowerCase()} from view
                                                                    </button>
                                                                    <button
                                                                        onClick={() => onPreviewScene?.(ps.scene_id, pos.yaw, pos.pitch, pos.fov)}
                                                                        className="w-full text-[10px] font-bold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 px-2 py-1 rounded transition-colors cursor-pointer"
                                                                        title={`Move the viewer to the ${pos.label.toLowerCase()} position`}
                                                                    >
                                                                        Go to {pos.label.toLowerCase()}
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>

                                                        {isSamePosition(ps) && parseWaypoints(ps.waypoints).length === 0 && (
                                                            <p className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
                                                                Start and end are the same, so the camera won&apos;t move. Aim somewhere else and click &quot;Set end from view&quot;.
                                                            </p>
                                                        )}

                                                        {/* Curved path: points the camera passes through between start and end */}
                                                        {(() => {
                                                            const points = parseWaypoints(ps.waypoints);
                                                            const isDrawing = drawingPathFor === ps.id;
                                                            return (
                                                                <div className={`rounded-lg border p-2 space-y-2 ${isDrawing ? 'border-indigo-400 bg-indigo-50' : 'border-indigo-200 bg-indigo-50/40'}`}>
                                                                    <div className="flex items-center justify-between">
                                                                        <span className="text-[10px] font-bold uppercase text-indigo-700">Path points ({points.length})</span>
                                                                        {!isDrawing && (
                                                                            <button
                                                                                onClick={() => { setFocusedPathId(ps.id); onPreviewScene?.(ps.scene_id, ps.start_yaw, ps.start_pitch, ps.start_fov); }}
                                                                                className="text-[10px] font-bold text-indigo-700 hover:underline cursor-pointer"
                                                                            >
                                                                                Show on photo
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                    <p className="text-[10px] text-gray-600">
                                                                        The camera curves from <strong>S</strong> through these points to <strong>E</strong>. The line is drawn on the photo. Drag any marker on the photo to move it.
                                                                    </p>

                                                                    {isDrawing ? (
                                                                        <>
                                                                            <p className="text-[10px] font-semibold text-indigo-800">
                                                                                Click on the photo where the camera should look next. Add as many points as you like.
                                                                            </p>
                                                                            <div className="grid grid-cols-3 gap-1">
                                                                                <button
                                                                                    onClick={() => updateWaypoints(ps.id, p => [...p, { yaw: currentYaw, pitch: currentPitch, fov: currentFov }])}
                                                                                    className="text-[10px] font-bold text-indigo-700 bg-white border border-indigo-300 hover:bg-indigo-50 px-1 py-1.5 rounded cursor-pointer"
                                                                                    title="Add a point where the view is aimed now"
                                                                                >
                                                                                    + At centre
                                                                                </button>
                                                                                <button
                                                                                    onClick={() => updateWaypoints(ps.id, p => p.slice(0, -1))}
                                                                                    disabled={points.length === 0}
                                                                                    className="text-[10px] font-bold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 px-1 py-1.5 rounded cursor-pointer disabled:opacity-40"
                                                                                >
                                                                                    Undo
                                                                                </button>
                                                                                <button
                                                                                    onClick={() => { setDrawingPathFor(null); previewStep(ps); }}
                                                                                    className="text-[10px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-1 py-1.5 rounded cursor-pointer"
                                                                                >
                                                                                    Done ▶
                                                                                </button>
                                                                            </div>
                                                                        </>
                                                                    ) : (
                                                                        <button
                                                                            onClick={() => startDrawingPath(ps)}
                                                                            className="w-full text-[10px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-2 py-1.5 rounded cursor-pointer"
                                                                        >
                                                                            ✏️ {points.length ? 'Add more points' : 'Draw path on photo'}
                                                                        </button>
                                                                    )}

                                                                    <ol className="space-y-1">
                                                                            {/* S: always first, editable but not removable */}
                                                                            <li className="flex flex-wrap items-center gap-1.5 text-[10px] bg-purple-50/60 border border-purple-200 rounded px-2 py-1" title={`Start view: Y ${fmt(ps.start_yaw)}° · P ${fmt(ps.start_pitch)}°`}>
                                                                                <span className="w-4 h-4 flex-shrink-0 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold">S</span>
                                                                                <label className="flex items-center gap-1 text-gray-500 flex-1">
                                                                                    pause
                                                                                    <SecondsInput
                                                                                        valueMs={ps.start_hold || 0}
                                                                                        onCommit={(ms) => handleUpdateSceneParams(idx, { start_hold: ms ?? 0 })}
                                                                                        className="w-11 p-0.5 border border-gray-300 rounded text-gray-900 text-[10px]"
                                                                                        title="How long the camera stays on the start view before moving"
                                                                                    />
                                                                                    s
                                                                                </label>
                                                                                <button
                                                                                    onClick={() => onPreviewScene?.(ps.scene_id, ps.start_yaw, ps.start_pitch, ps.start_fov)}
                                                                                    className="text-gray-600 hover:text-indigo-700 cursor-pointer"
                                                                                    title="Move the viewer to the start view"
                                                                                >
                                                                                    Go
                                                                                </button>
                                                                                <span className="w-3" title="Start can't be removed" />
                                                                                <label className="w-full flex items-center gap-2 pl-5 text-gray-500">
                                                                                    <span className="w-12">Forward</span>
                                                                                    <input
                                                                                        type="range"
                                                                                        min={0}
                                                                                        max={100}
                                                                                        step={1}
                                                                                        value={120 - ps.start_fov}
                                                                                        onChange={(e) => {
                                                                                            const fov = 120 - Number(e.target.value);
                                                                                            handleUpdateSceneParams(idx, { start_fov: fov });
                                                                                            onPreviewScene?.(ps.scene_id, ps.start_yaw, ps.start_pitch, fov);
                                                                                        }}
                                                                                        className="flex-1 accent-purple-600 cursor-pointer"
                                                                                        title="Drag right to start closer"
                                                                                    />
                                                                                    <span className="w-9 text-right font-mono tabular-nums text-gray-700">F {Math.round(ps.start_fov)}</span>
                                                                                </label>
                                                                            </li>
                                                                            {points.map((point, pointIndex) => (
                                                                                <li key={pointIndex} className="flex flex-wrap items-center gap-1.5 text-[10px] bg-white border border-gray-200 rounded px-2 py-1" title={`Y ${fmt(point.yaw)}° · P ${fmt(point.pitch)}°`}>
                                                                                    <span className="w-4 h-4 flex-shrink-0 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold">{pointIndex + 1}</span>
                                                                                    <label className="flex items-center gap-1 text-gray-500">
                                                                                        reach in
                                                                                        <SecondsInput
                                                                                            valueMs={point.move}
                                                                                            min={0.1}
                                                                                            allowEmpty
                                                                                            placeholder={String(DEFAULT_POINT_MOVE_MS / 1000)}
                                                                                            onCommit={(move) => updateWaypoints(ps.id, p => p.map((pt, i) => i === pointIndex ? { ...pt, move } : pt))}
                                                                                            className="w-11 p-0.5 border border-gray-300 rounded text-gray-900 text-[10px]"
                                                                                        />
                                                                                        s
                                                                                    </label>
                                                                                    <label className="flex items-center gap-1 text-gray-500 flex-1">
                                                                                        pause
                                                                                        <SecondsInput
                                                                                            valueMs={point.hold || undefined}
                                                                                            allowEmpty
                                                                                            placeholder="0"
                                                                                            onCommit={(hold) => updateWaypoints(ps.id, p => p.map((pt, i) => i === pointIndex ? { ...pt, hold } : pt))}
                                                                                            className="w-11 p-0.5 border border-gray-300 rounded text-gray-900 text-[10px]"
                                                                                        />
                                                                                        s
                                                                                    </label>
                                                                                    <button
                                                                                        onClick={() => onPreviewScene?.(ps.scene_id, point.yaw, point.pitch, point.fov)}
                                                                                        className="text-gray-600 hover:text-indigo-700 cursor-pointer"
                                                                                        title="Move the viewer to this point"
                                                                                    >
                                                                                        Go
                                                                                    </button>
                                                                                    <button
                                                                                        onClick={() => updateWaypoints(ps.id, p => p.filter((_, i) => i !== pointIndex))}
                                                                                        className="text-red-400 hover:text-red-600 cursor-pointer"
                                                                                        title="Remove this point"
                                                                                    >
                                                                                        ✕
                                                                                    </button>
                                                                                    {/* How far forward (zoomed in) the camera is at this point: lower F = closer */}
                                                                                    <label className="w-full flex items-center gap-2 pl-5 text-gray-500">
                                                                                        <span className="w-12">Forward</span>
                                                                                        <input
                                                                                            type="range"
                                                                                            min={0}
                                                                                            max={100}
                                                                                            step={1}
                                                                                            value={120 - point.fov}
                                                                                            onChange={(e) => {
                                                                                                const fov = 120 - Number(e.target.value);
                                                                                                updateWaypoints(ps.id, p => p.map((pt, i) => i === pointIndex ? { ...pt, fov } : pt));
                                                                                                onPreviewScene?.(ps.scene_id, point.yaw, point.pitch, fov);
                                                                                            }}
                                                                                            className="flex-1 accent-indigo-600 cursor-pointer"
                                                                                            title="Drag right to move the camera closer at this point"
                                                                                        />
                                                                                        <span className="w-9 text-right font-mono tabular-nums text-gray-700">F {Math.round(point.fov)}</span>
                                                                                    </label>
                                                                                </li>
                                                                            ))}
                                                                            {/* E: always last, editable but not removable */}
                                                                            <li className="flex flex-wrap items-center gap-1.5 text-[10px] bg-teal-50/60 border border-teal-200 rounded px-2 py-1" title={`End view: Y ${fmt(ps.end_yaw)}° · P ${fmt(ps.end_pitch)}°`}>
                                                                                <span className="w-4 h-4 flex-shrink-0 rounded-full bg-teal-600 text-white flex items-center justify-center font-bold">E</span>
                                                                                <label className="flex items-center gap-1 text-gray-500 flex-1">
                                                                                    {points.length > 0 ? 'reach in' : 'move time'}
                                                                                    <SecondsInput
                                                                                        valueMs={ps.move_duration}
                                                                                        min={0.1}
                                                                                        onCommit={(ms) => { if (ms) handleUpdateSceneParams(idx, { move_duration: ms }); }}
                                                                                        className="w-11 p-0.5 border border-gray-300 rounded text-gray-900 text-[10px]"
                                                                                        title={points.length > 0 ? 'Time from the last point to the end view' : 'Time for the whole move from start to end'}
                                                                                    />
                                                                                    s
                                                                                </label>
                                                                                <button
                                                                                    onClick={() => onPreviewScene?.(ps.scene_id, ps.end_yaw, ps.end_pitch, ps.end_fov)}
                                                                                    className="text-gray-600 hover:text-indigo-700 cursor-pointer"
                                                                                    title="Move the viewer to the end view"
                                                                                >
                                                                                    Go
                                                                                </button>
                                                                                <span className="w-3" title="End can't be removed" />
                                                                                <label className="w-full flex items-center gap-2 pl-5 text-gray-500">
                                                                                    <span className="w-12">Forward</span>
                                                                                    <input
                                                                                        type="range"
                                                                                        min={0}
                                                                                        max={100}
                                                                                        step={1}
                                                                                        value={120 - ps.end_fov}
                                                                                        onChange={(e) => {
                                                                                            const fov = 120 - Number(e.target.value);
                                                                                            handleUpdateSceneParams(idx, { end_fov: fov });
                                                                                            onPreviewScene?.(ps.scene_id, ps.end_yaw, ps.end_pitch, fov);
                                                                                        }}
                                                                                        className="flex-1 accent-teal-600 cursor-pointer"
                                                                                        title="Drag right to end closer"
                                                                                    />
                                                                                    <span className="w-9 text-right font-mono tabular-nums text-gray-700">F {Math.round(ps.end_fov)}</span>
                                                                                </label>
                                                                            </li>
                                                                        {points.length > 0 && (
                                                                            <button
                                                                                onClick={() => updateWaypoints(ps.id, () => [])}
                                                                                className="text-[10px] text-red-500 hover:underline cursor-pointer"
                                                                            >
                                                                                Clear all points
                                                                            </button>
                                                                        )}
                                                                    </ol>
                                                                </div>
                                                            );
                                                        })()}

                                                        {parseWaypoints(ps.waypoints).length > 0 ? (
                                                            <p className="text-[10px] text-gray-500 bg-gray-50 border border-gray-200 rounded p-2">
                                                                <strong>How the camera moves:</strong> your path points decide this step&apos;s movement. Remove all points to use Forward / Left / Right / Up / Down instead.
                                                            </p>
                                                        ) : (
                                                        <div className="space-y-1">
                                                            <span className="text-[10px] font-bold text-gray-500 uppercase">How the camera moves</span>
                                                            <div className="grid grid-cols-3 gap-1">
                                                                {['forward', 'backward', 'left', 'right', 'up', 'down'].map((dir) => (
                                                                    <button
                                                                        key={dir}
                                                                        onClick={() => {
                                                                            const updated = handleUpdateSceneParams(idx, { transition_direction: dir as PlayTourScene['transition_direction'] });
                                                                            if (updated) previewStep(updated);
                                                                        }}
                                                                        className={`px-1 py-1 rounded border text-[10px] font-bold capitalize transition-colors cursor-pointer ${ps.transition_direction === dir
                                                                            ? 'border-purple-500 bg-purple-50 text-purple-700'
                                                                            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                                                                            }`}
                                                                    >
                                                                        {dir === 'forward' && '⬆️'}
                                                                        {dir === 'backward' && '⬇️'}
                                                                        {dir === 'left' && '⬅️'}
                                                                        {dir === 'right' && '➡️'}
                                                                        {dir === 'up' && '↗️'}
                                                                        {dir === 'down' && '↙️'}
                                                                        {' ' + dir}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                        )}

                                                        {/* Timing: start pause → move (per point when set) → pause after */}
                                                        {(() => {
                                                            const timed = hasPointTiming(ps);
                                                            const inputClass = "w-full text-xs p-1.5 border border-gray-300 rounded bg-white text-gray-900 focus:border-purple-500 outline-none";
                                                            return (
                                                                <div className="space-y-1.5">
                                                                    <div className="grid grid-cols-3 gap-2">
                                                                        <label className="space-y-1">
                                                                            <span className="text-[10px] font-bold text-gray-500 uppercase" title="How long the camera stays on the start view before it moves">Start pause (sec)</span>
                                                                            <SecondsInput
                                                                                valueMs={ps.start_hold || 0}
                                                                                className={inputClass}
                                                                                onCommit={(ms) => {
                                                                                    const updated = handleUpdateSceneParams(idx, { start_hold: ms ?? 0 });
                                                                                    if (updated) previewStep(updated, 600);
                                                                                }}
                                                                            />
                                                                        </label>
                                                                        <label className="space-y-1">
                                                                            <span className="text-[10px] font-bold text-gray-500 uppercase" title={timed ? 'Time for the last leg, from the last point into the end view' : 'Time for the whole move from start to end'}>
                                                                                {timed ? 'Reach E in (sec)' : 'Move time (sec)'}
                                                                            </span>
                                                                            <SecondsInput
                                                                                valueMs={ps.move_duration}
                                                                                min={0.1}
                                                                                className={inputClass}
                                                                                onCommit={(ms) => {
                                                                                    if (!ms) return;
                                                                                    const updated = handleUpdateSceneParams(idx, { move_duration: ms });
                                                                                    if (updated) previewStep(updated, 600);
                                                                                }}
                                                                            />
                                                                        </label>
                                                                        <label className="space-y-1">
                                                                            <span className="text-[10px] font-bold text-gray-500 uppercase">Pause after (sec)</span>
                                                                            <SecondsInput
                                                                                valueMs={ps.wait_duration}
                                                                                className={inputClass}
                                                                                onCommit={(ms) => handleUpdateSceneParams(idx, { wait_duration: ms ?? 0 })}
                                                                            />
                                                                        </label>
                                                                    </div>
                                                                    <p className="text-[10px] text-gray-500">
                                                                        Step length: <strong className="text-gray-800">{fmt(createCameraPathPlayer(ps).duration / 1000)} s</strong> moving
                                                                        {' '}+ {fmt((ps.wait_duration || 0) / 1000)} s pause after.
                                                                        {!timed && parseWaypoints(ps.waypoints).length > 0 && ' Set "reach in" on a point to time each point yourself.'}
                                                                    </p>
                                                                </div>
                                                            );
                                                        })()}
                                                    </section>

                                                    {/* 2. On-screen text */}
                                                    <section className="space-y-2 pt-3 border-t border-gray-100">
                                                        <h4 className="text-[11px] font-bold text-gray-800 uppercase tracking-wide">
                                                            On-screen text <span className="font-normal normal-case text-gray-400">(optional)</span>
                                                        </h4>
                                                        <input
                                                            type="text"
                                                            value={ps.title || ''}
                                                            onChange={(e) => handleUpdateSceneParams(idx, { title: e.target.value })}
                                                            placeholder="Title, e.g. Thoughtful Luxury Details"
                                                            aria-label="Title"
                                                            className="w-full text-xs p-1.5 border border-gray-300 rounded text-gray-900 focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                                                        />
                                                        <textarea
                                                            value={ps.description || ''}
                                                            onChange={(e) => handleUpdateSceneParams(idx, { description: e.target.value })}
                                                            placeholder="Description, e.g. Handcrafted wood cabinets, Dacor appliances..."
                                                            aria-label="Description"
                                                            rows={2}
                                                            className="w-full text-xs p-1.5 border border-gray-300 rounded text-gray-900 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 resize-none"
                                                        />
                                                    </section>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                        </div>
                        {selectedPlayTour.play_tour_scenes.length === 0 && (
                            <div className="text-center py-10 text-gray-400 text-xs italic">
                                Add scenes to this tour from the section above.
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Custom Toast Notification */}
            <Toast
                message={toastMessage}
                type={toastType}
                isVisible={toastVisible}
                onClose={() => setToastVisible(false)}
            />
        </div>
    );
}
