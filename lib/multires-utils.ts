/**
 * Client-side utilities for multiresolution image viewing
 * This file contains only browser-safe code (no Node.js dependencies)
 */

export interface MultiresManifest {
  type: string;
  originalWidth: number;
  originalHeight: number;
  tileSize: number;
  levels: TileLevel[];
  preview?: string;
  tiles?: TileInfo[];
  overlap?: number;
  format?: string;
}

export interface TileLevel {
  level: number;
  width: number;
  height: number;
  tileSize: number;
  cols: number;
  rows: number;
  tilesX: number;
  tilesY: number;

}

export interface TileInfo {
  level: number;
  col: number;
  row: number;
  url: string;
  key?: string;
}

export interface Viewport {
  yaw: number;
  pitch: number;
  fov: number;
}

/**
 * Calculate which tiles are visible in the current viewport
 */
export function calculateVisibleTiles(
  viewport: Viewport,
  level: TileLevel,
  originalWidth: number,
  originalHeight: number
): Array<{ col: number; row: number }> {
  const visibleTiles: Array<{ col: number; row: number }> = [];
  
  // Make sure we have valid level data
  if (!level.cols || !level.rows) {
    return visibleTiles;
  }
  
  // Calculate which tiles are visible based on viewport
  // Convert yaw/pitch to UV coordinates (0-1 range)
  const centerU = (viewport.yaw + 180) / 360;
  const centerV = (viewport.pitch + 90) / 180;
  
  // Calculate FOV coverage in UV space
  const fovRadians = (viewport.fov * Math.PI) / 180;
  const horizontalCoverage = fovRadians / (2 * Math.PI); // Fraction of 360 degrees
  const verticalCoverage = fovRadians / Math.PI; // Fraction of 180 degrees
  
  // Always load all tiles for better coverage
  // This ensures no missing tiles at any zoom level
  for (let row = 0; row < level.rows; row++) {
    for (let col = 0; col < level.cols; col++) {
      visibleTiles.push({ col, row });
    }
  }
  // return visibleTiles;
  
  // Add larger margin to ensure complete coverage
  const margin = 0.5; // 50% margin for better coverage
  const uMin = centerU - horizontalCoverage * (1 + margin);
  const uMax = centerU + horizontalCoverage * (1 + margin);
  const vMin = Math.max(0, centerV - verticalCoverage * (1 + margin));
  const vMax = Math.min(1, centerV + verticalCoverage * (1 + margin));
  
  // Calculate which tiles intersect with the visible area
  for (let row = 0; row < level.rows; row++) {
    const tileVMin = row / level.rows;
    const tileVMax = (row + 1) / level.rows;
    
    // Check if tile is in vertical range
    if (tileVMax < vMin || tileVMin > vMax) {
      continue;
    }
    
    for (let col = 0; col < level.cols; col++) {
      const tileUMin = col / level.cols;
      const tileUMax = (col + 1) / level.cols;
      
      // Check horizontal range with wraparound
      let isVisible = false;
      
      // Handle wraparound at 360 degrees
      if (uMin < 0) {
        // Viewport wraps around left edge
        isVisible = tileUMax >= (1 + uMin) || tileUMin <= uMax;
      } else if (uMax > 1) {
        // Viewport wraps around right edge
        isVisible = tileUMin <= (uMax - 1) || tileUMax >= uMin;
      } else {
        // No wraparound
        isVisible = !(tileUMax < uMin || tileUMin > uMax);
      }
      
      if (isVisible) {
        visibleTiles.push({ col, row });
      }
    }
  }
  
  return visibleTiles;
}

/**
 * Get the appropriate level based on current zoom
 */
export function getAppropriateLevel(
  fov: number,
  levels: TileLevel[],
  viewportWidth: number
): number {
  // Advanced level selection for smooth transitions
  // Lower FOV = more zoomed in = need higher resolution (higher level index)
  
  if (!levels || levels.length === 0) return 0;
  
  const numLevels = levels.length;
  
  // Skip the automatic calculation for now - use FOV-based selection directly
  // The pixel-per-degree calculation doesn't work well with our tile setup
  
  // Enhanced selection for different level counts
  // FOV ranges: 5-100 degrees
  // Level selection based on zoom amount with smoother transitions
  if (numLevels === 5) {
    // Optimized for 5-level pyramid with clearer thresholds
    // Remember: after sorting, level 0 is lowest res, level 4 is highest res
    if (fov <= 15) return 4;      // Ultra zoom - highest resolution (level 4)
    else if (fov <= 25) return 3; // High zoom (level 3)
    else if (fov <= 40) return 2; // Medium zoom (level 2)
    else if (fov <= 60) return 1; // Light zoom (level 1)
    else return 0;                // Wide view (level 0)
  } else if (numLevels === 4) {
    // 4-level pyramid
    if (fov <= 20) return 3;
    else if (fov <= 35) return 2;
    else if (fov <= 55) return 1;
    else return 0;
  } else if (numLevels === 2) {
    // 2-level pyramid: level 0 (low res) and level 1 (full res)
    // Switch to full resolution early for better quality
    if (fov <= 90) return 1;      // Use full resolution for most views
    else return 0;                // Only very wide view uses low resolution
  } else if (numLevels === 3) {
    // 3-level pyramid - optimized for quality at high zoom
    // Level 2 should be used more aggressively to prevent blur
    if (fov <= 50) return 2;      // Use Level 2 earlier for better quality
    else if (fov <= 75) return 1; // Medium zoom - use medium resolution (level 1)
    else return 0;                // Wide view (FOV > 75) - use base resolution (level 0)
  } else {
    // Dynamic selection for other level counts
    const fovRange = 100 - 5;
    const levelStep = fovRange / numLevels;
    const levelIndex = Math.floor((100 - fov) / levelStep);
    return Math.max(0, Math.min(numLevels - 1, levelIndex));
  }
}