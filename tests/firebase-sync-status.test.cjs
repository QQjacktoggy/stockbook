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

(async () => {
  const actual = JSON.parse(await vm.runInContext([
    "(async () => {",
    "  state = initialState();",
    "  const renderedStatuses = [];",
    "  persist = () => {};",
    "  render = () => { renderedStatuses.push(state.settings.firebase.status); };",
    "  canAutoSyncFirebase = () => true;",
    "  scheduleFirebaseAutoSync();",
    "  const scheduled = { status: state.settings.firebase.status, rendered: [...renderedStatuses], label: firebaseSyncStatusMeta().label };",
    "  getFirebaseRuntime = async () => { throw new Error('stop after pending'); };",
    "  renderedStatuses.length = 0;",
    "  try { await syncToFirebase({ silent: true }); } catch {}",
    "  const push = { status: state.settings.firebase.status, rendered: [...renderedStatuses] };",
    "  state.settings.firebase.status = 'SYNCED';",
    "  renderedStatuses.length = 0;",
    "  try { await loadFromFirebase(); } catch {}",
    "  const pull = { status: state.settings.firebase.status, rendered: [...renderedStatuses] };",
    "  const batch = { set() {}, delete() {}, async commit() {} };",
    "  getFirebaseRuntime = async () => ({ db: {}, auth: { currentUser: { uid: 'firebase-user' } }, doc: () => ({}), writeBatch: () => batch });",
    "  compressText = async () => 'payload';",
    "  state.users = [{ id: 'user-1', email: 'test@example.com', firebaseUid: 'firebase-user' }];",
    "  state.sessions.currentUserId = 'user-1';",
    "  state.settings.firebase.status = 'LOCAL_ONLY';",
    "  renderedStatuses.length = 0;",
    "  await syncToFirebase({ silent: true });",
    "  const success = { status: state.settings.firebase.status, rendered: [...renderedStatuses] };",
    "  markFirebaseSyncFailure(new Error('sync failed'));",
    "  const failed = { status: state.settings.firebase.status, label: firebaseSyncStatusMeta().label };",
    "  return JSON.stringify({ scheduled, push, pull, success, failed });",
    "})()"
  ].join("\n"), context));

  assert.equal(actual.scheduled.status, "PENDING");
  assert.deepEqual(actual.scheduled.rendered, ["PENDING"]);
  assert.equal(actual.scheduled.label, "Pending");
  assert.equal(actual.push.status, "PENDING");
  assert.deepEqual(actual.push.rendered, ["PENDING"]);
  assert.equal(actual.pull.status, "PENDING");
  assert.deepEqual(actual.pull.rendered, ["PENDING"]);
  assert.equal(actual.success.status, "SYNCED");
  assert.deepEqual(actual.success.rendered, ["PENDING", "SYNCED"]);
  assert.equal(actual.failed.status, "SYNC_FAILED");
  assert.equal(actual.failed.label, "Failed");
  console.log("firebase sync status: PASS");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
