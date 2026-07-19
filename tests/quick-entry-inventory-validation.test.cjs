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
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {},
    appendChild() {},
    remove() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    setAttribute() {}
  };
}

const document = { querySelector: element, addEventListener() {}, createElement: element, body: element() };
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
  tax: 0,
  sourceType: "MANUAL",
  isConfirmed: true
};
context.fixture = {
  users: [{ id: "user-1", name: "Test User" }],
  sessions: { currentUserId: "user-1" },
  portfolios: [{ id: "portfolio-1", userId: "user-1", name: "0050" }],
  portfolioMembers: [],
  brokerAccounts: [{ id: "account-1", portfolioId: "portfolio-1", brokerId: "broker-1", accountName: "Test", isActive: true, isDefault: true }],
  securities: [{ id: "sec-0050", symbol: "0050", name: "元大台灣50" }],
  manualClosedRebuySellIds: [],
  appTransactions: [
    { ...base, id: "buy-early", transactionType: "BUY", tradeDate: "2026-07-01", price: 100, shares: 1000 },
    { ...base, id: "borrow-open", transactionType: "SELL", borrowRebuyType: "BORROW_SELL", sourceInventoryLotId: "buy-early", tradeDate: "2026-07-05", price: 102, shares: 400 },
    { ...base, id: "buy-future", transactionType: "BUY", tradeDate: "2026-07-10", price: 99, shares: 500 }
  ]
};

const actual = JSON.parse(vm.runInContext([
  "state = initialState();",
  "Object.assign(state, fixture);",
  "state.ui.currentPortfolioId = 'portfolio-1';",
  "recomputeAll();",
  "const account = state.brokerAccounts[0];",
  "const beforeOptions = quickSellLotOptions('account-1', '0050', '2026-07-08');",
  "const autoLinked = validateRegularSellSourceLots('', 500, account, 'sec-0050', 'portfolio-1', '2026-07-08');",
  "let oversellError = '';",
  "try { validateRegularSellSourceLots('', 700, account, 'sec-0050', 'portfolio-1', '2026-07-08'); } catch (error) { oversellError = error.message; }",
  "let futureBorrowError = '';",
  "try { validateBorrowSellSourceLots('buy-future', 100, account, 'sec-0050', 'portfolio-1', '', '2026-07-08'); } catch (error) { futureBorrowError = error.message; }",
  "let invalidSharesError = '';",
  "try { validateQuickEntryValues({ tradeDate: '2026-07-08', symbol: '0050', securityName: '錯誤名稱', price: 100, shares: 0, fee: '', tax: '' }, 'SELL'); } catch (error) { invalidSharesError = error.message; }",
  "const canonical = { tradeDate: '2026-07-08', symbol: '0050', securityName: '錯誤名稱', price: 100, shares: 1, fee: '', tax: '' };",
  "validateQuickEntryValues(canonical, 'BUY');",
  "state.appTransactions.push({ ...fixture.appTransactions[0], id: 'regular-sell', transactionType: 'SELL', tradeDate: '2026-07-08', price: 103, shares: 500, linkedBuyTransactionId: autoLinked });",
  "recomputeAll();",
  "const displayLot = borrowAdjustedInventoryLots(state.buyLots).find((lot) => lotMatchesSourceId(lot, 'buy-early'));",
  "const fullyBorrowedLot = { ...displayLot, rawRemainingShares: 500, remainingShares: 0, borrowedShares: 500 };",
  "const fullyBorrowedHtml = renderInventoryLotMobileRow(fullyBorrowedLot, { quote: null, marketValue: 0, unrealized: 0 });",
  "JSON.stringify({",
  "  beforeOptionCount: beforeOptions.length,",
  "  beforeAvailable: beforeOptions.reduce((total, option) => total + option.shares, 0),",
  "  autoLinked,",
  "  oversellError,",
  "  futureBorrowError,",
  "  invalidSharesError,",
  "  canonicalName: canonical.securityName,",
  "  matchedShares: state.sellMatches.filter((match) => match.sellTransactionId === 'regular-sell').reduce((total, match) => total + match.matchedShares, 0),",
  "  adjustedRemaining: borrowAdjustedInventoryLots(state.buyLots).reduce((total, lot) => total + lot.remainingShares, 0),",
  "  displayRawRemaining: displayLot.rawRemainingShares,",
  "  displayRemaining: displayLot.remainingShares,",
  "  displayBorrowed: displayLot.borrowedShares,",
  "  fullyBorrowedVisible: filterInventoryLots([fullyBorrowedLot]).length,",
  "  fullyBorrowedHtml",
  "})"
].join("\n"), context));

assert.equal(actual.beforeOptionCount, 1, "future lots must not be available to an earlier sell");
assert.equal(actual.beforeAvailable, 600, "open self-borrow reservations must reduce sellable inventory");
assert.equal(actual.autoLinked, "buy-early", "an empty regular sell selection must auto-match inventory");
assert.match(actual.oversellError, /不可超過可用庫存/);
assert.match(actual.futureBorrowError, /不可晚於賣出日期/);
assert.match(actual.invalidSharesError, /股數必須是大於 0 的整數/);
assert.equal(actual.canonicalName, "元大台灣50", "known symbols must keep the canonical security name");
assert.equal(actual.matchedShares, 500, "auto-selected lots must be persisted into matching");
assert.equal(actual.adjustedRemaining, 600, "regular sells and borrow reservations must both reduce available inventory");
assert.equal(actual.displayRawRemaining, 500, "inventory display must retain the pre-borrow lot balance for sold-share reporting");
assert.equal(actual.displayRemaining, 100, "inventory display must show borrow-adjusted available shares");
assert.equal(actual.displayBorrowed, 400, "inventory display must expose the shares currently on loan");
assert.equal(actual.fullyBorrowedVisible, 1, "fully borrowed lots must remain visible in inventory");
assert.match(actual.fullyBorrowedHtml, /剩餘<\/small><strong>0<\/strong>/);
assert.match(actual.fullyBorrowedHtml, /借券中<\/span><strong>500<\/strong>/);
assert.doesNotMatch(actual.fullyBorrowedHtml, /data-action="sell-lot"/);
console.log("quick entry inventory validation: PASS");
