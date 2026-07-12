import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { CURRENT_SCHEMA_VERSION, extractCanonicalState, extractDerivedState, stableSortTransactions } from "../../public/modules/domain/state-schema.js";
import { validateCanonicalState, validateDerivedState } from "../../public/modules/domain/invariants.js";
import { prepareMigration, runMigrationDryRun } from "../../public/modules/migrations/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(await readFile(resolve(here, "../fixtures/legacy-v1-state.json"), "utf8"));
const unresolvedFixture = JSON.parse(await readFile(resolve(here, "../fixtures/legacy-unresolved-borrow-state.json"), "utf8"));
const original = JSON.stringify(fixture);

const dryRun = await runMigrationDryRun(fixture);
assert.equal(JSON.stringify(fixture), original, "dry run must not mutate the source state");
assert.equal(dryRun.sourceSchemaVersion, 1);
assert.equal(dryRun.targetSchemaVersion, CURRENT_SCHEMA_VERSION);
assert.equal(dryRun.safeToApply, true);
assert.equal(dryRun.canonicalCountsBefore.appTransactions, dryRun.canonicalCountsAfter.appTransactions);
assert.equal(dryRun.candidate.schemaVersion, CURRENT_SCHEMA_VERSION);

const secondRun = await runMigrationDryRun(dryRun.candidate);
assert.equal(secondRun.safeToApply, true);
assert.equal(secondRun.candidateChecksum, dryRun.candidateChecksum, "migration must be idempotent");

const prepared = await prepareMigration(fixture);
assert.equal(prepared.backup.format, "stockbook-pre-migration-backup-v1");
assert.equal(prepared.backup.checksum.algorithm, "SHA-256");
assert.equal(prepared.backup.targetSchemaVersion, CURRENT_SCHEMA_VERSION);

const unresolved = await runMigrationDryRun(unresolvedFixture);
assert.equal(unresolved.safeToApply, false);
assert.ok(unresolved.unresolvedRecords.some((entry) => entry.code === "MIGRATION_REVIEW_REQUIRED"));

const canonical = extractCanonicalState(fixture);
const derived = extractDerivedState(fixture);
assert.equal(canonical.buyLots, undefined, "derived state must not be included in canonical export");
assert.equal(derived.buyLots.length, 1);
assert.equal(validateCanonicalState(fixture).valid, true);
assert.equal(validateDerivedState(canonical, derived).valid, true);

const unordered = [
  { id: "tx-c", tradeDate: "2026-01-01", createdSequence: 3 },
  { id: "tx-a", tradeDate: "2026-01-01", createdSequence: 1 },
  { id: "tx-b", tradeDate: "2026-01-01", createdSequence: 2 }
];
assert.deepEqual(stableSortTransactions(unordered).map((item) => item.id), ["tx-a", "tx-b", "tx-c"]);
console.log("migration dry-run foundation: PASS");
