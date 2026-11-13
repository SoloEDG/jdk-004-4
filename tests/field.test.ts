import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun } from "../src/shared/createRun";
import { stepCombat } from "../src/features/combat";
import { spawnAllowed } from "../src/features/waves";

import { simulate } from "../src/app/simulate";
import {
  applyEdit,
  previewEdit,
  coversAlongSegment,
  destroyCover,
  pointInsideCover,
} from "../src/features/field/model/fieldState";
import {
  inspectPlacement,
  withPendingPreview,
} from "../src/features/field/lib/placement";
import { routeEnemy, spawnClearance } from "../src/features/field/lib/routing";
import {
  reachableFrom,
  nearestFreeCell,
  cellAt,
} from "../src/features/field/model/nav";
import { findWalkableDropSpot } from "../src/features/progression/lib/drops";
import type { Bullet } from "../src/shared/types";

const input = { x: 0, y: 0, aim: { x: 700, y: 325 }, firing: false };
const bulletAt = (
  x: number,
  y: number,
  over: Partial<Bullet> = {},
): Bullet => ({
  id: 99,
  x,
  y,
  vx: 0,
  vy: 0,
  radius: 5,
  damage: 20,
  life: 1,
  owner: "player",
  weapon: "pulse",
  pierce: 0,
  hit: [],
  ...over,
});

test("opening field builds navigation once and never full-rebuilds afterwards", () => {
  const d = createRun();
  assert.equal(d.field.nav.fullBuilds, 1);
  const result = applyEdit(d, { kind: "cover", x: 560, y: 360, w: 60, h: 30 });
  assert.equal(result.ok, true);
  assert.equal(d.field.nav.fullBuilds, 1, "edits must patch, not rebuild");
  assert.ok(d.field.nav.localPatches >= 1);
});

test("placement preview is pure and leaves every combat entity and the field untouched", () => {
  const d = createRun();
  d.phase = "paused";
  d.enemies = [
    { id: 5, kind: "chaser", x: 700, y: 400, hp: 10, maxHp: 10, radius: 12, cooldown: 1 },
  ];
  d.bullets = [bulletAt(400, 300, { id: 3, owner: "enemy", weapon: "enemy" })];
  d.drops = [{ id: 4, x: 300, y: 300, kind: "xp", value: 2, life: 20 }];
  const snapshot = JSON.stringify(d);
  // Simulate paused ticks while a preview hovers over the canvas.
  for (let i = 0; i < 5; i++)
    simulate(d, { ...input, x: 1 }, 1 / 60);
  assert.equal(JSON.stringify(d), snapshot);
  const preview = inspectPlacement(d, { kind: "cover", x: 380, y: 250, w: 60, h: 40 });
  assert.ok(preview?.ok);
  assert.equal(JSON.stringify(d), snapshot, "a preview must not move battle entities");
});

test("shared preview is used by combat collision and wave spawn checks", () => {
  const d = createRun();
  d.phase = "playing";
  const edit = { kind: "cover" as const, x: 560, y: 340, w: 70, h: 40 };
  const preview = inspectPlacement(d, edit);
  assert.ok(preview?.ok);
  withPendingPreview(d, preview, () => {
    assert.equal(d.bullets.length, 0);
    // Bullet fired at the ghost from the left is stopped at its near face.
    d.bullets = [bulletAt(500, 360, { vx: 600 })];
    const events = stepCombat(d, input, 8 / 60);
    assert.equal(d.bullets.length, 0, "bullet stops at the pending cover");
    assert.equal(events.brokenCovers.length, 0, "the ghost must not be destroyed");
    // A spawn point under the ghost is refused by the shared wave gate.
    assert.equal(spawnAllowed(d, 595, 360, 12), false);
    assert.equal(preview.rect.x, 560);
    assert.equal(spawnAllowed(d, 300, 300, 12), true);
  });
  assert.equal(d.field.pending, null);
});

