import type { Cover, NavPatch, NavState, Vec } from "../../../shared/types";
import { WIDTH, HEIGHT } from "../../../shared/types";
import { clamp } from "../../../shared/math";
import { NAV_CELL, NAV_RADIUS } from "./catalog";

export function createNav(): NavState {
  const cols = Math.ceil(WIDTH / NAV_CELL),
    rows = Math.ceil(HEIGHT / NAV_CELL);
  return {
    cell: NAV_CELL,
    cols,
    rows,
    blocked: new Uint8Array(cols * rows),
    fullBuilds: 0,
    localPatches: 0,
    pathSearches: 0,
    lastPatch: null,
  };
}

export function cellAt(nav: NavState, x: number, y: number): number {
  const col = Math.floor(x / nav.cell),
    row = Math.floor(y / nav.cell);
  if (col < 0 || row < 0 || col >= nav.cols || row >= nav.rows) return -1;
  return row * nav.cols + col;
}

export function cellCenter(nav: NavState, index: number): Vec {
  const col = index % nav.cols;
  return {
    x: (col + 0.5) * nav.cell,
    y: (Math.floor(index / nav.cols) + 0.5) * nav.cell,
  };
}

/**
 * A cell is solid when its center falls inside a cover inflated by the
 * navigation clearance. This is deliberately conservative so routed enemies
 * cannot clip a corner with their body.
 */
function blocksCell(
  cellX: number,
  cellY: number,
  covers: Cover[],
  extra: { x: number; y: number; w: number; h: number } | null,
  radius: number,
): boolean {
  for (const cover of covers) {
    if (pointBlockedBy(cellX, cellY, cover, radius)) return true;
  }
  return Boolean(extra && pointBlockedBy(cellX, cellY, extra, radius));
}

function pointBlockedBy(
  x: number,
  y: number,
  rect: { x: number; y: number; w: number; h: number },
  radius: number,
): boolean {
  const nx = clamp(x, rect.x, rect.x + rect.w),
    ny = clamp(y, rect.y, rect.y + rect.h);
  return Math.hypot(x - nx, y - ny) <= radius;
}

function cellRanges(
  nav: NavState,
  rect: { x: number; y: number; w: number; h: number },
  pad: number,
): { c0: number; c1: number; r0: number; r1: number } {
  const c0 = Math.max(0, Math.floor((rect.x - pad) / nav.cell) - 1),
    c1 = Math.min(
      nav.cols - 1,
      Math.ceil((rect.x + rect.w + pad) / nav.cell) + 1,
    ),
    r0 = Math.max(0, Math.floor((rect.y - pad) / nav.cell) - 1),
    r1 = Math.min(
      nav.rows - 1,
      Math.ceil((rect.y + rect.h + pad) / nav.cell) + 1,
    );
  return { c0, c1, r0, r1 };
}

/** Full passability build. Only called when a run starts. */
export function rasterizeNav(nav: NavState, covers: Cover[]): void {
  nav.blocked.fill(0);
  for (let row = 0; row < nav.rows; row++) {
    for (let col = 0; col < nav.cols; col++) {
      const x = (col + 0.5) * nav.cell,
        y = (row + 0.5) * nav.cell;
      nav.blocked[row * nav.cols + col] = blocksCell(x, y, covers, null, NAV_RADIUS)
        ? 1
        : 0;
    }
  }
  nav.fullBuilds++;
  nav.lastPatch = null;
}

/**
 * Incremental navigation update: only cells around the edited rectangle are
 * re-evaluated. Army-sized pathing therefore never pays for a whole-map rebuild
 * unless the run itself is created.
 */
export function patchNav(
  nav: NavState,
  covers: Cover[],
  rect: { x: number; y: number; w: number; h: number },
): NavPatch {
  const { c0, c1, r0, r1 } = cellRanges(nav, rect, NAV_RADIUS);
  let changed = 0;
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      const index = row * nav.cols + col,
        x = (col + 0.5) * nav.cell,
        y = (row + 0.5) * nav.cell,
        next = blocksCell(x, y, covers, null, NAV_RADIUS) ? 1 : 0;
      if (nav.blocked[index] !== next) {
        nav.blocked[index] = next;
        changed++;
      }
    }
  }
  nav.localPatches++;
  nav.lastPatch = {
    x: c0 * nav.cell,
    y: r0 * nav.cell,
    w: (c1 - c0 + 1) * nav.cell,
    h: (r1 - r0 + 1) * nav.cell,
    cells: changed,
  };
  return nav.lastPatch;
}

