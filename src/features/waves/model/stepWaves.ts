import type { GameDoc } from "../../../shared/types";
import { distance, normalize } from "../../../shared/math";
import { spawnEnemy } from "../lib/spawn";
import { ENEMY_CATALOG, WAVE_DURATION, TOTAL_WAVES } from "./catalog";
import { routeEnemy, spawnClearance } from "../../field/lib/routing";
import {
  slideCircle,
  segmentBlockedByCovers,
  circleHitsRect,
} from "../../field/lib/geometry";
import { cellAt } from "../../field/model/nav";

/**
 * Spawn gates read the same `field.pending` preview that combat collision
 * uses. If an enemy would be born inside (or sealed by) the prospective cover,
 * the wave check rejects the attempt; the budget keeps accruing so the slot is
 * simply retried on a later tick.
 */
export function spawnAllowed(
  doc: GameDoc,
  x: number,
  y: number,
  radius: number,
): boolean {
  const pending = doc.field.pending;
  if (pending && pending.ok) {
    if (circleHitsRect(x, y, radius + 6, pending.rect)) return false;
    const cell = cellAt(doc.field.nav, x, y);
    if (cell >= 0 && pending.changedCells.includes(cell)) return false;
  }
  if (!spawnClearance(doc.field, x, y, radius)) return false;
  // Never birth an enemy inside a solid body that already occupies the spot.
  if (distance({ x, y }, doc.player) < radius + doc.player.radius + 8)
    return false;
  for (const other of doc.enemies) {
    if (other.hp > 0 && distance({ x, y }, other) < radius + other.radius + 4)
      return false;
  }
  return true;
}

export function stepWaves(doc: GameDoc, dt: number): void {
  if (doc.victory) return;
  if (doc.wave === 0) {
    doc.wave = 1;
    doc.spawnBudget = 1;
    doc.notice = "第 1 波 · 信号已连接";
  }
  doc.waveTime += dt;
  while (doc.waveTime >= WAVE_DURATION) {
    doc.waveTime -= WAVE_DURATION;
    if (doc.wave >= TOTAL_WAVES) {
      doc.victory = true;
      doc.notice = "全部波次已清除";
      return;
    }
    doc.wave++;
    doc.notice = `第 ${doc.wave} 波 · 威胁升级`;
  }
  doc.spawnBudget += dt * (1.05 + doc.wave * 0.27);
  // Each budget unit is one attempt. A rejected spawn is simply spent; the
  // budget keeps accruing, so a crowded or heavily-walled edge cannot turn
  // into an unbounded loop inside a single simulation step.
  let attempts = 0;
  while (doc.spawnBudget >= 1 && attempts < 8) {
    doc.spawnBudget--;
    attempts++;
    if (doc.enemies.length >= 180) continue;
    const enemy = spawnEnemy(doc);
    if (spawnAllowed(doc, enemy.x, enemy.y, enemy.radius))
      doc.enemies.push(enemy);
  }
  for (const enemy of doc.enemies) {
    const range = distance(enemy, doc.player);
    const goal = { x: doc.player.x, y: doc.player.y };
    const plotted = routeEnemy(doc.field, enemy, goal, dt);
    const toward = normalize(plotted.x - enemy.x, plotted.y - enemy.y);
    const standOff =
      enemy.kind === "shooter" ? (range < 170 ? -1 : range < 245 ? 0 : 1) : 1;
    const speed = ENEMY_CATALOG[enemy.kind].speed * (1 + doc.wave * 0.035);
    slideCircle(
      enemy,
      toward.x * speed * standOff * dt,
      toward.y * speed * standOff * dt,
      enemy.radius,
      doc.field.covers,
    );
    enemy.cooldown -= dt;
    // Shooting stops while the shot would pass through a cover. The cooldown is
    // held at zero rather than reset, so the shot resumes once sight returns.
    if (enemy.kind !== "chaser" && enemy.cooldown <= 0) {
      if (segmentBlockedByCovers(enemy, doc.player, doc.field.covers, 0))
        continue;
      enemy.cooldown = enemy.kind === "elite" ? 1.8 : 2.6;
      const angle = Math.atan2(goal.y - enemy.y, goal.x - enemy.x),
        spread = enemy.kind === "elite" ? [-0.24, 0, 0.24] : [0];
      for (const offset of spread) {
        doc.bullets.push({
          id: doc.nextId++,
          x: enemy.x,
          y: enemy.y,
          vx: Math.cos(angle + offset) * 160,
          vy: Math.sin(angle + offset) * 160,
          radius: 5,
          damage: enemy.kind === "elite" ? 16 : 10,
          life: 5,
          owner: "enemy",
          weapon: "enemy",
          pierce: 0,
          hit: [],
        });
      }
    }
  }
}
