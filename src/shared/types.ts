export type Vec = { x: number; y: number };
export type Phase = "ready" | "playing" | "paused" | "upgrade" | "ended";
export type WeaponId = "pulse" | "orbit" | "nova";
export interface Player extends Vec {
  hp: number;
  maxHp: number;
  speed: number;
  radius: number;
  invincible: number;
}
export type CoverKind = "cover" | "obstacle";
/** Axis-aligned field geometry. `x`/`y` are the top-left corner. */
export interface Cover extends Vec {
  id: number;
  kind: CoverKind;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
}
export interface NavPatch {
  x: number;
  y: number;
  w: number;
  h: number;
  cells: number;
}
/**
 * Passability grid used by enemy routing, drop placement and spawn checks.
 * It is rebuilt once per field and afterwards patched only inside the cells
 * touched by an edit or a destroyed cover.
 */
export interface NavState {
  cell: number;
  cols: number;
  rows: number;
  blocked: Uint8Array;
  fullBuilds: number;
  localPatches: number;
  pathSearches: number;
  lastPatch: NavPatch | null;
}
/** Which covers the renderer should shade; replaced atomically with a field edit. */
export interface OcclusionState {
  revision: number;
  visibleIds: number[];
}
export interface FieldState {
  covers: Cover[];
  nextCoverId: number;
  revision: number;
  nav: NavState;
  occlusion: OcclusionState;
  acceptedEdits: number;
  /** Shared pending preview: combat collision and spawn checks both read it. */
  pending: FieldPreview | null;
  /** Re-based once per simulation step so the preview never goes stale. */
  pendingEdit: FieldEdit | null;
}
export interface FieldEdit {
  kind?: CoverKind;
  x: number;
  y: number;
  w: number;
  h: number;
  hp?: number;
}
export type FieldRejectReason =
  | "out-of-bounds"
  | "too-small"
  | "player-overlap"
  | "enemy-overlap"
  | "traps-player"
  | "too-many-covers";
/**
 * Result of a pure placement preview. Combat collision and wave spawn checks
 * share the same prospective geometry instead of re-deriving it per system.
 */
export interface FieldPreview {
  ok: boolean;
  reason: FieldRejectReason | null;
  kind: CoverKind;
  rect: { x: number; y: number; w: number; h: number };
  lockedCells: number;
  reachableCells: number;
  /** Nav cells that would flip state; shared by collision and spawn validation. */
  changedCells: number[];
}
export interface EnemyRoute {
  revision: number;
  goal: Vec;
  index: number;
  expires: number;
  points: Vec[];
}
export interface Enemy extends Vec {
  id: number;
  kind: "chaser" | "shooter" | "elite";
  hp: number;
  maxHp: number;
  radius: number;
  cooldown: number;
  route?: EnemyRoute;
}
export interface Bullet extends Vec {
  id: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  life: number;
  owner: "player" | "enemy";
  weapon: WeaponId | "enemy";
  pierce: number;
  hit: number[];
}
export interface Drop extends Vec {
  id: number;
  kind: "xp" | "heal" | "magnet";
  value: number;
  life: number;
}
export interface Weapon {
  id: WeaponId;
  level: number;
  cooldown: number;
}
export interface Upgrade {
  id: string;
  name: string;
  description: string;
  category: string;
  max: number;
}
export interface RunStats {
  kills: number;
  damage: number;
  taken: number;
  collected: number;
  shots: number;
  byWeapon: Record<WeaponId, number>;
}
export interface RunRecord {
  id: string;
  duration: number;
  wave: number;
  level: number;
  kills: number;
  damage: number;
  weapons: string[];
  victory: boolean;
}
export interface GameDoc {
  version: 1;
  seed: number;
  initialSeed: number;
  nextId: number;
  phase: Phase;
  time: number;
  player: Player;
  enemies: Enemy[];
  bullets: Bullet[];
  drops: Drop[];
  weapons: Weapon[];
  upgrades: Record<string, number>;
  choices: string[];
  xp: number;
  level: number;
  pendingLevels: number;
  wave: number;
  waveTime: number;
  spawnBudget: number;
  stats: RunStats;
  records: RunRecord[];
  notice: string;
  victory: boolean;
  field: FieldState;
}
export interface Input {
  x: number;
  y: number;
  aim: Vec;
  firing: boolean;
}
export interface KillEvent {
  enemy: Enemy;
  weapon: WeaponId;
}
export interface FrameEvents {
  weaponDamage?: Partial<Record<WeaponId, number>>;
  kills: KillEvent[];
  damage: number;
  taken: number;
  shots: number;
  collected: number;
  brokenCovers: Cover[];
}
export const WIDTH = 1000;
export const HEIGHT = 650;
