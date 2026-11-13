import type {
  Cover,
  CoverKind,
  FieldEdit,
  FieldPreview,
  FieldRejectReason,
  FieldState,
  GameDoc,
  NavState,
  Vec,
} from "../../../shared/types";
import { WIDTH, HEIGHT } from "../../../shared/types";
import { clamp } from "../../../shared/math";
import { sweptRectEntry } from "../lib/geometry";
import {
  COVER_CATALOG,
  COVER_MIN_SIZE,
  FIELD_MARGIN,
  MAX_COVERS,
  NAV_CELL,
  NAV_RADIUS,
} from "./catalog";
import {
  createNav,
  nearestFreeCell,
  patchNav,
  previewChangedCells,
  rasterizeNav,
  reachableCount,
  reachableFrom,
} from "./nav";

/** A player needs room to maneuver; below this the edit counts as a trap. */
const MIN_PLAYER_REACH = 260;

const OPENING_LAYOUT: FieldEdit[] = [
  { kind: "cover", x: 210, y: 150, w: 130, h: 26, hp: 44 },
  { kind: "cover", x: 660, y: 150, w: 130, h: 26, hp: 44 },
  { kind: "cover", x: 210, y: 474, w: 130, h: 26, hp: 44 },
  { kind: "cover", x: 660, y: 474, w: 130, h: 26, hp: 44 },
  { kind: "cover", x: 465, y: 185, w: 70, h: 44, hp: 44 },
  { kind: "obstacle", x: 90, y: 250, w: 30, h: 150 },
  { kind: "obstacle", x: 880, y: 250, w: 30, h: 150 },
  { kind: "obstacle", x: 350, y: 302, w: 30, h: 30 },
  { kind: "obstacle", x: 620, y: 302, w: 30, h: 30 },
];

function boundRect(rect: { x: number; y: number; w: number; h: number }) {
  return {
    x: clamp(rect.x, FIELD_MARGIN, WIDTH - FIELD_MARGIN - rect.w),
    y: clamp(rect.y, FIELD_MARGIN, HEIGHT - FIELD_MARGIN - rect.h),
    w: rect.w,
    h: rect.h,
  };
}

export function createField(): FieldState {
  const covers: Cover[] = [];
  const field: FieldState = {
    covers,
    nextCoverId: 1,
    revision: 0,
    nav: createNav(),
    occlusion: { revision: 0, visibleIds: [] },
    acceptedEdits: 0,
    pending: null,
    pendingEdit: null,
  };
  for (const edit of OPENING_LAYOUT) {
    covers.push(buildCover(field, edit));
  }
  rasterizeNav(field.nav, covers);
  field.occlusion = { revision: 0, visibleIds: covers.map((c) => c.id) };
  return field;
}

function buildCover(field: FieldState, edit: FieldEdit): Cover {
  const kind = edit.kind ?? "cover",
    catalog = COVER_CATALOG[kind];
  return {
    id: field.nextCoverId++,
    kind,
    x: edit.x,
    y: edit.y,
    w: edit.w,
    h: edit.h,
    hp: catalog.destructible ? (edit.hp ?? catalog.hp) : 0,
    maxHp: catalog.destructible ? (edit.hp ?? catalog.hp) : 0,
  };
}

/** True when a point lies on solid cover geometry (shared by all systems). */
export function pointInsideCover(x: number, y: number, covers: Cover[]): boolean {
  for (const cover of covers) {
    if (
      x >= cover.x &&
      x <= cover.x + cover.w &&
      y >= cover.y &&
      y <= cover.y + cover.h
    )
      return true;
  }
  return false;
}

/** Covers crossed by a moving bullet, ordered by the time of first overlap. */
export function coversAlongSegment(
  from: Vec,
  to: Vec,
  covers: Cover[],
  inflate = 0,
): Array<{ cover: Cover; t: number }> {
  const hits: Array<{ cover: Cover; t: number }> = [];
  for (const cover of covers) {
    const t = sweptRectEntry(from, to, cover, inflate);
    if (t !== null) hits.push({ cover, t });
  }
  return hits.sort((a, b) => a.t - b.t);
}

function rectHitsCircle(
  rect: { x: number; y: number; w: number; h: number },
  cx: number,
  cy: number,
  radius: number,
): boolean {
  const nx = clamp(cx, rect.x, rect.x + rect.w),
    ny = clamp(cy, rect.y, rect.y + rect.h);
  return Math.hypot(cx - nx, cy - ny) <= radius;
}

/**
 * Pure placement preview. Combat collision and wave spawn checks both consume
 * the resulting rect and nav impact; nothing here mutates the field or any
 * combat entity, so a preview taken while paused stays inert.
 */
