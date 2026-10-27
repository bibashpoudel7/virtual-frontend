'use client';

import React, { useState } from 'react';
import { X, Plus, Edit2, Trash2, Navigation, Info, Image as ImageIcon } from 'lucide-react';

interface Hotspot {
  id: string;
  yaw: number;
  pitch: number;
  kind: string;
  payload: any;
}

interface HotspotEditorProps {
  hotspot?: Hotspot | null;
  onSave: (hotspot: Partial<Hotspot>) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

export default function HotspotEditor({ hotspot, onSave, onDelete, onClose }: HotspotEditorProps) {
  const [kind, setKind] = useState(hotspot?.kind || 'navigation');
  const [payload, setPayload] = useState(hotspot?.payload || {});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      id: hotspot?.id,
      yaw: hotspot?.yaw || 0,
      pitch: hotspot?.pitch || 0,
      kind,
      payload,
    });
    onClose();
  };

  const renderPayloadFields = () => {
    switch (kind) {
      case 'navigation':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Target Scene ID
              </label>
              <input
                type="text"
                value={payload.targetSceneId || ''}
                onChange={(e) => setPayload({ ...payload, targetSceneId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Scene ID to navigate to"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Label
              </label>
              <input
                type="text"
                value={payload.label || ''}
                onChange={(e) => setPayload({ ...payload, label: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Navigation label"
              />
            </div>
          </>
        );

      case 'info':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Title
              </label>
              <input
                type="text"
                value={payload.title || ''}
                onChange={(e) => setPayload({ ...payload, title: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Info title"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={payload.description || ''}
                onChange={(e) => setPayload({ ...payload, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Info description"
                rows={3}
              />
            </div>
          </>
        );

      case 'image':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Image URL
              </label>
              <input
                type="text"
                value={payload.imageUrl || ''}
                onChange={(e) => setPayload({ ...payload, imageUrl: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="https://..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Caption
              </label>
              <input
                type="text"
                value={payload.caption || ''}
                onChange={(e) => setPayload({ ...payload, caption: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Image caption"
              />
            </div>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">
            {hotspot ? 'Edit Hotspot' : 'Add Hotspot'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Hotspot Type
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setKind('navigation')}
                className={`flex flex-col items-center justify-center p-3 rounded-md border-2 transition-colors ${
                  kind === 'navigation'
                    ? 'border-blue-500 bg-blue-50 text-blue-600'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <Navigation size={20} />
                <span className="text-xs mt-1">Navigation</span>
              </button>
              <button
                type="button"
                onClick={() => setKind('info')}
                className={`flex flex-col items-center justify-center p-3 rounded-md border-2 transition-colors ${
                  kind === 'info'
                    ? 'border-blue-500 bg-blue-50 text-blue-600'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <Info size={20} />
                <span className="text-xs mt-1">Info</span>
              </button>
              <button
                type="button"
                onClick={() => setKind('image')}
                className={`flex flex-col items-center justify-center p-3 rounded-md border-2 transition-colors ${
                  kind === 'image'
                    ? 'border-blue-500 bg-blue-50 text-blue-600'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <ImageIcon size={20} />
                <span className="text-xs mt-1">Image</span>
              </button>
            </div>
          </div>

          {hotspot && (
            <div className="text-sm text-gray-900 ">
              Position: Yaw {hotspot.yaw.toFixed(2)}°, Pitch {hotspot.pitch.toFixed(2)}°
            </div>
          )}

          {renderPayloadFields()}

          <div className="flex gap-2 pt-4">
            <button
              type="submit"
              className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
            >
              {hotspot ? 'Update' : 'Create'}
            </button>
            {hotspot && onDelete && (
              <button
                type="button"
                onClick={() => {
                  onDelete(hotspot.id);
                  onClose();
                }}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
              >
                <Trash2 size={18} />
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}