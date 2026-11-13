import type { GameDoc, Input } from "../shared/types";
import { stepCombat } from "../features/combat";
import { stepWaves } from "../features/waves";
import { stepArsenal } from "../features/arsenal";
import { stepProgression } from "../features/progression";
import { stepResults } from "../features/results";
import { stepField } from "../features/field/model/stepField";
export function simulate(doc: GameDoc, input: Input, dt: number) {
  if (doc.phase !== "playing") return;
  doc.time += dt;
  // The shared placement preview is re-based before combat and waves read it,
  // so both see the same prospective geometry for this step.
  stepField(doc, doc.field.pendingEdit);
  stepWaves(doc, dt);
  const shots = stepArsenal(doc, input, dt);
  const events = stepCombat(doc, input, dt);
  events.shots += shots;
  stepProgression(doc, events, dt);
  stepResults(doc, events);
}
