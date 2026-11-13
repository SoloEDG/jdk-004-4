import type { Vec, GameDoc } from "./types";
export const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));
export const distance = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
export function random(doc: GameDoc) {
  doc.seed = (Math.imul(doc.seed, 1664525) + 1013904223) >>> 0;
  return doc.seed / 4294967296;
}
export const normalize = (x: number, y: number): Vec => {
  const n = Math.hypot(x, y) || 1;
  return { x: x / n, y: y / n };
};
/** Deterministic positional hash in [0, 1); used for cosmetic variation. */
export function hashNoise(x: number, y: number, salt = 0): number {
  const n =
    Math.sin(
      (Math.round(x) * 12.9898 + Math.round(y) * 78.233 + salt * 37.719) *
        43758.5453,
    ) * 0.5;
  return Math.abs(n - Math.floor(n));
}

export function formatTime(t: number) {
  return `${Math.floor(t / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(t % 60)
    .toString()
    .padStart(2, "0")}`;
}
