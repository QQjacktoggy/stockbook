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
    classList: { add() {}, remove() {} },
    addEventListener() {},
    appendChild() {},
    remove() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    setAttribute() {}
  };
}

const document = {
  querySelector: element,
  addEventListener() {},
  createElement: element
};
const localStorage = { getItem() { return null; }, setItem() {} };
const window = { addEventListener() {}, clearTimeout() {}, setTimeout() { return 0; }, location: {} };
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
  fee: 0,
  tax: 0
};
const fixture = {
  users: [{ id: "user-1", name: "Test User" }],
  sessions: { currentUserId: "user-1" },
  securities: [{ id: "sec-0050", symbol: "0050", name: "元大台灣50" }],
  manualClosedRebuySellIds: [],
  appTransactions: [
    { ...base, id: "source-108.3", transactionType: "BUY", tradeDate: "2026-07-07", price: 108.3, shares: 1000 },
    { ...base, id: "other-inventory", transactionType: "BUY", tradeDate: "2026-07-08", price: 100, shares: 3700 },
    { ...base, id: "open-borrow-250", transactionType: "SELL", borrowRebuyType: "BORROW_SELL", sourceInventoryLotId: "source-108.3", tradeDate: "2026-07-16", price: 106.2, shares: 250 },
    { ...base, id: "closed-borrow-250", transactionType: "SELL", borrowRebuyType: "BORROW_SELL", sourceInventoryLotId: "other-inventory", tradeDate: "2026-07-16", price: 106.65, shares: 250 },
    { ...base, id: "closed-borrow-fill", transactionType: "BUY", borrowRebuyType: "REBUY_FILL", rebuyCycleId: "closed-borrow-250", tradeDate: "2026-07-16", price: 106.2, shares: 250 },
    { ...base, id: "partial-borrow-300", transactionType: "SELL", borrowRebuyType: "BORROW_SELL", sourceInventoryLotId: "other-inventory", tradeDate: "2026-07-17", price: 105.8, shares: 300 },
    { ...base, id: "partial-borrow-fill", transactionType: "BUY", borrowRebuyType: "REBUY_FILL", rebuyCycleId: "partial-borrow-300", tradeDate: "2026-07-18", price: 104.8, shares: 100 }
  ]
};
context.fixture = fixture;

const actual = JSON.parse(vm.runInContext([
  "state = initialState();",
  "Object.assign(state, fixture);",
  "recomputeAll();",
  "const adjustedLots = borrowAdjustedInventoryLots(state.buyLots);",
  "const reportLots = reportInventoryLots('portfolio-1', 'account-1');",
  "const reportModel = buildPdfReportModel('portfolio-1', 'account-1');",
  "const sourceLot = adjustedLots.find((lot) => lotMatchesSourceId(lot, 'source-108.3'));",
  "const closedSourceLot = adjustedLots.find((lot) => lotMatchesSourceId(lot, 'other-inventory'));",
  "JSON.stringify({",
  "  rawShares: sum(state.buyLots, 'remainingShares'),",
  "  adjustedShares: sum(adjustedLots, 'remainingShares'),",
  "  reportShares: sum(reportLots, 'remainingShares'),",
  "  reportModelShares: reportModel.inventoryShares,",
  "  metricShares: portfolioMetrics('portfolio-1', 'account-1').remainingShares,",
  "  sourceRemaining: sourceLot.remainingShares,",
  "  sourceBorrowed: sourceLot.borrowedShares,",
  "  closedSourceRemaining: closedSourceLot.remainingShares,",
  "  closedSourceBorrowed: closedSourceLot.borrowedShares,",
  "  reservationTotal: [...borrowSourceReservations().values()].reduce((total, shares) => total + shares, 0)",
  "})"
].join("\n"), context));

assert.equal(actual.rawShares, 4700);
assert.equal(actual.reservationTotal, 450);
assert.equal(actual.adjustedShares, 4250);
assert.equal(actual.reportShares, 4250);
assert.equal(actual.reportModelShares, 4250);
assert.equal(actual.metricShares, 4250);
assert.equal(actual.sourceRemaining, 750);
assert.equal(actual.sourceBorrowed, 250);
assert.equal(actual.closedSourceRemaining, 3500);
assert.equal(actual.closedSourceBorrowed, 200);
console.log("borrow inventory reservations: PASS");
