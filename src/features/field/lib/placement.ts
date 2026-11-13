import type { Cover, FieldEdit, FieldPreview, GameDoc } from "../../../shared/types";
import { circleHitsRect } from "./geometry";
import { previewEdit } from "../model/fieldState";

/**
 * Projectiles must not be born inside the placement ghost: doing so would make
 * them vanish on the next step for a wall the player has not committed yet.
 */
export function blockedByPreview(
  doc: GameDoc,
  origin: { x: number; y: number },
  radius: number,
): boolean {
  const pending = doc.field.pending;
  if (!pending || !pending.ok) return false;
  return circleHitsRect(origin.x, origin.y, radius, pending.rect);
}

/**
 * Preview-only entry point used while the pointer hovers the canvas. It never
 * writes `field.pending` or touches any combat entity, so pausing cannot
 * silently move the battle: the ghost exists only in the renderer's options.
 */
export function inspectPlacement(
  doc: GameDoc,
  edit: FieldEdit | null,
): FieldPreview | null {
  return edit ? previewEdit(doc, edit) : null;
}

/**
 * A prospective cover used only for collision/spawn checks, never committed.
 * Overlapping placements are already rejected by `previewEdit`, so a published
 * ghost can never trap the player or erase a live enemy.
 */
export function pendingCover(doc: GameDoc): Cover | null {
  const pending = doc.field.pending;
  if (!pending || !pending.ok) return null;
  return {
    id: -1,
    kind: pending.kind,
    x: pending.rect.x,
    y: pending.rect.y,
    w: pending.rect.w,
    h: pending.rect.h,
    hp: 0,
    maxHp: 0,
  };
}

/**
 * Publishes a preview for the lifespan of one simulation step. Combat collision
 * (projectile spawn) and wave birth checks both read `field.pending`, then the
 * owner clears it. The committed field is never mutated by a preview.
 */
export function withPendingPreview<T>(
  doc: GameDoc,
  preview: FieldPreview | null,
  work: () => T,
): T {
  doc.field.pending = preview;
  try {
    return work();
  } finally {
    doc.field.pending = null;
  }
}
