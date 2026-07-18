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

const preview = JSON.parse(vm.runInContext([
  "state = initialState();",
  "state.users = [{ id: 'user-1', email: 'test@example.com' }];",
  "state.sessions.currentUserId = 'user-1';",
  "state.portfolios = [{ id: 'portfolio-1', userId: 'user-1', name: 'Test portfolio' }];",
  "state.brokerAccounts = [{ id: 'account-1', portfolioId: 'portfolio-1', brokerId: 'broker-1', isActive: true, isDefault: true }];",
  "state.settings.portfolios['portfolio-1'] = defaultPortfolioSettings();",
  "state.cashLedger = [{ id: 'cash-1', portfolioId: 'portfolio-1', brokerAccountId: 'account-1', amount: 1000000 }];",
  "state.ui.currentPortfolioId = 'portfolio-1';",
  "state.ui.activeBrokerAccountId = 'account-1';",
  "const manual = renderQuickTradePreviewFromData({ transactionType: 'SELL', brokerAccountId: 'account-1', symbol: '0050', price: 100, shares: 1000, fee: '123', tax: '456' });",
  "const automatic = renderQuickTradePreviewFromData({ transactionType: 'SELL', brokerAccountId: 'account-1', symbol: '0050', price: 100, shares: 1000, fee: '', tax: '' });",
  "const unknownSecurity = renderQuickTradePreviewFromData({ transactionType: 'SELL', brokerAccountId: 'account-1', symbol: '2330', securityName: 'TSMC', price: 100, shares: 1000, fee: '', tax: '' });",
  "state.appTransactions = [",
  "  { id: 'deposit-1', userId: 'user-1', portfolioId: 'portfolio-1', brokerId: 'broker-1', brokerAccountId: 'account-1', securityId: 'sec-0050', transactionType: 'DEPOSIT', tradeDate: '2026-07-01', price: 1000000, shares: 0, fee: 0, tax: 0 },",
  "  { id: 'edit-buy', userId: 'user-1', portfolioId: 'portfolio-1', brokerId: 'broker-1', brokerAccountId: 'account-1', securityId: 'sec-0050', transactionType: 'BUY', tradeDate: '2026-07-02', price: 50, shares: 1000, fee: 0, tax: 0 },",
  "  { id: 'edit-sell', userId: 'user-1', portfolioId: 'portfolio-1', brokerId: 'broker-1', brokerAccountId: 'account-1', securityId: 'sec-0050', transactionType: 'SELL', tradeDate: '2026-07-03', price: 100, shares: 100, fee: 0, tax: 0, linkedBuyTransactionId: 'edit-buy', manualMatchedShares: 50 }",
  "];",
  "recomputeAll();",
  "const editBuy = renderQuickTradePreviewFromData({ id: 'edit-buy', transactionType: 'BUY', brokerAccountId: 'account-1', symbol: '0050', price: 50, shares: 1000, fee: '0', tax: '0' });",
  "const editSell = renderQuickTradePreviewFromData({ id: 'edit-sell', transactionType: 'SELL', sellType: 'REGULAR_SELL', brokerAccountId: 'account-1', symbol: '0050', price: 100, shares: 100, fee: '0', tax: '0', linkedBuyTransactionId: 'edit-buy' });",
  "const editSellShares = renderQuickTradePreviewFromData({ id: 'edit-sell', transactionType: 'SELL', sellType: 'REGULAR_SELL', brokerAccountId: 'account-1', symbol: '0050', price: 100, shares: 80, fee: '0', tax: '0', linkedBuyTransactionId: 'edit-buy' });",
  "JSON.stringify({ manual, automatic, unknownSecurity, editBuy, editSell, editSellShares })"
].join("\n"), context));

assert.match(preview.manual, /99,421/);
assert.match(preview.manual, /1,099,421/);
assert.match(preview.automatic, /99,861/);
assert.match(preview.automatic, /1,099,861/);
assert.match(preview.unknownSecurity, /99,661/);
assert.match(preview.unknownSecurity, /1,099,661/);
assert.match(preview.editBuy, /交易後持股<\/span><strong>950 股<\/strong>/);
assert.match(preview.editBuy, /交易後現金<\/span><strong>\$960,000<\/strong>/);
assert.match(preview.editSell, /交易後庫存<\/span><strong>950 股<\/strong>/);
assert.match(preview.editSell, /交易後現金<\/span><strong>\$960,000<\/strong>/);
assert.match(preview.editSellShares, /交易後庫存<\/span><strong>950 股<\/strong>/);
assert.match(preview.editSellShares, /交易後現金<\/span><strong>\$958,000<\/strong>/);
console.log("quick trade preview costs: PASS");
