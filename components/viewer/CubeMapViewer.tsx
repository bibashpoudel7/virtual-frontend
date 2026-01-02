'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Tour, Scene, Hotspot, Overlay } from '@/types/tour';
import { CubeFace, CubeMapManifest } from '@/lib/cubemap-types';

interface CubeMapViewerProps {
  tour: Tour;
  currentScene: Scene;
  scenes?: Scene[];
  onSceneChange?: (sceneId: string) => void;
  onHotspotClick?: (hotspot: Hotspot) => void;
  isEditMode?: boolean;
  onHotspotCreate?: (yaw: number, pitch: number) => void;
  onHotspotUpdate?: (hotspot: Hotspot) => void;
  hotspots?: Hotspot[];
  overlays?: Overlay[];
  autoRotate?: boolean;
  highlightedHotspotId?: string | null;
}


export default function CubeMapViewer({
  tour,
  currentScene,
  scenes = [],
  onSceneChange,
  onHotspotClick,
  isEditMode = false,
  onHotspotCreate,
  onHotspotUpdate,
  hotspots = [],
  overlays = [],
  autoRotate = false,
  highlightedHotspotId = null,
}: CubeMapViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const cubeRef = useRef<THREE.Mesh | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  
  const [isLoading, setIsLoading] = useState(true);
  const [manifest, setManifest] = useState<CubeMapManifest | null>(null);
  const [currentLevel, setCurrentLevel] = useState(0);
  const [isAutoRotating, setIsAutoRotating] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const materialsRef = useRef<THREE.MeshBasicMaterial[]>([]);
  const hotspotsRef = useRef<THREE.Group | null>(null);
  const overlaysRef = useRef<THREE.Group | null>(null);
  const hoveredHotspotRef = useRef<THREE.Sprite | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isNavigatingRef = useRef(false);
  
  // Controls state
  const controlsRef = useRef({
    mouseX: 0,
    mouseY: 0,
    targetRotationX: 0,
    targetRotationY: 0,
    isUserInteracting: false,
    onPointerDownX: 0,
    onPointerDownY: 0,
    onPointerDownLon: 0,
    onPointerDownLat: 0,
    lon: 0,
    lat: 0,
    phi: 0,
    theta: 0,
  });

  // Parse manifest from scene
  useEffect(() => {
    if (currentScene.tiles_manifest) {
      try {
        const parsed = typeof currentScene.tiles_manifest === 'string' 
          ? JSON.parse(currentScene.tiles_manifest)
          : currentScene.tiles_manifest;
        
        if (parsed.type === 'cubemap') {
          console.log('Parsed manifest:', JSON.stringify(parsed, null, 2));
          // Clear texture cache when switching scenes
          if (loadedTexturesRef.current.size > 0) {
            loadedTexturesRef.current.forEach(texture => texture.dispose());
            loadedTexturesRef.current.clear();
          }
          setManifest(parsed);
          setCurrentLevel(0); // Reset to level 0 for new scene
        }
      } catch (error) {
        console.error('Failed to parse cube map manifest:', error);
      }
    }
  }, [currentScene]);

  // Initialize Three.js scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Create renderer
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.opacity = '1'; // Ensure opacity is always 1
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Create scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    sceneRef.current = scene;

    // Create camera with better FOV for cube maps
    const camera = new THREE.PerspectiveCamera(
      60, // Reduced FOV for less distortion
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 0, 0);
    cameraRef.current = camera;

    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 1);
    scene.add(ambientLight);
    
    // Create groups for hotspots and overlays
    const hotspotsGroup = new THREE.Group();
    hotspotsGroup.name = 'hotspots';
    scene.add(hotspotsGroup);
    hotspotsRef.current = hotspotsGroup;
    
    const overlaysGroup = new THREE.Group();
    overlaysGroup.name = 'overlays';
    scene.add(overlaysGroup);
    overlaysRef.current = overlaysGroup;

    // Animation loop
    let animationId: number;
    const animate = () => {
      if (!sceneRef.current || !cameraRef.current || !rendererRef.current) return;
      
      animationId = requestAnimationFrame(animate);

      // Update camera rotation based on controls
      const controls = controlsRef.current;
      
      // Auto-rotation controlled by state or scene settings
      if ((autoRotate || isAutoRotating || currentScene.auto_rotate) && !controls.isUserInteracting) {
        const rotateSpeed = currentScene.auto_rotate_speed || 0.5;
        controls.lon += rotateSpeed * 0.2; // Apply rotation speed (increased for visibility)
      }
      
      controls.lat = Math.max(-90, Math.min(90, controls.lat)); // Allow full vertical range
      controls.phi = THREE.MathUtils.degToRad(90 - controls.lat);
      controls.theta = THREE.MathUtils.degToRad(controls.lon);

      const target = new THREE.Vector3();
      target.x = 500 * Math.sin(controls.phi) * Math.cos(controls.theta);
      target.y = 500 * Math.cos(controls.phi);
      target.z = 500 * Math.sin(controls.phi) * Math.sin(controls.theta);

      cameraRef.current.lookAt(target);
      
      // Ensure proper orientation
      cameraRef.current.up.set(0, 1, 0);
      
      // Adjust hotspot/overlay sizes based on FOV (zoom level) and add glow/highlight effects
      if (hotspotsRef.current && cameraRef.current) {
        const scaleFactor = cameraRef.current.fov / 60; // Base FOV is 60
        const time = Date.now() * 0.001; // Time in seconds for animations
        
        hotspotsRef.current.children.forEach((child) => {
          if (child instanceof THREE.Sprite && child.userData.baseScale) {
            const baseScale = child.userData.baseScale;
            const isHighlighted = child.userData.isHighlighted;
            
            // Animate glow for ground hotspots
            if (child.userData.isGround) {
              // Smooth glow transition
              const glowSpeed = 0.1;
              child.userData.glowIntensity = child.userData.glowIntensity || 0;
              child.userData.targetGlow = child.userData.targetGlow || 0;
              
              // Interpolate glow
              child.userData.glowIntensity += 
                (child.userData.targetGlow - child.userData.glowIntensity) * glowSpeed;
              
              // Apply glow as scale pulse
              let glowScale = 1 + child.userData.glowIntensity * 0.3;
              
              // Add extra pulsing for highlighted hotspots
              if (isHighlighted) {
                glowScale += Math.sin(time * 3) * 0.15;
              }
              
              child.scale.set(
                baseScale * scaleFactor * glowScale, 
                baseScale * scaleFactor * glowScale, 
                1
              );
              
              // Update opacity for glow effect
              if (child.material && 'opacity' in child.material) {
                const baseOpacity = isHighlighted ? 1 : 0.7;
                child.material.opacity = baseOpacity + child.userData.glowIntensity * 0.3;
              }
            } else {
              // Regular hotspots with highlighting animation
              let scale = baseScale * scaleFactor;
              
              // Add pulsing effect for highlighted hotspots
              if (isHighlighted) {
                scale *= (1 + Math.sin(time * 3) * 0.2);
              }
              
              child.scale.set(scale, scale, 1);
              
              // Update opacity for highlighted effect
              if (child.material && 'opacity' in child.material && isHighlighted) {
                child.material.opacity = 0.8 + Math.sin(time * 3) * 0.2;
              }
            }
          }
        });
      }
      
      if (overlaysRef.current && cameraRef.current) {
        const scaleFactor = cameraRef.current.fov / 60;
        overlaysRef.current.children.forEach((child) => {
          if (child instanceof THREE.Mesh && child.userData.baseScale) {
            const baseScale = child.userData.baseScale;
            child.scale.set(baseScale.x * scaleFactor, baseScale.y * scaleFactor, 1);
          }
        });
      }
      
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    };

    animate();

    // Handle resize
    const handleResize = () => {
      if (!cameraRef.current || !rendererRef.current || !containerRef.current) return;
      
      cameraRef.current.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      if (animationId) cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [autoRotate, isAutoRotating, currentScene.auto_rotate, currentScene.auto_rotate_speed]);

  // Keep track of loaded textures to prevent reloading
  const loadedTexturesRef = useRef<Map<string, THREE.Texture>>(new Map());
  
  // Progressive loading of cube map tiles with proper compositing
  const loadCubeMapLevel = useCallback((level: number) => {
    // Always use the current manifest from state, not from closure
    const currentManifest = manifest;
    if (!currentManifest || !sceneRef.current || !currentManifest.levels[level]) return;
    
    console.log(`Loading cube map level ${level}`);
    const levelInfo = currentManifest.levels[level];
    const tilesPerSide = levelInfo.tiles;
    const faceSize = levelInfo.size;
    
    // Debug: Check if tilesPerSide is being calculated correctly
    const actualTileSize = levelInfo.tileSize || currentManifest.tileSize || 512;
    const calculatedTiles = Math.ceil(faceSize / actualTileSize);
    console.log(`Level ${level} tile calculation: faceSize=${faceSize}, tileSize=${actualTileSize}, tilesPerSide=${tilesPerSide}, calculated=${calculatedTiles}`);
    if (calculatedTiles !== tilesPerSide) {
      console.error(`CRITICAL: Tiles mismatch! Manifest says tiles=${tilesPerSide}, but calculated ${calculatedTiles} from size ${faceSize} / tileSize ${actualTileSize}`);
      console.error('Using manifest value, but this may cause 404 errors');
    }
    
    console.log(`Level ${level} info:`, {
      tilesPerSide,
      faceSize,
      tileSize: levelInfo.tileSize || manifest.tileSize || 512,
      fullLevelInfo: levelInfo
    });
    
    const faceOrder = [
      CubeFace.RIGHT,
      CubeFace.LEFT,
      CubeFace.TOP,
      CubeFace.BOTTOM,
      CubeFace.FRONT,
      CubeFace.BACK
    ];
    
    // Special case for level 0 - single tile per face
    if (level === 0) {
      const loader = new THREE.TextureLoader();
      faceOrder.forEach((face, faceIndex) => {
        // Check cache first
        const cacheKey = `${currentScene.id}_${face}_l${level}`;
        if (loadedTexturesRef.current.has(cacheKey)) {
          const cachedTexture = loadedTexturesRef.current.get(cacheKey)!;
          if (materialsRef.current[faceIndex]) {
            materialsRef.current[faceIndex].map = cachedTexture;
            materialsRef.current[faceIndex].needsUpdate = true;
          }
          return;
        }
        
        // Load single tile
        const tileUrl = `https://test.thenimto.com/scenes/${currentScene.id}/tiles/${face}_l${level}_0_0.jpg`;
        
        loader.load(
          tileUrl,
          (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.minFilter = THREE.LinearMipmapLinearFilter;
            texture.magFilter = THREE.LinearFilter;
            texture.generateMipmaps = true;
            texture.anisotropy = rendererRef.current?.capabilities.getMaxAnisotropy() || 16;
            texture.needsUpdate = true;
            
            // Cache the texture
            loadedTexturesRef.current.set(cacheKey, texture);
            
            // Update material
            if (materialsRef.current[faceIndex]) {
              const oldMap = materialsRef.current[faceIndex].map;
              materialsRef.current[faceIndex].map = texture;
              materialsRef.current[faceIndex].needsUpdate = true;
              
              // Dispose old texture if it's not cached
              if (oldMap && oldMap !== texture && !Array.from(loadedTexturesRef.current.values()).includes(oldMap)) {
                oldMap.dispose();
              }
            }
            
            console.log(`Loaded ${face} at level ${level} (single tile)`);
          },
          undefined,
          (error) => {
            console.error(`Failed to load tile: ${face}_l${level}_0_0.jpg`, error);
          }
        );
      });
      return;
    }
    
    // For levels 1+ - composite multiple tiles
    faceOrder.forEach((face, faceIndex) => {
      // Check cache first
      const cacheKey = `${currentScene.id}_${face}_l${level}`;
      if (loadedTexturesRef.current.has(cacheKey)) {
        const cachedTexture = loadedTexturesRef.current.get(cacheKey)!;
        if (materialsRef.current[faceIndex]) {
          materialsRef.current[faceIndex].map = cachedTexture;
          materialsRef.current[faceIndex].needsUpdate = true;
        }
        return;
      }
      
      // Create canvas for compositing tiles
      const canvas = document.createElement('canvas');
      canvas.width = faceSize;
      canvas.height = faceSize;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        console.error('Failed to get canvas context');
        return;
      }
      
      // Track loaded tiles for this face
      let tilesLoaded = 0;
      const totalTiles = tilesPerSide * tilesPerSide;
      // Use the tileSize from the levelInfo we already have at the top
      const tileSize = levelInfo.tileSize || currentManifest.tileSize || 512;
      
      // Load all tiles for this face
      for (let y = 0; y < tilesPerSide; y++) {
        for (let x = 0; x < tilesPerSide; x++) {
          const tileUrl = `https://test.thenimto.com/scenes/${currentScene.id}/tiles/${face}_l${level}_${x}_${y}.jpg`;
          
          const img = new Image();
          img.crossOrigin = 'anonymous';
          
          img.onload = () => {
            // Draw tile at correct position
            const destX = x * tileSize;
            const destY = y * tileSize;
            
            // Handle edge tiles that might be smaller
            const drawWidth = Math.min(tileSize, faceSize - destX);
            const drawHeight = Math.min(tileSize, faceSize - destY);
            
            ctx.drawImage(img, 0, 0, img.width, img.height, destX, destY, drawWidth, drawHeight);
            
            tilesLoaded++;
            
            // All tiles loaded for this face
            if (tilesLoaded === totalTiles) {
              // Create texture from composite canvas
              const texture = new THREE.CanvasTexture(canvas);
              texture.colorSpace = THREE.SRGBColorSpace;
              texture.minFilter = THREE.LinearMipmapLinearFilter;
              texture.magFilter = THREE.LinearFilter;
              texture.generateMipmaps = true;
              texture.anisotropy = rendererRef.current?.capabilities.getMaxAnisotropy() || 16;
              texture.needsUpdate = true;
              
              // Cache the texture
              loadedTexturesRef.current.set(cacheKey, texture);
              
              // Update material
              if (materialsRef.current[faceIndex]) {
                const oldMap = materialsRef.current[faceIndex].map;
                materialsRef.current[faceIndex].map = texture;
                materialsRef.current[faceIndex].needsUpdate = true;
                
                // Dispose old texture if it's not cached
                if (oldMap && oldMap !== texture && !Array.from(loadedTexturesRef.current.values()).includes(oldMap)) {
                  oldMap.dispose();
                }
              }
              
              console.log(`Composited ${face} at level ${level} (${tilesPerSide}x${tilesPerSide} tiles, ${faceSize}x${faceSize}px)`);
            }
          };
          
          img.onerror = () => {
            console.error(`Failed to load tile: ${face}_l${level}_${x}_${y}.jpg`);
            tilesLoaded++;
            
            // Still create texture even if some tiles fail
            if (tilesLoaded === totalTiles) {
              const texture = new THREE.CanvasTexture(canvas);
              texture.colorSpace = THREE.SRGBColorSpace;
              texture.minFilter = THREE.LinearMipmapLinearFilter;
              texture.magFilter = THREE.LinearFilter;
              texture.generateMipmaps = true;
              
              loadedTexturesRef.current.set(cacheKey, texture);
              
              if (materialsRef.current[faceIndex]) {
                materialsRef.current[faceIndex].map = texture;
                materialsRef.current[faceIndex].needsUpdate = true;
              }
            }
          };
          
          img.src = tileUrl;
        }
      }
    });
  }, [manifest, currentScene.id]);

  // Load cube map tiles
  useEffect(() => {
    if (!manifest || !sceneRef.current) return;

    // Only show loading state on initial load, not during transitions
    if (!isNavigatingRef.current && !isTransitioning) {
      setIsLoading(true);
    }
    
    // Create cube geometry
    const geometry = new THREE.BoxGeometry(100, 100, 100);
    geometry.scale(-1, 1, 1); // Invert for inside view
    geometry.rotateX(Math.PI); // Rotate 180 degrees around X axis to fix upside-down issue
    
    // Load textures for each face
    const loader = new THREE.TextureLoader();
    const materials: THREE.MeshBasicMaterial[] = [];
    materialsRef.current = materials;
    
    // Face order for Three.js BoxGeometry: +X, -X, +Y, -Y, +Z, -Z
    // This matches how Three.js expects cube map faces
    const faceOrder = [
      CubeFace.RIGHT,  // +X
      CubeFace.LEFT,   // -X
      CubeFace.TOP,    // +Y
      CubeFace.BOTTOM, // -Y
      CubeFace.FRONT,  // +Z
      CubeFace.BACK    // -Z
    ];
    
    // Start with level 0 for quick loading
    const level = 0;
    
    let loadedCount = 0;
    faceOrder.forEach(face => {
      // Build URL for this face at level 0, tile 0,0
      const tileUrl = `https://test.thenimto.com/scenes/${currentScene.id}/tiles/${face}_l${level}_0_0.jpg`;
      
      const texture = loader.load(
        tileUrl,
        () => {
          loadedCount++;
          if (loadedCount === 6) {
            // Remove old cube when transitioning and new one is ready
            if (isTransitioning && sceneRef.current) {
              // Remove all existing cubes to prevent overlap
              const existingCubes = sceneRef.current.children.filter(
                child => child instanceof THREE.Mesh && child.geometry instanceof THREE.BoxGeometry
              );
              existingCubes.forEach(cube => {
                if (cube !== cubeRef.current) {
                  sceneRef.current!.remove(cube);
                }
              });
            }
            
            setIsLoading(false);
            // Automatically load higher quality levels progressively
            // Note: We're using the manifest from the effect's dependency, which should be current
            if (manifest && manifest.levels && manifest.levels.length > 1) {
              // Load level 1 immediately for better default quality
              setTimeout(() => {
                console.log('Auto-loading level 1 for better quality');
                loadCubeMapLevel(1);
                setCurrentLevel(1);
                
                // Pre-load level 2 after level 1 is loaded
                if (manifest.levels.length > 2) {
                  setTimeout(() => {
                    console.log('Pre-loading level 2 in background');
                    loadCubeMapLevel(2);
                    
                    // Pre-load level 3 for maximum quality
                    if (manifest.levels.length > 3) {
                      setTimeout(() => {
                        console.log('Pre-loading level 3 for maximum quality');
                        loadCubeMapLevel(3);
                      }, 1500);
                    }
                  }, 1000);
                }
              }, 100);
            }
          }
        },
        undefined,
        (error) => {
          console.error(`Failed to load cube face ${face}:`, error);
          loadedCount++;
          if (loadedCount === 6) {
            setIsLoading(false);
          }
        }
      );
      
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = true;
      texture.anisotropy = rendererRef.current?.capabilities.getMaxAnisotropy() || 1;
      
      materials.push(new THREE.MeshBasicMaterial({ 
        map: texture,
        side: THREE.FrontSide // Use FrontSide since geometry is inverted
      }));
    });
    
    // Create cube mesh
    const cube = new THREE.Mesh(geometry, materials);
    sceneRef.current.add(cube);
    cubeRef.current = cube;
    
    // Cleanup
    return () => {
      // Don't remove cube during transitions to prevent white screen
      if (sceneRef.current && cubeRef.current && !isTransitioning) {
        sceneRef.current.remove(cubeRef.current);
        cubeRef.current = null; // Clear the reference
      }
      materials.forEach(mat => {
        if (mat.map) mat.map.dispose();
        mat.dispose();
      });
      geometry.dispose();
    };
  }, [manifest, currentScene.id, loadCubeMapLevel, isTransitioning]);

  // Render hotspots
  useEffect(() => {
    if (!hotspotsRef.current || !sceneRef.current) return;
    
    // Clear existing hotspots
    while (hotspotsRef.current.children.length > 0) {
      const child = hotspotsRef.current.children[0];
      hotspotsRef.current.remove(child);
      if (child instanceof THREE.Mesh || child instanceof THREE.Sprite) {
        if ('geometry' in child) (child.geometry as THREE.BufferGeometry).dispose();
        if ('material' in child) {
          const material = child.material as THREE.Material;
          if ('map' in material && material.map) material.map.dispose();
          material.dispose();
        }
      }
    }
    
    // Add new hotspots
    hotspots.forEach((hotspot) => {
      // Convert yaw/pitch to 3D position
      const yaw = (hotspot.yaw || 0) * Math.PI / 180;
      const pitch = (hotspot.pitch || 0) * Math.PI / 180;
      
      // Parse payload to check for ground flag or other settings
      let parsedPayload: any = {};
      try {
        if (hotspot.payload) {
          parsedPayload = JSON.parse(hotspot.payload);
        }
      } catch (e) {
        // Payload parsing failed, continue with defaults
      }
      
      // Check if this is a ground/floor hotspot
      // Only treat as ground if explicitly marked or pitch is very low (< -45°)
      const isGroundHotspot = 
        parsedPayload.ground === true || 
        parsedPayload.isFloor === true ||
        hotspot.kind === 'navigation'
        // pitch < -45 * Math.PI / 180; // Only very low pitch for auto-ground
      
      // Calculate position
      let x, y, z, distance;
      
      if (isGroundHotspot) {
        // Place on the floor plane - visible and clickable
        // distance = 35; // Optimal distance for floor markers
        // const groundPitch = -70 * Math.PI / 180; // Look down angle (70 degrees down)
        // x = distance * Math.cos(groundPitch) * Math.sin(yaw);
        // y = distance * Math.sin(groundPitch); // This will be negative (below eye level)
        // z = distance * Math.cos(groundPitch) * Math.cos(yaw);
        distance = 45; // Place hotspots closer than the cube (which is at 50)
        x = distance * Math.cos(pitch) * Math.sin(yaw);
        y = distance * Math.sin(pitch);
        z = distance * Math.cos(pitch) * Math.cos(yaw);
      } else {
        // Regular floating hotspot
        distance = 45; // Place hotspots closer than the cube (which is at 50)
        x = distance * Math.cos(pitch) * Math.sin(yaw);
        y = distance * Math.sin(pitch);
        z = distance * Math.cos(pitch) * Math.cos(yaw);
      }
      
      // Create hotspot sprite
      const canvas = document.createElement('canvas');
      
      if (isGroundHotspot) {
        // Create circular floor navigation point (like Matterport)
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        
        if (ctx) {
          // Enable antialiasing
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          
          // Clear canvas with transparency
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          
          // Draw outer glow ring (will pulse on hover)
          const glowGradient = ctx.createRadialGradient(256, 256, 120, 256, 256, 200);
          glowGradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
          glowGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.2)');
          glowGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
          ctx.fillStyle = glowGradient;
          ctx.beginPath();
          ctx.arc(256, 256, 200, 0, Math.PI * 2);
          ctx.fill();
          
          // Draw main circle with gradient
          const mainGradient = ctx.createRadialGradient(256, 256, 0, 256, 256, 120);
          mainGradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
          mainGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.95)');
          mainGradient.addColorStop(0.8, 'rgba(255, 255, 255, 0.8)');
          mainGradient.addColorStop(1, 'rgba(255, 255, 255, 0.6)');
          ctx.fillStyle = mainGradient;
          ctx.beginPath();
          ctx.arc(256, 256, 120, 0, Math.PI * 2);
          ctx.fill();
          
          // Add border ring
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(256, 256, 120, 0, Math.PI * 2);
          ctx.stroke();
          
          // Draw inner bright circle
          const innerGradient = ctx.createRadialGradient(256, 256, 0, 256, 256, 60);
          innerGradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
          innerGradient.addColorStop(1, 'rgba(255, 255, 255, 0.9)');
          ctx.fillStyle = innerGradient;
          ctx.beginPath();
          ctx.arc(256, 256, 60, 0, Math.PI * 2);
          ctx.fill();
          
          // Draw arrow or icon in center
          ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
          ctx.font = 'bold 80px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          if (hotspot.kind === 'navigation' || isGroundHotspot) {
            // Draw arrow pointing forward - bigger and clearer
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.lineWidth = 8;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            // Arrow shaft
            ctx.moveTo(256, 296);
            ctx.lineTo(256, 216);
            // Arrow head
            ctx.moveTo(236, 236);
            ctx.lineTo(256, 216);
            ctx.lineTo(276, 236);
            ctx.stroke();
          } else {
            const icon = hotspot.kind === 'info' ? 'i' : '●';
            ctx.fillText(icon, 256, 256);
          }
        }
      } else {
        // Regular floating hotspot
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        
        if (ctx) {
          // Enable antialiasing
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          
          // Draw hotspot icon based on type
          ctx.fillStyle = hotspot.kind === 'navigation' ? '#4CAF50' : 
                         hotspot.kind === 'info' ? '#2196F3' : '#FFC107';
          ctx.beginPath();
          ctx.arc(128, 128, 64, 0, Math.PI * 2);
          ctx.fill();
          
          // Add border for better visibility
          ctx.strokeStyle = 'white';
          ctx.lineWidth = 4;
          ctx.stroke();
          
          // Add label if available
          if (parsedPayload.label) {
            // Draw label background
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.roundRect(20, 180, 216, 40, 10);
            ctx.fill();
            
            // Draw label text
            ctx.fillStyle = 'white';
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(parsedPayload.label, 128, 200);
          }
          
          // Add icon
          ctx.fillStyle = 'white';
          ctx.font = 'bold 72px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const icon = hotspot.kind === 'navigation' ? '→' :
                      hotspot.kind === 'info' ? 'i' : '🔗';
          ctx.fillText(icon, 128, 128);
        }
      }
      
      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      
      const spriteMaterial = new THREE.SpriteMaterial({ 
        map: texture,
        sizeAttenuation: false, // Keep same size regardless of distance
        depthTest: true,
        depthWrite: false,
        transparent: true
      });
      
      const sprite = new THREE.Sprite(spriteMaterial);
      sprite.position.set(x, y, z);
      
      // Check if this hotspot is being edited
      const isHighlighted = highlightedHotspotId === hotspot.id;
      
      // Different scale for ground labels vs floating hotspots
      if (isGroundHotspot) {
        const baseScale = isHighlighted ? 0.2 : 0.15; // Larger when highlighted
        sprite.scale.set(baseScale, baseScale, 1);
        sprite.userData = { 
          hotspot, 
          type: 'hotspot', 
          baseScale: baseScale, 
          isGround: true,
          glowIntensity: isHighlighted ? 1 : 0,
          targetGlow: isHighlighted ? 1 : 0,
          isHighlighted
        };
        
        // Make sure it's visible
        sprite.renderOrder = isHighlighted ? 2 : 1; // Higher render order when highlighted
      } else {
        const baseScale = isHighlighted ? 0.075 : 0.05; // Larger when highlighted
        sprite.scale.set(baseScale, baseScale, 1);
        sprite.userData = { 
          hotspot, 
          type: 'hotspot', 
          baseScale: baseScale, 
          isGround: false,
          isHighlighted
        };
      }
      
      // Add pulsing effect for highlighted hotspots
      if (isHighlighted) {
        sprite.material.opacity = 1;
      }
      
      hotspotsRef.current.add(sprite);
    });
  }, [hotspots, highlightedHotspotId]);

  // Render overlays
  useEffect(() => {
    if (!overlaysRef.current || !sceneRef.current) return;
    
    // Clear existing overlays
    while (overlaysRef.current.children.length > 0) {
      const child = overlaysRef.current.children[0];
      overlaysRef.current.remove(child);
      if (child instanceof THREE.Mesh) {
        (child.geometry as THREE.BufferGeometry).dispose();
        (child.material as THREE.Material).dispose();
      }
    }
    
    // Add new overlays
    overlays.forEach((overlay) => {
      // Parse payload to get overlay properties
      let overlayData: any = {};
      try {
        if (overlay.payload) {
          overlayData = JSON.parse(overlay.payload);
        }
      } catch (e) {
        console.warn('Failed to parse overlay payload:', e);
      }
      
      // Convert position to 3D using yaw/pitch from overlay
      const yaw = (overlay.yaw || 0) * Math.PI / 180;
      const pitch = (overlay.pitch || 0) * Math.PI / 180;
      
      const distance = 40; // Place overlays even closer
      const x = distance * Math.cos(pitch) * Math.sin(yaw);
      const y = distance * Math.sin(pitch);
      const z = distance * Math.cos(pitch) * Math.cos(yaw);
      
      // Create overlay plane with size from payload or defaults, max 300x300
      const width = Math.min(overlayData.width || 300, 300);
      const height = Math.min(overlayData.height || 300, 300);
      const geometry = new THREE.PlaneGeometry(
        width / 100,
        height / 100
      );
      
      // Create material based on overlay kind
      let material: THREE.Material;
      if (overlay.kind === 'text') {
        // Text overlay - Show icon initially, full text on hover
        const iconSize = 128;
        const iconCanvas = document.createElement('canvas');
        iconCanvas.width = iconSize;
        iconCanvas.height = iconSize;
        const iconCtx = iconCanvas.getContext('2d');
        
        if (iconCtx) {
          // Clear with transparency
          iconCtx.clearRect(0, 0, iconSize, iconSize);
          
          // Draw circular background
          const gradient = iconCtx.createRadialGradient(iconSize/2, iconSize/2, 0, iconSize/2, iconSize/2, iconSize/2);
          gradient.addColorStop(0, 'rgba(33, 150, 243, 0.95)');
          gradient.addColorStop(1, 'rgba(30, 136, 229, 0.9)');
          
          iconCtx.fillStyle = gradient;
          iconCtx.beginPath();
          iconCtx.arc(iconSize/2, iconSize/2, iconSize/2 - 5, 0, Math.PI * 2);
          iconCtx.fill();
          
          // Add border
          iconCtx.strokeStyle = 'white';
          iconCtx.lineWidth = 3;
          iconCtx.stroke();
          
          // Draw text icon
          iconCtx.fillStyle = 'white';
          iconCtx.font = 'bold 48px Arial';
          iconCtx.textAlign = 'center';
          iconCtx.textBaseline = 'middle';
          iconCtx.fillText('💬', iconSize/2, iconSize/2);
        }
        
        // Create expanded canvas for hover (max 300x300)
        const expandedCanvas = document.createElement('canvas');
        expandedCanvas.width = Math.min(width, 300);
        expandedCanvas.height = Math.min(height, 300);
        const expandedCtx = expandedCanvas.getContext('2d');
        
        if (expandedCtx) {
          // Clear with transparency
          expandedCtx.clearRect(0, 0, expandedCanvas.width, expandedCanvas.height);
          
          // Draw background with gradient
          const gradient = expandedCtx.createLinearGradient(0, 0, 0, expandedCanvas.height);
          gradient.addColorStop(0, overlayData.background_color || 'rgba(0, 0, 0, 0.85)');
          gradient.addColorStop(1, overlayData.background_color || 'rgba(0, 0, 0, 0.95)');
          
          expandedCtx.fillStyle = gradient;
          expandedCtx.roundRect(10, 10, expandedCanvas.width - 20, expandedCanvas.height - 20, 15);
          expandedCtx.fill();
          
          // Add subtle border
          expandedCtx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
          expandedCtx.lineWidth = 2;
          expandedCtx.stroke();
          
          // Draw text with better formatting (adjusted for 300x300)
          expandedCtx.fillStyle = overlayData.text_color || 'white';
          const fontSize = Math.min(overlayData.font_size || 20, 20); // Max font size 20 for 300x300
          expandedCtx.font = `bold ${fontSize}px Arial`;
          expandedCtx.textAlign = 'center';
          expandedCtx.textBaseline = 'middle';
          expandedCtx.shadowColor = 'rgba(0, 0, 0, 0.5)';
          expandedCtx.shadowBlur = 4;
          
          // Get text from payload
          const text = overlayData.text || overlayData.content || 'Text Overlay';
          
          // Word wrap if text is long
          const maxWidth = expandedCanvas.width - 40; // Less padding for 300x300
          const words = text.split(' ');
          const lines: string[] = [];
          let currentLine = '';
          
          words.forEach((word: string) => {
            const testLine = currentLine + (currentLine ? ' ' : '') + word;
            const metrics = expandedCtx.measureText(testLine);
            if (metrics.width > maxWidth && currentLine) {
              lines.push(currentLine);
              currentLine = word;
            } else {
              currentLine = testLine;
            }
          });
          if (currentLine) lines.push(currentLine);
          
          // Limit lines to fit in 300x300
          const maxLines = Math.floor((expandedCanvas.height - 40) / (fontSize * 1.3));
          const displayLines = lines.slice(0, maxLines);
          if (lines.length > maxLines) {
            displayLines[maxLines - 1] = displayLines[maxLines - 1].substring(0, displayLines[maxLines - 1].length - 3) + '...';
          }
          
          // Draw lines
          const lineHeight = fontSize * 1.3;
          const startY = expandedCanvas.height / 2 - ((displayLines.length - 1) * lineHeight) / 2;
          displayLines.forEach((line, i) => {
            expandedCtx.fillText(
              line,
              expandedCanvas.width / 2,
              startY + (i * lineHeight)
            );
          });
          
          expandedCtx.shadowColor = 'transparent';
        }
        
        const iconTexture = new THREE.CanvasTexture(iconCanvas);
        const expandedTexture = new THREE.CanvasTexture(expandedCanvas);
        
        material = new THREE.MeshBasicMaterial({
          map: iconTexture,
          transparent: true,
          side: THREE.DoubleSide,
          opacity: 0.95
        });
        
        // Store textures for switching
        (material as any).__iconTexture = iconTexture;
        (material as any).__expandedTexture = expandedTexture;
      } else if (overlay.kind === 'badge' || overlay.kind === 'tooltip') {
        // Badge or tooltip overlay
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          
          // Draw badge/tooltip background
          const bgColor = overlay.kind === 'badge' 
            ? (overlayData.background_color || 'rgba(255, 87, 34, 0.9)')  // Orange for badge
            : (overlayData.background_color || 'rgba(33, 33, 33, 0.95)'); // Dark for tooltip
            
          ctx.fillStyle = bgColor;
          ctx.roundRect(5, 5, canvas.width - 10, canvas.height - 10, 15);
          ctx.fill();
          
          // Add border for badges
          if (overlay.kind === 'badge') {
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 3;
            ctx.stroke();
          }
          
          // Draw text
          ctx.fillStyle = overlayData.text_color || 'white';
          ctx.font = `bold ${overlayData.font_size || 20}px Arial`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          const text = overlayData.text || overlayData.label || overlay.kind;
          ctx.fillText(text, canvas.width / 2, canvas.height / 2);
        }
        
        const texture = new THREE.CanvasTexture(canvas);
        material = new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          side: THREE.DoubleSide
        });
      } else if (overlay.kind === 'image') {
        // Image overlay - Show icon initially, full content on hover
        
        // Create icon canvas (small size for initial display)
        const iconSize = 128;
        const iconCanvas = document.createElement('canvas');
        iconCanvas.width = iconSize;
        iconCanvas.height = iconSize;
        const iconCtx = iconCanvas.getContext('2d');
        
        if (iconCtx) {
          // Clear with transparency
          iconCtx.clearRect(0, 0, iconSize, iconSize);
          
          // Draw circular background with gradient
          const gradient = iconCtx.createRadialGradient(iconSize/2, iconSize/2, 0, iconSize/2, iconSize/2, iconSize/2);
          gradient.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
          gradient.addColorStop(1, 'rgba(240, 240, 240, 0.9)');
          
          iconCtx.fillStyle = gradient;
          iconCtx.beginPath();
          iconCtx.arc(iconSize/2, iconSize/2, iconSize/2 - 5, 0, Math.PI * 2);
          iconCtx.fill();
          
          // Add border
          iconCtx.strokeStyle = 'rgba(0, 123, 255, 0.8)';
          iconCtx.lineWidth = 3;
          iconCtx.stroke();
          
          // Draw image icon
          iconCtx.fillStyle = '#007BFF';
          iconCtx.font = 'bold 48px Arial';
          iconCtx.textAlign = 'center';
          iconCtx.textBaseline = 'middle';
          iconCtx.fillText('🖼️', iconSize/2, iconSize/2);
        }
        
        // Create expanded canvas for hover state (max 300x300)
        const expandedCanvas = document.createElement('canvas');
        expandedCanvas.width = Math.min(width, 300);
        expandedCanvas.height = Math.min(height, 300);
        const expandedCtx = expandedCanvas.getContext('2d');
        
        // Store both canvases for switching
        let currentTexture = new THREE.CanvasTexture(iconCanvas);
        let expandedTexture: THREE.CanvasTexture | null = null;
        let imageLoaded = false;
        
        // Load full content for hover state
        if (overlayData.imageUrl && expandedCtx) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          
          img.onload = () => {
            // Clear canvas
            expandedCtx.clearRect(0, 0, expandedCanvas.width, expandedCanvas.height);
            
            // Draw semi-transparent dark background
            expandedCtx.fillStyle = 'rgba(0, 0, 0, 0.85)';
            expandedCtx.roundRect(10, 10, expandedCanvas.width - 20, expandedCanvas.height - 20, 15);
            expandedCtx.fill();
            
            // Draw white content area
            expandedCtx.fillStyle = 'rgba(255, 255, 255, 0.95)';
            expandedCtx.roundRect(20, 20, expandedCanvas.width - 40, expandedCanvas.height - 40, 10);
            expandedCtx.fill();
            
            const padding = 20; // Smaller padding for 300x300 constraint
            const titleHeight = overlayData.title ? 35 : 0;
            const descHeight = overlayData.description ? 25 : 0;
            const imageAreaHeight = expandedCanvas.height - padding * 2 - titleHeight - descHeight;
            const imageAreaWidth = expandedCanvas.width - padding * 2;
            
            // Draw title with appropriate font size for 300x300
            let currentY = padding + 5;
            if (overlayData.title) {
              expandedCtx.fillStyle = '#1a1a1a';
              expandedCtx.font = 'bold 18px Arial';
              expandedCtx.textAlign = 'center';
              
              // Truncate title if too long
              let title = overlayData.title;
              if (title.length > 30) {
                title = title.substring(0, 27) + '...';
              }
              
              expandedCtx.fillText(title, expandedCanvas.width / 2, currentY + 12);
              currentY += titleHeight;
            }
            
            // Calculate image scaling
            const scale = Math.min(
              imageAreaWidth / img.width,
              imageAreaHeight / img.height,
              1 // Don't upscale
            );
            const imgWidth = img.width * scale;
            const imgHeight = img.height * scale;
            const imgX = (expandedCanvas.width - imgWidth) / 2;
            const imgY = currentY + (imageAreaHeight - imgHeight) / 2;
            
            // Draw image with shadow
            expandedCtx.shadowColor = 'rgba(0, 0, 0, 0.4)';
            expandedCtx.shadowBlur = 15;
            expandedCtx.shadowOffsetX = 0;
            expandedCtx.shadowOffsetY = 4;
            expandedCtx.drawImage(img, imgX, imgY, imgWidth, imgHeight);
            expandedCtx.shadowColor = 'transparent';
            
            // Draw description with smaller font
            if (overlayData.description) {
              expandedCtx.fillStyle = '#555';
              expandedCtx.font = '14px Arial';
              expandedCtx.textAlign = 'center';
              
              // Truncate description if too long
              let desc = overlayData.description;
              if (desc.length > 40) {
                desc = desc.substring(0, 37) + '...';
              }
              
              expandedCtx.fillText(
                desc, 
                expandedCanvas.width / 2, 
                expandedCanvas.height - padding - 5
              );
            }
            
            // Add "Click to open" hint if clickable
            if (overlayData.clickable) {
              expandedCtx.fillStyle = 'rgba(0, 123, 255, 0.9)';
              expandedCtx.font = 'italic 11px Arial';
              expandedCtx.textAlign = 'center';
              expandedCtx.fillText(
                '🔗 Click to open', 
                expandedCanvas.width / 2, 
                expandedCanvas.height - 5
              );
            }
            
            expandedTexture = new THREE.CanvasTexture(expandedCanvas);
            imageLoaded = true;
          };
          
          img.onerror = () => {
            console.error('Failed to load image:', overlayData.imageUrl);
            // Create error state for expanded view
            expandedCtx.fillStyle = 'rgba(244, 67, 54, 0.9)';
            expandedCtx.roundRect(10, 10, expandedCanvas.width - 20, expandedCanvas.height - 20, 10);
            expandedCtx.fill();
            
            expandedCtx.fillStyle = 'white';
            expandedCtx.font = 'bold 24px Arial';
            expandedCtx.textAlign = 'center';
            expandedCtx.fillText('Failed to Load Image', expandedCanvas.width / 2, expandedCanvas.height / 2);
            
            expandedTexture = new THREE.CanvasTexture(expandedCanvas);
          };
          
          img.src = overlayData.imageUrl;
        }
        
        // Create material with icon texture initially
        material = new THREE.MeshBasicMaterial({
          map: currentTexture,
          transparent: true,
          side: THREE.DoubleSide,
          opacity: 0.9
        });
        
        // Store references for hover switching
        (material as any).__iconTexture = currentTexture;
        (material as any).__expandedTexture = expandedTexture;
        (material as any).__expandedCanvas = expandedCanvas;
        (material as any).__expandedCtx = expandedCtx;
      } else {
        // Default material for unsupported types
        material = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.8,
          side: THREE.DoubleSide
        });
      }
      
      // Use smaller geometry for icons
      let meshGeometry = geometry;
      let meshScale = { x: width / 100, y: height / 100 };
      
      if (overlay.kind === 'image' || overlay.kind === 'text') {
        // Create smaller geometry for icon (responsive to screen)
        const screenWidth = window.innerWidth;
        let iconSize = 0.8; // Default icon size
        
        if (screenWidth < 768) {
          iconSize = 0.5; // Smaller on mobile
        } else if (screenWidth < 1024) {
          iconSize = 0.6; // Medium on tablet
        }
        
        meshGeometry = new THREE.PlaneGeometry(iconSize, iconSize);
        meshScale = { x: iconSize, y: iconSize };
      }
      
      const mesh = new THREE.Mesh(meshGeometry, material);
      mesh.position.set(x, y, z);
      mesh.lookAt(0, 0, 0);
      
      mesh.userData = { 
        overlay, 
        type: 'overlay', 
        baseScale: meshScale,
        clickable: overlayData.clickable,
        clickUrl: overlayData.clickUrl,
        isIcon: overlay.kind === 'image' || overlay.kind === 'text',
        expandedScale: { x: width / 100, y: height / 100 },
        isExpanded: false,
        overlayData: overlayData
      };
      
      // Store mesh reference for hover state management
      if (overlay.kind === 'image' || overlay.kind === 'text') {
        (mesh as any).__isExpandableOverlay = true;
      }
      
      overlaysRef.current.add(mesh);
    });
  }, [overlays]);

  // Mouse controls
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onPointerDown = (event: PointerEvent) => {
      event.preventDefault();
      const controls = controlsRef.current;
      
      // Check for hotspot/overlay clicks (now works in both edit and view modes)
      if (hotspots.length > 0 || overlays.length > 0) {
        const rect = container.getBoundingClientRect();
        mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        if (cameraRef.current && sceneRef.current) {
          raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
          
          // Check overlays first (they're in front)
          if (overlaysRef.current) {
            const overlayIntersects = raycasterRef.current.intersectObjects(
              overlaysRef.current.children,
              true
            );
            
            if (overlayIntersects.length > 0) {
              const clickedObject = overlayIntersects[0].object as THREE.Mesh;
              const overlayData = clickedObject.userData;
              
              // Handle clickable overlays
              if (overlayData.clickable && overlayData.clickUrl) {
                window.open(overlayData.clickUrl, '_blank', 'noopener,noreferrer');
                return;
              }
            }
          }
          
          // Check hotspots
          if (hotspotsRef.current) {
            const hotspotIntersects = raycasterRef.current.intersectObjects(
              hotspotsRef.current.children,
              true
            );
            
            if (hotspotIntersects.length > 0) {
              const clickedObject = hotspotIntersects[0].object as THREE.Sprite;
              const hotspot = clickedObject.userData.hotspot;
              
              // Handle navigation - move close to hotspot then load new scene
              if (hotspot && hotspot.kind === 'navigation') {
                // Set transitioning state
                setIsTransitioning(true);
                setLoadingProgress(0);
                
                // Don't trigger scene change yet - wait until after animation
                console.log('Navigation hotspot clicked, will load after animation:', hotspot);
                
                // Store initial camera state
                const startFov = cameraRef.current!.fov;
                const startScale = cubeRef.current?.scale.x || 1;
                const startLon = controls.lon;
                const startLat = controls.lat;
                
                // Calculate direction to hotspot - align camera with hotspot position
                const hotspotYaw = (hotspot.yaw || 0); // In degrees
                const hotspotPitch = (hotspot.pitch || 0); // In degrees
                
                // Convert hotspot position to 3D coordinates (same as hotspot rendering)
                const yawRad = hotspotYaw * Math.PI / 180;
                const pitchRad = hotspotPitch * Math.PI / 180;
                const distance = 45; // Same as hotspot distance
                const hx = distance * Math.cos(pitchRad) * Math.sin(yawRad);
                const hy = distance * Math.sin(pitchRad);
                const hz = distance * Math.cos(pitchRad) * Math.cos(yawRad);
                
                // Calculate camera angles to look at this 3D position
                // Using atan2 to get the correct angle
                let targetLon = Math.atan2(hx, hz) * 180 / Math.PI;
                const targetLat = Math.atan2(hy, Math.sqrt(hx * hx + hz * hz)) * 180 / Math.PI;
                
                // Limit the rotation to maximum 30 degrees in any direction
                const maxRotation = 30;
                let lonDiff = targetLon - startLon;
                
                // Normalize angle difference to [-180, 180]
                while (lonDiff > 180) lonDiff -= 360;
                while (lonDiff < -180) lonDiff += 360;
                
                // Clamp rotation to max 30 degrees
                if (Math.abs(lonDiff) > maxRotation) {
                  lonDiff = lonDiff > 0 ? maxRotation : -maxRotation;
                }
                targetLon = startLon + lonDiff;
                
                // Animation settings - smooth movement toward hotspot (1.5 seconds as requested)
                const moveDuration = 1500; // 1.5 seconds for smooth transition
                const startTime = Date.now();
                
                // Disable user interaction during animation
                controls.isUserInteracting = true;
                isNavigatingRef.current = true; // Mark as navigating
                
                const animateToHotspot = () => {
                  const elapsed = Date.now() - startTime;
                  const progress = Math.min(elapsed / moveDuration, 1);
                  
                  // Very smooth easing - ease in and out
                  const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;
                  const easedProgress = easeInOutSine(progress);
                  
                  // Slightly turn toward the hotspot (limited rotation)
                  controls.lon = startLon + (targetLon - startLon) * easedProgress;
                  controls.lat = startLat + (targetLat - startLat) * easedProgress * 0.5; // Even less vertical rotation
                  
                  // Strong zoom to get very close to hotspot
                  const targetFov = 20; // Slightly less aggressive zoom
                  if (cameraRef.current) {
                    cameraRef.current.fov = startFov + (targetFov - startFov) * easedProgress;
                    cameraRef.current.updateProjectionMatrix();
                  }
                  
                  // Move very close to the hotspot
                  if (cubeRef.current) {
                    const targetScale = startScale * 0.6; // Move closer to hotspot
                    const scale = startScale + (targetScale - startScale) * easedProgress;
                    cubeRef.current.scale.set(scale, scale, scale);
                  }
                  
                  // Don't fade - keep old scene visible
                  // Remove opacity changes to prevent any darkening
                  
                  // Update loading progress for UI
                  setLoadingProgress(Math.floor(progress * 100));
                  
                  if (progress < 1) {
                    requestAnimationFrame(animateToHotspot);
                  } else {
                    // Movement complete - NOW trigger scene change
                    console.log('Animation complete, triggering scene change:', hotspot);
                    
                    // Trigger the scene change after animation
                    if (onHotspotClick) {
                      onHotspotClick(hotspot);
                    }
                    
                    // Mark navigation complete
                    isNavigatingRef.current = false;
                    
                    // Reset camera and controls for new scene
                    if (cameraRef.current) {
                      cameraRef.current.fov = 60;
                      cameraRef.current.updateProjectionMatrix();
                    }
                    if (cubeRef.current) {
                      cubeRef.current.scale.set(1, 1, 1);
                    }
                    
                    // Reset controls to neutral position for new scene
                    controls.lon = 0;
                    controls.lat = 0;
                    controls.isUserInteracting = false;
                    
                    // Reset transitioning state
                    setTimeout(() => {
                      setIsTransitioning(false);
                      setLoadingProgress(0);
                    }, 200);
                  }
                };
                
                animateToHotspot();
                return;
              }
              
              // Handle other hotspot types (info, link)
              if (hotspot && onHotspotClick) {
                onHotspotClick(hotspot);
                return;
              }
            }
          }
          
          // Check overlays
          if (overlaysRef.current) {
            const overlayIntersects = raycasterRef.current.intersectObjects(
              overlaysRef.current.children,
              true
            );
            
            if (overlayIntersects.length > 0) {
              const overlay = overlayIntersects[0].object.userData.overlay;
              // Handle overlay click if needed
              console.log('Overlay clicked:', overlay);
            }
          }
        }
      }
      
      // Edit mode: create hotspot with Shift + Click (matching your editor controls)
      if (isEditMode && event.shiftKey) {
        const rect = container.getBoundingClientRect();
        mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        if (cameraRef.current) {
          // Calculate yaw/pitch from click position on the sphere
          const vector = new THREE.Vector3(mouseRef.current.x, mouseRef.current.y, 0.5);
          vector.unproject(cameraRef.current);
          vector.sub(cameraRef.current.position).normalize();
          
          // Convert to spherical coordinates
          const yaw = Math.atan2(vector.x, vector.z) * 180 / Math.PI;
          const pitch = Math.asin(vector.y) * 180 / Math.PI;
          
          if (onHotspotCreate) {
            onHotspotCreate(yaw, pitch);
            
            // Visual feedback - create temporary marker
            const tempMarker = document.createElement('div');
            tempMarker.style.position = 'absolute';
            tempMarker.style.left = `${event.clientX - rect.left - 10}px`;
            tempMarker.style.top = `${event.clientY - rect.top - 10}px`;
            tempMarker.style.width = '20px';
            tempMarker.style.height = '20px';
            tempMarker.style.borderRadius = '50%';
            tempMarker.style.backgroundColor = '#4CAF50';
            tempMarker.style.animation = 'pulse 0.5s ease-out';
            tempMarker.style.pointerEvents = 'none';
            container.appendChild(tempMarker);
            
            setTimeout(() => container.removeChild(tempMarker), 500);
          }
        }
        return; // Don't start camera rotation when placing hotspot
      }
      
      controls.isUserInteracting = true;
      controls.onPointerDownX = event.clientX;
      controls.onPointerDownY = event.clientY;
      controls.onPointerDownLon = controls.lon;
      controls.onPointerDownLat = controls.lat;
    };

    const onPointerMove = (event: PointerEvent) => {
      const controls = controlsRef.current;
      
      // Check for hotspot/overlay hover
      if (!isEditMode && cameraRef.current) {
        const rect = container.getBoundingClientRect();
        mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
        
        let foundHoverable = false;
        
        // Check overlay hover first
        if (overlaysRef.current) {
          const overlayIntersects = raycasterRef.current.intersectObjects(overlaysRef.current.children, true);
          
          // Handle unhover for all overlays
          overlaysRef.current.children.forEach((child) => {
            if (child instanceof THREE.Mesh && child.userData.isIcon && child.userData.isExpanded) {
              // Check if this overlay is not being hovered
              const isHovered = overlayIntersects.some(int => int.object === child);
              if (!isHovered) {
                // Collapse back to icon
                child.userData.isExpanded = false;
                const material = child.material as THREE.MeshBasicMaterial;
                
                // Switch back to icon texture
                if ((material as any).__iconTexture) {
                  material.map = (material as any).__iconTexture;
                  material.needsUpdate = true;
                }
                
                // Reset geometry to icon size (responsive)
                const screenWidth = window.innerWidth;
                let iconSize = 0.8;
                
                if (screenWidth < 768) {
                  iconSize = 0.5;
                } else if (screenWidth < 1024) {
                  iconSize = 0.6;
                }
                
                const iconGeometry = new THREE.PlaneGeometry(iconSize, iconSize);
                child.geometry.dispose();
                child.geometry = iconGeometry;
                
                // Reset scale
                child.scale.set(1, 1, 1);
              }
            }
          });
          
          // Handle hover
          if (overlayIntersects.length > 0) {
            const hoveredObject = overlayIntersects[0].object as THREE.Mesh;
            
            // Expand image overlays on hover
            if (hoveredObject.userData.isIcon && !hoveredObject.userData.isExpanded) {
              hoveredObject.userData.isExpanded = true;
              const material = hoveredObject.material as THREE.MeshBasicMaterial;
              
              // Calculate responsive size based on screen dimensions
              const screenWidth = window.innerWidth;
              const screenHeight = window.innerHeight;
              
              // Scale factor based on screen size (smaller screens get smaller overlays)
              let sizeFactor = 1;
              if (screenWidth < 768) {
                sizeFactor = 0.6; // Mobile
              } else if (screenWidth < 1024) {
                sizeFactor = 0.75; // Tablet
              } else if (screenWidth < 1440) {
                sizeFactor = 0.85; // Small desktop
              }
              
              // Apply max size of 300x300 with screen size factor
              const maxSize = 300 * sizeFactor / 100; // Convert to Three.js units
              const expandedWidth = Math.min(hoveredObject.userData.expandedScale.x, maxSize);
              const expandedHeight = Math.min(hoveredObject.userData.expandedScale.y, maxSize);
              
              // Wait a bit for the texture to load
              setTimeout(() => {
                // Switch to expanded texture if available
                if ((material as any).__expandedTexture) {
                  material.map = (material as any).__expandedTexture;
                  material.needsUpdate = true;
                } else if ((material as any).__expandedCanvas && (material as any).__expandedCtx) {
                  // Create expanded texture if not ready yet
                  const expandedTexture = new THREE.CanvasTexture((material as any).__expandedCanvas);
                  (material as any).__expandedTexture = expandedTexture;
                  material.map = expandedTexture;
                  material.needsUpdate = true;
                }
                
                // Update geometry to expanded size with responsive dimensions
                const expandedGeometry = new THREE.PlaneGeometry(
                  expandedWidth,
                  expandedHeight
                );
                hoveredObject.geometry.dispose();
                hoveredObject.geometry = expandedGeometry;
                
                // Store actual expanded size for later use
                hoveredObject.userData.currentExpandedScale = {
                  x: expandedWidth,
                  y: expandedHeight
                };
                
                // Animate expansion
                hoveredObject.scale.set(1, 1, 1);
              }, 100);
            }
            
            if (hoveredObject.userData.clickable) {
              container.style.cursor = 'pointer';
              foundHoverable = true;
            }
          }
        }
        
        // Check hotspot hover
        if (!foundHoverable && hotspotsRef.current) {
          const intersects = raycasterRef.current.intersectObjects(hotspotsRef.current.children, true);
          
          // Reset previous hover
          if (hoveredHotspotRef.current && hoveredHotspotRef.current.userData) {
            hoveredHotspotRef.current.userData.targetGlow = 0;
            hoveredHotspotRef.current = null;
          }
          
          // Check for new hover
          if (intersects.length > 0) {
            const hoveredObject = intersects[0].object as THREE.Sprite;
            if (hoveredObject.userData.isGround) {
              hoveredHotspotRef.current = hoveredObject;
              hoveredObject.userData.targetGlow = 1;
              container.style.cursor = 'pointer';
              foundHoverable = true;
            } else if (hoveredObject.userData.hotspot) {
              container.style.cursor = 'pointer';
              foundHoverable = true;
            }
          }
        }
        
        if (!foundHoverable) {
          container.style.cursor = isEditMode ? 'crosshair' : 'grab';
        }
      }
      
      if (!controls.isUserInteracting) return;
      
      controls.lon = (controls.onPointerDownX - event.clientX) * 0.15 + controls.onPointerDownLon;
      controls.lat = (event.clientY - controls.onPointerDownY) * 0.15 + controls.onPointerDownLat;
    };

    const onPointerUp = () => {
      controlsRef.current.isUserInteracting = false;
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (!cameraRef.current) return;
      
      const fov = cameraRef.current.fov + event.deltaY * 0.05;
      cameraRef.current.fov = Math.max(10, Math.min(90, fov)); // Max 90 instead of 100
      cameraRef.current.updateProjectionMatrix();
      
      // Progressive loading based on zoom level - only upgrade, never downgrade quality
      if (manifest && manifest.levels.length > 0) {
        let targetLevel = 0;
        
        // Determine target level based on FOV
        if (cameraRef.current.fov <= 15) {
          targetLevel = Math.min(4, manifest.levels.length - 1); // Extreme quality for maximum zoom
        } else if (cameraRef.current.fov <= 25) {
          targetLevel = Math.min(3, manifest.levels.length - 1); // Maximum quality
        } else if (cameraRef.current.fov <= 40) {
          targetLevel = Math.min(2, manifest.levels.length - 1); // High quality
        } else if (cameraRef.current.fov <= 60) {
          targetLevel = Math.min(1, manifest.levels.length - 1); // Medium quality
        } else {
          targetLevel = 0; // Base quality for wide view
        }
        
        // Only change level if we're upgrading quality or significantly zooming out
        if (targetLevel > currentLevel) {
          // Upgrade quality
          console.log(`Upgrading to level ${targetLevel} (FOV: ${cameraRef.current.fov.toFixed(1)})`);
          loadCubeMapLevel(targetLevel);
          setCurrentLevel(targetLevel);
        } else if (targetLevel < currentLevel && cameraRef.current.fov > 75) {
          // Only downgrade when significantly zoomed out to save memory
          console.log(`Downgrading to level ${targetLevel} for wide view (FOV: ${cameraRef.current.fov.toFixed(1)})`);
          loadCubeMapLevel(targetLevel);
          setCurrentLevel(targetLevel);
        } else if (targetLevel === currentLevel) {
          // Already at correct level
          console.log(`Already at level ${currentLevel} (FOV: ${cameraRef.current.fov.toFixed(1)})`);
        }
      }
    };

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('wheel', onWheel);

    return () => {
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('wheel', onWheel);
    };
  }, [manifest, currentLevel, loadCubeMapLevel, isEditMode, hotspots, overlays, onHotspotClick, onHotspotCreate]);

  return (
    <div className="relative w-full h-full">
      <style jsx>{`
        @keyframes pulse {
          0% {
            transform: scale(1);
            opacity: 1;
          }
          100% {
            transform: scale(2);
            opacity: 0;
          }
        }
      `}</style>
      
      <div 
        ref={containerRef} 
        className={`w-full h-full ${isEditMode ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
        style={isEditMode ? { border: '2px dashed rgba(76, 175, 80, 0.5)' } : {}}
      />
      
      {/* Edit Mode Indicator */}
      {isEditMode && (
        <div className="absolute top-4 left-4 z-20 bg-green-600/90 text-white px-3 py-2 rounded-lg backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
            <span className="text-sm font-medium">Edit Mode: Shift + Click to add hotspot</span>
          </div>
        </div>
      )}
      
      {/* Auto-rotate toggle button */}
      <button
        onClick={() => setIsAutoRotating(!isAutoRotating)}
        className={`absolute bottom-4 right-4 z-20 px-3 py-2 rounded-lg backdrop-blur-sm transition-all ${
          isAutoRotating || currentScene.auto_rotate
            ? 'bg-blue-600/80 text-white hover:bg-blue-700/80'
            : 'bg-white/80 text-gray-700 hover:bg-white/90'
        }`}
        title={isAutoRotating || currentScene.auto_rotate ? 'Stop Auto-rotation' : 'Start Auto-rotation'}
      >
        <div className="flex items-center gap-2">
          <svg 
            className={`w-5 h-5 ${isAutoRotating || currentScene.auto_rotate ? 'animate-spin' : ''}`} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          <span className="text-sm font-medium">
            {isAutoRotating || currentScene.auto_rotate ? 'Auto-rotating' : 'Auto-rotate'}
          </span>
        </div>
      </button>
      
      {isLoading && !isNavigatingRef.current && !autoRotate && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="text-white">Loading cube map...</div>
        </div>
      )}
      
      {/* Small loading indicator in corner - only shows if scene is taking time to load */}
      {isTransitioning && loadingProgress >= 100 && isLoading && (
        <div className="absolute bottom-4 left-4 pointer-events-none z-30">
          <div className="bg-black/50 rounded-lg px-4 py-3 backdrop-blur-sm flex items-center gap-3">
            <svg className="w-5 h-5 animate-spin text-white" viewBox="0 0 24 24" fill="none">
              <circle 
                className="opacity-25" 
                cx="12" 
                cy="12" 
                r="10" 
                stroke="currentColor" 
                strokeWidth="4"
              />
              <path 
                className="opacity-75" 
                fill="currentColor" 
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span className="text-white text-sm">Loading next scene...</span>
          </div>
        </div>
      )}
      
      {!manifest && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="text-white">No cube map data available. Please upload a new scene.</div>
        </div>
      )}
    </div>
  );
}