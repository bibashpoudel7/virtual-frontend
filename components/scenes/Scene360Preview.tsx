'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

interface Scene360PreviewProps {
  imageUrl: string;
  yaw: number;
  pitch: number;
  fov: number;
  onCameraChange?: (yaw: number, pitch: number, fov: number) => void;
}

export default function Scene360Preview({ 
  imageUrl, 
  yaw, 
  pitch, 
  fov,
  onCameraChange 
}: Scene360PreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sphereRef = useRef<THREE.Mesh | null>(null);
  const animationIdRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const previousMouseRef = useRef({ x: 0, y: 0 });
  const currentYawRef = useRef(yaw);
  const currentPitchRef = useRef(pitch);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize Three.js scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Initialize camera
    const camera = new THREE.PerspectiveCamera(
      fov,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 0, 0.1);
    cameraRef.current = camera;

    // Initialize renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Create sphere geometry for 360 image
    const geometry = new THREE.SphereGeometry(500, 60, 40);
    geometry.scale(-1, 1, 1); // Invert the sphere

    // Load texture
    const textureLoader = new THREE.TextureLoader();
    textureLoader.crossOrigin = 'anonymous';
    
    setIsLoading(true);
    setError(null);
    
    textureLoader.load(
      imageUrl,
      (texture) => {
        // Success callback
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.format = THREE.RGBAFormat;
        
        const material = new THREE.MeshBasicMaterial({ 
          map: texture,
          side: THREE.BackSide
        });
        
        if (sphereRef.current) {
          scene.remove(sphereRef.current);
          sphereRef.current.geometry.dispose();
          if (sphereRef.current.material instanceof THREE.Material) {
            sphereRef.current.material.dispose();
          }
        }
        
        const sphere = new THREE.Mesh(geometry, material);
        scene.add(sphere);
        sphereRef.current = sphere;
        setIsLoading(false);
        
        // Force a render
        if (rendererRef.current && cameraRef.current) {
          rendererRef.current.render(scene, cameraRef.current);
        }
      },
      (progress) => {
        // Progress callback
        console.log('Loading texture...', (progress.loaded / progress.total * 100) + '%');
      },
      (error) => {
        // Error callback
        console.error('Error loading texture:', error);
        setError('Failed to load image');
        setIsLoading(false);
      }
    );

    // Animation loop
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
      
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      
      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);

    // Mouse controls
    const handleMouseDown = (e: MouseEvent) => {
      isDraggingRef.current = true;
      previousMouseRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !cameraRef.current) return;

      const deltaX = e.clientX - previousMouseRef.current.x;
      const deltaY = e.clientY - previousMouseRef.current.y;

      currentYawRef.current -= deltaX * 0.5;
      currentPitchRef.current = Math.max(-90, Math.min(90, currentPitchRef.current + deltaY * 0.5));

      previousMouseRef.current = { x: e.clientX, y: e.clientY };
      
      updateCamera();
      onCameraChange?.(currentYawRef.current, currentPitchRef.current, cameraRef.current.fov);
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!cameraRef.current) return;

      const newFov = Math.max(30, Math.min(120, cameraRef.current.fov + e.deltaY * 0.05));
      cameraRef.current.fov = newFov;
      cameraRef.current.updateProjectionMatrix();
      
      onCameraChange?.(currentYawRef.current, currentPitchRef.current, newFov);
    };

    renderer.domElement.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    renderer.domElement.addEventListener('wheel', handleWheel);

    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      renderer.domElement.removeEventListener('wheel', handleWheel);
      
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
      
      renderer.dispose();
    };
  }, [imageUrl]);

  // Update camera when props change
  useEffect(() => {
    currentYawRef.current = yaw;
    currentPitchRef.current = pitch;
    updateCamera();
  }, [yaw, pitch]);

  useEffect(() => {
    if (cameraRef.current) {
      cameraRef.current.fov = fov;
      cameraRef.current.updateProjectionMatrix();
    }
  }, [fov]);

  const updateCamera = () => {
    if (!cameraRef.current) return;

    const phi = THREE.MathUtils.degToRad(90 - currentPitchRef.current);
    const theta = THREE.MathUtils.degToRad(currentYawRef.current);

    const x = 500 * Math.sin(phi) * Math.cos(theta);
    const y = 500 * Math.cos(phi);
    const z = 500 * Math.sin(phi) * Math.sin(theta);

    cameraRef.current.lookAt(x, y, z);
  };

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full bg-black" />
      
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
          <div className="text-white">Loading 360° preview...</div>
        </div>
      )}
      
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75">
          <div className="text-red-400">{error}</div>
        </div>
      )}
      
      {!isLoading && !error && (
        <div className="absolute bottom-4 left-4 bg-black bg-opacity-50 text-white px-3 py-2 rounded text-sm">
          <div>Drag to rotate • Scroll to zoom</div>
          <div className="text-xs mt-1 opacity-75">
            Yaw: {Math.round(currentYawRef.current)}° | Pitch: {Math.round(currentPitchRef.current)}° | FOV: {Math.round(fov)}°
          </div>
        </div>
      )}
    </div>
  );
}