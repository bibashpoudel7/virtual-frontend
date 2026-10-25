import { PlayTourScene } from '@/types/tour';

export interface CameraPoint {
  yaw: number;
  pitch: number;
  fov: number;
  move?: number; // ms to travel here from the previous point (waypoints only)
  hold?: number; // ms to pause here (waypoints only)
}

type PathScene = Pick<PlayTourScene, 'start_yaw' | 'start_pitch' | 'start_fov' | 'end_yaw' | 'end_pitch' | 'end_fov' | 'waypoints'>;
type TimedPathScene = PathScene & Partial<Pick<PlayTourScene, 'move_duration' | 'start_hold'>>;

const finiteOrUndefined = (value: unknown) => (Number.isFinite(value) ? Number(value) : undefined);

// Waypoints arrive as an array, a JSON string, or null depending on where they came from
export function parseWaypoints(raw: unknown): CameraPoint[] {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value
    .filter(p => p && Number.isFinite(p.yaw) && Number.isFinite(p.pitch))
    .map(p => ({
      yaw: Number(p.yaw),
      pitch: Number(p.pitch),
      fov: Number.isFinite(p.fov) ? Number(p.fov) : 75,
      move: finiteOrUndefined(p.move),
      hold: finiteOrUndefined(p.hold),
    }));
}

/**
 * Start → waypoints → end, with yaw unwrapped so each step takes the short way round.
 * With no waypoints, "left"/"right" still force the turn direction like before.
 */
export function buildCameraPath(scene: PathScene, direction?: string): CameraPoint[] {
  const raw: CameraPoint[] = [
    { yaw: scene.start_yaw, pitch: scene.start_pitch, fov: scene.start_fov },
    ...parseWaypoints(scene.waypoints),
    { yaw: scene.end_yaw, pitch: scene.end_pitch, fov: scene.end_fov },
  ];

  const path: CameraPoint[] = [{ ...raw[0], yaw: raw[0].yaw % 360 }];
  for (let i = 1; i < raw.length; i++) {
    let diff = (raw[i].yaw - raw[i - 1].yaw) % 360;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    if (raw.length === 2) {
      if (direction === 'left' && diff > 0) diff -= 360;
      if (direction === 'right' && diff < 0) diff += 360;
    }
    path.push({ ...raw[i], yaw: path[i - 1].yaw + diff });
  }
  return path;
}

const catmullRom = (p0: number, p1: number, p2: number, p3: number, t: number) => {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
};

// Point on the smooth curve between path[segment] and path[segment + 1]
function sampleSegment(path: CameraPoint[], segment: number, local: number): CameraPoint {
  const p0 = path[Math.max(segment - 1, 0)];
  const p1 = path[segment];
  const p2 = path[segment + 1];
  const p3 = path[Math.min(segment + 2, path.length - 1)];
  return {
    yaw: catmullRom(p0.yaw, p1.yaw, p2.yaw, p3.yaw, local),
    pitch: Math.max(-85, Math.min(85, catmullRom(p0.pitch, p1.pitch, p2.pitch, p3.pitch, local))),
    fov: Math.max(20, Math.min(120, p1.fov + (p2.fov - p1.fov) * local)),
  };
}

/** Camera position at t (0..1) along a smooth curve through every point, at even angular speed. */
export function sampleCameraPath(path: CameraPoint[], t: number): CameraPoint {
  if (path.length === 0) return { yaw: 0, pitch: 0, fov: 75 };
  if (path.length === 1) return path[0];
  const clamped = Math.min(Math.max(t, 0), 1);

  // Spread time over segments by how far the camera turns in each
  const lengths = path.slice(1).map((p, i) => Math.hypot(p.yaw - path[i].yaw, p.pitch - path[i].pitch) || 0.001);
  const total = lengths.reduce((a, b) => a + b, 0);
  let distance = clamped * total;
  let segment = 0;
  while (segment < lengths.length - 1 && distance > lengths[segment]) {
    distance -= lengths[segment];
    segment++;
  }
  return sampleSegment(path, segment, Math.min(distance / lengths[segment], 1));
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeInCubic = (t: number) => t * t * t;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/** True when any point has its own travel time, so the step plays on a per-point timeline. */
export function hasPointTiming(scene: Pick<PlayTourScene, 'waypoints'>): boolean {
  return parseWaypoints(scene.waypoints).some(p => p.move !== undefined);
}

export const DEFAULT_POINT_MOVE_MS = 2000;

/**
 * Plays one Play Tour step: optional start pause, then the camera path.
 * - Without point times: the whole curve takes move_duration at even speed (eased in and out).
 * - With point times: each point is reached in its own `move` ms and holds for `hold` ms;
 *   move_duration is the time for the last leg into the end view.
 * `duration` is the full length of the step's motion (start pause included, "pause after" not).
 */
export function createCameraPathPlayer(scene: TimedPathScene, direction?: string) {
  const path = buildCameraPath(scene, direction);
  // With path points the user shapes the move, so the "How the camera moves" arc is not added on top
  const hasPoints = path.length > 2;
  const startHold = Math.max(0, scene.start_hold || 0);
  const lastLeg = scene.move_duration || 5000;

  if (!hasPointTiming(scene)) {
    const duration = startHold + lastLeg;
    return {
      path,
      duration,
      hasPoints,
      at(elapsedMs: number): CameraPoint {
        const moving = Math.min(Math.max((elapsedMs - startHold) / lastLeg, 0), 1);
        return sampleCameraPath(path, easeInOutCubic(moving));
      },
    };
  }

  // Segment k runs path[k] → path[k + 1], then holds at path[k + 1]
  const legs = path.slice(1).map((point, k) => {
    const isEnd = k === path.length - 2;
    return {
      move: Math.max(isEnd ? lastLeg : (point.move ?? DEFAULT_POINT_MOVE_MS), 1),
      hold: isEnd ? 0 : Math.max(point.hold || 0, 0),
    };
  });
  const duration = startHold + legs.reduce((sum, leg) => sum + leg.move + leg.hold, 0);

  return {
    path,
    duration,
    hasPoints,
    at(elapsedMs: number): CameraPoint {
      let time = elapsedMs - startHold;
      if (time <= 0) return { ...path[0] };
      for (let k = 0; k < legs.length; k++) {
        const leg = legs[k];
        if (time < leg.move) {
          // Ease out of a stop and into a stop; glide straight through points without a pause
          const startsStopped = k === 0 || legs[k - 1].hold > 0;
          const endsStopped = k === legs.length - 1 || leg.hold > 0;
          const t = time / leg.move;
          const eased = startsStopped && endsStopped ? easeInOutCubic(t) : startsStopped ? easeInCubic(t) : endsStopped ? easeOutCubic(t) : t;
          return sampleSegment(path, k, eased);
        }
        time -= leg.move;
        if (time < leg.hold) return { ...path[k + 1] };
        time -= leg.hold;
      }
      return { ...path[path.length - 1] };
    },
  };
}
