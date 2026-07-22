const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appPath = path.resolve(__dirname, "../public/app.js");
const source = fs.readFileSync(appPath, "utf8");
const appSource = source.replace(/window\.addEventListener\("hashchange", render\);[\s\S]*?completeGoogleRedirectLogin\(\);/, "");
assert.notEqual(appSource, source, "test harness must remove browser bootstrap");

function element() {
  return {
    textContent: "",
    className: "",
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {},
    appendChild() {},
    remove() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    setAttribute() {},
    getClientRects() { return []; }
  };
}

const document = { querySelector: element, addEventListener() {}, createElement: element, body: element() };
const localStorage = { getItem() { return null; }, setItem() {} };
const window = { addEventListener() {}, clearTimeout() {}, setTimeout() { return 0; }, location: {}, confirm() { return true; } };
window.document = document;
window.localStorage = localStorage;
const context = { console, document, localStorage, window, setTimeout, clearTimeout };
vm.createContext(context);
vm.runInContext(appSource, context, { filename: appPath });

const base = {
  userId: "user-1",
  portfolioId: "portfolio-1",
  brokerId: "broker-1",
  brokerAccountId: "account-1",
  securityId: "sec-0050",
  transactionType: "BUY",
  fee: 0,
  tax: 0,
  sourceType: "MANUAL",
  isConfirmed: true
};

context.fixture = {
  users: [{ id: "user-1", email: "test@example.com" }],
  sessions: { currentUserId: "user-1" },
  portfolios: [{ id: "portfolio-1", userId: "user-1", name: "0050" }],
  portfolioMembers: [],
  brokerAccounts: [{ id: "account-1", portfolioId: "portfolio-1", brokerId: "broker-1", accountName: "操作帳戶", isActive: true, isDefault: true }],
  securities: [{ id: "sec-0050", symbol: "0050", name: "元大台灣50" }],
  manualClosedRebuySellIds: [],
  appTransactions: [
    { ...base, id: "source-108", tradeDate: "2026-07-01", price: 108, shares: 1000 },
    { ...base, id: "target-110", tradeDate: "2026-07-02", price: 110, shares: 1000 },
    { ...base, id: "target-105", tradeDate: "2026-07-03", price: 105, shares: 500 }
  ]
};

