'use client';

import { useEffect, useRef, useState } from 'react';
import { BuildingScan, FloorPlanAnalysis, Scene } from '@/types/tour';
import { tourService } from '@/services/tourService';
import { DOLLHOUSE_DEFAULTS, DollhouseRoom, roomsFromBuildingScan, roomsFromFloorPlan } from '@/lib/dollhouse';

export interface FloorPlanImage {
  url: string;
  /** height / width */
  aspect: number;
  widthMeters: number;
}

interface FloorPlanImportProps {
  tourId: string;
  scenes: Scene[];
  /** Rooms already in the builder (applying replaces them) */
  hasRooms: boolean;
  /** Rooms measured with the Android capture app, if the tour has a scan */
  buildingScan?: BuildingScan | null;
  /** `plan` is null for a phone scan (no image to show under the rooms) */
  onApply: (rooms: DollhouseRoom[], plan: FloorPlanImage | null) => void;
}

// The API takes images up to 5 MB; ~2000 px keeps plans legible and well under that
const MAX_IMAGE_SIDE = 2000;
const MAX_UPLOAD_BYTES = 4.5 * 1024 * 1024;

async function preparePlanImage(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; // transparent plans read better on white
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const toBlob = (type: string, quality?: number) =>
    new Promise<Blob>((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not encode the image.'))), type, quality));
  let blob = await toBlob('image/png');
  if (blob.size > MAX_UPLOAD_BYTES) blob = await toBlob('image/jpeg', 0.9);
  return { blob, url: URL.createObjectURL(blob), aspect: canvas.height / canvas.width };
}

type Room = FloorPlanAnalysis['rooms'][number];

/** Step 0 of the dollhouse builder: read rooms from a floor plan image, then review them. */
export default function FloorPlanImport({ tourId, scenes, hasRooms, buildingScan, onApply }: FloorPlanImportProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [image, setImage] = useState<{ blob: Blob; url: string; aspect: number } | null>(null);
  const [status, setStatus] = useState<'idle' | 'preparing' | 'reading'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<FloorPlanAnalysis | null>(null);
  const [widthMeters, setWidthMeters] = useState(15);
  const [ceilingHeight, setCeilingHeight] = useState(DOLLHOUSE_DEFAULTS.ceilingHeight);
  const [selected, setSelected] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ room: number; corner: number } | null>(null);
  const [measure, setMeasure] = useState<{ points: { x: number; y: number }[]; meters: string } | null>(null);

  // The URL is handed to the builder on apply; only revoke images that were replaced
  const appliedUrlRef = useRef<string | null>(null);
  useEffect(() => () => {
    if (image && image.url !== appliedUrlRef.current) URL.revokeObjectURL(image.url);
  }, [image]);

  const chooseFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Choose an image (PNG or JPG). For a PDF, export the floor plan page as an image first.');
      return;
    }
    setError(null);
    setAnalysis(null);
    setSelected(null);
    setMeasure(null);
    setStatus('preparing');
    try {
      setImage(await preparePlanImage(file));
    } catch (err) {
      console.error('[FloorPlan] Could not read image:', err);
      setError('Could not open that image.');
    } finally {
      setStatus('idle');
    }
  };

  const readRooms = async () => {
    if (!image) return;
    setStatus('reading');
    setError(null);
    try {
      const result = await tourService.analyzeFloorPlan(tourId, image.blob);
      setAnalysis(result);
      setWidthMeters(+result.plan_width_meters.toFixed(2));
      if (result.ceiling_height_meters) setCeilingHeight(result.ceiling_height_meters);
      setSelected(result.rooms.length ? 0 : null);
    } catch (err) {
      console.error('[FloorPlan] Analyze failed:', err);
      setError(err instanceof Error ? err.message : 'Reading the floor plan failed.');
    } finally {
      setStatus('idle');
    }
  };

  const updateRoom = (index: number, changes: Partial<Room>) => {
    setAnalysis(current => current && { ...current, rooms: current.rooms.map((r, i) => (i === index ? { ...r, ...changes } : r)) });
  };

  const toNormalized = (event: React.PointerEvent) => {
    const svg = svgRef.current!;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const p = point.matrixTransform(svg.getScreenCTM()!.inverse());
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    return { x: clamp(p.x), y: clamp(p.y / image!.aspect) };
  };

  const aspect = image?.aspect || 1;
  const measuredUnits = measure?.points.length === 2
    ? Math.hypot(measure.points[1].x - measure.points[0].x, (measure.points[1].y - measure.points[0].y) * aspect)
    : 0;
  const usedScenes = new Set((analysis?.rooms || []).map(r => r.scene_id).filter(Boolean));
  const photoRooms = analysis?.rooms.filter(r => r.scene_id).length || 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <aside className="space-y-4 overflow-y-auto border-b border-gray-200 p-4 text-sm md:w-80 md:border-b-0 md:border-r">
        {buildingScan && buildingScan.rooms.length > 0 && (
          <div className="space-y-2 rounded-lg border border-green-200 bg-green-50 p-3">
            <h3 className="font-medium text-gray-900">Phone scan available</h3>
            <p className="text-xs text-gray-700">
              {buildingScan.rooms.length} room{buildingScan.rooms.length === 1 ? '' : 's'} measured with the capture app
              {buildingScan.captured_at ? ` on ${new Date(buildingScan.captured_at).toLocaleDateString()}` : ''}
              {' · '}{buildingScan.rooms.filter(r => r.scene_id).length} linked to photos.
              Measurements and photo spots are exact; you only turn each photo to line it up.
            </p>
            <button
              type="button"
              onClick={() => onApply(roomsFromBuildingScan(buildingScan), null)}
              className="w-full rounded-lg bg-green-600 px-3 py-1.5 font-medium text-white hover:bg-green-700 cursor-pointer"
            >
              Import phone scan
            </button>
            {hasRooms && <p className="text-xs text-gray-500">Replaces the rooms you already set up.</p>}
          </div>
        )}
        <div>
          <h3 className="font-medium text-gray-900">Start from a floor plan</h3>
          <p className="text-xs text-gray-600">
            Upload the property’s floor plan. The rooms are read automatically, then each 360° photo is placed in its room.
            Optional: skip this to trace rooms by hand.
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) chooseFile(file);
            e.target.value = '';
          }}
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={status !== 'idle'}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-100 cursor-pointer disabled:opacity-50"
          >
            {image ? 'Choose another' : status === 'preparing' ? 'Opening…' : 'Upload floor plan'}
          </button>
          {image && (
            <button
              type="button"
              onClick={readRooms}
              disabled={status !== 'idle'}
              className="flex-1 rounded-lg bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-700 cursor-pointer disabled:opacity-50"
            >
              {status === 'reading' ? 'Reading…' : analysis ? 'Read again' : 'Read rooms'}
            </button>
          )}
        </div>
        {status === 'reading' && <p className="text-xs text-gray-500">Reading the plan usually takes under a minute.</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}

        {analysis && (
          <>
            {analysis.notes && <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800">{analysis.notes}</p>}

            <div className="space-y-1">
              <label htmlFor="plan-width" className="block font-medium text-gray-900">Scale</label>
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-600">Whole plan width</span>
                <input
                  id="plan-width"
                  type="number"
                  min={1}
                  max={500}
                  step={0.1}
                  value={widthMeters}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    if (value > 0) setWidthMeters(value);
                  }}
                  className="w-20 rounded-md border border-gray-300 px-2 py-1"
                />
                <span className="text-xs text-gray-600">m</span>
              </div>
              <p className={`text-xs ${analysis.scale_source === 'estimated' ? 'text-amber-700' : 'text-gray-500'}`}>
                {analysis.scale_source === 'estimated'
                  ? 'Estimated: the plan has no measurements. Measure a wall you know to fix it.'
                  : 'Read from the plan’s measurements.'}
              </p>
              {measure ? (
                <div className="space-y-1 rounded-md border border-blue-200 bg-blue-50 p-2 text-xs">
                  {measure.points.length < 2 ? (
                    <p>Click {measure.points.length ? 'the other end' : 'one end of a wall you know the length of'} on the plan.</p>
                  ) : (
                    <form
                      className="flex items-center gap-1"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const meters = Number(measure.meters);
                        if (meters > 0 && measuredUnits > 0) {
                          setWidthMeters(+(meters / measuredUnits).toFixed(2));
                          setMeasure(null);
                        }
                      }}
                    >
                      <span>Real length</span>
                      <input
                        type="number"
                        min={0.1}
                        step={0.01}
                        autoFocus
                        value={measure.meters}
                        onChange={(e) => setMeasure({ ...measure, meters: e.target.value })}
                        className="w-16 rounded border border-gray-300 px-1 py-0.5"
                      />
                      <span>m</span>
                      <button type="submit" className="rounded bg-blue-600 px-2 py-0.5 text-white cursor-pointer">Set</button>
                    </form>
                  )}
                  <button type="button" onClick={() => setMeasure(null)} className="text-gray-600 underline cursor-pointer">Cancel</button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setMeasure({ points: [], meters: '' })}
                  className="text-xs text-blue-700 underline cursor-pointer"
                >
                  Measure a wall
                </button>
              )}
            </div>

            <div className="flex items-center gap-1">
              <label htmlFor="plan-ceiling" className="font-medium text-gray-900">Ceiling height</label>
              <input
                id="plan-ceiling"
                type="number"
                min={1.8}
                max={8}
                step={0.05}
                value={ceilingHeight}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  if (value >= 1.8 && value <= 8) setCeilingHeight(value);
                }}
                className="ml-auto w-20 rounded-md border border-gray-300 px-2 py-1"
              />
              <span className="text-xs text-gray-600">m</span>
            </div>

            <div>
              <div className="mb-1 flex items-center">
                <h4 className="font-medium text-gray-900">Rooms ({analysis.rooms.length})</h4>
                <button
                  type="button"
                  onClick={() => {
                    const rooms = [...analysis.rooms, {
                      name: 'New room',
                      scene_id: '',
                      corners: [{ x: 0.4, y: 0.4 }, { x: 0.6, y: 0.4 }, { x: 0.6, y: 0.6 }, { x: 0.4, y: 0.6 }],
                    }];
                    setAnalysis({ ...analysis, rooms });
                    setSelected(rooms.length - 1);
                  }}
                  className="ml-auto text-xs text-blue-700 underline cursor-pointer"
                >
                  Add room
                </button>
              </div>
              <ul className="space-y-1">
                {analysis.rooms.map((room, index) => (
                  <li
                    key={index}
                    onClick={() => setSelected(index)}
                    className={`rounded-md border p-2 ${selected === index ? 'border-blue-400 bg-blue-50' : 'border-gray-200'}`}
                  >
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={room.name}
                        onChange={(e) => updateRoom(index, { name: e.target.value })}
                        aria-label="Room name"
                        className="min-w-0 flex-1 rounded border border-gray-300 px-1.5 py-0.5"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAnalysis({ ...analysis, rooms: analysis.rooms.filter((_, i) => i !== index) });
                          setSelected(null);
                        }}
                        className="rounded px-1.5 text-xs text-red-600 hover:bg-red-50 cursor-pointer"
                        aria-label={`Remove ${room.name}`}
                      >
                        Remove
                      </button>
                    </div>
                    <select
                      value={room.scene_id}
                      onChange={(e) => updateRoom(index, { scene_id: e.target.value })}
                      aria-label={`360° photo for ${room.name}`}
                      className="mt-1 w-full rounded border border-gray-300 px-1 py-0.5 text-xs"
                    >
                      <option value="">No photo (plain room)</option>
                      {scenes.map(scene => (
                        <option key={scene.id} value={scene.id} disabled={scene.id !== room.scene_id && usedScenes.has(scene.id)}>
                          {scene.name || 'Untitled'}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            </div>

            <button
              type="button"
              disabled={!analysis.rooms.length}
              onClick={() => {
                appliedUrlRef.current = image!.url;
                onApply(roomsFromFloorPlan(analysis, aspect, widthMeters, ceilingHeight), { url: image!.url, aspect, widthMeters });
              }}
              className="w-full rounded-lg bg-blue-600 px-3 py-2 font-medium text-white hover:bg-blue-700 cursor-pointer disabled:opacity-50"
            >
              Use these rooms
            </button>
            <p className="text-xs text-gray-500">
              {photoRooms} of {analysis.rooms.length} rooms have a photo. Rooms without one get plain floors and walls.
              {hasRooms ? ' Replaces the rooms you already set up.' : ''}
            </p>
          </>
        )}
      </aside>

      {/* Plan with the rooms drawn over it: drag a corner to fix it */}
      <div className="relative min-h-[320px] flex-1 overflow-auto bg-gray-100 p-4">
        {image ? (
          <svg
            ref={svgRef}
            viewBox={`0 0 1 ${aspect}`}
            className={`mx-auto block h-full max-h-full w-full touch-none select-none ${measure ? 'cursor-crosshair' : ''}`}
            onPointerDown={(event) => {
              if (!measure || measure.points.length >= 2) return;
              setMeasure({ ...measure, points: [...measure.points, toNormalized(event)] });
            }}
            onPointerMove={(event) => {
              if (!drag || !analysis) return;
              const point = toNormalized(event);
              const room = analysis.rooms[drag.room];
              updateRoom(drag.room, { corners: room.corners.map((c, i) => (i === drag.corner ? point : c)) });
            }}
            onPointerUp={() => setDrag(null)}
            onPointerLeave={() => setDrag(null)}
          >
            <image href={image.url} x={0} y={0} width={1} height={aspect} preserveAspectRatio="none" />
            {analysis?.rooms.map((room, index) => {
              const isSelected = index === selected;
              const cx = room.corners.reduce((s, c) => s + c.x, 0) / room.corners.length;
              const cy = room.corners.reduce((s, c) => s + c.y, 0) / room.corners.length;
              return (
                <g key={index} onPointerDown={() => !measure && setSelected(index)}>
                  <polygon
                    points={room.corners.map(c => `${c.x},${c.y * aspect}`).join(' ')}
                    fill={isSelected ? 'rgba(37, 99, 235, 0.25)' : room.scene_id ? 'rgba(16, 185, 129, 0.18)' : 'rgba(107, 114, 128, 0.15)'}
                    stroke={isSelected ? '#2563eb' : room.scene_id ? '#059669' : '#6b7280'}
                    strokeWidth={0.003}
                  />
                  <text x={cx} y={cy * aspect} fontSize={0.02} textAnchor="middle" className="pointer-events-none fill-gray-900 font-semibold">
                    {room.name}
                  </text>
                  {isSelected && !measure && room.corners.map((corner, cornerIndex) => (
                    <circle
                      key={cornerIndex}
                      cx={corner.x}
                      cy={corner.y * aspect}
                      r={0.008}
                      fill="#ffffff"
                      stroke="#2563eb"
                      strokeWidth={0.003}
                      className="cursor-move"
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        svgRef.current?.setPointerCapture(event.pointerId);
                        setDrag({ room: index, corner: cornerIndex });
                      }}
                    />
                  ))}
                </g>
              );
            })}
            {measure?.points.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y * aspect} r={0.006} fill="#f59e0b" />
            ))}
            {measure?.points.length === 2 && (
              <line
                x1={measure.points[0].x} y1={measure.points[0].y * aspect}
                x2={measure.points[1].x} y2={measure.points[1].y * aspect}
                stroke="#f59e0b" strokeWidth={0.003}
              />
            )}
          </svg>
        ) : (
          <div className="flex h-full items-center justify-center text-center text-sm text-gray-500">
            Upload a floor plan image to begin.
          </div>
        )}
      </div>
    </div>
  );
}