test("breaking a cover patches passability and occlusion in the same simulation step", () => {
  const d = createRun();
  // Pick a destructible cover and put a bullet right against it.
  const cover = d.field.covers.find((c) => c.kind === "cover")!;
  const centerY = cover.y + cover.h / 2;
  const before = d.field.nav.blocked.slice();
  const blockedBefore = cellAt(d.field.nav, cover.x + cover.w / 2, centerY);
  assert.equal(before[blockedBefore], 1);
  const visibleBefore = [...d.field.occlusion.visibleIds];
  d.bullets = [
    bulletAt(cover.x + cover.w + 8, centerY, {
      vx: -400,
      damage: cover.hp + 5,
      pierce: 1,
    }),
  ];
  const events = stepCombat(d, input, 0.05);
  assert.equal(events.brokenCovers.length, 1);
  // Same step: nav cells opened, occlusion set no longer lists the cover.
  const openedIndex = cellAt(d.field.nav, cover.x + cover.w / 2, centerY);
  assert.ok(d.field.nav.blocked[openedIndex] === 0);
  assert.ok(
    d.field.occlusion.visibleIds.every((id) => id !== cover.id),
    "the broken cover must not keep casting shade",
  );
  assert.notDeepEqual(d.field.occlusion.visibleIds, visibleBefore);
});

test("a projectile crossing a cover corner hits it only once", () => {
  const d = createRun();
  // Two covers meeting at a corner, projectile through the shared corner.
  d.field.covers = [
    { id: 500, kind: "cover", x: 400, y: 300, w: 60, h: 60, hp: 100, maxHp: 100 },
    { id: 501, kind: "cover", x: 460, y: 240, w: 40, h: 60, hp: 100, maxHp: 100 },
  ];
  d.bullets = [bulletAt(340, 360, { vx: 500, vy: 0, damage: 15, pierce: 0 })];
  const events = stepCombat(d, input, 0.2);
  assert.equal(events.brokenCovers.length, 0);
  const totalHp = d.field.covers.reduce((sum, c) => sum + c.hp, 0);
  assert.equal(totalHp, 185, "exactly one cover loses exactly one hit");
  assert.equal(d.bullets.length, 0);
});

test("placement that encloses the player is rejected and preserves the original field", () => {
  const d = createRun();
  d.player.x = 160;
  d.player.y = 160;
  const snapshot = JSON.stringify(d.field);
  // Three sides of a sealed box; the fourth wall would enclose the player.
  const edits = [
    { kind: "obstacle" as const, x: 100, y: 100, w: 202, h: 22 },
    { kind: "obstacle" as const, x: 100, y: 122, w: 22, h: 160 },
    { kind: "obstacle" as const, x: 280, y: 122, w: 22, h: 160 },
  ];
  for (const edit of edits) {
    const preview = previewEdit(d, edit);
    assert.ok(preview.ok, `pre-open wall ${edit.x},${edit.y}`);
    applyEdit(d, edit);
    assert.ok(
      d.field.nav.localPatches > 0 || d.field.nav.fullBuilds === 1,
      "local patch path",
    );
  }
  const trap = previewEdit(d, { kind: "obstacle", x: 100, y: 282, w: 202, h: 22 });
  assert.equal(trap.ok, false);
  assert.equal(trap.reason, "traps-player");
  assert.equal(JSON.parse(JSON.stringify(d.field)).covers.length, d.field.covers.length);
  assert.ok(snapshot.length > 0);
});

test("cover destruction re-seats leftover drops on reachable cells", () => {
  const d = createRun();
  const cover = d.field.covers.find((c) => c.kind === "cover")!;
  d.drops = [
    { id: 700, x: cover.x + cover.w / 2, y: cover.y + cover.h / 2, kind: "xp", value: 2, life: 40 },
  ];
  destroyCover(d, cover.id);
  const playerCell = nearestFreeCell(d.field.nav, d.player.x, d.player.y)!;
  const reachable = reachableFrom(d.field.nav, playerCell);
  const index = nearestFreeCell(d.field.nav, d.drops[0].x, d.drops[0].y);
  assert.ok(index >= 0 && reachable[index] === 1, "drop must sit on a reachable cell");
});

test("enemies route around obstacles while open-field pursuit stays direct", () => {
  const d = createRun();
  const enemy = { id: 900, kind: "chaser" as const, x: 90, y: 325, hp: 10, maxHp: 10, radius: 12, cooldown: 0 };
  d.enemies = [enemy];
  d.player.x = 300;
  d.player.y = 325;
  // Cover between enemy and player blocks sight -> a route is produced.
  d.field.covers = [{ id: 901, kind: "obstacle", x: 150, y: 280, w: 20, h: 90, hp: 0, maxHp: 0 }];
  let target = routeEnemy(d.field, d.enemies[0], { x: d.player.x, y: d.player.y });
  assert.ok(enemy.route, "sight blocked enemies receive a nav route");
  assert.ok(Math.hypot(target.x - d.player.x, target.y - d.player.y) > 0);
  // Clear the field -> direct pursuit again.
  d.field.covers = [];
  d.enemies[0].route = undefined;
  target = routeEnemy(d.field, d.enemies[0], { x: d.player.x, y: d.player.y });
  assert.equal(target.x, d.player.x);
  assert.equal(target.y, d.player.y);
});

