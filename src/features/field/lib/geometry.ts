import type { Vec } from "../../../shared/types";
import { clamp } from "../../../shared/math";

/** An axis-aligned field rectangle. Structurally compatible with `Cover`. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Circle against an axis-aligned rect; `radius` already includes any inflate. */
export function circleHitsRect(
  x: number,
  y: number,
  radius: number,
  rect: Rect,
): boolean {
  const closestX = clamp(x, rect.x, rect.x + rect.w),
    closestY = clamp(y, rect.y, rect.y + rect.h);
  return Math.hypot(x - closestX, y - closestY) <= radius;
}

/** Entry parameter in [0, 1] for a segment crossing an axis-aligned rect. */
export function sweptRectEntry(
  from: Vec,
  to: Vec,
  rect: Rect,
  inflate = 0,
): number | null {
  const minX = rect.x - inflate,
    minY = rect.y - inflate,
    maxX = rect.x + rect.w + inflate,
    maxY = rect.y + rect.h + inflate;
  let tEnter = 0,
    tExit = 1;
  const dx = to.x - from.x,
    dy = to.y - from.y;
  const axes: Array<[number, number, number, number]> = [
    [from.x, dx, minX, maxX],
    [from.y, dy, minY, maxY],
  ];
  for (const [origin, delta, min, max] of axes) {
    if (Math.abs(delta) < 1e-9) {
      if (origin < min || origin > max) return null;
      continue;
    }
    let t0 = (min - origin) / delta,
      t1 = (max - origin) / delta;
    if (t0 > t1) [t0, t1] = [t1, t0];
    tEnter = Math.max(tEnter, t0);
    tExit = Math.min(tExit, t1);
    if (tEnter > tExit) return null;
  }
  return tEnter;
}

/** True when a segment passes through any inflated cover (used for enemy sight). */
export function segmentBlockedByCovers(
  from: Vec,
  to: Vec,
  covers: Rect[],
  inflate: number,
): boolean {
  for (const cover of covers) {
    if (sweptRectEntry(from, to, cover, inflate) !== null) return true;
  }
  return false;
}

/**
 * Axis-separated movement keeps a moving circle out of solid covers while
 * still allowing it to slide along a wall.
 */
export function slideCircle(
  position: Vec,
  dx: number,
  dy: number,
  radius: number,
  covers: Rect[],
  bounds?: { w: number; h: number },
): void {
  const wedged = covers.some((cover) =>
    circleHitsRect(position.x, position.y, radius, cover),
  );
  const tries: Array<[number, number]> = [
    [dx, 0],
    [0, dy],
  ];
  for (const [mx, my] of tries) {
    if (!mx && !my) continue;
    // Enemies may be born just outside the arena and walk in; only bodies that
    // must remain on-screen (the player) pass explicit bounds.
    const nextX = bounds
      ? clamp(position.x + mx, radius, bounds.w - radius)
      : position.x + mx;
    const nextY = bounds
      ? clamp(position.y + my, radius, bounds.h - radius)
      : position.y + my;
    // A body that is already overlapping (e.g. a cover was destroyed or the
    // field was hot-swapped) may move freely so it can escape instead of
    // freezing permanently inside the geometry.
    const blocked =
      !wedged &&
      covers.some((cover) => circleHitsRect(nextX, nextY, radius, cover));
    if (!blocked) {
      position.x = nextX;
      position.y = nextY;
    }
  }
}