export function previewEdit(doc: GameDoc, edit: FieldEdit): FieldPreview {
  const kind: CoverKind = edit.kind ?? "cover";
  // Placement coordinates are the rectangle's top-left corner; the canvas
  // interaction converts pointer position into that corner before previewing.
  const rect = boundRect({
    x: edit.x,
    y: edit.y,
    w: Math.max(COVER_MIN_SIZE, edit.w),
    h: Math.max(COVER_MIN_SIZE, edit.h),
  });
  const field = doc.field;
  const reject = (reason: FieldRejectReason): FieldPreview => ({
    ok: false,
    reason,
    kind,
    rect,
    lockedCells: 0,
    reachableCells: 0,
    changedCells: [],
  });

  if (edit.w < COVER_MIN_SIZE || edit.h < COVER_MIN_SIZE)
    return reject("too-small");
  if (rect.x !== edit.x || rect.y !== edit.y) return reject("out-of-bounds");
  if (field.covers.length >= MAX_COVERS) return reject("too-many-covers");
  if (rectHitsCircle(rect, doc.player.x, doc.player.y, doc.player.radius))
    return reject("player-overlap");
  for (const enemy of doc.enemies) {
    if (enemy.hp > 0 && rectHitsCircle(rect, enemy.x, enemy.y, enemy.radius))
      return reject("enemy-overlap");
  }

  const changedCells = previewChangedCells(field.nav, field.covers, rect);
  const projected = new Uint8Array(field.nav.blocked);
  for (const index of changedCells) projected[index] = 1;
  const start = nearestFreeCell(
    field.nav,
    doc.player.x,
    doc.player.y,
    projected,
  );
  // A rejected edit must leave the original field untouched, so sealing the
  // player into a pocket — or cutting the arena in half — fails here. Compare
  // against the reachable set *before* the edit so a pre-existing partition
  // never makes a harmless placement look like a trap.
  const beforeStart = nearestFreeCell(field.nav, doc.player.x, doc.player.y);
  const beforeCount =
    beforeStart < 0 ? 0 : reachableCount(reachableFrom(field.nav, beforeStart));
  if (start < 0) return reject("traps-player");
  const reachable = reachableFrom(field.nav, start, projected);
  const reachableCells = reachableCount(reachable);
  if (
    reachableCells < MIN_PLAYER_REACH ||
    reachableCells < beforeCount * 0.55
  )
    return reject("traps-player");

  return {
    ok: true,
    reason: null,
    kind,
    rect,
    lockedCells: changedCells.length,
    reachableCells,
    changedCells,
  };
}

function commitOcclusion(doc: GameDoc): void {
  doc.field.revision++;
  doc.field.occlusion = {
    revision: doc.field.revision,
    visibleIds: doc.field.covers.map((c) => c.id),
  };
}

/**
 * Applies one edit atomically: covers, navigation patches and occlusion ids
 * change inside a single call, so combat collision never observes a field that
 * differs from the rendered occlusion set at a simulation step boundary.
 */
export function applyEdit(
  doc: GameDoc,
  edit: FieldEdit,
): { ok: boolean; preview: FieldPreview; nav: ReturnType<typeof patchNav> | null } {
  const preview = previewEdit(doc, edit);
  if (!preview.ok) return { ok: false, preview, nav: null };
  const cover = buildCover(doc.field, {
    ...edit,
    kind: preview.kind,
    x: preview.rect.x,
    y: preview.rect.y,
    w: preview.rect.w,
    h: preview.rect.h,
  });
  doc.field.covers.push(cover);
  const navPatch = patchNav(doc.field.nav, doc.field.covers, cover);
  commitOcclusion(doc);
  doc.field.acceptedEdits++;
  return { ok: true, preview, nav: navPatch };
}

/**
 * Destroys a cover and commits the nav patch and occlusion set in the same
 * call. The returned geometry lets drops be placed on cells that remain
 * reachable now that the cover is gone.
 */
export function destroyCover(doc: GameDoc, id: number): Cover | null {
  const index = doc.field.covers.findIndex((c) => c.id === id);
  if (index < 0) return null;
  const cover = doc.field.covers[index];
  doc.field.covers.splice(index, 1);
  patchNav(doc.field.nav, doc.field.covers, cover);
  commitOcclusion(doc);
  return cover;
}

export { FIELD_MARGIN, MAX_COVERS };

/** Debug/telemetry view of navigation work performed so far. */
export function networkStats(nav: NavState) {
  return {
    fullBuilds: nav.fullBuilds,
    localPatches: nav.localPatches,
    pathSearches: nav.pathSearches,
    cell: NAV_CELL,
    clearance: NAV_RADIUS,
    lastPatch: nav.lastPatch,
  };
}
