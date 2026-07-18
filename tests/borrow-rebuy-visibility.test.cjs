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
  securityId: "sec-0050",
  fee: 0,
  tax: 0
};
const fixture = {
  users: [{ id: "user-1", email: "test@example.com" }],
  sessions: { currentUserId: "user-1" },
  portfolios: [{ id: "portfolio-1", userId: "user-1", name: "測試帳本" }],
  securities: [{ id: "sec-0050", symbol: "0050", name: "元大台灣50" }],
  brokerAccounts: [
    { id: "account-1", portfolioId: "portfolio-1", brokerId: "broker-1", accountName: "主帳戶", isActive: true, isDefault: true },
    { id: "account-2", portfolioId: "portfolio-1", brokerId: "broker-1", accountName: "次帳戶", isActive: true, isDefault: false }
  ],
  marketQuotes: [
    { id: "quote-0050", portfolioId: "portfolio-1", securityId: "sec-0050", price: 105.8, quoteTime: "2026-07-18T09:00:00+08:00" }
  ],
  manualClosedRebuySellIds: [],
  appTransactions: [
    { ...base, id: "source-108.3", brokerAccountId: "account-1", transactionType: "BUY", tradeDate: "2026-07-07", price: 108.3, shares: 1000 },
    { ...base, id: "open-borrow-250", brokerAccountId: "account-1", transactionType: "SELL", borrowRebuyType: "BORROW_SELL", sourceInventoryLotId: "source-108.3", tradeDate: "2026-07-16", price: 106.2, shares: 250 },
    { ...base, id: "partial-fill-100", brokerAccountId: "account-1", transactionType: "BUY", borrowRebuyType: "REBUY_FILL", rebuyCycleId: "open-borrow-250", tradeDate: "2026-07-17", price: 104.5, shares: 100 },
    { ...base, id: "closed-borrow-50", brokerAccountId: "account-1", transactionType: "SELL", borrowRebuyType: "BORROW_SELL", sourceInventoryLotId: "source-108.3", tradeDate: "2026-07-15", price: 107, shares: 50 },
    { ...base, id: "closed-fill-50", brokerAccountId: "account-1", transactionType: "BUY", borrowRebuyType: "REBUY_FILL", rebuyCycleId: "closed-borrow-50", tradeDate: "2026-07-16", price: 105, shares: 50 },
    { ...base, id: "source-account-2", brokerAccountId: "account-2", transactionType: "BUY", tradeDate: "2026-07-08", price: 100, shares: 500 },
    { ...base, id: "other-account-borrow", brokerAccountId: "account-2", transactionType: "SELL", borrowRebuyType: "BORROW_SELL", sourceInventoryLotId: "source-account-2", tradeDate: "2026-07-18", price: 109, shares: 80 }
  ]
};
context.fixture = fixture;

const actual = JSON.parse(vm.runInContext([
  "state = initialState();",
  "Object.assign(state, fixture);",
  "state.ui.currentPortfolioId = 'portfolio-1';",
  "state.ui.activeBrokerAccountId = 'account-1';",
  "recomputeAll();",
  "const accountCycles = activeBorrowRebuyCycles('portfolio-1', 'account-1');",
  "const allCycles = activeBorrowRebuyCycles('portfolio-1', 'ALL');",
  "const overview = renderBorrowRebuyOverview('portfolio-1', 'account-1');",
  "const rebuyPage = renderRebuy();",
  "state.ui.rebuyTab = 'borrow';",
  "const borrowRebuyPage = renderRebuy();",
  "const metrics = portfolioMetrics('portfolio-1', 'account-1');",
  "render = () => {};",
  "persist = () => {};",
  "handleBorrowRebuyBuy('open-borrow-250');",
  "JSON.stringify({",
  "  cycleIds: accountCycles.map((cycle) => cycle.id),",
  "  allCycleIds: allCycles.map((cycle) => cycle.id),",
  "  remaining: accountCycles[0]?.remainingRebuyQty,",
  "  totalRebuy: accountCycles[0]?.totalRebuyQty,",
  "  metrics,",
  "  overview,",
  "  rebuyPage,",
  "  borrowRebuyPage,",
  "  quickEntry: state.ui.quickEntry",
  "})"
].join("\n"), context));

assert.deepEqual(actual.cycleIds, ["open-borrow-250"]);
assert.deepEqual(new Set(actual.allCycleIds), new Set(["open-borrow-250", "other-account-borrow"]));
assert.equal(actual.remaining, 150);
assert.equal(actual.totalRebuy, 100);
assert.equal(actual.metrics.openBorrowRebuyShares, 150);
assert.match(actual.overview, /自我借券待回補/);
assert.match(actual.overview, /0050/);
assert.match(actual.overview, /106\.2/);
assert.match(actual.overview, /105\.8/);
assert.match(actual.overview, /108\.3/);
assert.match(actual.overview, /150/);
assert.match(actual.overview, /部分回補/);
assert.match(actual.overview, /data-action="quick-borrow-rebuy"/);
assert.match(actual.overview, /data-cycle-id="open-borrow-250"/);
assert.doesNotMatch(actual.overview, /other-account-borrow/);
assert.match(actual.rebuyPage, /data-rebuy-tab=\"borrow\"/);
assert.match(actual.borrowRebuyPage, /自我借券待回補/);
assert.equal(actual.quickEntry.type, "BUY");
assert.equal(actual.quickEntry.brokerAccountId, "account-1");
assert.equal(actual.quickEntry.symbol, "0050");
assert.equal(actual.quickEntry.price, 105.8);
assert.equal(actual.quickEntry.shares, 150);
assert.equal(actual.quickEntry.borrowRebuyType, "REBUY_FILL");
assert.equal(actual.quickEntry.rebuyCycleId, "open-borrow-250");
console.log("borrow rebuy visibility: PASS");
