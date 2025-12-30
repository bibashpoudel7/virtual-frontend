'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

interface Hotspot {
  id: string;
  yaw: number;
  pitch: number;
  kind: string;
  payload: any;
}

interface PhotoViewer360Props {
  imageUrl: string;
  hotspots?: Hotspot[];
  onHotspotClick?: (hotspot: Hotspot) => void;
  onAddHotspot?: (yaw: number, pitch: number) => void;
  editMode?: boolean;
}

export default function PhotoViewer360({
  imageUrl,
  hotspots = [],
  onHotspotClick,
  onAddHotspot,
  editMode = false,
}: PhotoViewer360Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const [hoveredHotspot, setHoveredHotspot] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      75,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 0, 0.1);
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controls setup
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = true;
    controls.enablePan = false;
    controls.rotateSpeed = -0.5;
    controls.minDistance = 0.1;
    controls.maxDistance = 2;
    controlsRef.current = controls;

    // Load 360 image
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(imageUrl, (texture) => {
      const geometry = new THREE.SphereGeometry(500, 60, 40);
      geometry.scale(-1, 1, 1);
      const material = new THREE.MeshBasicMaterial({ map: texture });
      const sphere = new THREE.Mesh(geometry, material);
      scene.add(sphere);
    });

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current) return;
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    // Handle click events
    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current || !cameraRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );

      raycasterRef.current.setFromCamera(mouse, cameraRef.current);
      const intersects = raycasterRef.current.intersectObjects(scene.children);

      if (intersects.length > 0) {
        const point = intersects[0].point;
        const spherical = new THREE.Spherical();
        spherical.setFromVector3(point);
        
        const yaw = THREE.MathUtils.radToDeg(spherical.theta);
        const pitch = THREE.MathUtils.radToDeg(Math.PI / 2 - spherical.phi);

        if (editMode && onAddHotspot) {
          onAddHotspot(yaw, pitch);
        }
      }
    };

    if (editMode) {
      renderer.domElement.addEventListener('click', handleClick);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      if (editMode) {
        renderer.domElement.removeEventListener('click', handleClick);
      }
      renderer.dispose();
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, [imageUrl, editMode, onAddHotspot]);

  // Render hotspots
  useEffect(() => {
    if (!sceneRef.current) return;

    // Remove existing hotspot sprites
    const hotspotSprites = sceneRef.current.children.filter(
      (child) => child.userData.isHotspot
    );
    hotspotSprites.forEach((sprite) => {
      if (sceneRef.current) {
        sceneRef.current.remove(sprite);
      }
    });

    // Add new hotspot sprites
    hotspots.forEach((hotspot) => {
      // Create a colored circle geometry for better visibility
      const circleGeometry = new THREE.CircleGeometry(2, 32);
      const circleMaterial = new THREE.MeshBasicMaterial({
        color: hotspot.kind === 'navigation' ? 0x4CAF50 : 
               hotspot.kind === 'info' ? 0x2196F3 : 
               hotspot.kind === 'image' ? 0xFF9800 : 0x9C27B0,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: hoveredHotspot === hotspot.id ? 1.0 : 0.8
      });
      const circle = new THREE.Mesh(circleGeometry, circleMaterial);

      // Add a pulsing animation effect
      if (hoveredHotspot === hotspot.id) {
        circle.scale.set(1.2, 1.2, 1.2);
      }

      // Convert yaw/pitch to 3D position
      const phi = THREE.MathUtils.degToRad(90 - hotspot.pitch);
      const theta = THREE.MathUtils.degToRad(hotspot.yaw);
      
      const radius = 95; // Slightly inside the sphere
      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.cos(phi);
      const z = radius * Math.sin(phi) * Math.sin(theta);
      
      circle.position.set(x, y, z);
      circle.lookAt(0, 0, 0); // Make the circle face the camera origin
      circle.userData = { isHotspot: true, hotspot };
      
      // Add an inner icon indicator
      const iconGeometry = new THREE.RingGeometry(0.5, 1.5, 32);
      const iconMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9
      });
      const icon = new THREE.Mesh(iconGeometry, iconMaterial);
      icon.position.copy(circle.position);
      icon.lookAt(0, 0, 0);
      icon.userData = { isHotspot: true, hotspot };
      
      if (sceneRef.current) {
        sceneRef.current.add(circle);
        sceneRef.current.add(icon);
      }
    });
  }, [hotspots, hoveredHotspot]);

  // Handle hotspot hover and click
  useEffect(() => {
    if (!rendererRef.current || !cameraRef.current || !sceneRef.current) return;

    const handleMouseMove = (event: MouseEvent) => {
      if (!containerRef.current || !cameraRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );

      raycasterRef.current.setFromCamera(mouse, cameraRef.current);
      const hotspotSprites = sceneRef.current!.children.filter(
        (child) => child.userData.isHotspot
      );
      const intersects = raycasterRef.current.intersectObjects(hotspotSprites);

      if (intersects.length > 0) {
        const hotspot = intersects[0].object.userData.hotspot;
        setHoveredHotspot(hotspot.id);
        containerRef.current.style.cursor = 'pointer';
      } else {
        setHoveredHotspot(null);
        containerRef.current.style.cursor = editMode ? 'crosshair' : 'grab';
      }
    };

    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current || !cameraRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );

      raycasterRef.current.setFromCamera(mouse, cameraRef.current);
      const hotspotSprites = sceneRef.current!.children.filter(
        (child) => child.userData.isHotspot
      );
      const intersects = raycasterRef.current.intersectObjects(hotspotSprites);

      if (intersects.length > 0) {
        const hotspot = intersects[0].object.userData.hotspot;
        if (!editMode && onHotspotClick) {
          onHotspotClick(hotspot);
        }
      }
    };

    rendererRef.current.domElement.addEventListener('mousemove', handleMouseMove);
    rendererRef.current.domElement.addEventListener('click', handleClick);

    return () => {
      if (rendererRef.current) {
        rendererRef.current.domElement.removeEventListener('mousemove', handleMouseMove);
        rendererRef.current.domElement.removeEventListener('click', handleClick);
      }
    };
  }, [hotspots, onHotspotClick, editMode]);

  return (
    <div 
      ref={containerRef} 
      className="w-full h-full relative"
      style={{ cursor: editMode ? 'crosshair' : 'grab' }}
    />
  );
}