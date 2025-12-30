export interface BaseModel {
  created_at: string;
  updated_at: string;
  updated_by?: string;
  created_by?: string;
}

export interface Tour extends BaseModel {
  id: string;
  name: string;
  user_id?: string;
  property_id?: string;
  property_name?: string; // Added property name
  autoplay_json?: string;
  background_audio_url?: string;
  is_published: boolean;
  autoplay_enabled?: boolean;
  is_paid?: boolean;
  source?: string;
  default_fov: number;
  default_yaw_speed: number;
  default_pitch_speed: number;
  auto_change_enabled?: boolean;
  auto_change_interval?: number;
  auto_change_mode?: string;
  auto_pause_on_interaction?: boolean;
  auto_restart_delay?: number;
  tour_scenes: TourScene[];
}

export interface Property {
  id: string;
  propertyName: string;
  slug: string;
  propertyType: string;
  companyName: string;
  hasTour: boolean;
}

export interface PropertiesResponse {
  properties: Property[];
  total: number;
}

export interface TourScene extends BaseModel {
  id: string;
  tour_id: string;
  scene_id: string;
  sequence_order: number;
}

export interface Scene extends BaseModel {
  id: string;
  name: string;
  type: 'image' | 'video' | '360';
  src_original_url?: string;
  cubemap_manifest_url?: string;
  yaw: number;
  pitch: number;
  fov: number;
  order: number;
  priority: number;
  tour_id: string;
  hotspots: Hotspot[];
  overlays: Overlay[];
  tiles_manifest?: any;
}
// interface TilesManifest {
//   type: string;
//   tileSize: number;
//   dimensions: {
//     width: number;
//     height: number;
//   };
//   preview: string;
//   levels: TileLevel[];
//   tiles: TileInfo[];
// }

// interface TileInfo {
// key: string;
// url: string;
// level: number;
// row: number;
// col: number;
// }

// interface TileLevel {
// level: number;
// width: number;
// height: number;
// tilesX: number;
// tilesY: number;
// }

export interface Hotspot {
  id?: string;
  tour_id: string;
  scene_id: string;
  target_scene_id?: string;
  kind: 'navigation' | 'info' | 'image' | 'icon' | 'text' | 'link' | 'video';
  yaw: number;
  pitch: number;
  payload?: string;
}

export interface Overlay {
  id?: string;
  tour_id: string;
  scene_id: string;
  kind: 'text' | 'image' | 'video' | 'html' | 'badge' | 'tooltip';
  yaw: number;
  pitch: number;
  payload?: string;
}

export interface GetUploadURLResponse {
  uploadUrl: string;
}

export interface ProcessCubemapRequest {
  cfImageUrl: string;
  keyPrefix?: string;
  ttlSeconds?: number;
}

export interface ProcessCubemapResponse {
  manifestUrl: string;
}

export interface CreateHotspotRequest {
  kind: string;
  yaw: number;
  pitch: number;
  payload?: Record<string, any>;
  tour_id: string;
  target_scene_id: string;
}