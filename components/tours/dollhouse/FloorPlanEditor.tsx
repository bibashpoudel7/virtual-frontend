'use client';

import { useMemo, useRef, useState } from 'react';
import { Scene } from '@/types/tour';
import { DollhouseRoom, PlanPoint, isPlanOnlyRoom, polygonBounds, reanchorRoom, roomToPlan } from '@/lib/dollhouse';
import type { FloorPlanImage } from './FloorPlanImport';

interface FloorPlanEditorProps {
  rooms: DollhouseRoom[];
  scenes: Scene[];
  /** Floor plan image drawn under the rooms (rooms read from it line up with it) */
  planImage?: FloorPlanImage | null;
  selectedSceneId: string | null;
  onSelect: (sceneId: string) => void;
  onRoomChange: (sceneId: string, changes: Partial<DollhouseRoom>) => void;
}

const SNAP = 0.05; // meters
const snap = (value: number) => +(Math.round(value / SNAP) * SNAP).toFixed(2);

/**
 * Top-down plan of the rooms. Hand-traced rooms: drag to move, turn with the controls.
 * Floor plan rooms stay where the plan put them: drag the dot to where the photo was taken,
 * and turn the photo until it lines up with the walls.
 */
export default function FloorPlanEditor({ rooms, scenes, planImage, selectedSceneId, onSelect, onRoomChange }: FloorPlanEditorProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ start: PlanPoint; room: DollhouseRoom } | null>(null);
  // The view is frozen while dragging so the plan doesn't shift under the pointer
  const [frozenViewBox, setFrozenViewBox] = useState<string | null>(null);

  const planRooms = useMemo(() => rooms.map(room => ({
    room,
    name: scenes.find(s => s.id === room.sceneId)?.name || room.name || 'Room',
    hasPhoto: !isPlanOnlyRoom(room),
    outline: room.corners.map(c => roomToPlan(room, c)),
    camera: roomToPlan(room, [0, 0]),
  })), [rooms, scenes]);

  const viewBox = useMemo(() => {
    const points = planRooms.flatMap(r => r.outline);
    if (planImage) points.push([0, 0], [planImage.widthMeters, planImage.widthMeters * planImage.aspect]);
    if (!points.length) return '-5 -5 10 10';
    const { minX, maxX, minZ, maxZ } = polygonBounds(points);
    const margin = Math.max(maxX - minX, maxZ - minZ) * 0.05 + 0.5;
    return `${minX - margin} ${minZ - margin} ${maxX - minX + margin * 2} ${maxZ - minZ + margin * 2}`;
  }, [planRooms, planImage]);
  const activeViewBox = frozenViewBox || viewBox;
  const viewWidth = Number(activeViewBox.split(' ')[2]);
  const strokeWidth = viewWidth / 400;

  const toPlan = (event: React.PointerEvent): PlanPoint => {
    const svg = svgRef.current!;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const transformed = point.matrixTransform(svg.getScreenCTM()!.inverse());
    return [transformed.x, transformed.y];
  };

  const selected = rooms.find(r => r.sceneId === selectedSceneId);
  const setRotation = (room: DollhouseRoom, rotation: number) => {
    let next = rotation % 360;
    if (next > 180) next -= 360;
    if (next <= -180) next += 360;
    if (room.fromPlan) {
      const turned = reanchorRoom(room, room.offset, next);
      onRoomChange(room.sceneId, { rotation: next, corners: turned.corners });
    } else {
      onRoomChange(room.sceneId, { rotation: next });
    }
  };
  const canTurn = !!selected && !isPlanOnlyRoom(selected);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-3 py-2 text-sm">
        {selected && canTurn ? (
          <>
            <span className="font-medium text-gray-900">{planRooms.find(r => r.room.sceneId === selected.sceneId)?.name}</span>
            <span className="text-gray-400">·</span>
            <span className="text-gray-600">{selected.fromPlan ? 'Turn photo' : 'Turn'}</span>
            {[-90, -5, -1].map(d => (
              <button key={d} type="button" onClick={() => setRotation(selected, selected.rotation + d)} className="rounded-md border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-100 cursor-pointer">{d}°</button>
            ))}
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={selected.rotation}
              onChange={(e) => setRotation(selected, Number(e.target.value))}
              className="w-32"
              aria-label="Rotation"
            />
            {[1, 5, 90].map(d => (
              <button key={d} type="button" onClick={() => setRotation(selected, selected.rotation + d)} className="rounded-md border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-100 cursor-pointer">+{d}°</button>
            ))}
            <span className="w-12 text-right tabular-nums text-gray-600">{selected.rotation}°</span>
          </>
        ) : (
          <span className="text-gray-600">
            {selected ? 'This room has no photo; it keeps its place on the plan.' : 'Select a room to move or turn it.'}
          </span>
        )}
      </div>
      <svg
        ref={svgRef}
        viewBox={activeViewBox}
        preserveAspectRatio="xMidYMid meet"
        className="min-h-0 flex-1 touch-none select-none bg-gray-50"
        onPointerMove={(event) => {
          if (!drag) return;
          const [x, z] = toPlan(event);
          const offset: PlanPoint = [snap(drag.room.offset[0] + x - drag.start[0]), snap(drag.room.offset[1] + z - drag.start[1])];
          if (drag.room.fromPlan) {
            // Move where the photo was taken; the room outline stays on the plan
            const moved = reanchorRoom(drag.room, offset, drag.room.rotation);
            onRoomChange(drag.room.sceneId, { offset, corners: moved.corners });
          } else {
            onRoomChange(drag.room.sceneId, { offset });
          }
        }}
        onPointerUp={() => {
          setDrag(null);
          setFrozenViewBox(null);
        }}
        onPointerLeave={() => {
          setDrag(null);
          setFrozenViewBox(null);
        }}
      >
        {planImage && (
          <image
            href={planImage.url}
            x={0}
            y={0}
            width={planImage.widthMeters}
            height={planImage.widthMeters * planImage.aspect}
            preserveAspectRatio="none"
            opacity={0.55}
          />
        )}
        {planRooms.map(({ room, name, hasPhoto, outline, camera }) => {
          const isSelected = room.sceneId === selectedSceneId;
          const labelSize = viewWidth / 50;
          const startDrag = (event: React.PointerEvent) => {
            event.stopPropagation();
            onSelect(room.sceneId);
            if (!hasPhoto) return;
            svgRef.current?.setPointerCapture(event.pointerId);
            setFrozenViewBox(viewBox);
            setDrag({ start: toPlan(event), room });
          };
          return (
            <g key={room.sceneId}>
              <polygon
                points={outline.map(p => p.join(',')).join(' ')}
                fill={isSelected ? 'rgba(37, 99, 235, 0.18)' : hasPhoto ? 'rgba(255, 255, 255, 0.75)' : 'rgba(229, 231, 235, 0.6)'}
                stroke={isSelected ? '#2563eb' : '#374151'}
                strokeWidth={strokeWidth * (isSelected ? 3 : 2)}
                strokeDasharray={hasPhoto ? undefined : `${strokeWidth * 4} ${strokeWidth * 3}`}
                strokeLinejoin="round"
                className={room.fromPlan ? 'cursor-pointer' : 'cursor-move'}
                onPointerDown={room.fromPlan ? () => onSelect(room.sceneId) : startDrag}
              />
              {hasPhoto && (
                <circle
                  cx={camera[0]}
                  cy={camera[1]}
                  r={strokeWidth * (room.fromPlan ? 6 : 4)}
                  fill={isSelected ? '#2563eb' : '#6b7280'}
                  stroke="#ffffff"
                  strokeWidth={strokeWidth}
                  className="cursor-move"
                  onPointerDown={startDrag}
                />
              )}
              <text
                x={hasPhoto ? camera[0] : outline.reduce((s, p) => s + p[0], 0) / outline.length}
                y={(hasPhoto ? camera[1] : outline.reduce((s, p) => s + p[1], 0) / outline.length) - strokeWidth * 9}
                fontSize={labelSize}
                textAnchor="middle"
                className="pointer-events-none fill-gray-900 font-medium"
              >
                {name}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="border-t border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
        {rooms.some(r => r.fromPlan)
          ? 'Floor plan rooms: drag the dot to where each photo was taken, then turn the photo until the outline matches the walls (check it in step 1). '
          : ''}
        Hand-traced rooms: drag them so shared walls touch. Positions snap to 5 cm.
      </p>
    </div>
  );
}
