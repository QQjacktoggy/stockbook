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
    querySelectorAll() { return []; }
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

const fixture = {
  appTransactions: [
    {
      id: "borrow-sell",
      portfolioId: "portfolio-1",
      brokerId: "broker-1",
      brokerAccountId: "account-1",
      securityId: "sec-0050",
      transactionType: "SELL",
      borrowRebuyType: "BORROW_SELL",
      tradeDate: "2026-07-10",
      price: 110,
      shares: 100,
      fee: 10,
      tax: 20
    },
    {
      id: "borrow-rebuy",
      portfolioId: "portfolio-1",
      brokerId: "broker-1",
      brokerAccountId: "account-1",
      securityId: "sec-0050",
      transactionType: "BUY",
      borrowRebuyType: "REBUY_FILL",
      rebuyCycleId: "borrow-sell",
      tradeDate: "2026-07-11",
      price: 100,
      shares: 100,
      fee: 10,
      tax: 0
    }
  ],
  sellMatches: [
    {
      id: "regular-match",
      portfolioId: "portfolio-1",
      brokerAccountId: "account-1",
      sellDate: "2026-07-09",
      matchedShares: 10,
      grossProfit: 100,
      allocatedBuyFee: 5,
      allocatedSellFee: 10,
      allocatedSellTax: 5,
      netProfit: 80,
      buyDate: "2026-07-01",
      buyPrice: 100,
      sellPrice: 110
    }
  ],
  rebuyTasks: [],
  rebuyFills: [],
  cashLedger: [
    { portfolioId: "portfolio-1", brokerAccountId: "account-1", tradeDate: "2026-07-10", amount: 10970 },
    { portfolioId: "portfolio-1", brokerAccountId: "account-1", tradeDate: "2026-07-11", amount: -10010 }
  ],
  buyLots: []
};
context.fixture = fixture;

const actual = JSON.parse(vm.runInContext([
  "state = initialState();",
  "Object.assign(state, fixture);",
  "recomputeBorrowRebuyCycles();",
  "const events = realizedProfitEvents(\"portfolio-1\", \"account-1\");",
  "const borrow = events.find((event) => event.type === \"BORROW_REBUY\");",
  "const coverDay = summarizeProfitEvents(events.filter((event) => event.date === \"2026-07-11\"), \"2026-07-11\");",
  "const exportRows = profitSummaryReportRows(\"day\", \"portfolio-1\", \"account-1\").rows;",
  "const metrics = portfolioMetrics(\"portfolio-1\", \"account-1\");",
  "const cashSeries = dailyCashSeries(\"portfolio-1\", \"account-1\");",
  "JSON.stringify({ events, borrow, coverDay, exportRows, metrics, cashSeries })"
].join("\n"), context));

assert.equal(actual.events.length, 2);
assert.equal(actual.events.some((event) => event.date === "2026-07-10"), false);
assert.equal(actual.borrow.date, "2026-07-11");
assert.equal(actual.borrow.grossProfit, 1000);
assert.equal(actual.borrow.costs, 40);
assert.equal(actual.borrow.netProfit, 960);
assert.deepEqual(actual.coverDay, {
  period: "2026-07-11",
  trades: 1,
  shares: 100,
  gross: 1000,
  costs: 40,
  net: 960
});
assert.equal(actual.metrics.realizedNetProfit, 1040);
assert.equal(actual.cashSeries.at(-1).realized, 1040);
assert.ok(actual.exportRows.some((row) => row.period === "2026-07-11"));
console.log("borrow-rebuy profit events: PASS");
