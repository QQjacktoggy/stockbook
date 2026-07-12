# Stockbook First-Round Review Foundation

## Scope

This audit compares the repair plan with the current `main` implementation. This PR deliberately adds only a migration dry-run foundation, canonical/derived inventory, invariant scaffolding, representative fixtures, and audit documentation. It does not change production writes, Firebase sync behavior, matching behavior, storage implementation, UI, Firestore rules, or Functions deployment.

## Confirmed Findings

| Finding | Current evidence | First-round action |
|---|---|---|
| Root schema version is absent. | `public/app.js:124-186` initializes state without `schemaVersion` or `dataRevision`; `normalizeState` at `198-223` only merges defaults. | Added sequential v1 -> v2 -> v3 dry-run framework. |
| Derived data is persisted with canonical data. | `persist` at `225-227` serializes all global state; `recomputeAll` at `5181-5187` rebuilds derived arrays. | Added explicit canonical and derived inventories; no production serialization change yet. |
| Firebase chooses remote data using collection counts. | `ledgerContentScore` at `5910-5914`; `smartFirebaseSync` at `5937-5953`. | Documented and left unchanged pending a separate versioned-snapshot/sync PR. |
| Firebase chunk writes are not revisioned. | `syncToFirebase` at `5956-6005` writes fixed `chunks/chunk_{index}` paths. | Documented and left unchanged pending Firebase emulator coverage. |
| Ledger paths use an email-derived namespace. | `firebaseNamespace` at `6039-6043`; Firestore path use at `5917` and `5971`. | Documented; UID migration requires a dedicated data migration. |
| Firestore chunk rules trust child document ownership. | `firestore.rules:9-13` checks chunk `ownerUid`, not parent ledger ownership. | Documented; rules changes are intentionally deferred until emulator tests exist. |
| Borrow sources are represented as a comma-separated string. | `sourceInventoryLotId` form/rendering at `903-922`; reservations at `1062-1088`; cycles at `5378-5467`. | Dry-run marks legacy multi-lot borrow sells without allocations as `MIGRATION_REVIEW_REQUIRED`. |
| Position transfers are not part of the lot derivation. | Transaction lot derivation starts at `5189`; position transfers only affect transfer pages/cash/report references, including `4334-4340`. | Documented; lineage implementation is a separate domain PR. |
| Core calculations use JavaScript number arithmetic and proportional rounding. | Regular match allocation at `5248-5260`; borrow calculations at `5404-5437`. | Documented; no financial arithmetic changes in this foundation PR. |
| Ordering is date-only. | `sortByDateAsc` at `8145-8148`; used in lot, cycle, cash, and report derivation. | Added a pure stable ordering helper and test, without changing existing ordering. |
| Master data deletion can remove referenced records. | Portfolio deletion removes related arrays at `4560-4588`; broker deletion uses `deletedBrokerIds` at `4609-4627`; account deletion removes transactions/transfers at `4768-4791`. | Documented; archive migration is deferred because it changes user-facing behavior. |
| Persistence mutates global state before localStorage write. | Mutating handlers call `commit` at `229-235`; `persist` is non-transactional at `225-227`. | Documented; IndexedDB command boundary is deferred. |
| Drive OAuth state lacks explicit single-use consumption. | State write at `233-248`, callback read/delete at `254-286` in `functions/index.js`. | Documented; Functions changes are deferred until required secrets/emulator tests are available. |

## Not Applicable Findings

- Firebase A/B Testing is not present in `firebase.json`, `public/`, or `functions/`.
- The app is not built with React, Vue, or another SPA framework. It is a vanilla JavaScript hash-routed application.
- This first round does not deploy Hosting, Firestore rules, or Functions.

## Additional Findings

1. `rebuyFills` is listed as canonical in the repair plan but is currently rebuilt and overwritten by `recomputeLotsMatchesAndRebuy` at `5326-5375`. Treating it as canonical during migration would conflict with current behavior; its authoritative status needs an explicit design decision before extraction.
2. `reconciliationLinks` is named canonical in the current state but is recalculated by `runReconciliation` before derived rebuilding at `5181-5184`. Its lifecycle also needs an explicit design decision before canonical extraction.
3. Current automated tests run `public/app.js` in a VM after removing browser bootstrap. The new foundation modules are isolated ESM modules so migration and invariant tests can run without DOM/Firebase dependencies.

## First-Round Artifacts

- `public/modules/domain/state-schema.js`: canonical/derived inventory and stable ordering helper.
- `public/modules/domain/invariants.js`: non-mutating canonical and derived invariant checks.
- `public/modules/migrations/`: v1 -> v2 -> v3 dry-run-only migration framework, report, and safety-backup envelope builder.
- `tests/fixtures/`: representative legacy valid and review-required states.
- `tests/migrations/migration-dry-run.test.mjs`: source immutability, idempotence, unresolved-record blocking, canonical/derived separation, and stable-order tests.

## Rollback

This PR only adds files and does not call the new modules from the running application. Reverting the commit removes the foundation without changing localStorage or Firestore data.
