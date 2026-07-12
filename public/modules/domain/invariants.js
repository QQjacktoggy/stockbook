import { CANONICAL_COLLECTION_KEYS, DERIVED_COLLECTION_KEYS, extractCanonicalState } from "./state-schema.js";

function issue(code, path, detail) {
  return { code, path, detail };
}

function ids(items) {
  return new Set((items || []).map((item) => item && item.id).filter(Boolean));
}

export function validateCanonicalState(state) {
  const canonical = extractCanonicalState(state);
  const errors = [];
  const warnings = [];

  for (const key of CANONICAL_COLLECTION_KEYS) {
    if (key === "settings" || key === "acceptedBrokerDiffs" || key === "sessions") continue;
    if (!Array.isArray(canonical[key])) errors.push(issue("CANONICAL_COLLECTION_INVALID", key, "Expected array"));
  }

  const portfolios = ids(canonical.portfolios);
  const accounts = ids(canonical.brokerAccounts);
  const securities = ids(canonical.securities);
  const transactionIds = new Set();
  for (const transaction of canonical.appTransactions || []) {
    if (!transaction?.id) {
      errors.push(issue("TRANSACTION_ID_MISSING", "appTransactions", "Transaction has no id"));
      continue;
    }
    if (transactionIds.has(transaction.id)) errors.push(issue("TRANSACTION_ID_DUPLICATE", transaction.id, "Duplicate transaction id"));
    transactionIds.add(transaction.id);
    if (transaction.portfolioId && !portfolios.has(transaction.portfolioId)) errors.push(issue("TRANSACTION_PORTFOLIO_MISSING", transaction.id, transaction.portfolioId));
    if (transaction.brokerAccountId && !accounts.has(transaction.brokerAccountId)) errors.push(issue("TRANSACTION_ACCOUNT_MISSING", transaction.id, transaction.brokerAccountId));
    if (transaction.securityId && !securities.has(transaction.securityId)) errors.push(issue("TRANSACTION_SECURITY_MISSING", transaction.id, transaction.securityId));
    const sourceLots = String(transaction.sourceInventoryLotId || "").split(/[\s,]+/).filter(Boolean);
    if (transaction.borrowRebuyType === "BORROW_SELL" && sourceLots.length > 1 && !Array.isArray(transaction.borrowSourceAllocations)) {
      warnings.push(issue("MIGRATION_REVIEW_REQUIRED", transaction.id, "Multi-lot borrow sell has no per-lot allocation"));
    }
  }

  for (const transfer of canonical.positionTransfers || []) {
    if (transfer.portfolioId && !portfolios.has(transfer.portfolioId)) errors.push(issue("TRANSFER_PORTFOLIO_MISSING", transfer.id || "positionTransfer", transfer.portfolioId));
    if (transfer.securityId && !securities.has(transfer.securityId)) errors.push(issue("TRANSFER_SECURITY_MISSING", transfer.id || "positionTransfer", transfer.securityId));
    for (const accountId of [transfer.fromBrokerAccountId, transfer.toBrokerAccountId]) {
      if (accountId && !accounts.has(accountId)) errors.push(issue("TRANSFER_ACCOUNT_MISSING", transfer.id || "positionTransfer", accountId));
    }
    if (!Array.isArray(transfer.allocations)) warnings.push(issue("MIGRATION_REVIEW_REQUIRED", transfer.id || "positionTransfer", "Position transfer has no lot allocations"));
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function validateDerivedState(canonicalState, derivedState) {
  const errors = [];
  const warnings = [];
  const derived = derivedState || {};
  for (const key of DERIVED_COLLECTION_KEYS) {
    if (!Array.isArray(derived[key])) errors.push(issue("DERIVED_COLLECTION_INVALID", key, "Expected array"));
  }
  for (const lot of derived.buyLots || []) {
    if (Number(lot.remainingShares) < 0) errors.push(issue("NEGATIVE_REMAINING_SHARES", lot.id || "buyLot", String(lot.remainingShares)));
  }
  for (const match of derived.sellMatches || []) {
    if (Number(match.matchedShares) < 0) errors.push(issue("NEGATIVE_MATCH_SHARES", match.id || "sellMatch", String(match.matchedShares)));
  }
  for (const cycle of derived.borrowRebuyCycles || []) {
    if (Number(cycle.remainingRebuyQty) < 0) errors.push(issue("NEGATIVE_BORROW_OPEN_QTY", cycle.id || "borrowCycle", String(cycle.remainingRebuyQty)));
  }
  return { valid: errors.length === 0, errors, warnings };
}

export function assertValid(result) {
  if (!result.valid) throw new Error(result.errors.map((entry) => `${entry.code}:${entry.path}`).join(", "));
  return result;
}
