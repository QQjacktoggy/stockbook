import { cloneState } from "../domain/state-schema.js";

export function migrateV2ToV3(sourceState) {
  const state = cloneState(sourceState || {});
  state.schemaVersion = 3;
  if (!Number.isInteger(Number(state.dataRevision)) || Number(state.dataRevision) < 0) state.dataRevision = 0;
  return { state, warnings: [] };
}
