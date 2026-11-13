import type { Cover, FieldPreview, GameDoc } from "../../../shared/types";
import { WIDTH, HEIGHT } from "../../../shared/types";
import { COVER_CATALOG } from "../../field/model/catalog";
import { hashNoise } from "../../../shared/math";

export interface RenderOptions {
  preview?: FieldPreview | null;
  showNav?: boolean;
  now?: number;
}

export function renderScene(
  ctx: CanvasRenderingContext2D,
  d: GameDoc,
  options: RenderOptions = {},
) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "#0a1019";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.strokeStyle = "#172431";
  ctx.lineWidth = 0.6;
  for (let x = 0; x < WIDTH; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, HEIGHT);
    ctx.stroke();
  }
  for (let y = 0; y < HEIGHT; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WIDTH, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "#2d424d";
  ctx.setLineDash([6, 8]);
  ctx.strokeRect(28, 28, WIDTH - 56, HEIGHT - 56);
  ctx.setLineDash([]);
  ctx.strokeStyle = "#152c35";
  for (const r of [110, 220, 330]) {
    ctx.beginPath();
    ctx.arc(500, 325, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Covers render above the floor but beneath entities, so a bullet visibly
  // dies at the face of a barrier instead of disappearing under it.
  if (options.showNav) drawNav(ctx, d);
  drawCovers(ctx, d, options);
  for (const drop of d.drops) {
    ctx.fillStyle =
      drop.kind === "xp"
        ? "#9eeaa6"
        : drop.kind === "heal"
          ? "#fc91aa"
          : "#8ac6ff";
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 10;
    ctx.save();
    ctx.translate(drop.x, drop.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-4, -4, 8, 8);
    ctx.restore();
  }
  ctx.shadowBlur = 0;
  for (const e of d.enemies) {
    const color =
      e.kind === "shooter"
        ? "#bb9eff"
        : e.kind === "elite"
          ? "#ffae70"
          : "#ed697b";
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    if (e.kind === "chaser") {
      ctx.moveTo(e.x, e.y - 12);
      ctx.lineTo(e.x + 11, e.y + 9);
      ctx.lineTo(e.x - 11, e.y + 9);
      ctx.closePath();
    } else {
      ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#10121d";
    ctx.beginPath();
    ctx.arc(e.x, e.y, 4, 0, Math.PI * 2);
    ctx.fill();
    if (e.hp < e.maxHp) {
      ctx.fillStyle = "#ef7287";
      ctx.fillRect(e.x - 14, e.y - 22, (28 * e.hp) / e.maxHp, 2);
    }
  }
  for (const b of d.bullets) {
    ctx.fillStyle =
      b.owner === "enemy"
        ? "#ff827d"
        : b.weapon === "nova"
          ? "#ba9fff"
          : b.weapon === "orbit"
            ? "#f7cd79"
            : "#a7ffe1";
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  const p = d.player;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.strokeStyle = "#9eeeb3";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, 24, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = p.invincible > 0 ? 0.45 : 1;
  ctx.shadowColor = "#a9ffd7";
  ctx.shadowBlur = 24;
  ctx.fillStyle = "#cdfedc";
  ctx.beginPath();
  ctx.moveTo(0, -17);
  ctx.lineTo(12, 11);
  ctx.lineTo(0, 7);
  ctx.lineTo(-12, 11);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#193b3b";
  ctx.fillRect(-3, -3, 6, 6);
  ctx.restore();
  ctx.fillStyle = "#526571";
  ctx.font = "10px monospace";
  ctx.fillText("SECTOR 07 / SIGNAL ACTIVE", 48, HEIGHT - 42);
  ctx.fillText(
    `${d.enemies.length.toString().padStart(3, "0")} HOSTILES`,
    WIDTH - 145,
    HEIGHT - 42,
  );
}

function drawNav(ctx: CanvasRenderingContext2D, d: GameDoc) {
  const nav = d.field.nav;
  ctx.save();
  ctx.fillStyle = "#4b90a829";
  for (let row = 0; row < nav.rows; row++) {
    for (let col = 0; col < nav.cols; col++) {
      if (!nav.blocked[row * nav.cols + col]) continue;
      ctx.fillRect(col * nav.cell, row * nav.cell, nav.cell - 1, nav.cell - 1);
    }
  }
  const patch = nav.lastPatch;
  if (patch) {
    ctx.strokeStyle = "#9fead055";
    ctx.setLineDash([4, 5]);
    ctx.strokeRect(patch.x, patch.y, patch.w, patch.h);
    ctx.setLineDash([]);
  }
  ctx.restore();
}

/**
 * Occlusion uses the field's published `visibleIds`, which is replaced in the
 * same call that patches navigation. Broken covers therefore stop casting shade
 * on the very step their passability opens up.
 */
function drawCovers(
  ctx: CanvasRenderingContext2D,
  d: GameDoc,
  options: RenderOptions,
) {
  const visible = d.field.occlusion.visibleIds;
  const now = options.now ?? 0;
  for (const cover of d.field.covers) {
    // The occlusion set is the single authority: a cover absent from it is
    // already broken/passable, so it must not be drawn.
    if (!visible.includes(cover.id)) continue;
    paintCover(ctx, cover, now);
  }
  const preview = options.preview;
  if (!preview) return;
  const { x, y, w, h } = preview.rect;
  ctx.save();
  ctx.lineWidth = 1.5;
  ctx.fillStyle = preview.ok ? "#9bf6e222" : "#ff7a8a22";
  ctx.strokeStyle = preview.ok ? "#9bf6e2" : "#ff7a8a";
  ctx.setLineDash([5, 4]);
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);
  // Shade the nav cells the placement would lock, using the shared preview data.
  ctx.fillStyle = preview.ok ? "#9bf6e21c" : "#ff7a8a1c";
  const nav = d.field.nav;
  for (const index of preview.changedCells) {
    const col = index % nav.cols,
      row = Math.floor(index / nav.cols);
    ctx.fillRect(col * nav.cell, row * nav.cell, nav.cell - 1, nav.cell - 1);
  }
  ctx.restore();
}

function paintCover(
  ctx: CanvasRenderingContext2D,
  cover: Cover,
  now: number,
) {
  const catalog = COVER_CATALOG[cover.kind];
  const hpRatio = cover.maxHp ? Math.max(0, cover.hp / cover.maxHp) : 1;
  ctx.save();
  ctx.fillStyle = "#0c1a1c";
  ctx.fillRect(cover.x, cover.y, cover.w, cover.h);
  ctx.fillStyle = catalog.color;
  ctx.globalAlpha = 0.16 + hpRatio * 0.14;
  ctx.fillRect(cover.x + 2, cover.y + 2, cover.w - 4, cover.h - 4);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = catalog.glow;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1;
  ctx.strokeRect(cover.x + 0.5, cover.y + 0.5, cover.w - 1, cover.h - 1);
  ctx.globalAlpha = 1;
  if (cover.kind === "obstacle") {
    // Non-destructible blockers get a diagonal hatch so intent is readable.
    ctx.strokeStyle = catalog.color + "66";
    ctx.beginPath();
    for (let offset = -cover.h; offset < cover.w; offset += 12) {
      ctx.moveTo(cover.x + offset, cover.y + cover.h);
      ctx.lineTo(cover.x + offset + cover.h, cover.y);
    }
    ctx.stroke();
  } else {
    const cracks = 2 + Math.round((1 - hpRatio) * 5);
    ctx.strokeStyle = "#d3fff066";
    ctx.lineWidth = 0.8;
    for (let i = 0; i < cracks; i++) {
      const nx = hashNoise(cover.id * 13 + i, cover.id, 2),
        ny = hashNoise(cover.id, cover.id * 7 + i, 5);
      const x0 = cover.x + 4 + nx * (cover.w - 8),
        y0 = cover.y + 3 + ny * (cover.h - 6);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + (nx - 0.5) * 14, y0 + (ny - 0.5) * 10);
      ctx.stroke();
    }
    ctx.fillStyle = catalog.glow;
    ctx.globalAlpha = 0.22 + hpRatio * 0.3;
    const barWidth = Math.max(0, (cover.w - 10) * hpRatio);
    ctx.fillRect(cover.x + 5, cover.y + cover.h - 4, barWidth, 1.5);
    ctx.globalAlpha = 1;
    if (hpRatio < 1) {
      const pulse = 0.4 + Math.sin(now * 0.008 + cover.id) * 0.2;
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = "#ffd9c4";
      ctx.strokeRect(cover.x + 1.5, cover.y + 1.5, cover.w - 3, cover.h - 3);
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}
