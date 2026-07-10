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

const actual = JSON.parse(vm.runInContext(`JSON.stringify({
  regular: resolveSellMatchingFields({
    sellType: "REGULAR_SELL",
    linkedBuyTransactionId: "buy-lot-1",
    sourceInventoryLotId: "stale-borrow-lot"
  }),
  borrow: resolveSellMatchingFields({
    sellType: "BORROW_SELL",
    linkedBuyTransactionId: "stale-normal-lot",
    sourceInventoryLotId: "buy-lot-2,buy-lot-3"
  }),
  legacyBorrow: resolveSellMatchingFields({
    borrowRebuyType: "BORROW_SELL",
    sourceInventoryLotId: "legacy-lot"
  }),
  regularLabel: sellTypeLabel(sellTypeForTransaction({})),
  borrowLabel: sellTypeLabel(sellTypeForTransaction({ borrowRebuyType: "BORROW_SELL" }))
})`, context));

assert.deepEqual(actual.regular, {
  sellType: "REGULAR_SELL",
  borrowRebuyType: "",
  linkedBuyTransactionId: "buy-lot-1",
  sourceInventoryLotId: ""
});
assert.deepEqual(actual.borrow, {
  sellType: "BORROW_SELL",
  borrowRebuyType: "BORROW_SELL",
  linkedBuyTransactionId: "",
  sourceInventoryLotId: "buy-lot-2,buy-lot-3"
});
assert.equal(actual.legacyBorrow.borrowRebuyType, "BORROW_SELL");
assert.equal(actual.legacyBorrow.sourceInventoryLotId, "legacy-lot");
assert.equal(actual.regularLabel, "一般賣出");
assert.equal(actual.borrowLabel, "庫存借券");
console.log("sell type matching fields: PASS");
