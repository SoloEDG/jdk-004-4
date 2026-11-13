import type { CoverKind, FieldPreview, GameDoc } from "../../../shared/types";
import { COVER_PRESETS, MAX_COVERS, REJECT_LABELS } from "../model/catalog";

export function FieldPanel({
  doc,
  preset,
  preview,
  onPreset,
}: {
  doc: GameDoc;
  preset: string;
  preview: FieldPreview | null;
  onPreset: (id: string) => void;
}) {
  const kindLabel = (kind: CoverKind) =>
    kind === "cover" ? "破坏掩体" : "导航障碍";
  return (
    <section className="panel field-panel">
      <div className="section-caption">
        <span>场地编辑</span>
        <span className="mono muted">
          {doc.field.covers.length} / {MAX_COVERS}
        </span>
      </div>
      <div className="field-presets">
        {COVER_PRESETS.map((p) => (
          <button
            key={p.id}
            className={`${preset === p.id ? "active" : ""} ${p.kind}`}
            onClick={() => onPreset(p.id)}
          >
            <i style={{ width: Math.min(38, 12 + p.w / 4), height: Math.min(16, 6 + p.h / 8) }} />
            <span>
              {p.label}
              <small>{kindLabel(p.kind)}</small>
            </span>
          </button>
        ))}
      </div>
      <div className={`field-preview ${preview ? (preview.ok ? "ok" : "bad") : ""}`}>
        {!preview ? (
          <>
            <strong>选择形状后在画布上落点</strong>
            <span>预览同时参与战斗碰撞与波次出生检查。</span>
          </>
        ) : preview.ok ? (
          <>
            <strong>
              {kindLabel(preview.kind)}可放置 · 锁定 {preview.lockedCells} 格
            </strong>
            <span>
              可通行区域 {preview.reachableCells} 格 · 点击确认
            </span>
          </>
        ) : (
          <>
            <strong>拒绝放置</strong>
            <span>
              {REJECT_LABELS[preview.reason ?? ""] || "未知原因"}
              {preview.reason === "traps-player" && " · 原场地已保留"}
            </span>
          </>
        )}
      </div>
      <div className="field-stats mono tiny">
        FULL {doc.field.nav.fullBuilds} · PATCH {doc.field.nav.localPatches} ·
        SEARCH {doc.field.nav.pathSearches}
      </div>
      <p className="tiny">
        破坏掩体可被武器击碎；导航障碍不可破坏。局部更新导航，不会每帧重算全图。
      </p>
    </section>
  );
}
