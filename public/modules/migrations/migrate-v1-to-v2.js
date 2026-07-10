import { cloneState } from "../domain/state-schema.js";

export function migrateV1ToV2(sourceState) {
  const state = cloneState(sourceState || {});
  state.schemaVersion = 2;
  if (!Number.isInteger(Number(state.dataRevision)) || Number(state.dataRevision) < 0) state.dataRevision = 0;
  return { state, warnings: [] };
}