const actual = JSON.parse(vm.runInContext([
  "state = initialState();",
  "Object.assign(state, fixture);",
  "state.ui.currentPortfolioId = 'portfolio-1';",
  "state.ui.activeBrokerAccountId = 'account-1';",
  "recomputeAll();",
  "const beforeLots = inventoryCostExchangeEligibleLots('portfolio-1', 'account-1');",
  "const beforeCost = state.buyLots.reduce((total, lot) => total + lot.costBasisGross, 0);",
  "const beforeCash = state.cashLedger.reduce((total, row) => total + row.amount, 0);",
  "const sourceLot = beforeLots.find((lot) => lot.buyTransactionId === 'source-108');",
  "const target110 = beforeLots.find((lot) => lot.buyTransactionId === 'target-110');",
  "const target105 = beforeLots.find((lot) => lot.buyTransactionId === 'target-105');",
  "const plan = calculateInventoryCostExchangePlan(sourceLot, 79, [",
  "  { lot: target110, reductionPerShare: 5 },",
  "  { lot: target105, reductionPerShare: 2 }",
  "]);",
  "state.inventoryCostExchanges.push({",
  "  id: 'exchange-1', userId: 'user-1', portfolioId: 'portfolio-1', brokerAccountId: 'account-1', securityId: 'sec-0050',",
  "  sourceBuyTransactionId: 'source-108', exchangeDate: '2026-07-22', externalPrice: 79,",
  "  sourceShares: plan.sourceShares, sourceOriginalPrice: plan.sourceCurrentPrice, sourceFinalPrice: plan.sourceFinalPrice,",
  "  externalSwapCostDelta: plan.externalSwapCostDelta, redistributedAmount: plan.redistributedAmount,",
  "  targetAdjustments: plan.targetAdjustments, lotAdjustments: plan.lotAdjustments",
  "});",
  "recomputeAll();",
  "const adjusted = Object.fromEntries(state.buyLots.map((lot) => [lot.buyTransactionId, lot.buyPrice]));",
  "const afterCost = state.buyLots.reduce((total, lot) => total + lot.costBasisGross, 0);",
  "const afterCash = state.cashLedger.reduce((total, row) => total + row.amount, 0);",
  "const backdatedOptions = quickSellLotOptions('account-1', '0050', '2026-07-21');",
  "let backdatedBorrowError = '';",
  "try { validateBorrowSellSourceLots('source-108', 100, state.brokerAccounts[0], 'sec-0050', 'portfolio-1', '', '2026-07-21'); } catch (error) { backdatedBorrowError = error.message; }",
  "state.ui.inventoryCostExchangeOpen = true;",
  "state.ui.inventoryCostExchangeSourceBuyId = 'source-108';",
  "const modalHtml = renderInventoryCostExchangeModal();",
  "const exportedCount = exportCurrentUserState().inventoryCostExchanges.length;",
  "state.appTransactions.push({ ...fixture.appTransactions[1], id: 'partial-sell', transactionType: 'SELL', tradeDate: '2026-07-23', price: 112, shares: 100, linkedBuyTransactionId: 'target-110' });",
  "state.appTransactions.push({ ...fixture.appTransactions[0], id: 'borrow-source', transactionType: 'SELL', borrowRebuyType: 'BORROW_SELL', sourceInventoryLotId: 'source-108', tradeDate: '2026-07-23', price: 112, shares: 100 });",
  "recomputeAll();",
  "const eligibleAfter = inventoryCostExchangeEligibleLots('portfolio-1', 'account-1').map((lot) => lot.buyTransactionId);",
  "JSON.stringify({",
  "  beforeEligible: beforeLots.length,",
  "  redistributedAmount: plan.redistributedAmount,",
  "  externalSwapCostDelta: plan.externalSwapCostDelta,",
  "  internalAllocationNet: plan.internalAllocationNet,",
  "  sourceFinalPrice: plan.sourceFinalPrice,",
  "  adjusted, beforeCost, afterCost, beforeCash, afterCash, backdatedOptionCount: backdatedOptions.length, backdatedBorrowError, exportedCount, eligibleAfter, modalHtml,",
  "  transactionPrices: state.appTransactions.filter((tx) => ['source-108', 'target-110', 'target-105'].includes(tx.id)).map((tx) => tx.price)",
  "})"
].join("\n"), context));

assert.equal(actual.beforeEligible, 3);
assert.equal(actual.redistributedAmount, 6000, "target reductions must be added back to the source lot");
assert.equal(actual.externalSwapCostDelta, -29000, "79 replacing 108 for 1000 shares changes tracked cost by 29,000");
assert.equal(actual.internalAllocationNet, 0, "internal redistribution must conserve cost");
assert.equal(actual.sourceFinalPrice, 85, "source 79 must rise to 85 after receiving 6,000 from targets");
assert.deepEqual(actual.adjusted, { "source-108": 85, "target-110": 105, "target-105": 103 });
assert.equal(actual.afterCost - actual.beforeCost, -29000, "only the external swap may change tracked portfolio cost");
assert.equal(actual.afterCash, actual.beforeCash, "book cost exchange must not alter cash ledger");
assert.equal(actual.backdatedOptionCount, 0, "adjusted lots must not be sold before the exchange date");
assert.match(actual.backdatedBorrowError, /不可早於成本互換日期/);
assert.deepEqual(actual.transactionPrices, [108, 110, 105], "original execution prices must remain unchanged");
assert.equal(actual.exportedCount, 1, "cost exchanges must be included in Firebase/backup export state");
assert.deepEqual(actual.eligibleAfter, ["target-105"], "partially sold and borrowed lots must become ineligible");
assert.match(actual.modalHtml, /原始成交價、現金流與 0050 基準不會變動/);
assert.match(actual.modalHtml, /每股調降/);
console.log("inventory cost exchange: PASS");
