'use client';

import { useState, useEffect, useCallback } from 'react';
import { Tour, Scene, PlayTour, PlayTourScene } from '@/types/tour';
import { tourService } from '@/services/tourService';

interface PlayTourEditorProps {
    tourId: string;
    scenes: Scene[];
    currentYaw?: number;
    currentPitch?: number;
    currentFov?: number;
}

export default function PlayTourEditor({
    tourId,
    scenes,
    currentYaw = 0,
    currentPitch = 0,
    currentFov = 75
}: PlayTourEditorProps) {
    const [playTours, setPlayTours] = useState<PlayTour[]>([]);
    const [selectedPlayTour, setSelectedPlayTour] = useState<PlayTour | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [newTourName, setNewTourName] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [editingSceneId, setEditingSceneId] = useState<string | null>(null);

    useEffect(() => {
        loadPlayTours();
    }, [tourId]);

    const loadPlayTours = async () => {
        try {
            setLoading(true);
            const tours = await tourService.listPlayTours(tourId);
            setPlayTours(tours);
        } catch (err) {
            setError('Failed to load play tours');
        } finally {
            setLoading(false);
        }
    };

    const handleCreatePlayTour = async () => {
        if (!newTourName.trim()) return;
        try {
            setSaving(true);
            const newTour = await tourService.createPlayTour(tourId, {
                name: newTourName,
                tour_id: tourId,
                play_tour_scenes: []
            });
            setPlayTours([...playTours, newTour]);
            setNewTourName('');
            setIsCreating(false);
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

    return (
        <div className="flex flex-col h-full bg-white text-gray-900 border-l border-gray-200 w-80 overflow-y-auto shadow-xl">
            <div className="p-4 pr-14 border-b border-gray-200 bg-gray-50 flex justify-between items-center sticky top-0 z-10">
                <h2 className="text-lg font-bold text-gray-800">Play Tours</h2>
                <button
                    onClick={() => setIsCreating(true)}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-2 py-1 rounded text-sm font-medium transition-colors cursor-pointer"
                >
                    + New
                </button>
            </div>

            {error && (
                <div className="p-3 m-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg animate-pulse">
                    {error}
                </div>
            )}

            {isCreating && (
                <div className="p-4 border-b border-gray-200 bg-purple-50 space-y-3">
                    <input
                        type="text"
                        placeholder="Enter tour name..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-200 outline-none text-sm text-gray-900"
                        value={newTourName}
                        onChange={(e) => setNewTourName(e.target.value)}
                    />
                    <div className="flex gap-2">
                        <button
                            onClick={handleCreatePlayTour}
                            disabled={saving}
                            className="flex-1 bg-purple-600 text-white px-3 py-2 rounded-lg text-xs font-semibold hover:bg-purple-700 transition-colors cursor-pointer disabled:opacity-50"
                        >
                            {saving ? 'Creating...' : 'Create'}
                        </button>
                        <button
                            onClick={() => setIsCreating(false)}
                            className="flex-1 bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-xs font-semibold hover:bg-gray-50 transition-colors cursor-pointer"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {!selectedPlayTour ? (
                <div className="flex-1">
                    {loading ? (
                        <div className="p-10 text-center text-gray-400">Loading...</div>
                    ) : playTours.length === 0 ? (
                        <div className="p-10 text-center text-gray-400 italic">No play tours yet.</div>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {playTours.map(t => (
                                <div
                                    key={t.id}
                                    className="p-4 hover:bg-gray-50 cursor-pointer flex justify-between items-center group transition-colors"
                                    onClick={() => setSelectedPlayTour(t)}
                                >
                                    <span className="font-medium text-gray-700">{t.name}</span>
                                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDeletePlayTour(t.id); }}
                                            className="text-red-500 hover:text-red-700 p-1 cursor-pointer"
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <div className="flex-1 flex flex-col">
                    <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between sticky top-[61px] z-10">
                        <button
                            onClick={() => setSelectedPlayTour(null)}
                            className="text-sm text-purple-600 font-semibold hover:text-purple-700 cursor-pointer"
                        >
                            ← Back
                        </button>
                        <span className="font-bold text-gray-800 truncate px-2">{selectedPlayTour.name}</span>
                        <button
                            onClick={handleSavePlayTour}
                            disabled={saving}
                            className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50"
                        >
                            {saving ? '...' : 'Save'}
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
                        <h3 className="text-sm font-bold text-gray-800 mb-3 border-b border-gray-100 pb-2">Scenes in Tour</h3>
                        <div className="space-y-4">
                            {selectedPlayTour.play_tour_scenes
                                .sort((a, b) => a.sequence_order - b.sequence_order)
                                .map((ps, idx) => {
                                    const scene = scenes.find(s => s.id === ps.scene_id);
                                    const isEditingScene = editingSceneId === ps.id;

                                    return (
                                        <div key={ps.id} className="border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow bg-white">
                                            <div className="p-3 bg-gray-50 flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="bg-purple-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold">
                                                        {ps.sequence_order}
                                                    </span>
                                                    <span className="text-xs font-bold text-gray-700 truncate max-w-[120px]">
                                                        {scene?.name || 'Unknown Scene'}
                                                    </span>
                                                </div>
                                                <div className="flex gap-1">
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

                                                <div className="space-y-2 pt-2 border-t border-gray-100">
                                                    <div className="flex justify-between items-center group/pos">
                                                        <span className="text-[10px] font-bold text-purple-700 uppercase">Start Position</span>
                                                        <button
                                                            onClick={() => handleCapturePosition(idx, 'start')}
                                                            className="text-[10px] bg-purple-100 hover:bg-purple-200 text-purple-700 px-2 py-0.5 rounded font-bold transition-colors cursor-pointer"
                                                        >
                                                            Capture Current
                                                        </button>
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
                                                        <button
                                                            onClick={() => handleCapturePosition(idx, 'end')}
                                                            className="text-[10px] bg-teal-100 hover:bg-teal-200 text-teal-700 px-2 py-0.5 rounded font-bold transition-colors cursor-pointer"
                                                        >
                                                            Capture Current
                                                        </button>
                                                    </div>
                                                    <div className="grid grid-cols-3 gap-1 text-[10px] text-gray-600 bg-gray-50 p-2 rounded">
                                                        <div className="truncate">Y: {ps.end_yaw.toFixed(2)}</div>
                                                        <div className="truncate">P: {ps.end_pitch.toFixed(2)}</div>
                                                        <div className="truncate">F: {ps.end_fov.toFixed(0)}</div>
                                                    </div>
                                                </div>
                                            </div>
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
