'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Tour, Scene, PlayTour, PlayTourScene } from '@/types/tour';
import { tourService } from '@/services/tourService';

interface PlayTourEditorProps {
    tourId: string;
    scenes: Scene[];
    currentYaw?: number;
    currentPitch?: number;
    currentFov?: number;
    onPreviewScene?: (sceneId: string, yaw: number, pitch: number, fov: number) => void;
    onPlaySceneAnimation?: (sceneId: string, startYaw: number, startPitch: number, startFov: number, endYaw: number, endPitch: number, endFov: number, duration: number, transitionDirection?: string) => void;
}

export default function PlayTourEditor({
    tourId,
    scenes,
    currentYaw = 0,
    currentPitch = 0,
    currentFov = 75,
    onPreviewScene,
    onPlaySceneAnimation,
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
    };

    const handleCapturePosition = (index: number, type: 'start' | 'end') => {
        if (type === 'start') {
            handleUpdateSceneParams(index, {
                start_yaw: currentYaw,
                start_pitch: currentPitch,
                start_fov: currentFov
            });
        } else {
            handleUpdateSceneParams(index, {
                end_yaw: currentYaw,
                end_pitch: currentPitch,
                end_fov: currentFov
            });
        }
    };

    const handleSavePlayTour = async () => {
        if (!selectedPlayTour) return;
        try {
            setSaving(true);
            const updated = await tourService.updatePlayTour(selectedPlayTour.id, selectedPlayTour);
            setPlayTours(playTours.map(t => t.id === updated.id ? updated : t));
            alert('Play Tour saved successfully');
        } catch (err) {
            setError('Failed to save play tour');
        } finally {
            setSaving(false);
        }
    };

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
                    <div className="p-3 bg-white border-b border-gray-100 flex items-center justify-between sticky top-0 z-10 shadow-sm">
                        <span className="font-bold text-gray-800 truncate px-2 text-sm">
                            Tour Actions
                        </span>
                        <button
                            onClick={handleSavePlayTour}
                            disabled={saving}
                            className="bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 shadow-sm"
                        >
                            {saving ? 'Saving...' : 'Save Changes'}
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
                                    {s.src_original_url && <img src={s.src_original_url} className="w-full h-12 object-cover rounded mb-1" />}
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
                                            onDragStart={(e) => {
                                                // Prevent drag if interacting with inputs or buttons (checking closest to handle icons)
                                                if ((e.target as HTMLElement).closest('button, input, textarea')) {
                                                    e.preventDefault();
                                                    return;
                                                }
                                                handleDragStart(e, idx);
                                            }}
                                            onDragOver={(e) => handleDragOver(e, idx)}
                                            onDragEnd={handleDragEnd}
                                            className={`border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all bg-white mb-2 ${draggedSceneIndex === idx ? 'opacity-40 border-dashed border-purple-500' : ''
                                                }`}
                                        >
                                            <div className="p-3 bg-gray-50 flex items-center justify-between cursor-move">
                                                <div className="flex items-center gap-2">
                                                    {/* Drag Handle Icon */}
                                                    <svg className="w-4 h-4 text-gray-400 hover:text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                                                    </svg>
                                                    <span className="bg-purple-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold">
                                                        {ps.sequence_order}
                                                    </span>
                                                    <span className="text-xs font-bold text-gray-700 truncate max-w-[100px]">
                                                        {scene?.name || 'Unknown Scene'}
                                                    </span>
                                                </div>
                                                <div className="flex gap-1 items-center">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); toggleSceneCollapse(ps.id); }}
                                                        className="p-1 text-gray-700 hover:text-purple-600 rounded hover:bg-purple-100 mr-1 transition-colors cursor-pointer"
                                                        title={collapsedScenes.has(ps.id) ? "Expand" : "Collapse"}
                                                    >
                                                        {collapsedScenes.has(ps.id) ? <ChevronDown size={18} strokeWidth={2.5} /> : <ChevronUp size={18} strokeWidth={2.5} />}
                                                    </button>
                                                    <button
                                                        onClick={() => onPlaySceneAnimation?.(
                                                            ps.scene_id,
                                                            ps.start_yaw, ps.start_pitch, ps.start_fov,
                                                            ps.end_yaw, ps.end_pitch, ps.end_fov,
                                                            ps.move_duration,
                                                            ps.transition_direction
                                                        )}
                                                        className="px-2 py-1 bg-green-500 hover:bg-green-600 text-white rounded text-[10px] font-bold cursor-pointer flex items-center gap-1"
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
                                                <div className="p-3 space-y-3 bg-white">
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <div className="space-y-1">
                                                            <span className="text-[10px] font-bold text-gray-500 uppercase">Move Duration (ms)</span>
                                                            <input
                                                                type="number"
                                                                className="w-full text-xs p-1.5 border border-gray-300 rounded bg-white text-gray-900 focus:border-purple-500 outline-none"
                                                                value={ps.move_duration}
                                                                onChange={(e) => handleUpdateSceneParams(idx, { move_duration: parseInt(e.target.value) })}
                                                                step={500}
                                                                min={0}
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <span className="text-[10px] font-bold text-gray-500 uppercase">Wait Duration (ms)</span>
                                                            <input
                                                                type="number"
                                                                className="w-full text-xs p-1.5 border border-gray-300 rounded bg-white text-gray-900 focus:border-purple-500 outline-none"
                                                                value={ps.wait_duration}
                                                                onChange={(e) => handleUpdateSceneParams(idx, { wait_duration: parseInt(e.target.value) })}
                                                                step={500}
                                                                min={0}
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="space-y-1">
                                                        <span className="text-[10px] font-bold text-gray-500 uppercase">Transition Direction</span>
                                                        <div className="grid grid-cols-3 gap-1">
                                                            {['forward', 'backward', 'left', 'right', 'up', 'down'].map((dir) => (
                                                                <button
                                                                    key={dir}
                                                                    onClick={() => handleUpdateSceneParams(idx, { transition_direction: dir as any })}
                                                                    className={`px-1 py-1 rounded border text-[9px] font-bold capitalize transition-colors cursor-pointer ${ps.transition_direction === dir
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

                                                    {/* Title and Description Overlays */}
                                                    <div className="space-y-2 pt-3 border-t border-gray-100">
                                                        <div className="space-y-1">
                                                            <label className="text-[10px] font-bold text-gray-500 uppercase">Title Overlay</label>
                                                            <input
                                                                type="text"
                                                                value={ps.title || ''}
                                                                onChange={(e) => handleUpdateSceneParams(idx, { title: e.target.value })}
                                                                placeholder="e.g. Thoughtful Luxury Details"
                                                                className="w-full text-xs p-1.5 border border-gray-300 rounded focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-[10px] font-bold text-gray-500 uppercase">Description Overlay</label>
                                                            <textarea
                                                                value={ps.description || ''}
                                                                onChange={(e) => handleUpdateSceneParams(idx, { description: e.target.value })}
                                                                placeholder="e.g. Handcrafted wood cabinets, Dacor appliances..."
                                                                rows={2}
                                                                className="w-full text-xs p-1.5 border border-gray-300 rounded focus:border-purple-500 focus:ring-1 focus:ring-purple-500 resize-none"
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="space-y-2 pt-2 border-t border-gray-100">
                                                        <div className="flex justify-between items-center group/pos">
                                                            <span className="text-[10px] font-bold text-purple-700 uppercase">Start Position</span>
                                                            <div className="flex gap-1">
                                                                <button
                                                                    onClick={() => onPreviewScene?.(ps.scene_id, ps.start_yaw, ps.start_pitch, ps.start_fov)}
                                                                    className="text-[10px] bg-green-100 hover:bg-green-200 text-green-700 px-2 py-0.5 rounded font-bold transition-colors cursor-pointer"
                                                                    title="Preview start position"
                                                                >
                                                                    ▶ View
                                                                </button>
                                                                <button
                                                                    onClick={() => handleCapturePosition(idx, 'start')}
                                                                    className="text-[10px] bg-purple-100 hover:bg-purple-200 text-purple-700 px-2 py-0.5 rounded font-bold transition-colors cursor-pointer"
                                                                >
                                                                    Capture
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <div className="grid grid-cols-3 gap-1 text-[10px] text-gray-600 bg-gray-50 p-2 rounded">
                                                            <div className="truncate">Y: {ps.start_yaw.toFixed(2)}</div>
                                                            <div className="truncate">P: {ps.start_pitch.toFixed(2)}</div>
                                                            <div className="truncate">F: {ps.start_fov.toFixed(0)}</div>
                                                        </div>
                                                    </div>

                                                    <div className="space-y-2">
                                                        <div className="flex justify-between items-center group/pos">
                                                            <span className="text-[10px] font-bold text-teal-700 uppercase">End Position</span>
                                                            <div className="flex gap-1">
                                                                <button
                                                                    onClick={() => onPreviewScene?.(ps.scene_id, ps.end_yaw, ps.end_pitch, ps.end_fov)}
                                                                    className="text-[10px] bg-green-100 hover:bg-green-200 text-green-700 px-2 py-0.5 rounded font-bold transition-colors cursor-pointer"
                                                                    title="Preview end position"
                                                                >
                                                                    ▶ View
                                                                </button>
                                                                <button
                                                                    onClick={() => handleCapturePosition(idx, 'end')}
                                                                    className="text-[10px] bg-teal-100 hover:bg-teal-200 text-teal-700 px-2 py-0.5 rounded font-bold transition-colors cursor-pointer"
                                                                >
                                                                    Capture
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <div className="grid grid-cols-3 gap-1 text-[10px] text-gray-600 bg-gray-50 p-2 rounded">
                                                            <div className="truncate">Y: {ps.end_yaw.toFixed(2)}</div>
                                                            <div className="truncate">P: {ps.end_pitch.toFixed(2)}</div>
                                                            <div className="truncate">F: {ps.end_fov.toFixed(0)}</div>
                                                        </div>
                                                    </div>
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
        </div>
    );
}
