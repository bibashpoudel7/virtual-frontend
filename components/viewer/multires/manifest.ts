import type { Scene } from '@/types/tour';
import type { MultiresManifest, TileLevel } from '@/lib/multires-utils';
import type { ExtendedManifest } from './types';

function normalizeLevelsFromTiles(tiles: any[], tileSize: number): TileLevel[] {
  const levelsMap = new Map<number, TileLevel>();

  tiles.forEach((tile) => {
    if (typeof tile.level !== 'number') return;
    const existing = levelsMap.get(tile.level) ?? {
      level: tile.level,
      width: 0,
      height: 0,
      tileSize,
      cols: 0,
      rows: 0,
      tilesX: 0,
      tilesY: 0,
    };

    existing.cols = Math.max(existing.cols, (tile.col ?? 0) + 1);
    existing.rows = Math.max(existing.rows, (tile.row ?? 0) + 1);
    levelsMap.set(tile.level, existing);
  });

  return Array.from(levelsMap.values()).map((level) => ({
    ...level,
    width: level.cols * tileSize,
    height: level.rows * tileSize,
    tilesX: level.cols,
    tilesY: level.rows,
  }));
}

export function parseSceneManifest(scene: Scene): ExtendedManifest | null {
  const raw = scene.tiles_manifest;
  console.log('[parseSceneManifest] Raw tiles_manifest:', raw);
  
  if (!raw) {
    console.log('[parseSceneManifest] No tiles_manifest found');
    return null;
  }

  let manifestLike: any;
  try {
    // If it's already a string but might be double-encoded
    if (typeof raw === 'string' && raw.startsWith('"')) {
      // Double-encoded JSON string - parse twice
      const firstParse = JSON.parse(raw);
      manifestLike = typeof firstParse === 'string' ? JSON.parse(firstParse) : firstParse;
    } else {
      manifestLike = typeof raw === 'string' ? JSON.parse(raw) : raw;
    }
    console.log('[parseSceneManifest] Parsed manifest:', manifestLike);
  } catch (error) {
    console.error('[parseSceneManifest] Failed to parse tiles_manifest:', error, 'Raw value:', raw);
    return null;
  }

  // Check if manifestLike is null or undefined after parsing
  if (!manifestLike || typeof manifestLike !== 'object') {
    console.error('[parseSceneManifest] Parsed manifest is null or not an object:', manifestLike);
    return null;
  }

  const tileSize = manifestLike.tileSize ?? manifestLike.tile_size ?? 512;
  const tilesArray = Array.isArray(manifestLike.tiles) ? manifestLike.tiles : [];

  let levels = normalizeLevelsFromTiles(tilesArray, tileSize);
  if (!levels.length && Array.isArray(manifestLike.levels)) {
    levels = manifestLike.levels.map((level: any, index: number) => ({
      level: typeof level.level === 'number' ? level.level : index,
      width: level.width ?? (level.cols ?? level.tilesX ?? 1) * tileSize,
      height: level.height ?? (level.rows ?? level.tilesY ?? 1) * tileSize,
      tileSize,
      cols: level.cols ?? level.tilesX ?? 1,
      rows: level.rows ?? level.tilesY ?? 1,
      tilesX: level.tilesX ?? level.cols ?? 1,
      tilesY: level.tilesY ?? level.rows ?? 1,
    }));
  }

  levels.sort((a, b) => a.level - b.level);

  // Safely access nested properties with fallbacks
  const originalWidth =
    manifestLike.originalWidth ?? 
    manifestLike.dimensions?.width ?? 
    levels.at(-1)?.width ?? 
    4096;
  const originalHeight =
    manifestLike.originalHeight ?? 
    manifestLike.dimensions?.height ?? 
    levels.at(-1)?.height ?? 
    2048;

  const manifest: ExtendedManifest = {
    type: manifestLike.type ?? 'multires',
    originalWidth,
    originalHeight,
    tileSize,
    levels,
    preview: manifestLike.preview ?? manifestLike.previewUrl ?? manifestLike.preview_url,
    tiles: tilesArray.length
      ? tilesArray.map((tile: any) => ({
          level: tile.level,
          col: tile.col,
          row: tile.row,
          url: tile.url ?? tile.path ?? tile.href,
        }))
      : undefined,
    overlap: manifestLike.overlap,
    format: manifestLike.format ?? manifestLike.extension ?? (manifestLike.tiles_format ?? 'jpg'),
    basePath: manifestLike.basePath ?? manifestLike.base_path ?? manifestLike.baseURL ?? manifestLike.base_url,
  };

  return manifest;
}

export function buildTileUrl(
  manifest: ExtendedManifest,
  sceneId: string,
  level: number,
  col: number,
  row: number,
): string {
  const tileEntry = manifest.tiles?.find(
    (tile) => tile.level === level && tile.col === col && tile.row === row,
  );

  if (tileEntry?.url) {
    if (/^https?:\/\//i.test(tileEntry.url)) {
      console.log('[buildTileUrl] Using absolute URL from tile entry:', tileEntry.url);
      return tileEntry.url;
    }
    const url = new URL(tileEntry.url, window.location.origin).toString();
    console.log('[buildTileUrl] Using relative URL from tile entry:', url);
    return url;
  }

  let baseFromPreview: string | undefined;
  if (manifest.preview) {
    const absolutePreview = /^https?:\/\//i.test(manifest.preview)
      ? manifest.preview
      : new URL(manifest.preview, window.location.origin).toString();
    baseFromPreview = absolutePreview.replace(/\/preview\.[^/]+$/i, '');
  }

  const normalizedBase = (manifest.basePath ?? baseFromPreview ?? `${window.location.origin}/scenes/${sceneId}/tiles`).replace(/\/$/, '');
  const extension = manifest.format ?? 'jpg';
  const url = `${normalizedBase}/l${level}_${row}_${col}.${extension}`;
  
  console.log('[buildTileUrl] Constructed URL:', {
    basePath: normalizedBase,
    level,
    row,
    col,
    extension,
    finalUrl: url
  });
  
  return url;
}
