'use client';

import { useEffect, useRef, useState } from 'react';

interface SimplePanoramaPreviewProps {
  imageUrl: string;
  yaw: number;
  pitch: number;
  fov: number;
  onCameraChange?: (yaw: number, pitch: number, fov: number) => void;
}

export default function SimplePanoramaPreview({
  imageUrl,
  yaw,
  pitch,
  fov,
  onCameraChange
}: SimplePanoramaPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });

  // Use props directly instead of internal state for better reactivity
  const currentYaw = yaw;
  const currentPitch = pitch;
  const currentFov = fov;

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setStartPos({ x: e.clientX - currentYaw * 2, y: e.clientY - currentPitch * 2 });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;

    const newYaw = (e.clientX - startPos.x) / 2;
    const newPitch = Math.max(-90, Math.min(90, (e.clientY - startPos.y) / 2));

    onCameraChange?.(newYaw, newPitch, currentFov);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const newFov = Math.max(30, Math.min(120, currentFov + e.deltaY * 0.05));
    onCameraChange?.(currentYaw, currentPitch, newFov);
  };

  // Calculate transform values for 360° panorama viewing
  const scale = Math.max(1, 120 / currentFov); // Ensure minimum scale of 1
  const translateX = -(currentYaw % 360) * 2; // Normalize yaw to prevent extreme values
  const translateY = Math.max(-90, Math.min(90, currentPitch)) * 1.5; // Clamp pitch and scale appropriately

  // Create transform string that updates when state changes
  const transformStyle = `scale(${scale}) translateX(${translateX}px) translateY(${translateY}px)`;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-gray-900 cursor-move"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      <div
        ref={imageRef}
        className="absolute inset-0 flex items-center justify-center"
        style={{
          transform: transformStyle,
          transition: isDragging ? 'none' : 'transform 0.1s ease-out'
        }}
      >
        <img
          src={imageUrl}
          alt="360 Preview"
          className="max-w-none h-full object-cover"
          style={{ width: `${100 * scale}%` }}
          draggable={false}
        />
      </div>

      <div className="absolute bottom-4 left-4 bg-black bg-opacity-50 text-white px-3 py-2 rounded text-sm pointer-events-none">
        <div>Drag to pan • Scroll to zoom</div>
        <div className="text-xs mt-1 opacity-75">
          Yaw: {Math.round(currentYaw)}° | Pitch: {Math.round(currentPitch)}° | FOV: {Math.round(currentFov)}°
        </div>
      </div>
    </div>
  );
}