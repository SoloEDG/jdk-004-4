import { useState } from "react";
import type { FieldEdit, FieldPreview, GameDoc } from "../shared/types";
import { inspectPlacement } from "../features/field/lib/placement";
import { applyEdit } from "../features/field/model/fieldState";
import { REJECT_LABELS } from "../features/field/model/catalog";

/**
 * Owns placement interaction state for the workspace. Previews are computed
 * from a pure function and kept in React state only: they never write to the
 * game document, so a paused battle cannot drift while the ghost moves.
 */
export function useField(game: React.RefObject<GameDoc>) {
  const [preset, setPreset] = useState("barrier");
  const [placing, setPlacing] = useState(false);
  const [preview, setPreview] = useState<FieldPreview | null>(null);
  const [showNav, setShowNav] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const clearPreview = () => {
    setPreview(null);
    game.current.field.pendingEdit = null;
  };

  const pickPreset = (id: string) => {
    setPreset(id);
    setPlacing(true);
    clearPreview();
  };

  const togglePlacing = () => {
    setPlacing((on) => {
      if (on) clearPreview();
      return !on;
    });
  };

  const previewAt = (edit: FieldEdit | null) => {
    const preview = edit ? inspectPlacement(game.current, edit) : null;
    setPreview(preview);
    // While a run is active the preview is published for the next simulation
    // step, where combat collision and wave births both read it. Paused
    // previews stay in React state, so no battle entity can drift.
    game.current.field.pendingEdit =
      game.current.phase === "playing" && preview?.ok ? edit : null;
  };

  const place = (edit: FieldEdit): boolean => {
    // A committed edit supersedes any preview targeting the same spot.
    game.current.field.pendingEdit = null;
    const result = applyEdit(game.current, edit);
    if (!result.ok) {
      setNotice(
        `拒绝应用：${REJECT_LABELS[result.preview.reason ?? ""] ?? "放置无效"} · 原场地已保留`,
      );
      setPreview(result.preview);
      return false;
    }
    const nav = result.nav;
    setNotice(
      `已应用 ${result.preview.kind === "cover" ? "破坏掩体" : "导航障碍"}` +
        (nav ? ` · 局部更新 ${nav.cells} 格` : ""),
    );
    setPreview(null);
    game.current.field.pendingEdit = null;
    return true;
  };

  return {
    preset,
    placing,
    preview,
    showNav,
    notice,
    setShowNav,
    pickPreset,
    togglePlacing,
    previewAt,
    place,
  };
}
