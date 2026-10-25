import { Scene } from '@/types/tour';

// Small preview image for a scene: manifest preview first, then the `_thumb` upload convention
export function getSceneThumbnail(scene: Scene): string | undefined {
  if (scene.tiles_manifest) {
    try {
      const manifest = typeof scene.tiles_manifest === 'string'
        ? JSON.parse(scene.tiles_manifest)
        : scene.tiles_manifest;
      if (manifest?.preview) return manifest.preview;
    } catch {
      // Fall through to the URL convention
    }
  }
  return scene.src_original_url?.replace(/\.(jpg|jpeg|png)$/i, '_thumb.$1');
}
