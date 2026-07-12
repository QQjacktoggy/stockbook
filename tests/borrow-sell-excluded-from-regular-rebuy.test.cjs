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

const fixture = {
  securities: [{ id: "sec-0050", symbol: "0050", name: "元大台灣50" }],
  manualClosedRebuySellIds: [],
  appTransactions: [
    {
      id: "buy-lot",
      userId: "user-1",
      portfolioId: "portfolio-1",
      brokerId: "broker-1",
      brokerAccountId: "account-1",
      securityId: "sec-0050",
      transactionType: "BUY",
      tradeDate: "2026-07-01",
      price: 100,
      shares: 200,
      fee: 10,
      tax: 0
    },
    {
      id: "regular-sell",
      userId: "user-1",
      portfolioId: "portfolio-1",
      brokerId: "broker-1",
      brokerAccountId: "account-1",
      securityId: "sec-0050",
      transactionType: "SELL",
      tradeDate: "2026-07-10",
      price: 110,
      shares: 50,
      fee: 10,
      tax: 10
    },
    {
      id: "borrow-sell",
      userId: "user-1",
      portfolioId: "portfolio-1",
      brokerId: "broker-1",
      brokerAccountId: "account-1",
      securityId: "sec-0050",
      transactionType: "SELL",
      borrowRebuyType: "BORROW_SELL",
      sourceInventoryLotId: "buy-lot",
      tradeDate: "2026-07-11",
      price: 112,
      shares: 40,
      fee: 10,
      tax: 10
    }
  ]
};
context.fixture = fixture;

const actual = JSON.parse(vm.runInContext([
  "state = initialState();",
  "Object.assign(state, fixture);",
  "recomputeLotsMatchesAndRebuy();",
  "recomputeBorrowRebuyCycles();",
  "JSON.stringify({",
  "  regularRebuySellIds: state.rebuyTasks.map((task) => task.sellTransactionId),",
  "  borrowCycleSellIds: state.borrowRebuyCycles.map((cycle) => cycle.sellTradeId),",
  "  isBorrowRegular: isRegularRebuySellTransaction(state.appTransactions.find((tx) => tx.id === 'borrow-sell'))",
  "})"
].join("\n"), context));

assert.deepEqual(actual.regularRebuySellIds, ["regular-sell"]);
assert.deepEqual(actual.borrowCycleSellIds, ["borrow-sell"]);
assert.equal(actual.isBorrowRegular, false);
console.log("borrow sell excluded from regular rebuy: PASS");
