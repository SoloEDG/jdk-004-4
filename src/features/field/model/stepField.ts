import type { FieldEdit, GameDoc } from "../../../shared/types";
import { previewEdit } from "./fieldState";

/**
 * Re-bases the shared placement preview once per simulation step.
 *
 * Combat collision uses it to keep projectiles from spawning inside the ghost,
 * and the wave spawner uses it to avoid birthing enemies under it. Both systems
 * read the same object, so their answers cannot disagree. A null edit only
 * clears the preview; it never moves an entity.
 */
export function stepField(doc: GameDoc, edit: FieldEdit | null): void {
  doc.field.pendingEdit = edit;
  doc.field.pending = edit ? previewEdit(doc, edit) : null;
}
