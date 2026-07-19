const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const app = fs.readFileSync(path.resolve(__dirname, "../public/app.js"), "utf8");
const css = fs.readFileSync(path.resolve(__dirname, "../public/styles.css"), "utf8");

assert.match(
  app,
  /class="quick-entry-grid">[\s\S]*renderQuickTradePreview\(type, entry, defaultSymbol, defaultAccountId\)[\s\S]*data-quick-entry-error[\s\S]*<\/div>\s*<div class="quick-entry-actions">/,
  "the preview and inline error must scroll with the quick-entry fields"
);
assert.match(app, /function renderMobileQuickDock\(\)[\s\S]*state\.ui\.quickEntry\?\.type\) return "";/);
assert.match(app, /function renderMobileBottomNav\(path\)[\s\S]*state\.ui\.quickEntry\?\.type\) return "";/);
assert.match(app, /role="dialog" aria-modal="true"/);
assert.match(css, /\.quick-entry-overlay\s*\{[\s\S]*?z-index:\s*100;/);
assert.match(css, /\.quick-entry-sheet \[hidden\]\s*\{\s*display:\s*none\s*!important;/);
assert.match(css, /body\.quick-entry-open\s*\{\s*overflow:\s*hidden;/);
assert.match(css, /max-height:\s*calc\(100dvh - 24px - env\(safe-area-inset-bottom\)\)/);
assert.doesNotMatch(css, /quick-entry-overlay\s*\{[\s\S]{0,180}calc\(50px \+ env\(safe-area-inset-bottom\)\)/);
console.log("quick entry mobile layout: PASS");
