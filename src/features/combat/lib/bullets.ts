import type { Bullet } from "../../../shared/types";

/**
 * Cover ids share the bullet `hit` ledger with enemy ids. Ids are allocated from
 * one counter, so a cover can never collide with an enemy id — and a bullet that
 * enters two rectangles meeting at a corner records only the first one.
 */
export function markCoverHit(
  bullet: Pick<Bullet, "hit">,
  coverId: number,
): boolean {
  if (bullet.hit.includes(coverId)) return false;
  bullet.hit.push(coverId);
  return true;
}

