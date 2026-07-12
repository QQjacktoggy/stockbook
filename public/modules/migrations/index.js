import { CURRENT_SCHEMA_VERSION, cloneState, normalizeSchemaVersion } from "../domain/state-schema.js";
import { validateCanonicalState } from "../domain/invariants.js";
import { createMigrationReport, createSafetyBackupEnvelope, sha256Hex } from "./migration-report.js";
import { migrateV1ToV2 } from "./migrate-v1-to-v2.js";
import { migrateV2ToV3 } from "./migrate-v2-to-v3.js";

const MIGRATIONS = new Map([
  [1, migrateV1ToV2],
  [2, migrateV2ToV3]
]);

export function detectSchemaVersion(state) {
  return normalizeSchemaVersion(state?.schemaVersion);
}

export function migrateState(sourceState) {
  const source = cloneState(sourceState || {});
  const sourceSchemaVersion = detectSchemaVersion(source);
  if (sourceSchemaVersion > CURRENT_SCHEMA_VERSION) throw new Error(`Unsupported future schema version: ${sourceSchemaVersion}`);
  let state = source;
  let version = sourceSchemaVersion;
  const warnings = [];
  while (version < CURRENT_SCHEMA_VERSION) {
    const migration = MIGRATIONS.get(version);
    if (!migration) throw new Error(`Missing migration from schema version ${version}`);
    const result = migration(state);
    state = result.state;
    warnings.push(...(result.warnings || []));
    version = detectSchemaVersion(state);
  }
  return { state, sourceSchemaVersion, targetSchemaVersion: version, warnings };
}

export async function runMigrationDryRun(sourceState) {
  const source = cloneState(sourceState || {});
  const sourceChecksum = await sha256Hex(JSON.stringify(source));
  const { state: candidate, sourceSchemaVersion, targetSchemaVersion, warnings } = migrateState(source);
  const candidateChecksum = await sha256Hex(JSON.stringify(candidate));
  const validation = validateCanonicalState(candidate);
  const report = createMigrationReport(source, candidate, {
    sourceSchemaVersion,
    targetSchemaVersion,
    unresolvedRecords: [...validation.errors, ...validation.warnings.filter((entry) => entry.code === "MIGRATION_REVIEW_REQUIRED")],
    warnings: [...warnings, ...validation.warnings],
    errors: validation.errors
  });
  return { ...report, sourceChecksum, candidateChecksum, candidate };
}

export async function prepareMigration(sourceState) {
  const dryRun = await runMigrationDryRun(sourceState);
  const backup = await createSafetyBackupEnvelope(sourceState, {
    targetSchemaVersion: dryRun.targetSchemaVersion,
    sourceRevision: sourceState?.dataRevision ?? 0
  });
  return { backup, dryRun };
}
