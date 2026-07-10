import { canonicalCounts, extractDerivedState } from "../domain/state-schema.js";

export async function sha256Hex(value) {
  if (!globalThis.crypto?.subtle) throw new Error("Web Crypto SHA-256 is required for migration safety checks");
  const bytes = new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function aggregateBy(items, keyParts, value) {
  const totals = {};
  for (const item of items || []) {
    const key = keyParts.map((part) => item?.[part] || "").join("|");
    totals[key] = (totals[key] || 0) + Number(item?.[value] || 0);
  }
  return totals;
}

export function financialSnapshot(state) {
  const derived = extractDerivedState(state);
  return {
    inventory: aggregateBy(derived.buyLots, ["portfolioId", "brokerAccountId", "securityId"], "remainingShares"),
    cash: aggregateBy(derived.cashLedger, ["portfolioId", "brokerAccountId"], "amount"),
    realizedProfit: (derived.sellMatches || []).reduce((total, item) => total + Number(item.netProfit || 0), 0) +
      (derived.borrowRebuyCycles || []).reduce((total, item) => total + Number(item.netProfit || 0), 0),
    openRegularRebuyShares: (derived.rebuyTasks || []).reduce((total, item) => total + Math.max(0, Number(item.remainingRebuyShares || 0)), 0),
    openBorrowRebuyShares: (derived.borrowRebuyCycles || []).reduce((total, item) => total + Math.max(0, Number(item.remainingRebuyQty || 0)), 0)
  };
}

export async function createSafetyBackupEnvelope(sourceState, { targetSchemaVersion, sourceRevision } = {}) {
  const rawState = JSON.parse(JSON.stringify(sourceState || {}));
  const serialized = JSON.stringify(rawState);
  return {
    format: "stockbook-pre-migration-backup-v1",
    schemaVersion: Number(rawState.schemaVersion || 1),
    createdAt: new Date().toISOString(),
    targetSchemaVersion,
    sourceRevision: sourceRevision ?? rawState.dataRevision ?? 0,
    checksum: { algorithm: "SHA-256", value: await sha256Hex(serialized) },
    state: rawState
  };
}

export function createMigrationReport(sourceState, candidateState, { sourceSchemaVersion, targetSchemaVersion, unresolvedRecords = [], warnings = [], errors = [] } = {}) {
  const before = canonicalCounts(sourceState);
  const after = canonicalCounts(candidateState);
  const canonicalCountLosses = Object.keys(before).filter((key) => after[key] < before[key]);
  const sourceFinancial = financialSnapshot(sourceState);
  const candidateFinancial = financialSnapshot(candidateState);
  const blockingErrors = [...errors];
  if (canonicalCountLosses.length) blockingErrors.push({ code: "CANONICAL_RECORD_COUNT_DECREASED", keys: canonicalCountLosses });
  if (unresolvedRecords.length) blockingErrors.push({ code: "UNRESOLVED_REFERENCES", count: unresolvedRecords.length });
  return {
    sourceSchemaVersion,
    targetSchemaVersion,
    canonicalCountsBefore: before,
    canonicalCountsAfter: after,
    inventoryBefore: sourceFinancial.inventory,
    inventoryAfter: candidateFinancial.inventory,
    cashBefore: sourceFinancial.cash,
    cashAfter: candidateFinancial.cash,
    realizedProfitBefore: sourceFinancial.realizedProfit,
    realizedProfitAfter: candidateFinancial.realizedProfit,
    openRegularRebuySharesBefore: sourceFinancial.openRegularRebuyShares,
    openRegularRebuySharesAfter: candidateFinancial.openRegularRebuyShares,
    openBorrowCycleSharesBefore: sourceFinancial.openBorrowRebuyShares,
    openBorrowCycleSharesAfter: candidateFinancial.openBorrowRebuyShares,
    unresolvedRecords,
    warnings,
    errors: blockingErrors,
    safeToApply: blockingErrors.length === 0
  };
}
