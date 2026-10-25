export interface BaseModel {
  created_at: string;
  updated_at: string;
  updated_by?: string;
  created_by?: string;
}

// A room label placed on the tour's intro 3D model; clicking it opens that scene
export interface IntroModelRoom {
  sceneId: string;
  label?: string;
  position: [number, number, number]; // in the intro viewer's normalized model space
}

// Rooms read from a floor plan image by the server (dollhouse builder)
export interface FloorPlanAnalysis {
  /** Real-world width of the whole image, meters */
  plan_width_meters: number;
  scale_source: 'dimensions' | 'estimated';
  /** 0 when the plan doesn't state it */
  ceiling_height_meters: number;
  notes: string;
  rooms: {
    name: string;
    /** Suggested 360° photo for this room, or "" */
    scene_id: string;
    /** Normalized image coordinates (0..1, origin top left) */
    corners: { x: number; y: number }[];
  }[];
}

// Room layout measured with the Android capture app (ARCore). Meters, one shared frame for all rooms.
export interface BuildingScan {
  version: 1;
  captured_at: string;
  device: string;
  rooms: {
    name: string;
    scene_id: string;
    /** Floor corners [x, z] */
    corners: [number, number][];
    /** 0 when not measured */
    ceiling_height: number;
    /** Where the 360° photo was taken [x, z] */
    photo_spot: [number, number] | null;
  }[];
}

export interface Tour extends BaseModel {
  id: string;
  name: string;
  user_id?: string;
  property_id?: string;
  property_name?: string;
  autoplay_json?: string;
  background_audio_url?: string;
  is_published: boolean;
  is_featured_on_homepage: boolean;
  autoplay_enabled: boolean;
  is_paid?: boolean;
  source?: string;
  categories?: string[];
  default_fov: number;
  default_yaw_speed: number;
  default_pitch_speed: number;
  auto_change_enabled?: boolean;
  auto_change_interval?: number;
  auto_change_mode?: string;
  auto_pause_on_interaction?: boolean;
  auto_restart_delay?: number;
  cover_image_url?: string;
  thumbnail_url?: string;
  intro_model_url?: string | null; // 3D model (.glb) shown before the 360° tour starts
  intro_model_rooms?: IntroModelRoom[] | null; // clickable room labels on the intro model
  building_scan?: BuildingScan | null; // rooms measured with the Android capture app
  tour_scenes: TourScene[];
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
  kind: 'text' | 'image' | 'video' | 'html' | 'badge' | 'tooltip' | 'model';
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

  // Optional points the camera curves through between start and end
  // move/hold are optional milliseconds: travel time to the point and pause at it
  waypoints?: { yaw: number; pitch: number; fov: number; move?: number; hold?: number }[] | null;

  start_hold?: number; // milliseconds to stay on the start view before moving
  move_duration: number; // milliseconds (with point times: the last leg into the end view)
  wait_duration: number; // milliseconds
  transition_direction?: 'forward' | 'backward' | 'up' | 'down' | 'left' | 'right';
  title?: string;
  description?: string;
}