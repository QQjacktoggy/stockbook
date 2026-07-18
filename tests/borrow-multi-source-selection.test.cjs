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

context.fixture = {
  securities: [{ id: "sec-0050", symbol: "0050", name: "元大台灣50" }],
  manualClosedRebuySellIds: [],
  appTransactions: [
    {
      id: "buy-400",
      userId: "user-1",
      portfolioId: "portfolio-1",
      brokerId: "broker-1",
      brokerAccountId: "account-1",
      securityId: "sec-0050",
      transactionType: "BUY",
      tradeDate: "2026-07-01",
      price: 100,
      shares: 400,
      fee: 0,
      tax: 0
    },
    {
      id: "buy-100",
      userId: "user-1",
      portfolioId: "portfolio-1",
      brokerId: "broker-1",
      brokerAccountId: "account-1",
      securityId: "sec-0050",
      transactionType: "BUY",
      tradeDate: "2026-07-02",
      price: 101,
      shares: 100,
      fee: 0,
      tax: 0
    }
  ]
};

const actual = JSON.parse(vm.runInContext([
  "state = initialState();",
  "Object.assign(state, fixture);",
  "recomputeAll();",
  "const account = { id: 'account-1', portfolioId: 'portfolio-1', brokerId: 'broker-1' };",
  "const options = borrowSourceLotOptions('account-1', '0050');",
  "const selected = validateBorrowSellSourceLots('buy-400,buy-100', 500, account, 'sec-0050', 'portfolio-1');",
  "let tooMuch = '';",
  "try { validateBorrowSellSourceLots('buy-400,buy-100', 501, account, 'sec-0050', 'portfolio-1'); } catch (error) { tooMuch = error.message; }",
  "const localStatus = firebaseSyncStatusMeta();",
  "state.settings.firebase.status = 'SYNC_FAILED';",
  "state.settings.firebase.lastError = '請先下載本機備份';",
  "const failedStatus = firebaseSyncStatusMeta();",
  "JSON.stringify({ optionShares: options.reduce((total, option) => total + Number(option.shares), 0), selected, cost: borrowSourceCostLabel(selected), tooMuch, localStatus, failedStatus })"
].join("\n"), context));

assert.equal(actual.optionShares, 500);
assert.equal(actual.selected, "buy-400,buy-100");
assert.equal(actual.cost, "100 / 400股 + 101 / 100股");
assert.match(actual.tooMuch, /501/);
assert.match(actual.tooMuch, /500/);
assert.equal(actual.localStatus.label, "Local only");
assert.equal(actual.failedStatus.label, "Failed");
assert.match(actual.failedStatus.detail, /備份/);
console.log("borrow multi-source selection: PASS");
