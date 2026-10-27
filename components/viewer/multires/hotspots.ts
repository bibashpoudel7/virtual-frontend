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

  context.clearRect(0, 0, size, size);
  
  // Draw outer glow
  const gradient = context.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, color);
  gradient.addColorStop(0.7, color + '80'); 
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  
  // Draw solid center circle
  context.beginPath();
  context.arc(size / 2, size / 2, size * 0.15, 0, 2 * Math.PI);
  context.fillStyle = '#ffffff';
  context.fill();
  
  // Draw colored border
  context.beginPath();
  context.arc(size / 2, size / 2, size * 0.15, 0, 2 * Math.PI);
  context.strokeStyle = color;
  context.lineWidth = 4;
  context.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  hotspotTextureCache[color] = texture;
  return texture;
}

function createTextTexture(text: string, maxWidth: number = 200): THREE.Texture {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  
  if (!context) {
    return new THREE.Texture();
  }

  // Set font and measure text
  const fontSize = 16;
  const font = `${fontSize}px Arial, sans-serif`;
  context.font = font;
  
  // Wrap text if too long
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const width = context.measureText(currentLine + ' ' + word).width;
    if (width < maxWidth) {
      currentLine += ' ' + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  lines.push(currentLine);

  // Calculate canvas size
  const lineHeight = fontSize * 1.2;
  const textWidth = Math.max(...lines.map(line => context.measureText(line).width));
  const textHeight = lines.length * lineHeight;
  const padding = 8;
  
  canvas.width = Math.max(textWidth + padding * 2, 60);
  canvas.height = textHeight + padding * 2;

  // Redraw with proper canvas size
  context.font = font;
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  // Draw background
  context.fillStyle = 'rgba(0, 0, 0, 0.7)';
  context.roundRect(0, 0, canvas.width, canvas.height, 6);
  context.fill();

  // Draw text
  context.fillStyle = '#ffffff';
  const startY = canvas.height / 2 - (lines.length - 1) * lineHeight / 2;
  
  lines.forEach((line, index) => {
    const y = startY + index * lineHeight;
    context.fillText(line, canvas.width / 2, y);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function getHotspotLabel(hotspot: Hotspot, scenes?: any[]): string {
  try {
    const payload = JSON.parse(hotspot.payload || '{}');
    
    // Check if there's a custom label in the payload
    if (payload.label) {
      return payload.label;
    }
    
    // Generate default labels based on hotspot type
    if (hotspot.kind === 'navigation') {
      // Try to get target scene name from payload.targetSceneId or hotspot.target_scene_id
      const targetSceneId = payload.targetSceneId || hotspot.target_scene_id;
      if (targetSceneId && scenes) {
        const targetScene = scenes.find(s => s.id === targetSceneId);
        if (targetScene) {
          return `Go to ${targetScene.name}`;
        }
      }
      return `Go to Scene`;
    } else if (hotspot.kind === 'info' && payload.infoText) {
      return payload.infoText.length > 30 
        ? `${payload.infoText.substring(0, 30)}...` 
        : payload.infoText;
    } else if (hotspot.kind === 'link' && payload.url) {
      try {
        const urlObj = new URL(payload.url);
        return `Visit ${urlObj.hostname}`;
      } catch {
        return 'External Link';
      }
    }
  } catch {
    // Fallback
  }
  
  return hotspot.kind.charAt(0).toUpperCase() + hotspot.kind.slice(1);
}

export function createHotspotSprite(hotspot: Hotspot, scenes?: any[]): THREE.Group {
  const color = hotspot.kind === 'navigation' ? NAV_HOTSPOT_COLOR : INFO_HOTSPOT_COLOR;
  
  // Check for invalid coordinates
  if (isNaN(hotspot.yaw) || isNaN(hotspot.pitch)) {
    console.error('[createHotspotSprite] Invalid coordinates detected:', {
      yaw: hotspot.yaw,
      pitch: hotspot.pitch
    });
    // Use default coordinates if invalid
    hotspot.yaw = 0;
    hotspot.pitch = 0;
  }
  
  // Constrain hotspot coordinates to prevent extreme positions
  const constrainedYaw = THREE.MathUtils.clamp(hotspot.yaw, -180, 180);
  const constrainedPitch = THREE.MathUtils.clamp(hotspot.pitch, -80, 80);
  
  // Create group to hold both icon and text
  const group = new THREE.Group();
  // Use the same radius as the picking sphere for accurate positioning
  const position = yawPitchToVector(constrainedYaw, constrainedPitch, SPHERE_RADIUS);
  group.position.copy(position);
  group.userData.hotspot = hotspot;
  
  // Ensure group is always visible
  group.visible = true;
  group.frustumCulled = false;
  
  // Create hotspot icon sprite
  const iconTexture = createHotspotTexture(color);
  const iconMaterial = new THREE.SpriteMaterial({
    map: iconTexture,
    transparent: true,
    depthWrite: false,
    depthTest: true,
  });
  const iconSprite = new THREE.Sprite(iconMaterial);
  iconSprite.scale.setScalar(100);
  iconSprite.renderOrder = 1000;
  iconSprite.frustumCulled = false;
  group.add(iconSprite);
  
  // Create text label sprite
  const label = getHotspotLabel(hotspot, scenes);
  
  const textTexture = createTextTexture(label);
  const textMaterial = new THREE.SpriteMaterial({
    map: textTexture,
    transparent: true,
    depthWrite: false,
    depthTest: true,
  });
  const textSprite = new THREE.Sprite(textMaterial);
  textSprite.scale.set(textTexture.image.width * 0.6, textTexture.image.height * 0.6, 1);
  textSprite.position.set(0, -50, 0); // Position below the icon
  textSprite.renderOrder = 999;
  textSprite.frustumCulled = false;
  group.add(textSprite);
  
  return group;
}
