import { useEffect, useRef } from "react";
import type { FieldEdit, FieldPreview, GameDoc, Input } from "../../../shared/types";
import { WIDTH, HEIGHT } from "../../../shared/types";
import { renderScene } from "../lib/renderScene";
import { COVER_PRESETS } from "../../field/model/catalog";

export function Battlefield({
  doc,
  input,
  preset,
  preview,
  placing,
  onPreviewAt,
  onPlace,
  showNav,
}: {
  doc: GameDoc;
  input: React.RefObject<Input>;
  preset: string;
  preview: FieldPreview | null;
  placing: boolean;
  onPreviewAt: (edit: FieldEdit | null) => void;
  onPlace: (edit: FieldEdit) => void;
  showNav: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const dragging = useRef(false);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (ctx)
      renderScene(ctx, doc, { preview, showNav, now: performance.now() });
  });
  const toEdit = (clientX: number, clientY: number): FieldEdit => {
    const shape =
      COVER_PRESETS.find((p) => p.id === preset) ?? COVER_PRESETS[0];
    const r = canvas.current!.getBoundingClientRect();
    const x = ((clientX - r.left) * WIDTH) / r.width,
      y = ((clientY - r.top) * HEIGHT) / r.height;
    // The pointer marks the centre of the shape; the field stores top-left.
    return {
      kind: shape.kind,
      x: x - shape.w / 2,
      y: y - shape.h / 2,
      w: shape.w,
      h: shape.h,
    };
  };
  return (
    <canvas
      ref={canvas}
      width={WIDTH}
      height={HEIGHT}
      aria-label="弹幕战场，使用 WASD 或方向键移动；悬停画布可预览掩体放置"
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        input.current.aim = {
          x: ((e.clientX - r.left) * WIDTH) / r.width,
          y: ((e.clientY - r.top) * HEIGHT) / r.height,
        };
        onPreviewAt(placing ? toEdit(e.clientX, e.clientY) : null);
      }}
      onPointerLeave={() => {
        dragging.current = false;
        onPreviewAt(null);
      }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        // Placement mode owns the pointer; otherwise it is the fire button.
        if (placing) {
          dragging.current = true;
          onPreviewAt(toEdit(e.clientX, e.clientY));
          return;
        }
        input.current.firing = true;
      }}
      onPointerUp={(e) => {
        input.current.firing = false;
        if (!placing || !dragging.current) return;
        dragging.current = false;
        onPlace(toEdit(e.clientX, e.clientY));
      }}
      onPointerCancel={() => {
        dragging.current = false;
        input.current.firing = false;
      }}
      onLostPointerCapture={() => {
        dragging.current = false;
        input.current.firing = false;
      }}
    />
  );
}
