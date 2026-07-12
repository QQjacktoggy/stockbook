export const CURRENT_SCHEMA_VERSION = 3;

export const CANONICAL_COLLECTION_KEYS = Object.freeze([
  "users",
  "sessions",
  "portfolios",
  "portfolioMembers",
  "securities",
  "brokers",
  "brokerAccounts",
  "importTemplates",
  "importBatches",
  "rawImportRows",
  "appTransactions",
  "brokerExecutions",
  "reconciliationLinks",
  "acceptedBrokerDiffs",
  "accountTransfers",
  "positionTransfers",
  "manualClosedRebuySellIds",
  "marketQuotes",
  "auditLogs",
  "settings"
]);

export const DERIVED_COLLECTION_KEYS = Object.freeze([
  "buyLots",
  "sellMatches",
  "rebuyTasks",
  "rebuyFills",
  "borrowRebuyCycles",
  "cashAccounts",
  "cashLedger"
]);

export function cloneState(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function normalizeSchemaVersion(value) {
  const version = Number(value || 1);
  return Number.isInteger(version) && version > 0 ? version : 1;
}

export function extractCanonicalState(state) {
  const source = state || {};
  const canonical = {
    schemaVersion: normalizeSchemaVersion(source.schemaVersion),
    dataRevision: Number.isInteger(Number(source.dataRevision)) && Number(source.dataRevision) >= 0 ? Number(source.dataRevision) : 0
  };
  for (const key of CANONICAL_COLLECTION_KEYS) {
    const fallback = key === "acceptedBrokerDiffs" || key === "settings" || key === "sessions" ? {} : [];
    canonical[key] = cloneState(source[key] ?? fallback);
  }
  return canonical;
}

export function extractDerivedState(state) {
  const source = state || {};
  const derived = {};
  for (const key of DERIVED_COLLECTION_KEYS) derived[key] = cloneState(source[key] || []);
  return derived;
}

export function canonicalCounts(state) {
  const canonical = extractCanonicalState(state);
  return Object.fromEntries(CANONICAL_COLLECTION_KEYS.map((key) => [
    key,
    Array.isArray(canonical[key]) ? canonical[key].length : Object.keys(canonical[key] || {}).length
  ]));
}

export function stableTransactionCompare(a, b) {
  const left = a || {};
  const right = b || {};
  const fields = ["tradeDate", "executionTime", "brokerSequence", "importRowIndex", "createdSequence", "id"];
  for (const field of fields) {
    const result = String(left[field] ?? "").localeCompare(String(right[field] ?? ""), "en", { numeric: true });
    if (result) return result;
  }
  return 0;
}

export function stableSortTransactions(transactions) {
  return [...(transactions || [])].sort(stableTransactionCompare);
}