test("spawn validation rejects points inside cover", () => {
  const d = createRun();
  const cover = d.field.covers[0];
  assert.equal(spawnClearance(d.field, cover.x + cover.w / 2, cover.y + cover.h / 2, 12), false);
  assert.equal(pointInsideCover(cover.x + cover.w / 2, cover.y + cover.h / 2, d.field.covers), true);
});

test("projectile cover crossing returns earliest entry", () => {
  const covers = [
    { id: 1, kind: "cover" as const, x: 200, y: 100, w: 40, h: 40, hp: 1, maxHp: 1 },
    { id: 2, kind: "cover" as const, x: 300, y: 100, w: 40, h: 40, hp: 1, maxHp: 1 },
  ];
  const hits = coversAlongSegment({ x: 100, y: 120 }, { x: 400, y: 120 }, covers, 0);
  assert.equal(hits.length, 2);
  assert.ok(hits[0].t < hits[1].t);
});

test("a broken cover stops blocking later bullets in the same simulation step", () => {
  const d = createRun();
  d.field.covers = [
    { id: 600, kind: "cover", x: 400, y: 300, w: 60, h: 60, hp: 10, maxHp: 10 },
  ];
  // First bullet breaks it; the second must fly through the now-open cell.
  d.bullets = [
    bulletAt(400, 330, { id: 1, vx: 600, damage: 40, pierce: 0 }),
    bulletAt(300, 330, { id: 2, vx: 600, damage: 5, pierce: 0 }),
  ];
  const events = stepCombat(d, input, 0.05);
  assert.equal(events.brokenCovers.length, 1);
  assert.ok(
    d.bullets.some((b) => b.id === 2),
    "the trailing bullet survives because passability opened in the same step",
  );
});

test("navigation obstacles cannot be destroyed by weapons", () => {
  const d = createRun();
  d.field.covers = [
    { id: 610, kind: "obstacle", x: 400, y: 300, w: 60, h: 60, hp: 0, maxHp: 0 },
  ];
  d.bullets = [bulletAt(340, 330, { vx: 900, damage: 999, pierce: 3 })];
  const events = stepCombat(d, input, 0.2);
  assert.equal(events.brokenCovers.length, 0);
  assert.equal(d.field.covers.length, 1);
  assert.equal(d.field.covers[0].kind, "obstacle");
  assert.equal(d.bullets.length, 0, "the shot still stops at the obstruction");
});

test("player cannot walk through a cover but slides along it", () => {
  const d = createRun();
  d.field.covers = [
    { id: 620, kind: "obstacle", x: 520, y: 200, w: 30, h: 250, hp: 0, maxHp: 0 },
  ];
  for (let i = 0; i < 60; i++)
    stepCombat(d, { ...input, x: 1, y: 1 }, 1 / 60);
  assert.ok(d.player.x < 520 - d.player.radius + 1.5, "stopped at the wall face");
  assert.ok(d.player.y > 325, "but free to slide on Y");
});

test("spawn gate refuses enemies under the pending ghost and clears on commit", () => {
  const d = createRun();
  const edit = { kind: "obstacle" as const, x: 700, y: 60, w: 40, h: 40 };
  const preview = inspectPlacement(d, edit);
  assert.ok(preview?.ok);
  withPendingPreview(d, preview, () => {
    assert.equal(spawnAllowed(d, 700, 60, 12), false);
  });
  assert.equal(d.field.pending, null);
  applyEdit(d, edit);
  assert.equal(spawnAllowed(d, 700, 60, 12), false, "committed cover still blocks");
});

test("nav patch only touches cells near the edit", () => {
  const d = createRun();
  const far = Array.from({ length: 40 }, (_, c) => c); // top row
  const before = far.map((c) => d.field.nav.blocked[c]);
  applyEdit(d, { kind: "obstacle", x: 600, y: 500, w: 40, h: 40 });
  const after = far.map((c) => d.field.nav.blocked[c]);
  assert.deepEqual(after, before, "distant cells are untouched by the patch");
  assert.ok(d.field.nav.lastPatch);
  assert.ok(d.field.nav.lastPatch!.w < 1000);
});
