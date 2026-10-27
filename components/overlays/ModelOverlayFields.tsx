'use client';

import { MODEL_DEFAULTS, MAX_MODEL_DISTANCE, MIN_MODEL_DISTANCE, ModelOverlayPayload } from '@/lib/glb-model';

interface ModelOverlayFieldsProps {
  payload: ModelOverlayPayload;
  onChange: (payload: ModelOverlayPayload) => void;
  selectedFile: File | null;
  onFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

const inputClass = 'w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-gray-900 bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-200';
const labelClass = 'block text-sm font-semibold mb-2 text-gray-900';

export default function ModelOverlayFields({ payload, onChange, selectedFile, onFileSelect }: ModelOverlayFieldsProps) {
  const set = (patch: Partial<ModelOverlayPayload>) => onChange({ ...payload, ...patch });

  const slider = (
    key: 'distance' | 'size' | 'rotationX' | 'rotationY' | 'rotationZ',
    label: string,
    min: number,
    max: number,
    step: number,
    unit = ''
  ) => {
    const value = payload[key] ?? MODEL_DEFAULTS[key];
    return (
      <div>
        <label className={labelClass}>
          {label}
          <span className="text-xs text-gray-600 ml-1 font-normal">{value}{unit}</span>
        </label>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => set({ [key]: parseFloat(e.target.value) })}
          className="w-full accent-purple-600"
        />
      </div>
    );
  };

  return (
    <>
      <div>
        <label className={labelClass}>3D Model (.glb)</label>
        <input
          type="file"
          accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
          onChange={onFileSelect}
          className="block w-full text-sm text-gray-900 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-purple-600 file:text-white file:font-medium hover:file:bg-purple-700 file:cursor-pointer"
        />
        {selectedFile && (
          <p className="mt-1 text-xs text-gray-700">
            {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(1)} MB) — uploaded on save
          </p>
        )}
        <p className="mt-2 text-xs text-gray-600">Or paste a URL to a hosted .glb file:</p>
        <input
          type="url"
          value={payload.modelUrl || ''}
          onChange={(e) => set({ modelUrl: e.target.value })}
          className={`${inputClass} mt-1`}
          placeholder="https://.../model.glb"
        />
      </div>

      <div>
        <label className={labelClass}>Title (optional)</label>
        <input
          type="text"
          value={payload.title || ''}
          onChange={(e) => set({ title: e.target.value })}
          className={inputClass}
          placeholder="Shown when hovering the model"
        />
      </div>

      <div>
        <label className={labelClass}>Description (optional)</label>
        <textarea
          value={payload.description || ''}
          onChange={(e) => set({ description: e.target.value })}
          className={inputClass}
          rows={2}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {slider('distance', 'Distance', MIN_MODEL_DISTANCE, MAX_MODEL_DISTANCE, 1)}
        {slider('size', 'Size', 0.5, 30, 0.5)}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {slider('rotationX', 'Tilt X', -180, 180, 5, '°')}
        {slider('rotationY', 'Turn Y', -180, 180, 5, '°')}
        {slider('rotationZ', 'Roll Z', -180, 180, 5, '°')}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-900 cursor-pointer">
          <input
            type="checkbox"
            checked={payload.autoRotate ?? MODEL_DEFAULTS.autoRotate}
            onChange={(e) => set({ autoRotate: e.target.checked })}
            className="accent-purple-600"
          />
          Auto-rotate
        </label>
        {(payload.autoRotate ?? MODEL_DEFAULTS.autoRotate) && (
          <label className="flex items-center gap-2 text-sm text-gray-900">
            Speed
            <input
              type="number"
              min={1}
              max={180}
              value={payload.autoRotateSpeed ?? MODEL_DEFAULTS.autoRotateSpeed}
              onChange={(e) => set({ autoRotateSpeed: parseFloat(e.target.value) })}
              className="w-20 px-2 py-1 border-2 border-gray-300 rounded text-gray-900 bg-white"
            />
            °/s
          </label>
        )}
        <label className="flex items-center gap-2 text-sm font-medium text-gray-900 cursor-pointer">
          <input
            type="checkbox"
            checked={payload.playAnimation ?? MODEL_DEFAULTS.playAnimation}
            onChange={(e) => set({ playAnimation: e.target.checked })}
            className="accent-purple-600"
          />
          Play built-in animations
        </label>
      </div>

      <p className="text-xs text-gray-600">
        Distance must stay below {MAX_MODEL_DISTANCE} so the model stays inside the panorama. Size is the
        model&apos;s largest dimension. Save to see changes in the viewer.
      </p>
    </>
  );
}
