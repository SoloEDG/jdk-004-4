import type { GameDoc, Input, FrameEvents, Bullet, Cover } from "../../../shared/types";
import { WIDTH, HEIGHT } from "../../../shared/types";
import { distance, normalize } from "../../../shared/math";
import { segmentDistance } from "../lib/collision";
import { hurtPlayer } from "./health";
import { coversAlongSegment, destroyCover } from "../../field/model/fieldState";
import { pendingCover } from "../../field/lib/placement";
import { slideCircle } from "../../field/lib/geometry";
import { markCoverHit } from "../lib/bullets";

export function stepCombat(
  doc: GameDoc,
  input: Input,
  dt: number,
): FrameEvents {
  const events: FrameEvents = {
    kills: [],
    damage: 0,
    taken: 0,
    shots: 0,
    collected: 0,
    brokenCovers: [],
    weaponDamage: {},
  };
  const player = doc.player;
  // Player bullets collide with the prospective cover published by the shared
  // preview, in addition to the committed field geometry.
  const pending = pendingCover(doc);
  const covers = pending ? doc.field.covers.concat(pending) : doc.field.covers;
  player.invincible = Math.max(0, player.invincible - dt);
  const direction = normalize(input.x, input.y),
    strength = Math.min(1, Math.hypot(input.x, input.y));
  // Covers are solid for the player too, but movement slides along their faces
  // so the field never wedges the controlled entity.
  slideCircle(
    player,
    direction.x * strength * player.speed * dt,
    direction.y * strength * player.speed * dt,
    player.radius,
    doc.field.covers,
    { w: WIDTH, h: HEIGHT },
  );
  for (const bullet of doc.bullets) {
    if (bullet.life < 0) continue;
    const previous = { x: bullet.x, y: bullet.y };
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;
    if (bullet.life < 0) continue;
    // A cover clips the flight segment at its near face, so body collisions are
    // judged only along the visible part of the trajectory. The earliest entry
    // wins, so a projectile threading the corner where two rectangles meet
    // damages one cover once instead of double-counting both.
    const blocker = firstCoverContact(previous, bullet, covers);
    const end = blocker
      ? {
          x: previous.x + (bullet.x - previous.x) * blocker.t,
          y: previous.y + (bullet.y - previous.y) * blocker.t,
        }
      : bullet;
    const survived = resolveBodies(doc, bullet, previous, end, events);
    if (blocker) {
      // Only committed geometry can be damaged; a pending ghost stops the shot.
      if (survived && blocker.cover.id > 0)
        applyCoverHit(doc, bullet, blocker.cover, events);
      bullet.life = -1;
    }
  }
  for (const enemy of doc.enemies) {
    if (enemy.hp > 0 && distance(enemy, player) < enemy.radius + player.radius)
      events.taken += hurtPlayer(doc, enemy.kind === "elite" ? 25 : 12);
  }
  doc.enemies = doc.enemies.filter((e) => e.hp > 0);
  doc.bullets = doc.bullets.filter(
    (b) =>
      b.life >= 0 &&
      b.x > -120 &&
      b.x < WIDTH + 120 &&
      b.y > -120 &&
      b.y < HEIGHT + 120,
  );
  return events;
}

function firstCoverContact(
  from: { x: number; y: number },
  to: { x: number; y: number },
  covers: Cover[],
): { cover: Cover; t: number } | null {
  // The local list is snapshotted once per step, but a cover can break partway
  // through the bullet loop. A broken destructible must stop blocking the very
  // next projectile in the same simulation step.
  const hits = coversAlongSegment(
    from,
    to,
    // Pending ghosts (id -1) must still block; only a committed, broken cover
    // stops blocking, which happens partway through this bullet loop.
    covers.filter(
      (cover) => cover.id < 0 || cover.kind !== "cover" || cover.hp > 0,
    ),
    0,
  );
  return hits[0] ?? null;
}

/**
 * Applies body collisions along a (possibly cover-clipped) segment.
 * Returns false when a body consumed the projectile, so the caller knows the
 * cover behind that body must not also take damage.
 */
function resolveBodies(
  doc: GameDoc,
  bullet: Bullet,
  previous: { x: number; y: number },
  end: { x: number; y: number },
  events: FrameEvents,
): boolean {
  const player = doc.player;
  if (bullet.owner === "enemy") {
    if (
      segmentDistance(player, previous, end) <
      player.radius + bullet.radius
    ) {
      events.taken += hurtPlayer(doc, bullet.damage);
      return false;
    }
    return true;
  }
  for (const enemy of doc.enemies) {
    if (enemy.hp <= 0 || bullet.hit.includes(enemy.id)) continue;
    if (
      segmentDistance(enemy, previous, end) >
      enemy.radius + bullet.radius
    )
      continue;
    bullet.hit.push(enemy.id);
    const damage = Math.min(enemy.hp, bullet.damage);
    enemy.hp -= damage;
    events.damage += damage;
    if (bullet.weapon !== "enemy")
      events.weaponDamage![bullet.weapon] =
        (events.weaponDamage![bullet.weapon] || 0) + damage;
    if (enemy.hp <= 0)
      events.kills.push({
        enemy: { ...enemy },
        weapon: bullet.weapon === "enemy" ? "pulse" : bullet.weapon,
      });
    if (bullet.pierce <= 0) {
      bullet.life = -1;
      return false;
    }
    bullet.pierce--;
  }
  return true;
}

/**
 * Player fire chips destructible covers and breaks them at zero hp. Breaking is
 * committed inside this same step, which patches passability and refreshes the
 * occlusion set before the frame ends.
 */
function applyCoverHit(
  doc: GameDoc,
  bullet: Bullet,
  cover: Cover,
  events: FrameEvents,
): void {
  if (cover.kind !== "cover" || bullet.owner !== "player" || cover.id < 0) return;
  if (!markCoverHit(bullet, cover.id)) return;
  cover.hp -= bullet.damage;
  if (cover.hp > 0) return;
  const removed = destroyCover(doc, cover.id);
  if (removed) events.brokenCovers.push(removed);
}
