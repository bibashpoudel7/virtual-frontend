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
  // USE ALL LEVELS for optimal quality/performance balance
  if (numLevels === 5) {
    // Optimized for 5-level pyramid with progressive quality
    // Remember: after sorting, level 0 is lowest res, level 4 is highest res
    if (fov <= 15) return 4;      // Ultra zoom - highest resolution
    else if (fov <= 25) return 3; // High zoom
    else if (fov <= 40) return 2; // Medium zoom
    else if (fov <= 60) return 1; // Light zoom
    else return 0;                // Wide view - base resolution
  } else if (numLevels === 4) {
    // 4-level pyramid - use all levels
    if (fov <= 20) return 3;      // High zoom - highest resolution
    else if (fov <= 35) return 2; // Medium zoom
    else if (fov <= 55) return 1; // Light zoom
    else return 0;                // Wide view - base resolution
  } else if (numLevels === 2) {
    // 2-level pyramid: level 0 (low res) and level 1 (full res)
    // Switch to full resolution early for better quality
    if (fov <= 90) return 1;      // Use full resolution for most views
    else return 0;                // Only very wide view uses low resolution
  } else if (numLevels === 3) {
    // 3-level pyramid (level 0: low res, level 1: medium, level 2: high res)
    // Optimize for better quality at all zoom levels
    if (fov <= 40) return 2;      // Zoomed in - use highest resolution (level 2)
    else if (fov <= 80) return 1; // Normal view - use medium resolution (level 1)
    else return 0;                // Wide/zoomed out - use base resolution (level 0)
  } else {
    // Dynamic selection for other level counts
    const fovRange = 100 - 5;
    const levelStep = fovRange / numLevels;
    const levelIndex = Math.floor((100 - fov) / levelStep);
    return Math.max(0, Math.min(numLevels - 1, levelIndex));
  }
}