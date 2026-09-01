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

const inferred = JSON.parse(vm.runInContext(
  "JSON.stringify([inferSymbol('群益台灣加權正2'), inferSymbol('群益臺灣加權正2'), inferSymbol('00685L 群益台灣加權正2')])",
  context
));
assert.deepEqual(inferred, ["00685L", "00685L", "00685L"]);

vm.runInContext([
  "state = initialState();",
  "state.brokerExecutions = [{ id: 'exec-1', securityId: 'legacy-security', securityName: '群益台灣加權正2' }];",
  "state.securities.push({ id: 'sec-00685l', symbol: '00685L', name: '群益台灣加權正2' });",
  "repairBrokerExecutionSecurityIds();"
].join("\n"), context);
assert.equal(vm.runInContext("state.brokerExecutions[0].securityId", context), "sec-00685l");

console.log("reconciliation security symbol mapping: PASS");
