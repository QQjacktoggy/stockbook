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

const actual = JSON.parse(vm.runInContext(`
  state = initialState();
  state.securities = [{ id: "sec-0050", symbol: "0050", name: "元大台灣50" }];
  const names = [
    ["元大台灣50", "0050"],
    ["元大台灣50正2", "00631L"],
    ["台積電", "2330"],
    ["元大高股息", "0056"],
    ["元大美債20年", "00679B"],
    ["國泰永續高股息", "00878"],
    ["群益台灣精選高息", "00919"],
    ["大華優利高填息30", "00918"],
    ["群益ESG投等債20+", "00937B"],
    ["緯穎", "6669"]
  ];
  const inferred = names.map(([name, symbol]) => ({ name, expected: symbol, actual: inferSymbol(name) }));
  const mapped = names.map(([name]) => {
    const row = mapBrokerRow({ 股名: name, 日期: "2026/08/11", 成交股數: "1", 淨收付金額: "-100", 買賣別: "現買", 成交價: "100", 成本: "100", 手續費: "0", 交易稅: "0", 委託書號: "TEST" }, { securityId: "sec-0050" });
    return { name, symbol: securityById(row.securityId).symbol };
  });
  const unknown = mapBrokerRow({ 股名: "未知台股", 日期: "2026/08/11", 成交股數: "1", 淨收付金額: "-100", 買賣別: "現買", 成交價: "100", 成本: "100", 手續費: "0", 交易稅: "0", 委託書號: "UNKNOWN" }, { securityId: "sec-0050" });
  state.brokerExecutions = [{
    id: "broker-1",
    userId: "user-1",
    portfolioId: "portfolio-1",
    securityId: "sec-0050",
    securityName: "台積電",
    tradeDate: "2026-08-11",
    shares: 1,
    netAmount: -100,
    side: "BUY",
    brokerSideRaw: "現買",
    price: 100,
    grossAmount: 100,
    fee: 0,
    tax: 0,
    orderNo: "TEST",
    checksum: "legacy-0050-checksum"
  }];
  const repaired = repairBrokerExecutionSecurityIds();
  const csv = [
    "summary",
    "股名,日期,成交股數,淨收付金額,買賣別,成交價,成本,手續費,交易稅,委託書號",
    "台積電,2026/08/11,1,-100,現買,100,100,0,0,TEST"
  ].join("\\n");
  importBrokerCsv(csv, { userId: "user-1", portfolioId: "portfolio-1", brokerId: "broker-1", brokerAccountId: "account-1", sourceFilename: "penny.csv" });
  const importBatch = state.importBatches.at(-1);
  JSON.stringify({
    inferred,
    mapped,
    unknownSymbol: securityById(unknown.securityId).symbol,
    repaired,
    repairedSymbol: securityById(state.brokerExecutions[0].securityId).symbol,
    repairedChecksumMatches: state.brokerExecutions[0].checksum === brokerExecutionChecksum(state.brokerExecutions[0]),
    importBatch: { status: importBatch.status, duplicateCount: importBatch.duplicateCount, createdCount: importBatch.createdCount },
    brokerExecutionCount: state.brokerExecutions.length
  });
`, context));

for (const row of actual.inferred) assert.equal(row.actual, row.expected, `${row.name} symbol inference`);
for (const row of actual.mapped) assert.equal(row.symbol, actual.inferred.find((item) => item.name === row.name).expected, `${row.name} broker mapping`);
assert.match(actual.unknownSymbol, /^UNKNOWN_/);
assert.equal(actual.repaired, true);
assert.equal(actual.repairedSymbol, "2330");
assert.equal(actual.repairedChecksumMatches, true);
assert.deepEqual(actual.importBatch, { status: "DUPLICATE", duplicateCount: 1, createdCount: 0 });
assert.equal(actual.brokerExecutionCount, 1);
console.log("broker security symbol mapping and checksum: PASS");
