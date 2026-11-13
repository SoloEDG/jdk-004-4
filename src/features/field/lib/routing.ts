import type { Enemy, FieldState, Vec } from "../../../shared/types";
import { distance } from "../../../shared/math";
import { segmentBlockedByCovers } from "./geometry";
import { cellCenter, findCellPath, nearestFreeCell } from "../model/nav";

const ROUTE_EXPIRY = 1.2;
const GOAL_DRIFT = 70;

/**
 * Chooses the steering target for one enemy.
 *
 * A direct sight line means the enemy keeps chasing the player, so open-field
 * pursuit is unchanged. Only when a cover interrupts sight does the enemy fall
 * back to a cached nav path; routes are reused until they expire, the goal
 * drifts, or the field revision changes. This keeps dense crowds from paying
 * for a breadth-first search every frame.
 */
export function routeEnemy(
  field: FieldState,
  enemy: Enemy,
  goal: Vec,
  dt = 1 / 60,
): Vec {
  const revision = field.revision;
  if (!segmentBlockedByCovers(enemy, goal, field.covers, 6)) {
    enemy.route = undefined;
    return goal;
  }
  const existing = enemy.route;
  if (
    existing &&
    existing.revision === revision &&
    distance(existing.goal, goal) < GOAL_DRIFT &&
    existing.expires > 0
  ) {
    existing.expires -= dt;
    return followRoute(enemy, existing.points, existing);
  }
  const path = findCellPath(field.nav, enemy, goal);
  // No route means the goal sits in a sealed pocket; the enemy keeps pressing
  // toward the player instead of idling at its last waypoint.
  if (!path) return goal;
  const points = simplifyPath(field, path, goal);
  if (!points.length) return goal;
  const route = {
    revision,
    goal: { x: goal.x, y: goal.y },
    index: 0,
    expires: ROUTE_EXPIRY,
    points,
  };
  enemy.route = route;
  return followRoute(enemy, points, route);
}

function simplifyPath(field: FieldState, path: number[], goal: Vec): Vec[] {
  const points: Vec[] = [];
  for (let i = 1; i < path.length; i++) {
    const point = cellCenter(field.nav, path[i]);
    if (!points.length || distance(points[points.length - 1], point) > 2)
      points.push(point);
  }
  if (points.length > 2) points[points.length - 1] = goal;
  return points;
}

function followRoute(
  enemy: Enemy,
  points: Vec[],
  route: NonNullable<Enemy["route"]>,
): Vec {
  while (route.index < points.length) {
    const target = points[route.index];
    if (distance(enemy, target) < 6) {
      route.index++;
      continue;
    }
    return target;
  }
  return route.goal;
}


/** The spawn validator must not birth enemies inside or sealed by cover. */
export function spawnClearance(
  field: FieldState,
  x: number,
  y: number,
  radius: number,
): boolean {
  for (const cover of field.covers) {
    const nx = Math.max(cover.x, Math.min(cover.x + cover.w, x)),
      ny = Math.max(cover.y, Math.min(cover.y + cover.h, y));
    if (Math.hypot(x - nx, y - ny) < radius + 6) return false;
  }
  const cell = nearestFreeCell(field.nav, x, y);
  return cell >= 0 && field.nav.blocked[cell] === 0;
}

