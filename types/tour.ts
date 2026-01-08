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
  tiles_manifest?: any;
  yaw: number;
  pitch: number;
  fov: number;
  order: number;
  priority: number;
  tour_id: string;
  hotspots: Hotspot[];
  overlays: Overlay[];
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
  // Target camera direction after navigating to the new scene (Matterport-style)
  target_yaw?: number;
  target_pitch?: number;
  transition_direction?: 'forward' | 'backward' | 'up' | 'down' | 'left' | 'right';
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
  // Target camera direction after navigating (Matterport-style)
  target_yaw?: number;
  target_pitch?: number;
  payload?: Record<string, any>;
  tour_id: string;
  target_scene_id: string;
}

export interface PlayTour extends BaseModel {
  id: string;
  tour_id: string;
  name: string;
  user_id: string;
  play_tour_scenes: PlayTourScene[];
}

export interface PlayTourScene extends BaseModel {
  id: string;
  play_tour_id: string;
  scene_id: string;
  sequence_order: number;

  // Start camera position
  start_yaw: number;
  start_pitch: number;
  start_fov: number;

  // End camera position
  end_yaw: number;
  end_pitch: number;
  end_fov: number;

  move_duration: number; // milliseconds
  wait_duration: number; // milliseconds
  transition_direction?: 'forward' | 'backward' | 'up' | 'down' | 'left' | 'right';
  title?: string;
  description?: string;
}