/** Pure preview of the cells that a not-yet-committed rectangle would lock. */
export function previewChangedCells(
  nav: NavState,
  covers: Cover[],
  rect: { x: number; y: number; w: number; h: number },
): number[] {
  const { c0, c1, r0, r1 } = cellRanges(nav, rect, NAV_RADIUS),
    changed: number[] = [];
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      const index = row * nav.cols + col,
        x = (col + 0.5) * nav.cell,
        y = (row + 0.5) * nav.cell;
      const next = blocksCell(x, y, covers, rect, NAV_RADIUS) ? 1 : 0;
      if (next === 1 && nav.blocked[index] === 0) changed.push(index);
    }
  }
  return changed;
}

export function blockedAt(nav: NavState, x: number, y: number): boolean {
  const index = cellAt(nav, x, y);
  return index >= 0 && nav.blocked[index] === 1;
}

export function nearestFreeCell(
  nav: NavState,
  x: number,
  y: number,
  blocked: Uint8Array = nav.blocked,
): number {
  const start = cellAt(
    nav,
    clamp(x, 1, WIDTH - 1),
    clamp(y, 1, HEIGHT - 1),
  );
  if (start >= 0 && blocked[start] === 0) return start;
  if (start < 0) return -1;
  const maxRing = Math.max(nav.cols, nav.rows);
  for (let ring = 1; ring <= maxRing; ring++) {
    for (let dc = -ring; dc <= ring; dc++) {
      for (let dr = -ring; dr <= ring; dr++) {
        if (Math.abs(dc) !== ring && Math.abs(dr) !== ring) continue;
        const col = (start % nav.cols) + dc,
          row = Math.floor(start / nav.cols) + dr;
        if (col < 0 || row < 0 || col >= nav.cols || row >= nav.rows) continue;
        const index = row * nav.cols + col;
        if (blocked[index] === 0) return index;
      }
    }
  }
  return -1;
}

export function reachableFrom(
  nav: NavState,
  start: number,
  blocked: Uint8Array = nav.blocked,
): Uint8Array {
  const reachable = new Uint8Array(nav.blocked.length);
  if (start < 0 || blocked[start] === 1) return reachable;
  const queue = new Int32Array(nav.blocked.length);
  let head = 0,
    tail = 0;
  reachable[start] = 1;
  queue[tail++] = start;
  while (head < tail) {
    const index = queue[head++],
      col = index % nav.cols,
      row = Math.floor(index / nav.cols);
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nc = col + dc,
        nr = row + dr;
      if (nc < 0 || nr < 0 || nc >= nav.cols || nr >= nav.rows) continue;
      const neighbour = nr * nav.cols + nc;
      if (blocked[neighbour] === 1 || reachable[neighbour] === 1) continue;
      reachable[neighbour] = 1;
      queue[tail++] = neighbour;
    }
  }
  return reachable;
}

export function reachableCount(reachable: Uint8Array): number {
  let count = 0;
  for (let i = 0; i < reachable.length; i++) if (reachable[i]) count++;
  return count;
}

/** Breadth-first route on the nav grid; used only when sight is blocked. */
export function findCellPath(
  nav: NavState,
  from: Vec,
  to: Vec,
): number[] | null {
  nav.pathSearches++;
  const start = nearestFreeCell(nav, from.x, from.y),
    goal = nearestFreeCell(nav, to.x, to.y);
  if (start < 0 || goal < 0) return null;
  if (start === goal) return [start];
  const parents = new Int32Array(nav.blocked.length).fill(-1);
  const queue = new Int32Array(nav.blocked.length);
  let head = 0,
    tail = 0;
  queue[tail++] = start;
  parents[start] = start;
  while (head < tail) {
    const index = queue[head++];
    if (index === goal) break;
    const col = index % nav.cols,
      row = Math.floor(index / nav.cols);
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nc = col + dc,
        nr = row + dr;
      if (nc < 0 || nr < 0 || nc >= nav.cols || nr >= nav.rows) continue;
      const neighbour = nr * nav.cols + nc;
      if (nav.blocked[neighbour] === 1 || parents[neighbour] !== -1) continue;
      parents[neighbour] = index;
      queue[tail++] = neighbour;
    }
  }
  if (parents[goal] === -1) return null;
  const path: number[] = [];
  for (let index = goal; index !== start; index = parents[index]) {
    path.push(index);
    if (path.length > nav.blocked.length) return null;
  }
  path.push(start);
  return path.reverse();
}
