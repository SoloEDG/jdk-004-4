export const NAV_CELL = 25;
/** Clearance added around solid geometry when rasterising the walkable grid. */
export const NAV_RADIUS = 12;
export const FIELD_MARGIN = 20;
export const MAX_COVERS = 24;
export const COVER_MIN_SIZE = 16;

export const COVER_CATALOG = {
  cover: {
    name: "可破坏掩体",
    hp: 44,
    color: "#6fd3bf",
    glow: "#9bf6e2",
    labels: ["破坏掩体", "DESTRUCTIBLE"],
    destructible: true,
  },
  obstacle: {
    name: "导航障碍",
    hp: 0,
    color: "#a68ae0",
    glow: "#c5b3ff",
    labels: ["导航障碍", "NAV BLOCKER"],
    destructible: false,
  },
} as const;

export interface CoverPreset {
  id: string;
  kind: "cover" | "obstacle";
  label: string;
  w: number;
  h: number;
}

export const COVER_PRESETS: CoverPreset[] = [
  { id: "barrier", kind: "cover", label: "横向掩体", w: 130, h: 26 },
  { id: "crate", kind: "cover", label: "掩体箱", w: 56, h: 56 },
  { id: "pillar", kind: "obstacle", label: "纵向障碍", w: 30, h: 130 },
  { id: "block", kind: "obstacle", label: "横向障碍", w: 130, h: 30 },
];

export const REJECT_LABELS: Record<string, string> = {
  "out-of-bounds": "超出战场边界",
  "too-small": "尺寸过小",
  "player-overlap": "会压住角色",
  "enemy-overlap": "会压住敌人",
  "traps-player": "会把角色围死",
  "too-many-covers": "掩体数量已达上限",
};
