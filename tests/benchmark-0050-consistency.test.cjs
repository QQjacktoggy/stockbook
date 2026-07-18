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
const context = { console, document, localStorage, window, setTimeout, clearTimeout };
vm.createContext(context);
vm.runInContext(appSource, context, { filename: appPath });

const actual = JSON.parse(vm.runInContext([
  "state = initialState();",
  "state.users = [{ id: 'user-1', email: 'test@example.com' }];",
  "state.sessions.currentUserId = 'user-1';",
  "state.portfolios = [{ id: 'portfolio-1', userId: 'user-1', name: 'Test portfolio' }];",
  "state.brokerAccounts = [{ id: 'account-1', portfolioId: 'portfolio-1', brokerId: 'broker-1', isActive: true, isDefault: true }];",
  "state.settings.portfolios['portfolio-1'] = defaultPortfolioSettings();",
  "state.settings.portfolios['portfolio-1'].defaultSecurity = '0050';",
  "state.ui.currentPortfolioId = 'portfolio-1';",
  "state.securities = [",
  "  { id: 'sec-0050', symbol: '0050', name: '元大台灣50' },",
  "  { id: 'sec-2330', symbol: '2330', name: 'TSMC' }",
  "];",
  "const transactions = [",
  "  { id: 'deposit-1', userId: 'user-1', portfolioId: 'portfolio-1', brokerId: 'broker-1', brokerAccountId: 'account-1', transactionType: 'DEPOSIT', tradeDate: '2026-07-01', netAmount: 100000, benchmarkSecurityId: 'sec-0050', benchmarkPrice: 100, benchmarkPriceSource: '測試基準價' },",
  "  { id: 'buy-0050', userId: 'user-1', portfolioId: 'portfolio-1', brokerId: 'broker-1', brokerAccountId: 'account-1', securityId: 'sec-0050', transactionType: 'BUY', tradeDate: '2026-07-02', price: 100, shares: 100, fee: 0, tax: 0, netAmount: -10000 },",
  "  { id: 'buy-2330', userId: 'user-1', portfolioId: 'portfolio-1', brokerId: 'broker-1', brokerAccountId: 'account-1', securityId: 'sec-2330', transactionType: 'BUY', tradeDate: '2026-07-03', price: 200, shares: 100, fee: 0, tax: 0, netAmount: -20000 }",
  "];",
  "state.cashLedger = [",
  "  { portfolioId: 'portfolio-1', brokerAccountId: 'account-1', tradeDate: '2026-07-01', amount: 100000 },",
  "  { portfolioId: 'portfolio-1', brokerAccountId: 'account-1', tradeDate: '2026-07-02', amount: -10000 },",
  "  { portfolioId: 'portfolio-1', brokerAccountId: 'account-1', tradeDate: '2026-07-03', amount: -20000 }",
  "];",
  "const benchmark = build0050BenchmarkModel('portfolio-1', 'account-1', transactions, [], '2026-07-03');",
  "const lastRow = benchmark.dailyRows.at(-1);",
  "const summary = renderReportSummaryCards(benchmark);",
  "const report = render0050PerformanceReport({ benchmark });",
  "JSON.stringify({ benchmark, lastRow, summary, report })"
].join("\n"), context));

assert.equal(actual.lastRow.actualShares, 100);
assert.equal(actual.lastRow.cash, 70000);
assert.equal(actual.lastRow.otherEquivalentShares, 200);
assert.equal(actual.benchmark.operationEquivalentShares, 1000);
assert.equal(actual.lastRow.equivalent, actual.benchmark.operationEquivalentShares);
assert.equal(actual.lastRow.passive, actual.benchmark.passiveShares);
assert.equal(actual.lastRow.excess, actual.benchmark.excessShares);
assert.equal(actual.benchmark.benchmarkRatio, actual.benchmark.operationEquivalentShares / actual.benchmark.passiveShares);
assert.match(actual.summary, /等值／0050 基準比/);
assert.match(actual.report, /其他庫存等值股/);
assert.match(actual.report, /目前等值／0050 基準/);
console.log("0050 benchmark consistency: PASS");
