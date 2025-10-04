import * as THREE from 'three';
import type { Hotspot } from '@/types/tour';
import { INFO_HOTSPOT_COLOR, NAV_HOTSPOT_COLOR, SPHERE_RADIUS } from './constants';
import { yawPitchToVector } from './geometry';

const hotspotTextureCache: Record<string, THREE.Texture> = {};

function createHotspotTexture(color: string): THREE.Texture {
  const cached = hotspotTextureCache[color];
  if (cached) {
    return cached;
  }

  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');

  if (!context) {
    const texture = new THREE.Texture();
    hotspotTextureCache[color] = texture;
    return texture;
  }

  const gradient = context.createRadialGradient(size / 2, size / 2, size * 0.2, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(0.5, color);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');

  context.clearRect(0, 0, size, size);
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  hotspotTextureCache[color] = texture;
  return texture;
}

export function createHotspotSprite(hotspot: Hotspot): THREE.Sprite {
  const texture = createHotspotTexture(hotspot.kind === 'navigation' ? NAV_HOTSPOT_COLOR : INFO_HOTSPOT_COLOR);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: true,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.setScalar(26);
  sprite.position.copy(yawPitchToVector(hotspot.yaw, hotspot.pitch, SPHERE_RADIUS - 5));
  sprite.userData.hotspot = hotspot;
  return sprite;
}
