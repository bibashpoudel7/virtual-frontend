'use client';

//frontend/components/viewer/MultiresViewer.tsx
import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { Tour, Scene, Hotspot } from '@/types/tour';
import { MultiresManifest, TileLevel, calculateVisibleTiles, getAppropriateLevel } from '@/lib/multires-utils';

interface MultiresViewerProps {
  tour: Tour;
  currentScene: Scene;
  scenes?: Scene[]; // All scenes for preloading
  onSceneChange?: (sceneId: string) => void;
  onHotspotClick?: (hotspot: Hotspot) => void;
  isEditMode?: boolean;
  onHotspotCreate?: (yaw: number, pitch: number) => void;
  onHotspotUpdate?: (hotspot: Hotspot) => void;
  hotspots?: Hotspot[];
}

interface LoadedTile {
  level: number;
  col: number;
  row: number;
  texture: THREE.Texture;
  mesh: THREE.Mesh;
  lastUsed: number;
  loadAttempts: number;
  isLoading: boolean;
  error: Error | null;
  seamMesh?: THREE.Object3D | null
  tempMesh?: THREE.Mesh | null;
}

export default function MultiresViewer({
  tour,
  currentScene,
  scenes = [],
  onSceneChange,
  onHotspotClick,
  isEditMode = false,
  onHotspotCreate,
  onHotspotUpdate,
  hotspots = []
}: MultiresViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const animationIdRef = useRef<number | null>(null);
  const [isAnimation, setIsAnimation] = useState(false);
  const [manifest, setManifest] = useState<MultiresManifest | null>(null);
  const [isLoading, setIsLoading] = useState(false); // Always false - never show loading
  const [error, setError] = useState<string | null>(null);
  const [currentLevel, setCurrentLevel] = useState(0);
  const currentLevelRef = useRef(0);
  const hotspotsGroupRef = useRef<THREE.Group | null>(null);
  const draggingHotspotRef = useRef<Hotspot | null>(null);
  const isDraggingRef = useRef(false);
  const transitionTargetRef = useRef<{ yaw: number; pitch: number } | null>(null);
  const previewMeshRef = useRef<THREE.Mesh | null>(null);
  
  // Keep track of next scene for seamless transition
  const nextSceneRef = useRef<{ 
    manifest: MultiresManifest | null; 
    sceneId: string | null;
    previewMesh?: THREE.Mesh | null;
    isReady: boolean;
  }>({ manifest: null, sceneId: null, previewMesh: null, isReady: false });
  
  // Tile management
  const loadedTiles = useRef<Map<string, LoadedTile>>(new Map());
  const tileQueue = useRef<Set<string>>(new Set());
  const maxLoadedTiles = 200; // Maximum number of tiles to keep in memory (increased for better quality)
  const maxLoadAttempts = 3; // Maximum number of load attempts per tile
  
  // Camera controls
  const mouseDown = useRef(false);
  const mouseX = useRef(0);
  const mouseY = useRef(0);
  const lon = useRef(currentScene.yaw || 0);
  const lat = useRef(currentScene.pitch || 0);
  const fov = useRef(currentScene.fov || 75); // Increased FOV to reduce barrel distortion

  // Load manifest from scene tiles_manifest
  useEffect(() => {
    async function loadManifest() {
      try {
        setIsLoading(true);
        
        // Check if tiles_manifest is in the scene data
        if (currentScene.tiles_manifest) {
          // Parse the tiles manifest from the database
          const manifestData = typeof currentScene.tiles_manifest === 'string' 
            ? JSON.parse(currentScene.tiles_manifest)
            : currentScene.tiles_manifest;
          
          
          // Transform to match expected format
        // In the loadManifest useEffect, fix the level transformation:
        // First, determine all levels from tiles - they start from 0 in the tile data
        const allTileLevels = new Set<number>(manifestData.tiles?.map((t: any) => t.level as number) || []);
        const minTileLevel = Math.min(...Array.from(allTileLevels));
        const maxTileLevel = Math.max(...Array.from(allTileLevels));
        
        
        
        // Create complete level information - map to 0-based indexing
        const completeLevels = [];
        for (let lvl = minTileLevel; lvl <= maxTileLevel; lvl++) {
          // Check if this level exists in tiles
          const levelTiles = manifestData.tiles?.filter((t: any) => t.level === lvl) || [];
          if (levelTiles.length > 0) {
            const maxCol = Math.max(...levelTiles.map((t: any) => t.col));
            const maxRow = Math.max(...levelTiles.map((t: any) => t.row));
            
            // Use dimensions from manifest levels if available
            let width, height;
            const manifestLevel = manifestData.levels?.find((l: any) => l.level === lvl);
            
            if (manifestLevel) {
              // Use actual dimensions from manifest
              width = manifestLevel.width;
              height = manifestLevel.height;
            } else {
              // Calculate from tile count and tile size
              const tileSize = manifestData.tileSize || 512;
              width = (maxCol + 1) * tileSize;
              height = (maxRow + 1) * tileSize;
            }
            
            completeLevels.push({
              level: lvl,
              originalLevel: lvl, // Keep track of original level number
              width: width,
              height: height,
              cols: manifestLevel?.tilesX || maxCol + 1,
              rows: manifestLevel?.tilesY || maxRow + 1,
              tilesX: manifestLevel?.tilesX || maxCol + 1,
              tilesY: manifestLevel?.tilesY || maxRow + 1,
              tileSize: manifestData.tileSize || 512
            });
          }
        }
        
        // Use levels from manifest data if available and complete
        const finalLevels = manifestData.levels && manifestData.levels.length > 0 
          ? manifestData.levels.map((l: any) => ({
              ...l,
              cols: l.tilesX,
              rows: l.tilesY,
              originalLevel: l.level,
              tileSize: manifestData.tileSize || 512
            }))
          : completeLevels;
        
        const transformedManifest: MultiresManifest = {
          type: manifestData.type || 'multires',
          originalWidth: manifestData.dimensions?.width || 4096,
          originalHeight: manifestData.dimensions?.height || 2048,
          tileSize: manifestData.tileSize || 512,
          levels: finalLevels,
          preview: manifestData.preview,
          tiles: manifestData.tiles,
          overlap: manifestData.overlap || 0,
          format: manifestData.format || 'jpg'
        };
          
          
          // Levels are already in correct order (0 = lowest res, 4 = highest res)
          // No need to sort or remap
          // Validate and fix level data based on actual tiles
          transformedManifest.levels = transformedManifest.levels.map((level: any) => {
            const tilesForLevel = transformedManifest.tiles?.filter((t: any) => t.level === level.level);
            
            // Find actual grid dimensions from tiles
            let actualMaxCol = 0;
            let actualMaxRow = 0;
            tilesForLevel?.forEach((tile: any) => {
              actualMaxCol = Math.max(actualMaxCol, tile.col);
              actualMaxRow = Math.max(actualMaxRow, tile.row);
            });
            
            const actualCols = actualMaxCol + 1;
            const actualRows = actualMaxRow + 1;

            // If mismatch, use actual dimensions
            if (actualCols !== level.cols || actualRows !== level.rows) {
              return {
                ...level,
                cols: actualCols,
                rows: actualRows
              };
            }

            return level;
          });
        
          setManifest(transformedManifest);
          
          // Debug: Show tiles per level
          const tilesPerLevel = new Map();
          transformedManifest.tiles?.forEach((tile: any) => {
            if (!tilesPerLevel.has(tile.level)) {
              tilesPerLevel.set(tile.level, 0);
            }
            tilesPerLevel.set(tile.level, tilesPerLevel.get(tile.level) + 1);
          });
          
          setIsLoading(false);
        } else {
          setManifest(null);
          setIsLoading(false);
        }
      } catch (err) {
        setError('Failed to load multiresolution data');
        setIsLoading(false);
      }
    }
    
    loadManifest();
  }, [currentScene]);

  // Load tile function with improved error handling and coordinate mapping
  const loadTile = useCallback(async (level: number, col: number, row: number, isPriority = true) => {
    if (!manifest || !sceneRef.current) {
      return;
    }
    const tileKey = `l${level}_${row}_${col}`; // Match manifest format: l{level}_{row}_{col}
    
    // Check if already loaded or loading
    const existingTile = loadedTiles.current.get(tileKey);
    if (existingTile) {
      if (!existingTile.isLoading) {
        existingTile.lastUsed = Date.now();
      }
      return;
    }
    
    // Check if already in queue
    if (tileQueue.current.has(tileKey)) {
      return;
    }
    
    // Add to queue
    tileQueue.current.add(tileKey);
    
    // Get level info for coordinate mapping
    const levelInfo = manifest.levels[level];
    if (!levelInfo) {
      tileQueue.current.delete(tileKey);
      return;
    }
    
    // Mark as loading with placeholder values
    loadedTiles.current.set(tileKey, {
      level,
      col,
      row,
      lastUsed: Date.now(),
      loadAttempts: 0,
      isLoading: true,
      error: null,
      texture: new THREE.Texture(),
      mesh: new THREE.Mesh(),
    });
    
    // If this is a priority tile, move it to the front of the queue
    if (isPriority && tileQueue.current.size > 1) {
      const queueArray = Array.from(tileQueue.current);
      const index = queueArray.indexOf(tileKey);
      if (index > 0) {
        queueArray.splice(index, 1);
        queueArray.unshift(tileKey);
        tileQueue.current = new Set(queueArray);
      }
    }
    
    // Process tile loading in background
    const processTile = async (attempt = 1) => {
      try {
        
        // Find tile URL from manifest OR construct it based on pattern
        let targetTile = manifest.tiles?.find(
          (t: any) => t.level === level && t.row === row && t.col === col
        );
        
        // If no tile in manifest, construct URL based on pattern
        if (!targetTile) {
          // Construct tile URL based on standard pattern
          // Format: l{level}_{row}_{col}.jpg (row first, then col)
          const basePath = `https://test.thenimto.com/scenes/${currentScene.id}/tiles`;
          const tileUrl = `${basePath}/l${level}_${row}_${col}.jpg`;
          
          targetTile = {
            level,
            row,
            col,
            url: tileUrl
          };
          
        }
      
        
        if (!targetTile || !targetTile.url) {
          const errorMsg = `No tile URL for ${tileKey}`;
          
          // If this is the first attempt, try again with exponential backoff
          if (attempt < maxLoadAttempts) {
            const backoffTime = Math.min(1000 * Math.pow(2, attempt), 5000);
            
            setTimeout(() => {
              if (tileQueue.current.has(tileKey)) {
                processTile(attempt + 1);
              }
            }, backoffTime);
            return;
          }
          
          // Max attempts reached, mark as failed
          if (loadedTiles.current.has(tileKey)) {
            loadedTiles.current.set(tileKey, {
              level,
              col,
              row,
              lastUsed: Date.now(),
              loadAttempts: attempt,
              isLoading: false,
              error: new Error(errorMsg),
              texture: new THREE.Texture(),
              mesh: new THREE.Mesh(),
            });
          }
          return;
        }
        
        // For immediate display, try to use a lower resolution tile if available
        // This prevents blur while the higher res tile loads
        let immediateTexture: THREE.Texture | null = null;
        
        // Try to find a matching lower resolution tile
        if (level > 0) {
          // Check for exact lower level match
          const lowerLevelKey = `l${level-1}_${Math.floor(row/2)}_${Math.floor(col/2)}`;
          const lowerTile = loadedTiles.current.get(lowerLevelKey);
          
          if (lowerTile && lowerTile.texture && !lowerTile.isLoading) {
            // Use the lower res texture immediately (don't clone, just reference)
            immediateTexture = lowerTile.texture;
          }
        }
        
        // Create mesh immediately with placeholder if available
        if (immediateTexture && sceneRef.current) {
          // Create temporary mesh with lower res texture
          const tempGeometry = new THREE.SphereGeometry(
            500,
            32,
            32,
            (col / (manifest.levels[level]?.cols || 1)) * Math.PI * 2,
            (1 / (manifest.levels[level]?.cols || 1)) * Math.PI * 2,
            (row / (manifest.levels[level]?.rows || 1)) * Math.PI,
            (1 / (manifest.levels[level]?.rows || 1)) * Math.PI
          );
          tempGeometry.scale(-1, 1, 1);
          
          const tempMaterial = new THREE.MeshBasicMaterial({
            map: immediateTexture,
            side: THREE.DoubleSide,
            transparent: false,
            depthWrite: true,
            depthTest: true
          });
          
          const tempMesh = new THREE.Mesh(tempGeometry, tempMaterial);
          tempMesh.name = `temp_${tileKey}`;
          tempMesh.renderOrder = level * 100 - 1; // Slightly behind real tile
          sceneRef.current.add(tempMesh);
          
          // Store reference to remove later
          loadedTiles.current.set(tileKey, {
            ...loadedTiles.current.get(tileKey)!,
            tempMesh
          });
        }
        
        // Load the texture with retry logic
        const textureLoadPromise = new Promise<THREE.Texture>((resolve, reject) => {
          const loader = new THREE.TextureLoader();
          
          // Use the URL directly if it's already absolute, otherwise make it relative to origin
          let urlString = targetTile.url;
          if (!urlString.startsWith('http://') && !urlString.startsWith('https://')) {
            urlString = new URL(targetTile.url, window.location.origin).toString();
          }
          
          const timeout = setTimeout(() => {
            reject(new Error(`Texture load timeout after 10s (${urlString})`));
          }, 10000); // 10 second timeout
          
          loader.load(
            urlString,
            (texture) => {
              clearTimeout(timeout);
              // Optimize texture settings to minimize seam blur
              // Use consistent settings for all levels
              texture.minFilter = THREE.LinearFilter; // No mipmaps to prevent edge blur
              texture.magFilter = THREE.LinearFilter; // Linear for smooth appearance
              texture.generateMipmaps = false; // Disable mipmaps - they cause blur at edges
              
              texture.colorSpace = THREE.SRGBColorSpace;
              // Lower anisotropy at edges to reduce blur
              texture.anisotropy = 4; // Reduced from 16 to minimize edge effects
              // Critical: Clamp to edge to prevent texture bleeding
              texture.wrapS = THREE.ClampToEdgeWrapping;
              texture.wrapT = THREE.ClampToEdgeWrapping;
              texture.format = THREE.RGBAFormat;
              texture.flipY = true; // Flip Y for correct sphere mapping
              texture.needsUpdate = true;
             
              
              resolve(texture);
            },
          
            
            // Error callback
            (err:any) => {
              clearTimeout(timeout);
              const errorMsg = `Failed to load tile ${tileKey} from ${urlString}: ${err.message || 'Unknown error'}`;
              reject(new Error(errorMsg));
            }
          );
        });
        
        // Wait for texture to load
        const texture = await textureLoadPromise;
        
        // Skip if tile was unloaded while loading or scene is gone
        if (!loadedTiles.current.has(tileKey) || !tileQueue.current.has(tileKey) || !sceneRef.current) {
          texture.dispose();
          // Remove temp mesh if it exists
          const tileData = loadedTiles.current.get(tileKey);
          if (tileData?.tempMesh) {
            sceneRef.current?.remove(tileData.tempMesh);
            tileData.tempMesh.geometry.dispose();
            (tileData.tempMesh.material as THREE.Material).dispose();
          }
          return;
        }
        
        // Get level info for coordinate mapping
        let levelInfo = manifest.levels[level];
        
        // If level info is missing, calculate it from tiles
        if (!levelInfo) {
          
          // Find all tiles for this level
          const levelTiles = manifest.tiles?.filter((t: any) => t.level === level) || [];
          if (levelTiles.length > 0) {
            const maxCol = Math.max(...levelTiles.map((t: any) => t.col));
            const maxRow = Math.max(...levelTiles.map((t: any) => t.row));
            
            levelInfo = {
              level,
              cols: maxCol + 1,
              rows: maxRow + 1,
              width: (maxCol + 1) * (manifest.tileSize || 512),
              height: (maxRow + 1) * (manifest.tileSize || 512),
              tileSize: manifest.tileSize || 512,
              tilesX: maxCol + 1,
              tilesY: maxRow + 1
            };
            
          } else {
            texture.dispose();
            return;
          }
        }
        
        const tileCols = levelInfo.cols || (levelInfo as any).tilesX;
        const tileRows = levelInfo.rows || (levelInfo as any).tilesY;
        
      
        
        // Special handling for seam at 0/360 degrees
        const isFirstColumn = col === 0;
        
        // Calculate if this tile is in front of camera
        const currentLon = lon.current;
        const tileCenterDegrees = (col + 0.5) / tileCols * 360 - 180;
        
        // Check if tile is in front (within 45 degrees of view center)
        let angleDiff = Math.abs(tileCenterDegrees - currentLon);
        if (angleDiff > 180) angleDiff = 360 - angleDiff;
        
        // Use minimal overlap to prevent blur at seams
        // Just enough to prevent gaps but not cause blur
        const overlapPixels = 1; // Only 1 pixel overlap
        const tileSize = manifest.tileSize || 512;
        const overlapRatio = overlapPixels / tileSize;
        
        // Calculate exact tile boundaries
        const basePhi = (1 / tileCols) * Math.PI * 2;
        const baseTheta = (1 / tileRows) * Math.PI;
        
        // Apply minimal overlap
        const phiOverlap = basePhi * overlapRatio;
        const thetaOverlap = baseTheta * overlapRatio;
        
        // Horizontal angle (phi) - precise boundaries
        const phiStart = (col / tileCols) * Math.PI * 2 - phiOverlap * 0.5; // Half overlap on each side
        const phiLength = basePhi + phiOverlap;
        
        // Vertical angle (theta) - precise boundaries
        const thetaStart = Math.max(0, (row / tileRows) * Math.PI - thetaOverlap * 0.5);
        const thetaLength = Math.min(Math.PI - thetaStart, baseTheta + thetaOverlap);
        
        // Create sphere segment for this tile
        // Optimized for 2-level system (0 and 1)
        // Use high segment count for all levels to ensure quality
        // More segments = smoother sphere surface
        // const baseSegments = 64;
        
        // Create sphere segment for this tile
        // Use consistent radius for all tiles at same level
        const baseRadius = 500;
        const radius = baseRadius - (level * 0.02); // Slightly larger offset between levels
        
        // Use consistent segment count for stable rendering
        const widthSegments = 96; // Fixed segments for all tiles
        const heightSegments = 96; // Fixed segments for all tiles
        
        const geometry = new THREE.SphereGeometry(
          radius,
          widthSegments,
          heightSegments,
          phiStart,
          phiLength,
          thetaStart,
          thetaLength
        );
        
        // Flip the sphere inside out for panorama viewing
        geometry.scale(-1, 1, 1);
        
        const material = new THREE.MeshBasicMaterial({
          map: texture,
          side: THREE.DoubleSide, // Render both sides to ensure full coverage
          transparent: false, // Disable transparency to prevent blur
          opacity: 1.0, // Full opacity for sharp rendering
          depthWrite: true,
          depthTest: true,
          toneMapped: false, // Disable tone mapping for accurate colors
          premultipliedAlpha: false, // Prevent alpha blending issues
          alphaTest: 0, // No alpha testing
          polygonOffset: true, // Use for all tiles
          // Consistent offset based on level only
          polygonOffsetFactor: -level * 2,
          polygonOffsetUnits: -1
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = `tile_${tileKey}`;
        // Set render order based on level only (not position)
        // Higher levels (higher resolution) always render on top
        mesh.renderOrder = level * 10; // Consistent spacing between levels
        mesh.frustumCulled = false; // Always render tiles
        mesh.layers.set(0); // Use default layer so all tiles are visible
        mesh.visible = true; // Ensure tile is visible by default
        
        if (sceneRef.current) {
          // Remove temporary mesh if it exists
          const existingTileData = loadedTiles.current.get(tileKey);
          if (existingTileData?.tempMesh) {
            sceneRef.current.remove(existingTileData.tempMesh);
            existingTileData.tempMesh.geometry.dispose();
            (existingTileData.tempMesh.material as THREE.Material).dispose();
          }
          
          sceneRef.current.add(mesh);          
          
          // No fade-in needed since tiles are opaque
          // No need for seam duplication with proper tile coverage
          
          // Force a render update
          if (rendererRef.current && cameraRef.current) {
            rendererRef.current.render(sceneRef.current, cameraRef.current);
          }
          
          // Update the existing loaded tile entry (we stored it earlier)
          const updatedTile = {
            level,
            col,
            row,
            texture,
            mesh,
            isLoading: false,
            loadAttempts: attempt,
            lastUsed: Date.now(),
            error: null,
            seamMesh: isFirstColumn ? sceneRef.current.getObjectByName(`seam_duplicate_${tileKey}`) : null,
            tempMesh: undefined // Clear temp mesh reference
          };
          loadedTiles.current.set(tileKey, updatedTile);          
          
          // Clean up if we have too many tiles
          if (loadedTiles.current.size > maxLoadedTiles) {
            // Find least recently used tiles beyond our limit
            const tilesToUnload = Array.from(loadedTiles.current.entries())
              .filter(([key]) => key !== tileKey) // Don't unload the one we just loaded
              .sort((a, b) => a[1].lastUsed - b[1].lastUsed)
              .slice(0, Math.max(0, loadedTiles.current.size - maxLoadedTiles));
              
            tilesToUnload.forEach(([key, tile]) => {
              sceneRef.current?.remove(tile.mesh);
              tile.mesh.geometry.dispose();
              if (tile.mesh.material instanceof THREE.Material) {
                tile.mesh.material.dispose();
              }
              // Also remove seam mesh if it exists
              if (tile.seamMesh && sceneRef.current) {
                sceneRef.current.remove(tile.seamMesh);
                if (tile.seamMesh instanceof THREE.Mesh) {
                  tile.seamMesh.geometry.dispose();
                  // Don't dispose material/texture as it's shared with main tile
                }
              }
              tile.texture.dispose();
              loadedTiles.current.delete(key);
            });
          }
        }
        
      } catch (err) {
        
        
        // Retry if we have attempts left
        if (attempt < maxLoadAttempts && loadedTiles.current.has(tileKey)) {
          
          setTimeout(() => processTile(attempt + 1), 1000 * attempt); // Exponential backoff
          return;
        }
        
        // Mark as error
        const existingTile = loadedTiles.current.get(tileKey);
        if (existingTile) {
          loadedTiles.current.set(tileKey, {
            ...existingTile,
            isLoading: false,
            error: err instanceof Error ? err : new Error(String(err)),
            loadAttempts: attempt
          });
        }
      } finally {
        tileQueue.current.delete(tileKey);
      }
    };
    
    // Start loading immediately
    processTile(1).catch(err => {
      console.error(`Error processing tile ${tileKey}:`, err);
    });
  }, [manifest, currentScene.id]);

  // Unload tiles that are no longer visible
  const unloadInvisibleTiles = useCallback((visibleKeys: Set<string>) => {
    const now = Date.now();
    const toUnload: string[] = [];
    const currentFovLevel = getAppropriateLevel(
      fov.current,
      manifest?.levels || [],
      containerRef.current?.clientWidth || 1920
    );
    
    // First pass: mark tiles for unloading
    loadedTiles.current.forEach((tile, key) => {
      const levelDiff = Math.abs(tile.level - currentFovLevel);
      
      if (!visibleKeys.has(key)) {
        // During zoom, keep ALL tiles from adjacent levels visible
        const keepDuration = levelDiff <= 1 ? 30000 : 10000; // 30s for adjacent, 10s for others
        
        if (now - tile.lastUsed > keepDuration) {
          toUnload.push(key);
        } else if (tile.mesh) {
          // Keep tile visible but adjust render order based on level distance
          tile.mesh.visible = true;
          // Don't change render order during transitions
          tile.mesh.renderOrder = tile.level * 10;
        }
      } else if (visibleKeys.has(key)) {
        // Update last used time for visible tiles
        tile.lastUsed = now;
        if (tile.mesh) {
          tile.mesh.visible = true;
          // Current level tiles have highest priority
          tile.mesh.renderOrder = tile.level === currentFovLevel ? 1000 + tile.level : tile.level * 100;
        }
      }
    });
    
    // Second pass: unload tiles in chunks to avoid frame drops
    const unloadChunk = (startIndex: number) => {
      const chunkSize = 3; // Unload 3 tiles per frame
      const endIndex = Math.min(startIndex + chunkSize, toUnload.length);
      
      for (let i = startIndex; i < endIndex; i++) {
        const key = toUnload[i];
        const tile = loadedTiles.current.get(key);
        if (tile && sceneRef.current) {
          sceneRef.current.remove(tile.mesh);
          tile.mesh.geometry.dispose();
          if (tile.mesh.material instanceof THREE.Material) {
            tile.mesh.material.dispose();
          }
          // Also remove seam mesh if it exists
          if (tile.seamMesh) {
            sceneRef.current.remove(tile.seamMesh);
            if (tile.seamMesh instanceof THREE.Mesh) {
              tile.seamMesh.geometry.dispose();
              // Don't dispose material/texture as it's shared
            }
          }
          tile.texture.dispose();
          loadedTiles.current.delete(key);
        }
      }
      
      // Schedule next chunk if there are more tiles to unload
      if (endIndex < toUnload.length) {
        requestAnimationFrame(() => unloadChunk(endIndex));
      }
    };
    
    // Start unloading chunks
    if (toUnload.length > 0) {
      unloadChunk(0);
      
      // Preview is always visible as fallback
    }
  }, []);
  
  // Throttle tile updates to prevent excessive calculations
  const lastUpdateTime = useRef(0);
  const updateVisibleTiles = useCallback(() => {
    const now = performance.now();
    if (now - lastUpdateTime.current < 50) { // Reduced update frequency to prevent flickering
      return;
    }
    lastUpdateTime.current = now;
    
    if (!manifest || !containerRef.current || !cameraRef.current) {
      return;
    }
    
    const viewport = {
      yaw: lon.current,
      pitch: lat.current,
      fov: fov.current
    };
    
    // Get appropriate level based on zoom
    // Use levels from manifest if available
    let availableLevels = manifest.levels?.length > 0 ? [...manifest.levels] : [];
    
    // If we don't have proper level info, build it from tiles
    if (availableLevels.length === 0 && manifest.tiles && manifest.tiles.length > 0) {
      const uniqueLevels = new Set(manifest.tiles.map((t: any) => t.level));
      const maxLevel = Math.max(...uniqueLevels);
      
      
      // Build levels array from tiles
      for (let i = 0; i <= maxLevel; i++) {
        const levelTiles = manifest.tiles.filter((t: any) => t.level === i);
        if (levelTiles.length > 0) {
          const maxCol = Math.max(...levelTiles.map((t: any) => t.col));
          const maxRow = Math.max(...levelTiles.map((t: any) => t.row));
          
          availableLevels[i] = {
            level: i,
            cols: maxCol + 1,
            rows: maxRow + 1,
            width: (maxCol + 1) * (manifest.tileSize || 512),
            height: (maxRow + 1) * (manifest.tileSize || 512),
            tileSize: manifest.tileSize || 512,
            tilesX: maxCol + 1,
            tilesY: maxRow + 1
          };
        }
      }
    }
    
    const targetLevel = getAppropriateLevel(
      fov.current,
      availableLevels,
      containerRef.current.clientWidth
    );
    
    // Use target level directly for immediate response
    const newLevel = Math.min(targetLevel, availableLevels.length - 1);
    
    
    if (newLevel !== currentLevelRef.current) {
      currentLevelRef.current = newLevel;
      setCurrentLevel(newLevel);
      
      // Keep tiles visible with proper layering to prevent cracks
      loadedTiles.current.forEach((tile, key) => {
        if (tile.mesh) {
          // Always keep tiles visible to prevent gaps
          tile.mesh.visible = true;
          
          // Maintain consistent render order - don't change during zoom
          // This prevents flickering and gaps
          tile.mesh.renderOrder = tile.level * 10;
        }
      });
      
      // Don't remove tiles during level changes - let cache management handle it
      // This prevents tiles from disappearing during transitions
    }
    
    // Calculate visible tiles
    const levelInfo = availableLevels[newLevel];
    
    if (!levelInfo) {
      return;
    }
    const visibleTiles = calculateVisibleTiles(
      viewport,
      levelInfo,
      manifest.originalWidth,
      manifest.originalHeight
    );
    
    // Add preloading of adjacent tiles for smoother panning
    const preloadRadius = 1; // Load 1 tile beyond visible area
    const tilesWithPreload = [...visibleTiles];
    
    visibleTiles.forEach(({ col, row }) => {
      for (let dx = -preloadRadius; dx <= preloadRadius; dx++) {
        for (let dy = -preloadRadius; dy <= preloadRadius; dy++) {
          if (dx === 0 && dy === 0) continue; // Skip the tile itself
          
          const preloadCol = col + dx;
          const preloadRow = row + dy;
          
          // Check bounds
          if (preloadCol >= 0 && preloadCol < levelInfo.cols &&
              preloadRow >= 0 && preloadRow < levelInfo.rows) {
            // Check if not already in list
            if (!tilesWithPreload.some(t => t.col === preloadCol && t.row === preloadRow)) {
              tilesWithPreload.push({ col: preloadCol, row: preloadRow });
            }
          }
        }
      }
    });
    
    // Create set of visible tile keys and load priority tiles first
    const visibleKeys = new Set<string>();
    const centerX = containerRef.current.clientWidth / 2;
    const centerY = containerRef.current.clientHeight / 2;
    
    // Sort tiles by distance from center for priority loading
    const sortedTiles = [...tilesWithPreload].sort((a, b) => {
      const dxA = Math.abs((a.col + 0.5) * levelInfo.tileSize - centerX);
      const dyA = Math.abs((a.row + 0.5) * levelInfo.tileSize - centerY);
      const distA = Math.sqrt(dxA * dxA + dyA * dyA);
      
      const dxB = Math.abs((b.col + 0.5) * levelInfo.tileSize - centerX);
      const dyB = Math.abs((b.row + 0.5) * levelInfo.tileSize - centerY);
      const distB = Math.sqrt(dxB * dxB + dyB * dyB);
      
      return distA - distB;
    });
    
    // Process visible tiles - only load tiles that aren't already loaded
    let newTilesRequested = 0;
    let alreadyLoaded = 0;
    const tilesToLoad:any[] = [];
    
    sortedTiles.forEach(({ col, row }, index) => {
      const tileKey = `l${newLevel}_${row}_${col}`; // Match manifest format: l{level}_{row}_{col}
      visibleKeys.add(tileKey);
      
      // Only load if not already loaded or loading
      if (!loadedTiles.current.has(tileKey)) {
        newTilesRequested++;
        const isPriority = index < 8; // Load first 8 tiles with priority
        tilesToLoad.push({ level: newLevel, col, row, isPriority, key: tileKey });
        if (newTilesRequested <= 5) { // Log first few tiles
          console.log(`Queuing tile: ${tileKey} for Level ${newLevel}`);
        }
      } else {
        alreadyLoaded++;
        // Make sure loaded tiles are visible
        const tile = loadedTiles.current.get(tileKey);
        if (tile && tile.mesh) {
          tile.mesh.visible = true;
        }
      }
    });
    
    // Load tiles
    tilesToLoad.forEach(({ level, col, row, isPriority, key }) => {
      loadTile(level, col, row, isPriority);
    });
    
    
    // Don't preload other levels to avoid overloading
    
    // During zoom transitions, don't unload tiles immediately
    // Only unload if we're stable (not actively zooming)
    const isZooming = Math.abs(fov.current - (cameraRef.current?.fov || fov.current)) > 0.1;
    if (!isZooming) {
      // Only unload tiles after zoom is complete
      setTimeout(() => {
        unloadInvisibleTiles(visibleKeys);
      }, 2000); // Wait 2 seconds after zoom stops to ensure all tiles are loaded
    }
  }, [manifest, loadTile, unloadInvisibleTiles]);


  const createHotspotMesh = useCallback((yaw: number, pitch: number, isNavigation = true) => {
    // Place hotspots on the floor plane, not on the sphere surface
    // This creates proper depth perception
    const floorY = -200; // Fixed Y position for floor (lower in 3D space)
    
    // Calculate position on a horizontal circle at floor level
    const hotspotTheta = THREE.MathUtils.degToRad(yaw);
    const floorRadius = 350; // Distance from center on the floor plane
    
    // Create a group to hold the hotspot elements
    const hotspotGroup = new THREE.Group();
    
    // Matterport-style floor marker design with increased size for visibility
    // Create base circle (white glow on floor)
    const baseGeometry = new THREE.CircleGeometry(20, 64);
    const baseMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const baseMesh = new THREE.Mesh(baseGeometry, baseMaterial);
    baseMesh.name = 'base';
    
    // Create outer ring with gradient effect
    const ringGeometry = new THREE.RingGeometry(12, 16, 64);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: isNavigation ? 0x00BCD4 : 0xffd700, // Cyan for navigation
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const ringMesh = new THREE.Mesh(ringGeometry, ringMaterial);
    ringMesh.name = 'ring';
    
    // Create pulsing outer ring for visibility
    const pulseRingGeometry = new THREE.RingGeometry(16, 22, 64);
    const pulseRingMaterial = new THREE.MeshBasicMaterial({
      color: isNavigation ? 0x00BCD4 : 0xffd700,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const pulseRingMesh = new THREE.Mesh(pulseRingGeometry, pulseRingMaterial);
    pulseRingMesh.name = 'pulseRing';
    
    // Create center circle (main hotspot area)
    const centerGeometry = new THREE.CircleGeometry(10, 64);
    const centerMaterial = new THREE.MeshBasicMaterial({
      color: isNavigation ? 0x00ACC1 : 0xffb700, // Medium cyan for center
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const centerMesh = new THREE.Mesh(centerGeometry, centerMaterial);
    centerMesh.position.z = 0.1;
    
    // Create inner bright spot (white center)
    const innerGeometry = new THREE.CircleGeometry(5, 32);
    const innerMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const innerMesh = new THREE.Mesh(innerGeometry, innerMaterial);
    innerMesh.position.z = 0.2;
    
    // Add chevron arrow for navigation hotspots (Matterport style)
    if (isNavigation) {
      const arrowShape = new THREE.Shape();
      // Create a larger chevron shape for better visibility
      const scale = 2;
      arrowShape.moveTo(-3 * scale, 2 * scale);
      arrowShape.lineTo(0, -3 * scale);
      arrowShape.lineTo(3 * scale, 2 * scale);
      arrowShape.lineTo(2 * scale, 3 * scale);
      arrowShape.lineTo(0, -1 * scale);
      arrowShape.lineTo(-2 * scale, 3 * scale);
      arrowShape.closePath();
      
      const arrowGeometry = new THREE.ShapeGeometry(arrowShape);
      const arrowMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 1,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const arrowMesh = new THREE.Mesh(arrowGeometry, arrowMaterial);
      arrowMesh.position.z = 0.3;
      hotspotGroup.add(arrowMesh);
    }
    
    // Add all meshes to group (order matters for rendering)
    hotspotGroup.add(baseMesh);
    hotspotGroup.add(pulseRingMesh);
    hotspotGroup.add(ringMesh);
    hotspotGroup.add(centerMesh);
    hotspotGroup.add(innerMesh);
    
    // Position on floor plane with proper distance from center
    // This creates a circle of hotspots at floor level
    const sinTheta = Math.sin(hotspotTheta);
    const cosTheta = Math.cos(hotspotTheta);
    
    // Position calculation for floor placement
    hotspotGroup.position.set(
      floorRadius * cosTheta,  // x - horizontal position in circle
      floorY,                  // y - fixed floor height
      floorRadius * sinTheta   // z - depth position in circle
    );
    
    // Scale hotspot based on distance for perspective
    const distanceScale = 1.0; // Keep consistent size
    
    // Make it face the camera
    hotspotGroup.lookAt(0, 0, 0);
    
    // Add animation data - store original values
    hotspotGroup.userData = { 
      yaw, 
      pitch: pitch, // Store original pitch for data
      originalScale: 1,
      pulseTime: 0,
      isHovered: false
    };
    
    return hotspotGroup;
  }, []);

  // Update hotspots in the scene
  const updateHotspots = useCallback(() => {
    if (!hotspotsGroupRef.current || !sceneRef.current) {
      return;
    }
    
    // Clear existing hotspots
    while (hotspotsGroupRef.current.children.length > 0) {
      const child = hotspotsGroupRef.current.children[0];
      hotspotsGroupRef.current.remove(child);
      // Dispose of geometries and materials in groups
      child.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.geometry?.dispose();
          if (node.material instanceof THREE.Material) {
            node.material.dispose();
          }
        }
      });
    }
    
    // Add hotspots for current scene
    const sceneHotspots = hotspots.filter(h => h.scene_id === currentScene.id);
    
    sceneHotspots.forEach(hotspot => {
      const mesh = createHotspotMesh(hotspot.yaw, hotspot.pitch, hotspot.kind === 'navigation');
      mesh.userData.hotspot = hotspot;
      hotspotsGroupRef.current?.add(mesh);
    });
    
  }, [hotspots, currentScene.id, createHotspotMesh]);

    // Initialize Three.js scene
    useEffect(() => {
      if (!containerRef.current || !manifest) return;
  
      const container = containerRef.current;
      
      // Scene setup
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x000000); // Black background as fallback
      sceneRef.current = scene;
  
      // Camera setup with optimized near/far planes for spherical panorama
      const camera = new THREE.PerspectiveCamera(
        fov.current,
        container.clientWidth / container.clientHeight,
        1, // Increased near plane to reduce z-fighting
        600 // Reduced far plane for better depth precision
      );
      camera.position.set(0, 0, 0); // Camera at exact center for proper panorama viewing
      // Use default layer for camera
      camera.layers.set(0);
      cameraRef.current = camera;
  
      // Renderer setup with optimized quality settings
      const renderer = new THREE.WebGLRenderer({ 
        antialias: true,
        powerPreference: 'high-performance',
        alpha: false,
        preserveDrawingBuffer: false, // Better performance
        precision: 'highp',
        logarithmicDepthBuffer: false,
        stencil: false // Not needed for panorama
      });
      
      // Critical: Set size before pixel ratio to prevent blur
      renderer.setSize(container.clientWidth, container.clientHeight, false);
      
      // Use consistent pixel ratio - cap at 2 for performance while maintaining sharpness
      const pixelRatio = Math.min(window.devicePixelRatio, 2);
      renderer.setPixelRatio(pixelRatio);
      
      // Actually apply the size with the pixel ratio
      renderer.setSize(container.clientWidth, container.clientHeight);
      
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NoToneMapping; // Disable tone mapping for accurate colors
      renderer.toneMappingExposure = 1.0;
      renderer.sortObjects = true; // Ensure proper render order
      
      // Enable texture anisotropy for sharper textures at angles
      renderer.capabilities.getMaxAnisotropy();
      
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;
  
      // Store reference to preview mesh
      let previewMesh: THREE.Mesh | null = null;
      
      // Create hotspots group
      const hotspotsGroup = new THREE.Group();
      hotspotsGroup.name = 'hotspots';
      scene.add(hotspotsGroup);
      hotspotsGroupRef.current = hotspotsGroup;
      
      // Initial hotspot update after scene is ready
      setTimeout(() => {
        updateHotspots();
      }, 0);
      
      // Load preview/full panorama first - try original URL first for better quality
      const previewUrl = `https://test.thenimto.com/scenes/${currentScene.id}/tiles/preview.jpg`|| currentScene.src_original_url || 
                        `https://test.thenimto.com/scenes/${currentScene.id}/tiles/preview.jpg`;
        
      // Never show loading screen
      setIsLoading(false);
      
      const textureLoader = new THREE.TextureLoader();
      textureLoader.load(
        previewUrl,
        (texture) => {
          // Set correct color space for the texture
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.minFilter = THREE.LinearMipmapLinearFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.generateMipmaps = true;
          
          // Create full sphere for preview - this ensures complete coverage
          // Use same radius as tiles to prevent distortion
          const geometry = new THREE.SphereGeometry(500.5, 128, 64); // Very slightly larger to be behind
          geometry.scale(-1, 1, 1); // Flip inside out for panorama
          
          const material = new THREE.MeshBasicMaterial({
            map: texture,
            side: THREE.DoubleSide,
            transparent: false, // Keep opaque for full coverage
            depthWrite: true,
            depthTest: true
          });
          
          previewMesh = new THREE.Mesh(geometry, material);
          previewMesh.name = 'preview';
          previewMesh.renderOrder = -1000; // Always render first as ultimate background
          previewMesh.frustumCulled = false; // Always render preview
          previewMesh.visible = true; // Always visible as base layer
          previewMesh.layers.set(0); // Use default layer
          scene.add(previewMesh);
          
          // Store reference for visibility control
          if(!isAnimation){
            previewMeshRef.current = previewMesh;
          }
          
          // Never hide or remove the preview - it's our safety net against cracks
          
          // Add nadir patch to cover camera/tripod spot
          const nadirGeometry = new THREE.CircleGeometry(50, 32);
          nadirGeometry.rotateX(-Math.PI / 2); // Rotate to face downward
          
          const nadirMaterial = new THREE.MeshBasicMaterial({
            color: 0x808080, // Gray color to blend
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.9
          });
          
          const nadirPatch = new THREE.Mesh(nadirGeometry, nadirMaterial);
          nadirPatch.position.y = -498; // Position at bottom of sphere
          nadirPatch.name = 'nadirPatch';
          scene.add(nadirPatch);
          
          // Start loading tiles
          updateVisibleTiles();
        },
        undefined,
        (error) => {
          // Still try to load tiles even if preview fails
          updateVisibleTiles();
        }
      );
    
      // Handle hotspot click wrapper
      const handleHotspotClickWrapper = (hotspot: Hotspot) => {
        handleHotspotClick(hotspot);
      };
  
  
  
      // Animation loop with optimized updates
      let lastFrameTime = performance.now();
      let lastTileUpdate = 0;
      const TILE_UPDATE_INTERVAL = 150; // Increased interval to reduce flickering
  
      function animate(timestamp: number) {
        animationIdRef.current = requestAnimationFrame(animate);
        
        // Calculate delta time for smooth animations
        const deltaTime = timestamp - lastFrameTime;
        lastFrameTime = timestamp;
  
        // Camera rotation is now handled directly in handleHotspotClick
        // This keeps animations smooth and prevents state conflicts
        
        // Animate hotspots (pulsing effect)
        if (hotspotsGroup) {
          hotspotsGroup.children.forEach((hotspot) => {
            if (hotspot instanceof THREE.Group) {
              // Pulse animation
              hotspot.userData.pulseTime = (hotspot.userData.pulseTime || 0) + deltaTime * 0.001;
              const pulseScale = 1 + Math.sin(hotspot.userData.pulseTime * 2) * 0.1;
              
              // Apply hover effect
              if (hotspot.userData.isHovered) {
                hotspot.scale.setScalar(pulseScale * 1.2);
              } else {
                hotspot.scale.setScalar(pulseScale);
              }
              
              // Make hotspot always face camera
              hotspot.lookAt(camera.position);
            }
          });
        }
        
        // Update camera rotation only if changed
        const newLat = Math.max(-85, Math.min(85, lat.current));
        const hasRotationChanged = Math.abs(newLat - lat.current) > 0.01 || 
                                   Math.abs(lon.current - (camera.userData.lastLon || 0)) > 0.01;
        
        if (hasRotationChanged) {
          lat.current = newLat;
          const phi = THREE.MathUtils.degToRad(90 - lat.current);
          const theta = THREE.MathUtils.degToRad(lon.current);
    
          // Optimize vector calculations
          const sinPhi = Math.sin(phi);
          const cosPhi = Math.cos(phi);
          const sinTheta = Math.sin(theta);
          const cosTheta = Math.cos(theta);
          
          const target = new THREE.Vector3(
            500 * sinPhi * cosTheta,
            500 * cosPhi,
            500 * sinPhi * sinTheta
          );
    
          camera.lookAt(target);
          camera.userData.lastLon = lon.current;
        }
        
        // Animate hotspots with Matterport-style effects
        if (hotspotsGroup) {
          hotspotsGroup.children.forEach((hotspot) => {
            if (hotspot instanceof THREE.Group) {
              // Update pulse animation
              hotspot.userData.pulseTime = (hotspot.userData.pulseTime || 0) + deltaTime * 0.001;
              
              // Animate outer pulse ring
              const pulseRing = hotspot.getObjectByName('pulseRing');
              if (pulseRing && pulseRing instanceof THREE.Mesh) {
                const pulseScale = 1 + Math.sin(hotspot.userData.pulseTime * 2) * 0.15;
                pulseRing.scale.set(pulseScale, pulseScale, 1);
                const material = pulseRing.material as THREE.MeshBasicMaterial;
                if (material) {
                  material.opacity = 0.1 + Math.sin(hotspot.userData.pulseTime * 2) * 0.1;
                }
              }
              
              // Animate main ring
              const ring = hotspot.getObjectByName('ring');
              if (ring && ring instanceof THREE.Mesh) {
                const material = ring.material as THREE.MeshBasicMaterial;
                if (material) {
                  material.opacity = hotspot.userData.isHovered ? 0.6 : 0.4;
                }
              }
              
              // Make hotspot face camera
              hotspot.lookAt(camera.position);
              
              // Smooth scale transition on hover
              const targetScale = hotspot.userData.isHovered ? 1.15 : 1;
              const currentScale = hotspot.scale.x;
              const newScale = currentScale + (targetScale - currentScale) * 0.15;
              hotspot.scale.set(newScale, newScale, newScale);
              
              // Rotate arrow for navigation hotspots
              const arrow = hotspot.children.find(child => 
                child instanceof THREE.Mesh && child.position.z === 0.3
              );
              if (arrow) {
                arrow.rotation.z = Math.sin(hotspot.userData.pulseTime) * 0.1;
              }
            }
          });
        }
        
        renderer.render(scene, camera);
        
        // Update tiles at a fixed interval for better performance
        if (timestamp - lastTileUpdate > TILE_UPDATE_INTERVAL) {
          lastTileUpdate = timestamp;
          updateVisibleTiles();
        }
      }
  
      // Mouse controls
      function onMouseDown(event: MouseEvent) {
        event.preventDefault();
        
        // Check if clicking on a hotspot in edit mode (for dragging)
        if (isEditMode && !event.shiftKey) {
          const rect = renderer.domElement.getBoundingClientRect();
          const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
          
          const raycaster = new THREE.Raycaster();
          raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
          
          // Check for hotspot intersection
          const intersects = raycaster.intersectObjects(hotspotsGroup.children, true);
          if (intersects.length > 0) {
            // Find the parent group that contains hotspot data
            let hotspotGroup = intersects[0].object;
            while (hotspotGroup && 
                   !hotspotGroup.userData.hotspot && 
                   hotspotGroup.parent && 
                   hotspotGroup.parent !== hotspotsGroup) {
              hotspotGroup = hotspotGroup.parent;
            }
            
            if (hotspotGroup && hotspotGroup.userData.hotspot) {
              // Start dragging this hotspot
              draggingHotspotRef.current = { ...hotspotGroup.userData.hotspot };
              isDraggingRef.current = true;
              renderer.domElement.style.cursor = 'move';
              return;
            }
          }
        }
        
        if (isEditMode && event.shiftKey) {
          // Create hotspot on shift+click
          const rect = renderer.domElement.getBoundingClientRect();
          const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
          
          // Convert mouse position to spherical coordinates
          const raycaster = new THREE.Raycaster();
          raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
          
          // Create a sphere at origin for raycasting
          const sphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 500);
          const intersectPoint = new THREE.Vector3();
          
          if (raycaster.ray.intersectSphere(sphere, intersectPoint)) {
            // Convert intersection to yaw/pitch matching camera coordinate system
            const distance = intersectPoint.length();
            
            // Calculate the angle from the intersection point
            const clickTheta = Math.atan2(intersectPoint.z, intersectPoint.x);
            
            // Add the current camera rotation to get absolute yaw
            // This accounts for where the camera is currently looking
            let yaw = THREE.MathUtils.radToDeg(clickTheta) + lon.current;
            
            // Normalize yaw to -180 to 180 range
            while (yaw > 180) yaw -= 360;
            while (yaw < -180) yaw += 360;
            
            // Calculate pitch for the click position
            const clickPitch = THREE.MathUtils.radToDeg(Math.asin(intersectPoint.y / distance));
            
            // Store the actual click pitch but display at floor level
            const actualPitch = clickPitch;
            
            // Create visual feedback at floor level but store actual pitch
            const tempMesh = createHotspotMesh(yaw, actualPitch, true);
            tempMesh.userData.isTemporary = true;
            hotspotsGroup.add(tempMesh);
            
            // Notify parent component with actual pitch for data storage
            onHotspotCreate?.(yaw, actualPitch);
          }
        } else if (!event.shiftKey) {
          // Check for hotspot clicks (only if not in edit mode)
          if (!isEditMode) {
            const rect = renderer.domElement.getBoundingClientRect();
            const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
            
            // Intersect with all objects in hotspot groups recursively
            const intersects = raycaster.intersectObjects(hotspotsGroup.children, true);
            if (intersects.length > 0) {
              // Find the parent group that contains hotspot data
              let hotspotGroup = intersects[0].object;
              while (hotspotGroup && !hotspotGroup.userData.hotspot && hotspotGroup.parent) {
                hotspotGroup = hotspotGroup.parent;
              }
              
              if (hotspotGroup && hotspotGroup.userData.hotspot) {
                handleHotspotClickWrapper(hotspotGroup.userData.hotspot);
                return; // Don't start dragging if clicking a hotspot
              }
            }
          }
          
          // Start drag
          mouseDown.current = true;
          mouseX.current = event.clientX;
          mouseY.current = event.clientY;
        }
      }
  
      function onMouseMove(event: MouseEvent) {
        const rect = renderer.domElement.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
        
        // Handle hotspot dragging in edit mode
        if (isDraggingRef.current && draggingHotspotRef.current) {
          // Create a sphere at origin for raycasting
          const sphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 500);
          const intersectPoint = new THREE.Vector3();
          
          if (raycaster.ray.intersectSphere(sphere, intersectPoint)) {
            // Calculate new position
            const distance = intersectPoint.length();
            const clickTheta = Math.atan2(intersectPoint.z, intersectPoint.x);
            let newYaw = THREE.MathUtils.radToDeg(clickTheta) + lon.current;
            while (newYaw > 180) newYaw -= 360;
            while (newYaw < -180) newYaw += 360;
            const newPitch = THREE.MathUtils.radToDeg(Math.asin(intersectPoint.y / distance));
            
            // Update the visual position of the hotspot being dragged
            const hotspotGroup = hotspotsGroup.children.find(child => 
              child.userData.hotspot?.id === draggingHotspotRef.current?.id
            );
            
            if (hotspotGroup) {
              // Update position
              const hotspotPhi = THREE.MathUtils.degToRad(90 - newPitch);
              const hotspotTheta = THREE.MathUtils.degToRad(newYaw);
              const radius = 490;
              
              const sinPhi = Math.sin(hotspotPhi);
              const cosPhi = Math.cos(hotspotPhi);
              const sinTheta = Math.sin(hotspotTheta);
              const cosTheta = Math.cos(hotspotTheta);
              
              hotspotGroup.position.set(
                radius * sinPhi * cosTheta,
                radius * cosPhi,
                radius * sinPhi * sinTheta
              );
              
              // Update the hotspot data
              draggingHotspotRef.current.yaw = newYaw;
              draggingHotspotRef.current.pitch = newPitch;
              
            }
          }
          
          renderer.domElement.style.cursor = 'move';
          event.preventDefault();
          return;
        }
        
        // Check for hotspot hover
        
        // Reset all hotspot hover states
        hotspotsGroup.children.forEach((hotspot) => {
          if (hotspot instanceof THREE.Group) {
            hotspot.userData.isHovered = false;
          }
        });
        
        // Check for hotspot intersection
        const intersects = raycaster.intersectObjects(hotspotsGroup.children, true);
        if (intersects.length > 0) {
          // Find the parent group that contains hotspot data
          let hotspotGroup: THREE.Object3D | null = intersects[0].object;
          while (hotspotGroup && !hotspotGroup.userData.hotspot && hotspotGroup.parent && hotspotGroup.parent !== hotspotsGroup) {
            hotspotGroup = hotspotGroup.parent;
          }
          
          if (hotspotGroup && hotspotGroup.userData.hotspot) {
            hotspotGroup.userData.isHovered = true;
            // Custom cursor styles based on hotspot type
            if (isEditMode) {
              renderer.domElement.style.cursor = 'move';
            } else {
              // Use different cursors for different hotspot types
              const hotspot = hotspotGroup.userData.hotspot;
              if (hotspot.kind === 'navigation') {
                // Show forward arrow cursor for navigation
                renderer.domElement.style.cursor = 'url("data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxMCIgZmlsbD0iIzAwQkNENCIgZmlsbC1vcGFjaXR5PSIwLjgiLz48cGF0aCBkPSJNMTIgOEwxNiAxMkwxMiAxNiIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48cGF0aCBkPSJNOCAxMkgxNiIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48L3N2Zz4=") 12 12, pointer';
              } else {
                renderer.domElement.style.cursor = 'pointer';
              }
            }
          }
        } else {
          renderer.domElement.style.cursor = mouseDown.current ? 'grabbing' : 'grab';
        }
        
        // Handle dragging for panorama navigation
        if (!mouseDown.current) return;
        
        // Calculate rotation speed based on viewport
        const rotationSpeed = 0.3;
        lon.current += (event.clientX - mouseX.current) * rotationSpeed;
        lat.current -= (event.clientY - mouseY.current) * rotationSpeed;
        
        // Normalize longitude to prevent accumulation
        while (lon.current > 180) lon.current -= 360;
        while (lon.current < -180) lon.current += 360;
        
        mouseX.current = event.clientX;
        mouseY.current = event.clientY;
        updateVisibleTiles();
      }
  
      function onMouseUp() {
        // Handle hotspot drag end
        if (isDraggingRef.current && draggingHotspotRef.current) {
          
          // Call the update function to save to database
          if (onHotspotUpdate && draggingHotspotRef.current) {
            onHotspotUpdate(draggingHotspotRef.current);
          }
          
          isDraggingRef.current = false;
          draggingHotspotRef.current = null;
          renderer.domElement.style.cursor = 'grab';
        }
        
        mouseDown.current = false;
      }
  
      let wheelTimeout: NodeJS.Timeout | null = null;
      let lastUpdateFov = fov.current;
      function onMouseWheel(event: WheelEvent) {
        event.preventDefault();
        const oldFov = fov.current;
        const deltaFov = event.deltaY * 0.05;
        // Limit minimum FOV to prevent excessive zoom blur
        const minFov = 10; // Allow more zoom in for Level 2
        const maxFov = 100;
        const newFov = THREE.MathUtils.clamp(fov.current + deltaFov, minFov, maxFov);
        
        // Only update if there's an actual change
        if (Math.abs(newFov - fov.current) > 0.01) {
          fov.current = newFov;
          camera.fov = fov.current;
          camera.updateProjectionMatrix();
          
          // Force immediate render to prevent blur
          if (rendererRef.current && sceneRef.current && cameraRef.current) {
            rendererRef.current.render(sceneRef.current, cameraRef.current);
          }
        }
        
        // Calculate if we're crossing a level threshold
        if (!manifest) return; // Guard against null manifest
        
        const oldLevel = getAppropriateLevel(oldFov, manifest.levels, containerRef.current?.clientWidth || 1920);
        const newLevel = getAppropriateLevel(fov.current, manifest.levels, containerRef.current?.clientWidth || 1920);
        
        // Immediate update if level changed or significant FOV change
        const fovChange = Math.abs(fov.current - lastUpdateFov);
        if (newLevel !== oldLevel || fovChange > 5) {
          updateVisibleTiles();
          lastUpdateFov = fov.current;
          
          // Preload adjacent level for smoother transitions
          if (fov.current < oldFov && newLevel < manifest.levels.length - 1) {
            // Zooming in - preload next higher level
            const nextLevel = newLevel + 1;
            const tiles = calculateVisibleTiles(
              { yaw: lon.current, pitch: lat.current, fov: fov.current },
              manifest.levels[nextLevel],
              manifest.originalWidth,
              manifest.originalHeight
            );
            tiles.slice(0, 4).forEach(({ col, row }) => {
              loadTile(nextLevel, col, row, false);
            });
          } else if (fov.current > oldFov && newLevel > 0) {
            // Zooming out - preload next lower level
            const prevLevel = newLevel - 1;
            const tiles = calculateVisibleTiles(
              { yaw: lon.current, pitch: lat.current, fov: fov.current },
              manifest.levels[prevLevel],
              manifest.originalWidth,
              manifest.originalHeight
            );
            tiles.slice(0, 4).forEach(({ col, row }) => {
              loadTile(prevLevel, col, row, false);
            });
          }
        }
        
        // Still throttle minor updates
        if (wheelTimeout) clearTimeout(wheelTimeout);
        wheelTimeout = setTimeout(() => {
          updateVisibleTiles();
        }, 50); // Reduced delay for faster response
      }
  
      
  
      // Handle window resize to maintain sharp rendering
      function onWindowResize() {
        if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
        
        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;
        
        cameraRef.current.aspect = width / height;
        cameraRef.current.updateProjectionMatrix();
        
        // Maintain consistent pixel ratio
        const pixelRatio = Math.min(window.devicePixelRatio, 2);
        rendererRef.current.setPixelRatio(pixelRatio);
        rendererRef.current.setSize(width, height);
        
        // Force render after resize
        if (sceneRef.current) {
          rendererRef.current.render(sceneRef.current, cameraRef.current);
        }
      }
      
      // Add event listeners
      renderer.domElement.addEventListener('mousedown', onMouseDown);
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      renderer.domElement.addEventListener('wheel', onMouseWheel);
      window.addEventListener('resize', onWindowResize);
  
      // Start animation
      animate(performance.now());
  
      // Cleanup
      return () => {
        if (animationIdRef.current) {
          cancelAnimationFrame(animationIdRef.current);
        }
        
        renderer.domElement.removeEventListener('mousedown', onMouseDown);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        renderer.domElement.removeEventListener('wheel', onMouseWheel);
        window.removeEventListener('resize', onWindowResize);
        
        // Clean up all loaded tiles
        loadedTiles.current.forEach(tile => {
          scene.remove(tile.mesh);
          tile.mesh.geometry.dispose();
          if (tile.mesh.material instanceof THREE.Material) {
            tile.mesh.material.dispose();
          }
          // Also remove seam mesh if it exists
          if (tile.seamMesh) {
            scene.remove(tile.seamMesh);
            if (tile.seamMesh instanceof THREE.Mesh) {
              tile.seamMesh.geometry.dispose();
            }
          }
          tile.texture.dispose();
        });
        loadedTiles.current.clear();
        
        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
        renderer.dispose();
      };
    }, [manifest, isEditMode]); // Removed currentScene.id to prevent re-initialization
  

  // Hotspot calculation
  const getHotspotScreenPosition = (hotspot: Hotspot) => {
    if (!cameraRef.current || !rendererRef.current) return null;

    const hotspotPhi = THREE.MathUtils.degToRad(90 - hotspot.pitch);
    const hotspotTheta = THREE.MathUtils.degToRad(hotspot.yaw);
    
    const vector = new THREE.Vector3(
      500 * Math.sin(hotspotPhi) * Math.cos(hotspotTheta),
      500 * Math.cos(hotspotPhi),
      500 * Math.sin(hotspotPhi) * Math.sin(hotspotTheta)
    );

    vector.project(cameraRef.current);
    if (vector.z > 1) return null;

    const x = (vector.x * 0.5 + 0.5) * rendererRef.current.domElement.clientWidth;
    const y = (-vector.y * 0.5 + 0.5) * rendererRef.current.domElement.clientHeight;

    return { x, y };
  };

  const handleHotspotClick = (hotspot: Hotspot) => {
    
    // // Handle navigation hotspots with walking transition
    if (hotspot.kind === 'navigation') {
      // Find the target scene for preloading
      let targetSceneId = hotspot.target_scene_id;
      if (!targetSceneId && hotspot.payload) {
        try {
          const payload = typeof hotspot.payload === 'string' 
            ? JSON.parse(hotspot.payload) 
            : hotspot.payload;
          targetSceneId = payload.targetSceneId;
        } catch (err) {
          console.error('Failed to parse hotspot payload:', err);
        }
      }
      
      // Load and create textures for the next scene immediately
      let textureLoadPromise: Promise<void> | null = null;
      
      // if (targetSceneId && scenes.length > 0) {
      //   const targetScene = scenes.find(s => s.id === targetSceneId);
      //   if (targetScene) {
      //     // Reset ready state
      //     nextSceneRef.current.isReady = false;
          
      //     // Create a promise to track texture loading
      //     textureLoadPromise = new Promise<void>((resolve) => {
      //       // First, load the preview image as a texture immediately
      //       const previewUrl = `https://test.thenimto.com/scenes/${targetScene.id}/tiles/preview.jpg` || targetScene.src_original_url
      //         || `https://test.thenimto.com/scenes/${targetScene.id}/tiles/preview.jpg`;
      //       const textureLoader = new THREE.TextureLoader();
      //       textureLoader.crossOrigin = 'anonymous';
            
      //       textureLoader.load(
      //         previewUrl,
      //         (texture) => {
      //           // Store the loaded texture for immediate use when scene changes
      //           texture.colorSpace = THREE.SRGBColorSpace;
      //           texture.minFilter = THREE.LinearFilter;
      //           texture.magFilter = THREE.LinearFilter;
                
      //           // Create a preview sphere with this texture (but don't add to scene yet)
      //           const geometry = new THREE.SphereGeometry(500, 60, 40);
      //           geometry.scale(-1, 1, 1);
      //           const material = new THREE.MeshBasicMaterial({ 
      //             map: texture,
      //             side: THREE.BackSide
      //           });
      //           const previewMesh = new THREE.Mesh(geometry, material);
                
      //           // Store for quick scene switch
      //           nextSceneRef.current.previewMesh = previewMesh;
      //           nextSceneRef.current.isReady = true;
      //           console.log('Preview texture loaded and mesh created for instant display');
      //           resolve();
      //         },
      //         undefined,
      //         (error) => {
      //           console.error('Failed to load preview texture:', error);
      //           resolve(); // Resolve anyway to continue
      //         }
      //       );
      //     });
          
      //     // Also prepare the tile manifest
      //     if (targetScene.tiles_manifest) {
      //       try {
      //         const nextManifest = typeof targetScene.tiles_manifest === 'string'
      //           ? JSON.parse(targetScene.tiles_manifest)
      //           : targetScene.tiles_manifest;
              
      //         // Store next scene info for seamless switching
      //         nextSceneRef.current.manifest = nextManifest;
      //         nextSceneRef.current.sceneId = targetSceneId;
              
      //         // Load tiles in background for higher quality
      //         if (nextManifest.basePath && nextManifest.levels && nextManifest.levels.length > 0) {
      //           const previewLevel = nextManifest.levels[0];
                
      //           // Load center tiles first for immediate display
      //           const centerCol = Math.floor(previewLevel.tilesX / 2);
      //           const centerRow = Math.floor(previewLevel.tilesY / 2);
                
      //           // Load center and surrounding tiles
      //           for (let c = Math.max(0, centerCol - 1); c <= Math.min(previewLevel.tilesX - 1, centerCol + 1); c++) {
      //             for (let r = Math.max(0, centerRow - 1); r <= Math.min(previewLevel.tilesY - 1, centerRow + 1); r++) {
      //               const tileUrl = `${nextManifest.basePath}/l${previewLevel.level}/${c}/${r}.${nextManifest.tileFormat || 'jpg'}`;
                    
      //               // Preload as image for browser cache
      //               const img = new Image();
      //               img.crossOrigin = 'anonymous';
      //               img.src = tileUrl;
      //             }
      //           }
      //         }
      //       } catch (err) {
      //         console.error('Failed to prepare next scene:', err);
      //       }
      //     }
      //   }
      // }
      
      // Start animation immediately, load textures in parallel
      const startAnimation = async () => {
        setIsAnimation(true);
        // Start loading textures in background - don't wait
        // if (textureLoadPromise) {
        //   textureLoadPromise.then(() => {
        //     console.log('Textures loaded and ready for scene switch');
        //   }).catch(err => {
        //     console.error('Failed to load textures:', err);
        //   });
        // }
        
        // Move towards hotspot direction looking forward at horizon
        transitionTargetRef.current = { 
          yaw: hotspot.yaw, 
          pitch: 0  // Look straight ahead at horizon, not down
        };
        
        // Store initial values for smooth animation
        const startFov = fov.current;
        const targetFov = 5; // More zoom to move closer to hotspot
        const startLon = lon.current;
        const startLat = lat.current;
        
        // Calculate shortest rotation path to target
        let targetLon = hotspot.yaw;
        let lonDiff = targetLon - startLon;
        if (lonDiff > 180) lonDiff -= 360;
        if (lonDiff < -180) lonDiff += 360;
        targetLon = startLon + lonDiff;
        
        // Calculate distance to hotspot based on current FOV and desired proximity
        const distanceToHotspot = Math.abs(lonDiff) + Math.abs(lat.current - 0);
        const baseAnimationDuration = 2000; // Base 2 seconds
        const maxAnimationDuration = 6000; // Max 6 seconds
        
        // Scale animation duration based on distance (longer for farther hotspots)
        const animationDuration = Math.min(
          maxAnimationDuration,
          baseAnimationDuration + (distanceToHotspot * 10)
        );
        
        let animationProgress = 0;
        const startTime = Date.now();
        let isAnimating = true;
        let sceneChanged = false;
      
      // Animate the walking effect with ultra-smooth easing
      const animateWalking = () => {
        if (!isAnimating) return;
        
        const elapsed = Date.now() - startTime;
        animationProgress = Math.min(elapsed / animationDuration, 1);
        
        // Ultra-smooth easing function (ease-in-out-sine for smoothest feel)
        const easeInOutSine = (t: number) => {
          return -(Math.cos(Math.PI * t) - 1) / 2;
        };
        
        const progress = easeInOutSine(animationProgress);
        
        // Smooth camera rotation towards target
        lon.current = startLon + (targetLon - startLon) * progress;
        lat.current = startLat + (0 - startLat) * progress; // Move to horizon
        
        // Gradual zoom for forward movement feeling - getting closer to hotspot
        fov.current = startFov - (startFov - targetFov) * progress;
        
        if (cameraRef.current) {
          cameraRef.current.fov = fov.current;
          cameraRef.current.updateProjectionMatrix();
        }
        
        // Change scene when we're 80% of the way there (close to hotspot)
        if (animationProgress >= 0.9 && !sceneChanged) {
          sceneChanged = true;
          
          // If we have a preloaded mesh, swap it in immediately
          if (nextSceneRef.current.isReady && nextSceneRef.current.previewMesh && sceneRef.current) {
            console.log('Swapping to preloaded scene mesh');    
            
            // Remove old preview mesh if exists
            // const oldPreview = sceneRef.current.children.find(child => 
            //   child.userData.isPreview
            // );
            // if (oldPreview) {
            //   sceneRef.current.remove(oldPreview);
            //   if (oldPreview instanceof THREE.Mesh) {
            //     oldPreview.geometry.dispose();
            //     if (oldPreview.material instanceof THREE.MeshBasicMaterial) {
            //       oldPreview.material.map?.dispose();
            //       oldPreview.material.dispose();
            //     }
            //   }
            // }
            
            // Add the preloaded mesh
            // nextSceneRef.current.previewMesh.userData.isPreview = true;
            // sceneRef.current.add(nextSceneRef.current.previewMesh);
          }
          
          // Trigger scene change
          if (targetSceneId) {
            console.log('Walking to scene:', targetSceneId);
            setIsAnimation(false);
            onSceneChange?.(targetSceneId);
            
          }
        }
        
        if (animationProgress < 1) {
          requestAnimationFrame(animateWalking);
        } else {
          // Animation complete
          isAnimating = false;
          
          // Smoothly reset FOV after animation completes
          const resetFov = () => {
            const currentFov = fov.current;
            const targetResetFov = 75;
            let resetProgress = 0;
            const resetDuration = 1200; // 1.2 seconds for smooth reset
            const resetStartTime = Date.now();
            
            const animateReset = () => {
              const elapsed = Date.now() - resetStartTime;
              resetProgress = Math.min(elapsed / resetDuration, 1);
              
              if (resetProgress < 1) {
                // Smooth ease-out for natural deceleration
                const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
                fov.current = currentFov + (targetResetFov - currentFov) * easeOut(resetProgress);
                if (cameraRef.current) {
                  cameraRef.current.fov = fov.current;
                  cameraRef.current.updateProjectionMatrix();
                }
                requestAnimationFrame(animateReset);
              } else {
                // Cleanup transition refs
                transitionTargetRef.current = null;
              }
            };
            
            animateReset();
          };
          
          // Start FOV reset smoothly
          resetFov();
        }
      };
      
        requestAnimationFrame(animateWalking);
      };
      
      // Start the animation after textures are loaded
      startAnimation();
      return;
    }
    
    // Call the general hotspot click handler
    onHotspotClick?.(hotspot);
  };

  // Update hotspots when they change
  useEffect(() => {
    updateHotspots();
  }, [hotspots, updateHotspots]);

  if (!manifest) {
    // Fallback to regular viewer if no multires
    return null;
  }

  return (
    <div className="relative w-full h-full bg-black">
      <style>{`
        @keyframes fadeIn {
          0% { 
            opacity: 0;
          }
          100% { 
            opacity: 1;
          }
        }
        
        .walking-transition {
          transform: scale(1.03);
          transition: transform 3s cubic-bezier(0.22, 0.61, 0.36, 1);
        }
      `}</style>
      <div
        ref={containerRef}
        className="relative w-full h-full"
        style={{
          backgroundColor: 'transparent', // No black background
          transformOrigin: 'center center',
          opacity: 1, // Always fully visible
          visibility: 'visible' // Always visible
        }}
      />

      {/* No loading indicator - animation starts immediately */}

      {/* Hotspots overlay */}
      {!isLoading && !error && currentScene.hotspots?.map((hotspot) => {
        const position = getHotspotScreenPosition(hotspot);
        if (!position) return null;

        return (
          <div
            key={hotspot.id}
            className="absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer z-20"
            style={{ left: `${position.x}px`, top: `${position.y}px` }}
            onClick={() => handleHotspotClick(hotspot)}
          >
            <div className="relative group">
              <div className={`
                w-12 h-12 rounded-full flex items-center justify-center
                transition-all duration-200 group-hover:scale-110
                ${hotspot.kind === 'navigation' ? 'bg-blue-500' : 'bg-green-500'}
                bg-opacity-80 group-hover:bg-opacity-100
              `}>
                <span className="text-white text-xl">
                  {hotspot.kind === 'navigation' && '➤'}
                  {hotspot.kind === 'info' && 'ℹ'}
                  {hotspot.kind === 'image' && '🖼'}
                  {hotspot.kind === 'video' && '▶'}
                  {hotspot.kind === 'link' && '🔗'}
                  {hotspot.kind === 'text' && '📝'}
                </span>
              </div>
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 
                              opacity-0 group-hover:opacity-100 transition-opacity
                              bg-black bg-opacity-75 text-white px-2 py-1 rounded text-sm
                              whitespace-nowrap pointer-events-none">
                {hotspot.kind}
              </div>
            </div>
          </div>
        );
      })}

      {/* Edit mode UI */}
      {isEditMode && (
        <div className="absolute top-4 left-4 bg-gray-900 bg-opacity-90 text-white p-4 rounded-xl shadow-2xl z-30 backdrop-blur-sm">
          <h3 className="font-bold mb-3 text-lg flex items-center gap-2">
            <span className="text-2xl">📍</span> Edit Mode
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 p-2 bg-blue-600 bg-opacity-20 rounded-lg">
              <kbd className="px-2 py-1 bg-gray-800 rounded text-xs font-mono">Shift</kbd>
              <span>+</span>
              <kbd className="px-2 py-1 bg-gray-800 rounded text-xs font-mono">Click</kbd>
              <span className="ml-2">Place new hotspot</span>
            </div>
            <div className="flex items-center gap-2 p-2 bg-green-600 bg-opacity-20 rounded-lg">
              <span className="text-xs">✋</span>
              <kbd className="px-2 py-1 bg-gray-800 rounded text-xs font-mono">Drag</kbd>
              <span className="ml-2">Move existing hotspot</span>
            </div>
            <div className="flex items-center gap-2 p-2 bg-gray-700 bg-opacity-30 rounded-lg">
              <span className="text-xs">💡</span>
              <span>Drag panorama to look around</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-700 space-y-2">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-5 h-5 bg-cyan-500 rounded-full animate-pulse"></div>
                <div className="absolute inset-0 w-5 h-5 bg-cyan-500 rounded-full animate-ping opacity-30"></div>
              </div>
              <span className="text-xs text-gray-300">Navigation Point</span>
            </div>
          </div>
        </div>
      )}

      {/* Info panel */}
      <div className="absolute top-4 right-4 bg-black bg-opacity-50 text-white p-3 rounded pointer-events-none z-10">
        <h3 className="text-lg font-semibold">{currentScene.name}</h3>
        <p className="text-sm opacity-75">Level: {currentLevel + 1}/{manifest.levels.length}</p>
        <p className="text-sm opacity-75">Tiles loaded: {loadedTiles.current.size}</p>
      </div>

      {/* Controls */}
      <div className="absolute bottom-4 right-4 flex gap-2 z-10">
        <button
          onClick={() => {
            fov.current = Math.max(20, fov.current - 10); // Allow more zoom in
            if (cameraRef.current) {
              cameraRef.current.fov = fov.current;
              cameraRef.current.updateProjectionMatrix();
            }
            updateVisibleTiles();
          }}
          className="px-3 py-2 bg-black bg-opacity-50 text-white rounded hover:bg-opacity-70"
        >
          🔍+
        </button>
        <button
          onClick={() => {
            fov.current = Math.min(100, fov.current + 10); // Allow zoom out to 100 for Level 0
            if (cameraRef.current) {
              cameraRef.current.fov = fov.current;
              cameraRef.current.updateProjectionMatrix();
            }
            updateVisibleTiles();
          }}
          className="px-3 py-2 bg-black bg-opacity-50 text-white rounded hover:bg-opacity-70"
        >
          🔍-
        </button>
      </div>
    </div>
  );
}