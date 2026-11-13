import type { FieldState, GameDoc, FrameEvents, Vec } from "../../../shared/types";
import { random, distance, normalize } from "../../../shared/math";
import { grantExperience } from "./experience";
import {
  cellCenter,
  cellAt,
  nearestFreeCell,
  reachableFrom,
} from "../../field/model/nav";

/**
 * Places a drop on the nearest walkable cell that is actually reachable from
 * the player. Called for every kill and again for leftovers exposed by a
 * broken cover, so loot can never end up sealed behind solid geometry.
 */
export function findWalkableDropSpot(
  field: FieldState,
  x: number,
  y: number,
  player: Vec,
  reachable?: Uint8Array,
): Vec {
  const nav = field.nav;
  const playerCell = nearestFreeCell(nav, player.x, player.y);
  if (playerCell < 0) return { x, y };
  const mask = reachable ?? reachableFrom(nav, playerCell);
  let best = -1,
    bestDistance = Infinity;
  for (let row = 0; row < nav.rows; row++) {
    for (let col = 0; col < nav.cols; col++) {
      const index = row * nav.cols + col;
      if (!mask[index]) continue;
      const center = cellCenter(nav, index),
        d = (center.x - x) ** 2 + (center.y - y) ** 2;
      if (d < bestDistance) {
        best = index;
        bestDistance = d;
      }
    }
  }
  if (best < 0) return { x, y };
  const center = cellCenter(nav, best);
  // Small deterministic offset keeps stacked loot legible without leaving the cell.
  return { x: center.x + (best % 2 ? 2 : -2), y: center.y };
}

/** Drops left behind by a broken cover are re-seated on reachable cells. */
export function reseatDropsNear(doc: GameDoc, center: Vec): void {
  const radius = 70,
    player = doc.player;
  if (
    !doc.drops.some(
      (drop) =>
        drop.life >= 0 &&
        distance(drop, center) <= radius &&
        cellBlocked(doc.field, drop.x, drop.y),
    )
  )
    return;
  const start = nearestFreeCell(doc.field.nav, player.x, player.y);
  if (start < 0) return;
  const reachable = reachableFrom(doc.field.nav, start);
  for (const drop of doc.drops) {
    if (drop.life < 0) continue;
    if (distance(drop, center) > radius) continue;
    if (!cellBlocked(doc.field, drop.x, drop.y)) continue;
    const spot = findWalkableDropSpot(doc.field, drop.x, drop.y, player, reachable);
    drop.x = spot.x;
    drop.y = spot.y;
  }
}

function cellBlocked(field: FieldState, x: number, y: number): boolean {
  const index = cellAt(field.nav, x, y);
  return index >= 0 && field.nav.blocked[index] === 1;
}

export function generateDrops(doc: GameDoc, events: FrameEvents): void {
  // Reachability is shared across every drop in this frame; a kill burst would
  // otherwise reflood the grid once per pickup.
  let reachable: Uint8Array | undefined;
  const revealMask = () => {
    if (reachable) return reachable;
    const start = nearestFreeCell(doc.field.nav, doc.player.x, doc.player.y);
    return (reachable = start < 0 ? new Uint8Array(0) : reachableFrom(doc.field.nav, start));
  };
  for (const { enemy } of events.kills) {
    const spot = findWalkableDropSpot(doc.field, enemy.x, enemy.y, doc.player, revealMask());
    doc.drops.push({
      id: doc.nextId++,
      x: spot.x,
      y: spot.y,
      kind: "xp",
      value: enemy.kind === "elite" ? 10 : enemy.kind === "shooter" ? 3 : 2,
      life: 45,
    });
    const roll = random(doc);
    if (roll < 0.055) {
      const healSpot = findWalkableDropSpot(
        doc.field,
        enemy.x + 8,
        enemy.y,
        doc.player,
        revealMask(),
      );
      doc.drops.push({
        id: doc.nextId++,
        x: healSpot.x,
        y: healSpot.y,
        kind: "heal",
        value: 18,
        life: 20,
      });
    } else if (roll < 0.07) {
      const magnetSpot = findWalkableDropSpot(
        doc.field,
        enemy.x - 8,
        enemy.y,
        doc.player,
        revealMask(),
      );
      doc.drops.push({
        id: doc.nextId++,
        x: magnetSpot.x,
        y: magnetSpot.y,
        kind: "magnet",
        value: 1,
        life: 20,
      });
    }
  }
  for (const cover of events.brokenCovers ?? [])
    reseatDropsNear(doc, {
      x: cover.x + cover.w / 2,
      y: cover.y + cover.h / 2,
    });
}

export function collectDrops(
  doc: GameDoc,
  events: FrameEvents,
  dt: number,
): void {
  const radius = 65 + (doc.upgrades.magnet || 0) * 35;
  let magnet = false;
  for (const drop of doc.drops) {
    drop.life -= dt;
    if (drop.life < 0) continue;
    const range = distance(drop, doc.player);
    if (range < radius) {
      const toward = normalize(doc.player.x - drop.x, doc.player.y - drop.y),
        travel = Math.min(range, 360 * dt);
      drop.x += toward.x * travel;
      drop.y += toward.y * travel;
    }
    if (distance(drop, doc.player) > doc.player.radius + 9) continue;
    drop.life = -1;
    events.collected++;
    if (drop.kind === "xp") grantExperience(doc, drop.value);
    if (drop.kind === "heal")
      doc.player.hp = Math.min(doc.player.maxHp, doc.player.hp + drop.value);
    if (drop.kind === "magnet") magnet = true;
  }
  if (magnet) {
    for (const drop of doc.drops) {
      if (drop.life >= 0 && drop.kind === "xp") {
        grantExperience(doc, drop.value);
        drop.life = -1;
        events.collected++;
      }
    }
  }
  doc.drops = doc.drops.filter((d) => d.life >= 0);
}
