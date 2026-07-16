const STORAGE_KEY = "stock-ledger-webapp-v1";
const SAMPLE_JSON_PATH = "data/0050_交易紀錄備份_2026-07-01.json";
const SAMPLE_CSV_PATH = `data/${encodeURIComponent("證券對帳單 20260701162400.csv")}`;

const SAMPLE_JSON_FALLBACK = JSON.stringify([
  {
    id: "demo-buy-0050-1",
    date: "2026-07-01",
    type: "BUY",
    price: 105.1,
    shares: 1000,
    fee: 41,
    tax: 0,
    category: "LONG_TERM",
    note: "部署版內建假資料：建立一筆 0050 buy lot"
  },
  {
    id: "demo-sell-0050-1",
    date: "2026-07-02",
    type: "SELL",
    price: 109.7,
    shares: 300,
    fee: 13,
    tax: 32,
    category: "LONG_TERM",
    linkedBuyId: "demo-buy-0050-1",
    note: "部署版內建假資料：賣出並產生回補任務"
  },
  {
    id: "demo-buy-0050-2",
    date: "2026-07-03",
    type: "BUY",
    price: 108.8,
    shares: 300,
    fee: 13,
    tax: 0,
    category: "REBUY",
    note: "部署版內建假資料：符合 109.2 以下回補規則"
  }
], null, 2);

const SAMPLE_CSV_FALLBACK = `部署版內建假資料，不包含你的真實券商交易紀錄。
股名,日期,成交股數,淨收付金額,買賣別,成交價,成本,手續費,交易稅,融資金額/券擔保品,資自備款/券保證金,利息,稅款,券手續費/標借費,委託書號
元大台灣50,2026/07/01,"1,000","-105,141",現買,"105.1","105,100","41","0",0,0,"0","0","0",DEMO01
元大台灣50,2026/07/02,"300","32,865",現賣,"109.7","32,910","13","32",0,0,"0","0","0",DEMO02
元大台灣50,2026/07/03,"300","-32,653",現買,"108.8","32,640","13","0",0,0,"0","0","0",DEMO03`;

const BROKER_PRESETS = [
  { id: "broker-yuanta", code: "YUANTA", name: "元大證券", country: "TW", defaultCurrency: "TWD", isActive: true },
  { id: "broker-fubon", code: "FUBON", name: "富邦證券", country: "TW", defaultCurrency: "TWD", isActive: true },
  { id: "broker-cathay", code: "CATHAY", name: "國泰證券", country: "TW", defaultCurrency: "TWD", isActive: true },
  { id: "broker-sino", code: "SINOPAC", name: "永豐金證券", country: "TW", defaultCurrency: "TWD", isActive: true },
  { id: "broker-kgi", code: "KGI", name: "凱基證券", country: "TW", defaultCurrency: "TWD", isActive: true },
  { id: "broker-capital", code: "CAPITAL", name: "群益證券", country: "TW", defaultCurrency: "TWD", isActive: true },
  { id: "broker-other", code: "OTHER", name: "其他", country: "TW", defaultCurrency: "TWD", isActive: true }
];

const NAV_ITEMS = [
  ["/app/inventory", "目前庫存"],
  ["/app/transactions", "交易紀錄"],
  ["/app/matching", "買賣配對"],
  ["/app/reconciliation", "對帳"],
  ["/app/rebuy", "回補"],
  ["/app/dashboard", "總覽"],
  ["/app/portfolios", "投資組合"],
  ["/app/brokers", "券商"],
  ["/app/broker-accounts", "券商帳戶"],
  ["/app/import", "匯入"],
  ["/app/import/templates", "匯入模板"],
  ["/app/transfers/cash", "現金轉帳"],
  ["/app/transfers/positions", "股票移轉"],
  ["/app/reports", "報表"],
  ["/app/settings", "設定"]
];

const SELL_TYPE_REGULAR = "REGULAR_SELL";
const SELL_TYPE_BORROW = "BORROW_SELL";

const DEFAULT_TEMPLATE = {
  id: "tpl-cathay-default",
  brokerId: "broker-cathay",
  templateName: "國泰證券 CSV",
  fileType: "CSV",
  encoding: "UTF-8-BOM",
  headerDetectionRule: "find row containing 股名, 日期, 成交股數",
  dateFormat: "YYYY/MM/DD",
  numberFormat: "comma",
  sideBuyValues: ["現買", "買進"],
  sideSellValues: ["現賣", "賣出"],
  columnMapping: {
    securityName: "股名",
    tradeDate: "日期",
    shares: "成交股數",
    netAmount: "淨收付金額",
    side: "買賣別",
    price: "成交價",
    grossAmount: "成本",
    fee: "手續費",
    tax: "交易稅",
    orderNo: "委託書號"
  },
  isDefault: true,
  createdAt: nowIso(),
  updatedAt: nowIso()
};

const app = document.querySelector("#app");
const toast = document.querySelector("#toast");
let state = loadState();
let firebaseRuntime = null;
let firebaseAutoSyncTimer = null;
let firebaseAutoSyncInFlight = false;
let firebaseAutoSyncQueued = false;
let autoQuoteSyncStarted = false;

window.addEventListener("hashchange", render);
document.addEventListener("submit", onSubmit);
document.addEventListener("click", onClick);
document.addEventListener("change", onChange);
document.addEventListener("keydown", onKeydown);

render();
completeGoogleRedirectLogin();

function initialState() {
  return {
    users: [],
    sessions: { currentUserId: null },
    portfolios: [],
    portfolioMembers: [],
    securities: [
      { id: "sec-0050", symbol: "0050", name: "元大台灣50", market: "TW", currency: "TWD", assetType: "ETF", createdAt: nowIso(), updatedAt: nowIso() }
    ],
    brokers: BROKER_PRESETS,
    deletedBrokerIds: [],
    brokerAccounts: [],
    importTemplates: [DEFAULT_TEMPLATE],
    importBatches: [],
    rawImportRows: [],
    appTransactions: [],
    brokerExecutions: [],
    reconciliationLinks: [],
    acceptedBrokerDiffs: {},
    buyLots: [],
    sellMatches: [],
    rebuyTasks: [],
    rebuyFills: [],
    marketQuotes: [],
    cashAccounts: [],
    cashLedger: [],
    accountTransfers: [],
    positionTransfers: [],
    auditLogs: [],
    manualClosedRebuySellIds: [],
    borrowRebuyCycles: [],
    settings: {
      user: { timezone: "Asia/Taipei", baseCurrency: "TWD", dateFormat: "YYYY-MM-DD" },
      portfolios: {},
      firebase: { configText: "", namespace: "", lastSyncAt: "", status: "LOCAL_ONLY" },
      backup: { provider: "GOOGLE_DRIVE", enabled: false, scheduleTime: "03:00", retentionDays: 90, monthlyRetention: 12 }
    },
    ui: {
      currentPortfolioId: "",
      report: "overview",
      reportBrokerAccountId: "ALL",
      transactionFilterSymbol: "ALL",
      transactionFilterAccount: "ALL",
      transactionFilterType: "ALL",
      transactionFilterStatus: "ALL",
      transactionFilterFrom: "",
      transactionFilterTo: "",
      transactionSearch: "",
      transactionLimit: "30",
      activeBrokerAccountId: "",
      reconciliationFilterStatus: "ISSUES",
      reconciliationLimit: "40",
      inventoryFilterAccount: "ALL",
      inventoryFilterSymbol: "ALL",
      expandedMatchSellId: "",
      editingMatchSellId: "",
      quickActionSheetOpen: false,
      accountSheetOpen: false,
      settingsTab: "general",
      quickEntry: null
    }
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : initialState();
    return normalizeState(parsed);
  } catch {
    return initialState();
  }
}

function normalizeState(input) {
  const base = initialState();
  const merged = { ...base, ...input };
  for (const key of Object.keys(base)) {
    if (Array.isArray(base[key]) && !Array.isArray(merged[key])) merged[key] = [];
  }
  merged.sessions = { ...base.sessions, ...(input.sessions || {}) };
  merged.settings = {
    ...base.settings,
    ...(input.settings || {}),
    user: { ...base.settings.user, ...((input.settings || {}).user || {}) },
    portfolios: { ...base.settings.portfolios, ...((input.settings || {}).portfolios || {}) },
    firebase: { ...base.settings.firebase, ...((input.settings || {}).firebase || {}) },
    backup: { ...base.settings.backup, ...((input.settings || {}).backup || {}) }
  };
  merged.ui = { ...base.ui, ...(input.ui || {}) };
  merged.securities = (merged.securities || []).map((security) => ({
    ...security,
    assetType: normalizeSecurityAssetType(security.assetType || inferSecurityAssetType(security.symbol, security.name))
  }));
  if (!Array.isArray(merged.deletedBrokerIds)) merged.deletedBrokerIds = [];
  if (!merged.acceptedBrokerDiffs || Array.isArray(merged.acceptedBrokerDiffs)) merged.acceptedBrokerDiffs = {};
  merged.brokers = mergeById(BROKER_PRESETS, merged.brokers || []).filter((broker) => !merged.deletedBrokerIds.includes(broker.id));
  if (!Array.isArray(input.importTemplates)) merged.importTemplates = [DEFAULT_TEMPLATE];
  return merged;
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function commit(message) {
  recomputeAll();
  persist();
  render();
  if (message) showToast(message);
  scheduleFirebaseAutoSync();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 5200);
}

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function simpleHash(value) {
  let hash = 2166136261;
  const text = String(value || "");
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function mergeById(seed, records) {
  const map = new Map(seed.map((item) => [item.id, item]));
  for (const record of records || []) map.set(record.id, { ...map.get(record.id), ...record });
  return Array.from(map.values());
}

function currentUser() {
  return state.users.find((user) => user.id === state.sessions.currentUserId) || null;
}

function userPortfolios() {
  const user = currentUser();
  if (!user) return [];
  const memberIds = new Set(
    state.portfolioMembers.filter((member) => member.userId === user.id).map((member) => member.portfolioId)
  );
  return state.portfolios.filter((portfolio) => portfolio.userId === user.id || memberIds.has(portfolio.id));
}

function selectedPortfolioId() {
  const portfolios = userPortfolios();
  if (!portfolios.length) return "";
  if (!portfolios.some((portfolio) => portfolio.id === state.ui.currentPortfolioId)) {
    state.ui.currentPortfolioId = portfolios[0].id;
  }
  return state.ui.currentPortfolioId;
}

function selectedPortfolio() {
  return state.portfolios.find((portfolio) => portfolio.id === selectedPortfolioId()) || null;
}

function selectedBrokerAccountId(portfolioId = selectedPortfolioId()) {
  const accounts = scopedBrokerAccounts(portfolioId);
  if (!accounts.length) return "";
  const current = state.ui.activeBrokerAccountId;
  if (current && current !== "ALL" && accounts.some((account) => account.id === current)) return current;
  return accounts.find((account) => account.isDefault)?.id || accounts[0].id;
}

function isReportRoute(path = currentPath()) {
  return path === "/app/reports";
}

function accountScopeForRoute(path = currentPath(), portfolioId = selectedPortfolioId()) {
  return isReportRoute(path) ? reportBrokerAccountId(portfolioId) : selectedBrokerAccountId(portfolioId);
}

function reportBrokerAccountId(portfolioId = selectedPortfolioId()) {
  const current = state.ui.reportBrokerAccountId || "ALL";
  if (current === "ALL") return "ALL";
  const accounts = scopedBrokerAccounts(portfolioId);
  if (accounts.some((account) => account.id === current)) return current;
  state.ui.reportBrokerAccountId = "ALL";
  return "ALL";
}

function reportAccountLabel(accountId = reportBrokerAccountId()) {
  return accountId === "ALL" ? "全部帳戶合併" : accountName(accountId);
}

function reportAccountMatches(item, accountId = reportBrokerAccountId()) {
  return !accountId || accountId === "ALL" || item.brokerAccountId === accountId;
}
function getPortfolioSettings(portfolioId = selectedPortfolioId()) {
  const defaults = defaultPortfolioSettings();
  if (!portfolioId) return defaults;
  const current = state.settings.portfolios[portfolioId] || {};
  state.settings.portfolios[portfolioId] = {
    ...defaults,
    ...current,
    brokerFees: { ...defaults.brokerFees, ...(current.brokerFees || {}) },
    securitySettings: { ...defaults.securitySettings, ...(current.securitySettings || {}) }
  };
  return state.settings.portfolios[portfolioId];
}

function defaultPortfolioSettings() {
  return {
    defaultSecurity: "0050",
    defaultRebuyOffset: 0.5,
    coreHoldingShares: 1000,
    priceTolerance: 0.05,
    amountTolerance: 5,
    feeAllocationMethod: "BY_SHARES",
    rebuyMatchMethod: "MANUAL_ONLY",
    defaultRebuyScope: "SAME_BROKER_ACCOUNT",
    brokerFees: {},
    securitySettings: {}
  };
}

function defaultBrokerFeeSetting() {
  return {
    feeRate: 0.001425,
    discountRate: 0.28,
    minFee: 1,
    sellTaxRate: 0.003,
    stockSellTaxRate: 0.003,
    etfSellTaxRate: 0.001
  };
}

function brokerFeeSetting(brokerId, portfolioId = selectedPortfolioId()) {
  const settings = getPortfolioSettings(portfolioId);
  return { ...defaultBrokerFeeSetting(), ...((settings.brokerFees || {})[brokerId] || {}) };
}

function ensureStarterData(userId) {
  const existing = state.portfolios.some((portfolio) => portfolio.userId === userId);
  if (existing) return;
  const portfolioId = makeId("portfolio");
  const accountId = makeId("broker-account");
  const cashAccountId = makeId("cash-account");
  const portfolio = {
    id: portfolioId,
    userId,
    name: "0050 策略帳本",
    baseCurrency: "TWD",
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  state.portfolios.push(portfolio);
  state.portfolioMembers.push({ id: makeId("member"), portfolioId, userId, role: "OWNER", createdAt: nowIso(), updatedAt: nowIso() });
  state.brokerAccounts.push({
    id: accountId,
    userId,
    portfolioId,
    brokerId: "broker-cathay",
    accountName: "國泰證券主帳戶",
    accountNoMasked: "****",
    branchName: "",
    currency: "TWD",
    isDefault: true,
    isActive: true,
    createdAt: nowIso(),
    updatedAt: nowIso()
  });
  state.cashAccounts.push({
    id: cashAccountId,
    portfolioId,
    brokerAccountId: accountId,
    currency: "TWD",
    accountType: "BROKER_SETTLEMENT",
    name: "國泰證券交割戶",
    isActive: true,
    createdAt: nowIso(),
    updatedAt: nowIso()
  });
  state.settings.portfolios[portfolioId] = defaultPortfolioSettings();
  state.ui.currentPortfolioId = portfolioId;
}

function brokerName(id) {
  return state.brokers.find((broker) => broker.id === id)?.name || "未設定券商";
}

function accountName(id) {
  const account = state.brokerAccounts.find((item) => item.id === id);
  if (!account) return "未設定帳戶";
  return `${brokerName(account.brokerId)} / ${account.accountName}`;
}

function accountOptionMeta(account) {
  if (!account) return "";
  const parts = [brokerName(account.brokerId), account.accountName].filter(Boolean);
  const masked = String(account.accountNoMasked || "").trim();
  return masked ? `${parts.join(" / ")} · ${masked}` : parts.join(" / ");
}

function securityById(id) {
  return state.securities.find((item) => item.id === id) || null;
}

function securityLabel(id) {
  const security = securityById(id);
  return security ? `${security.symbol} ${security.name}` : "未設定股票";
}

function ensureSecurity(symbol, name = "", market = "TW", currency = "TWD") {
  const cleanSymbol = String(symbol || "").trim().toUpperCase() || inferSymbol(name);
  let security = state.securities.find((item) => item.symbol.toUpperCase() === cleanSymbol);
  if (!security) {
    security = {
      id: makeId("security"),
      userId: currentUser()?.id || "",
      symbol: cleanSymbol,
      name: name || cleanSymbol,
      market,
      currency,
      assetType: inferSecurityAssetType(cleanSymbol, name),
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    state.securities.push(security);
  } else {
    security.assetType = normalizeSecurityAssetType(security.assetType || inferSecurityAssetType(security.symbol, security.name));
    if (name && security.name === security.symbol) {
      security.name = name;
      security.updatedAt = nowIso();
    }
  }
  return security;
}

function normalizeSecurityAssetType(value) {
  const text = String(value || "").trim().toUpperCase();
  return ["ETF", "STOCK"].includes(text) ? text : "STOCK";
}

function inferSecurityAssetType(symbol, name = "") {
  const cleanSymbol = String(symbol || "").trim().toUpperCase();
  const label = `${cleanSymbol} ${String(name || "")}`.toUpperCase();
  if (/^00\d{2,4}[A-Z]?$/.test(cleanSymbol)) return "ETF";
  if (label.includes("ETF") || label.includes("台灣50") || label.includes("高股息")) return "ETF";
  return "STOCK";
}

function securityAssetType(security) {
  return normalizeSecurityAssetType(security?.assetType || inferSecurityAssetType(security?.symbol, security?.name));
}

function securityTaxRate(security, feeSetting) {
  return securityAssetType(security) === "ETF"
    ? toNumber(feeSetting.etfSellTaxRate ?? 0.001)
    : toNumber(feeSetting.stockSellTaxRate ?? feeSetting.sellTaxRate ?? 0.003);
}
function inferSymbol(name) {
  const text = String(name || "").toUpperCase();
  
  const codeMatch = text.match(/\b\d{4,6}\b/) || text.match(/\d{4,6}/);
  if (codeMatch) return codeMatch[0];
  
  if (typeof state !== "undefined" && state.securities) {
    const found = state.securities.find((s) => s.name === name || name.includes(s.name) || s.name.includes(name));
    if (found) return found.symbol;
  }

  const known = [
    ["006208", "006208"],
    ["0056", "0056"],
    ["台灣50", "0050"],
    ["元大台灣50", "0050"],
    ["0050", "0050"]
  ];
  for (const [needle, symbol] of known) {
    if (text.includes(needle)) return symbol;
  }
  return text.replace(/[^\dA-Z]/g, "").slice(0, 12) || "UNKNOWN";
}

function isProtectedPath(path) {
  return path.startsWith("/app");
}

function currentPath() {
  const hash = window.location.hash.replace(/^#/, "");
  return hash || (currentUser() ? "/app/inventory" : "/login");
}

function navigate(path) {
  if (state.ui) state.ui.quickActionSheetOpen = false;
  window.location.hash = path;
}

function render() {
  const path = currentPath();
  if (isProtectedPath(path) && !currentUser()) {
    app.innerHTML = renderAuth("login");
    return;
  }
  if (path === "/register") {
    app.innerHTML = renderAuth("register");
    return;
  }
  if (path === "/forgot-password") {
    app.innerHTML = renderAuth("forgot");
    return;
  }
  if (path === "/login" || !currentUser()) {
    app.innerHTML = renderAuth("login");
    return;
  }
  app.innerHTML = renderShell(path);
  hydrateAfterRender(path);
}

function renderAuth(mode) {
  const isRegister = mode === "register";
  const isForgot = mode === "forgot";
  const title = isRegister ? "建立帳號" : isForgot ? "忘記密碼" : "登入";
  const formName = isRegister ? "register" : isForgot ? "forgot" : "login";
  return `
    <main class="auth-page">
      <section class="auth-panel">
        <div class="auth-brand">
          <div>
            <h1>股票交易記帳 Web App</h1>
            <p>多 Portfolio、多券商帳戶、多股票交易流水、買賣配對、回補任務與對帳報表集中管理。</p>
          </div>
          <div class="auth-signal">
            <div class="signal-row"><span>Portfolio</span><div class="signal-bar"><b style="width: 78%"></b></div></div>
            <div class="signal-row"><span>Broker</span><div class="signal-bar"><b style="width: 62%"></b></div></div>
            <div class="signal-row"><span>Rebuy</span><div class="signal-bar"><b style="width: 44%"></b></div></div>
          </div>
        </div>
        <div class="auth-form">
          <div>
            <h2>${title}</h2>
            <p class="topbar-sub">資料會依登入使用者隔離保存。</p>
          </div>
          <form data-form="${formName}">
            ${
              isRegister
                ? `<div class="field"><label>名稱</label><input name="name" autocomplete="name" required /></div>`
                : ""
            }
            ${
              isForgot
                ? `<div class="field"><label>Email</label><input type="email" name="email" autocomplete="email" required /></div>`
                : `
                  <div class="field"><label>Email</label><input type="email" name="email" autocomplete="email" required /></div>
                  <div class="field"><label>密碼</label><input type="password" name="password" autocomplete="${isRegister ? "new-password" : "current-password"}" required minlength="4" /></div>
                `
            }
            ${isForgot ? `<button class="btn primary" type="submit">建立重設紀錄</button>` : `<div class="btn-row"><button class="btn primary" type="submit">${title}</button><button class="btn" type="button" data-action="google-login">使用 Google 登入</button></div>`}
          </form>
          <div class="btn-row">
            ${
              isRegister
                ? `<button class="link-btn" data-route="/login">已有帳號，前往登入</button>`
                : `<button class="link-btn" data-route="/register">建立新帳號</button>`
            }
            ${!isForgot ? `<button class="link-btn" data-route="/forgot-password">忘記密碼</button>` : `<button class="link-btn" data-route="/login">返回登入</button>`}
          </div>
        </div>
      </section>
    </main>
  `;
}

function renderTopbarBrokerSwitch(path) {
  const accounts = scopedBrokerAccounts();
  if (!accounts.length) {
    return `<div class="topbar-account"><span>券商帳戶</span><button class="btn" data-route="/app/broker-accounts">新增</button></div>`;
  }
  if (isReportRoute(path)) {
    const selectedId = reportBrokerAccountId();
    const selectedLabel = reportAccountLabel(selectedId);
    const open = Boolean(state.ui.accountSheetOpen);
    return `
      <div class="topbar-account report-mode custom-account-switch">
        <span class="account-switch-label">報表範圍</span>
        <button class="account-select-button report-account-button ${open ? "active" : ""}" type="button" data-action="open-account-sheet" aria-label="切換報表範圍，目前 ${escapeAttr(selectedLabel)}" aria-expanded="${open ? "true" : "false"}">
          <span class="account-current-text"><small>報表範圍</small><strong>${escapeHtml(selectedLabel)}</strong></span>
          <b aria-hidden="true">⌄</b>
        </button>
        ${renderReportAccountSwitchSheet(accounts, selectedId, open)}
      </div>
    `;
  }
  const selectedId = selectedBrokerAccountId();
  const selectedAccount = accounts.find((account) => account.id === selectedId) || accounts[0];
  const open = Boolean(state.ui.accountSheetOpen);
  return `
    <div class="topbar-account custom-account-switch">
      <span class="account-switch-label">券商帳戶</span>
      <button class="account-select-button ${open ? "active" : ""}" type="button" data-action="open-account-sheet" aria-label="切換券商帳戶，目前 ${escapeAttr(accountName(selectedAccount.id))}" aria-expanded="${open ? "true" : "false"}">
        <span class="account-current-text"><small>目前帳戶</small><strong>${escapeHtml(accountName(selectedAccount.id))}</strong></span>
        <b aria-hidden="true">⌄</b>
      </button>
      ${renderAccountSwitchSheet(accounts, selectedId, open)}
    </div>
  `;
}

function renderAccountSwitchSheet(accounts, selectedId, open) {
  return `
    <div class="account-sheet-layer ${open ? "open" : ""}" aria-hidden="${open ? "false" : "true"}">
      <button class="account-sheet-scrim" type="button" data-action="close-account-sheet" aria-label="關閉券商帳戶選單"></button>
      <section class="account-sheet" aria-label="切換券商帳戶">
        <div class="action-sheet-handle" aria-hidden="true"></div>
        <header><span>券商帳戶</span><strong>切換券商帳戶</strong><em>選擇後，此分頁的庫存、交易、配對、對帳與回補都會切到該帳戶。</em></header>
        <div class="account-sheet-list">
          ${accounts.map((account) => {
            const selected = account.id === selectedId;
            return `
              <button class="account-option ${selected ? "selected" : ""}" type="button" data-action="select-broker-account" data-account-id="${escapeAttr(account.id)}" aria-pressed="${selected ? "true" : "false"}">
                <span class="account-option-main">${escapeHtml(accountName(account.id))}</span>
                <small>${escapeHtml(accountOptionMeta(account))}</small>
                <b aria-hidden="true">${selected ? "✓" : ""}</b>
              </button>
            `;
          }).join("")}
        </div>
      </section>
    </div>
  `;
}

function renderReportAccountSwitchSheet(accounts, selectedId, open) {
  const options = [{ id: "ALL", label: "全部帳戶合併", meta: "報表、圖表與匯出會合併所有券商帳戶" }, ...accounts.map((account) => ({ id: account.id, label: accountName(account.id), meta: accountOptionMeta(account) }))];
  return `
    <div class="account-sheet-layer ${open ? "open" : ""}" aria-hidden="${open ? "false" : "true"}">
      <button class="account-sheet-scrim" type="button" data-action="close-account-sheet" aria-label="關閉報表範圍選單"></button>
      <section class="account-sheet" aria-label="切換報表範圍">
        <div class="action-sheet-handle" aria-hidden="true"></div>
        <header><span>報表範圍</span><strong>選擇報表帳戶</strong><em>只影響報表、圖表與匯出；其他分頁仍照右上角目前帳戶分開顯示。</em></header>
        <div class="account-sheet-list">
          ${options.map((option) => {
            const selected = option.id === selectedId;
            return `
              <button class="account-option ${selected ? "selected" : ""}" type="button" data-action="select-report-account" data-account-id="${escapeAttr(option.id)}" aria-pressed="${selected ? "true" : "false"}">
                <span class="account-option-main">${escapeHtml(option.label)}</span>
                <small>${escapeHtml(option.meta)}</small>
                <b aria-hidden="true">${selected ? "✓" : ""}</b>
              </button>
            `;
          }).join("")}
        </div>
      </section>
    </div>
  `;
}

function formatTimeOnly(isoText) {
  if (!isoText) return "";
  try {
    const d = new Date(isoText);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  } catch {
    return String(isoText).slice(11, 16);
  }
}

function renderTopbarSyncStatus() {
  if (!canAutoSyncFirebase()) {
    return `<button class="btn icon-btn sync-status local" type="button" data-action="firebase-push" title="僅本機儲存 (點擊嘗試同步)"><span class="dot"></span>Local</button>`;
  }
  const status = state.settings.firebase.status || "LOCAL_ONLY";
  const lastSyncText = state.settings.firebase.lastSyncAt ? formatTimeOnly(state.settings.firebase.lastSyncAt) : "-";
  
  let label = "";
  let className = "";
  if (status === "SYNCED") {
    label = `已同步 ${lastSyncText}`;
    className = "synced";
  } else if (status === "PENDING") {
    label = "同步中...";
    className = "pending";
  } else if (status === "SYNC_FAILED") {
    label = "同步失敗";
    className = "failed";
  } else {
    label = "未同步";
    className = "local";
  }
  
  return `
    <button class="btn icon-btn sync-status ${className}" type="button" data-action="firebase-push" title="最後同步: ${lastSyncText}，點擊強制同步">
      <span class="dot"></span>
      <span class="sync-label">${label}</span>
    </button>
  `;
}

function renderShell(path) {
  const user = currentUser();
  const portfolios = userPortfolios();
  const portfolioId = selectedPortfolioId();
  const title = NAV_ITEMS.find(([route]) => route === path)?.[1] || "App";
  return `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <strong>Stock Ledger</strong>
          <span>${escapeHtml(user.email)}</span>
        </div>
        <div class="portfolio-picker">
          <small>Portfolio</small>
          <select id="portfolio-select">
            ${portfolios.map((portfolio) => `<option value="${portfolio.id}" ${portfolio.id === portfolioId ? "selected" : ""}>${escapeHtml(portfolio.name)}</option>`).join("")}
          </select>
        </div>
        <nav class="nav">
          ${NAV_ITEMS.map(([route, label]) => `<button data-route="${route}" class="${route === path ? "active" : ""}">${label}</button>`).join("")}
        </nav>
        <div class="sidebar-footer">
          <button class="btn ghost" data-action="logout">登出</button>
          <small>${state.settings.firebase.lastSyncAt ? `Firebase ${formatDateTime(state.settings.firebase.lastSyncAt)}` : "Local storage"}</small>
        </div>
      </aside>
      <main class="main">
        <header class="topbar">
          <div>
            <h1>${title}</h1>
            <div class="topbar-sub">${escapeHtml(selectedPortfolio()?.name || "尚未建立 Portfolio")}</div>
          </div>
          <div class="topbar-right">
            ${renderTopbarSyncStatus()}
            ${renderTopbarBrokerSwitch(path)}
            <div class="btn-row desktop-actions">
              <button class="btn primary" data-action="quick-buy" title="Alt+B">買進</button>
              <button class="btn warn" data-action="quick-sell" title="Alt+S">賣出</button>
              <button class="btn blue" data-action="quick-deposit" title="Alt+D">入金</button>
              <button class="btn" data-action="quick-income" title="Alt+I">收益</button>
              <button class="btn" data-action="quick-withdraw" title="Alt+W">出金</button>
            </div>
          </div>
        </header>
        <div class="content">${renderRoute(path)}</div>
      </main>
      ${renderMobileQuickDock()}
      ${renderMobileBottomNav(path)}
      ${renderQuickEntryModal()}
    </div>
  `;
}

function renderMobileQuickDock() {
  const open = Boolean(state.ui.quickActionSheetOpen);
  const actions = [
    ["quick-buy", "買進", "買", "action-buy", "新增買進或回補"],
    ["quick-sell", "賣出", "賣", "action-sell", "從庫存賣出"],
    ["quick-deposit", "入金", "入", "action-cash", "現金入帳"],
    ["quick-income", "收益", "收", "action-income", "利息或股息"],
    ["quick-withdraw", "出金", "出", "action-withdraw", "現金轉出"]
  ];
  return `
    <button class="mobile-fab ${open ? "active" : ""}" data-action="${open ? "close-action-sheet" : "open-action-sheet"}" aria-label="${open ? "關閉快速記帳" : "開啟快速記帳"}" aria-expanded="${open ? "true" : "false"}"><span aria-hidden="true">＋</span></button>
    <div class="mobile-action-layer ${open ? "open" : ""}" aria-hidden="${open ? "false" : "true"}">
      <button class="action-sheet-scrim" type="button" data-action="close-action-sheet" aria-label="關閉快速記帳"></button>
      <section class="mobile-action-sheet" aria-label="快速記帳">
        <div class="action-sheet-handle" aria-hidden="true"></div>
        <header><span>快速記帳</span><strong>選擇操作</strong></header>
        <div class="action-sheet-grid">
          ${actions.map(([action, label, icon, tone, hint]) => `
            <button class="action-sheet-button ${tone}" type="button" data-action="${action}">
              <span class="action-icon" aria-hidden="true">${icon}</span>
              <strong>${label}</strong>
              <small>${hint}</small>
            </button>
          `).join("")}
        </div>
      </section>
    </div>
  `;
}
function renderMobileBottomNav(path) {
  const items = [
    ["/app/inventory", "庫存", "▦"],
    ["/app/transactions", "交易", "⇄"],
    ["/app/matching", "配對", "↔"],
    ["/app/reconciliation", "對帳", "✓"],
    ["/app/rebuy", "回補", "↩"],
    ["/app/reports", "報表", "▥"],
    ["/app/settings", "設定", "⚙"]
  ];
  return `
    <nav class="mobile-bottom-nav" aria-label="手機主導覽">
      ${items.map(([route, label, icon]) => `<button data-route="${route}" class="${route === path ? "active" : ""}" aria-label="${label}"><span class="tab-icon" aria-hidden="true">${icon}</span><span>${label}</span></button>`).join("")}
    </nav>
  `;
}
function renderQuickEntryModal() {
  const entry = state.ui.quickEntry;
  if (!entry?.type) return "";
  const type = normalizeType(entry.type);
  const isEdit = Boolean(entry.id);
  const isCash = ["DEPOSIT", "WITHDRAW", "INTEREST", "DIVIDEND"].includes(type);
  const requestedAccountId = entry.brokerAccountId || selectedBrokerAccountId();
  const allAccounts = scopedBrokerAccounts();
  const accounts = allAccounts.filter((account) => !requestedAccountId || account.id === requestedAccountId);
  const defaultAccountId = requestedAccountId || allAccounts.find((account) => account.isDefault)?.id || allAccounts[0]?.id || "";
  const defaultSymbol = String(entry.symbol || getPortfolioSettings().defaultSecurity || "0050").toUpperCase();
  const defaultSecurity = state.securities.find((security) => security.symbol.toUpperCase() === defaultSymbol);
  const defaultName = entry.securityName || defaultSecurity?.name || (defaultSymbol === "0050" ? "元大台灣50" : defaultSymbol);
  const title = isEdit
    ? `修改${["INTEREST", "DIVIDEND"].includes(type) ? "收益" : { BUY: "買進", SELL: "賣出", DEPOSIT: "入金", WITHDRAW: "出金" }[type] || "交易"}`
    : (["INTEREST", "DIVIDEND"].includes(type) ? "收益" : { BUY: "買進", SELL: "賣出", DEPOSIT: "入金", WITHDRAW: "出金" }[type] || "交易");
  return `
    <div class="quick-entry-overlay" role="dialog" aria-modal="true" aria-label="${escapeAttr(title)}">
      <form class="quick-entry-sheet" data-form="quick-entry">
        <input type="hidden" name="id" value="${escapeAttr(entry.id || "")}" />
        <input type="hidden" name="transactionType" value="${escapeAttr(type)}" />
        <header class="quick-entry-head">
          <div><span>快速記帳</span><strong>${escapeHtml(title)}</strong></div>
          <button class="icon-btn" type="button" data-action="close-quick-entry" aria-label="關閉">×</button>
        </header>
        <div class="quick-entry-grid">
          <div class="field"><label>日期</label><input type="date" name="tradeDate" value="${escapeAttr(entry.tradeDate || today())}" required /></div>
          <div class="field"><label>券商帳戶</label><select name="brokerAccountId" required>${accounts.map((account) => `<option value="${account.id}" ${account.id === defaultAccountId ? "selected" : ""}>${escapeHtml(accountName(account.id))}</option>`).join("")}</select></div>
          ${isCash ? renderQuickCashFields(type, entry) : renderQuickTradeFields(type, entry, defaultSymbol, defaultName, defaultAccountId)}
        </div>
        <div class="quick-entry-actions">
          <button class="btn" type="button" data-action="close-quick-entry">取消</button>
          <button class="btn primary" type="submit">${isEdit ? "確認修改" : `儲存${escapeHtml(title)}`}</button>
        </div>
      </form>
    </div>
  `;
}

function sellTypeForTransaction(transaction = {}) {
  return transaction.borrowRebuyType === SELL_TYPE_BORROW ? SELL_TYPE_BORROW : SELL_TYPE_REGULAR;
}

function sellTypeLabel(sellType) {
  return sellType === SELL_TYPE_BORROW ? "庫存借券" : "一般賣出";
}

function isBorrowSellTransaction(tx = {}) {
  return tx.transactionType === "SELL" && tx.borrowRebuyType === SELL_TYPE_BORROW;
}

function isRegularRebuySellTransaction(tx = {}) {
  return tx.transactionType === "SELL" && !isBorrowSellTransaction(tx);
}

function resolveSellMatchingFields(data = {}) {
  const requestedType = String(data.sellType || data.borrowRebuyType || "").trim().toUpperCase();
  const sellType = requestedType === SELL_TYPE_BORROW ? SELL_TYPE_BORROW : SELL_TYPE_REGULAR;
  return {
    sellType,
    borrowRebuyType: sellType === SELL_TYPE_BORROW ? SELL_TYPE_BORROW : "",
    linkedBuyTransactionId: sellType === SELL_TYPE_REGULAR ? String(data.linkedBuyTransactionId || "").trim() : "",
    sourceInventoryLotId: sellType === SELL_TYPE_BORROW ? String(data.sourceInventoryLotId || "").trim() : ""
  };
}

function clearMatchPickerField(field) {
  if (!field) return;
  const input = field.querySelector('input[type="hidden"]');
  if (input) input.value = "";
  for (const button of field.querySelectorAll('[data-action="toggle-match-lot"]')) {
    button.classList.remove("selected");
    button.setAttribute("aria-pressed", "false");
  }
}

function renderQuickTradeFields(type, entry, defaultSymbol, defaultName, accountId) {
  const linkedOptions = quickSellLotOptions(accountId, defaultSymbol);
  const excludedSellId = entry.id || "";
  const borrowSourceOptions = borrowSourceLotOptions(accountId, defaultSymbol, entry.sourceInventoryLotId || "", excludedSellId);
  const linkedValue = entry.linkedBuyTransactionId || "";
  const sellType = sellTypeForTransaction(entry);
  
  let sellFields = "";
  if (type === "SELL") {
    sellFields = `
      <div class="field"><label>賣出方式</label><select name="sellType">
        <option value="${SELL_TYPE_REGULAR}" ${sellType === SELL_TYPE_REGULAR ? "selected" : ""}>一般賣出（扣減庫存）</option>
        <option value="${SELL_TYPE_BORROW}" ${sellType === SELL_TYPE_BORROW ? "selected" : ""}>自有庫存借券賣出（不列入一般回補清單）</option>
      </select></div>
      <div class="field full" data-sell-normal-match-field ${sellType === SELL_TYPE_BORROW ? "hidden" : ""}>
        <label>配對買進庫存</label>
        <small class="field-hint">只顯示同帳戶、同股票且賣出日前仍可用的庫存；未選時依既有規則自動配對。</small>
        ${renderMatchLotPicker(linkedOptions, linkedValue, `<input type="hidden" name="linkedBuyTransactionId" value="${escapeAttr(linkedValue)}" />`, "沒有可配對的買進庫存")}
      </div>
      <div class="field full" data-sell-borrow-match-field ${sellType !== SELL_TYPE_BORROW ? "hidden" : ""}>
        <label>借券來源庫存</label>
        <small class="field-hint">可多選，依點選順序保留庫存；後續請用「借券回補」買進，不會列入一般賣出回補清單。</small>
        ${renderMatchLotPicker(borrowSourceOptions, entry.sourceInventoryLotId || "", `<input type="hidden" name="sourceInventoryLotId" data-match-buy value="${escapeAttr(entry.sourceInventoryLotId || "")}" />`, "目前無可借出的持股庫存")}
      </div>
    `;
  }

  return `
    <div class="field"><label>股票代號</label><input name="symbol" value="${escapeAttr(defaultSymbol)}" required /></div>
    <div class="field"><label>股票名稱</label><input name="securityName" value="${escapeAttr(defaultName)}" /></div>
    <div class="field"><label>成交價</label><input type="number" inputmode="decimal" step="0.01" name="price" value="${escapeAttr(entry.price || "")}" required /></div>
    <div class="field"><label>股數</label><input type="number" inputmode="numeric" step="1" name="shares" value="${escapeAttr(entry.shares || 100)}" required /></div>
    <div class="field"><label>手續費</label><input type="number" inputmode="numeric" step="1" name="fee" value="${escapeAttr(entry.fee ?? "")}" placeholder="自動" /></div>
    <div class="field"><label>交易稅</label><input type="number" inputmode="numeric" step="1" name="tax" value="${escapeAttr(entry.tax ?? "")}" placeholder="自動" /></div>
    ${type === "SELL" ? sellFields : ""}
    ${type === "BUY" ? renderQuickBuyIntentFields(entry, defaultSymbol, accountId) : ""}
    <div class="field"><label>分類</label><select name="strategyCategory"><option ${entry.strategyCategory === "TRADING" ? "selected" : ""}>TRADING</option><option ${entry.strategyCategory === "LONG_TERM" ? "selected" : ""}>LONG_TERM</option><option ${entry.strategyCategory === "REBUY" ? "selected" : ""}>REBUY</option><option ${entry.strategyCategory === "CORE" ? "selected" : ""}>CORE</option></select></div>
    <div class="field full"><label>備註</label><input name="note" value="${escapeAttr(entry.note || `快捷${type === "BUY" ? "買進" : "賣出"}`)}" /></div>
  `;
}

function renderQuickBuyIntentFields(entry, symbol, accountId) {
  const selectedRebuyValue = parseRebuySellIds(entry.rebuySellTransactionIds).join(",");
  const selectedBorrowValue = entry.rebuyCycleId || "";
  
  let buyType = "NEW";
  if (entry.borrowRebuyType === "REBUY_FILL") {
    buyType = "BORROW_REBUY";
  } else if (entry.buyIntent === "REBUY" || selectedRebuyValue) {
    buyType = "REBUY";
  }
  
  const normalRebuyOptions = activeRebuyTaskOptions(symbol, accountId);
  const borrowCycleOptions = (state.borrowRebuyCycles || [])
    .filter((cycle) => cycle.status !== "closed")
    .filter((cycle) => cycle.symbol.toUpperCase() === symbol.toUpperCase())
    .filter((cycle) => {
      const sellTx = state.appTransactions.find(t => t.id === cycle.sellTradeId);
      return !accountId || (sellTx && sellTx.brokerAccountId === accountId);
    })
    .map((cycle) => ({
      value: cycle.id,
      date: cycle.sellDate,
      price: cycle.sellPrice,
      shares: cycle.remainingRebuyQty,
      security: symbol,
      account: accountName(accountId),
      category: "BORROW"
    }));
    
  return `
    <div class="field"><label>買入用途</label><select name="buyType">
      <option value="NEW" ${buyType === "NEW" ? "selected" : ""}>一般買進</option>
      <option value="REBUY" ${buyType === "REBUY" ? "selected" : ""}>回補一般任務</option>
      <option value="BORROW_REBUY" ${buyType === "BORROW_REBUY" ? "selected" : ""}>回補借券任務</option>
    </select></div>
    
    <div class="field full rebuy-intent-field" data-rebuy-intent-field ${buyType === "REBUY" ? "" : "hidden"}>
      <label>回補哪幾筆 (一般回補)</label>
      ${renderMatchLotPicker(normalRebuyOptions, selectedRebuyValue, `<input type="hidden" name="rebuySellTransactionIds" value="${escapeAttr(selectedRebuyValue)}" />`, "目前沒有待回補賣出單")}
    </div>
    
    <div class="field full borrow-rebuy-intent-field" data-borrow-rebuy-intent-field ${buyType === "BORROW_REBUY" ? "" : "hidden"}>
      <label>回補哪一筆借券任務 (必選)</label>
      ${renderMatchLotPicker(borrowCycleOptions, selectedBorrowValue, `<input type="hidden" name="rebuyCycleId" data-match-buy value="${escapeAttr(selectedBorrowValue)}" />`, "目前沒有待回補的借券賣出任務")}
    </div>
  `;
}

function activeRebuyTaskOptions(symbol, accountId = "") {
  const cleanSymbol = String(symbol || "").toUpperCase();
  const tasks = state.rebuyTasks
    .filter((task) => task.portfolioId === selectedPortfolioId() && !rebuyTaskIsArchived(task))
    .filter((task) => !accountId || task.brokerAccountId === accountId)
    .filter((task) => !cleanSymbol || securityById(task.securityId)?.symbol.toUpperCase() === cleanSymbol);
  return groupRebuyTasksForDisplay(tasks).map((task) => {
    const ids = task.sellIds || [task.sellTransactionId];
    return {
      value: ids[0] || task.sellTransactionId,
      ids,
      date: task.sellDate,
      price: task.targetRebuyPrice,
      shares: task.remainingRebuyShares,
      security: securityLabel(task.securityId),
      account: accountName(task.brokerAccountId),
      category: task.originalTaskCount > 1 ? `${fmtNum(task.originalTaskCount)}筆賣出` : `賣出 ${fmtPrice(task.sellPrice)}`
    };
  });
}

function renderQuickCashFields(type, entry) {
  const isIncome = ["INTEREST", "DIVIDEND"].includes(type);
  if (isIncome) {
    const normalizedIncomeType = normalizeType(entry.incomeType || type);
    const incomeType = ["INTEREST", "DIVIDEND"].includes(normalizedIncomeType) ? normalizedIncomeType : "INTEREST";
    return `
      <div class="field"><label>收益類型</label><select name="incomeType"><option value="INTEREST" ${incomeType === "INTEREST" ? "selected" : ""}>存款利息</option><option value="DIVIDEND" ${incomeType === "DIVIDEND" ? "selected" : ""}>股息</option></select></div>
      <div class="field"><label>金額</label><input type="number" inputmode="numeric" step="1" name="amount" value="${escapeAttr(entry.amount || "")}" required /></div>
      <div class="field full"><label>備註</label><input name="note" value="${escapeAttr(entry.note || "")}" placeholder="可空白" /></div>
    `;
  }
  const amountLabel = type === "WITHDRAW" ? "出金金額" : "入金金額";
  const defaultNote = type === "WITHDRAW" ? "快捷出金" : "快捷入金";
  return `
    <div class="field full"><label>${amountLabel}</label><input type="number" inputmode="numeric" step="1" name="amount" value="${escapeAttr(entry.amount || "")}" required /></div>
    <div class="field full"><label>備註</label><input name="note" value="${escapeAttr(entry.note || defaultNote)}" /></div>
  `;
}
function quickSellLotOptions(accountId, symbol) {
  const cleanSymbol = String(symbol || "").toUpperCase();
  return state.buyLots
    .filter((lot) => lot.remainingShares > 0)
    .filter((lot) => !accountId || lot.brokerAccountId === accountId)
    .filter((lot) => securityById(lot.securityId)?.symbol.toUpperCase() === cleanSymbol)
    .sort(sortByBuyDateDesc)
    .map(lotMatchOption);
}

function lotMatchOption(lot) {
  return {
    value: lot.sourceTransactionId || lot.buyTransactionId,
    date: lot.buyDate,
    price: lot.buyPrice,
    shares: lot.remainingShares,
    security: securityLabel(lot.securityId),
    account: accountName(lot.brokerAccountId),
    category: lot.strategyCategory || "-"
  };
}

function parseLinkedBuyIds(value) {
  return String(value || "")
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseRebuySellIds(value) {
  const ids = Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : parseLinkedBuyIds(value);
  return [...new Set(ids)];
}

function normalizeSourceInventoryLotIds(value) {
  return [...new Set(parseLinkedBuyIds(value))];
}

function lotPrimarySourceId(lot) {
  return String(lot?.sourceTransactionId || lot?.buyTransactionId || "").trim();
}

function lotMatchesSourceId(lot, id) {
  const cleanId = String(id || "").trim();
  if (!cleanId || !lot) return false;
  return [lot.sourceTransactionId, lot.buyTransactionId].map((value) => String(value || "").trim()).includes(cleanId);
}

function findBuyLotBySourceId(sourceId) {
  return state.buyLots.find((lot) => lotMatchesSourceId(lot, sourceId)) || null;
}

function borrowRemainingForSell(sell) {
  const cycle = (state.borrowRebuyCycles || []).find((item) => item.sellTradeId === sell.id);
  if (cycle) return toNumber(cycle.remainingRebuyQty);
  const filled = state.appTransactions
    .filter((tx) => tx.transactionType === "BUY" && tx.borrowRebuyType === "REBUY_FILL" && tx.rebuyCycleId === sell.id)
    .reduce((total, tx) => total + toNumber(tx.shares), 0);
  return Math.max(0, toNumber(sell.shares) - filled);
}

function borrowSourceReservations(excludedSellId = "") {
  const reserved = new Map();
  const borrowSells = state.appTransactions
    .filter((tx) => tx.transactionType === "SELL" && tx.borrowRebuyType === "BORROW_SELL" && tx.id !== excludedSellId)
    .sort(sortByDateAsc);
  for (const sell of borrowSells) {
    let sharesToReserve = borrowRemainingForSell(sell);
    if (sharesToReserve <= 0) continue;
    for (const sourceId of normalizeSourceInventoryLotIds(sell.sourceInventoryLotId || sell.linkedBuyTransactionId)) {
      const lot = findBuyLotBySourceId(sourceId);
      if (!lot || sharesToReserve <= 0) continue;
      const primaryId = lotPrimarySourceId(lot);
      const available = Math.max(0, toNumber(lot.remainingShares) - toNumber(reserved.get(primaryId)));
      const reservedShares = Math.min(sharesToReserve, available);
      if (reservedShares <= 0) continue;
      reserved.set(primaryId, toNumber(reserved.get(primaryId)) + reservedShares);
      sharesToReserve -= reservedShares;
    }
  }
  return reserved;
}

function borrowAdjustedInventoryLots(lots = state.buyLots) {
  const reservations = borrowSourceReservations();
  return lots.map((lot) => {
    const borrowedShares = Math.min(
      toNumber(lot.remainingShares),
      toNumber(reservations.get(lotPrimarySourceId(lot)))
    );
    if (borrowedShares <= 0) return lot;
    return {
      ...lot,
      remainingShares: Math.max(0, toNumber(lot.remainingShares) - borrowedShares),
      borrowedShares
    };
  });
}

function borrowSourceLotOptions(accountId, symbol, selectedValue = "", excludedSellId = "") {
  const selectedIds = normalizeSourceInventoryLotIds(selectedValue);
  const reservations = borrowSourceReservations(excludedSellId);
  return quickSellLotOptions(accountId, symbol)
    .map((option) => {
      const lot = findBuyLotBySourceId(option.value);
      const reserved = lot ? toNumber(reservations.get(lotPrimarySourceId(lot))) : 0;
      return { ...option, shares: Math.max(0, toNumber(option.shares) - reserved) };
    })
    .filter((option) => option.shares > 0 || selectedIds.some((id) => lotMatchesSourceId(findBuyLotBySourceId(option.value), id)));
}

function validateBorrowSellSourceLots(sourceValue, shares, account, securityId, portfolioId, excludedSellId = "") {
  const selectedIds = normalizeSourceInventoryLotIds(sourceValue);
  if (!selectedIds.length) throw new Error("請選擇借券來源庫存。");
  const reservations = borrowSourceReservations(excludedSellId);
  const lots = [];
  const seen = new Set();
  for (const sourceId of selectedIds) {
    const lot = findBuyLotBySourceId(sourceId);
    if (!lot) throw new Error("找不到選取的借券來源庫存。");
    const primaryId = lotPrimarySourceId(lot);
    if (seen.has(primaryId)) continue;
    seen.add(primaryId);
    if (lot.portfolioId !== portfolioId) throw new Error("選取的借券來源庫存不屬於目前帳本。");
    if (lot.brokerAccountId !== account.id) throw new Error("選取的借券來源庫存屬於不同券商帳戶。");
    if (lot.securityId !== securityId) throw new Error("選取的借券來源庫存和賣出股票不同。");
    const available = Math.max(0, toNumber(lot.remainingShares) - toNumber(reservations.get(primaryId)));
    lots.push({ lot, available });
  }
  const totalAvailable = lots.reduce((total, item) => total + item.available, 0);
  if (toNumber(shares) > totalAvailable) {
    const detail = lots.map((item) => fmtPrice(item.lot.buyPrice) + "元 " + fmtNum(item.available) + "股").join(" + ");
    throw new Error("借出股數 (" + fmtNum(shares) + " 股) 不可超過已選來源庫存可借股數合計 (" + fmtNum(totalAvailable) + " 股" + (detail ? "：" + detail : "") + ")。");
  }
  return lots.map((item) => lotPrimarySourceId(item.lot)).join(",");
}

function borrowSourceCostLabel(sourceValue) {
  const lots = normalizeSourceInventoryLotIds(sourceValue)
    .map(findBuyLotBySourceId)
    .filter(Boolean);
  if (!lots.length) return "-";
  return lots.map((lot) => fmtPrice(lot.buyPrice) + " / " + fmtNum(lot.originalShares) + "股").join(" + ");
}
function renderMatchLotPicker(lots, selectedValue, hiddenInputHtml, emptyText) {
  const selectedIds = parseLinkedBuyIds(selectedValue);
  const displayLots = orderedMatchLots(lots, selectedIds);
  return `
    <div class="match-picker">
      ${hiddenInputHtml}
      <div class="match-picker-head">
        <div><span>配對順序</span><strong>先點先扣庫存</strong></div>
        <button class="link-btn" type="button" data-action="clear-match-picker">清除</button>
      </div>
      <div class="match-picker-summary">${escapeHtml(matchPickerSummary(lots, selectedIds))}</div>
      <div class="match-picker-list">
        ${displayLots.length ? displayLots.map((lot) => renderMatchLotButton(lot, selectedIds)).join("") : `<div class="match-picker-empty">${escapeHtml(emptyText || "沒有可配對庫存")}</div>`}
      </div>
    </div>
  `;
}

function orderedMatchLots(lots, selectedIds) {
  return [...lots].sort((a, b) => {
    const aIndex = matchOptionSelectedIndex(a, selectedIds);
    const bIndex = matchOptionSelectedIndex(b, selectedIds);
    if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex;
    if (aIndex >= 0) return -1;
    if (bIndex >= 0) return 1;
    return 0;
  });
}

function matchOptionIds(option) {
  const ids = Array.isArray(option.ids) ? option.ids : [option.value];
  return ids.map((id) => String(id || "").trim()).filter(Boolean);
}

function matchOptionSelectedIndex(option, selectedIds) {
  const indexes = matchOptionIds(option)
    .map((id) => selectedIds.indexOf(id))
    .filter((index) => index >= 0);
  return indexes.length ? Math.min(...indexes) : -1;
}

function matchOptionSelected(option, selectedIds) {
  return matchOptionSelectedIndex(option, selectedIds) >= 0;
}

function renderMatchLotButton(lot, selectedIds) {
  const optionIds = matchOptionIds(lot);
  const selectedIndex = matchOptionSelectedIndex(lot, selectedIds);
  const order = selectedIndex + 1;
  const selected = selectedIndex >= 0;
  return `
    <button class="match-lot-card ${selected ? "selected" : ""}" type="button" data-action="toggle-match-lot" data-match-id="${escapeAttr(optionIds[0] || lot.value)}" data-match-ids="${escapeAttr(optionIds.join(","))}" data-match-price="${escapeAttr(fmtPrice(lot.price))}" data-match-shares="${escapeAttr(fmtNum(lot.shares))}" aria-pressed="${selected ? "true" : "false"}">
      <span class="match-rank">${selected ? order : ""}</span>
      <span class="match-price">@ ${fmtPrice(lot.price)}</span>
      <span class="match-meta">${escapeHtml(lot.date)} ${escapeHtml(lot.security)}</span>
      <span class="match-shares">${fmtNum(lot.shares)}股</span>
    </button>
  `;
}

function matchPickerSummary(lots, selectedIds) {
  if (!selectedIds.length) return "可選多筆，先點的會先扣；價格在前，股數在後。";
  const selectedLots = orderedMatchLots(lots, selectedIds).filter((lot) => matchOptionSelected(lot, selectedIds));
  const chain = selectedLots
    .map((lot) => `@${fmtPrice(lot.price)} ${fmtNum(lot.shares)}股`)
    .join(" / ");
  return `已選 ${selectedLots.length} 項，扣除順序：${chain}`;
}
function renderRoute(path) {
  const routeMap = {
    "/app/dashboard": renderDashboard,
    "/app/portfolios": renderPortfolios,
    "/app/brokers": renderBrokers,
    "/app/broker-accounts": renderBrokerAccounts,
    "/app/import": renderImport,
    "/app/import/templates": renderImportTemplates,
    "/app/reconciliation": renderReconciliation,
    "/app/transactions": renderTransactions,
    "/app/matching": renderMatching,
    "/app/rebuy": renderRebuy,
    "/app/inventory": renderInventory,
    "/app/transfers/cash": renderCashTransfers,
    "/app/transfers/positions": renderPositionTransfers,
    "/app/reports": renderReports,
    "/app/settings": renderSettings
  };
  return (routeMap[path] || renderDashboard)();
}

function hydrateAfterRender(path) {
  if (path === "/app/dashboard") {
    window.requestAnimationFrame(() => drawDashboardCharts());
  }
  scheduleAutoQuoteSync();
}

function scheduleAutoQuoteSync() {
  if (autoQuoteSyncStarted || !currentUser()) return;
  const portfolioId = selectedPortfolioId();
  const hasHeldSecurity = state.buyLots.some((lot) => lot.portfolioId === portfolioId && toNumber(lot.remainingShares) > 0);
  if (!hasHeldSecurity) return;
  autoQuoteSyncStarted = true;
  window.setTimeout(() => {
    handleYahooQuoteSync({ silent: true }).catch((error) => console.warn("Auto quote sync failed", error));
  }, 700);
}

function renderDashboard() {
  const portfolioId = selectedPortfolioId();
  const brokerAccountId = selectedBrokerAccountId(portfolioId);
  const metrics = portfolioMetrics(portfolioId, brokerAccountId);
  const accountRows = accountSummaries(portfolioId).filter((row) => !brokerAccountId || row.accountId === brokerAccountId);
  const uploadChecklist = brokerUploadChecklist(portfolioId, brokerAccountId);
  return `
    ${renderPortfolioSnapshot(portfolioId, brokerAccountId, "dashboard")}
    <section class="metric-grid secondary-metrics">
      ${metricCard("已實現淨利", fmtMoney(metrics.realizedNetProfit), "amber")}
      ${metricCard("待回補股數", fmtNum(metrics.openRebuyShares), "coral")}
      ${metricCard("待上傳交易日", fmtNum(uploadChecklist.filter((row) => row.status === "MISSING_BROKER_UPLOAD").length), "amber")}
    </section>
    <section class="two-col">
      <div class="section">
        <div class="section-title"><div><h2>資金與損益</h2><p>目前券商帳戶視角</p></div></div>
        <div class="canvas-wrap"><canvas id="cash-chart" width="920" height="330"></canvas></div>
      </div>
      <div class="section">
        <div class="section-title"><div><h2>持股與回補</h2><p>目前券商帳戶每日累積變化</p></div></div>
        <div class="canvas-wrap"><canvas id="inventory-chart" width="920" height="330"></canvas></div>
      </div>
    </section>
    <section class="section">
      <div class="section-title">
        <div><h2>券商帳戶分帳</h2><p>同一 Portfolio 底下分帳保存</p></div>
        <button class="btn" data-route="/app/broker-accounts">管理帳戶</button>
      </div>
      ${renderTable(
        [
          ["broker", "券商"],
          ["account", "帳戶"],
          ["cash", "現金"],
          ["shares", "持股"],
          ["avgCost", "平均成本"],
          ["realized", "已實現損益"],
          ["rebuy", "待回補"],
          ["issues", "對帳異常"],
          ["lastImport", "最後匯入"]
        ],
        accountRows.map((row) => ({
          broker: escapeHtml(row.broker),
          account: escapeHtml(row.account),
          cash: fmtMoney(row.cash),
          shares: fmtNum(row.shares),
          avgCost: row.avgCost ? fmtPrice(row.avgCost) : "-",
          realized: fmtMoney(row.realized),
          rebuy: fmtNum(row.rebuy),
          issues: statusPill(row.issues ? "NEEDS_REVIEW" : "MATCHED"),
          lastImport: row.lastImport || "-"
        })),
        "尚未建立券商帳戶"
      )}
    </section>
    <section class="section">
      <div class="section-title">
        <div><h2>交易日券商紀錄檢查</h2><p>有登記交易的日期需上傳同日券商紀錄</p></div>
        <button class="btn" data-route="/app/import">前往匯入</button>
      </div>
      ${renderBrokerUploadChecklist(uploadChecklist)}
    </section>
  `;
}

function renderPortfolioSnapshot(portfolioId, brokerAccountId = "ALL", context = "dashboard") {
  const accountScoped = brokerAccountId && brokerAccountId !== "ALL";
  const lots = borrowAdjustedInventoryLots(state.buyLots).filter((lot) =>
    lot.portfolioId === portfolioId &&
    lot.remainingShares > 0 &&
    (!accountScoped || lot.brokerAccountId === brokerAccountId)
  );
  const metrics = portfolioMetrics(portfolioId, brokerAccountId || "ALL");
  const valuation = portfolioSnapshotValuation(lots);
  const currentValue = metrics.cash + valuation.inventoryValue;
  const heldCount = heldSecuritiesForLots(lots).length;
  const quoteHint = valuation.hasQuotes
    ? (valuation.hasMissingQuotes ? "部分無現價，缺價用成本" : "依最新現價估算")
    : "尚無現價，暫以庫存成本估算";
  const inventoryValueLabel = valuation.hasQuotes && !valuation.hasMissingQuotes ? "庫存市值" : "庫存現值";
  return `
    <section class="portfolio-snapshot ${escapeAttr(context)}">
      <div class="snapshot-heading">
        <div>
          <span class="eyebrow">資產快照</span>
          <h2>${accountScoped ? escapeHtml(accountName(brokerAccountId)) : "全部券商帳戶"}</h2>
          <p>${escapeHtml(quoteHint)}，現值 = 現金餘額 + 庫存現值。</p>
        </div>
        <button class="btn compact-sync-btn" data-action="sync-yahoo-quotes">重抓現價</button>
      </div>
      <div class="snapshot-mobile-strip" aria-label="資產快照精簡版">
        <div class="mobile-snapshot-main"><span>現值</span><strong>${fmtMoney(currentValue)}</strong></div>
        <div class="mobile-snapshot-chip"><span>餘額</span><strong>${fmtMoney(metrics.cash)}</strong></div>
        <div class="mobile-snapshot-chip"><span>庫存</span><strong>${fmtNum(metrics.remainingShares)} 股</strong></div>
        <div class="mobile-snapshot-chip"><span>${inventoryValueLabel}</span><strong>${fmtMoney(valuation.inventoryValue)}</strong></div>
      </div>
      <div class="snapshot-grid">
        <div class="snapshot-card highlight">
          <span>目前現值</span>
          <strong>${fmtMoney(currentValue)}</strong>
          <small>${quoteHint}</small>
        </div>
        <div class="snapshot-card cash">
          <span>現金餘額</span>
          <strong>${fmtMoney(metrics.cash)}</strong>
          <small>可用資金 / 入出金後餘額</small>
        </div>
        <div class="snapshot-card inventory">
          <span>庫存</span>
          <strong>${fmtNum(metrics.remainingShares)} 股</strong>
          <small>${fmtNum(heldCount)} 檔股票</small>
        </div>
        <div class="snapshot-card market">
          <span>${inventoryValueLabel}</span>
          <strong>${fmtMoney(valuation.inventoryValue)}</strong>
          <small>${escapeHtml(quoteHint)}</small>
        </div>
      </div>
    </section>
  `;
}

function portfolioSnapshotValuation(lots) {
  return lots.reduce(
    (totals, lot) => {
      const valuation = inventoryLotValuation(lot);
      if (valuation.quote) {
        totals.hasQuotes = true;
        totals.quotedMarketValue += valuation.marketValue;
        totals.inventoryValue += valuation.marketValue;
      } else {
        totals.hasMissingQuotes = true;
        totals.fallbackCost += valuation.costBasis;
        totals.inventoryValue += valuation.costBasis;
      }
      return totals;
    },
    { hasQuotes: false, hasMissingQuotes: false, quotedMarketValue: 0, fallbackCost: 0, inventoryValue: 0 }
  );
}

function renderPortfolios() {
  const rows = userPortfolios().map((portfolio) => ({
    name: escapeHtml(portfolio.name),
    currency: escapeHtml(portfolio.baseCurrency),
    role: statusPill(memberRole(portfolio.id)),
    created: formatDateTime(portfolio.createdAt),
    actions: renderActions("portfolio", portfolio.id, portfolio.name)
  }));
  return `
    <section class="section">
      <div class="section-title"><div><h2>建立 Portfolio</h2><p>每個帳本可以有多券商、多股票</p></div></div>
      <form class="form-grid compact" data-form="portfolio-create">
        <div class="field"><label>名稱</label><input name="name" required placeholder="0050 策略帳本" /></div>
        <div class="field"><label>基準幣別</label><input name="baseCurrency" value="TWD" required /></div>
        <div class="field"><label>&nbsp;</label><button class="btn primary" type="submit">新增 Portfolio</button></div>
      </form>
    </section>
    <section class="section">
      <div class="section-title"><div><h2>Portfolio 清單</h2><p>User / Portfolio 資料隔離</p></div></div>
      ${renderTable(
        [
          ["name", "名稱"],
          ["currency", "幣別"],
          ["role", "角色"],
          ["created", "建立時間"],
          ["actions", "操作"]
        ],
        rows,
        "尚未建立 Portfolio"
      )}
    </section>
  `;
}

function renderBrokers() {
  const rows = state.brokers.map((broker) => ({
    code: escapeHtml(broker.code),
    name: escapeHtml(broker.name),
    country: escapeHtml(broker.country),
    currency: escapeHtml(broker.defaultCurrency),
    status: statusPill(broker.isActive ? "ACTIVE" : "INACTIVE"),
    actions: renderActions("broker", broker.id, broker.name)
  }));
  return `
    <section class="section">
      <div class="section-title"><div><h2>券商主檔</h2><p>匯入模板與帳戶會綁定券商</p></div></div>
      ${renderTable(
        [
          ["code", "代碼"],
          ["name", "券商"],
          ["country", "國家"],
          ["currency", "預設幣別"],
          ["status", "狀態"],
          ["actions", "操作"]
        ],
        rows,
        "尚無券商主檔"
      )}
    </section>
  `;
}

function renderBrokerAccounts() {
  const portfolioId = selectedPortfolioId();
  const accounts = state.brokerAccounts.filter((account) => account.portfolioId === portfolioId);
  return `
    <section class="section">
      <div class="section-title"><div><h2>新增券商帳戶</h2><p>同一股票在不同帳戶分開保存庫存與金流</p></div></div>
      <form class="form-grid" data-form="broker-account-create">
        <div class="field"><label>券商</label><select name="brokerId">${state.brokers.map((broker) => `<option value="${broker.id}">${escapeHtml(broker.name)}</option>`).join("")}</select></div>
        <div class="field"><label>帳戶名稱</label><input name="accountName" required placeholder="長期帳戶" /></div>
        <div class="field"><label>遮罩帳號</label><input name="accountNoMasked" placeholder="****1234" /></div>
        <div class="field"><label>分公司</label><input name="branchName" /></div>
        <div class="field"><label>幣別</label><input name="currency" value="TWD" required /></div>
        <div class="field"><label>預設帳戶</label><select name="isDefault"><option value="false">否</option><option value="true">是</option></select></div>
        <div class="field"><label>&nbsp;</label><button class="btn primary" type="submit">新增帳戶</button></div>
      </form>
    </section>
    <section class="section">
      <div class="section-title"><div><h2>券商帳戶</h2><p>Broker Account 層級隔離交易、對帳與庫存</p></div></div>
      ${renderTable(
        [
          ["broker", "券商"],
          ["account", "帳戶"],
          ["masked", "遮罩帳號"],
          ["currency", "幣別"],
          ["default", "預設"],
          ["active", "狀態"],
          ["actions", "操作"]
        ],
        accounts.map((account) => ({
          broker: escapeHtml(brokerName(account.brokerId)),
          account: escapeHtml(account.accountName),
          masked: escapeHtml(account.accountNoMasked || "-"),
          currency: escapeHtml(account.currency),
          default: account.isDefault ? "是" : "否",
          active: statusPill(account.isActive ? "ACTIVE" : "INACTIVE"),
          actions: renderActions("broker-account", account.id, account.accountName)
        })),
        "尚未建立券商帳戶"
      )}
    </section>
  `;
}

function renderImport() {
  const activeAccountId = selectedBrokerAccountId();
  const accounts = scopedBrokerAccounts().filter((account) => !activeAccountId || account.id === activeAccountId);
  const securities = state.securities;
  return `
    <section class="section">
      <div class="section-title"><div><h2>匯入資料</h2><p>JSON 管策略配對，券商 CSV 管實際金流</p></div></div>
      <form class="form-grid" data-form="import-file">
        <div class="field"><label>來源</label><select name="sourceType"><option value="JSON_LEDGER">JSON 策略交易</option><option value="BROKER_CSV">券商 CSV</option></select></div>
        <div class="field"><label>券商帳戶</label><select name="brokerAccountId" required>${accounts.map((account) => `<option value="${account.id}" ${account.id === activeAccountId ? "selected" : ""}>${escapeHtml(accountName(account.id))}</option>`).join("")}</select></div>
        <div class="field"><label>股票代號</label><input name="symbol" list="security-symbols" value="${escapeAttr(getPortfolioSettings().defaultSecurity)}" required /><small class="field-hint">備用預設值：若 CSV 某列無股票代碼才套用</small></div>
        <div class="field"><label>股票名稱</label><input name="securityName" value="元大台灣50" /><small class="field-hint">備用預設值</small></div>
        <div class="field full"><label>檔案</label><input type="file" name="importFile" accept=".json,.csv,text/csv,application/json" required /></div>
        <div class="field full">
          <div class="btn-row">
            <button class="btn primary" type="submit">匯入檔案</button>
            <button class="btn" type="button" data-action="load-sample-json">載入範例 JSON</button>
            <button class="btn" type="button" data-action="load-sample-csv">載入範例 CSV</button>
          </div>
        </div>
      </form>
      <datalist id="security-symbols">${securities.map((security) => `<option value="${escapeAttr(security.symbol)}">${escapeHtml(security.name)}</option>`).join("")}</datalist>
    </section>
    <section class="section">
      <div class="section-title"><div><h2>Import Batches</h2><p>保留 raw rows 與匯入狀態</p></div></div>
      ${renderImportBatches("ALL", "尚無匯入批次", selectedBrokerAccountId())}
    </section>
    <section class="section">
      <div class="section-title"><div><h2>交易日券商紀錄檢查</h2><p>同日、同帳戶、同股票、同買賣別比對股數與費稅</p></div></div>
      ${renderBrokerUploadChecklist(brokerUploadChecklist(selectedPortfolioId(), selectedBrokerAccountId()))}
    </section>
  `;
}

function renderImportTemplates() {
  const templates = state.importTemplates;
  return `
    <section class="section">
      <div class="section-title"><div><h2>新增匯入模板</h2><p>不同券商欄位可以各自映射</p></div></div>
      <form class="form-grid" data-form="template-create">
        <div class="field"><label>券商</label><select name="brokerId">${state.brokers.map((broker) => `<option value="${broker.id}">${escapeHtml(broker.name)}</option>`).join("")}</select></div>
        <div class="field"><label>模板名稱</label><input name="templateName" required /></div>
        <div class="field"><label>日期格式</label><input name="dateFormat" value="YYYY/MM/DD" /></div>
        <div class="field"><label>數字格式</label><input name="numberFormat" value="comma" /></div>
        <div class="field full"><label>欄位映射 JSON</label><textarea name="columnMapping">${escapeHtml(JSON.stringify(DEFAULT_TEMPLATE.columnMapping, null, 2))}</textarea></div>
        <div class="field full"><button class="btn primary" type="submit">新增模板</button></div>
      </form>
    </section>
    <section class="section">
      <div class="section-title"><div><h2>模板清單</h2><p>CSV header 偵測與欄位 mapping</p></div></div>
      ${renderTable(
        [
          ["broker", "券商"],
          ["name", "模板"],
          ["type", "檔案"],
          ["encoding", "編碼"],
          ["mapping", "欄位"],
          ["actions", "操作"]
        ],
        templates.map((template) => ({
          broker: escapeHtml(brokerName(template.brokerId)),
          name: escapeHtml(template.templateName),
          type: escapeHtml(template.fileType),
          encoding: escapeHtml(template.encoding),
          mapping: `<code>${escapeHtml(Object.keys(template.columnMapping || {}).join(", "))}</code>`,
          actions: renderActions("template", template.id, template.templateName)
        })),
        "尚未建立模板"
      )}
    </section>
  `;
}

function renderReconciliation() {
  const portfolioId = selectedPortfolioId();
  const brokerAccountId = selectedBrokerAccountId(portfolioId);
  const links = state.reconciliationLinks.filter((link) => link.portfolioId === portfolioId && (!brokerAccountId || link.brokerAccountId === brokerAccountId));
  const filteredLinks = filterReconciliationLinks(links);
  const visibleLinks = limitRows(filteredLinks, state.ui.reconciliationLimit);
  const counts = countBy(links, "matchStatus");
  const uploadChecklist = brokerUploadChecklist(portfolioId, brokerAccountId);
  const issueChecklist = uploadChecklist.filter((row) => !["BROKER_UPLOAD_READY", "BROKER_ACCEPTED"].includes(row.status));
  const pendingBrokerDiffs = confirmableBrokerDiffLinks(portfolioId, brokerAccountId);
  return `
    <section class="metric-grid">
      ${metricCard("完全匹配", fmtNum(counts.MATCHED || 0), "teal")}
      ${metricCard("待確認差異", fmtNum(pendingBrokerDiffs.length), "amber")}
      ${metricCard("缺漏", fmtNum((counts.MISSING_IN_APP || 0) + (counts.MISSING_IN_BROKER || 0)), "coral")}
      ${metricCard("待上傳", fmtNum(uploadChecklist.filter((row) => row.status === "MISSING_BROKER_UPLOAD").length), "blue")}
    </section>
    <section class="section">
      <div class="section-title">
        <div><h2>交易日券商紀錄檢查</h2><p>缺券商檔或費稅差異才列出</p></div>
        <button class="btn" data-route="/app/import">上傳券商紀錄</button>
      </div>
      ${renderBrokerUploadChecklist(issueChecklist)}
    </section>
    <section class="section">
      <div class="section-title">
        <div><h2>已匯入對帳報表</h2><p>傳錯檔可以刪除後重新上傳</p></div>
        <button class="btn" data-route="/app/import">匯入新檔</button>
      </div>
      ${renderImportBatches("BROKER_CSV", "目前沒有已匯入的券商對帳報表", selectedBrokerAccountId())}
    </section>
    <section class="section">
      <div class="section-title">
        <div><h2>對帳結果</h2><p>${fmtNum(visibleLinks.length)} / ${fmtNum(filteredLinks.length)} 筆</p></div>
        <div class="btn-row">
          ${pendingBrokerDiffs.length ? `<button class="btn primary" data-action="accept-broker-diffs">採用券商金額 ${fmtNum(pendingBrokerDiffs.length)}</button>` : ""}
          <button class="btn" data-action="run-reconciliation">重新對帳</button>
        </div>
      </div>
      <div class="filters mobile-filter-panel">
        <select id="reconciliation-status-filter">
          <option value="ISSUES" ${state.ui.reconciliationFilterStatus === "ISSUES" ? "selected" : ""}>只看異常</option>
          <option value="ALL" ${state.ui.reconciliationFilterStatus === "ALL" ? "selected" : ""}>全部狀態</option>
          <option value="MATCHED" ${state.ui.reconciliationFilterStatus === "MATCHED" ? "selected" : ""}>完全匹配</option>
          <option value="AUTO_GROUP_MATCHED" ${state.ui.reconciliationFilterStatus === "AUTO_GROUP_MATCHED" ? "selected" : ""}>群組匹配</option>
          <option value="FEE_TAX_DIFF" ${state.ui.reconciliationFilterStatus === "FEE_TAX_DIFF" ? "selected" : ""}>費稅差</option>
          <option value="AMOUNT_DIFF" ${state.ui.reconciliationFilterStatus === "AMOUNT_DIFF" ? "selected" : ""}>金額差</option>
          <option value="MISSING_IN_BROKER" ${state.ui.reconciliationFilterStatus === "MISSING_IN_BROKER" ? "selected" : ""}>券商缺漏</option>
          <option value="MISSING_IN_APP" ${state.ui.reconciliationFilterStatus === "MISSING_IN_APP" ? "selected" : ""}>APP 缺漏</option>
        </select>
        <select id="reconciliation-limit-filter">
          <option value="20" ${state.ui.reconciliationLimit === "20" ? "selected" : ""}>顯示 20 筆</option>
          <option value="40" ${state.ui.reconciliationLimit === "40" ? "selected" : ""}>顯示 40 筆</option>
          <option value="80" ${state.ui.reconciliationLimit === "80" ? "selected" : ""}>顯示 80 筆</option>
          <option value="ALL" ${state.ui.reconciliationLimit === "ALL" ? "selected" : ""}>顯示全部</option>
        </select>
      </div>
      ${renderTable(
        [["date", "日期"], ["side", "買/賣"], ["shares", "股數"], ["price", "價格"], ["security", "股票"], ["account", "券商帳戶"], ["status", "狀態"], ["diff", "淨額差異"]],
        visibleLinks.map((link) => ({
          date: link.tradeDate || "-",
          side: tradeTypeLabel(link.side || "-"),
          shares: fmtNum(link.allocatedShares || 0),
          price: link.price ? fmtPrice(link.price) : "-",
          security: escapeHtml(securityLabel(link.securityId)),
          account: escapeHtml(accountName(link.brokerAccountId)),
          status: reconciliationStatusPill(link),
          diff: fmtMoney(link.diffNetAmount || 0)
        })),
        state.ui.reconciliationFilterStatus === "ISSUES" ? "目前沒有需要處理的對帳異常" : "尚無對帳結果"
      )}
    </section>
  `;
}function renderTransactions() {
  const portfolioId = selectedPortfolioId();
  const brokerAccountId = selectedBrokerAccountId(portfolioId);
  const rows = scopedTransactions(portfolioId).filter((tx) => !brokerAccountId || tx.brokerAccountId === brokerAccountId).sort(sortByDateDesc);
  const accounts = scopedBrokerAccounts().filter((account) => !brokerAccountId || account.id === brokerAccountId);
  const activeAccountId = brokerAccountId;
  return `
    <section class="section">
      <div class="section-title">
        <div><h2>交易流水</h2><p>預設只顯示最近 30 筆，可用篩選縮小範圍</p></div>
      </div>
      <div class="transaction-filter-compact">
        <div class="transaction-search-wrap">
          <input id="transaction-search-filter" value="${escapeAttr(state.ui.transactionSearch || "")}" placeholder="搜尋股票 / 帳戶 / 備註" aria-label="搜尋交易" />
          <details class="transaction-filter-details">
            <summary aria-label="開啟交易篩選"><span class="filter-funnel-icon" aria-hidden="true"></span><b>${escapeHtml(transactionFilterSummary())}</b></summary>
          <div class="filters mobile-filter-panel compact-filter-grid">
            <select id="transaction-symbol-filter">
              <option value="ALL">全部股票</option>
              ${state.securities.map((security) => `<option value="${security.id}" ${state.ui.transactionFilterSymbol === security.id ? "selected" : ""}>${escapeHtml(security.symbol)}</option>`).join("")}
            </select>
            <select id="transaction-type-filter">
              <option value="ALL" ${state.ui.transactionFilterType === "ALL" ? "selected" : ""}>全部類型</option>
              <option value="BUY" ${state.ui.transactionFilterType === "BUY" ? "selected" : ""}>買進</option>
              <option value="SELL" ${state.ui.transactionFilterType === "SELL" ? "selected" : ""}>賣出</option>
              <option value="DEPOSIT" ${state.ui.transactionFilterType === "DEPOSIT" ? "selected" : ""}>入金</option>
              <option value="INTEREST" ${state.ui.transactionFilterType === "INTEREST" ? "selected" : ""}>存款利息</option>
              <option value="DIVIDEND" ${state.ui.transactionFilterType === "DIVIDEND" ? "selected" : ""}>股息</option>
              <option value="WITHDRAW" ${state.ui.transactionFilterType === "WITHDRAW" ? "selected" : ""}>出金</option>
            </select>
            <select id="transaction-status-filter">
              <option value="ALL" ${state.ui.transactionFilterStatus === "ALL" ? "selected" : ""}>全部對帳</option>
              <option value="ISSUES" ${state.ui.transactionFilterStatus === "ISSUES" ? "selected" : ""}>只看異常</option>
              <option value="MATCHED" ${state.ui.transactionFilterStatus === "MATCHED" ? "selected" : ""}>完全匹配</option>
              <option value="AUTO_GROUP_MATCHED" ${state.ui.transactionFilterStatus === "AUTO_GROUP_MATCHED" ? "selected" : ""}>群組匹配</option>
              <option value="BROKER_ACCEPTED" ${state.ui.transactionFilterStatus === "BROKER_ACCEPTED" ? "selected" : ""}>已採用券商</option>
              <option value="FEE_TAX_DIFF" ${state.ui.transactionFilterStatus === "FEE_TAX_DIFF" ? "selected" : ""}>費稅差</option>
              <option value="AMOUNT_DIFF" ${state.ui.transactionFilterStatus === "AMOUNT_DIFF" ? "selected" : ""}>金額差</option>
              <option value="UNMATCHED" ${state.ui.transactionFilterStatus === "UNMATCHED" ? "selected" : ""}>未對帳</option>
            </select>
            <label class="compact-date-field"><span>開始日期</span><input id="transaction-from-filter" type="date" value="${escapeAttr(state.ui.transactionFilterFrom || "")}" aria-label="開始日期" /></label>
            <label class="compact-date-field"><span>結束日期</span><input id="transaction-to-filter" type="date" value="${escapeAttr(state.ui.transactionFilterTo || "")}" aria-label="結束日期" /></label>
            <select id="transaction-limit-filter">
              <option value="30" ${state.ui.transactionLimit === "30" ? "selected" : ""}>顯示 30 筆</option>
              <option value="60" ${state.ui.transactionLimit === "60" ? "selected" : ""}>顯示 60 筆</option>
              <option value="100" ${state.ui.transactionLimit === "100" ? "selected" : ""}>顯示 100 筆</option>
              <option value="ALL" ${state.ui.transactionLimit === "ALL" ? "selected" : ""}>顯示全部</option>
            </select>
            <button class="btn primary compact-filter-action" data-action="apply-transaction-filters">套用</button>
            <button class="btn compact-filter-action" data-action="clear-transaction-filters">清除</button>
          </div>
          </details>
        </div>
      </div>
      ${renderTransactionsTable(rows)}
    </section>
  `;
}
function transactionFilterSummary() {
  const parts = [];
  const security = state.ui.transactionFilterSymbol && state.ui.transactionFilterSymbol !== "ALL" ? securityById(state.ui.transactionFilterSymbol) : null;
  if (security) parts.push(security.symbol);
  if (state.ui.transactionFilterType && state.ui.transactionFilterType !== "ALL") parts.push(tradeTypeLabel(state.ui.transactionFilterType));
  if (state.ui.transactionFilterStatus && state.ui.transactionFilterStatus !== "ALL") parts.push(state.ui.transactionFilterStatus === "ISSUES" ? "異常" : state.ui.transactionFilterStatus);
  if (state.ui.transactionFilterFrom || state.ui.transactionFilterTo) parts.push("日期");
  return parts.length ? parts.join(" · ") : "全部";
}

function getMatchesForSell(sell) {
  if (sell.borrowRebuyType === "BORROW_SELL") {
    const cycle = (state.borrowRebuyCycles || []).find((c) => c.sellTradeId === sell.id);
    if (!cycle) return [];
    return cycle.rebuyMatches.map((m) => ({
      buyDate: m.rebuyDate,
      buyPrice: m.rebuyPrice,
      matchedShares: m.rebuyQty,
      grossProfit: m.grossProfit,
      netProfit: m.netProfit,
      sellPrice: sell.price,
      sellDate: sell.tradeDate,
      isBorrowRebuy: true
    }));
  }
  return state.sellMatches.filter((match) => match.sellTransactionId === sell.id);
}

function renderMatching() {
  const brokerAccountId = selectedBrokerAccountId();
  const sells = scopedTransactions().filter((tx) => tx.transactionType === "SELL" && (!brokerAccountId || tx.brokerAccountId === brokerAccountId)).sort(sortByDateDesc);
  return `
    <section class="section">
      <div class="section-title"><div><h2>買賣配對</h2><p>先看買入/賣出主資訊，點開看費稅與配對細節，修改再重選配對順序</p></div></div>
      ${renderTable(
        [["type", "類型"], ["sell", "賣出"], ["buy", "買入 / 回補"], ["shares", "股數"], ["profit", "淨利"], ["detail", "詳細"]],
        sells.map((sell) => {
          const matches = getMatchesForSell(sell);
          const matchedShares = sum(matches, "matchedShares");
          const netProfit = sum(matches, "netProfit");
          return {
            type: `<span class="status info">${escapeHtml(sellTypeLabel(sellTypeForTransaction(sell)))}</span>`,
            sell: renderMatchSellSummary(sell),
            buy: renderMatchBuySummary(matches),
            shares: `<span class="match-shares-summary"><strong>${fmtNum(matchedShares)}</strong><small>/ ${fmtNum(sell.shares)}股</small></span>`,
            profit: `<strong class="${netProfit >= 0 ? "positive" : "negative"}">${fmtMoney(netProfit)}</strong>`,
            detail: renderMatchingDetails(sell, matches),
            _mobile: renderMatchingMobileRow(sell, matches, matchedShares, netProfit)
          };
        }),
        "尚無 SELL 交易"
      )}
    </section>
  `;
}

function renderMatchSellSummary(sell) {
  return `
    <div class="match-summary-block sell">
      <span>賣出</span>
      <strong>${escapeHtml(compactDate(sell.tradeDate))} @ ${fmtPrice(sell.price)}</strong>
      <small>${escapeHtml(securityLabel(sell.securityId))}</small>
    </div>
  `;
}

function renderMatchBuySummary(matches) {
  if (!matches.length) return `<div class="match-summary-block empty"><span>買入</span><strong>未配對</strong><small>點擊詳細修改</small></div>`;
  const ordered = [...matches].sort((a, b) => String(a.buyDate || "").localeCompare(String(b.buyDate || "")));
  const first = ordered[0];
  return `
    <div class="match-summary-block buy">
      <span>買入</span>
      <strong>@ ${fmtPrice(first.buyPrice)}${ordered.length > 1 ? ` +${ordered.length - 1}` : ""}</strong>
      <small>${fmtNum(sum(ordered, "matchedShares"))}股</small>
    </div>
  `;
}

function matchBuySummaryText(matches) {
  if (!matches.length) return "未配對";
  const ordered = [...matches].sort((a, b) => String(a.buyDate || "").localeCompare(String(b.buyDate || "")));
  const first = ordered[0];
  return ordered.length === 1 ? `@${fmtPrice(first.buyPrice)}` : `${ordered.length}筆 @${fmtPrice(first.buyPrice)}起`;
}

function renderMatchingMobileRow(sell, matches, matchedShares, netProfit) {
  const open = state.ui.expandedMatchSellId === sell.id || state.ui.editingMatchSellId === sell.id;
  return `
    <details class="mobile-transaction-row mobile-table-row match-mobile-row match-card" ${open ? "open" : ""}>
      <summary>
        <span class="match-profit-hero"><small>淨利</small><strong class="${netProfit >= 0 ? "positive" : "negative"}">${fmtMoney(netProfit)}</strong></span>
        <span class="match-side-card buy"><small>買進</small><strong>${escapeHtml(matchBuySummaryText(matches))}</strong></span>
        <span class="match-side-card sell"><small>${escapeHtml(sellTypeLabel(sellTypeForTransaction(sell)))}</small><strong>@ ${fmtPrice(sell.price)}</strong></span>
        <span class="match-shares-card"><small>股數</small><strong>${fmtNum(matchedShares)} / ${fmtNum(sell.shares)}</strong></span>
      </summary>
      <div class="mobile-transaction-detail match-detail-mobile">
        ${renderMatchingDetailContent(sell, matches)}
      </div>
    </details>
  `;
}
function renderMatchingDetails(sell, matches) {
  const open = state.ui.expandedMatchSellId === sell.id || state.ui.editingMatchSellId === sell.id;
  return `
    <details class="match-row-detail" ${open ? "open" : ""}>
      <summary>查看/修改</summary>
      <div class="match-detail-card">${renderMatchingDetailContent(sell, matches)}</div>
    </details>
  `;
}

function renderMatchingDetailContent(sell, matches) {
  const amounts = effectiveTransactionAmounts(sell);
  const matchedShares = sum(matches, "matchedShares");
  const netProfit = sum(matches, "netProfit");
  const editing = state.ui.editingMatchSellId === sell.id;
  
  let actionsHtml = "";
  if (sell.borrowRebuyType === "BORROW_SELL") {
    actionsHtml = `<div class="match-detail-actions"><small class="field-hint">借券放空交易係由「回補買進單」自動配對，不可手動修改配對。</small></div>`;
  } else if (editing) {
    actionsHtml = renderMatchControl(sell);
  } else {
    actionsHtml = `<div class="match-detail-actions"><button class="btn primary" data-action="edit-match" data-sell-id="${escapeAttr(sell.id)}">修改配對</button></div>`;
  }

  return `
    <div class="match-detail-grid">
      <div><span>股票</span><strong>${escapeHtml(securityLabel(sell.securityId))}</strong></div>
      <div><span>券商帳戶</span><strong>${escapeHtml(accountName(sell.brokerAccountId))}</strong></div>
      <div><span>賣出日期</span><strong>${escapeHtml(sell.tradeDate)}</strong></div>
      <div><span>賣出類型</span><strong>${escapeHtml(sellTypeLabel(sellTypeForTransaction(sell)))}</strong></div>
      <div><span>賣出價</span><strong>${fmtPrice(sell.price)}</strong></div>
      <div><span>賣出股數</span><strong>${fmtNum(sell.shares)}</strong></div>
      <div><span>已配股數</span><strong>${fmtNum(matchedShares)}</strong></div>
      <div><span>手續費</span><strong>${fmtMoney(amounts.fee)}</strong></div>
      <div><span>交易稅</span><strong>${fmtMoney(amounts.tax)}</strong></div>
      <div><span>淨利</span><strong class="${netProfit >= 0 ? "positive" : "negative"}">${fmtMoney(netProfit)}</strong></div>
    </div>
    ${renderMatchedBuyLots(matches)}
    ${actionsHtml}
  `;
}

function renderMatchedBuyLots(matches) {
  if (!matches.length) return `<div class="match-detail-empty">尚未配對買入 lot</div>`;
  return `
    <div class="match-detail-lots">
      ${matches.map((match) => `
        <div class="match-detail-lot">
          <span class="match-detail-price">@ ${fmtPrice(match.buyPrice)}</span>
          <span>${escapeHtml(match.buyDate)}</span>
          <strong>${fmtNum(match.matchedShares)}股</strong>
          <small>淨利 ${fmtMoney(match.netProfit)}</small>
        </div>
      `).join("")}
    </div>
  `;
}
function renderRebuy() {
  const brokerAccountId = selectedBrokerAccountId();
  const tasks = state.rebuyTasks.filter((task) => task.portfolioId === selectedPortfolioId() && (!brokerAccountId || task.brokerAccountId === brokerAccountId)).sort(sortBySellDateDesc);
  const activeTasks = groupRebuyTasksForDisplay(tasks.filter((task) => !rebuyTaskIsArchived(task)));
  const archivedTasks = groupRebuyTasksForDisplay(tasks.filter(rebuyTaskIsArchived));
  return `
    <section class="section">
      <div class="section-title"><div><h2>回補清單</h2><p>只放還需要處理的回補，完成後會自動移到下方封存</p></div></div>
      ${renderRebuyTaskTable(activeTasks, "目前沒有待回補任務")}
    </section>
    <section class="section archive-section">
      <details class="archive-details">
        <summary><span>封存回補</span><strong>${fmtNum(archivedTasks.length)} 筆</strong></summary>
        <div class="archive-content">${renderRebuyTaskTable(archivedTasks, "尚無封存回補")}</div>
      </details>
    </section>
  `;
}

function rebuyTaskIsArchived(task) {
  return ["CLOSED", "MANUAL_CLOSED"].includes(task.status) || toNumber(task.remainingRebuyShares) <= 0;
}

function rebuyTaskSideLabel(task) {
  if (task.status === "MANUAL_CLOSED") return "手動關閉";
  if (rebuyTaskIsArchived(task)) return "已回補";
  return "回補";
}

function groupRebuyTasksForDisplay(tasks) {
  const grouped = new Map();
  for (const task of tasks) {
    const key = [
      task.portfolioId,
      task.brokerAccountId,
      task.securityId,
      fmtPrice(task.targetRebuyPrice)
    ].join("|");
    if (!grouped.has(key)) {
      grouped.set(key, {
        ...task,
        sellIds: [],
        taskIds: [],
        sellDates: [],
        taskCount: 0,
        sellShares: 0,
        remainingRebuyShares: 0,
        filledShares: 0,
        sellPrices: [],
        statuses: []
      });
    }
    const group = grouped.get(key);
    group.sellIds.push(task.sellTransactionId);
    group.taskIds.push(task.id);
    group.sellDates.push(task.sellDate);
    group.taskCount += 1;
    group.sellShares += toNumber(task.sellShares);
    group.remainingRebuyShares += toNumber(task.remainingRebuyShares);
    group.filledShares += Math.max(toNumber(task.sellShares) - toNumber(task.remainingRebuyShares), 0);
    group.sellPrices.push(toNumber(task.sellPrice));
    group.statuses.push(task.status);
  }
  return Array.from(grouped.values())
    .map((group) => {
      const dates = Array.from(new Set(group.sellDates.filter(Boolean))).sort();
      const prices = Array.from(new Set(group.sellPrices.filter((price) => price > 0).map((price) => fmtPrice(price))));
      return {
        ...group,
        sellDate: dates.length <= 1 ? dates[0] || "" : `${dates[0]}~${dates[dates.length - 1]}`,
        sellPriceLabel: prices.length <= 1 ? prices[0] || "-" : `${prices[0]}~${prices[prices.length - 1]}`,
        status: rebuyGroupStatus(group),
        originalTaskCount: group.taskCount
      };
    })
    .sort(sortByRebuyTargetDesc);
}

function rebuyGroupStatus(group) {
  if (group.remainingRebuyShares <= 0) {
    return group.statuses.every((status) => status === "MANUAL_CLOSED") ? "MANUAL_CLOSED" : "CLOSED";
  }
  if (group.filledShares > 0 || group.statuses.includes("PARTIAL_FILLED")) return "PARTIAL_FILLED";
  return "OPEN";
}

function renderRebuyTaskTable(tasks, emptyText) {
  return renderTable(
    [
      ["target", "提醒價"],
      ["shares", "待回補"],
      ["security", "股票"],
      ["sellDate", "賣出日"],
      ["sellPrice", "賣出價"],
      ["original", "原賣出"],
      ["filled", "已回補"],
      ["fills", "回補來源與明細"],
      ["brokerPnL", "券商帳務損益"],
      ["benefit", "策略回補效益"],
      ["status", "狀態"],
      ["action", "操作"]
    ],
    tasks.map((task) => {
      const taskIds = task.taskIds || [task.id];
      const taskFills = state.rebuyFills.filter((fill) => taskIds.includes(fill.rebuyTaskId));
      const rebuyBenefit = taskFills.reduce((total, fill) => total + (toNumber(task.sellPrice) - toNumber(fill.fillPrice)) * toNumber(fill.filledShares), 0);

      const currentMatches = state.sellMatches.filter((match) => match.sellTransactionId === task.sellTransactionId);
      const brokerPnL = currentMatches.reduce((total, match) => total + toNumber(match.netProfit), 0);

      const totalFilledShares = taskFills.reduce((total, fill) => total + toNumber(fill.filledShares), 0);
      const improvePerShare = task.sellShares > 0 ? rebuyBenefit / task.sellShares : 0;

      return {
        sellDate: task.sellDate,
        shares: fmtNum(task.remainingRebuyShares),
        target: fmtPrice(task.targetRebuyPrice),
        security: escapeHtml(securityLabel(task.securityId)),
        sellPrice: task.sellPriceLabel || fmtPrice(task.sellPrice),
        original: fmtNum(task.sellShares),
        filled: fmtNum(task.filledShares ?? (task.sellShares - task.remainingRebuyShares)),
        fills: renderRebuyFillSummary(task),
        brokerPnL: currentMatches.length > 0
          ? `<span class="${brokerPnL >= 0 ? "positive" : "negative"}">${brokerPnL >= 0 ? "+" : ""}${fmtMoney(brokerPnL)}</span>`
          : `<span class="muted-text">-</span>`,
        benefit: totalFilledShares > 0
          ? `<strong class="positive">+${fmtMoney(rebuyBenefit)}</strong><br><small class="muted-text">降成本: +${improvePerShare.toFixed(2)}元/股</small>`
          : `<span class="muted-text">-</span>`,
        status: statusPill(task.status),
        _mobile: renderRebuyTaskMobileRow(task, brokerPnL, rebuyBenefit, improvePerShare),
        action: rebuyTaskIsArchived(task)
          ? "-"
          : `<div class="btn-row"><button class="btn blue" data-action="quick-rebuy-task" data-sell-ids="${escapeAttr((task.sellIds || [task.sellTransactionId]).join(","))}">補回</button><button class="btn" data-action="manual-close-rebuy-group" data-sell-ids="${escapeAttr((task.sellIds || [task.sellTransactionId]).join(","))}">手動關閉</button></div>`
      };
    }),
    emptyText
  );
}

function renderRebuyTaskMobileRow(task, brokerPnL, rebuyBenefit, improvePerShare) {
  const hasFills = (task.filledShares ?? (task.sellShares - task.remainingRebuyShares)) > 0;
  return `
    <details class="mobile-transaction-row mobile-table-row rebuy-task-card">
      <summary>
        <span class="rebuy-price-pill"><small>提醒價</small><strong>@ ${fmtPrice(task.targetRebuyPrice)}</strong></span>
        <span class="rebuy-shares"><small>待回補</small><strong>${fmtNum(task.remainingRebuyShares)}股</strong></span>
        <span class="rebuy-symbol"><small>股票</small><strong>${escapeHtml(securityLabel(task.securityId))}</strong></span>
        <span class="rebuy-date"><small>賣出日</small><strong>${escapeHtml(task.sellDate)}</strong></span>
      </summary>
      <div class="mobile-transaction-detail rebuy-task-detail">
        <div><span>狀態</span><strong>${statusPill(task.status)}</strong></div>
        <div><span>賣出價</span><strong>${escapeHtml(task.sellPriceLabel || fmtPrice(task.sellPrice))}</strong></div>
        <div><span>原賣出</span><strong>${fmtNum(task.sellShares)}股</strong></div>
        <div><span>已回補</span><strong>${fmtNum(task.filledShares ?? (task.sellShares - task.remainingRebuyShares))}股</strong></div>
        <div><span>券商帳戶</span><strong>${escapeHtml(accountName(task.brokerAccountId))}</strong></div>
        <div><span>券商帳務損益</span><strong class="${brokerPnL >= 0 ? "positive" : "negative"}">${brokerPnL >= 0 ? "+" : ""}${fmtMoney(brokerPnL)}</strong></div>
        <div><span>策略回補效益</span><strong class="positive">${hasFills ? `+${fmtMoney(rebuyBenefit)}` : "-"}</strong></div>
        <div><span>降成本改善</span><strong class="positive">${hasFills ? `+${improvePerShare.toFixed(2)} 元 / 股` : "-"}</strong></div>
        <div class="detail-action"><span>操作</span>${rebuyTaskIsArchived(task) ? "-" : `<div class="btn-row"><button class="btn blue" data-action="quick-rebuy-task" data-sell-ids="${escapeAttr((task.sellIds || [task.sellTransactionId]).join(","))}">補回</button><button class="btn" data-action="manual-close-rebuy-group" data-sell-ids="${escapeAttr((task.sellIds || [task.sellTransactionId]).join(","))}">手動關閉</button></div>`}</div>
      </div>
    </details>
  `;
}
function renderRebuyFillSummary(task) {
  const taskIds = task.taskIds || [task.id];
  const fills = state.rebuyFills.filter((fill) => taskIds.includes(fill.rebuyTaskId));
  if (!fills.length) return `<span class="muted-text">尚未找到回補買進來源</span>`;
  return `
    <div class="rebuy-fill-list">
      ${fills.map((fill) => {
        const buy = state.appTransactions.find((tx) => tx.id === fill.buyTransactionId);
        const source = buy ? `${buy.tradeDate} ${securityLabel(buy.securityId)} ${fmtNum(fill.filledShares)}股 @ ${fmtPrice(fill.fillPrice)}` : `${fill.fillDate} ${fmtNum(fill.filledShares)}股 @ ${fmtPrice(fill.fillPrice)}`;
        const note = buy?.note ? `<small>${escapeHtml(buy.note)}</small>` : `<small>規則：買進日 >= 賣出日，且買價 <= 提醒價</small>`;
        return `<div class="rebuy-fill-item"><strong>${escapeHtml(source)}</strong>${note}</div>`;
      }).join("")}
    </div>
  `;
}
function renderInventory() {
  const accountFilter = selectedBrokerAccountId();
  const lots = filterInventoryLots(state.buyLots.filter((lot) => lot.portfolioId === selectedPortfolioId())).sort(sortInventoryLotsByPriceDesc);
  return `
    ${renderPortfolioSnapshot(selectedPortfolioId(), accountFilter, "inventory")}
    <section class="section">
      <div class="section-title">
        <div><h2>目前庫存</h2><p>依帳戶顯示目前持股</p></div>
      </div>
      <div class="filters mobile-filter-panel">

        <select id="inventory-symbol-filter">
          <option value="ALL">全部股票</option>
          ${state.securities.map((security) => `<option value="${security.id}" ${state.ui.inventoryFilterSymbol === security.id ? "selected" : ""}>${escapeHtml(security.symbol)} ${escapeHtml(security.name)}</option>`).join("")}
        </select>
      </div>
      ${renderTable(
        [
          ["security", "股票"],
          ["remaining", "剩餘股數"],
          ["price", "成本價"],
          ["quote", "現價"],
          ["market", "市值"],
          ["unrealized", "未實現"],
          ["date", "買進日"],
          ["source", "來源"],
          ["quoteTime", "現價時間"],
          ["account", "券商帳戶"],
          ["original", "原始股數"],
          ["sold", "已賣出"],
          ["category", "分類"],
          ["status", "狀態"],
          ["actions", "操作"]
        ],
        lots.map((lot) => {
          const valuation = inventoryLotValuation(lot);
          return {
            security: escapeHtml(securityLabel(lot.securityId)),
            remaining: fmtNum(lot.remainingShares),
            price: fmtPrice(lot.buyPrice),
            quote: valuation.quote ? fmtPrice(valuation.quote.price) : "-",
            market: valuation.quote ? fmtMoney(valuation.marketValue) : "-",
            unrealized: valuation.quote ? fmtMoney(valuation.unrealized) : "-",
            date: lot.buyDate,
            source: escapeHtml(inventorySourceLabel(lot)),
            quoteTime: valuation.quote ? formatDateTime(valuation.quote.quoteTime) : "-",
            account: escapeHtml(accountName(lot.brokerAccountId)),
            original: fmtNum(lot.originalShares),
            sold: fmtNum(lot.originalShares - lot.remainingShares),
            category: escapeHtml(lot.strategyCategory || "-"),
            status: statusPill(lot.status),
            actions: lot.remainingShares > 0 ? renderInventoryLotActions(lot) : "-",
            _mobile: renderInventoryLotMobileRow(lot, valuation)
          };
        }),
        "尚無買進 lot"
      )}
    </section>
  `;
}

function renderInventoryLotMobileRow(lot, valuation) {
  const security = securityById(lot.securityId);
  const symbol = security?.symbol || securityLabel(lot.securityId).split(" ")[0] || "-";
  const name = security?.name || securityLabel(lot.securityId).replace(symbol, "").trim() || "-";
  const unrealized = valuation.quote ? valuation.unrealized : 0;
  const source = inventorySourceLabel(lot);
  return `
    <details class="mobile-transaction-row mobile-table-row inventory-lot-card">
      <summary>
        <span class="lot-name"><strong>${escapeHtml(symbol)}</strong><small>${escapeHtml(name)}</small></span>
        <span class="lot-stat"><small>剩餘</small><strong>${fmtNum(lot.remainingShares)}</strong></span>
        <span class="lot-stat"><small>成本</small><strong>${fmtPrice(lot.buyPrice)}</strong></span>
        <span class="lot-stat"><small>現價</small><strong>${valuation.quote ? fmtPrice(valuation.quote.price) : "-"}</strong></span>
        <span class="lot-status">${statusPill(lot.status)}</span>
      </summary>
      <div class="mobile-transaction-detail inventory-lot-detail">
        <div><span>市值</span><strong>${valuation.quote ? fmtMoney(valuation.marketValue) : "-"}</strong></div>
        <div><span>未實現</span><strong class="${unrealized >= 0 ? "positive" : "negative"}">${valuation.quote ? fmtMoney(unrealized) : "-"}</strong></div>
        <div><span>買進日</span><strong>${escapeHtml(lot.buyDate)}</strong></div>
        <div><span>券商帳戶</span><strong>${escapeHtml(accountName(lot.brokerAccountId))}</strong></div>
        <div><span>原始股數</span><strong>${fmtNum(lot.originalShares)}</strong></div>
        <div><span>已賣出</span><strong>${fmtNum(lot.originalShares - lot.remainingShares)}</strong></div>
        <div><span>來源</span><strong title="${escapeAttr(source)}">${escapeHtml(shortSourceLabel(source))}</strong></div>
        <div class="detail-action"><span>操作</span>${lot.remainingShares > 0 ? renderInventoryLotActions(lot) : "-"}</div>
      </div>
    </details>
  `;
}

function shortSourceLabel(source) {
  const text = String(source || "-");
  if (text.includes("券商匯入") || text.includes("BROKER")) return "券商匯入";
  if (text.includes("JSON")) return "JSON匯入";
  if (text.includes("手動")) return "手動新增";
  return text.length > 18 ? `${text.slice(0, 18)}...` : text;
}
function inventorySourceLabel(lot) {
  const tx = state.appTransactions.find((item) => item.id === lot.buyTransactionId || item.sourceTransactionId === lot.sourceTransactionId);
  if (!tx) return "來源不明";
  const batch = tx.importBatchId ? state.importBatches.find((item) => item.id === tx.importBatchId) : null;
  if (batch) return `${tradeSourceLabel(tx.sourceType)} / ${batch.sourceFilename} / ${formatDateTime(batch.importedAt)}`;
  return tradeSourceLabel(tx.sourceType);
}

function tradeSourceLabel(sourceType) {
  const labels = { MANUAL: "手動新增", JSON_IMPORT: "JSON匯入", BROKER_IMPORT: "券商匯入" };
  return labels[sourceType] || sourceType || "來源不明";
}
function renderInventoryLotActions(lot) {
  return `
    <div class="btn-row lot-actions">
      <button class="btn warn" data-action="sell-lot" data-buy-id="${escapeAttr(lot.buyTransactionId)}">賣出</button>
      <button class="btn" data-action="edit-transaction" data-id="${escapeAttr(lot.buyTransactionId)}">編輯</button>
      <button class="btn danger" data-action="delete-transaction" data-id="${escapeAttr(lot.buyTransactionId)}">刪除買進</button>
    </div>
  `;
}
function renderInventoryAccountBreakdown(accounts) {
  const portfolioId = selectedPortfolioId();
  const symbolFilter = state.ui.inventoryFilterSymbol || "ALL";
  const rows = accounts.map((account) => {
    const accountLots = state.buyLots.filter((lot) =>
      lot.portfolioId === portfolioId &&
      lot.brokerAccountId === account.id &&
      lot.remainingShares > 0 &&
      (symbolFilter === "ALL" || lot.securityId === symbolFilter)
    );
    const accountRebuy = state.rebuyTasks.filter((task) =>
      task.portfolioId === portfolioId &&
      task.brokerAccountId === account.id &&
      ["OPEN", "PARTIAL_FILLED"].includes(task.status) &&
      (symbolFilter === "ALL" || task.securityId === symbolFilter)
    );
    return {
      account: escapeHtml(accountName(account.id)),
      cash: fmtMoney(cashBalance(portfolioId, account.id)),
      shares: fmtNum(sum(accountLots, "remainingShares")),
      rebuy: fmtNum(sum(accountRebuy, "remainingRebuyShares"))
    };
  });
  return `
    <div class="inventory-account-breakdown">
      <div class="list-summary"><strong>帳戶分帳</strong><span>現金、庫存、回補分開計算</span></div>
      ${renderTable(
        [["account", "券商帳戶"], ["cash", "現金餘額"], ["shares", "持股"], ["rebuy", "待回補"]],
        rows,
        "尚未建立券商帳戶"
      )}
    </div>
  `;
}
function renderQuoteSyncPanel(securities) {
  if (!securities.length) return "";
  return `
    <details class="quote-sync-panel" id="quote-sync-panel">
      <summary>同步現價</summary>
      <form class="quote-sync-form" data-form="quote-sync">
        <div class="quote-fields">
          ${securities
            .map((security) => {
              const quote = latestQuoteForSecurity(security.id);
              return `
                <div class="field">
                  <label>${escapeHtml(security.symbol)} ${escapeHtml(security.name || "")}</label>
                  <input type="number" step="0.01" inputmode="decimal" name="quote__${escapeAttr(security.id)}" value="${quote ? escapeAttr(quote.price) : ""}" placeholder="現價" />
                </div>
              `;
            })
            .join("")}
        </div>
        <div class="btn-row">
          <button class="btn blue" type="button" data-action="sync-yahoo-quotes">抓 Yahoo</button>
          <button class="btn primary" type="submit">儲存現價</button>
        </div>
      </form>
    </details>
  `;
}

function filterInventoryLots(lots) {
  const accountFilter = selectedBrokerAccountId();
  const symbolFilter = state.ui.inventoryFilterSymbol || "ALL";
  return lots.filter((lot) => {
    if (lot.remainingShares <= 0) return false;
    if (accountFilter !== "ALL" && lot.brokerAccountId !== accountFilter) return false;
    if (symbolFilter !== "ALL" && lot.securityId !== symbolFilter) return false;
    return true;
  });
}

function heldSecuritiesForLots(lots) {
  const ids = Array.from(new Set(lots.map((lot) => lot.securityId).filter(Boolean)));
  return ids
    .map((id) => securityById(id))
    .filter(Boolean)
    .sort((a, b) => String(a.symbol || "").localeCompare(String(b.symbol || "")));
}

function latestQuoteForSecurity(securityId, portfolioId = selectedPortfolioId()) {
  return (state.marketQuotes || [])
    .filter((quote) => quote.portfolioId === portfolioId && quote.securityId === securityId)
    .sort((a, b) => String(b.quoteTime || "").localeCompare(String(a.quoteTime || "")))[0] || null;
}

function inventoryLotValuation(lot) {
  const quote = latestQuoteForSecurity(lot.securityId, lot.portfolioId);
  const marketValue = quote ? roundMoney(toNumber(quote.price) * toNumber(lot.remainingShares)) : 0;
  const costBasis = remainingCostBasis(lot);
  return {
    quote,
    marketValue,
    costBasis,
    unrealized: roundMoney(marketValue - costBasis)
  };
}

function inventoryQuoteMetrics(lots) {
  return lots.reduce(
    (totals, lot) => {
      const valuation = inventoryLotValuation(lot);
      if (valuation.quote) {
        totals.hasQuotes = true;
        totals.marketValue += valuation.marketValue;
        totals.unrealized += valuation.unrealized;
      }
      return totals;
    },
    { hasQuotes: false, marketValue: 0, unrealized: 0 }
  );
}

function remainingCostBasis(lot) {
  const originalShares = Math.max(toNumber(lot.originalShares), 1);
  const basis = toNumber(lot.costBasisNet || lot.costBasisGross || lot.buyPrice * lot.originalShares);
  return roundMoney(basis * (toNumber(lot.remainingShares) / originalShares));
}

function quoteRecordIdFor(portfolioId, securityId) {
  return `quote-${portfolioId}-${securityId}`;
}
function renderCashTransfers() {
  const activeAccountId = selectedBrokerAccountId();
  const accounts = scopedBrokerAccounts();
  return `
    <section class="section">
      <div class="section-title"><div><h2>現金轉帳</h2><p>券商交割戶間移動不重複算入本金</p></div></div>
      <form class="form-grid" data-form="cash-transfer">
        <div class="field"><label>轉出帳戶</label><select name="fromBrokerAccountId">${accounts.map((account) => `<option value="${account.id}" ${account.id === activeAccountId ? "selected" : ""}>${escapeHtml(accountName(account.id))}</option>`).join("")}</select></div>
        <div class="field"><label>轉入帳戶</label><select name="toBrokerAccountId">${accounts.map((account) => `<option value="${account.id}">${escapeHtml(accountName(account.id))}</option>`).join("")}</select></div>
        <div class="field"><label>日期</label><input type="date" name="transferDate" value="${today()}" required /></div>
        <div class="field"><label>金額</label><input type="number" step="1" name="amount" required /></div>
        <div class="field"><label>費用</label><input type="number" step="1" name="fee" value="0" /></div>
        <div class="field"><label>備註</label><input name="note" /></div>
        <div class="field"><label>&nbsp;</label><button class="btn primary" type="submit">新增轉帳</button></div>
      </form>
    </section>
    <section class="section">
      ${renderTable(
        [
          ["date", "日期"],
          ["from", "轉出"],
          ["to", "轉入"],
          ["amount", "金額"],
          ["fee", "費用"],
          ["note", "備註"],
          ["actions", "操作"]
        ],
        state.accountTransfers.filter((item) => item.portfolioId === selectedPortfolioId() && (!activeAccountId || item.fromBrokerAccountId === activeAccountId || item.toBrokerAccountId === activeAccountId)).map((item) => ({
          date: item.transferDate,
          from: escapeHtml(accountName(item.fromBrokerAccountId)),
          to: escapeHtml(accountName(item.toBrokerAccountId)),
          amount: fmtMoney(item.amount),
          fee: fmtMoney(item.fee),
          note: escapeHtml(item.note || "-"),
          actions: renderActions("cash-transfer", item.id, `${item.transferDate} ${fmtMoney(item.amount)}`)
        })),
        "尚無現金轉帳"
      )}
    </section>
  `;
}function renderPositionTransfers() {
  const activeAccountId = selectedBrokerAccountId();
  const accounts = scopedBrokerAccounts();
  return `
    <section class="section">
      <div class="section-title"><div><h2>股票轉戶</h2><p>跨券商配對前需保留原始成本 basis</p></div></div>
      <form class="form-grid" data-form="position-transfer">
        <div class="field"><label>股票代號</label><input name="symbol" value="${escapeAttr(getPortfolioSettings().defaultSecurity)}" required /></div>
        <div class="field"><label>股票名稱</label><input name="securityName" value="元大台灣50" /></div>
        <div class="field"><label>轉出帳戶</label><select name="fromBrokerAccountId">${accounts.map((account) => `<option value="${account.id}" ${account.id === activeAccountId ? "selected" : ""}>${escapeHtml(accountName(account.id))}</option>`).join("")}</select></div>
        <div class="field"><label>轉入帳戶</label><select name="toBrokerAccountId">${accounts.map((account) => `<option value="${account.id}">${escapeHtml(accountName(account.id))}</option>`).join("")}</select></div>
        <div class="field"><label>日期</label><input type="date" name="transferDate" value="${today()}" required /></div>
        <div class="field"><label>股數</label><input type="number" step="1" name="shares" required /></div>
        <div class="field"><label>原始成本</label><input type="number" step="0.01" name="originalCostBasis" required /></div>
        <div class="field"><label>備註</label><input name="note" /></div>
        <div class="field"><label>&nbsp;</label><button class="btn primary" type="submit">新增轉戶</button></div>
      </form>
    </section>
    <section class="section">
      ${renderTable(
        [
          ["date", "日期"],
          ["security", "股票"],
          ["from", "轉出"],
          ["to", "轉入"],
          ["shares", "股數"],
          ["basis", "成本 basis"],
          ["note", "備註"],
          ["actions", "操作"]
        ],
        state.positionTransfers.filter((item) => item.portfolioId === selectedPortfolioId() && (!activeAccountId || item.fromBrokerAccountId === activeAccountId || item.toBrokerAccountId === activeAccountId)).map((item) => ({
          date: item.transferDate,
          security: escapeHtml(securityLabel(item.securityId)),
          from: escapeHtml(accountName(item.fromBrokerAccountId)),
          to: escapeHtml(accountName(item.toBrokerAccountId)),
          shares: fmtNum(item.shares),
          basis: fmtMoney(item.originalCostBasis),
          note: escapeHtml(item.note || "-"),
          actions: renderActions("position-transfer", item.id, `${item.transferDate} ${securityLabel(item.securityId)} ${fmtNum(item.shares)}股`)
        })),
        "尚無股票轉戶"
      )}
    </section>
  `;
}function renderReports() {
  const currentReport = reportPresetKey();
  return `
    <section class="section">
      <div class="split-toolbar">
        <div class="section-title" style="margin-bottom:0">
          <div>
            <h2>專業投資報表</h2>
            <p>從 0050 等效基準延伸到損益、庫存風險、現金流與交易品質，快速檢查策略是否真的改善資產效率。</p>
          </div>
        </div>
      </div>
      <div class="report-period-tabs report-module-tabs" role="tablist" aria-label="報表類型">
        ${reportPresets().map((item) => `<button type="button" class="${item.id === currentReport ? "active" : ""}" data-action="set-report-preset" data-report="${escapeAttr(item.id)}" role="tab" aria-selected="${item.id === currentReport ? "true" : "false"}">${escapeHtml(item.label)}</button>`).join("")}
      </div>
      <div class="filters report-export-actions" aria-label="報表匯出動作">
        <button class="btn blue" data-action="export-pdf-report">匯出 PDF</button>
        <button class="btn" data-action="email-report-summary">Email 摘要</button>
        <button class="btn primary" data-action="export-xls">匯出 Excel</button>
      </div>
    </section>
    ${renderSelectedReportSection(currentReport)}
  `;
}

function reportPresets() {
  return [
    { id: "overview", label: "總覽" },
    { id: "benchmark0050", label: "0050 基準" },
    { id: "pnl", label: "損益" },
    { id: "inventoryRisk", label: "庫存風險" },
    { id: "cashflow", label: "現金流" },
    { id: "tradeQuality", label: "交易品質" }
  ];
}

function reportPresetKey() {
  const selected = state.ui.report || "overview";
  return reportPresets().some((item) => item.id === selected) ? selected : "overview";
}

function renderSelectedReportSection(reportType = reportPresetKey()) {
  try {
    if (reportType === "benchmark0050") return `${renderReportSummaryCards()}${render0050PerformanceReport()}`;
    const model = buildPdfReportModel(selectedPortfolioId(), reportBrokerAccountId());
    if (reportType === "pnl") return renderPnlReport(model);
    if (reportType === "inventoryRisk") return renderInventoryRiskReport(model);
    if (reportType === "cashflow") return renderCashflowReport(model);
    if (reportType === "tradeQuality") return renderTradeQualityReport(model);
    return renderReportOverview(model);
  } catch (error) {
    return `<section class="section"><div class="empty">目前沒有足夠資料產生專業報表：${escapeHtml(error.message || error)}</div></section>`;
  }
}

function renderReportSummaryCards() {
  const portfolioId = selectedPortfolioId();
  const accountId = reportBrokerAccountId(portfolioId);
  const transactions = scopedTransactions(portfolioId).filter((tx) => reportAccountMatches(tx, accountId)).slice().sort(sortByDateAsc);
  const inventoryLots = state.buyLots.filter((lot) => lot.portfolioId === portfolioId && reportAccountMatches(lot, accountId) && toNumber(lot.remainingShares) > 0);
  const reportDate = latestReportDate(transactions, state.sellMatches.filter((match) => match.portfolioId === portfolioId && reportAccountMatches(match, accountId)));
  const benchmark = build0050BenchmarkModel(portfolioId, accountId, transactions, inventoryLots, reportDate);
  return `
    <section class="metric-grid report-summary-grid">
      ${metricCard("操作等值股數", benchmark.reportPrice ? fmtNum(benchmark.operationEquivalentShares, 2) : "-", benchmark.excessShares >= 0 ? "teal" : "coral")}
      ${metricCard("不操作基準股數", benchmark.reportPrice ? fmtNum(benchmark.passiveShares, 2) : "-", "blue")}
      ${metricCard("超額股數", benchmark.reportPrice ? fmtNum(benchmark.excessShares, 2) : "-", benchmark.excessShares >= 0 ? "teal" : "coral")}
      ${metricCard("超額等值", benchmark.reportPrice ? fmtMoney(benchmark.excessValue) : "-", benchmark.excessValue >= 0 ? "teal" : "coral")}
    </section>
  `;
}
function render0050PerformanceReport() {
  try {
    const model = buildPdfReportModel(selectedPortfolioId(), reportBrokerAccountId());
    const benchmark = model.benchmark;
    if (!benchmark?.reportPrice) return `<section class="section"><div class="empty">需要 0050 收盤價或成交價後，才能換算每日等值股數。</div></section>`;
    const rows = benchmark.dailyRows.length ? benchmark.dailyRows : benchmark.series;
    return `
      <section class="two-col report-chart-grid">
        <div class="section">
          <div class="section-title"><div><h2>每日追蹤圖表</h2><p>操作後等值股數與不操作買進 0050 基準比較。</p></div></div>
          ${pdfLineChart(benchmark.series, [{ key: "equivalent", label: "操作等值股數", color: "#0f766e" }, { key: "passive", label: "不操作基準", color: "#2563eb" }, { key: "excess", label: "超額股數", color: "#b45309" }], "shares")}
        </div>
        <div class="section">
          <div class="section-title"><div><h2>計算規則</h2><p>零股價差以 0.98 比例作為保守基準。</p></div><span class="pill">${escapeHtml(benchmark.symbol)}</span></div>
          <div class="summary-list">
            <div class="summary-line"><span>報告日基準價</span><strong>${fmtPrice(benchmark.reportPrice)}</strong></div>
            <div class="summary-line"><span>價格來源</span><strong>${escapeHtml(benchmark.reportPriceSource)}</strong></div>
            <div class="summary-line"><span>入金換算</span><strong>次一交易日收盤價 × ${fmtNum(benchmark.fractionalShareRatio, 2)}</strong></div>
            <div class="summary-line"><span>現金也換股</span><strong>${fmtNum(benchmark.cashEquivalentShares, 2)} 股</strong></div>
          </div>
        </div>
      </section>
      <section class="section">
        <div class="section-title"><div><h2>主要績效列表</h2><p>每日用剩餘 0050 股數與現金換算成等值股數，和不操作買賣的基準比較。</p></div></div>
        ${renderTable([
          ["date", "日期"],
          ["price", "0050價"],
          ["actual", "剩餘0050"],
          ["cash", "現金"],
          ["cashShares", "現金等值股"],
          ["equivalent", "操作等值股"],
          ["passive", "不操作基準"],
          ["excess", "超額股數"],
          ["value", "超額等值"]
        ], rows.map((row) => ({
          date: escapeHtml(row.fullDate || row.date),
          price: row.price ? fmtPrice(row.price) : "-",
          actual: fmtNum(row.actualShares || 0, 2),
          cash: fmtMoney(row.cash || 0),
          cashShares: fmtNum(row.cashEquivalentShares || 0, 2),
          equivalent: fmtNum(row.equivalent || 0, 2),
          passive: fmtNum(row.passive || 0, 2),
          excess: `<span class="${toNumber(row.excess) >= 0 ? "positive" : "negative"}">${fmtNum(row.excess || 0, 2)}</span>`,
          value: `<span class="${toNumber(row.excessValue) >= 0 ? "positive" : "negative"}">${fmtMoney(row.excessValue || 0)}</span>`
        })), "尚無每日績效資料")}
      </section>
    `;
  } catch (error) {
    return `<section class="section"><div class="empty">目前沒有足夠資料產生 0050 績效追蹤：${escapeHtml(error.message || error)}</div></section>`;
  }
}
function renderReportOverview(model) {
  const quality = buildReportQualityMetrics(model);
  const inventory = buildInventoryRiskMetrics(model);
  const cashflow = buildCashflowMetrics(model);
  const insights = buildReportInsights(model, quality, inventory, cashflow);
  return `
    ${renderReportSummaryCards()}
    <section class="metric-grid report-summary-grid">
      ${metricCard("總資產估值", fmtMoney(cashflow.totalAssets), "teal")}
      ${metricCard("本月已實現", fmtMoney(model.monthSummary.net), model.monthSummary.net >= 0 ? "teal" : "coral")}
      ${metricCard("勝率", fmtPercentValue(quality.winRate), quality.winRate >= 0.5 ? "teal" : "amber")}
      ${metricCard("現金閒置率", fmtPercentValue(cashflow.cashRatio), cashflow.cashRatio > 0.3 ? "amber" : "blue")}
    </section>
    ${renderReportInsights(insights)}
    <section class="two-col report-chart-grid">
      <div class="section">
        <div class="section-title"><div><h2>資產曲線</h2><p>帳面資產 = 現金 + 庫存成本，用來觀察資金變化。</p></div></div>
        ${pdfLineChart(model.assetSeries, [{ key: "assets", label: "帳面資產", color: "#0f766e" }, { key: "cash", label: "現金", color: "#2563eb" }], "TWD")}
      </div>
      <div class="section">
        <div class="section-title"><div><h2>專業摘要</h2><p>把策略效率、風險與資金使用狀態放在同一張檢查表。</p></div></div>
        <div class="summary-list">
          <div class="summary-line"><span>今年已實現淨利</span><strong>${pdfSignedMoney(model.yearSummary.net)}</strong></div>
          <div class="summary-line"><span>Profit Factor</span><strong>${quality.profitFactor ? fmtNum(quality.profitFactor, 2) : "-"}</strong></div>
          <div class="summary-line"><span>最大持股集中度</span><strong>${fmtPercentValue(inventory.maxConcentration)}</strong></div>
          <div class="summary-line"><span>費用侵蝕率</span><strong>${fmtPercentValue(quality.costDragRate)}</strong></div>
        </div>
      </div>
    </section>
  `;
}

function renderPnlReport(model) {
  const inventoryRows = buildInventoryRiskMetrics(model).holdings.map((row) => ({
    security: escapeHtml(row.security),
    shares: fmtNum(row.shares),
    cost: fmtMoney(row.cost),
    marketValue: fmtMoney(row.marketValue),
    unrealized: `<span class="${row.unrealized >= 0 ? "positive" : "negative"}">${fmtMoney(row.unrealized)}</span>`,
    concentration: fmtPercentValue(row.concentration)
  }));
  return `
    <section class="metric-grid report-summary-grid">
      ${metricCard("當日淨利", fmtMoney(model.daySummary.net), model.daySummary.net >= 0 ? "teal" : "coral")}
      ${metricCard("本月淨利", fmtMoney(model.monthSummary.net), model.monthSummary.net >= 0 ? "teal" : "coral")}
      ${metricCard("今年淨利", fmtMoney(model.yearSummary.net), model.yearSummary.net >= 0 ? "teal" : "coral")}
      ${metricCard("本年費稅", fmtMoney(model.yearSummary.costs), "amber")}
    </section>
    <section class="two-col report-chart-grid">
      <div class="section"><div class="section-title"><div><h2>本月每日已實現損益</h2><p>依一般賣出配對日與借券回補成交日彙總毛利、費稅與淨利。</p></div></div><div class="bar-list">${model.monthDailyRows.length ? model.monthDailyRows.map((row) => pdfBarRow(row.period, row.net, Math.max(...model.monthDailyRows.map((item) => Math.abs(item.net)), 1))).join("") : `<div class="empty">本月尚無已實現損益</div>`}</div></div>
      <div class="section"><div class="section-title"><div><h2>年度月別淨利</h2><p>檢查每個月份對年度損益的貢獻。</p></div></div><div class="bar-list">${model.yearMonthlyRows.length ? model.yearMonthlyRows.map((row) => pdfBarRow(row.period, row.net, Math.max(...model.yearMonthlyRows.map((item) => Math.abs(item.net)), 1))).join("") : `<div class="empty">本年尚無已實現損益</div>`}</div></div>
    </section>
    <section class="section"><div class="section-title"><div><h2>未實現庫存損益</h2><p>用目前報價或成本估值，檢查庫存尚未實現的盈虧。</p></div></div>${renderTable([["security", "股票"], ["shares", "股數"], ["cost", "剩餘成本"], ["marketValue", "估值"], ["unrealized", "未實現"], ["concentration", "佔比"]], inventoryRows, "目前沒有庫存")}</section>
  `;
}

function renderInventoryRiskReport(model) {
  const metrics = buildInventoryRiskMetrics(model);
  return `
    <section class="metric-grid report-summary-grid">
      ${metricCard("最大持股集中度", fmtPercentValue(metrics.maxConcentration), metrics.maxConcentration > 0.5 ? "coral" : "teal")}
      ${metricCard("庫存估值", fmtMoney(metrics.totalMarketValue), "blue")}
      ${metricCard("90天以上成本", fmtMoney(metrics.agedCost), metrics.agedCost > 0 ? "amber" : "teal")}
      ${metricCard("待回補股數", fmtNum(metrics.openRebuyShares), metrics.openRebuyShares > 0 ? "coral" : "teal")}
    </section>
    <section class="section"><div class="section-title"><div><h2>持股集中度</h2><p>依股票彙總估值與成本，找出是否過度集中。</p></div></div>${renderTable([["security", "股票"], ["marketValue", "估值"], ["concentration", "佔比"], ["shares", "股數"], ["cost", "剩餘成本"], ["oldestBuy", "最早買進"]], metrics.holdings.map((row) => ({ security: escapeHtml(row.security), marketValue: fmtMoney(row.marketValue), concentration: fmtPercentValue(row.concentration), shares: fmtNum(row.shares), cost: fmtMoney(row.cost), oldestBuy: escapeHtml(row.oldestBuy || "-") })), "目前沒有庫存")}</section>
    <section class="section"><div class="section-title"><div><h2>庫存老化分布</h2><p>依買進日至報告日分桶，檢查資金卡住時間。</p></div></div>${renderTable([["bucket", "持有天數"], ["lots", "筆數"], ["shares", "股數"], ["cost", "成本"]], metrics.ageBuckets, "目前沒有庫存老化資料")}</section>
  `;
}

function renderCashflowReport(model) {
  const metrics = buildCashflowMetrics(model);
  return `
    <section class="metric-grid report-summary-grid">
      ${metricCard("累計入金", fmtMoney(metrics.deposits), "blue")}
      ${metricCard("累計出金", fmtMoney(metrics.withdraws), "amber")}
      ${metricCard("淨投入", fmtMoney(metrics.netContribution), "teal")}
      ${metricCard("資金週轉率", fmtPercentValue(metrics.turnoverRate), "blue")}
    </section>
    <section class="section"><div class="section-title"><div><h2>現金流明細</h2><p>逐筆追蹤入金、出金、買進與賣出的淨收付。</p></div></div>${renderTable([["date", "日期"], ["type", "類型"], ["security", "股票"], ["amount", "淨收付"], ["running", "累計現金"]], metrics.rows.map((row) => ({ date: escapeHtml(row.date), type: tradeTypeLabel(row.type), security: escapeHtml(row.security), amount: fmtMoney(row.amount), running: fmtMoney(row.running) })), "目前沒有現金流資料")}</section>
  `;
}

function renderTradeQualityReport(model) {
  const quality = buildReportQualityMetrics(model);
  return `
    <section class="metric-grid report-summary-grid">
      ${metricCard("勝率", fmtPercentValue(quality.winRate), quality.winRate >= 0.5 ? "teal" : "amber")}
      ${metricCard("賺賠比", quality.payoffRatio ? fmtNum(quality.payoffRatio, 2) : "-", quality.payoffRatio >= 1 ? "teal" : "coral")}
      ${metricCard("Profit Factor", quality.profitFactor ? fmtNum(quality.profitFactor, 2) : "-", quality.profitFactor >= 1 ? "teal" : "coral")}
      ${metricCard("平均持有天數", quality.avgHoldingDays ? `${fmtNum(quality.avgHoldingDays, 1)} 天` : "-", "blue")}
    </section>
    <section class="section"><div class="section-title"><div><h2>交易品質明細</h2><p>勝率之外，也看平均獲利、平均虧損與費稅侵蝕。</p></div></div><div class="summary-list">
      <div class="summary-line"><span>平均獲利</span><strong>${fmtMoney(quality.avgWin)}</strong></div>
      <div class="summary-line"><span>平均虧損</span><strong>${fmtMoney(quality.avgLoss)}</strong></div>
      <div class="summary-line"><span>最大單筆獲利</span><strong>${fmtMoney(quality.bestTrade)}</strong></div>
      <div class="summary-line"><span>最大單筆虧損</span><strong>${fmtMoney(quality.worstTrade)}</strong></div>
      <div class="summary-line"><span>費用侵蝕率</span><strong>${fmtPercentValue(quality.costDragRate)}</strong></div>
    </div></section>
    <section class="section"><div class="section-title"><div><h2>已配對交易清單</h2><p>依每筆買賣配對列出淨利與持有天數。</p></div></div>${renderTable([["buyDate", "買進日"], ["sellDate", "賣出日"], ["shares", "股數"], ["prices", "買/賣價"], ["net", "淨利"], ["days", "持有天數"]], quality.rows, "目前沒有已配對交易")}</section>
  `;
}

function buildReportQualityMetrics(model) {
  const rows = model.matches.map((match) => {
    const net = toNumber(match.netProfit);
    const days = reportDaysBetween(match.buyDate, match.sellDate);
    return {
      buyDate: escapeHtml(match.buyDate || "-"),
      sellDate: escapeHtml(match.sellDate || "-"),
      shares: fmtNum(match.matchedShares),
      prices: `${fmtPrice(match.buyPrice)} / ${fmtPrice(match.sellPrice)}`,
      net: `<span class="${net >= 0 ? "positive" : "negative"}">${fmtMoney(net)}</span>`,
      days: days === null ? "-" : `${fmtNum(days)} 天`,
      _net: net,
      _days: days
    };
  });
  const wins = rows.filter((row) => row._net > 0);
  const losses = rows.filter((row) => row._net < 0);
  const totalWin = reportSum(wins, (row) => row._net);
  const totalLoss = Math.abs(reportSum(losses, (row) => row._net));
  const avgWin = wins.length ? totalWin / wins.length : 0;
  const avgLoss = losses.length ? totalLoss / losses.length : 0;
  const holdingDays = rows.map((row) => row._days).filter((days) => days !== null);
  return {
    rows,
    winRate: rows.length ? wins.length / rows.length : 0,
    avgWin,
    avgLoss,
    payoffRatio: avgLoss ? avgWin / avgLoss : 0,
    profitFactor: totalLoss ? totalWin / totalLoss : (totalWin ? 99 : 0),
    bestTrade: rows.length ? Math.max(...rows.map((row) => row._net)) : 0,
    worstTrade: rows.length ? Math.min(...rows.map((row) => row._net)) : 0,
    avgHoldingDays: holdingDays.length ? reportSum(holdingDays, (days) => days) / holdingDays.length : 0,
    costDragRate: Math.abs(model.yearSummary.gross) ? model.yearSummary.costs / Math.abs(model.yearSummary.gross) : 0
  };
}

function buildInventoryRiskMetrics(model) {
  const totalMarketValue = reportSum(model.inventoryLots, (lot) => inventoryLotReportMarketValue(lot, model.benchmark.reportPrice));
  const groups = new Map();
  const ageBuckets = [
    { bucket: "0-7 天", min: 0, max: 7, lots: 0, shares: 0, cost: 0 },
    { bucket: "8-30 天", min: 8, max: 30, lots: 0, shares: 0, cost: 0 },
    { bucket: "31-90 天", min: 31, max: 90, lots: 0, shares: 0, cost: 0 },
    { bucket: "90 天以上", min: 91, max: Infinity, lots: 0, shares: 0, cost: 0 }
  ];
  for (const lot of model.inventoryLots) {
    const key = lot.securityId || "UNKNOWN";
    const marketValue = inventoryLotReportMarketValue(lot, model.benchmark.reportPrice);
    const cost = lotRemainingCost(lot);
    if (!groups.has(key)) groups.set(key, { security: securityLabel(key), shares: 0, cost: 0, marketValue: 0, oldestBuy: lot.buyDate || "" });
    const row = groups.get(key);
    row.shares += toNumber(lot.remainingShares);
    row.cost += cost;
    row.marketValue += marketValue;
    if (lot.buyDate && (!row.oldestBuy || lot.buyDate < row.oldestBuy)) row.oldestBuy = lot.buyDate;
    const days = reportDaysBetween(lot.buyDate, model.reportDate);
    const bucket = ageBuckets.find((item) => days !== null && days >= item.min && days <= item.max);
    if (bucket) {
      bucket.lots += 1;
      bucket.shares += toNumber(lot.remainingShares);
      bucket.cost += cost;
    }
  }
  const holdings = Array.from(groups.values())
    .map((row) => ({ ...row, unrealized: row.marketValue - row.cost, concentration: totalMarketValue ? row.marketValue / totalMarketValue : 0 }))
    .sort((a, b) => b.marketValue - a.marketValue);
  const agedCost = ageBuckets.find((bucket) => bucket.bucket === "90 天以上")?.cost || 0;
  const openRebuyShares = reportSum(model.borrowRebuyCycles.filter((cycle) => ["open", "partial"].includes(cycle.status)), (cycle) => cycle.remainingRebuyQty);
  return {
    totalMarketValue,
    holdings,
    maxConcentration: holdings.length ? holdings[0].concentration : 0,
    agedCost,
    openRebuyShares,
    ageBuckets: ageBuckets.map((bucket) => ({ bucket: bucket.bucket, lots: fmtNum(bucket.lots), shares: fmtNum(bucket.shares), cost: fmtMoney(bucket.cost) }))
  };
}

function buildCashflowMetrics(model) {
  let running = 0;
  const rows = model.transactions
    .filter((tx) => ["DEPOSIT", "WITHDRAW", "BUY", "SELL"].includes(tx.transactionType))
    .map((tx) => {
      const amount = toNumber(effectiveTransactionAmounts(tx).netAmount);
      running += amount;
      return {
        date: tx.tradeDate,
        type: tx.transactionType,
        security: securityLabel(tx.securityId),
        amount,
        running: roundMoney(running)
      };
    });
  const deposits = reportSum(model.transactions.filter((tx) => tx.transactionType === "DEPOSIT"), (tx) => Math.abs(toNumber(effectiveTransactionAmounts(tx).netAmount)));
  const withdraws = reportSum(model.transactions.filter((tx) => tx.transactionType === "WITHDRAW"), (tx) => Math.abs(toNumber(effectiveTransactionAmounts(tx).netAmount)));
  const sellNet = reportSum(model.transactions.filter((tx) => tx.transactionType === "SELL"), (tx) => Math.max(0, toNumber(effectiveTransactionAmounts(tx).netAmount)));
  const inventoryMarketValue = reportSum(model.inventoryLots, (lot) => inventoryLotReportMarketValue(lot, model.benchmark.reportPrice));
  const totalAssets = model.metrics.cash + inventoryMarketValue;
  return {
    rows,
    deposits,
    withdraws,
    netContribution: deposits - withdraws,
    sellNet,
    totalAssets,
    cashRatio: totalAssets ? model.metrics.cash / totalAssets : 0,
    turnoverRate: deposits ? sellNet / deposits : 0
  };
}

function buildReportInsights(model, quality = buildReportQualityMetrics(model), inventory = buildInventoryRiskMetrics(model), cashflow = buildCashflowMetrics(model)) {
  const insights = [];
  if (model.benchmark?.reportPrice && model.benchmark.excessShares < 0) insights.push({ level: "danger", title: "策略目前落後 0050 基準", text: `等效少 ${fmtNum(Math.abs(model.benchmark.excessShares), 2)} 股，建議檢查交易成本與資金閒置。` });
  if (cashflow.cashRatio > 0.3) insights.push({ level: "warning", title: "現金閒置率偏高", text: `目前現金佔總資產 ${fmtPercentValue(cashflow.cashRatio)}，可評估是否符合策略等待區間。` });
  if (inventory.maxConcentration > 0.5) insights.push({ level: "warning", title: "單一持股集中度偏高", text: `最大持股佔庫存估值 ${fmtPercentValue(inventory.maxConcentration)}，需留意價格波動風險。` });
  if (quality.costDragRate > 0.2) insights.push({ level: "warning", title: "費用侵蝕偏高", text: `今年費稅約佔毛利 ${fmtPercentValue(quality.costDragRate)}，可檢查零股頻率與手續費低消。` });
  if (inventory.openRebuyShares > 0) insights.push({ level: "danger", title: "仍有待回補部位", text: `目前待回補 ${fmtNum(inventory.openRebuyShares)} 股，建議追蹤回補價格與期限。` });
  if (!insights.length) insights.push({ level: "info", title: "目前沒有重大異常", text: "現金、集中度、費用與 0050 基準皆未觸發警示門檻。" });
  return insights;
}

function renderReportInsights(insights) {
  return `
    <section class="section">
      <div class="section-title"><div><h2>專業提醒</h2><p>自動檢查資金閒置、集中度、費用侵蝕與 0050 基準差距。</p></div></div>
      <div class="report-insight-list">
        ${insights.map((item) => `<div class="report-insight ${escapeAttr(item.level)}"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.text)}</span></div>`).join("")}
      </div>
    </section>
  `;
}

function reportDaysBetween(start, end) {
  if (!start || !end) return null;
  const startTime = Date.parse(`${start}T00:00:00`);
  const endTime = Date.parse(`${end}T00:00:00`);
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return null;
  return Math.max(0, Math.round((endTime - startTime) / 86400000));
}

function lotRemainingCost(lot) {
  const ratio = toNumber(lot.originalShares) ? toNumber(lot.remainingShares) / Math.max(toNumber(lot.originalShares), 1) : 1;
  return toNumber(lot.remainingShares) * toNumber(lot.buyPrice) + toNumber(lot.allocatedBuyFee) * ratio;
}

function fmtPercentValue(value) {
  return `${fmtNum(toNumber(value) * 100, 1)}%`;
}

function handleSetReportPreset(reportType) {
  if (!reportType) return;
  state.ui.report = reportType;
  persist();
  render();
}
function renderReportChartPreview() {
  return render0050PerformanceReport();
}
function renderSettings() {
  const settings = getPortfolioSettings();
  const settingsTab = state.ui.settingsTab || "general";
  return `

    <section class="settings-hub">
      <div class="section-title"><div><h2>設定中心</h2><p>帳戶、策略、同步與備份集中管理。</p></div></div>
      <div class="settings-tabs" role="tablist" aria-label="設定分類">
        <button type="button" class="settings-tab ${settingsTab === "general" ? "active" : ""}" data-action="set-settings-tab" data-settings-tab="general" role="tab">一般</button>
        <button type="button" class="settings-tab ${settingsTab === "strategy" ? "active" : ""}" data-action="set-settings-tab" data-settings-tab="strategy" role="tab">策略與回補</button>
        <button type="button" class="settings-tab ${settingsTab === "brokers" ? "active" : ""}" data-action="set-settings-tab" data-settings-tab="brokers" role="tab">券商與費稅</button>
        <button type="button" class="settings-tab ${settingsTab === "data" ? "active" : ""}" data-action="set-settings-tab" data-settings-tab="data" role="tab">同步與備份</button>
        <button type="button" class="settings-tab ${settingsTab === "audit" ? "active" : ""}" data-action="set-settings-tab" data-settings-tab="audit" role="tab">稽核紀錄</button>
      </div>
    </section>
    <div class="settings-panel" ${settingsTab !== "general" ? "hidden" : ""}>
    ${renderAccountSettingsSection()}
    ${renderSecuritySettingsSection()}
    </div>
    <div class="settings-panel" ${settingsTab !== "brokers" ? "hidden" : ""}>
    ${renderBrokerFeeSettingsSection()}
    </div>
    <div class="settings-panel" ${settingsTab !== "strategy" ? "hidden" : ""}>
    <section class="section">
      <div class="section-title"><div><h2>Portfolio Settings</h2><p>回補規則、容忍差異與分攤方法</p></div></div>
      <form class="form-grid" data-form="settings-save">
        <div class="field"><label>預設股票</label><input name="defaultSecurity" value="${escapeAttr(settings.defaultSecurity)}" required /></div>
        <div class="field"><label>回補價差</label><input type="number" step="0.01" name="defaultRebuyOffset" value="${settings.defaultRebuyOffset}" required /></div>
        <div class="field"><label>核心持股底線</label><input type="number" step="1" name="coreHoldingShares" value="${settings.coreHoldingShares}" /></div>
        <div class="field"><label>價格容忍</label><input type="number" step="0.01" name="priceTolerance" value="${settings.priceTolerance}" /></div>
        <div class="field"><label>金額容忍</label><input type="number" step="1" name="amountTolerance" value="${settings.amountTolerance}" /></div>
        <div class="field"><label>費稅分攤</label><select name="feeAllocationMethod"><option ${settings.feeAllocationMethod === "BY_SHARES" ? "selected" : ""}>BY_SHARES</option><option ${settings.feeAllocationMethod === "BY_GROSS_AMOUNT" ? "selected" : ""}>BY_GROSS_AMOUNT</option></select></div>
        <div class="field"><label>回補匹配</label><select name="rebuyMatchMethod"><option value="MANUAL_ONLY" selected>手動選擇回補</option></select></div>
        <div class="field"><label>回補範圍</label><select name="defaultRebuyScope"><option value="SAME_BROKER_ACCOUNT" selected>同券商帳戶</option></select></div>
        <div class="field full"><div class="btn-row"><button class="btn primary" type="submit">儲存設定</button><button class="btn danger" type="button" data-action="reset-portfolio-settings">重置設定</button></div></div>
      </form>
    </section>
    </div>
    <div class="settings-panel" ${settingsTab !== "data" ? "hidden" : ""}>
    <section class="section">
      <div class="section-title"><div><h2>Firebase Sync</h2><p>貼上 Web config 後可同步目前使用者帳本</p></div></div>
      <form class="form-grid" data-form="firebase-save">
        <div class="field"><label>Namespace</label><input name="namespace" value="${escapeAttr(state.settings.firebase.namespace || currentUser()?.email || "")}" /></div>
        <div class="field full"><label>Firebase Web Config JSON</label><textarea name="configText">${escapeHtml(state.settings.firebase.configText || "")}</textarea></div>
        <div class="field full">
          <div class="btn-row">
            <button class="btn primary" type="submit">儲存 Firebase 設定</button>
            <button class="btn blue" type="button" data-action="firebase-push">同步到 Firebase</button>
            <button class="btn" type="button" data-action="firebase-pull">從 Firebase 載入</button>
            <button class="btn danger" type="button" data-action="clear-firebase-settings">清除 Firebase 設定</button>
          </div>
        </div>
        <div class="field full" style="margin-top: 16px; padding: 12px; border: 1px dashed #10b981; border-radius: 8px; background: rgba(16, 185, 129, 0.05);">
          <label style="color: #10b981; font-weight: bold; display: block; margin-bottom: 6px;">📋 本機帳本備份/還原 (防丟失專用)</label>
          <p style="font-size: 12px; color: #64748b; margin-bottom: 8px;">建議在手機上下載備份檔儲存，您也可以在電腦上匯入此檔案進行還原：</p>
          <div class="btn-row" style="margin-bottom: 12px;">
            <button class="btn" type="button" style="background: #10b981; color: white;" data-action="download-backup-file">📥 下載本機 JSON 備份檔</button>
            <button class="btn" type="button" style="background: #6366f1; color: white;" data-action="trigger-import-file">📤 匯入 JSON 備份檔</button>
            <input type="file" id="backup-file-import-input" style="display: none;" accept=".json" />
          </div>
          <p style="font-size: 11px; color: #94a3b8; margin-bottom: 4px;">如果您無法下載，可長按下方框內文字手動複製：</p>
          <textarea readonly style="width: 100%; height: 120px; font-family: monospace; font-size: 10px; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; background: white; color: #334155;" onclick="this.select(); this.setSelectionRange(0, 99999);">${escapeHtml(localStorage.getItem(STORAGE_KEY) || "")}</textarea>
        </div>
      </form>
    </section>
    ${renderDriveBackupSettings()}

    </div>
    <div class="settings-panel" ${settingsTab !== "audit" ? "hidden" : ""}>
    <section class="section">
      <div class="section-title"><div><h2>Audit Logs</h2><p>人工修改 before / after 留痕</p></div></div>
      ${renderAuditLogs()}
    </section>
    </div>
  `;
}


function renderDriveBackupSettings() {
  const backup = state.settings.backup || {};
  const status = backup.enabled ? "已啟用每日備份" : "尚未連結 Google Drive";
  const lastBackup = backup.lastBackupAt ? formatDateTime(backup.lastBackupAt) : "尚未備份";
  return [
    "<section class=\"section backup-settings-section\">",
    "<div class=\"section-title\"><div><h2>Google Drive 每日備份</h2><p>每天 03:00 備份已同步帳本，保留 90 天每日檔與 12 個月底檔。</p></div><span class=\"pill\">" + escapeHtml(status) + "</span></div>",
    "<div class=\"backup-status-grid\">",
    "<div><span>最後備份</span><strong>" + escapeHtml(lastBackup) + "</strong></div>",
    "<div><span>保留政策</span><strong>" + escapeHtml(String(backup.retentionDays || 90)) + " 日 / " + escapeHtml(String(backup.monthlyRetention || 12)) + " 月</strong></div>",
    "<div><span>排程</span><strong>每日 " + escapeHtml(backup.scheduleTime || "03:00") + " 台北時間</strong></div>",
    "</div>",
    "<div class=\"btn-row\">",
    "<button class=\"btn primary\" type=\"button\" data-action=\"backup-connect-drive\">連結 Google Drive</button>",
    "<button class=\"btn blue\" type=\"button\" data-action=\"backup-run-now\">立即備份</button><button class=\"btn\" type=\"button\" data-action=\"backup-open-folder\">開啟備份資料夾</button>",
    "<button class=\"btn\" type=\"button\" data-action=\"backup-refresh-status\">重新整理狀態</button>",
    "<button class=\"btn danger\" type=\"button\" data-action=\"backup-disconnect-drive\">解除連結</button>",
    "</div>",
    "</section>"
  ].join("");
}

function renderAccountSettingsSection() {
  const accounts = state.brokerAccounts.filter((account) => account.portfolioId === selectedPortfolioId());
  return `
    <section class="section">
      <div class="section-title"><div><h2>帳戶設定</h2><p>券商帳戶可分開看，也可在庫存合併檢視</p></div><button class="btn" data-route="/app/broker-accounts">新增帳戶</button></div>
      ${renderTable(
        [["account", "帳戶"], ["broker", "券商"], ["default", "預設"], ["active", "狀態"], ["actions", "操作"]],
        accounts.map((account) => ({
          account: escapeHtml(account.accountName),
          broker: escapeHtml(brokerName(account.brokerId)),
          default: account.isDefault ? "是" : "否",
          active: statusPill(account.isActive ? "ACTIVE" : "INACTIVE"),
          actions: renderActions("broker-account", account.id, account.accountName)
        })),
        "尚未建立券商帳戶"
      )}
    </section>
  `;
}

function renderSecuritySettingsSection() {
  return `
    <section class="section">
      <div class="section-title"><div><h2>個股設定</h2><p>多檔股票與 Yahoo Finance 代號</p></div></div>
      <form class="form-grid compact" data-form="security-create">
        <div class="field"><label>股票代號</label><input name="symbol" required placeholder="0050" /></div>
        <div class="field"><label>股票名稱</label><input name="name" required placeholder="元大台灣50" /></div>
        <div class="field"><label>市場</label><select name="market"><option>TW</option><option>TWO</option><option>US</option></select></div>
        <div class="field"><label>類型</label><select name="assetType"><option value="ETF">ETF</option><option value="STOCK">個股</option></select></div>
        <div class="field"><label>Yahoo 代號</label><input name="yahooSymbol" placeholder="0050.TW" /></div>
        <div class="field"><label>&nbsp;</label><button class="btn primary" type="submit">新增個股</button></div>
      </form>
      ${renderTable(
        [["symbol", "代號"], ["name", "名稱"], ["market", "市場"], ["type", "類型"], ["yahoo", "Yahoo"], ["actions", "操作"]],
        state.securities.map((security) => ({
          symbol: escapeHtml(security.symbol),
          name: escapeHtml(security.name),
          market: escapeHtml(security.market || "TW"),
          type: securityAssetType(security) === "ETF" ? "ETF" : "個股",
          yahoo: escapeHtml(security.yahooSymbol || yahooSymbolForSecurity(security)),
          actions: renderActions("security", security.id, security.symbol)
        })),
        "尚未建立個股"
      )}
    </section>
  `;
}

function renderBrokerFeeSettingsSection() {
  return `
    <section class="section">
      <div class="section-title"><div><h2>券商手續費設定</h2><p>快捷買賣手續費空白時會自動估算</p></div></div>
      <form class="fee-settings" data-form="broker-fees-save">
        ${state.brokers.map((broker) => {
          const fee = brokerFeeSetting(broker.id);
          return `
            <div class="fee-card">
              <strong>${escapeHtml(broker.name)}</strong>
              <label>手續費率<input type="number" step="0.000001" name="feeRate__${escapeAttr(broker.id)}" value="${escapeAttr(fee.feeRate)}" /></label>
              <label>折扣<input type="number" step="0.01" name="discountRate__${escapeAttr(broker.id)}" value="${escapeAttr(fee.discountRate)}" /></label>
              <label>最低手續費<input type="number" step="1" name="minFee__${escapeAttr(broker.id)}" value="${escapeAttr(fee.minFee)}" /></label>
              <label>股票交易稅<input type="number" step="0.0001" name="stockSellTaxRate__${escapeAttr(broker.id)}" value="${escapeAttr(fee.stockSellTaxRate ?? fee.sellTaxRate)}" /></label>
              <label>ETF交易稅<input type="number" step="0.0001" name="etfSellTaxRate__${escapeAttr(broker.id)}" value="${escapeAttr(fee.etfSellTaxRate ?? 0.001)}" /></label>
            </div>
          `;
        }).join("")}
        <div class="btn-row"><button class="btn primary" type="submit">儲存費率</button></div>
      </form>
    </section>
  `;
}
async function onSubmit(event) {
  const form = event.target.closest("form[data-form]");
  if (!form) return;
  event.preventDefault();
  const name = form.dataset.form;
  const data = Object.fromEntries(new FormData(form).entries());
  try {
    if (name === "register") return handleRegister(data);
    if (name === "login") return handleLogin(data);
    if (name === "forgot") return handleForgotPassword(data);
    if (name === "portfolio-create") return handlePortfolioCreate(data);
    if (name === "broker-account-create") return handleBrokerAccountCreate(data);
    if (name === "import-file") return handleImportFile(form, data);
    if (name === "template-create") return handleTemplateCreate(data);
    if (name === "security-create") return handleSecurityCreate(data);
    if (name === "manual-transaction") return await handleManualTransaction(data);
    if (name === "quick-entry") return await handleQuickEntrySubmit(data);
    if (name === "quote-sync") return handleQuoteSync(data);
    if (name === "cash-transfer") return handleCashTransfer(data);
    if (name === "position-transfer") return handlePositionTransfer(data);
    if (name === "settings-save") return handleSettingsSave(data);
    if (name === "broker-fees-save") return handleBrokerFeesSave(data);
    if (name === "firebase-save") return handleFirebaseSave(data);
  } catch (error) {
    console.error(error);
    showToast(formatFirebaseError(error));
  }
}

async function onClick(event) {
  const routeButton = event.target.closest("[data-route]");
  if (routeButton) {
    state.ui.accountSheetOpen = false;
    navigate(routeButton.dataset.route);
    return;
  }
  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;
  const action = actionButton.dataset.action;
  try {
    if (action === "logout") return handleLogout();
    if (action === "google-login") return handleGoogleLogin();
    if (action === "open-action-sheet") { state.ui.quickActionSheetOpen = true; state.ui.accountSheetOpen = false; persist(); render(); return; }
    if (action === "close-action-sheet") { state.ui.quickActionSheetOpen = false; persist(); render(); return; }
    if (action === "open-account-sheet") { state.ui.accountSheetOpen = true; state.ui.quickActionSheetOpen = false; persist(); render(); return; }
    if (action === "close-account-sheet") { state.ui.accountSheetOpen = false; persist(); render(); return; }
    if (action === "select-broker-account") return handleSelectBrokerAccount(actionButton.dataset.accountId);
    if (action === "select-report-account") return handleSelectReportAccount(actionButton.dataset.accountId);
    if (action === "quick-buy") return openQuickEntry("BUY");
    if (action === "quick-sell") return openQuickEntry("SELL");
    if (action === "quick-deposit") return openQuickEntry("DEPOSIT");
    if (action === "quick-income") return openQuickEntry("INTEREST");
    if (action === "quick-withdraw") return openQuickEntry("WITHDRAW");
    if (action === "close-quick-entry") return closeQuickEntry();
    if (action === "toggle-match-lot") return handleMatchLotToggle(actionButton);
    if (action === "clear-match-picker") return handleClearMatchPicker(actionButton);
    if (action === "apply-transaction-filters") return handleApplyTransactionFilters();
    if (action === "clear-transaction-filters") return handleClearTransactionFilters();
    if (action === "set-report-preset") return handleSetReportPreset(actionButton.dataset.report);
    if (action === "load-sample-json") return loadSampleJson();
    if (action === "load-sample-csv") return loadSampleCsv();
    if (action === "run-reconciliation") return handleRunReconciliation();
    if (action === "accept-broker-diffs") return handleAcceptBrokerDiffs();
    if (action === "save-match") return handleSaveMatch(actionButton.dataset.sellId);
    if (action === "edit-match") return handleEditMatch(actionButton.dataset.sellId);
    if (action === "cancel-edit-match") return handleCancelEditMatch(actionButton.dataset.sellId);
    if (action === "edit-transaction") return handleEditTransaction(actionButton.dataset.id);
    if (action === "delete-transaction") return handleDeleteTransaction(actionButton.dataset.id);
    if (action === "delete-import-batch") return handleDeleteImportBatch(actionButton.dataset.id);
    if (action === "sell-lot") return handleSellLot(actionButton.dataset.buyId);
    if (action === "open-quote-sync") return handleOpenQuoteSync();
    if (action === "sync-yahoo-quotes") return await handleYahooQuoteSync();
    if (action === "edit-portfolio") return handleEditPortfolio(actionButton.dataset.id);
    if (action === "delete-portfolio") return handleDeletePortfolio(actionButton.dataset.id);
    if (action === "edit-broker") return handleEditBroker(actionButton.dataset.id);
    if (action === "delete-broker") return handleDeleteBroker(actionButton.dataset.id);
    if (action === "edit-broker-account") return handleEditBrokerAccount(actionButton.dataset.id);
    if (action === "delete-broker-account") return handleDeleteBrokerAccount(actionButton.dataset.id);
    if (action === "edit-template") return handleEditTemplate(actionButton.dataset.id);
    if (action === "delete-template") return handleDeleteTemplate(actionButton.dataset.id);
    if (action === "edit-security") return handleEditSecurity(actionButton.dataset.id);
    if (action === "delete-security") return handleDeleteSecurity(actionButton.dataset.id);
    if (action === "edit-cash-transfer") return handleEditCashTransfer(actionButton.dataset.id);
    if (action === "delete-cash-transfer") return handleDeleteCashTransfer(actionButton.dataset.id);
    if (action === "edit-position-transfer") return handleEditPositionTransfer(actionButton.dataset.id);
    if (action === "delete-position-transfer") return handleDeletePositionTransfer(actionButton.dataset.id);
    if (action === "reset-portfolio-settings") return handleResetPortfolioSettings();
    if (action === "set-settings-tab") {
      state.ui.settingsTab = actionButton.dataset.settingsTab || "general";
      persist();
      render();
      return;
    }
    if (action === "clear-firebase-settings") return handleClearFirebaseSettings();
    if (action === "backup-connect-drive") return await connectGoogleDriveBackup();
    if (action === "backup-run-now") return await runGoogleDriveBackupNow();
    if (action === "backup-refresh-status") return await refreshDriveBackupStatus();
    if (action === "backup-open-folder") return openGoogleDriveBackupFolder();
    if (action === "backup-disconnect-drive") return await disconnectGoogleDriveBackup();
    if (action === "quick-rebuy-task") return handleRebuyTaskBuy(actionButton.dataset.sellIds);
    if (action === "manual-close-rebuy-group") return handleManualCloseRebuyGroup(actionButton.dataset.sellIds);
    if (action === "manual-close-rebuy") return handleManualCloseRebuy(actionButton.dataset.sellId);
    if (action === "export-pdf-report") return await exportPdfReport();
    if (action === "email-report-summary") return await emailReportSummary();
    if (action === "export-xls") return await exportExcel();
    if (action === "firebase-push") return await syncToFirebase();
    if (action === "firebase-pull") return await loadFromFirebase();
    if (action === "download-backup-file") {
      await downloadBackupEnvelope("LOCAL_EXPORT");
      showToast("已下載可驗證的 JSON 備份檔。");
      return;
    }
    if (action === "trigger-import-file") {
      const fileInput = document.getElementById("backup-file-import-input");
      if (!fileInput) return;
      fileInput.onchange = (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (loadEvent) => {
          try {
            const importedState = await parseBackupDocument(JSON.parse(loadEvent.target.result));
            const currentScore = ledgerContentScore(exportCurrentUserState());
            const incomingScore = ledgerContentScore(importedState);
            const confirmed = window.confirm("即將匯入備份資料。現有資料會先下載安全備份。\n目前資料項目：" + currentScore + "\n匯入資料項目：" + incomingScore);
            if (!confirmed) return;
            await downloadBackupEnvelope("PRE_RESTORE");
            mergeCurrentUserState(importedState);
            recomputeAll();
            persist();
            render();
            showToast("已完成備份驗證、建立安全備份並匯入資料。");
          } catch (error) {
            console.error(error);
            showToast("匯入失敗：" + (error.message || "請確認檔案格式"));
          }
        };
        reader.readAsText(file);
      };
      fileInput.click();
      return;
    }
    if (action === "copy-backup-json") {
      try {
        const rawData = localStorage.getItem(STORAGE_KEY);
        if (!rawData) {
          showToast("本機沒有找到任何資料暫存！");
          return;
        }
        await navigator.clipboard.writeText(rawData);
        showToast("已成功複製本機資料到剪貼簿！請將它貼給開發助理備份。");
      } catch (err) {
        const rawData = localStorage.getItem(STORAGE_KEY);
        const tempTextArea = document.createElement("textarea");
        tempTextArea.value = rawData;
        document.body.appendChild(tempTextArea);
        tempTextArea.select();
        document.execCommand("copy");
        document.body.removeChild(tempTextArea);
        showToast("已複製本機資料到剪貼簿（相容模式）！");
      }
      return;
    }
  } catch (error) {
    console.error(error);
    showToast(formatFirebaseError(error));
  }
}

function handleSelectBrokerAccount(accountId) {
  const portfolioId = selectedPortfolioId();
  const account = scopedBrokerAccounts(portfolioId).find((item) => item.id === accountId);
  if (!account) return;
  state.ui.activeBrokerAccountId = account.id;
  state.ui.transactionFilterAccount = account.id;
  state.ui.inventoryFilterAccount = account.id;
  state.ui.accountSheetOpen = false;
  persist();
  render();
}

function handleSelectReportAccount(accountId) {
  const portfolioId = selectedPortfolioId();
  if (accountId !== "ALL" && !scopedBrokerAccounts(portfolioId).some((item) => item.id === accountId)) return;
  state.ui.reportBrokerAccountId = accountId || "ALL";
  state.ui.accountSheetOpen = false;
  persist();
  render();
}

function onChange(event) {
  if (event.target.name === "sourceType" && event.target.closest('form[data-form="import-file"]')) {
    const form = event.target.closest('form[data-form="import-file"]');
    const symbolFields = form.querySelectorAll('[name="symbol"], [name="securityName"]');
    const isCsv = event.target.value === "BROKER_CSV";
    for (const f of symbolFields) {
      const fieldDiv = f.closest('.field');
      if (fieldDiv) {
        fieldDiv.hidden = isCsv;
      }
      f.required = !isCsv;
    }
    return;
  }
  if (event.target.name === "sellType") {
    const sheet = event.target.closest(".quick-entry-sheet");
    const normalField = sheet?.querySelector("[data-sell-normal-match-field]");
    const borrowField = sheet?.querySelector("[data-sell-borrow-match-field]");
    const isBorrow = event.target.value === SELL_TYPE_BORROW;
    if (normalField) normalField.hidden = isBorrow;
    if (borrowField) borrowField.hidden = !isBorrow;
    clearMatchPickerField(isBorrow ? normalField : borrowField);
    return;
  }
  if (event.target.name === "buyType") {
    const sheet = event.target.closest(".quick-entry-sheet");
    const rebuyField = sheet?.querySelector("[data-rebuy-intent-field]");
    const borrowField = sheet?.querySelector("[data-borrow-rebuy-intent-field]");
    if (rebuyField) rebuyField.hidden = event.target.value !== "REBUY";
    if (borrowField) borrowField.hidden = event.target.value !== "BORROW_REBUY";
    return;
  }
  if (event.target.name === "buyIntent") {
    const sheet = event.target.closest(".quick-entry-sheet");
    const rebuyField = sheet?.querySelector("[data-rebuy-intent-field]");
    if (rebuyField) rebuyField.hidden = event.target.value !== "REBUY";
    return;
  }
  if (["brokerAccountId", "symbol"].includes(event.target.name) && event.target.closest('form[data-form="quick-entry"]')) {
    const form = event.target.closest('form[data-form="quick-entry"]');
    const data = Object.fromEntries(new FormData(form).entries());
    data.linkedBuyTransactionId = "";
    data.rebuySellTransactionIds = "";
    data.sourceInventoryLotId = "";
    data.rebuyCycleId = "";
    state.ui.quickEntry = { ...state.ui.quickEntry, ...data, type: normalizeType(data.transactionType), brokerAccountId: data.brokerAccountId };
    persist();
    render();
    return;
  }
  if (event.target.id === "portfolio-select") {
    state.ui.currentPortfolioId = event.target.value;
    state.ui.activeBrokerAccountId = "";
    state.ui.accountSheetOpen = false;
    state.ui.transactionFilterAccount = "ALL";
    state.ui.inventoryFilterAccount = "ALL";
    persist();
    render();
    return;
  }
  if (event.target.id === "topbar-broker-account") {
    state.ui.activeBrokerAccountId = event.target.value;
    state.ui.transactionFilterAccount = event.target.value;
    state.ui.inventoryFilterAccount = event.target.value;
    persist();
    render();
    return;
  }
  const uiBindings = {
    "transaction-symbol-filter": "transactionFilterSymbol",

    "transaction-type-filter": "transactionFilterType",
    "transaction-status-filter": "transactionFilterStatus",
    "transaction-from-filter": "transactionFilterFrom",
    "transaction-to-filter": "transactionFilterTo",
    "transaction-limit-filter": "transactionLimit",
    "reconciliation-status-filter": "reconciliationFilterStatus",
    "reconciliation-limit-filter": "reconciliationLimit",

    "inventory-symbol-filter": "inventoryFilterSymbol"
  };
  const binding = uiBindings[event.target.id];
  if (binding) {
    state.ui[binding] = event.target.value;
    persist();
    render();
    return;
  }
  if (event.target.id === "transaction-search-filter") {
    state.ui.transactionSearch = event.target.value;
    persist();
    render();
    return;
  }
  if (event.target.id === "report-select") {
    state.ui.report = event.target.value;
    persist();
    render();
  }
}

function onKeydown(event) {
  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(event.target?.tagName)) return;
  const key = event.key.toLowerCase();
  if (key === "b") {
    event.preventDefault();
    openQuickEntry("BUY");
  } else if (key === "s") {
    event.preventDefault();
    openQuickEntry("SELL");
  } else if (key === "d") {
    event.preventDefault();
    openQuickEntry("DEPOSIT");
  } else if (key === "i") {
    event.preventDefault();
    openQuickEntry("INTEREST");
  } else if (key === "w") {
    event.preventDefault();
    openQuickEntry("WITHDRAW");
  }
}

function handleRegister(data) {
  const email = String(data.email || "").trim().toLowerCase();
  const password = String(data.password || "");
  if (state.users.some((user) => user.email === email)) throw new Error("Email 已經註冊");
  const user = {
    id: makeId("user"),
    email,
    name: String(data.name || email).trim(),
    passwordHash: simpleHash(`${email}:${password}`),
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  state.users.push(user);
  state.sessions.currentUserId = user.id;
  ensureStarterData(user.id);
  recomputeAll();
  persist();
  navigate("/app/inventory");
  showToast("帳號已建立");
}

function handleLogin(data) {
  const email = String(data.email || "").trim().toLowerCase();
  const passwordHash = simpleHash(`${email}:${String(data.password || "")}`);
  const user = state.users.find((item) => item.email === email && item.passwordHash === passwordHash);
  if (!user) throw new Error("登入失敗，請確認 Email 與密碼");
  state.sessions.currentUserId = user.id;
  ensureStarterData(user.id);
  recomputeAll();
  persist();
  navigate("/app/inventory");
  showToast("已登入");
}

async function handleGoogleLogin() {
  showToast("正在開啟 Google 登入...");
  const runtime = await getFirebaseRuntime();
  const provider = googleProvider(runtime);
  try {
    const result = await runtime.authModule.signInWithPopup(runtime.auth, provider);
    finishFirebaseLogin(result.user);
  } catch (error) {
    if (isPopupFallbackError(error)) {
      showToast("Popup 被瀏覽器擋住，改用重新導向登入...");
      await runtime.authModule.signInWithRedirect(runtime.auth, provider);
      return;
    }
    throw error;
  }
}

function googleProvider(runtime) {
  const provider = new runtime.authModule.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}

function finishFirebaseLogin(firebaseUser) {
  const user = upsertFirebaseUser(firebaseUser);
  state.sessions.currentUserId = user.id;
  ensureStarterData(user.id);
  recomputeAll();
  persist();
  navigate("/app/inventory");
  showToast("已使用 Google 登入，正在比對 Firebase 與本機資料...");
  smartFirebaseSync({ silent: true }).catch((error) => {
    console.warn(error);
    showToast(`Firebase 初始同步失敗：${formatFirebaseError(error)}`);
  });
}

async function completeGoogleRedirectLogin() {
  try {
    const runtime = await getFirebaseRuntime();
    const result = await runtime.authModule.getRedirectResult(runtime.auth);
    if (result?.user) finishFirebaseLogin(result.user);
  } catch (error) {
    if (String(error?.code || "").includes("auth/no-auth-event")) return;
    console.warn(error);
    showToast(formatFirebaseError(error));
  }
}

function isPopupFallbackError(error) {
  const code = String(error?.code || "");
  return code.includes("popup-blocked") || code.includes("popup-closed-by-user") || code.includes("operation-not-supported-in-this-environment");
}

function upsertFirebaseUser(firebaseUser) {
  const email = String(firebaseUser.email || `${firebaseUser.uid}@firebase.local`).toLowerCase();
  let user = state.users.find((item) => item.firebaseUid === firebaseUser.uid) || state.users.find((item) => item.email === email);
  if (!user) {
    user = {
      id: `firebase-${firebaseUser.uid}`,
      email,
      name: firebaseUser.displayName || email,
      passwordHash: "",
      authProvider: "google",
      firebaseUid: firebaseUser.uid,
      photoURL: firebaseUser.photoURL || "",
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    state.users.push(user);
  } else {
    user.name = firebaseUser.displayName || user.name || email;
    user.authProvider = "google";
    user.firebaseUid = firebaseUser.uid;
    user.photoURL = firebaseUser.photoURL || user.photoURL || "";
    user.updatedAt = nowIso();
  }
  return user;
}

function handleForgotPassword(data) {
  const email = String(data.email || "").trim().toLowerCase();
  auditLog("FORGOT_PASSWORD_REQUEST", "user", email, null, { email }, "");
  persist();
  navigate("/login");
  showToast("已建立重設紀錄");
}

function handleLogout() {
  state.sessions.currentUserId = null;
  persist();
  navigate("/login");
}

function handlePortfolioCreate(data) {
  const user = currentUser();
  const portfolioId = makeId("portfolio");
  const portfolio = {
    id: portfolioId,
    userId: user.id,
    name: String(data.name || "").trim(),
    baseCurrency: String(data.baseCurrency || "TWD").trim().toUpperCase(),
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  state.portfolios.push(portfolio);
  state.portfolioMembers.push({ id: makeId("member"), portfolioId, userId: user.id, role: "OWNER", createdAt: nowIso(), updatedAt: nowIso() });
  state.settings.portfolios[portfolioId] = defaultPortfolioSettings();
  state.ui.currentPortfolioId = portfolioId;
  auditLog("CREATE", "portfolio", portfolioId, null, portfolio, portfolioId);
  commit("Portfolio 已建立");
}

function handleBrokerAccountCreate(data) {
  const user = currentUser();
  const portfolioId = selectedPortfolioId();
  if (!portfolioId) throw new Error("請先建立 Portfolio");
  const account = {
    id: makeId("broker-account"),
    userId: user.id,
    portfolioId,
    brokerId: data.brokerId,
    accountName: String(data.accountName || "").trim(),
    accountNoMasked: String(data.accountNoMasked || "").trim(),
    branchName: String(data.branchName || "").trim(),
    currency: String(data.currency || "TWD").trim().toUpperCase(),
    isDefault: data.isDefault === "true",
    isActive: true,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  if (account.isDefault) {
    for (const other of state.brokerAccounts.filter((item) => item.portfolioId === portfolioId)) other.isDefault = false;
  }
  state.brokerAccounts.push(account);
  state.cashAccounts.push({
    id: makeId("cash-account"),
    portfolioId,
    brokerAccountId: account.id,
    currency: account.currency,
    accountType: "BROKER_SETTLEMENT",
    name: `${brokerName(account.brokerId)}交割戶`,
    isActive: true,
    createdAt: nowIso(),
    updatedAt: nowIso()
  });
  auditLog("CREATE", "broker_account", account.id, null, account, portfolioId);
  commit("券商帳戶已建立");
}

async function handleImportFile(form, data) {
  const file = form.elements.importFile.files[0];
  if (!file) throw new Error("請選擇檔案");
  const text = await file.text();
  const context = importContext(data, file.name);
  if (data.sourceType === "JSON_LEDGER") {
    importJsonLedger(text, context);
  } else {
    importBrokerCsv(text, context);
  }
  commit("匯入完成");
  promptBrokerDiffConfirmation("匯入完成，對帳發現差異");
}

function handleTemplateCreate(data) {
  let mapping = DEFAULT_TEMPLATE.columnMapping;
  if (String(data.columnMapping || "").trim()) {
    mapping = JSON.parse(data.columnMapping);
  }
  const template = {
    id: makeId("tpl"),
    brokerId: data.brokerId,
    templateName: String(data.templateName || "").trim(),
    fileType: "CSV",
    encoding: "UTF-8-BOM",
    headerDetectionRule: "find mapped header",
    dateFormat: String(data.dateFormat || "YYYY/MM/DD"),
    numberFormat: String(data.numberFormat || "comma"),
    sideBuyValues: ["現買", "買進"],
    sideSellValues: ["現賣", "賣出"],
    columnMapping: mapping,
    isDefault: false,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  state.importTemplates.push(template);
  auditLog("CREATE", "broker_import_template", template.id, null, template, selectedPortfolioId());
  commit("匯入模板已建立");
}

function openQuickEntry(type, defaults = {}) {
  state.ui.quickActionSheetOpen = false;
  state.ui.quickEntry = { brokerAccountId: selectedBrokerAccountId(), type: normalizeType(type), ...defaults };
  persist();
  render();
  window.setTimeout(() => document.querySelector(".quick-entry-sheet input, .quick-entry-sheet select")?.focus(), 80);
}

function closeQuickEntry() {
  state.ui.quickEntry = null;
  persist();
  render();
}

function handleMatchLotToggle(button) {
  const picker = button.closest(".match-picker");
  if (!picker) return;
  const input = picker.querySelector('input[name="linkedBuyTransactionId"], input[name="rebuySellTransactionIds"], input[name="sourceInventoryLotId"], input[name="rebuyCycleId"], input[data-match-buy]');
  if (!input) return;
  const matchIds = parseLinkedBuyIds(button.dataset.matchIds || button.dataset.matchId);
  let ids = parseLinkedBuyIds(input.value);
  const isSingleSelect = ["rebuyCycleId"].includes(input.name);
  
  if (isSingleSelect) {
    const hasAll = matchIds.every((id) => ids.includes(id));
    if (hasAll) {
      ids = [];
    } else {
      ids = [matchIds[0]];
    }
  } else {
    const hasAll = matchIds.every((id) => ids.includes(id));
    if (hasAll) {
      for (const matchId of matchIds) {
        const existingIndex = ids.indexOf(matchId);
        if (existingIndex >= 0) ids.splice(existingIndex, 1);
      }
    } else {
      for (const matchId of matchIds) {
        if (!ids.includes(matchId)) ids.push(matchId);
      }
    }
  }
  refreshMatchPicker(picker, ids);
}

function handleClearMatchPicker(button) {
  const picker = button.closest(".match-picker");
  if (picker) refreshMatchPicker(picker, []);
}

function refreshMatchPicker(picker, ids) {
  const input = picker.querySelector('input[name="linkedBuyTransactionId"], input[name="rebuySellTransactionIds"], input[name="sourceInventoryLotId"], input[name="rebuyCycleId"], input[data-match-buy]');
  if (input) input.value = ids.join(",");
  picker.querySelectorAll(".match-lot-card").forEach((card) => {
    const cardIds = parseLinkedBuyIds(card.dataset.matchIds || card.dataset.matchId);
    const indexes = cardIds.map((id) => ids.indexOf(id)).filter((index) => index >= 0);
    const selected = indexes.length > 0;
    const order = selected ? Math.min(...indexes) + 1 : 0;
    card.classList.toggle("selected", selected);
    card.setAttribute("aria-pressed", selected ? "true" : "false");
    const rank = card.querySelector(".match-rank");
    if (rank) rank.textContent = selected ? String(order) : "";
  });
  const list = picker.querySelector(".match-picker-list");
  if (list) {
    Array.from(list.querySelectorAll(".match-lot-card"))
      .sort((a, b) => {
        const aIds = parseLinkedBuyIds(a.dataset.matchIds || a.dataset.matchId);
        const bIds = parseLinkedBuyIds(b.dataset.matchIds || b.dataset.matchId);
        const aIndexes = aIds.map((id) => ids.indexOf(id)).filter((index) => index >= 0);
        const bIndexes = bIds.map((id) => ids.indexOf(id)).filter((index) => index >= 0);
        const aIndex = aIndexes.length ? Math.min(...aIndexes) : -1;
        const bIndex = bIndexes.length ? Math.min(...bIndexes) : -1;
        if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex;
        if (aIndex >= 0) return -1;
        if (bIndex >= 0) return 1;
        return 0;
      })
      .forEach((card) => list.appendChild(card));
  }
  const lots = Array.from(picker.querySelectorAll(".match-lot-card")).map((card) => ({
    value: card.dataset.matchId,
    ids: parseLinkedBuyIds(card.dataset.matchIds || card.dataset.matchId),
    price: card.dataset.matchPrice || card.querySelector(".match-price")?.textContent?.replace("@", "") || "",
    shares: card.dataset.matchShares || card.querySelector(".match-shares")?.textContent?.replace("股", "") || ""
  }));
  if (input?.name === "rebuySellTransactionIds" && ids.length) {
    const sheet = input.closest(".quick-entry-sheet");
    const intentSelect = sheet?.querySelector('select[name="buyIntent"]');
    if (intentSelect) intentSelect.value = "REBUY";
    const rebuyField = sheet?.querySelector("[data-rebuy-intent-field]");
    if (rebuyField) rebuyField.hidden = false;
  }
  const summary = picker.querySelector(".match-picker-summary");
  if (summary) {
    const selectedLots = orderedMatchLots(lots, ids).filter((lot) => matchOptionSelected(lot, ids));
    summary.textContent = selectedLots.length
      ? `已選 ${selectedLots.length} 項，扣除順序：${selectedLots.map((lot) => `@${lot.price} ${lot.shares}股`).join(" / ")}`
      : "可選多筆，先點的會先扣；價格在前，股數在後。";
  }
}

async function handleQuickEntrySubmit(data) {
  let type = normalizeType(data.transactionType);
  const incomeType = normalizeType(data.incomeType);
  if (["INTEREST", "DIVIDEND"].includes(incomeType)) type = incomeType;
  const portfolioId = selectedPortfolioId();
  const account = state.brokerAccounts.find((item) => item.id === data.brokerAccountId && item.portfolioId === portfolioId);
  if (!account) throw new Error("請先選擇券商帳戶");

  const isEdit = Boolean(data.id);

  if (isEdit) {
    const ok1 = window.confirm("您確定要修改此筆交易紀錄嗎？");
    if (!ok1) return;
    const ok2 = window.confirm("修改交易將會重新計算所有庫存與損益，請再次確認！");
    if (!ok2) return;

    const tx = state.appTransactions.find((t) => t.id === data.id);
    if (!tx) throw new Error("找不到要修改的交易");
    const oldTx = clone(tx);

    state.ui.quickEntry = null;

    if (["DEPOSIT", "WITHDRAW", "INTEREST", "DIVIDEND"].includes(type)) {
      tx.tradeDate = parseDate(data.tradeDate);
      tx.brokerAccountId = account.id;
      tx.brokerId = account.brokerId;
      tx.securityId = ensureSecurity(getPortfolioSettings(portfolioId).defaultSecurity || "0050", "現金").id;
      tx.price = toNumber(data.amount);
      tx.shares = 0;
      tx.fee = 0;
      tx.tax = 0;
      tx.strategyCategory = ["INTEREST", "DIVIDEND"].includes(type) ? type : "CORE";
      tx.linkedBuyTransactionId = "";
      tx.rebuySellTransactionIds = "";
      tx.buyIntent = "";
      tx.borrowRebuyType = "";
      tx.sourceInventoryLotId = "";
      tx.rebuyCycleId = "";
    } else {
      const securityForCosts = ensureSecurity(data.symbol, data.securityName);
      const autoCosts = estimateTradeCosts(type, data.price, data.shares, account.brokerId, securityForCosts);
      const fee = String(data.fee ?? "").trim() === "" ? autoCosts.fee : toNumber(data.fee);
      const tax = String(data.tax ?? "").trim() === "" ? autoCosts.tax : toNumber(data.tax);
      
      let borrowRebuyType = "";
      let sourceInventoryLotId = "";
      let rebuyCycleId = "";
      let buyIntent = "";
      let rebuySellIds = [];

      if (type === "SELL") {
        const sellFields = resolveSellMatchingFields(data);
        borrowRebuyType = sellFields.borrowRebuyType;
        data.linkedBuyTransactionId = sellFields.linkedBuyTransactionId;
        if (borrowRebuyType === "BORROW_SELL") {
          sourceInventoryLotId = validateBorrowSellSourceLots(sellFields.sourceInventoryLotId, data.shares, account, securityForCosts.id, portfolioId, data.id);
        }
      } else if (type === "BUY") {
        const buyType = String(data.buyType || "").trim();
        if (buyType === "BORROW_REBUY") {
          borrowRebuyType = "REBUY_FILL";
          rebuyCycleId = String(data.rebuyCycleId || "").trim();
          if (!rebuyCycleId) throw new Error("請選擇回補借券任務。");
          
          const cycle = state.borrowRebuyCycles.find((c) => c.id === rebuyCycleId);
          if (!cycle) throw new Error("找不到對應的借券任務。");
          const shares = toNumber(data.shares);
          const currentSharesInCycle = isEdit ? oldTx.shares : 0;
          if (shares > (cycle.remainingRebuyQty + currentSharesInCycle)) {
            throw new Error(`回補股數 (${shares} 股) 不可超過待回補股數 (${cycle.remainingRebuyQty + currentSharesInCycle} 股)。`);
          }
        } else if (buyType === "REBUY") {
          buyIntent = "REBUY";
          rebuySellIds = parseRebuySellIds(data.rebuySellTransactionIds);
          if (!rebuySellIds.length) throw new Error("請選擇要回補哪幾筆賣出；如果不是回補，請選一般買進。");
          const tasksBySellId = new Map(state.rebuyTasks.map((task) => [task.sellTransactionId, task]));
          for (const sellId of rebuySellIds) {
            const task = tasksBySellId.get(sellId);
            const currentLinked = String(oldTx.rebuySellTransactionIds || "").split(/[,\s]+/).includes(sellId);
            if (!currentLinked && (!task || rebuyTaskIsArchived(task))) throw new Error("選到的回補任務不存在或已完成，請重新選擇。");
            if (task.portfolioId !== portfolioId) throw new Error("選到的回補任務不屬於目前帳本，請重新選擇。");
            if (task.securityId !== securityForCosts.id) throw new Error("選到的回補任務和買入股票不同，請重新選擇。");
            if (task.brokerAccountId !== account.id) throw new Error("選到的回補任務屬於不同券商帳戶，請切換帳戶或改選。");
          }
        } else {
          buyIntent = "NEW";
        }
      }

      tx.tradeDate = parseDate(data.tradeDate);
      tx.brokerAccountId = account.id;
      tx.brokerId = account.brokerId;
      tx.securityId = securityForCosts.id;
      tx.price = toNumber(data.price);
      tx.shares = toNumber(data.shares);
      tx.fee = fee;
      tx.tax = tax;
      tx.strategyCategory = buyIntent === "REBUY" ? "REBUY" : data.strategyCategory || (type === "BUY" ? "TRADING" : "LONG_TERM");
      tx.linkedBuyTransactionId = borrowRebuyType === SELL_TYPE_BORROW ? "" : (data.linkedBuyTransactionId || "");
      tx.rebuySellTransactionIds = buyIntent === "REBUY" ? rebuySellIds.join(",") : "";
      tx.buyIntent = type === "BUY" ? buyIntent : "";
      tx.borrowRebuyType = borrowRebuyType;
      tx.sourceInventoryLotId = sourceInventoryLotId;
      tx.rebuyCycleId = rebuyCycleId;
    }

    tx.note = String(data.note || "").trim();
    tx.updatedAt = nowIso();

    const benchmarkFields = await benchmarkFieldsForTransaction(portfolioId, account.id, type, tx.tradeDate);
    Object.assign(tx, benchmarkFields);
    normalizeTransaction(tx);

    auditLog("UPDATE", "app_transaction", tx.id, oldTx, tx, portfolioId);
    commit("交易已修改");
    return;
  }

  state.ui.quickEntry = null;
  if (["DEPOSIT", "WITHDRAW", "INTEREST", "DIVIDEND"].includes(type)) {
    await handleManualTransaction({
      tradeDate: data.tradeDate,
      brokerAccountId: account.id,
      symbol: getPortfolioSettings(portfolioId).defaultSecurity || "0050",
      securityName: "現金",
      transactionType: type,
      price: data.amount,
      shares: 0,
      fee: 0,
      tax: 0,
      strategyCategory: ["INTEREST", "DIVIDEND"].includes(type) ? type : "CORE",
      linkedBuyTransactionId: "",
      note: data.note
    });
    showToast(`${tradeTypeLabel(type)}已記錄`);
    return;
  }
  const securityForCosts = ensureSecurity(data.symbol, data.securityName);
  const autoCosts = estimateTradeCosts(type, data.price, data.shares, account.brokerId, securityForCosts);
  const fee = String(data.fee ?? "").trim() === "" ? autoCosts.fee : toNumber(data.fee);
  const tax = String(data.tax ?? "").trim() === "" ? autoCosts.tax : toNumber(data.tax);
  
  let borrowRebuyType = "";
  let sourceInventoryLotId = "";
  let rebuyCycleId = "";
  let buyIntent = "";
  let rebuySellIds = [];

  if (type === "SELL") {
    const sellFields = resolveSellMatchingFields(data);
    borrowRebuyType = sellFields.borrowRebuyType;
    data.linkedBuyTransactionId = sellFields.linkedBuyTransactionId;
    if (borrowRebuyType === "BORROW_SELL") {
      sourceInventoryLotId = validateBorrowSellSourceLots(sellFields.sourceInventoryLotId, data.shares, account, securityForCosts.id, portfolioId);
    }
  } else if (type === "BUY") {
    const buyType = String(data.buyType || "").trim();
    if (buyType === "BORROW_REBUY") {
      borrowRebuyType = "REBUY_FILL";
      rebuyCycleId = String(data.rebuyCycleId || "").trim();
      if (!rebuyCycleId) throw new Error("請選擇回補借券任務。");
      
      const cycle = state.borrowRebuyCycles.find((c) => c.id === rebuyCycleId);
      if (!cycle) throw new Error("找不到對應的借券任務。");
      const shares = toNumber(data.shares);
      if (shares > cycle.remainingRebuyQty) {
        throw new Error(`回補股數 (${shares} 股) 不可超過待回補股數 (${cycle.remainingRebuyQty} 股)。`);
      }
    } else if (buyType === "REBUY") {
      buyIntent = "REBUY";
      rebuySellIds = parseRebuySellIds(data.rebuySellTransactionIds);
      if (!rebuySellIds.length) throw new Error("請選擇要回補哪幾筆賣出；如果不是回補，請選一般買進。");
      const tasksBySellId = new Map(state.rebuyTasks.map((task) => [task.sellTransactionId, task]));
      for (const sellId of rebuySellIds) {
        const task = tasksBySellId.get(sellId);
        if (!task || rebuyTaskIsArchived(task)) throw new Error("選到的回補任務不存在或已完成，請重新選擇。");
        if (task.portfolioId !== portfolioId) throw new Error("選到的回補任務不屬於目前帳本，請重新選擇。");
        if (task.securityId !== securityForCosts.id) throw new Error("選到的回補任務和買入股票不同，請重新選擇。");
        if (task.brokerAccountId !== account.id) throw new Error("選到的回補任務屬於不同券商帳戶，請切換帳戶或改選。");
      }
    } else {
      buyIntent = "NEW";
    }
  }

  await handleManualTransaction({
    tradeDate: data.tradeDate,
    brokerAccountId: account.id,
    symbol: data.symbol,
    securityName: data.securityName,
    transactionType: type,
    price: data.price,
    shares: data.shares,
    fee,
    tax,
    strategyCategory: buyIntent === "REBUY" ? "REBUY" : data.strategyCategory || (type === "BUY" ? "TRADING" : "LONG_TERM"),
    linkedBuyTransactionId: borrowRebuyType === SELL_TYPE_BORROW ? "" : (data.linkedBuyTransactionId || ""),
    rebuySellTransactionIds: buyIntent === "REBUY" ? rebuySellIds.join(",") : "",
    buyIntent: type === "BUY" ? buyIntent : "",
    borrowRebuyType,
    sourceInventoryLotId,
    rebuyCycleId,
    note: data.note
  });
  showToast(`${type === "BUY" ? "買進" : "賣出"}已記錄；請記得上傳同日券商交易紀錄對帳。`);
}

function handleEditTransaction(id) {
  const tx = state.appTransactions.find((t) => t.id === id);
  if (!tx) {
    showToast("找不到該筆交易");
    return;
  }
  const security = securityById(tx.securityId);
  openQuickEntry(tx.transactionType, {
    id: tx.id,
    tradeDate: tx.tradeDate,
    brokerAccountId: tx.brokerAccountId,
    symbol: security?.symbol || "",
    securityName: security?.name || "",
    price: tx.price,
    amount: tx.price,
    shares: tx.shares,
    fee: tx.fee,
    tax: tx.tax,
    strategyCategory: tx.strategyCategory,
    linkedBuyTransactionId: tx.linkedBuyTransactionId,
    rebuySellTransactionIds: tx.rebuySellTransactionIds,
    buyIntent: tx.buyIntent,
    borrowRebuyType: tx.borrowRebuyType,
    sourceInventoryLotId: tx.sourceInventoryLotId,
    rebuyCycleId: tx.rebuyCycleId,
    note: tx.note
  });
}

function estimateTradeCosts(type, price, shares, brokerId, security = null) {
  const gross = toNumber(price) * toNumber(shares);
  if (gross <= 0) return { fee: 0, tax: 0 };
  const feeSetting = brokerFeeSetting(brokerId);
  const rawFee = gross * toNumber(feeSetting.feeRate) * toNumber(feeSetting.discountRate);
  const fee = Math.max(toNumber(feeSetting.minFee), Math.floor(rawFee));
  const taxRate = security ? securityTaxRate(security, feeSetting) : toNumber(feeSetting.stockSellTaxRate ?? feeSetting.sellTaxRate ?? 0.003);
  const tax = type === "SELL" ? Math.floor(gross * taxRate) : 0;
  return { fee, tax };
}
async function handleQuickTrade(type) {
  const portfolioId = selectedPortfolioId();
  const accounts = scopedBrokerAccounts(portfolioId);
  if (!accounts.length) throw new Error("請先建立券商帳戶");
  const account = selectAccountForQuickEntry(accounts);
  if (!account) return;
  const symbol = promptText("股票代號", getPortfolioSettings(portfolioId).defaultSecurity || "0050");
  if (symbol === null) return;
  const securityName = promptText("股票名稱", symbol === "0050" ? "元大台灣50" : symbol);
  if (securityName === null) return;
  const tradeDate = promptText("交易日期 YYYY-MM-DD", today());
  if (tradeDate === null) return;
  const price = promptText(`${type === "BUY" ? "買進" : "賣出"}價格`, "");
  if (price === null) return;
  const shares = promptText("股數", "100");
  if (shares === null) return;
  const fee = promptText("手續費", "0");
  if (fee === null) return;
  const tax = promptText("交易稅", type === "SELL" ? "0" : "0");
  if (tax === null) return;
  let linkedBuyTransactionId = "";
  if (type === "SELL") {
    linkedBuyTransactionId = chooseLinkedBuyForQuickSell(account.id, symbol, tradeDate) || "";
  }
  const note = promptText("備註", `快捷${type === "BUY" ? "買進" : "賣出"}`);
  if (note === null) return;
  await handleManualTransaction({
    tradeDate,
    brokerAccountId: account.id,
    symbol,
    securityName,
    transactionType: type,
    price,
    shares,
    fee,
    tax,
    strategyCategory: type === "BUY" ? "TRADING" : "LONG_TERM",
    linkedBuyTransactionId,
    note
  });
  showToast(`${type === "BUY" ? "買進" : "賣出"}已記錄；請記得上傳同日券商交易紀錄對帳。`);
}

async function handleQuickCash(type) {
  const portfolioId = selectedPortfolioId();
  const accounts = scopedBrokerAccounts(portfolioId);
  if (!accounts.length) throw new Error("請先建立券商帳戶");
  const account = selectAccountForQuickEntry(accounts);
  if (!account) return;
  const tradeDate = promptText("日期 YYYY-MM-DD", today());
  if (tradeDate === null) return;
  const amount = promptText(type === "WITHDRAW" ? "出金金額" : type === "DIVIDEND" ? "股息金額" : type === "INTEREST" ? "存款利息金額" : "入金金額", "");
  if (amount === null) return;
  const note = promptText("備註", type === "WITHDRAW" ? "快捷出金" : type === "DIVIDEND" ? "股息" : type === "INTEREST" ? "存款利息" : "快捷入金");
  if (note === null) return;
  await handleManualTransaction({
    tradeDate,
    brokerAccountId: account.id,
    symbol: getPortfolioSettings(portfolioId).defaultSecurity || "0050",
    securityName: "現金",
    transactionType: type,
    price: amount,
    shares: 0,
    fee: 0,
    tax: 0,
    strategyCategory: ["INTEREST", "DIVIDEND"].includes(type) ? type : "CORE",
    linkedBuyTransactionId: "",
    note
  });
  showToast(`${tradeTypeLabel(type)}已記錄`);
}

function selectAccountForQuickEntry(accounts) {
  if (accounts.length === 1) return accounts[0];
  const options = accounts.map((account, index) => `${index + 1}. ${accountName(account.id)}`).join("\n");
  const answer = window.prompt(`選擇券商帳戶：\n${options}`, "1");
  if (answer === null) return null;
  const index = Number(answer) - 1;
  return accounts[index] || accounts[0];
}

function chooseLinkedBuyForQuickSell(accountId, symbol, tradeDate) {
  const cleanSymbol = String(symbol || "").trim().toUpperCase();
  const security = state.securities.find((item) => item.symbol.toUpperCase() === cleanSymbol);
  if (!security) return "";
  const lots = state.buyLots.filter((lot) => lot.brokerAccountId === accountId && lot.securityId === security.id && lot.remainingShares > 0 && lot.buyDate <= parseDate(tradeDate));
  if (!lots.length) return "";
  const options = lots
    .slice(0, 12)
    .map((lot, index) => `${index + 1}. ${lot.buyDate} @ ${fmtPrice(lot.buyPrice)} 剩 ${fmtNum(lot.remainingShares)}股 [${lot.sourceTransactionId || lot.buyTransactionId}]`)
    .join("\n");
  const answer = window.prompt(`選擇要配對的買進 lot，取消可先不配對：\n${options}`, "1");
  if (answer === null || answer.trim() === "") return "";
  const index = Number(answer) - 1;
  const lot = lots[index];
  return lot ? lot.sourceTransactionId || lot.buyTransactionId : "";
}
function handleOpenQuoteSync() {
  const panel = document.querySelector("#quote-sync-panel");
  if (!panel) return;
  panel.open = true;
  panel.scrollIntoView({ behavior: "smooth", block: "center" });
  window.setTimeout(() => panel.querySelector("input")?.focus(), 120);
}

function handleQuoteSync(data) {
  const portfolioId = selectedPortfolioId();
  const user = currentUser();
  const quoteTime = nowIso();
  const updates = [];
  for (const [key, value] of Object.entries(data)) {
    if (!key.startsWith("quote__")) continue;
    const securityId = key.slice("quote__".length);
    const price = toNumber(value);
    if (price <= 0) continue;
    const security = securityById(securityId);
    if (!security) continue;
    const id = quoteRecordIdFor(portfolioId, securityId);
    const existing = state.marketQuotes.find((quote) => quote.id === id);
    updates.push({
      ...(existing || {}),
      id,
      userId: user?.id || "",
      portfolioId,
      securityId,
      symbol: security.symbol,
      price: roundMoney(price),
      quoteTime,
      source: "MANUAL_SPARK",
      createdAt: existing?.createdAt || quoteTime,
      updatedAt: quoteTime
    });
  }
  if (!updates.length) throw new Error("請至少輸入一檔股票現價");
  const updateIds = new Set(updates.map((quote) => quote.id));
  const before = clone(state.marketQuotes.filter((quote) => updateIds.has(quote.id)));
  state.marketQuotes = state.marketQuotes.filter((quote) => !updateIds.has(quote.id)).concat(updates);
  auditLog("UPDATE", "market_quote", portfolioId, marketQuoteAuditSnapshot(before), marketQuoteAuditSnapshot(updates), portfolioId);
  commit("現價已更新");
}
async function handleYahooQuoteSync(options = {}) {
  const silent = options.silent === true;
  const portfolioId = selectedPortfolioId();
  const securities = heldSecuritiesForLots(state.buyLots.filter((lot) => lot.portfolioId === portfolioId && lot.remainingShares > 0));
  if (!securities.length) throw new Error("目前沒有持股可抓現價");
  if (!silent) showToast("正在抓 Yahoo 現價...");
  const quoteTime = nowIso();
  const results = await Promise.all(
    securities.map(async (security) => {
      try {
        const quote = await fetchMarketQuote(security);
        const id = quoteRecordIdFor(portfolioId, security.id);
        const existing = state.marketQuotes.find((item) => item.id === id);
        return {
          ok: true,
          quote: {
            ...(existing || {}),
            id,
            userId: currentUser()?.id || "",
            portfolioId,
            securityId: security.id,
            symbol: security.symbol,
            yahooSymbol: yahooSymbolForSecurity(security),
            finmindStockId: finmindStockIdForSecurity(security),
            price: roundMoney(quote.price),
            quoteTime: quote.quoteTime || quoteTime,
            source: quote.source,
            sourceDate: quote.sourceDate || "",
            createdAt: existing?.createdAt || quoteTime,
            updatedAt: quoteTime
          }
        };
      } catch (error) {
        return { ok: false, failure: `${security.symbol}: ${error.message}` };
      }
    })
  );
  const updates = results.filter((result) => result.ok).map((result) => result.quote);
  const failures = results.filter((result) => !result.ok).map((result) => result.failure);
  if (!updates.length) throw new Error(`現價抓取失敗，可先手動輸入。${failures[0] || ""}`);
  const updateIds = new Set(updates.map((quote) => quote.id));
  const before = clone(state.marketQuotes.filter((quote) => updateIds.has(quote.id)));
  state.marketQuotes = state.marketQuotes.filter((quote) => !updateIds.has(quote.id)).concat(updates);
  auditLog("UPDATE", "market_quote", portfolioId, marketQuoteAuditSnapshot(before), marketQuoteAuditSnapshot(updates), portfolioId);
  if (silent) {
    persist();
    render();
  } else {
    commit(`現價已更新 ${updates.length} 檔${failures.length ? `，${failures.length} 檔失敗` : ""}`);
  }
}

async function fetchMarketQuote(security) {
  const attempts = [fetchYahooQuote, fetchTwseQuote, fetchFinMindQuote];
  const errors = [];
  for (const attempt of attempts) {
    try {
      return await attempt(security);
    } catch (error) {
      errors.push(error.message);
    }
  }
  throw new Error(errors.filter(Boolean).slice(-2).join(" / ") || "沒有可用現價來源");
}

async function fetchFinMindQuote(security) {
  const stockId = finmindStockIdForSecurity(security);
  if (!stockId || !/^\d{4,6}[A-Z]?$/.test(stockId)) throw new Error("FinMind 僅支援台股代號");
  const endDate = today();
  const startDate = dateDaysAgo(14);
  const apiUrl = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=${encodeURIComponent(stockId)}&start_date=${startDate}&end_date=${endDate}`;
  const attempts = [
    { url: apiUrl, source: "FINMIND_DAILY_CLOSE" },
    { url: readerProxyUrl(apiUrl), source: "FINMIND_DAILY_CLOSE_READER" }
  ];
  let lastError = "";
  for (const attempt of attempts) {
    try {
      const data = await fetchJsonWithTimeout(attempt.url, 9000);
      if (data.status && Number(data.status) !== 200) throw new Error(data.msg || `FinMind ${data.status}`);
      const rows = Array.isArray(data.data) ? data.data : [];
      const latest = rows
        .filter((row) => toNumber(row.close) > 0)
        .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))[0];
      if (!latest) throw new Error("FinMind 無最近收盤價");
      return {
        price: toNumber(latest.close),
        source: attempt.source,
        sourceDate: latest.date,
        quoteTime: latest.date ? `${latest.date}T13:30:00+08:00` : nowIso()
      };
    } catch (error) {
      lastError = error.message;
    }
  }
  throw new Error(lastError || "FinMind 無回應");
}

async function fetchTwseQuote(security) {
  const stockId = finmindStockIdForSecurity(security);
  if (!stockId || !/^\d{4,6}[A-Z]?$/.test(stockId)) throw new Error("TWSE 僅支援台股代號");
  const market = String(security?.market || "TW").trim().toUpperCase();
  const exchange = market === "TWO" || market === "OTC" ? "otc" : "tse";
  const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${exchange}_${encodeURIComponent(stockId)}.tw&json=1&delay=0`;
  const data = await fetchJsonWithTimeout(url, 7000);
  const row = Array.isArray(data.msgArray) ? data.msgArray[0] : null;
  const price = toNumber(row?.z) || toNumber(row?.pz) || toNumber(row?.y);
  if (price <= 0) throw new Error("TWSE 無有效價格");
  return {
    price,
    source: "TWSE_SNAPSHOT",
    sourceDate: row?.d ? `${String(row.d).slice(0, 4)}-${String(row.d).slice(4, 6)}-${String(row.d).slice(6, 8)}` : today(),
    quoteTime: nowIso()
  };
}

async function fetchYahooQuote(security) {
  const yahooSymbol = yahooSymbolForSecurity(security);
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=1d&interval=1m`;
  const attempts = [
    { url: yahooUrl, source: "YAHOO_FINANCE" },
    { url: readerProxyUrl(yahooUrl), source: "YAHOO_FINANCE_READER" },
    { url: `https://api.allorigins.win/raw?url=${encodeURIComponent(yahooUrl)}`, source: "YAHOO_FINANCE_PROXY" }
  ];
  let lastError = "";
  for (const attempt of attempts) {
    try {
      const data = await fetchJsonWithTimeout(attempt.url, 7000);
      const price = parseYahooChartPrice(data);
      if (price <= 0) throw new Error("Yahoo 沒有價格");
      return { yahooSymbol, price, source: attempt.source, sourceDate: today(), quoteTime: nowIso() };
    } catch (error) {
      lastError = error.message;
    }
  }
  throw new Error(lastError || "Yahoo 無回應");
}

function readerProxyUrl(url) {
  return `https://r.jina.ai/http://${String(url || "").replace(/^https?:\/\//, "")}`;
}

async function fetchJsonWithTimeout(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return parseMaybeWrappedJson(text);
  } finally {
    window.clearTimeout(timer);
  }
}

function parseMaybeWrappedJson(text) {
  const raw = String(text || "").trim();
  if (!raw) throw new Error("空白回應");
  try {
    return JSON.parse(raw);
  } catch {}
  const jsonStart = raw.indexOf("{");
  const jsonEnd = raw.lastIndexOf("}");
  if (jsonStart >= 0 && jsonEnd > jsonStart) return JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
  throw new Error("回應不是 JSON");
}

function parseYahooChartPrice(data) {
  const result = data?.chart?.result?.[0];
  const metaPrice = toNumber(result?.meta?.regularMarketPrice || result?.meta?.previousClose);
  if (metaPrice > 0) return metaPrice;
  const quotes = result?.indicators?.quote?.[0]?.close || [];
  for (let i = quotes.length - 1; i >= 0; i -= 1) {
    const price = toNumber(quotes[i]);
    if (price > 0) return price;
  }
  return 0;
}

function finmindStockIdForSecurity(security) {
  return String(security?.symbol || "").trim().toUpperCase().replace(/\.(TW|TWO)$/i, "");
}

function dateDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function yahooSymbolForSecurity(security) {
  const explicit = String(security?.yahooSymbol || "").trim().toUpperCase();
  if (explicit) return explicit;
  const symbol = String(security?.symbol || "").trim().toUpperCase();
  if (!symbol) return "";
  if (symbol.includes(".")) return symbol;
  const market = String(security?.market || "TW").trim().toUpperCase();
  if (market === "TWO" || market === "OTC") return `${symbol}.TWO`;
  if (market === "US") return symbol;
  return `${symbol}.TW`;
}
function handleSellLot(buyTransactionId) {
  const lot = state.buyLots.find((item) => item.buyTransactionId === buyTransactionId || item.sourceTransactionId === buyTransactionId);
  if (!lot || lot.remainingShares <= 0) throw new Error("找不到可賣出的庫存 lot");
  const security = securityById(lot.securityId);
  const sameInventoryLots = state.buyLots
    .filter((item) => item.remainingShares > 0 && item.brokerAccountId === lot.brokerAccountId && item.securityId === lot.securityId)
    .sort((a, b) => {
      if (a.id === lot.id) return -1;
      if (b.id === lot.id) return 1;
      return sortByBuyDateDesc(a, b);
    });
  openQuickEntry("SELL", {
    brokerAccountId: lot.brokerAccountId,
    symbol: security?.symbol || getPortfolioSettings(lot.portfolioId).defaultSecurity || "0050",
    securityName: security?.name || security?.symbol || "",
    shares: lot.remainingShares,
    strategyCategory: lot.strategyCategory || "LONG_TERM",
    linkedBuyTransactionId: sameInventoryLots.map((item) => item.sourceTransactionId || item.buyTransactionId).join(","),
    note: `由庫存 ${lot.buyDate} @ ${fmtPrice(lot.buyPrice)} 賣出；可直接把股數改大，系統會依已選順序跨多個價位扣庫存`
  });
}


async function benchmarkFieldsForTransaction(portfolioId, brokerAccountId, transactionType, tradeDate) {
  const type = normalizeType(transactionType);
  if (!["DEPOSIT", "WITHDRAW"].includes(type)) return {};
  const security = benchmarkSecurity(portfolioId);
  const quote = await captureBenchmarkQuote(portfolioId, security, tradeDate);
  if (!quote.price) return {};
  return {
    benchmarkSecurityId: security?.id || "",
    benchmarkSymbol: security?.symbol || "0050",
    benchmarkPrice: roundMoney(quote.price),
    benchmarkPriceSource: quote.source || "BENCHMARK_FALLBACK",
    benchmarkPriceDate: quote.sourceDate || tradeDate,
    benchmarkPriceCapturedAt: nowIso()
  };
}

async function captureBenchmarkQuote(portfolioId, security, tradeDate) {
  const date = parseDate(tradeDate || today());
  try {
    const quote = date === today() ? await fetchMarketQuote(security) : await fetchYahooDailyClose(security, date);
    return { price: toNumber(quote.price), source: quote.source, sourceDate: quote.sourceDate || date };
  } catch (error) {
    const fallback = benchmarkPriceForDate(portfolioId, security?.id, date, scopedTransactions(portfolioId));
    return { price: toNumber(fallback.price), source: fallback.price ? fallback.source : `缺少基準價：${error.message || error}`, sourceDate: date };
  }
}

async function fetchYahooDailyClose(security, date) {
  const yahooSymbol = yahooSymbolForSecurity(security);
  const start = Math.floor(new Date(`${date}T00:00:00+08:00`).getTime() / 1000);
  const end = start + 86400 * 8;
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?period1=${start}&period2=${end}&interval=1d`;
  const attempts = [
    { url: yahooUrl, source: "YAHOO_DAILY_CLOSE" },
    { url: readerProxyUrl(yahooUrl), source: "YAHOO_DAILY_CLOSE_READER" },
    { url: `https://api.allorigins.win/raw?url=${encodeURIComponent(yahooUrl)}`, source: "YAHOO_DAILY_CLOSE_PROXY" }
  ];
  let lastError = "";
  for (const attempt of attempts) {
    try {
      const data = await fetchJsonWithTimeout(attempt.url, 8000);
      const result = data?.chart?.result?.[0];
      const timestamps = result?.timestamp || [];
      const closes = result?.indicators?.quote?.[0]?.close || [];
      for (let i = 0; i < timestamps.length; i += 1) {
        const price = toNumber(closes[i]);
        if (price <= 0) continue;
        const sourceDate = new Date(timestamps[i] * 1000).toISOString().slice(0, 10);
        if (sourceDate >= date) return { yahooSymbol, price, source: attempt.source, sourceDate, quoteTime: `${sourceDate}T13:30:00+08:00` };
      }
      throw new Error("Yahoo 無日收盤價");
    } catch (error) {
      lastError = error.message;
    }
  }
  throw new Error(lastError || "Yahoo 歷史收盤價無回應");
}

async function backfillMissingBenchmarkPrices(portfolioId = selectedPortfolioId(), brokerAccountId = "ALL") {
  const accountScoped = brokerAccountId && brokerAccountId !== "ALL";
  const targets = state.appTransactions.filter((tx) => tx.portfolioId === portfolioId && ["DEPOSIT", "WITHDRAW"].includes(tx.transactionType) && (!accountScoped || tx.brokerAccountId === brokerAccountId) && !(toNumber(tx.benchmarkPrice) > 0));
  if (!targets.length) return 0;
  let updated = 0;
  for (const tx of targets) {
    const fields = await benchmarkFieldsForTransaction(portfolioId, tx.brokerAccountId, tx.transactionType, tx.tradeDate);
    if (toNumber(fields.benchmarkPrice) > 0) {
      Object.assign(tx, fields, { updatedAt: nowIso() });
      updated += 1;
    }
  }
  if (updated) {
    recomputeAll();
    persist();
    scheduleFirebaseAutoSync();
    showToast(`已回補 ${updated} 筆入出金 0050 基準價`);
  }
  return updated;
}
async function handleManualTransaction(data) {
  const portfolioId = selectedPortfolioId();
  const account = state.brokerAccounts.find((item) => item.id === data.brokerAccountId && item.portfolioId === portfolioId);
  if (!account) throw new Error("券商帳戶不屬於目前 Portfolio");
  const security = ensureSecurity(data.symbol, data.securityName);
  const transaction = normalizeTransaction({
    id: makeId("tx"),
    userId: currentUser().id,
    portfolioId,
    brokerId: account.brokerId,
    brokerAccountId: account.id,
    securityId: security.id,
    sourceTransactionId: "",
    sourceType: "MANUAL",
    tradeDate: parseDate(data.tradeDate),
    transactionType: data.transactionType,
    strategyCategory: data.strategyCategory,
    price: toNumber(data.price),
    shares: toNumber(data.shares),
    fee: toNumber(data.fee),
    tax: toNumber(data.tax),
    linkedBuyTransactionId: String(data.linkedBuyTransactionId || "").trim(),
    rebuySellTransactionIds: parseRebuySellIds(data.rebuySellTransactionIds).join(","),
    buyIntent: String(data.buyIntent || "").trim(),
    borrowRebuyType: String(data.borrowRebuyType || "").trim(),
    sourceInventoryLotId: String(data.sourceInventoryLotId || "").trim(),
    rebuyCycleId: String(data.rebuyCycleId || "").trim(),
    note: String(data.note || "").trim(),
    isConfirmed: true,
    ...(await benchmarkFieldsForTransaction(portfolioId, account.id, data.transactionType, parseDate(data.tradeDate))),
    createdAt: nowIso(),
    updatedAt: nowIso()
  });
  state.appTransactions.push(transaction);
  auditLog("CREATE", "app_transaction", transaction.id, null, transaction, portfolioId);
  commit("交易已新增");
}

function handleCashTransfer(data) {
  const portfolioId = selectedPortfolioId();
  const transfer = {
    id: makeId("cash-transfer"),
    portfolioId,
    fromBrokerAccountId: data.fromBrokerAccountId,
    toBrokerAccountId: data.toBrokerAccountId,
    transferDate: parseDate(data.transferDate),
    amount: toNumber(data.amount),
    fee: toNumber(data.fee),
    note: String(data.note || "").trim(),
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  if (transfer.fromBrokerAccountId === transfer.toBrokerAccountId) throw new Error("轉出與轉入帳戶不可相同");
  state.accountTransfers.push(transfer);
  auditLog("CREATE", "account_transfer", transfer.id, null, transfer, portfolioId);
  commit("現金轉帳已新增");
}

function handlePositionTransfer(data) {
  const portfolioId = selectedPortfolioId();
  const security = ensureSecurity(data.symbol, data.securityName);
  const transfer = {
    id: makeId("position-transfer"),
    portfolioId,
    securityId: security.id,
    fromBrokerAccountId: data.fromBrokerAccountId,
    toBrokerAccountId: data.toBrokerAccountId,
    transferDate: parseDate(data.transferDate),
    shares: toNumber(data.shares),
    originalCostBasis: toNumber(data.originalCostBasis),
    note: String(data.note || "").trim(),
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  if (transfer.fromBrokerAccountId === transfer.toBrokerAccountId) throw new Error("轉出與轉入帳戶不可相同");
  state.positionTransfers.push(transfer);
  auditLog("CREATE", "position_transfer", transfer.id, null, transfer, portfolioId);
  commit("股票轉戶已新增");
}

function handleSecurityCreate(data) {
  const symbol = String(data.symbol || "").trim().toUpperCase();
  if (!symbol) throw new Error("請輸入股票代號");
  if (state.securities.some((security) => security.symbol.toUpperCase() === symbol)) throw new Error("這個股票代號已存在");
  const security = {
    id: makeId("security"),
    userId: currentUser()?.id || "",
    symbol,
    name: String(data.name || symbol).trim(),
    market: String(data.market || "TW").trim().toUpperCase(),
    currency: "TWD",
    yahooSymbol: String(data.yahooSymbol || "").trim().toUpperCase(),
    assetType: normalizeSecurityAssetType(data.assetType || inferSecurityAssetType(symbol, data.name)),
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  state.securities.push(security);
  auditLog("CREATE", "security", security.id, null, security, selectedPortfolioId());
  commit("個股已新增");
}

function handleEditSecurity(id) {
  const security = state.securities.find((item) => item.id === id);
  if (!security) return;
  const before = clone(security);
  const symbol = promptText("股票代號", security.symbol);
  if (symbol === null) return;
  const name = promptText("股票名稱", security.name);
  if (name === null) return;
  const market = promptText("市場 TW/TWO/US", security.market || "TW");
  if (market === null) return;
  const yahoo = promptText("Yahoo Finance 代號", security.yahooSymbol || yahooSymbolForSecurity(security));
  if (yahoo === null) return;
  const assetType = promptText("類型 ETF/STOCK", securityAssetType(security));
  if (assetType === null) return;
  security.symbol = symbol.toUpperCase();
  security.name = name;
  security.market = market.toUpperCase();
  security.assetType = normalizeSecurityAssetType(assetType);
  security.yahooSymbol = yahoo.toUpperCase();
  security.updatedAt = nowIso();
  auditLog("UPDATE", "security", id, before, security, selectedPortfolioId());
  commit("個股已更新");
}

function handleDeleteSecurity(id) {
  const security = state.securities.find((item) => item.id === id);
  if (!security) return;
  const used = state.appTransactions.some((tx) => tx.securityId === id) || state.brokerExecutions.some((execution) => execution.securityId === id) || state.positionTransfers.some((transfer) => transfer.securityId === id);
  if (used) throw new Error("這檔股票已有交易、券商紀錄或轉戶資料，不能刪除。可以改名或調整 Yahoo 代號。");
  if (!confirmDangerousDelete(security.symbol, "這會刪除個股設定與該股票現價紀錄。")) return;
  state.securities = state.securities.filter((item) => item.id !== id);
  state.marketQuotes = state.marketQuotes.filter((quote) => quote.securityId !== id);
  auditLog("DELETE", "security", id, security, null, selectedPortfolioId());
  commit("個股已刪除");
}

function handleBrokerFeesSave(data) {
  const portfolioId = selectedPortfolioId();
  const settings = getPortfolioSettings(portfolioId);
  const before = clone(settings.brokerFees || {});
  const brokerFees = {};
  for (const broker of state.brokers) {
    brokerFees[broker.id] = {
      feeRate: toNumber(data[`feeRate__${broker.id}`] || defaultBrokerFeeSetting().feeRate),
      discountRate: toNumber(data[`discountRate__${broker.id}`] || defaultBrokerFeeSetting().discountRate),
      minFee: toNumber(data[`minFee__${broker.id}`] || defaultBrokerFeeSetting().minFee),
      sellTaxRate: toNumber(data[`stockSellTaxRate__${broker.id}`] || data[`sellTaxRate__${broker.id}`] || defaultBrokerFeeSetting().sellTaxRate),
      stockSellTaxRate: toNumber(data[`stockSellTaxRate__${broker.id}`] || data[`sellTaxRate__${broker.id}`] || defaultBrokerFeeSetting().stockSellTaxRate),
      etfSellTaxRate: toNumber(data[`etfSellTaxRate__${broker.id}`] || defaultBrokerFeeSetting().etfSellTaxRate)
    };
  }
  state.settings.portfolios[portfolioId] = { ...settings, brokerFees };
  auditLog("UPDATE", "broker_fee_settings", portfolioId, before, brokerFees, portfolioId);
  commit("券商費率已儲存");
}
function handleSettingsSave(data) {
  const portfolioId = selectedPortfolioId();
  const before = clone(getPortfolioSettings(portfolioId));
  state.settings.portfolios[portfolioId] = {
    ...before,
    defaultSecurity: String(data.defaultSecurity || "0050").trim().toUpperCase(),
    defaultRebuyOffset: toNumber(data.defaultRebuyOffset),
    coreHoldingShares: toNumber(data.coreHoldingShares),
    priceTolerance: toNumber(data.priceTolerance),
    amountTolerance: toNumber(data.amountTolerance),
    feeAllocationMethod: data.feeAllocationMethod,
    rebuyMatchMethod: data.rebuyMatchMethod,
    defaultRebuyScope: "SAME_BROKER_ACCOUNT"
  };
  auditLog("UPDATE", "portfolio_settings", portfolioId, before, state.settings.portfolios[portfolioId], portfolioId);
  commit("設定已儲存");
}

function handleFirebaseSave(data) {
  state.settings.firebase.configText = String(data.configText || "").trim();
  state.settings.firebase.namespace = String(data.namespace || "").trim();
  firebaseRuntime = null;
  persist();
  showToast("Firebase 設定已儲存");
}

function handleRunReconciliation() {
  runReconciliation();
  persist();
  render();
  const result = promptBrokerDiffConfirmation("重新對帳發現差異", "ALL");
  if (result === null) showToast("已重新對帳");
}

function handleAcceptBrokerDiffs() {
  const result = promptBrokerDiffConfirmation("採用券商金額", "ALL");
  if (result === null) showToast("沒有待確認的券商差異");
}

function handleEditMatch(sellId) {
  const sell = state.appTransactions.find((tx) => tx.id === sellId);
  if (!sell) throw new Error("找不到賣出交易");
  state.ui.expandedMatchSellId = sellId;
  state.ui.editingMatchSellId = sellId;
  persist();
  render();
}

function handleCancelEditMatch(sellId) {
  if (state.ui.editingMatchSellId === sellId) state.ui.editingMatchSellId = "";
  state.ui.expandedMatchSellId = sellId || state.ui.expandedMatchSellId || "";
  persist();
  render();
}

function handleSaveMatch(sellId) {
  const sell = state.appTransactions.find((tx) => tx.id === sellId);
  if (!sell) throw new Error("找不到賣出交易");
  const select = document.querySelector(`[data-match-buy="${sellId}"]`);
  const sharesInput = document.querySelector(`[data-match-shares="${sellId}"]`);
  const before = clone(sell);
  sell.linkedBuyTransactionId = select?.value || "";
  sell.manualMatchedShares = Math.min(Math.max(toNumber(sharesInput?.value || sell.shares), 0), toNumber(sell.shares));
  sell.updatedAt = nowIso();
  state.ui.editingMatchSellId = "";
  state.ui.expandedMatchSellId = sellId;
  auditLog("UPDATE_MATCH", "app_transaction", sell.id, before, sell, sell.portfolioId);
  commit("配對已更新並重算");
}

function handleDeleteTransaction(id) {
  const tx = state.appTransactions.find((item) => item.id === id);
  if (!tx) return;
  const label = `${tx.tradeDate} ${tx.transactionType} ${securityLabel(tx.securityId)} ${fmtNum(tx.shares)}股`;
  const impact = "這會刪除這筆交易並重算庫存、配對、回補與對帳。";
  const ok = ["DEPOSIT", "WITHDRAW", "INTEREST", "DIVIDEND"].includes(tx.transactionType)
    ? confirmCashTransactionDelete(tx, impact)
    : confirmDangerousDelete(label, impact);
  if (!ok) return;
  state.appTransactions = state.appTransactions.filter((item) => item.id !== id);
  auditLog("DELETE", "app_transaction", id, tx, null, tx.portfolioId);
  commit("交易已刪除");
}

function handleDeleteImportBatch(id) {
  const batch = state.importBatches.find((item) => item.id === id && item.portfolioId === selectedPortfolioId());
  if (!batch) return;
  const relatedBrokerExecutions = state.brokerExecutions.filter((execution) => execution.importBatchId === id);
  const relatedRawRows = state.rawImportRows.filter((row) => row.importBatchId === id);
  const jsonSourceIds = new Set(
    relatedRawRows
      .map((row) => String(row.rawJson?.id || "").trim())
      .filter(Boolean)
  );
  const relatedTransactions = state.appTransactions.filter((tx) => {
    if (tx.importBatchId === id) return true;
    return batch.sourceType === "JSON_LEDGER" && tx.sourceType === "JSON_IMPORT" && jsonSourceIds.has(tx.sourceTransactionId || "");
  });
  const impact = batch.sourceType === "BROKER_CSV"
    ? `這會刪除這份券商對帳報表、${fmtNum(relatedBrokerExecutions.length)} 筆券商成交與原始列，並重新對帳。App 交易紀錄不會被刪除。`
    : `這會刪除這批 JSON 匯入、${fmtNum(relatedTransactions.length)} 筆由該批次建立的 App 交易、原始列與相關對帳資料。`;
  if (!confirmImportBatchDelete(batch, impact)) return;
  const deletedExecutionIds = new Set(relatedBrokerExecutions.map((execution) => execution.id));
  const deletedTransactionIds = new Set(relatedTransactions.map((tx) => tx.id));
  const acceptedBefore = clone(state.acceptedBrokerDiffs || {});
  clearAcceptedBrokerDiffsForDeletedData(deletedExecutionIds, deletedTransactionIds);
  state.importBatches = state.importBatches.filter((item) => item.id !== id);
  state.rawImportRows = state.rawImportRows.filter((row) => row.importBatchId !== id);
  state.brokerExecutions = state.brokerExecutions.filter((execution) => execution.importBatchId !== id);
  if (relatedTransactions.length) {
    state.appTransactions = state.appTransactions.filter((tx) => !deletedTransactionIds.has(tx.id));
    state.manualClosedRebuySellIds = state.manualClosedRebuySellIds.filter((txId) => !deletedTransactionIds.has(txId));
  }
  auditLog("DELETE", "import_batch", id, batch, {
    sourceType: batch.sourceType,
    brokerExecutionCount: relatedBrokerExecutions.length,
    appTransactionCount: relatedTransactions.length,
    rawRowCount: relatedRawRows.length,
    acceptedBrokerDiffsBefore: acceptedBefore,
    acceptedBrokerDiffsAfter: state.acceptedBrokerDiffs || {}
  }, batch.portfolioId);
  commit(batch.sourceType === "BROKER_CSV" ? "對帳報表已刪除並重新對帳" : "匯入批次已刪除並重新計算");
}

function clearAcceptedBrokerDiffsForDeletedData(deletedExecutionIds, deletedTransactionIds) {
  if (!state.acceptedBrokerDiffs || (!deletedExecutionIds.size && !deletedTransactionIds.size)) return;
  const next = { ...(state.acceptedBrokerDiffs || {}) };
  for (const link of state.reconciliationLinks || []) {
    const executionIds = parseDatasetIds(link.brokerExecutionId || "");
    const transactionIds = parseDatasetIds(link.appTransactionId || "");
    const touchesDeletedExecution = executionIds.some((id) => deletedExecutionIds.has(id));
    const touchesDeletedTransaction = transactionIds.some((id) => deletedTransactionIds.has(id));
    if (touchesDeletedExecution || touchesDeletedTransaction) delete next[brokerDiffAcceptanceKey(link)];
  }
  state.acceptedBrokerDiffs = next;
}

function handleEditPortfolio(id) {
  const portfolio = state.portfolios.find((item) => item.id === id && userPortfolios().some((p) => p.id === id));
  if (!portfolio) return;
  const before = clone(portfolio);
  const name = promptText("Portfolio 名稱", portfolio.name);
  if (name === null) return;
  const currency = promptText("基準幣別", portfolio.baseCurrency);
  if (currency === null) return;
  portfolio.name = name;
  portfolio.baseCurrency = currency.toUpperCase();
  portfolio.updatedAt = nowIso();
  auditLog("UPDATE", "portfolio", id, before, portfolio, id);
  commit("Portfolio 已更新");
}

function handleDeletePortfolio(id) {
  const portfolio = state.portfolios.find((item) => item.id === id && userPortfolios().some((p) => p.id === id));
  if (!portfolio) return;
  const label = portfolio.name;
  if (!confirmDangerousDelete(label, "這會刪除 Portfolio 底下的券商帳戶、交易、匯入批次、對帳、轉帳與轉戶資料。")) return;
  const accountIds = new Set(state.brokerAccounts.filter((item) => item.portfolioId === id).map((item) => item.id));
  const batchIds = new Set(state.importBatches.filter((item) => item.portfolioId === id).map((item) => item.id));
  const txIds = new Set(state.appTransactions.filter((item) => item.portfolioId === id).map((item) => item.id));
  state.portfolios = state.portfolios.filter((item) => item.id !== id);
  state.portfolioMembers = state.portfolioMembers.filter((item) => item.portfolioId !== id);
  state.brokerAccounts = state.brokerAccounts.filter((item) => item.portfolioId !== id);
  state.importBatches = state.importBatches.filter((item) => item.portfolioId !== id);
  state.rawImportRows = state.rawImportRows.filter((item) => !batchIds.has(item.importBatchId));
  state.appTransactions = state.appTransactions.filter((item) => item.portfolioId !== id);
  state.brokerExecutions = state.brokerExecutions.filter((item) => item.portfolioId !== id);
  state.reconciliationLinks = state.reconciliationLinks.filter((item) => item.portfolioId !== id);
  state.cashAccounts = state.cashAccounts.filter((item) => item.portfolioId !== id);
  state.cashLedger = state.cashLedger.filter((item) => item.portfolioId !== id);
  state.accountTransfers = state.accountTransfers.filter((item) => item.portfolioId !== id);
  state.positionTransfers = state.positionTransfers.filter((item) => item.portfolioId !== id);
  state.marketQuotes = state.marketQuotes.filter((item) => item.portfolioId !== id);
  state.manualClosedRebuySellIds = state.manualClosedRebuySellIds.filter((item) => !txIds.has(item));
  delete state.settings.portfolios[id];
  if (state.ui.currentPortfolioId === id) state.ui.currentPortfolioId = userPortfolios()[0]?.id || "";
  auditLog("DELETE", "portfolio", id, portfolio, null, id);
  commit("Portfolio 已刪除");
}

function handleEditBroker(id) {
  const broker = state.brokers.find((item) => item.id === id);
  if (!broker) return;
  const before = clone(broker);
  const code = promptText("券商代碼", broker.code);
  if (code === null) return;
  const name = promptText("券商名稱", broker.name);
  if (name === null) return;
  const country = promptText("國家", broker.country);
  if (country === null) return;
  const currency = promptText("預設幣別", broker.defaultCurrency);
  if (currency === null) return;
  const active = window.confirm("是否啟用這家券商？按取消會設為停用。");
  broker.code = code.toUpperCase();
  broker.name = name;
  broker.country = country.toUpperCase();
  broker.defaultCurrency = currency.toUpperCase();
  broker.isActive = active;
  broker.updatedAt = nowIso();
  auditLog("UPDATE", "broker", id, before, broker, selectedPortfolioId());
  commit("券商主檔已更新");
}

function handleDeleteBroker(id) {
  const broker = state.brokers.find((item) => item.id === id);
  if (!broker) return;
  const used = state.brokerAccounts.some((item) => item.brokerId === id) || state.importTemplates.some((item) => item.brokerId === id) || state.brokerExecutions.some((item) => item.brokerId === id);
  if (used) throw new Error("這家券商仍被帳戶、模板或成交資料使用。請先刪除相關設定與資料。");
  if (!confirmDangerousDelete(broker.name, "這會從券商主檔移除該券商。")) return;
  state.brokers = state.brokers.filter((item) => item.id !== id);
  if (!state.deletedBrokerIds.includes(id)) state.deletedBrokerIds.push(id);
  auditLog("DELETE", "broker", id, broker, null, selectedPortfolioId());
  commit("券商主檔已刪除");
}

function handleEditBrokerAccount(id) {
  const account = state.brokerAccounts.find((item) => item.id === id && item.portfolioId === selectedPortfolioId());
  if (!account) return;
  const before = clone(account);
  const name = promptText("帳戶名稱", account.accountName);
  if (name === null) return;
  const masked = promptText("遮罩帳號", account.accountNoMasked || "");
  if (masked === null) return;
  const branch = promptText("分公司", account.branchName || "");
  if (branch === null) return;
  const currency = promptText("幣別", account.currency || "TWD");
  if (currency === null) return;
  const isDefault = window.confirm("是否設為預設帳戶？");
  const isActive = window.confirm("是否啟用這個帳戶？按取消會設為停用。");
  if (isDefault) {
    for (const other of state.brokerAccounts.filter((item) => item.portfolioId === account.portfolioId)) other.isDefault = false;
  }
  account.accountName = name;
  account.accountNoMasked = masked;
  account.branchName = branch;
  account.currency = currency.toUpperCase();
  account.isDefault = isDefault;
  account.isActive = isActive;
  account.updatedAt = nowIso();
  auditLog("UPDATE", "broker_account", id, before, account, account.portfolioId);
  commit("券商帳戶已更新");
}

function handleDeleteBrokerAccount(id) {
  const account = state.brokerAccounts.find((item) => item.id === id && item.portfolioId === selectedPortfolioId());
  if (!account) return;
  if (!confirmDangerousDelete(account.accountName, "這會刪除該券商帳戶，以及底下交易、券商成交、匯入批次、轉帳與轉戶資料。")) return;
  cascadeDeleteBrokerAccount(account);
  auditLog("DELETE", "broker_account", id, account, null, account.portfolioId);
  commit("券商帳戶已刪除");
}

function handleEditTemplate(id) {
  const template = state.importTemplates.find((item) => item.id === id);
  if (!template) return;
  const before = clone(template);
  const name = promptText("模板名稱", template.templateName);
  if (name === null) return;
  const dateFormat = promptText("日期格式", template.dateFormat || "YYYY/MM/DD");
  if (dateFormat === null) return;
  const numberFormat = promptText("數字格式", template.numberFormat || "comma");
  if (numberFormat === null) return;
  const mappingText = window.prompt("欄位映射 JSON", JSON.stringify(template.columnMapping || DEFAULT_TEMPLATE.columnMapping, null, 2));
  if (mappingText === null) return;
  template.templateName = name;
  template.dateFormat = dateFormat;
  template.numberFormat = numberFormat;
  template.columnMapping = JSON.parse(mappingText);
  template.updatedAt = nowIso();
  auditLog("UPDATE", "broker_import_template", id, before, template, selectedPortfolioId());
  commit("匯入模板已更新");
}

function handleDeleteTemplate(id) {
  const template = state.importTemplates.find((item) => item.id === id);
  if (!template) return;
  if (!confirmDangerousDelete(template.templateName, "這會刪除匯入模板；既有匯入批次不會被刪除。")) return;
  state.importTemplates = state.importTemplates.filter((item) => item.id !== id);
  auditLog("DELETE", "broker_import_template", id, template, null, selectedPortfolioId());
  commit("匯入模板已刪除");
}

function handleEditCashTransfer(id) {
  const transfer = state.accountTransfers.find((item) => item.id === id && item.portfolioId === selectedPortfolioId());
  if (!transfer) return;
  const before = clone(transfer);
  const date = promptText("轉帳日期 YYYY-MM-DD", transfer.transferDate);
  if (date === null) return;
  const amount = promptText("金額", transfer.amount);
  if (amount === null) return;
  const fee = promptText("費用", transfer.fee || 0);
  if (fee === null) return;
  const note = promptText("備註", transfer.note || "");
  if (note === null) return;
  transfer.transferDate = parseDate(date);
  transfer.amount = toNumber(amount);
  transfer.fee = toNumber(fee);
  transfer.note = note;
  transfer.updatedAt = nowIso();
  auditLog("UPDATE", "account_transfer", id, before, transfer, transfer.portfolioId);
  commit("現金轉帳已更新");
}

function handleDeleteCashTransfer(id) {
  const transfer = state.accountTransfers.find((item) => item.id === id && item.portfolioId === selectedPortfolioId());
  if (!transfer) return;
  const label = `${transfer.transferDate} ${fmtMoney(transfer.amount)}`;
  if (!confirmDangerousDelete(label, "這會刪除這筆現金轉帳並重算現金帳。")) return;
  state.accountTransfers = state.accountTransfers.filter((item) => item.id !== id);
  auditLog("DELETE", "account_transfer", id, transfer, null, transfer.portfolioId);
  commit("現金轉帳已刪除");
}

function handleEditPositionTransfer(id) {
  const transfer = state.positionTransfers.find((item) => item.id === id && item.portfolioId === selectedPortfolioId());
  if (!transfer) return;
  const before = clone(transfer);
  const date = promptText("轉戶日期 YYYY-MM-DD", transfer.transferDate);
  if (date === null) return;
  const shares = promptText("股數", transfer.shares);
  if (shares === null) return;
  const basis = promptText("原始成本 basis", transfer.originalCostBasis);
  if (basis === null) return;
  const note = promptText("備註", transfer.note || "");
  if (note === null) return;
  transfer.transferDate = parseDate(date);
  transfer.shares = toNumber(shares);
  transfer.originalCostBasis = toNumber(basis);
  transfer.note = note;
  transfer.updatedAt = nowIso();
  auditLog("UPDATE", "position_transfer", id, before, transfer, transfer.portfolioId);
  commit("股票轉戶已更新");
}

function handleDeletePositionTransfer(id) {
  const transfer = state.positionTransfers.find((item) => item.id === id && item.portfolioId === selectedPortfolioId());
  if (!transfer) return;
  const label = `${transfer.transferDate} ${securityLabel(transfer.securityId)} ${fmtNum(transfer.shares)}股`;
  if (!confirmDangerousDelete(label, "這會刪除這筆股票轉戶紀錄。")) return;
  state.positionTransfers = state.positionTransfers.filter((item) => item.id !== id);
  auditLog("DELETE", "position_transfer", id, transfer, null, transfer.portfolioId);
  commit("股票轉戶已刪除");
}

function handleResetPortfolioSettings() {
  const portfolio = selectedPortfolio();
  if (!portfolio) return;
  const before = clone(getPortfolioSettings(portfolio.id));
  if (!confirmDangerousDelete(`${portfolio.name} 設定`, "這會把回補規則、容忍差異與分攤方法恢復預設值。")) return;
  state.settings.portfolios[portfolio.id] = defaultPortfolioSettings();
  auditLog("RESET", "portfolio_settings", portfolio.id, before, state.settings.portfolios[portfolio.id], portfolio.id);
  commit("Portfolio 設定已重置");
}

function handleClearFirebaseSettings() {
  const before = clone(state.settings.firebase);
  if (!confirmDangerousDelete("Firebase 設定", "這會清除本機 Firebase config 與 namespace，不會刪除雲端資料。")) return;
  state.settings.firebase = { configText: "", namespace: "", lastSyncAt: "", status: "LOCAL_ONLY" };
  firebaseRuntime = null;
  auditLog("DELETE", "firebase_settings", "firebase", before, state.settings.firebase, selectedPortfolioId());
  commit("Firebase 設定已清除");
}

function cascadeDeleteBrokerAccount(account) {
  const batchIds = new Set(state.importBatches.filter((item) => item.brokerAccountId === account.id).map((item) => item.id));
  const txIds = new Set(state.appTransactions.filter((item) => item.brokerAccountId === account.id).map((item) => item.id));
  state.brokerAccounts = state.brokerAccounts.filter((item) => item.id !== account.id);
  state.cashAccounts = state.cashAccounts.filter((item) => item.brokerAccountId !== account.id);
  state.importBatches = state.importBatches.filter((item) => item.brokerAccountId !== account.id);
  state.rawImportRows = state.rawImportRows.filter((item) => !batchIds.has(item.importBatchId));
  state.appTransactions = state.appTransactions.filter((item) => item.brokerAccountId !== account.id);
  state.brokerExecutions = state.brokerExecutions.filter((item) => item.brokerAccountId !== account.id);
  state.reconciliationLinks = state.reconciliationLinks.filter((item) => item.brokerAccountId !== account.id);
  state.accountTransfers = state.accountTransfers.filter((item) => item.fromBrokerAccountId !== account.id && item.toBrokerAccountId !== account.id);
  state.positionTransfers = state.positionTransfers.filter((item) => item.fromBrokerAccountId !== account.id && item.toBrokerAccountId !== account.id);
  state.manualClosedRebuySellIds = state.manualClosedRebuySellIds.filter((item) => !txIds.has(item));
}
function handleManualCloseRebuy(sellId) {
  if (!state.manualClosedRebuySellIds.includes(sellId)) state.manualClosedRebuySellIds.push(sellId);
  const sell = state.appTransactions.find((tx) => tx.id === sellId);
  auditLog("MANUAL_CLOSE", "rebuy_task", sellId, null, { sellId }, sell?.portfolioId || selectedPortfolioId());
  commit("回補任務已手動關閉");
}

function parseDatasetIds(value) {
  return String(value || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function handleRebuyTaskBuy(sellIdsText) {
  const sellIds = parseDatasetIds(sellIdsText);
  const tasks = state.rebuyTasks
    .filter((task) => sellIds.includes(task.sellTransactionId) && !rebuyTaskIsArchived(task))
    .sort(sortByRebuyTargetDesc);
  if (!tasks.length) throw new Error("找不到待回補任務");
  const first = tasks[0];
  const security = securityById(first.securityId);
  const shares = sum(tasks, "remainingRebuyShares");
  openQuickEntry("BUY", {
    brokerAccountId: first.brokerAccountId,
    symbol: security?.symbol || getPortfolioSettings(first.portfolioId).defaultSecurity || "0050",
    securityName: security?.name || security?.symbol || "",
    price: first.targetRebuyPrice,
    shares: shares || 100,
    strategyCategory: "REBUY",
    buyIntent: "REBUY",
    rebuySellTransactionIds: sellIds.join(","),
    note: `補回提醒 ${security?.symbol || "股票"} ${fmtNum(shares || 100)}股，可輸入低於提醒價的成交價`
  });
}

function handleManualCloseRebuyGroup(sellIdsText) {
  const sellIds = parseDatasetIds(sellIdsText);
  const activeIds = state.rebuyTasks
    .filter((task) => sellIds.includes(task.sellTransactionId) && !rebuyTaskIsArchived(task))
    .map((task) => task.sellTransactionId);
  if (!activeIds.length) return;
  if (activeIds.length > 1 && !window.confirm(`確定要手動關閉這 ${activeIds.length} 筆同價回補提醒？`)) return;
  for (const sellId of activeIds) {
    if (!state.manualClosedRebuySellIds.includes(sellId)) state.manualClosedRebuySellIds.push(sellId);
  }
  auditLog("MANUAL_CLOSE", "rebuy_task_group", activeIds.join(","), null, { sellIds: activeIds }, selectedPortfolioId());
  commit("回補任務已手動關閉");
}

async function loadSampleJson() {
  let text = "";
  try {
    const response = await fetch(SAMPLE_JSON_PATH);
    if (response.ok) text = await response.text();
  } catch {
    text = "";
  }
  if (!text.trim() || isHtmlResponse(text)) text = SAMPLE_JSON_FALLBACK;
  importJsonLedger(text, defaultImportContext("0050_交易紀錄備份_2026-07-01.json"));
  commit("範例 JSON 已匯入");
}

async function loadSampleCsv() {
  let text = "";
  try {
    const response = await fetch(SAMPLE_CSV_PATH);
    if (response.ok) text = await response.text();
  } catch {
    text = "";
  }
  if (!text.trim() || isHtmlResponse(text)) text = SAMPLE_CSV_FALLBACK;
  importBrokerCsv(text, defaultImportContext("證券對帳單 20260701162400.csv"));
  commit("範例 CSV 已匯入");
  promptBrokerDiffConfirmation("範例 CSV 對帳發現差異");
}

function defaultImportContext(filename) {
  const account = scopedBrokerAccounts().find((item) => item.id === selectedBrokerAccountId()) || scopedBrokerAccounts()[0];
  if (!account) throw new Error("請先建立券商帳戶");
  return importContext(
    {
      brokerAccountId: account.id,
      symbol: getPortfolioSettings().defaultSecurity,
      securityName: "元大台灣50"
    },
    filename
  );
}

function importContext(data, filename) {
  const account = state.brokerAccounts.find((item) => item.id === data.brokerAccountId);
  if (!account) throw new Error("找不到券商帳戶");
  
  const symbol = String(data.symbol || "").trim() || "UNKNOWN";
  const name = String(data.securityName || "").trim() || symbol;
  
  const security = ensureSecurity(symbol, name);
  return {
    userId: currentUser().id,
    portfolioId: account.portfolioId,
    brokerId: account.brokerId,
    brokerAccountId: account.id,
    securityId: security.id,
    sourceFilename: filename
  };
}

function importJsonLedger(text, context) {
  const records = JSON.parse(stripBom(text));
  if (!Array.isArray(records)) throw new Error("JSON 必須是 array");
  const batch = createImportBatch(context, "JSON_LEDGER", records.length);
  const sourceIds = new Set(
    state.appTransactions
      .filter((tx) => tx.userId === context.userId && tx.portfolioId === context.portfolioId)
      .map((tx) => tx.sourceTransactionId || tx.id)
  );
  records.forEach((record, index) => {
    const rawRow = {
      id: makeId("raw"),
      importBatchId: batch.id,
      rowNumber: index + 1,
      rawJson: record,
      parseStatus: "PARSED",
      parseError: "",
      createdAt: nowIso()
    };
    state.rawImportRows.push(rawRow);
    const sourceTransactionId = String(record.id || makeId("source"));
    const tradeDate = parseDate(record.date);
    if (sourceIds.has(sourceTransactionId)) {
      rawRow.parseStatus = "DUPLICATE";
      rawRow.parseError = "重複 JSON 交易，已略過";
      noteImportBatchDuplicate(batch, tradeDate);
      return;
    }
    const security = record.symbol ? ensureSecurity(record.symbol, record.securityName || record.name || record.symbol) : securityById(context.securityId);
    const account = state.brokerAccounts.find((item) => item.id === context.brokerAccountId);
    state.appTransactions.push(
      normalizeTransaction({
        id: makeId("tx"),
        userId: context.userId,
        portfolioId: context.portfolioId,
        brokerId: context.brokerId,
        brokerAccountId: context.brokerAccountId,
        securityId: security.id,
        sourceTransactionId,
        sourceType: "JSON_IMPORT",
        importBatchId: batch.id,
        tradeDate,
        transactionType: normalizeType(record.type),
        strategyCategory: record.category || "TRADING",
        price: toNumber(record.price),
        shares: toNumber(record.shares),
        fee: toNumber(record.fee),
        tax: toNumber(record.tax),
        linkedBuyTransactionId: String(record.linkedBuyId || ""),
        note: String(record.note || ""),
        isConfirmed: true,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        brokerNameSnapshot: brokerName(account.brokerId)
      })
    );
    sourceIds.add(sourceTransactionId);
    noteImportBatchCreated(batch, tradeDate);
  });
  finalizeImportBatch(batch);
  auditLog("IMPORT", "import_batch", batch.id, null, batch, context.portfolioId);
}
function importBrokerCsv(text, context) {
  const parsed = parseBrokerCsv(text);
  const batch = createImportBatch(context, "BROKER_CSV", parsed.rows.length);
  const existingKeys = new Set(
    state.brokerExecutions
      .filter((execution) => execution.userId === context.userId && execution.portfolioId === context.portfolioId)
      .map((execution) => execution.checksum)
  );
  parsed.rows.forEach((row, index) => {
    const rawRow = {
      id: makeId("raw"),
      importBatchId: batch.id,
      rowNumber: parsed.headerRowIndex + index + 2,
      rawJson: row,
      parseStatus: "PARSED",
      parseError: "",
      createdAt: nowIso()
    };
    state.rawImportRows.push(rawRow);
    const mapped = mapBrokerRow(row, context);
    const checksum = simpleHash(JSON.stringify(mapped));
    if (existingKeys.has(checksum)) {
      rawRow.parseStatus = "DUPLICATE";
      rawRow.parseError = "重複券商成交，已略過";
      noteImportBatchDuplicate(batch, mapped.tradeDate);
      return;
    }
    state.brokerExecutions.push({
      id: makeId("broker-exec"),
      userId: context.userId,
      portfolioId: context.portfolioId,
      brokerId: context.brokerId,
      brokerAccountId: context.brokerAccountId,
      securityId: mapped.securityId,
      importBatchId: batch.id,
      brokerName: brokerName(context.brokerId),
      tradeDate: mapped.tradeDate,
      settlementDate: mapped.tradeDate,
      securityName: mapped.securityName,
      side: mapped.side,
      brokerSideRaw: mapped.brokerSideRaw,
      shares: mapped.shares,
      price: mapped.price,
      grossAmount: mapped.grossAmount,
      fee: mapped.fee,
      tax: mapped.tax,
      netAmount: mapped.netAmount,
      orderNo: mapped.orderNo,
      executionNo: "",
      rawRowId: rawRow.id,
      checksum,
      createdAt: nowIso(),
      updatedAt: nowIso()
    });
    existingKeys.add(checksum);
    noteImportBatchCreated(batch, mapped.tradeDate);
  });
  finalizeImportBatch(batch);
  auditLog("IMPORT", "import_batch", batch.id, null, batch, context.portfolioId);
}
function createImportBatch(context, sourceType, rowCount) {
  const batch = {
    id: makeId("import"),
    userId: context.userId,
    portfolioId: context.portfolioId,
    brokerId: context.brokerId,
    brokerAccountId: context.brokerAccountId,
    importTemplateId: sourceType === "BROKER_CSV" ? DEFAULT_TEMPLATE.id : "",
    sourceType,
    sourceFilename: context.sourceFilename,
    importedAt: nowIso(),
    rowCount,
    parsedCount: 0,
    createdCount: 0,
    duplicateCount: 0,
    failedCount: 0,
    dateFrom: "",
    dateTo: "",
    status: "PENDING",
    checksum: simpleHash(`${context.sourceFilename}:${rowCount}:${Date.now()}`),
    notes: "",
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  state.importBatches.push(batch);
  return batch;
}

function noteImportBatchCreated(batch, tradeDate) {
  batch.createdCount = toNumber(batch.createdCount) + 1;
  batch.parsedCount = toNumber(batch.parsedCount) + 1;
  updateImportBatchDateRange(batch, tradeDate);
}

function noteImportBatchDuplicate(batch, tradeDate) {
  batch.duplicateCount = toNumber(batch.duplicateCount) + 1;
  batch.parsedCount = toNumber(batch.parsedCount) + 1;
  updateImportBatchDateRange(batch, tradeDate);
}

function updateImportBatchDateRange(batch, tradeDate) {
  const date = parseDate(tradeDate);
  if (!date) return;
  if (!batch.dateFrom || date < batch.dateFrom) batch.dateFrom = date;
  if (!batch.dateTo || date > batch.dateTo) batch.dateTo = date;
}

function finalizeImportBatch(batch) {
  if (toNumber(batch.createdCount) <= 0 && toNumber(batch.duplicateCount) > 0) batch.status = "DUPLICATE";
  else if (toNumber(batch.duplicateCount) > 0) batch.status = "PARTIAL_DUPLICATE";
  else batch.status = "PARSED";
  batch.updatedAt = nowIso();
}

function importBatchDateRange(batch) {
  if (batch.dateFrom && batch.dateTo && batch.dateFrom !== batch.dateTo) return `${batch.dateFrom}~${batch.dateTo}`;
  return batch.dateFrom || batch.dateTo || "-";
}
function parseBrokerCsv(text) {
  const rows = parseCsv(stripBom(text));
  const headerRowIndex = rows.findIndex((cells) => cells.includes("股名") && cells.includes("日期") && cells.includes("成交股數"));
  if (headerRowIndex < 0) throw new Error("找不到券商 CSV header");
  const headers = rows[headerRowIndex].map((cell) => cell.trim());
  const dataRows = rows
    .slice(headerRowIndex + 1)
    .filter((cells) => cells.some((cell) => String(cell || "").trim()))
    .map((cells) => {
      const row = {};
      headers.forEach((header, index) => {
        row[header] = cells[index] ?? "";
      });
      return row;
    });
  return { rows: dataRows, headerRowIndex };
}

function parseCsv(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  return lines.map((line) => {
    const cells = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      const next = line[i + 1];
      if (char === '"' && inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        cells.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    cells.push(current.trim());
    return cells;
  });
}

function findSymbolInRow(row) {
  const keys = Object.keys(row);
  const symbolKey = keys.find((k) => ["股號", "股票代號", "股票代碼", "商品代號", "代號", "symbol", "code", "stockNo"].includes(String(k).trim()));
  if (symbolKey) return String(row[symbolKey] || "").trim();
  return null;
}

function mapBrokerRow(row, context) {
  const securityName = String(row["股名"] || "").trim();
  
  let symbol = findSymbolInRow(row);
  if (!symbol) symbol = inferSymbol(securityName);
  
  if (!symbol || symbol === "UNKNOWN") {
    symbol = securityById(context.securityId)?.symbol || "UNKNOWN";
  }
  
  const security = ensureSecurity(symbol, securityName);
  const sideRaw = String(row["買賣別"] || "").trim();
  return {
    securityId: security.id,
    securityName,
    tradeDate: parseDate(row["日期"]),
    shares: toNumber(row["成交股數"]),
    netAmount: toNumber(row["淨收付金額"]),
    side: normalizeSide(sideRaw),
    brokerSideRaw: sideRaw,
    price: toNumber(row["成交價"]),
    grossAmount: toNumber(row["成本"]),
    fee: toNumber(row["手續費"]),
    tax: toNumber(row["交易稅"]),
    orderNo: String(row["委託書號"] || "").trim()
  };
}

function normalizeTransaction(input) {
  const tx = { ...input };
  tx.transactionType = normalizeType(tx.transactionType);
  tx.price = toNumber(tx.price);
  tx.shares = toNumber(tx.shares);
  tx.fee = toNumber(tx.fee);
  tx.tax = toNumber(tx.tax);
  tx.linkedBuyTransactionId = String(tx.linkedBuyTransactionId || "").trim();
  tx.rebuySellTransactionIds = tx.transactionType === "BUY" ? parseRebuySellIds(tx.rebuySellTransactionIds).join(",") : "";
  tx.buyIntent = tx.transactionType === "BUY" ? (tx.rebuySellTransactionIds ? "REBUY" : String(tx.buyIntent || "NEW").toUpperCase()) : "";
  tx.borrowRebuyType = String(tx.borrowRebuyType || "").trim();
  tx.sourceInventoryLotId = String(tx.sourceInventoryLotId || "").trim();
  tx.rebuyCycleId = String(tx.rebuyCycleId || "").trim();
  tx.grossAmount = ["DEPOSIT", "WITHDRAW", "INTEREST", "DIVIDEND"].includes(tx.transactionType) ? tx.price : tx.price * tx.shares;
  if (tx.transactionType === "BUY") tx.netAmount = -(tx.grossAmount + tx.fee + tx.tax);
  else if (tx.transactionType === "SELL") tx.netAmount = tx.grossAmount - tx.fee - tx.tax;
  else if (["DEPOSIT", "INTEREST", "DIVIDEND"].includes(tx.transactionType)) tx.netAmount = Math.abs(tx.price);
  else if (tx.transactionType === "WITHDRAW") tx.netAmount = -Math.abs(tx.price);
  else tx.netAmount = 0;
  return tx;
}

function recomputeAll() {
  state.appTransactions = state.appTransactions.map(normalizeTransaction);
  runReconciliation();
  recomputeLotsMatchesAndRebuy();
  recomputeBorrowRebuyCycles();
  recomputeCashLedger();
}

function recomputeLotsMatchesAndRebuy() {
  const lots = [];
  const lotBySource = new Map();
  const buyTransactions = state.appTransactions
    .filter((tx) => tx.transactionType === "BUY" && tx.borrowRebuyType !== "REBUY_FILL")
    .sort(sortByDateAsc);
  for (const buy of buyTransactions) {
    const buyAmounts = effectiveTransactionAmounts(buy);
    const lot = {
      id: makeId("lot"),
      userId: buy.userId,
      portfolioId: buy.portfolioId,
      brokerId: buy.brokerId,
      brokerAccountId: buy.brokerAccountId,
      securityId: buy.securityId,
      buyTransactionId: buy.id,
      sourceTransactionId: buy.sourceTransactionId || buy.id,
      buyDate: buy.tradeDate,
      buyPrice: buy.price,
      originalShares: buy.shares,
      remainingShares: buy.shares,
      allocatedBuyFee: buyAmounts.fee,
      costBasisGross: buyAmounts.grossAmount,
      costBasisNet: Math.abs(buyAmounts.netAmount),
      strategyCategory: buy.strategyCategory,
      status: "OPEN",
      createdAt: buy.createdAt,
      updatedAt: nowIso()
    };
    lots.push(lot);
    lotBySource.set(lot.sourceTransactionId, lot);
    lotBySource.set(lot.buyTransactionId, lot);
  }

  const matches = [];
  const sellTransactions = state.appTransactions
    .filter(isRegularRebuySellTransaction)
    .sort(sortByDateAsc);

  const sellRemainingSharesMap = new Map();
  const sellTxMap = new Map();
  for (const sell of sellTransactions) {
    const sharesToMatch = Math.min(sell.manualMatchedShares || sell.shares, sell.shares);
    sellRemainingSharesMap.set(sell.id, sharesToMatch);
    sellTxMap.set(sell.id, sell);
  }

  // Phase 2: Regular Long matches (先買後賣)
  for (const sell of sellTransactions) {
    const sellAmounts = effectiveTransactionAmounts(sell);
    const linkedIds = String(sell.linkedBuyTransactionId || "")
      .split(/[,\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);

    let sharesToMatch = sellRemainingSharesMap.get(sell.id);
    if (sharesToMatch === undefined) sharesToMatch = sell.shares;
    if (sharesToMatch <= 0) continue;

    for (const linkedId of linkedIds) {
      const lot = lotBySource.get(linkedId);
      if (!lot || sharesToMatch <= 0) continue;
      if (lot.brokerAccountId !== sell.brokerAccountId || lot.securityId !== sell.securityId) continue;

      const matchedShares = Math.min(sharesToMatch, lot.remainingShares);
      if (matchedShares <= 0) continue;

      const allocatedBuyGross = roundMoney((lot.costBasisGross || lot.buyPrice * lot.originalShares) * (matchedShares / Math.max(lot.originalShares, 1)));
      const allocatedSellGross = roundMoney((sellAmounts.grossAmount || sell.price * sell.shares) * (matchedShares / Math.max(sell.shares, 1)));
      const allocatedBuyFee = roundMoney((lot.allocatedBuyFee || 0) * (matchedShares / Math.max(lot.originalShares, 1)));
      const allocatedSellFee = roundMoney((sellAmounts.fee || 0) * (matchedShares / Math.max(sell.shares, 1)));
      const allocatedSellTax = roundMoney((sellAmounts.tax || 0) * (matchedShares / Math.max(sell.shares, 1)));

      const grossProfit = roundMoney(allocatedSellGross - allocatedBuyGross);
      const netProfit = roundMoney(allocatedSellGross - allocatedSellFee - allocatedSellTax - allocatedBuyGross - allocatedBuyFee);

      matches.push({
        id: makeId("match"),
        userId: sell.userId,
        portfolioId: sell.portfolioId,
        brokerId: sell.brokerId,
        brokerAccountId: sell.brokerAccountId,
        sellTransactionId: sell.id,
        buyLotId: lot.id,
        matchedShares,
        buyPrice: lot.buyPrice,
        sellPrice: sell.price,
        buyDate: lot.buyDate,
        sellDate: sell.tradeDate,
        grossProfit,
        allocatedBuyGross,
        allocatedSellGross,
        allocatedBuyFee,
        allocatedSellFee,
        allocatedSellTax,
        netProfit,
        createdAt: nowIso(),
        updatedAt: nowIso()
      });

      lot.remainingShares -= matchedShares;
      sharesToMatch -= matchedShares;
      sellRemainingSharesMap.set(sell.id, sharesToMatch);
    }
  }

  for (const lot of lots) {
    if (lot.remainingShares <= 0) lot.status = "CLOSED";
    else if (lot.remainingShares < lot.originalShares) lot.status = "PARTIAL_SOLD";
    else lot.status = "OPEN";
  }

  const tasks = sellTransactions.map((sell) => {
    const settings = getPortfolioSettings(sell.portfolioId);
    const offset = toNumber(settings.defaultRebuyOffset || 0.5);
    return {
      id: makeId("rebuy"),
      userId: sell.userId,
      portfolioId: sell.portfolioId,
      brokerId: sell.brokerId,
      brokerAccountId: sell.brokerAccountId,
      securityId: sell.securityId,
      sellTransactionId: sell.id,
      sellDate: sell.tradeDate,
      sellPrice: sell.price,
      sellShares: sell.shares,
      targetRebuyPrice: roundMoney(sell.price - offset),
      remainingRebuyShares: sell.shares,
      status: "OPEN",
      ruleOffset: offset,
      priority: 0,
      rebuyScope: "SAME_BROKER_ACCOUNT",
      linkedBuyTransactionId: sell.linkedBuyTransactionId || "",
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
  });

  const fills = [];
  const buyFillRemaining = new Map(buyTransactions.map((buy) => [buy.id, buy.shares]));
  const taskBySellId = new Map(tasks.map((task) => [task.sellTransactionId, task]));
  for (const buy of buyTransactions.slice().sort(sortByDateAsc)) {
    const selectedSellIds = parseRebuySellIds(buy.rebuySellTransactionIds);
    for (const sellId of selectedSellIds) {
      const task = taskBySellId.get(sellId);
      if (!task) continue;
      if (buy.portfolioId !== task.portfolioId || buy.securityId !== task.securityId) continue;
      if (buy.tradeDate < task.sellDate) continue;
      if (buy.brokerAccountId !== task.brokerAccountId) continue;
      const available = buyFillRemaining.get(buy.id) || 0;
      if (available <= 0 || task.remainingRebuyShares <= 0) continue;
      const filledShares = Math.min(available, task.remainingRebuyShares);
      fills.push({
        id: makeId("rebuy-fill"),
        userId: task.userId,
        portfolioId: task.portfolioId,
        rebuyTaskId: task.id,
        buyTransactionId: buy.id,
        fillDate: buy.tradeDate,
        fillPrice: buy.price,
        filledShares,
        isRuleValid: buy.price <= task.targetRebuyPrice,
        ruleCheckMessage: buy.price <= task.targetRebuyPrice ? "VALID" : "MANUAL_REBUY_PRICE_ABOVE_TARGET",
        createdAt: nowIso()
      });
      buyFillRemaining.set(buy.id, available - filledShares);
      task.remainingRebuyShares -= filledShares;
    }
  }

  for (const task of tasks) {
    if (state.manualClosedRebuySellIds.includes(task.sellTransactionId)) {
      task.status = "MANUAL_CLOSED";
      task.remainingRebuyShares = 0;
    } else if (task.remainingRebuyShares <= 0) {
      task.status = "CLOSED";
    } else if (task.remainingRebuyShares < task.sellShares) {
      task.status = "PARTIAL_FILLED";
    } else {
      task.status = "OPEN";
    }
  }

  state.buyLots = lots;
  state.sellMatches = matches;
  state.rebuyTasks = tasks;
  state.rebuyFills = fills;
}

function recomputeBorrowRebuyCycles() {
  const cycles = [];
  
  const borrowSells = state.appTransactions
    .filter((tx) => tx.transactionType === "SELL" && tx.borrowRebuyType === "BORROW_SELL")
    .sort(sortByDateAsc);
    
  const rebuyFills = state.appTransactions
    .filter((tx) => tx.transactionType === "BUY" && tx.borrowRebuyType === "REBUY_FILL")
    .sort(sortByDateAsc);
    
  const fillByCycleId = new Map();
  for (const fill of rebuyFills) {
    if (!fill.rebuyCycleId) continue;
    if (!fillByCycleId.has(fill.rebuyCycleId)) {
      fillByCycleId.set(fill.rebuyCycleId, []);
    }
    fillByCycleId.get(fill.rebuyCycleId).push(fill);
  }
  
  for (const sell of borrowSells) {
    const cycleId = sell.id;
    const security = securityById(sell.securityId);
    const symbol = security?.symbol || "";
    
    const cycleFills = fillByCycleId.get(cycleId) || [];
    let totalRebuyQty = 0;
    let totalRebuyCost = 0;
    let totalBuyFee = 0;
    let totalBuyTax = 0;
    const rebuyMatches = [];
    
    for (const fill of cycleFills) {
      const rebuyQty = fill.shares;
      const grossProfit = roundMoney((sell.price - fill.price) * rebuyQty);
      
      const allocatedSellFee = roundMoney(sell.fee * (rebuyQty / Math.max(sell.shares, 1)));
      const allocatedSellTax = roundMoney(sell.tax * (rebuyQty / Math.max(sell.shares, 1)));
      const allocatedBuyFee = fill.fee;
      const allocatedBuyTax = fill.tax;
      const netProfit = roundMoney(grossProfit - allocatedSellFee - allocatedSellTax - allocatedBuyFee - allocatedBuyTax);
      
      totalRebuyQty += rebuyQty;
      totalRebuyCost += fill.price * rebuyQty;
      totalBuyFee += allocatedBuyFee;
      totalBuyTax += allocatedBuyTax;
      
      rebuyMatches.push({
        rebuyTradeId: fill.id,
        rebuyDate: fill.tradeDate,
        rebuyPrice: fill.price,
        rebuyQty: rebuyQty,
        grossProfit: grossProfit,
        netProfit: netProfit
      });
    }
    
    const remainingRebuyQty = Math.max(0, sell.shares - totalRebuyQty);
    const avgRebuyPrice = totalRebuyQty > 0 ? roundMoney(totalRebuyCost / totalRebuyQty) : 0;
    const grossProfit = roundMoney((sell.price * totalRebuyQty) - totalRebuyCost);
    
    const totalSellFeeAllocated = roundMoney(sell.fee * (totalRebuyQty / Math.max(sell.shares, 1)));
    const totalSellTaxAllocated = roundMoney(sell.tax * (totalRebuyQty / Math.max(sell.shares, 1)));
    const netProfit = roundMoney(grossProfit - totalSellFeeAllocated - totalSellTaxAllocated - totalBuyFee - totalBuyTax);
    
    let status = "open";
    if (totalRebuyQty >= sell.shares) {
      status = "closed";
    } else if (totalRebuyQty > 0) {
      status = "partial";
    }
    
    cycles.push({
      id: cycleId,
      symbol: symbol,
      sourceInventoryLotId: normalizeSourceInventoryLotIds(sell.sourceInventoryLotId || sell.linkedBuyTransactionId).join(","),
      sellTradeId: sell.id,
      sellDate: sell.tradeDate,
      sellPrice: sell.price,
      sellQty: sell.shares,
      rebuyMatches: rebuyMatches,
      totalRebuyQty: totalRebuyQty,
      remainingRebuyQty: remainingRebuyQty,
      avgRebuyPrice: avgRebuyPrice,
      grossProfit: grossProfit,
      netProfit: netProfit,
      status: status
    });
  }
  
  state.borrowRebuyCycles = cycles;
}


function recomputeCashLedger() {
  const ledger = [];
  const grouped = new Map();
  const transactions = [...state.appTransactions].sort(sortByDateAsc);
  for (const tx of transactions) {
    const txAmounts = effectiveTransactionAmounts(tx);
    const key = `${tx.portfolioId}:${tx.brokerAccountId}`;
    const running = (grouped.get(key) || 0) + txAmounts.netAmount;
    grouped.set(key, running);
    ledger.push({
      id: makeId("cash-ledger"),
      userId: tx.userId,
      portfolioId: tx.portfolioId,
      brokerId: tx.brokerId,
      brokerAccountId: tx.brokerAccountId,
      cashAccountId: cashAccountIdFor(tx.portfolioId, tx.brokerAccountId),
      tradeDate: tx.tradeDate,
      settlementDate: tx.tradeDate,
      sourceType: "TRANSACTION",
      referenceId: tx.id,
      description: `${tx.transactionType} ${securityLabel(tx.securityId)}`,
      amount: txAmounts.netAmount,
      runningBalance: running,
      createdAt: nowIso()
    });
  }
  for (const transfer of state.accountTransfers.sort((a, b) => a.transferDate.localeCompare(b.transferDate))) {
    const fromAccount = state.brokerAccounts.find((account) => account.id === transfer.fromBrokerAccountId);
    const toAccount = state.brokerAccounts.find((account) => account.id === transfer.toBrokerAccountId);
    if (!fromAccount || !toAccount) continue;
    const fromKey = `${transfer.portfolioId}:${transfer.fromBrokerAccountId}`;
    const toKey = `${transfer.portfolioId}:${transfer.toBrokerAccountId}`;
    const fromRunning = (grouped.get(fromKey) || 0) - transfer.amount - transfer.fee;
    const toRunning = (grouped.get(toKey) || 0) + transfer.amount;
    grouped.set(fromKey, fromRunning);
    grouped.set(toKey, toRunning);
    ledger.push({
      id: makeId("cash-ledger"),
      userId: currentUser()?.id || "",
      portfolioId: transfer.portfolioId,
      brokerId: fromAccount.brokerId,
      brokerAccountId: transfer.fromBrokerAccountId,
      cashAccountId: cashAccountIdFor(transfer.portfolioId, transfer.fromBrokerAccountId),
      tradeDate: transfer.transferDate,
      settlementDate: transfer.transferDate,
      sourceType: "TRANSFER",
      referenceId: transfer.id,
      description: "現金轉出",
      amount: -transfer.amount - transfer.fee,
      runningBalance: fromRunning,
      createdAt: nowIso()
    });
    ledger.push({
      id: makeId("cash-ledger"),
      userId: currentUser()?.id || "",
      portfolioId: transfer.portfolioId,
      brokerId: toAccount.brokerId,
      brokerAccountId: transfer.toBrokerAccountId,
      cashAccountId: cashAccountIdFor(transfer.portfolioId, transfer.toBrokerAccountId),
      tradeDate: transfer.transferDate,
      settlementDate: transfer.transferDate,
      sourceType: "TRANSFER",
      referenceId: transfer.id,
      description: "現金轉入",
      amount: transfer.amount,
      runningBalance: toRunning,
      createdAt: nowIso()
    });
  }
  state.cashLedger = ledger.sort(sortByTradeDateAsc);
}

function runReconciliation() {
  const links = [];
  const appGroups = groupTransactionsForReconciliation(state.appTransactions, false, false);
  const brokerGroups = groupTransactionsForReconciliation(state.brokerExecutions, true, false);
  const allKeys = new Set([...appGroups.keys(), ...brokerGroups.keys()]);
  for (const key of allKeys) {
    links.push(...reconcileTransactionBucket(appGroups.get(key) || [], brokerGroups.get(key) || []));
  }
  state.reconciliationLinks = links.map(applyBrokerAcceptanceToLink);
}

function applyBrokerAcceptanceToLink(link) {
  const key = brokerDiffAcceptanceKey(link);
  const acceptedAt = (state.acceptedBrokerDiffs || {})[key] || "";
  return { ...link, brokerAcceptanceKey: key, brokerAcceptedAt: acceptedAt };
}

function brokerDiffAcceptanceKey(link) {
  return [link.portfolioId, link.brokerAccountId, link.securityId, link.tradeDate, link.side, link.appTransactionId, link.brokerExecutionId, roundMoney(link.allocatedShares), roundMoney(link.allocatedGrossAmount), roundMoney(link.allocatedFee), roundMoney(link.allocatedTax), roundMoney(link.allocatedNetAmount)].join("|");
}

function isConfirmableBrokerDiff(link) {
  return ["FEE_TAX_DIFF", "AMOUNT_DIFF"].includes(link.matchStatus) && Boolean(link.brokerExecutionId) && !link.brokerAcceptedAt;
}

function confirmableBrokerDiffLinks(portfolioId = selectedPortfolioId(), brokerAccountId = "ALL") {
  const accountScoped = brokerAccountId && brokerAccountId !== "ALL";
  return state.reconciliationLinks.filter((link) => link.portfolioId === portfolioId && (!accountScoped || link.brokerAccountId === brokerAccountId) && isConfirmableBrokerDiff(link));
}

function reconciliationIsSettled(link) {
  return ["MATCHED", "AUTO_GROUP_MATCHED"].includes(link.matchStatus) || Boolean(link.brokerAcceptedAt);
}

function reconciliationDisplayStatus(link) {
  return link?.brokerAcceptedAt ? "BROKER_ACCEPTED" : (link?.matchStatus || "-");
}

function reconciliationStatusPill(link) {
  return statusPill(reconciliationDisplayStatus(link));
}
function promptBrokerDiffConfirmation(title = "對帳發現差異", brokerAccountId = "ALL") {
  const links = confirmableBrokerDiffLinks(selectedPortfolioId(), brokerAccountId);
  if (!links.length) return null;
  const totalFeeDiff = roundMoney(sum(links, "diffFee"));
  const totalTaxDiff = roundMoney(sum(links, "diffTax"));
  const totalNetDiff = roundMoney(sum(links, "diffNetAmount"));
  const preview = links.slice(0, 6).map((link) => `${link.tradeDate} ${tradeTypeLabel(link.side)} ${securityLabel(link.securityId)} ${fmtNum(link.allocatedShares)}股 @ ${fmtPrice(link.price)} 淨額差 ${fmtMoney(link.diffNetAmount)}`).join("\n");
  const more = links.length > 6 ? `\n...另有 ${links.length - 6} 筆` : "";
  const ok = window.confirm(`${title}\n\n發現 ${links.length} 筆可用券商數字修正的金額/費稅差。\n手續費差 ${fmtMoney(totalFeeDiff)}，交易稅差 ${fmtMoney(totalTaxDiff)}，淨額差 ${fmtMoney(totalNetDiff)}。\n\n${preview}${more}\n\n按「確定」後，報表、庫存成本與損益會採用券商對帳單分攤後的數字。按「取消」則先保留 App 原數字。`);
  if (!ok) {
    showToast("尚未採用券商差異，請到對帳頁確認後再套用。");
    return false;
  }
  acceptBrokerDiffLinks(links, title);
  return true;
}

function acceptBrokerDiffLinks(links, reason = "ACCEPT_BROKER_AMOUNTS") {
  const acceptedAt = nowIso();
  const before = clone(state.acceptedBrokerDiffs || {});
  state.acceptedBrokerDiffs = { ...(state.acceptedBrokerDiffs || {}) };
  for (const link of links) state.acceptedBrokerDiffs[brokerDiffAcceptanceKey(link)] = acceptedAt;
  auditLog("ACCEPT_BROKER_AMOUNTS", "reconciliation", selectedPortfolioId(), before, { count: links.length, acceptedAt, reason }, selectedPortfolioId());
  recomputeAll();
  persist();
  render();
  showToast(`已採用券商數字 ${links.length} 筆`);
}
function reconcileTransactionBucket(appItems, brokerItems) {
  const links = [];
  const appGroups = groupByReconciliationPrice(appItems);
  const brokerGroups = groupByReconciliationPrice(brokerItems);
  const usedApp = new Set();
  const usedBroker = new Set();

  appGroups.forEach((appGroup, appIndex) => {
    const appShares = sum(appGroup.items, "shares");
    const brokerIndex = brokerGroups.findIndex((brokerGroup, index) => {
      return !usedBroker.has(index) && brokerGroup.key === appGroup.key && nearlyEqual(appShares, sum(brokerGroup.items, "shares"));
    });
    if (brokerIndex >= 0) {
      links.push(...createReconciliationLinks(appGroup.items, brokerGroups[brokerIndex].items));
      usedApp.add(appIndex);
      usedBroker.add(brokerIndex);
    }
  });

  let remainingAppGroups = appGroups.filter((_, index) => !usedApp.has(index));
  let remainingBrokerGroups = brokerGroups.filter((_, index) => !usedBroker.has(index));
  if (remainingAppGroups.length && remainingBrokerGroups.length && (remainingAppGroups.length === 1 || remainingBrokerGroups.length === 1)) {
    const remainingAppItems = flattenReconciliationGroups(remainingAppGroups);
    const remainingBrokerItems = flattenReconciliationGroups(remainingBrokerGroups);
    const portfolioId = (remainingAppItems[0] || remainingBrokerItems[0] || {}).portfolioId;
    if (nearlyEqual(sum(remainingAppItems, "shares"), sum(remainingBrokerItems, "shares")) && reconciliationPricesAreClose(remainingAppItems, remainingBrokerItems, portfolioId)) {
      links.push(...createReconciliationLinks(remainingAppItems, remainingBrokerItems));
      remainingAppGroups = [];
      remainingBrokerGroups = [];
    }
  }

  const usedPartialBroker = new Set();
  remainingAppGroups.forEach((appGroup) => {
    const brokerIndex = remainingBrokerGroups.findIndex((brokerGroup, index) => !usedPartialBroker.has(index) && brokerGroup.key === appGroup.key);
    if (brokerIndex >= 0) {
      links.push(...createReconciliationLinks(appGroup.items, remainingBrokerGroups[brokerIndex].items));
      usedPartialBroker.add(brokerIndex);
    } else {
      links.push(...createReconciliationLinks(appGroup.items, []));
    }
  });
  remainingBrokerGroups.forEach((brokerGroup, index) => {
    if (!usedPartialBroker.has(index)) links.push(...createReconciliationLinks([], brokerGroup.items));
  });
  return links;
}

function createReconciliationLinks(appItems, brokerItems) {
  const sample = appItems[0] || brokerItems[0];
  if (!sample) return [];
  const appShares = sum(appItems, "shares");
  const brokerShares = sum(brokerItems, "shares");
  const appNet = sum(appItems, "netAmount");
  const brokerNet = sum(brokerItems, "netAmount");
  const status = reconciliationStatus(appItems, brokerItems, appShares, brokerShares, appNet, brokerNet, sample.portfolioId);
  if (appItems.length && brokerItems.length && nearlyEqual(appShares, brokerShares)) {
    return allocateBrokerAmounts(appItems, brokerItems, sample.portfolioId).map((allocation) => ({
      id: makeId("recon"),
      userId: sample.userId,
      portfolioId: sample.portfolioId,
      brokerId: sample.brokerId,
      brokerAccountId: sample.brokerAccountId,
      appTransactionId: allocation.appTransactionId,
      brokerExecutionId: allocation.brokerExecutionId,
      securityId: sample.securityId,
      tradeDate: sample.tradeDate,
      side: sample.transactionType || sample.side,
      price: reconciliationAveragePrice(appItems.length ? appItems : brokerItems),
      allocatedShares: allocation.allocatedShares,
      allocatedGrossAmount: allocation.allocatedGrossAmount,
      allocatedFee: allocation.allocatedFee,
      allocatedTax: allocation.allocatedTax,
      allocatedNetAmount: allocation.allocatedNetAmount,
      matchStatus: status,
      matchConfidence: status === "MATCHED" ? 100 : 88,
      diffGrossAmount: roundMoney(allocation.allocatedGrossAmount - allocation.appGrossAmount),
      diffFee: roundMoney(allocation.allocatedFee - allocation.appFee),
      diffTax: roundMoney(allocation.allocatedTax - allocation.appTax),
      diffNetAmount: roundMoney(allocation.allocatedNetAmount - allocation.appNetAmount),
      createdAt: nowIso(),
      updatedAt: nowIso()
    }));
  }
  return [{
    id: makeId("recon"),
    userId: sample.userId,
    portfolioId: sample.portfolioId,
    brokerId: sample.brokerId,
    brokerAccountId: sample.brokerAccountId,
    appTransactionId: appItems.map((item) => item.id).join(","),
    brokerExecutionId: brokerItems.map((item) => item.id).join(","),
    securityId: sample.securityId,
    tradeDate: sample.tradeDate,
    side: sample.transactionType || sample.side,
    price: reconciliationAveragePrice(appItems.length ? appItems : brokerItems),
    allocatedShares: appShares || brokerShares,
    allocatedGrossAmount: sum(brokerItems, "grossAmount") || sum(appItems, "grossAmount"),
    allocatedFee: sum(brokerItems, "fee") || sum(appItems, "fee"),
    allocatedTax: sum(brokerItems, "tax") || sum(appItems, "tax"),
    allocatedNetAmount: brokerNet || appNet,
    matchStatus: status,
    matchConfidence: 0,
    diffGrossAmount: roundMoney(sum(brokerItems, "grossAmount") - sum(appItems, "grossAmount")),
    diffFee: roundMoney(sum(brokerItems, "fee") - sum(appItems, "fee")),
    diffTax: roundMoney(sum(brokerItems, "tax") - sum(appItems, "tax")),
    diffNetAmount: roundMoney(brokerNet - appNet),
    createdAt: nowIso(),
    updatedAt: nowIso()
  }];
}

function groupTransactionsForReconciliation(records, isBroker = false, includePrice = true) {
  const map = new Map();
  for (const record of records) {
    const side = isBroker ? record.side : record.transactionType;
    if (!["BUY", "SELL"].includes(side)) continue;
    const keyParts = [record.userId, record.portfolioId, record.brokerAccountId, record.securityId, record.tradeDate, side];
    if (includePrice) keyParts.push(reconciliationPriceKey(record));
    const key = keyParts.join("|");
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(record);
  }
  return map;
}

function groupByReconciliationPrice(items) {
  const map = new Map();
  for (const item of items) {
    const key = reconciliationPriceKey(item);
    if (!map.has(key)) map.set(key, { key, items: [] });
    map.get(key).items.push(item);
  }
  return Array.from(map.values()).sort((a, b) => Number(a.key) - Number(b.key));
}

function flattenReconciliationGroups(groups) {
  return groups.reduce((items, group) => items.concat(group.items), []);
}

function reconciliationPricesAreClose(appItems, brokerItems, portfolioId) {
  const settings = getPortfolioSettings(portfolioId);
  const diff = Math.abs(reconciliationAveragePrice(appItems) - reconciliationAveragePrice(brokerItems));
  return diff <= toNumber(settings.priceTolerance || 0.05);
}

function reconciliationAveragePrice(items) {
  const shares = sum(items, "shares");
  if (!shares) return 0;
  const gross = sum(items, "grossAmount") || items.reduce((total, item) => total + toNumber(item.price) * toNumber(item.shares), 0);
  return roundMoney(gross / shares);
}

function reconciliationPriceKey(record) {
  const price = Number(record.price);
  if (!Number.isFinite(price)) return "0.00";
  return price.toFixed(2);
}
function reconciliationStatus(appItems, brokerItems, appShares, brokerShares, appNet, brokerNet, portfolioId) {
  if (!appItems.length) return "MISSING_IN_APP";
  if (!brokerItems.length) return "MISSING_IN_BROKER";
  if (!nearlyEqual(appShares, brokerShares)) return "PARTIAL_MATCHED";
  const settings = getPortfolioSettings(portfolioId);
  const amountDiff = Math.abs(roundMoney(brokerNet - appNet));
  if (amountDiff > settings.amountTolerance) return "AMOUNT_DIFF";
  const feeDiff = Math.abs(roundMoney(sum(brokerItems, "fee") - sum(appItems, "fee")));
  const taxDiff = Math.abs(roundMoney(sum(brokerItems, "tax") - sum(appItems, "tax")));
  if (feeDiff > 0 || taxDiff > 0) return "FEE_TAX_DIFF";
  if (appItems.length === 1 && brokerItems.length === 1) return "MATCHED";
  return "AUTO_GROUP_MATCHED";
}

function allocateBrokerAmounts(appItems, brokerItems, portfolioId) {
  const settings = getPortfolioSettings(portfolioId);
  const brokerTotals = {
    shares: sum(brokerItems, "shares"),
    gross: sum(brokerItems, "grossAmount"),
    fee: sum(brokerItems, "fee"),
    tax: sum(brokerItems, "tax"),
    net: sum(brokerItems, "netAmount")
  };
  const baseTotal = settings.feeAllocationMethod === "BY_GROSS_AMOUNT" ? sum(appItems, "grossAmount") : sum(appItems, "shares");
  let allocatedGrossTotal = 0;
  let allocatedFeeTotal = 0;
  let allocatedTaxTotal = 0;
  let allocatedNetTotal = 0;
  return appItems.map((appItem, index) => {
    const base = settings.feeAllocationMethod === "BY_GROSS_AMOUNT" ? appItem.grossAmount : appItem.shares;
    const ratio = baseTotal ? base / baseTotal : 1 / appItems.length;
    let gross = roundMoney(brokerTotals.gross * ratio);
    let fee = roundMoney(brokerTotals.fee * ratio);
    let tax = roundMoney(brokerTotals.tax * ratio);
    let net = roundMoney(brokerTotals.net * ratio);
    if (index === appItems.length - 1) {
      gross = roundMoney(brokerTotals.gross - allocatedGrossTotal);
      fee = roundMoney(brokerTotals.fee - allocatedFeeTotal);
      tax = roundMoney(brokerTotals.tax - allocatedTaxTotal);
      net = roundMoney(brokerTotals.net - allocatedNetTotal);
    }
    allocatedGrossTotal += gross;
    allocatedFeeTotal += fee;
    allocatedTaxTotal += tax;
    allocatedNetTotal += net;
    return {
      appTransactionId: appItem.id,
      brokerExecutionId: brokerItems.map((item) => item.id).join(","),
      allocatedShares: appItem.shares,
      allocatedGrossAmount: gross,
      allocatedFee: fee,
      allocatedTax: tax,
      allocatedNetAmount: net,
      appGrossAmount: appItem.grossAmount,
      appFee: appItem.fee,
      appTax: appItem.tax,
      appNetAmount: appItem.netAmount
    };
  });
}

async function getFirebaseRuntime() {
  if (firebaseRuntime) return firebaseRuntime;
  const config = firebaseConfigFromState();
  if (!config) throw new Error("找不到 Firebase Web Config");
  const appModule = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js");
  const firestoreModule = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js");
  const authModule = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js");
  const functionsModule = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js");
  const firebaseApp = appModule.initializeApp(config);
  const db = firestoreModule.getFirestore(firebaseApp);
  const auth = authModule.getAuth(firebaseApp);
  const functions = functionsModule.getFunctions(firebaseApp, "asia-east1");
  firebaseRuntime = { db, auth, authModule, functions, functionsModule, ...firestoreModule };
  return firebaseRuntime;
}

function firebaseConfigFromState() {
  const configText = String(state.settings.firebase.configText || "").trim();
  if (configText) return JSON.parse(configText);
  return window.stockLedgerFirebaseConfig || null;
}

function canAutoSyncFirebase() {
  try {
    return Boolean(firebaseConfigFromState() && currentUser()?.firebaseUid);
  } catch {
    return false;
  }
}

function scheduleFirebaseAutoSync() {
  if (!canAutoSyncFirebase()) return;
  firebaseAutoSyncQueued = true;
  window.clearTimeout(firebaseAutoSyncTimer);
  state.settings.firebase.status = "PENDING";
  persist();
  if (!firebaseAutoSyncInFlight) firebaseAutoSyncTimer = window.setTimeout(runFirebaseAutoSync, 900);
}

async function runFirebaseAutoSync() {
  if (!canAutoSyncFirebase()) { firebaseAutoSyncQueued = false; return; }
  if (firebaseAutoSyncInFlight) return;
  firebaseAutoSyncQueued = false;
  firebaseAutoSyncInFlight = true;
  try {
    await smartFirebaseSync({ silent: true });
  } catch (error) {
    console.error(error);
    state.settings.firebase.status = "SYNC_FAILED";
    persist();
    render();
    showToast(`Firebase 自動同步失敗：${formatFirebaseError(error)}`);
  } finally {
    firebaseAutoSyncInFlight = false;
    if (firebaseAutoSyncQueued && canAutoSyncFirebase()) {
      window.clearTimeout(firebaseAutoSyncTimer);
      firebaseAutoSyncTimer = window.setTimeout(runFirebaseAutoSync, 250);
    }
  }
}
// Gzip compression and decompression helper functions
async function compressText(text) {
  const stream = new Blob([text]).stream();
  const compressedStream = stream.pipeThrough(new CompressionStream("gzip"));
  const response = new Response(compressedStream);
  const blob = await response.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.readAsDataURL(blob);
  });
}

async function decompressText(base64) {
  const res = await fetch(`data:application/octet-stream;base64,${base64}`);
  const blob = await res.blob();
  const decompressedStream = blob.stream().pipeThrough(new DecompressionStream("gzip"));
  const response = new Response(decompressedStream);
  return await response.text();
}

function ledgerContentScore(data) {
  if (!data || typeof data !== "object") return 0;
  const keys = ["portfolios", "brokerAccounts", "importBatches", "rawImportRows", "appTransactions", "brokerExecutions", "accountTransfers", "positionTransfers", "marketQuotes", "auditLogs", "manualClosedRebuySellIds"];
  return keys.reduce((total, key) => total + (Array.isArray(data[key]) ? data[key].length : 0), 0) + Object.keys(data.acceptedBrokerDiffs || {}).length;
}

async function readFirebaseState(runtime, namespace) {
  const ref = runtime.doc(runtime.db, "stockLedgers", namespace);
  const snapshot = await runtime.getDoc(ref);
  if (!snapshot.exists()) return null;
  const mainData = snapshot.data();
  if (mainData.state) return mainData.state;
  const chunkCount = mainData.chunkCount || 0;
  if (chunkCount <= 0) throw new Error("Firebase 帳本資料無效或區塊數量為0");
  const chunkSnapshots = await Promise.all(Array.from({ length: chunkCount }, (_, i) => {
    const chunkRef = runtime.doc(runtime.db, "stockLedgers", namespace, "chunks", `chunk_${i}`);
    return runtime.getDoc(chunkRef);
  }));
  let compressedBase64 = "";
  for (let i = 0; i < chunkCount; i++) {
    const chunkSnap = chunkSnapshots[i];
    if (!chunkSnap.exists()) throw new Error(`同步載入失敗：缺少資料區塊 ${i}`);
    compressedBase64 += chunkSnap.data().data || "";
  }
  return JSON.parse(await decompressText(compressedBase64));
}

async function smartFirebaseSync(options = {}) {
  const runtime = await getFirebaseRuntime();
  requireFirebaseUser(runtime);
  const namespace = firebaseNamespace();
  const local = exportCurrentUserState();
  let remote;
  try {
    remote = await readFirebaseState(runtime, namespace);
  } catch (error) {
    if (/^同步載入失敗：缺少資料區塊/.test(String(error?.message || error))) {
      console.warn("Firebase 帳本分塊不完整，改用本機資料重建同步內容", error);
      await syncToFirebase(options);
      return;
    }
    throw error;
  }
  if (remote && ledgerContentScore(remote) > ledgerContentScore(local)) {
    mergeCurrentUserState(remote);
    state.settings.firebase.lastSyncAt = nowIso();
    state.settings.firebase.status = "SYNCED";
    persist();
    render();
    await syncToFirebase({ silent: true });
    if (!options.silent) showToast("已以資料較多的 Firebase 版本更新本機，並回寫同步");
    return;
  }
  await syncToFirebase(options);
}

async function syncToFirebase(options = {}) {
  const runtime = await getFirebaseRuntime();
  requireFirebaseUser(runtime);
  const namespace = firebaseNamespace();

  const stateData = exportCurrentUserState();
  const stateStr = JSON.stringify(stateData);
  const compressedBase64 = await compressText(stateStr);

  const chunkSize = 800000; // 800KB chunk size
  const chunks = [];
  for (let i = 0; i < compressedBase64.length; i += chunkSize) {
    chunks.push(compressedBase64.slice(i, i + chunkSize));
  }

  const ref = runtime.doc(runtime.db, "stockLedgers", namespace);
  const batch = runtime.writeBatch(runtime.db);
  batch.set(ref, {
    namespace,
    ownerUid: runtime.auth.currentUser.uid,
    ownerEmail: currentUser().email,
    updatedAt: nowIso(),
    chunkCount: chunks.length,
    isCompressed: true
  });

  for (let i = 0; i < chunks.length; i++) {
    const chunkRef = runtime.doc(runtime.db, "stockLedgers", namespace, "chunks", `chunk_${i}`);
    batch.set(chunkRef, {
      index: i,
      data: chunks[i],
      ownerUid: runtime.auth.currentUser.uid,
      updatedAt: nowIso()
    });
  }

  // Clean up any old chunks from prior syncs
  for (let i = chunks.length; i < chunks.length + 15; i++) {
    const leftoverRef = runtime.doc(runtime.db, "stockLedgers", namespace, "chunks", `chunk_${i}`);
    batch.delete(leftoverRef);
  }
  await batch.commit();

  state.settings.firebase.lastSyncAt = nowIso();
  state.settings.firebase.status = "SYNCED";
  persist();
  render();
  if (!options.silent) showToast("已同步到 Firebase");
}

async function loadFromFirebase() {
  const runtime = await getFirebaseRuntime();
  requireFirebaseUser(runtime);
  const namespace = firebaseNamespace();
  const remote = await readFirebaseState(runtime, namespace);
  if (!remote) throw new Error("Firebase 找不到這個 namespace");

  mergeCurrentUserState(remote);
  state.settings.firebase.lastSyncAt = nowIso();
  state.settings.firebase.status = "SYNCED";
  commit("已從 Firebase 載入");
}

function requireFirebaseUser(runtime) {
  if (!runtime.auth.currentUser) {
    throw new Error("請先使用 Google 登入，再同步 Firebase。");
  }
}

function formatFirebaseError(error) {
  const code = String(error?.code || "");
  if (code.includes("operation-not-allowed")) return "Google 登入尚未在 Firebase Console 啟用。請到 Authentication > Sign-in method 啟用 Google。";
  if (code.includes("unauthorized-domain")) return "目前網域尚未加入 Firebase Auth authorized domains。";
  if (code.includes("popup-blocked")) return "瀏覽器擋住登入 popup，請允許彈出視窗或再點一次。";
  if (code.includes("popup-closed-by-user")) return "Google 登入視窗已關閉，請再試一次。";
  return error?.message || "操作失敗";
}
function firebaseNamespace() {
  return String(state.settings.firebase.namespace || currentUser()?.email || "default")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_");
}


const BACKUP_FORMAT = "stockbook-backup-v2";

async function backupSha256(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function createBackupEnvelope(source = "LOCAL_EXPORT") {
  const backupState = exportCurrentUserState();
  const stateJson = JSON.stringify(backupState);
  return {
    format: BACKUP_FORMAT,
    schemaVersion: 2,
    createdAt: nowIso(),
    source,
    checksum: { algorithm: "SHA-256", value: await backupSha256(stateJson) },
    state: backupState
  };
}

async function parseBackupDocument(parsed) {
  if (!parsed || typeof parsed !== "object") throw new Error("備份檔格式無效");
  if (parsed.format !== BACKUP_FORMAT) return parsed;
  if (!parsed.state || parsed.schemaVersion !== 2) throw new Error("不支援的備份版本");
  if (!parsed.checksum || parsed.checksum.algorithm !== "SHA-256") throw new Error("備份檔缺少驗證碼");
  const actualChecksum = await backupSha256(JSON.stringify(parsed.state));
  if (actualChecksum !== parsed.checksum.value) throw new Error("備份檔驗證失敗，檔案可能已損壞");
  return parsed.state;
}

async function downloadBackupEnvelope(source = "LOCAL_EXPORT") {
  const envelope = await createBackupEnvelope(source);
  const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "stockbook_backup_" + new Date().toISOString().slice(0, 10) + ".json";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}


async function callBackupFunction(name, data = {}) {
  const runtime = await getFirebaseRuntime();
  requireFirebaseUser(runtime);
  const callable = runtime.functionsModule.httpsCallable(runtime.functions, name);
  return (await callable(data)).data;
}

async function refreshDriveBackupStatus() {
  const remote = await callBackupFunction("getBackupStatus");
  state.settings.backup = {
    ...state.settings.backup,
    enabled: Boolean(remote.enabled),
    connected: Boolean(remote.connected),
    connectedEmail: remote.connectedEmail || "",
    folderId: remote.folderId || "",
    lastBackupAt: remote.lastBackupAt || "",
    lastStatus: remote.lastStatus || "IDLE",
    recentRuns: remote.runs || []
  };
  persist();
  render();
  return remote;
}

async function connectGoogleDriveBackup() {
  const result = await callBackupFunction("startDriveAuthorization", { namespace: firebaseNamespace() });
  if (!result.url) throw new Error("無法建立 Google Drive 授權連結。");
  window.location.assign(result.url);
}

async function runGoogleDriveBackupNow() {
  const result = await callBackupFunction("runBackupNow");
  await refreshDriveBackupStatus();
  showToast("Google Drive 備份完成：" + result.fileName);
}

function openGoogleDriveBackupFolder() {
  const folderId = state.settings.backup && state.settings.backup.folderId;
  if (!folderId) throw new Error("尚未建立 Google Drive 備份資料夾。");
  window.open("https://drive.google.com/drive/folders/" + encodeURIComponent(folderId), "_blank", "noopener");
}

async function disconnectGoogleDriveBackup() {
  if (!window.confirm("確定解除 Google Drive 連結？每日備份會停止。")) return;
  await callBackupFunction("disconnectDrive");
  state.settings.backup = { ...state.settings.backup, enabled: false, connected: false, connectedEmail: "", lastStatus: "DISCONNECTED" };
  persist();
  render();
  showToast("已解除 Google Drive 連結。");
}


function exportCurrentUserState() {
  const user = currentUser();
  const portfolioIds = new Set(userPortfolios().map((portfolio) => portfolio.id));
  const accountIds = new Set(state.brokerAccounts.filter((account) => portfolioIds.has(account.portfolioId)).map((account) => account.id));
  const securityIds = new Set([
    ...state.appTransactions.filter((tx) => portfolioIds.has(tx.portfolioId)).map((tx) => tx.securityId),
    ...state.brokerExecutions.filter((execution) => portfolioIds.has(execution.portfolioId)).map((execution) => execution.securityId),
    ...state.positionTransfers.filter((transfer) => portfolioIds.has(transfer.portfolioId)).map((transfer) => transfer.securityId),
    ...state.marketQuotes.filter((quote) => portfolioIds.has(quote.portfolioId)).map((quote) => quote.securityId)
  ]);
  return {
    users: [user],
    portfolios: state.portfolios.filter((item) => portfolioIds.has(item.id)),
    portfolioMembers: state.portfolioMembers.filter((item) => portfolioIds.has(item.portfolioId)),
    securities: state.securities.filter((item) => securityIds.has(item.id) || item.symbol === "0050" || item.userId === user.id),
    brokerAccounts: state.brokerAccounts.filter((item) => accountIds.has(item.id)),
    importTemplates: state.importTemplates,
    importBatches: state.importBatches.filter((item) => portfolioIds.has(item.portfolioId)),
    rawImportRows: state.rawImportRows,
    appTransactions: state.appTransactions.filter((item) => portfolioIds.has(item.portfolioId)),
    brokerExecutions: state.brokerExecutions.filter((item) => portfolioIds.has(item.portfolioId)),
    accountTransfers: state.accountTransfers.filter((item) => portfolioIds.has(item.portfolioId)),
    positionTransfers: state.positionTransfers.filter((item) => portfolioIds.has(item.portfolioId)),
    marketQuotes: state.marketQuotes.filter((item) => portfolioIds.has(item.portfolioId)),
    auditLogs: state.auditLogs.filter((item) => !item.portfolioId || portfolioIds.has(item.portfolioId)),
    settings: state.settings,
    acceptedBrokerDiffs: state.acceptedBrokerDiffs || {},
    manualClosedRebuySellIds: state.manualClosedRebuySellIds
  };
}

function mergeCurrentUserState(remote) {
  if (!remote || typeof remote !== "object") throw new Error("Firebase state 格式不正確");
  remote = adoptRemoteStateForCurrentUser(remote);
  clearCurrentUserScopedState();
  for (const key of [
    "users",
    "portfolios",
    "portfolioMembers",
    "securities",
    "brokerAccounts",
    "importTemplates",
    "importBatches",
    "rawImportRows",
    "appTransactions",
    "brokerExecutions",
    "accountTransfers",
    "positionTransfers",
    "marketQuotes",
    "auditLogs"
  ]) {
    state[key] = mergeById(state[key] || [], remote[key] || []);
  }
  state.acceptedBrokerDiffs = { ...((remote || {}).acceptedBrokerDiffs || {}) };
  state.manualClosedRebuySellIds = Array.from(new Set([...(state.manualClosedRebuySellIds || []), ...((remote || {}).manualClosedRebuySellIds || [])]));
  state.settings = normalizeState({ ...state, settings: { ...state.settings, ...(remote.settings || {}) } }).settings;
  recomputeAll();
}

function clearCurrentUserScopedState() {
  const user = currentUser();
  if (!user) return;
  const portfolioIds = new Set([
    ...state.portfolios.filter((item) => item.userId === user.id).map((item) => item.id),
    ...state.portfolioMembers.filter((item) => item.userId === user.id).map((item) => item.portfolioId)
  ]);
  const accountIds = new Set(state.brokerAccounts.filter((item) => portfolioIds.has(item.portfolioId)).map((item) => item.id));
  const batchIds = new Set(state.importBatches.filter((item) => portfolioIds.has(item.portfolioId)).map((item) => item.id));
  const txIds = new Set(state.appTransactions.filter((item) => portfolioIds.has(item.portfolioId)).map((item) => item.id));
  state.portfolios = state.portfolios.filter((item) => !portfolioIds.has(item.id));
  state.portfolioMembers = state.portfolioMembers.filter((item) => !portfolioIds.has(item.portfolioId) && item.userId !== user.id);
  state.brokerAccounts = state.brokerAccounts.filter((item) => !portfolioIds.has(item.portfolioId));
  state.importBatches = state.importBatches.filter((item) => !portfolioIds.has(item.portfolioId));
  state.rawImportRows = state.rawImportRows.filter((item) => !batchIds.has(item.importBatchId));
  state.appTransactions = state.appTransactions.filter((item) => !portfolioIds.has(item.portfolioId));
  state.brokerExecutions = state.brokerExecutions.filter((item) => !portfolioIds.has(item.portfolioId));
  state.accountTransfers = state.accountTransfers.filter((item) => !portfolioIds.has(item.portfolioId));
  state.positionTransfers = state.positionTransfers.filter((item) => !portfolioIds.has(item.portfolioId));
  state.marketQuotes = state.marketQuotes.filter((item) => !portfolioIds.has(item.portfolioId));
  state.cashAccounts = state.cashAccounts.filter((item) => !portfolioIds.has(item.portfolioId) && !accountIds.has(item.brokerAccountId));
  state.cashLedger = state.cashLedger.filter((item) => !portfolioIds.has(item.portfolioId));
  state.buyLots = state.buyLots.filter((item) => !portfolioIds.has(item.portfolioId));
  state.sellMatches = state.sellMatches.filter((item) => !portfolioIds.has(item.portfolioId));
  state.rebuyTasks = state.rebuyTasks.filter((item) => !portfolioIds.has(item.portfolioId));
  state.rebuyFills = state.rebuyFills.filter((item) => !portfolioIds.has(item.portfolioId));
  state.auditLogs = state.auditLogs.filter((item) => item.portfolioId && !portfolioIds.has(item.portfolioId));
  state.manualClosedRebuySellIds = (state.manualClosedRebuySellIds || []).filter((item) => !txIds.has(item));
  for (const id of portfolioIds) delete state.settings.portfolios[id];
}
function adoptRemoteStateForCurrentUser(remote) {
  const user = currentUser();
  if (!user) return remote;
  const copy = clone(remote);
  const remoteUsers = copy.users || [];
  const email = String(user.email || "").toLowerCase();
  const ownerIds = new Set(
    remoteUsers
      .filter((item) => !item.email || String(item.email).toLowerCase() === email || remoteUsers.length === 1)
      .map((item) => item.id)
      .filter(Boolean)
  );
  if (!ownerIds.size) return copy;
  const remapUserId = (record) => {
    if (record && ownerIds.has(record.userId)) record.userId = user.id;
  };
  copy.users = [{ ...user }];
  for (const key of ["portfolios", "portfolioMembers", "brokerAccounts", "appTransactions", "brokerExecutions", "accountTransfers", "positionTransfers", "marketQuotes", "auditLogs"]) {
    for (const record of copy[key] || []) remapUserId(record);
  }
  return copy;
}
async function exportExcel() {
  await backfillMissingBenchmarkPrices(selectedPortfolioId(), reportBrokerAccountId());
  const html = `
    <html><head><meta charset="utf-8" /></head><body>
      ${reportHtmlTable("0050 操作績效追蹤", reportRows("performance0050"))}
    </body></html>
  `;
  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `stock-ledger-${today()}.xls`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  showToast("Excel 檔已匯出");
}

async function exportPdfReport() {
  await backfillMissingBenchmarkPrices(selectedPortfolioId(), reportBrokerAccountId());
  const model = buildPdfReportModel(selectedPortfolioId(), reportBrokerAccountId());
  const html = buildPrettyPdfReportHtml(model);
  const reportWindow = window.open("", "_blank");
  if (!reportWindow) {
    downloadReportHtml(html, model);
    showToast("瀏覽器封鎖新視窗，已改下載 HTML，可開啟後列印成 PDF");
    return;
  }
  reportWindow.document.open();
  reportWindow.document.write(html);
  reportWindow.document.close();
  reportWindow.focus();
  reportWindow.setTimeout(() => reportWindow.print(), 600);
  showToast("PDF 報告已開啟，選擇儲存為 PDF 即可");
}

async function emailReportSummary() {
  await backfillMissingBenchmarkPrices(selectedPortfolioId(), reportBrokerAccountId());
  const model = buildPdfReportModel(selectedPortfolioId(), reportBrokerAccountId());
  const to = currentUser()?.email || "";
  const subject = `Jackstock ${model.reportDate} 交易報告摘要`;
  const body = [
    `Jackstock ${model.portfolioName} 交易報告`,
    `報告日期：${model.reportDate}`,
    `當日交易：${fmtNum(model.dayTransactions.length)} 筆`,
    `當日已實現淨利：${fmtMoney(model.daySummary.net)}`,
    `${model.reportMonth} 月累計淨利：${fmtMoney(model.monthSummary.net)}`,
    `${model.reportYear} 年累計淨利：${fmtMoney(model.yearSummary.net)}`,
    `目前持股：${fmtNum(model.inventoryShares)} 股`,
    `現金餘額：${fmtMoney(model.metrics.cash)}`,
    `帳面資產：${fmtMoney(model.assetSeries.at(-1)?.assets || 0)}`,
    "",
    "PDF 附件：請在 APP 報表頁點「匯出 PDF」後，從手機/瀏覽器儲存 PDF 再附上。",
    "Spark 方案沒有後端寄信服務，所以目前不會自動寄送 PDF 附件。"
  ].join("\n");
  window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function downloadReportHtml(html, model) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `jackstock-report-${model.reportDate}.html`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function buildPdfReportModel(portfolioId, brokerAccountId = reportBrokerAccountId(portfolioId)) {
  const transactions = scopedTransactions(portfolioId).filter((tx) => reportAccountMatches(tx, brokerAccountId)).slice().sort(sortByDateAsc);
  const matches = state.sellMatches.filter((match) => match.portfolioId === portfolioId && reportAccountMatches(match, brokerAccountId)).slice().sort((a, b) => String(a.sellDate || "").localeCompare(String(b.sellDate || "")));
  const profitEvents = realizedProfitEvents(portfolioId, brokerAccountId);
  if (!transactions.length && !matches.length) throw new Error("沒有可產生報告的交易資料");
  const reportDate = latestReportDate(transactions, profitEvents);
  const reportMonth = reportDate.slice(0, 7);
  const reportYear = reportDate.slice(0, 4);
  const dayTransactions = transactions.filter((tx) => tx.tradeDate === reportDate).sort(reportTransactionSort);
  const dayMatches = matches.filter((match) => match.sellDate === reportDate);
  const dayProfitEvents = profitEvents.filter((event) => event.date === reportDate);
  const monthProfitEvents = profitEvents.filter((event) => String(event.date || "").startsWith(reportMonth));
  const yearProfitEvents = profitEvents.filter((event) => String(event.date || "").startsWith(reportYear));
  const monthDailyRows = summarizeProfitEventsBy(monthProfitEvents, (event) => event.date);
  const yearMonthlyRows = summarizeProfitEventsBy(yearProfitEvents, (event) => String(event.date || "").slice(0, 7));
  const inventoryLots = state.buyLots
    .filter((lot) => lot.portfolioId === portfolioId && reportAccountMatches(lot, brokerAccountId) && toNumber(lot.remainingShares) > 0)
    .slice()
    .sort(sortInventoryLotsByPriceDesc);
  const assetSeries = reportAssetSeries(portfolioId, transactions, brokerAccountId);
  const holdingSeries = dailyInventorySeries(portfolioId, brokerAccountId);
  const inventoryShares = reportSum(inventoryLots, (lot) => lot.remainingShares);
  const inventoryCost = reportSum(inventoryLots, (lot) => lot.remainingShares * lot.buyPrice + (lot.allocatedBuyFee || 0) * (lot.remainingShares / Math.max(lot.originalShares || 1, 1)));
  return {
    portfolioName: selectedPortfolio()?.name || "Stock Ledger",
    reportDate,
    reportMonth,
    reportYear,
    generatedAt: new Date().toLocaleString("zh-TW", { hour12: false }),
    dateRange: reportDateRange(transactions),
    transactions,
    matches,
    profitEvents,
    dayTransactions,
    dayMatches,
    dayProfitEvents,
    dayBorrowRebuyEvents: dayProfitEvents.filter((event) => event.type === "BORROW_REBUY"),
    monthDailyRows,
    yearMonthlyRows,
    daySummary: summarizeProfitEvents(dayProfitEvents, reportDate),
    monthSummary: summarizeProfitEvents(monthProfitEvents, reportMonth),
    yearSummary: summarizeProfitEvents(yearProfitEvents, reportYear),
    inventoryLots,
    assetSeries,
    holdingSeries,
    inventoryShares,
    inventoryCost,
    metrics: portfolioMetrics(portfolioId, brokerAccountId),
    dayBuySpend: Math.abs(reportSum(dayTransactions.filter((tx) => tx.transactionType === "BUY"), (tx) => effectiveTransactionAmounts(tx).netAmount)),
    daySellNet: reportSum(dayTransactions.filter((tx) => tx.transactionType === "SELL"), (tx) => effectiveTransactionAmounts(tx).netAmount),
    depositsToDate: reportSum(transactions.filter((tx) => tx.transactionType === "DEPOSIT" && tx.tradeDate <= reportDate), (tx) => effectiveTransactionAmounts(tx).netAmount),
    borrowRebuyCycles: (state.borrowRebuyCycles || [])
      .filter((cycle) => {
        const sellTx = state.appTransactions.find((tx) => tx.id === cycle.sellTradeId);
        if (!sellTx) return false;
        if (sellTx.portfolioId !== portfolioId) return false;
        if (brokerAccountId !== "ALL" && sellTx.brokerAccountId !== brokerAccountId) return false;
        return true;
      }),
    benchmark: build0050BenchmarkModel(portfolioId, brokerAccountId, transactions, inventoryLots, reportDate)
  };
}

function realizedProfitEvents(portfolioId, brokerAccountId = "ALL") {
  const events = [];
  for (const match of state.sellMatches.filter((item) => item.portfolioId === portfolioId && reportAccountMatches(item, brokerAccountId))) {
    const costs = roundMoney(toNumber(match.allocatedBuyFee) + toNumber(match.allocatedSellFee) + toNumber(match.allocatedSellTax));
    events.push({
      id: "sell-match:" + match.id,
      type: "SELL_MATCH",
      date: match.sellDate,
      shares: toNumber(match.matchedShares),
      grossProfit: toNumber(match.grossProfit),
      costs,
      netProfit: toNumber(match.netProfit),
      buyDate: match.buyDate,
      buyPrice: match.buyPrice,
      sellDate: match.sellDate,
      sellPrice: match.sellPrice
    });
  }

  for (const cycle of state.borrowRebuyCycles || []) {
    const sell = state.appTransactions.find((tx) => tx.id === cycle.sellTradeId);
    if (!sell || sell.portfolioId !== portfolioId || !reportAccountMatches(sell, brokerAccountId)) continue;
    for (const rebuyMatch of cycle.rebuyMatches || []) {
      const grossProfit = toNumber(rebuyMatch.grossProfit);
      const netProfit = toNumber(rebuyMatch.netProfit);
      events.push({
        id: "borrow-rebuy:" + cycle.id + ":" + (rebuyMatch.rebuyTradeId || (rebuyMatch.rebuyDate + "-" + events.length)),
        type: "BORROW_REBUY",
        date: rebuyMatch.rebuyDate,
        shares: toNumber(rebuyMatch.rebuyQty),
        grossProfit,
        costs: roundMoney(grossProfit - netProfit),
        netProfit,
        sourceSellDate: sell.tradeDate,
        sellPrice: sell.price,
        rebuyPrice: rebuyMatch.rebuyPrice,
        cycleId: cycle.id
      });
    }
  }

  return events.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || String(a.id || "").localeCompare(String(b.id || "")));
}

function build0050BenchmarkModel(portfolioId, brokerAccountId, transactions, inventoryLots, reportDate) {
  const security = benchmarkSecurity(portfolioId);
  const fractionalShareRatio = 0.98;
  const reportPriceInfo = benchmarkPriceForDate(portfolioId, security?.id, reportDate, transactions);
  const reportPrice = toNumber(reportPriceInfo.price);
  const cashFlows = transactions.filter((tx) => ["DEPOSIT", "WITHDRAW"].includes(tx.transactionType)).slice().sort(sortByDateAsc);
  const rows = [];
  let passiveShares = 0;
  let cumulativeDeposit = 0;
  let cumulativeWithdraw = 0;
  for (const tx of cashFlows) {
    const amounts = effectiveTransactionAmounts(tx);
    const amount = Math.abs(toNumber(amounts.netAmount));
    if (!amount) continue;
    const priceInfo = benchmarkPriceForCashFlow(portfolioId, security?.id, tx, transactions);
    const price = toNumber(priceInfo.price || reportPrice);
    if (!price) continue;
    const account = state.brokerAccounts.find((item) => item.id === tx.brokerAccountId);
    const fee = brokerFeeSetting(account?.brokerId, portfolioId);
    const buyCostRate = toNumber(fee.feeRate) * toNumber(fee.discountRate);
    const sellNetRate = Math.max(0.000001, 1 - buyCostRate - securityTaxRate(security, fee));
    const isDeposit = tx.transactionType === "DEPOSIT";
    const shares = isDeposit ? (amount * fractionalShareRatio) / (price * (1 + buyCostRate)) : amount / (price * sellNetRate);
    passiveShares += isDeposit ? shares : -shares;
    if (isDeposit) cumulativeDeposit += amount;
    else cumulativeWithdraw += amount;
    rows.push({
      date: tx.tradeDate,
      type: tx.transactionType,
      amount,
      price,
      shares: isDeposit ? shares : -shares,
      cumulativeShares: passiveShares,
      source: priceInfo.source,
      note: isDeposit ? "次一交易日收盤價 × 0.98 換算" : "出金日賣出等值"
    });
  }
  const benchmarkLots = inventoryLots.filter((lot) => lot.securityId === security?.id);
  const actualShares = reportSum(benchmarkLots, (lot) => lot.remainingShares);
  const otherInventoryValue = reportSum(inventoryLots.filter((lot) => lot.securityId !== security?.id), (lot) => inventoryLotReportMarketValue(lot, reportPrice));
  const cash = portfolioMetrics(portfolioId, brokerAccountId).cash;
  const cashEquivalentShares = reportPrice ? cash / reportPrice : 0;
  const otherEquivalentShares = reportPrice ? otherInventoryValue / reportPrice : 0;
  const operationEquivalentShares = actualShares + cashEquivalentShares + otherEquivalentShares;
  const liquidationValue = cash + reportSum(inventoryLots, (lot) => inventoryLotReportLiquidationValue(lot, reportPrice));
  const liquidationEquivalentShares = reportPrice ? liquidationValue / reportPrice : 0;
  const excessShares = operationEquivalentShares - passiveShares;
  const excessRate = passiveShares ? excessShares / passiveShares : 0;
  const excessValue = excessShares * reportPrice;
  const equivalentAverageCost = operationEquivalentShares ? (cumulativeDeposit - cumulativeWithdraw) / operationEquivalentShares : 0;
  return {
    securityId: security?.id || "",
    symbol: security?.symbol || "0050",
    name: security?.name || "元大台灣50",
    reportPrice,
    reportPriceSource: reportPriceInfo.source,
    cumulativeDeposit,
    cumulativeWithdraw,
    passiveShares,
    actualShares,
    cash,
    cashEquivalentShares,
    otherInventoryValue,
    otherEquivalentShares,
    operationEquivalentShares,
    liquidationEquivalentShares,
    excessShares,
    excessRate,
    excessValue,
    equivalentAverageCost,
    fractionalShareRatio,
    rows,
    series: build0050BenchmarkSeries(portfolioId, transactions, rows, reportDate, reportPrice, security?.id),
    dailyRows: build0050BenchmarkSeries(portfolioId, transactions, rows, reportDate, reportPrice, security?.id),
    dividendPolicy: "股息現金保留",
    priceRule: "入金以次一交易日收盤價換算 0050 股數，並以 0.98 反映零股成交價差；若缺價則採最近可用市場報價或報告日現價。"
  };
}


function benchmarkPriceForCashFlow(portfolioId, securityId, tx, transactions = []) {
  if (tx?.benchmarkSecurityId === securityId && toNumber(tx.benchmarkPrice) > 0) {
    return {
      price: toNumber(tx.benchmarkPrice),
      source: tx.benchmarkPriceSource || "入金次一交易日收盤價",
      sourceDate: tx.benchmarkPriceDate || tx.tradeDate
    };
  }
  return benchmarkPriceForDate(portfolioId, securityId, tx?.tradeDate, transactions);
}

function benchmarkSecurity(portfolioId) {
  const symbol = String(getPortfolioSettings(portfolioId).defaultSecurity || "0050").toUpperCase();
  return state.securities.find((item) => item.symbol === symbol) || state.securities.find((item) => item.symbol === "0050") || ensureSecurity("0050", "元大台灣50");
}

function benchmarkPriceForDate(portfolioId, securityId, date, transactions = []) {
  if (!securityId) return { price: 0, source: "無基準價" };
  const cashBenchmark = transactions.filter((tx) => tx.tradeDate === date && tx.benchmarkSecurityId === securityId && toNumber(tx.benchmarkPrice) > 0).sort((a, b) => String(b.benchmarkPriceCapturedAt || b.updatedAt || "").localeCompare(String(a.benchmarkPriceCapturedAt || a.updatedAt || "")))[0];
  if (cashBenchmark) return { price: toNumber(cashBenchmark.benchmarkPrice), source: cashBenchmark.benchmarkPriceSource || "入出金記錄基準價" };
  const sameDayTrades = transactions.filter((tx) => tx.securityId === securityId && tx.tradeDate === date && ["BUY", "SELL"].includes(tx.transactionType) && toNumber(tx.price) > 0);
  const sameDayShares = reportSum(sameDayTrades, (tx) => Math.abs(toNumber(tx.shares)));
  if (sameDayShares) {
    return { price: reportSum(sameDayTrades, (tx) => Math.abs(toNumber(tx.shares)) * toNumber(tx.price)) / sameDayShares, source: "APP當日成交均價" };
  }
  const datedQuotes = (state.marketQuotes || [])
    .filter((quote) => quote.portfolioId === portfolioId && quote.securityId === securityId && toNumber(quote.price) > 0)
    .map((quote) => ({ ...quote, date: String(quote.sourceDate || quote.quoteTime || "").slice(0, 10) }))
    .filter((quote) => quote.date);
  const priorQuote = datedQuotes.filter((quote) => quote.date <= date).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (priorQuote) return { price: toNumber(priorQuote.price), source: `${priorQuote.source || "市場報價"} ${priorQuote.date}` };
  const anyQuote = datedQuotes.sort((a, b) => b.date.localeCompare(a.date))[0];
  if (anyQuote) return { price: toNumber(anyQuote.price), source: `${anyQuote.source || "市場報價"} ${anyQuote.date}` };
  const latestTrade = transactions.filter((tx) => tx.securityId === securityId && ["BUY", "SELL"].includes(tx.transactionType) && toNumber(tx.price) > 0).sort((a, b) => String(b.tradeDate || "").localeCompare(String(a.tradeDate || "")))[0];
  if (latestTrade) return { price: toNumber(latestTrade.price), source: "APP最近成交價" };
  return { price: 0, source: "無基準價" };
}

function inventoryLotReportMarketValue(lot, fallbackPrice) {
  const quote = latestQuoteForSecurity(lot.securityId, lot.portfolioId);
  const benchmark = benchmarkSecurity(lot.portfolioId);
  const price = toNumber(quote?.price || (lot.securityId === benchmark?.id ? fallbackPrice : lot.buyPrice));
  return price * toNumber(lot.remainingShares);
}

function inventoryLotReportLiquidationValue(lot, fallbackPrice) {
  const gross = inventoryLotReportMarketValue(lot, fallbackPrice);
  const account = state.brokerAccounts.find((item) => item.id === lot.brokerAccountId);
  const fee = brokerFeeSetting(account?.brokerId, lot.portfolioId);
  const security = securityById(lot.securityId);
  const feeAmount = Math.max(toNumber(fee.minFee || 0), Math.floor(gross * toNumber(fee.feeRate) * toNumber(fee.discountRate)));
  const taxAmount = Math.floor(gross * securityTaxRate(security, fee));
  return Math.max(0, gross - feeAmount - taxAmount);
}

function build0050BenchmarkSeries(portfolioId, transactions, benchmarkRows, reportDate, reportPrice, securityId) {
  const dates = Array.from(new Set([...transactions.map((tx) => tx.tradeDate), reportDate].filter(Boolean))).sort();
  return dates.map((date) => {
    const price = toNumber(benchmarkPriceForDate(portfolioId, securityId, date, transactions).price || reportPrice);
    const passive = benchmarkRows.filter((row) => row.date <= date).reduce((total, row) => total + toNumber(row.shares), 0);
    let cash = 0;
    let shares = 0;
    for (const tx of transactions.filter((item) => item.tradeDate <= date)) {
      const amounts = effectiveTransactionAmounts(tx);
      cash += toNumber(amounts.netAmount);
      if (tx.securityId === securityId && tx.transactionType === "BUY") shares += toNumber(tx.shares);
      if (tx.securityId === securityId && tx.transactionType === "SELL") shares -= toNumber(tx.shares);
    }
    const cashEquivalentShares = price ? cash / price : 0;
    const equivalent = shares + cashEquivalentShares;
    const excess = equivalent - passive;
    return {
      date: date.slice(5),
      fullDate: date,
      price,
      actualShares: shares,
      cash,
      cashEquivalentShares,
      passive,
      equivalent,
      excess,
      excessValue: excess * price
    };
  });
}
function reportAssetSeries(portfolioId, transactions, brokerAccountId = "ALL") {
  const txs = transactions.filter((tx) => tx.portfolioId === portfolioId).slice().sort(sortByDateAsc);
  const sellCostByTransaction = new Map();
  for (const match of state.sellMatches.filter((item) => item.portfolioId === portfolioId && reportAccountMatches(item, brokerAccountId))) {
    const cost = toNumber(match.allocatedBuyGross) + toNumber(match.allocatedBuyFee);
    sellCostByTransaction.set(match.sellTransactionId, (sellCostByTransaction.get(match.sellTransactionId) || 0) + cost);
  }
  const byDate = new Map();
  for (const tx of txs) {
    if (!byDate.has(tx.tradeDate)) byDate.set(tx.tradeDate, []);
    byDate.get(tx.tradeDate).push(tx);
  }
  let cash = 0;
  let inventory = 0;
  return Array.from(byDate.keys()).sort().map((date) => {
    for (const tx of byDate.get(date) || []) {
      const amounts = effectiveTransactionAmounts(tx);
      cash += toNumber(amounts.netAmount);
      if (tx.transactionType === "BUY") inventory += Math.abs(toNumber(amounts.netAmount));
      if (tx.transactionType === "SELL") inventory -= toNumber(sellCostByTransaction.get(tx.id));
      if (inventory < 0 && inventory > -0.01) inventory = 0;
    }
    return {
      date: compactDate(date),
      cash: roundMoney(cash),
      inventory: roundMoney(inventory),
      assets: roundMoney(cash + inventory)
    };
  });
}
function latestReportDate(transactions, profitItems = []) {
  const dates = [
    ...transactions.map((tx) => tx.tradeDate),
    ...profitItems.map((item) => item.date || item.sellDate)
  ].filter(Boolean).sort();
  return dates[dates.length - 1] || today();
}

function reportDateRange(transactions) {
  const dates = transactions.map((tx) => tx.tradeDate).filter(Boolean).sort();
  if (!dates.length) return "-";
  return `${dates[0]} ~ ${dates[dates.length - 1]}`;
}

function reportTransactionSort(a, b) {
  const order = { SELL: 1, BUY: 2, DEPOSIT: 3, INTEREST: 4, DIVIDEND: 5, WITHDRAW: 6 };
  return (order[a.transactionType] || 9) - (order[b.transactionType] || 9) || String(a.createdAt || a.id).localeCompare(String(b.createdAt || b.id));
}

function summarizeProfitEventsBy(events, keyFn) {
  const groups = new Map();
  for (const event of events) {
    const key = keyFn(event) || "-";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }
  return Array.from(groups.entries())
    .map(([period, rows]) => summarizeProfitEvents(rows, period))
    .sort((a, b) => String(a.period).localeCompare(String(b.period)));
}

function summarizeProfitEvents(events, period) {
  return {
    period,
    trades: events.length,
    shares: reportSum(events, (event) => event.shares),
    gross: reportSum(events, (event) => event.grossProfit),
    costs: reportSum(events, (event) => event.costs),
    net: reportSum(events, (event) => event.netProfit)
  };
}

function buildPrettyPdfReportHtml(model) {
  const monthlyMax = Math.max(...model.monthDailyRows.map((row) => Math.abs(row.net)), 1);
  const yearlyMax = Math.max(...model.yearMonthlyRows.map((row) => Math.abs(row.net)), 1);
  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Jackstock ${escapeHtml(model.reportDate)} 交易報告</title>
<style>${pdfReportCss()}</style>
</head>
<body>
<div class="print-toolbar"><button onclick="window.print()">列印 / 儲存 PDF</button><button onclick="window.close()">關閉</button></div>
<div class="page">
  <header class="hero">
    <div class="hero-grid">
      <div>
        <div class="eyebrow">Jackstock Report</div>
        <h1>${escapeHtml(model.portfolioName)} 交易報告</h1>
        <div class="subtitle">報告日期 ${escapeHtml(model.reportDate)}，以 APP 交易紀錄、券商對帳採用數字與買賣配對計算。</div>
      </div>
      <div class="report-meta">
        ${pdfMetaRow("資料期間", model.dateRange)}
        ${pdfMetaRow("當日交易", `${fmtNum(model.dayTransactions.length)} 筆`)}
        ${pdfMetaRow("產出時間", model.generatedAt)}
      </div>
    </div>
  </header>

  <div class="kpi-grid">
    ${pdfKpi("當日已實現淨利", pdfSignedMoney(model.daySummary.net), `${fmtNum(model.daySummary.trades)} 筆已實現 / ${fmtNum(model.daySummary.shares)} 股`)}
    ${pdfKpi(`${model.reportMonth} 月累計`, pdfSignedMoney(model.monthSummary.net), `${fmtNum(model.monthSummary.shares)} 股已實現`)}
    ${pdfKpi(`${model.reportYear} 年累計`, pdfSignedMoney(model.yearSummary.net), `${fmtNum(model.yearSummary.trades)} 筆已實現事件`)}
    ${pdfKpi("操作後等效 0050", `${fmtNum(model.benchmark.operationEquivalentShares, 2)} 股`, `實際 ${fmtNum(model.benchmark.actualShares)} 股 / 現金 ${fmtNum(model.benchmark.cashEquivalentShares, 2)} 股`)}
  </div>

  ${pdfBenchmarkOverview(model.benchmark)}

  <div class="two-col chart-grid">
    <section>
      <div class="section-title"><div><h2>財產圖表</h2><div class="hint">帳面資產 = 現金 + 庫存成本，適合看資產曲線。</div></div></div>
      ${pdfLineChart(model.assetSeries, [{ key: "assets", label: "帳面資產", color: "#0f766e" }, { key: "cash", label: "現金", color: "#2563eb" }], "TWD")}
    </section>
    <section>
      <div class="section-title"><div><h2>庫存持有圖表</h2><div class="hint">持股股數與待回補股數，快速看部位變化。</div></div></div>
      ${pdfLineChart(model.holdingSeries, [{ key: "shares", label: "持股", color: "#0f766e" }, { key: "rebuy", label: "待回補", color: "#b45309" }], "shares")}
    </section>
  </div>

  ${pdfBenchmarkDetailSection(model.benchmark)}

  <section>
    <div class="section-title"><div><h2>當日交易流程</h2><div class="hint">先看買/賣、股數與成交價；展開型細節保留在 APP，PDF 放核心流程。</div></div><span class="pill">${escapeHtml(model.reportDate)}</span></div>
    <div class="flow">${model.dayTransactions.length ? model.dayTransactions.map((tx) => pdfFlowItem(tx, model.dayMatches)).join("") : `<div class="empty">當日沒有交易</div>`}</div>
  </section>

  <section>
    <div class="section-title"><div><h2>當日獲利摘要</h2><div class="hint">每日獲利包含一般賣出配對與已完成的借券回補；未完成回補與未賣出的庫存不列入已實現。</div></div><span class="pill">${escapeHtml(model.reportDate)}</span></div>
    ${pdfReportTable(["日期", "配對筆數", "配對股數", "毛利", "費稅", "淨利"], [[model.daySummary.period, fmtNum(model.daySummary.trades), fmtNum(model.daySummary.shares), fmtMoney(model.daySummary.gross), fmtMoney(model.daySummary.costs), pdfSignedMoney(model.daySummary.net)]], [1,2,3,4,5])}
  </section>

  <section>
    <div class="section-title"><div><h2>當日一般賣出配對明細</h2><div class="hint">淨利 = 賣出價差 - 買入分攤手續費 - 賣出手續費 - 交易稅。</div></div><span class="pill">${fmtNum(reportSum(model.dayMatches, (match) => match.matchedShares))} 股</span></div>
    ${pdfReportTable(["原買進日", "買進價", "賣出價", "股數", "毛利", "費稅", "淨利"], model.dayMatches.map((match) => [match.buyDate, fmtPrice(match.buyPrice), fmtPrice(match.sellPrice), fmtNum(match.matchedShares), fmtMoney(match.grossProfit), fmtMoney(toNumber(match.allocatedBuyFee) + toNumber(match.allocatedSellFee) + toNumber(match.allocatedSellTax)), pdfSignedMoney(match.netProfit)]), [3,4,5,6], "當日沒有已配對賣出")}
  </section>

  <section>
    <div class="section-title"><div><h2>當月每日獲利</h2><div class="hint">同月新增交易後會自動形成每日列。</div></div><span class="pill">月報</span></div>
    <div class="bar-list">${model.monthDailyRows.length ? model.monthDailyRows.map((row) => pdfBarRow(row.period, row.net, monthlyMax)).join("") : `<div class="empty">本月尚無已實現損益</div>`}</div>
    ${pdfReportTable(["日期", "配對筆數", "配對股數", "毛利", "費稅", "淨利"], model.monthDailyRows.map((row) => [row.period, fmtNum(row.trades), fmtNum(row.shares), fmtMoney(row.gross), fmtMoney(row.costs), pdfSignedMoney(row.net)]), [1,2,3,4,5])}
  </section>

  <div class="two-col">
    <section>
      <div class="section-title"><div><h2>月總結</h2><div class="hint">${escapeHtml(model.reportMonth)}</div></div></div>
      <div class="summary-list">
        ${pdfSummaryLine("賣出淨收", fmtMoney(model.daySellNet))}
        ${pdfSummaryLine("買進支出", fmtMoney(model.dayBuySpend))}
        ${pdfSummaryLine("已實現毛利", fmtMoney(model.monthSummary.gross))}
        ${pdfSummaryLine("費稅合計", fmtMoney(model.monthSummary.costs))}
        ${pdfSummaryLine("已實現淨利", pdfSignedMoney(model.monthSummary.net))}
      </div>
    </section>
    <section>
      <div class="section-title"><div><h2>年總結</h2><div class="hint">${escapeHtml(model.reportYear)} 截至 ${escapeHtml(model.reportDate)}</div></div></div>
      <div class="summary-list">
        ${pdfSummaryLine("累計入金", fmtMoney(model.depositsToDate))}
        ${pdfSummaryLine("現金餘額", fmtMoney(model.metrics.cash))}
        ${pdfSummaryLine("累計已實現毛利", fmtMoney(model.yearSummary.gross))}
        ${pdfSummaryLine("累計費稅", fmtMoney(model.yearSummary.costs))}
        ${pdfSummaryLine("累計已實現淨利", pdfSignedMoney(model.yearSummary.net))}
      </div>
    </section>
  </div>

  <section class="page-break">
    <div class="section-title"><div><h2>年度月別獲利</h2><div class="hint">看每個月份對年度損益的貢獻。</div></div><span class="pill">${escapeHtml(model.reportYear)}</span></div>
    <div class="bar-list">${model.yearMonthlyRows.length ? model.yearMonthlyRows.map((row) => pdfBarRow(row.period, row.net, yearlyMax)).join("") : `<div class="empty">本年尚無已實現損益</div>`}</div>
    ${pdfReportTable(["月份", "配對筆數", "配對股數", "毛利", "費稅", "淨利"], model.yearMonthlyRows.map((row) => [row.period, fmtNum(row.trades), fmtNum(row.shares), fmtMoney(row.gross), fmtMoney(row.costs), pdfSignedMoney(row.net)]), [1,2,3,4,5])}
  </section>

  <section>
    <div class="section-title"><div><h2>期末庫存</h2><div class="hint">依成本價由高到低排序，與庫存頁一致。</div></div><span class="pill">${fmtNum(model.inventoryShares)} 股</span></div>
    ${pdfReportTable(["買進日", "股票", "成本價", "剩餘股數", "剩餘成本", "券商帳戶"], model.inventoryLots.map((lot) => [lot.buyDate, securityLabel(lot.securityId), fmtPrice(lot.buyPrice), fmtNum(lot.remainingShares), fmtMoney(lot.remainingShares * lot.buyPrice), accountName(lot.brokerAccountId)]), [2,3,4], "目前沒有庫存")}
  </section>

  ${(() => {
    if (!model.borrowRebuyCycles || !model.borrowRebuyCycles.length) return "";
    const rows = model.borrowRebuyCycles.map((cycle) => {
      const sourceCostText = borrowSourceCostLabel(cycle.sourceInventoryLotId);
      const statusLabel = {
        open: "未回補",
        partial: "部分回補",
        closed: "已完成"
      }[cycle.status] || cycle.status;
      
      return [
        securityLabel(state.appTransactions.find(t => t.id === cycle.sellTradeId)?.securityId),
        sourceCostText,
        fmtPrice(cycle.sellPrice),
        fmtNum(cycle.sellQty),
        fmtNum(cycle.totalRebuyQty),
        fmtNum(cycle.remainingRebuyQty),
        cycle.totalRebuyQty > 0 ? fmtPrice(cycle.avgRebuyPrice) : "-",
        fmtMoney(cycle.grossProfit),
        fmtMoney(cycle.netProfit),
        statusLabel
      ];
    });
    return `
      <section>
        <div class="section-title">
          <div><h2>借券回補操作</h2><div class="hint">自有庫存借券高賣低補之策略績效（已分攤手續費與稅金）。</div></div>
          <span class="pill">策略</span>
        </div>
        ${pdfReportTable(
          ["股票", "來源庫存成本", "借券賣出價", "賣出股數", "已回補股數", "待回補股數", "平均回補價", "策略毛利", "策略淨利", "狀態"],
          rows,
          [1, 2, 3, 4, 5, 6, 7, 8],
          "無借券回補紀錄"
        )}
      </section>
    `;
  })()}

  <section>
    <div class="section-title"><div><h2>資料與備註</h2><div class="hint">正式匯出會帶入目前 APP 內已採用的券商對帳數字。</div></div></div>
    <div class="summary-list">
      ${pdfSummaryLine("配對方法", "依 APP 買賣配對結果，支援多筆買入依選擇順序扣股")}
      ${pdfSummaryLine("對帳規則", "若對帳差異已確認，報表採用券商手續費與交易稅")}
      ${pdfSummaryLine("Email 附件", "Firebase Spark 無後端寄信；請匯出 PDF 後從手機分享或附檔")}
    </div>
  </section>
</div>
</body>
</html>`;
}

function pdfBenchmarkOverview(benchmark) {
  if (!benchmark || !benchmark.reportPrice) return `<section><div class="empty">0050 基準比較需要 0050 現價或成交價後才能計算。</div></section>`;
  const verdict = benchmark.excessShares >= 0 ? "跑贏直接買進 0050" : "落後直接買進 0050";
  return `
  <section class="benchmark-hero">
    <div class="section-title"><div><h2>0050 被動持有基準比較</h2><div class="hint">同樣入金直接買進 0050 vs 目前帳戶現金與庫存折算後的等效股數。</div></div><span class="pill">${escapeHtml(verdict)}</span></div>
    <div class="benchmark-grid">
      ${pdfBenchmarkMetric("被動持有基準", `${fmtNum(benchmark.passiveShares, 2)} 股`, "入金日直接買進 0050")}
      ${pdfBenchmarkMetric("操作後等效", `${fmtNum(benchmark.operationEquivalentShares, 2)} 股`, `實際 ${fmtNum(benchmark.actualShares)} 股 + 現金折算`)}
      ${pdfBenchmarkMetric("策略超額", pdfSignedShares(benchmark.excessShares), `${stripTags(pdfSignedPercent(benchmark.excessRate))} / ${stripTags(pdfSignedMoney(benchmark.excessValue))}`)}
      ${pdfBenchmarkMetric("等效平均成本", fmtMoney(benchmark.equivalentAverageCost), `報告日基準價 ${fmtPrice(benchmark.reportPrice)}`)}
    </div>
    <div class="benchmark-verdict ${benchmark.excessShares >= 0 ? "positive-bg" : "negative-bg"}">
      截至 ${escapeHtml(benchmark.reportPriceSource)}，目前操作後約${benchmark.excessShares >= 0 ? "多出" : "少掉"} ${fmtNum(Math.abs(benchmark.excessShares), 2)} 股 0050，等效金額 ${fmtMoney(Math.abs(benchmark.excessValue))}。
    </div>
  </section>`;
}

function pdfBenchmarkDetailSection(benchmark) {
  if (!benchmark || !benchmark.reportPrice) return "";
  return `
  <section class="page-break">
    <div class="section-title"><div><h2>策略績效比較：操作帳戶 vs 直接買進 0050</h2><div class="hint">這一頁用等效 0050 股數評估策略，不把已實現淨利重複加入計算。</div></div><span class="pill">${escapeHtml(benchmark.symbol)}</span></div>
    <div class="kpi-grid">
      ${pdfKpi("累計入金", fmtMoney(benchmark.cumulativeDeposit), `出金 ${fmtMoney(benchmark.cumulativeWithdraw)}`)}
      ${pdfKpi("被動持有股數", `${fmtNum(benchmark.passiveShares, 2)} 股`, benchmark.dividendPolicy)}
      ${pdfKpi("操作後等效股數", `${fmtNum(benchmark.operationEquivalentShares, 2)} 股`, `全部結清 ${fmtNum(benchmark.liquidationEquivalentShares, 2)} 股`)}
      ${pdfKpi("策略超額", pdfSignedShares(benchmark.excessShares), stripTags(pdfSignedPercent(benchmark.excessRate)))}
    </div>
    <div class="two-col">
      <div>
        <div class="section-title"><div><h2>等效 0050 股數趨勢</h2><div class="hint">被動持有與操作後等效股數，越往上代表累積 0050 能力越好。</div></div></div>
        ${pdfLineChart(benchmark.series, [{ key: "passive", label: "被動持有", color: "#64748b" }, { key: "equivalent", label: "操作等效", color: "#0f766e" }, { key: "excess", label: "超額股數", color: "#2563eb" }], "shares")}
      </div>
      <div class="summary-list benchmark-summary">
        ${pdfSummaryLine("目前實際持有", `${fmtNum(benchmark.actualShares)} 股`)}
        ${pdfSummaryLine("現金餘額", fmtMoney(benchmark.cash))}
        ${pdfSummaryLine("現金等效股數", `${fmtNum(benchmark.cashEquivalentShares, 2)} 股`)}
        ${pdfSummaryLine("其他庫存等效", `${fmtNum(benchmark.otherEquivalentShares, 2)} 股`)}
        ${pdfSummaryLine("超額等效金額", pdfSignedMoney(benchmark.excessValue))}
        ${pdfSummaryLine("基準價格規則", escapeHtml(benchmark.priceRule))}
      </div>
    </div>
    <div class="section-title"><div><h2>入金基準明細</h2><div class="hint">用來檢查被動持有股數如何形成，避免 benchmark 黑箱。</div></div></div>
    ${pdfReportTable(["日期", "類型", "金額", "0050基準價", "換算股數", "累計基準股數", "價格來源"], benchmark.rows.map((row) => [row.date, tradeTypeLabel(row.type), fmtMoney(row.amount), fmtPrice(row.price), pdfSignedShares(row.shares), `${fmtNum(row.cumulativeShares, 2)} 股`, escapeHtml(row.source)]), [2,3,4,5], "目前沒有入金或出金資料可建立基準")}
    <div class="hint benchmark-note">注意：操作後等效股數 = 實際 0050 持股 + 現金與其他庫存折算 0050；已實現淨利已反映在現金或庫存中，不會再次加總。</div>
  </section>`;
}

function pdfBenchmarkMetric(label, value, sub) {
  return `<div class="benchmark-metric"><span>${escapeHtml(label)}</span><strong>${value}</strong><small>${escapeHtml(sub)}</small></div>`;
}

function pdfSignedShares(value) {
  const amount = toNumber(value);
  return `<span class="${amount >= 0 ? "positive" : "negative"}">${amount >= 0 ? "+" : ""}${fmtNum(amount, 2)} 股</span>`;
}

function pdfSignedPercent(value) {
  const amount = toNumber(value) * 100;
  return `<span class="${amount >= 0 ? "positive" : "negative"}">${amount >= 0 ? "+" : ""}${fmtNum(amount, 2)}%</span>`;
}
function pdfFlowItem(tx, dayMatches) {
  const amounts = effectiveTransactionAmounts(tx);
  const matchRows = dayMatches.filter((match) => match.sellTransactionId === tx.id);
  if (tx.transactionType === "SELL") {
    const net = reportSum(matchRows, (match) => match.netProfit);
    const costs = matchRows.length
      ? reportSum(matchRows, (match) => toNumber(match.allocatedBuyFee) + toNumber(match.allocatedSellFee) + toNumber(match.allocatedSellTax))
      : toNumber(amounts.fee) + toNumber(amounts.tax);
    const buyText = matchRows.length
      ? matchRows.map((match) => `${match.buyDate} @ ${fmtPrice(match.buyPrice)} / ${fmtNum(match.matchedShares)}股`).join("；")
      : "尚未配對";
    return `<div class="flow-item"><div class="tag sell">SELL</div><div class="flow-main"><strong>${escapeHtml(tx.tradeDate)} 賣出 ${escapeHtml(securityLabel(tx.securityId))}</strong><span>${fmtNum(tx.shares)} 股 @ ${fmtPrice(tx.price)} / 原買 ${escapeHtml(buyText)}</span></div><div class="num ${net >= 0 ? "positive" : "negative"}">${matchRows.length ? fmtMoney(net) : "-"}</div><div class="flow-note">費稅 ${fmtMoney(costs)}</div></div>`;
  }
  if (tx.transactionType === "BUY") {
    return `<div class="flow-item"><div class="tag buy">BUY</div><div class="flow-main"><strong>${escapeHtml(tx.tradeDate)} 買進 ${escapeHtml(securityLabel(tx.securityId))}</strong><span>${fmtNum(tx.shares)} 股 @ ${fmtPrice(tx.price)}</span></div><div class="num">${fmtMoney(amounts.grossAmount)}</div><div class="flow-note">手續費 ${fmtMoney(amounts.fee)}</div></div>`;
  }
  return `<div class="flow-item"><div class="tag cash">${escapeHtml(tradeTypeLabel(tx.transactionType))}</div><div class="flow-main"><strong>${escapeHtml(tx.tradeDate)} ${escapeHtml(tradeTypeLabel(tx.transactionType))}</strong><span>${escapeHtml(accountName(tx.brokerAccountId))}</span></div><div class="num">${fmtMoney(amounts.netAmount)}</div><div class="flow-note">現金</div></div>`;
}

function pdfReportCss() {
  return `:root{color-scheme:light;--ink:#172033;--muted:#667085;--line:#d9e1ec;--panel:rgba(255,255,255,.82);--teal:#0f766e;--blue:#2563eb;--red:#b42318;--green:#087443}@page{size:A4;margin:12mm}*{box-sizing:border-box}body{margin:0;font-family:"Segoe UI","Microsoft JhengHei",Arial,sans-serif;color:var(--ink);background:radial-gradient(circle at top left,#e0f2f1,transparent 30%),linear-gradient(135deg,#f8fafc,#edf4ff 46%,#fff7ed);font-size:12px;line-height:1.45}.print-toolbar{position:sticky;top:0;z-index:9;display:flex;gap:8px;justify-content:flex-end;padding:10px;background:rgba(255,255,255,.9);border-bottom:1px solid #d9e1ec}.print-toolbar button{border:1px solid #cbd5e1;border-radius:12px;background:#fff;padding:10px 14px;font-weight:800}.page{width:100%;padding:12px}.hero{border:1px solid rgba(130,150,180,.35);border-radius:22px;padding:24px;background:linear-gradient(135deg,rgba(255,255,255,.94),rgba(255,255,255,.64));box-shadow:0 18px 46px rgba(31,41,55,.11);margin-bottom:16px}.eyebrow{color:var(--teal);font-weight:800;letter-spacing:.08em;font-size:11px;text-transform:uppercase}h1{margin:5px 0 8px;font-size:29px;line-height:1.08;letter-spacing:0}.subtitle{color:var(--muted);font-size:13px}.hero-grid{display:grid;grid-template-columns:1.4fr .9fr;gap:18px;align-items:end}.report-meta{display:grid;gap:8px}.meta-row{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid rgba(130,150,180,.25);padding-bottom:7px}.meta-row span{color:var(--muted)}.meta-row strong{text-align:right}.kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:14px 0 16px}.kpi{border:1px solid rgba(130,150,180,.32);border-radius:16px;padding:13px;background:var(--panel);min-height:84px}.kpi span{display:block;color:var(--muted);font-weight:700;font-size:11px;margin-bottom:12px}.kpi strong{font-size:22px;line-height:1}.kpi small{display:block;color:var(--muted);margin-top:8px}.positive{color:var(--green)}.negative{color:var(--red)}section{background:var(--panel);border:1px solid rgba(130,150,180,.30);border-radius:18px;padding:16px;margin-bottom:13px;break-inside:avoid;box-shadow:0 10px 28px rgba(31,41,55,.06)}.section-title{display:flex;justify-content:space-between;align-items:start;gap:16px;margin-bottom:11px}h2{margin:0;font-size:18px;letter-spacing:0}.hint{color:var(--muted);margin-top:3px}.pill{display:inline-flex;align-items:center;border-radius:999px;border:1px solid #c7d2fe;background:#eef2ff;color:#3730a3;padding:4px 9px;font-weight:800;white-space:nowrap}table{width:100%;border-collapse:collapse}th{text-align:left;color:#475467;font-size:10px;padding:8px 7px;border-bottom:1px solid var(--line);background:rgba(248,250,252,.8)}td{padding:8px 7px;border-bottom:1px solid rgba(217,225,236,.8);vertical-align:top}tr:last-child td{border-bottom:0}.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.flow{display:grid;gap:9px}.flow-item{display:grid;grid-template-columns:70px 1fr 108px 96px;gap:10px;padding:10px;border-radius:14px;border:1px solid rgba(130,150,180,.24);background:rgba(255,255,255,.72);align-items:center}.tag{border-radius:10px;padding:6px 8px;text-align:center;font-weight:900;color:#fff}.tag.sell{background:#b42318}.tag.buy{background:#0f766e}.tag.cash{background:#475467}.flow-main strong{display:block;font-size:13px}.flow-main span,.flow-note{color:var(--muted);font-size:11px}.bar-list{display:grid;gap:9px;margin-bottom:10px}.bar-row{display:grid;grid-template-columns:82px 1fr 88px;gap:10px;align-items:center}.bar-track{height:11px;background:#edf2f7;border-radius:999px;overflow:hidden}.bar{height:100%;border-radius:999px;background:linear-gradient(90deg,#0f766e,#22c55e);min-width:2px}.two-col{display:grid;grid-template-columns:1fr 1fr;gap:13px}.summary-list{display:grid;gap:9px}.summary-line{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid rgba(217,225,236,.8)}.summary-line:last-child{border-bottom:0}.summary-line span{color:var(--muted)}.empty{padding:14px;border:1px dashed #cbd5e1;border-radius:14px;color:var(--muted);background:rgba(255,255,255,.6)}.pdf-chart{width:100%;min-height:210px;overflow:hidden;border:1px solid rgba(148,163,184,.26);border-radius:8px;background:rgba(255,255,255,.62);padding:6px}.pdf-chart svg{width:100%;height:auto;display:block}.pdf-chart .grid-line{stroke:rgba(148,163,184,.35);stroke-width:1}.pdf-chart .axis-line{stroke:rgba(71,85,105,.45);stroke-width:1.2}.pdf-chart .axis-label,.pdf-chart .legend-label{fill:#64748b;font-size:11px;font-weight:800}.benchmark-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.benchmark-metric{border:1px solid rgba(130,150,180,.28);border-radius:16px;padding:13px;background:rgba(255,255,255,.72)}.benchmark-metric span{display:block;color:var(--muted);font-size:11px;font-weight:800;margin-bottom:9px}.benchmark-metric strong{display:block;font-size:21px;line-height:1.1}.benchmark-metric small{display:block;color:var(--muted);margin-top:7px}.benchmark-verdict{margin-top:12px;border-radius:14px;padding:12px 14px;font-weight:800}.positive-bg{background:rgba(220,252,231,.72);border:1px solid rgba(22,163,74,.22)}.negative-bg{background:rgba(254,226,226,.72);border:1px solid rgba(180,35,24,.22)}.benchmark-summary{border:1px solid rgba(130,150,180,.24);border-radius:16px;padding:10px 14px;background:rgba(255,255,255,.62)}.benchmark-note{margin-top:10px}.page-break{break-before:page}@media print{body{background:#fff}.print-toolbar{display:none}.page{padding:0}.hero,section,.kpi{box-shadow:none}}@media(max-width:720px){.hero-grid,.kpi-grid,.two-col,.benchmark-grid{grid-template-columns:1fr}.flow-item{grid-template-columns:64px 1fr}.flow-item>.num,.flow-note{grid-column:2}}`;
}

function pdfLineChart(data, series, unit = "") {
  if (!data.length) return `<div class="empty">沒有足夠資料繪製圖表</div>`;
  const width = 720;
  const height = 240;
  const pad = { left: 58, right: 18, top: 22, bottom: 38 };
  const values = data.flatMap((row) => series.map((item) => toNumber(row[item.key])));
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const x = (index) => pad.left + (data.length === 1 ? plotW / 2 : (plotW * index) / (data.length - 1));
  const y = (value) => pad.top + plotH - ((toNumber(value) - min) / Math.max(max - min, 1)) * plotH;
  const yTicks = [min, (min + max) / 2, max];
  const paths = series.map((item) => {
    const d = data.map((row, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(row[item.key]).toFixed(1)}`).join(" ");
    return `<path d="${d}" fill="none" stroke="${escapeAttr(item.color)}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />`;
  }).join("");
  const dots = series.map((item) => data.map((row, index) => `<circle cx="${x(index).toFixed(1)}" cy="${y(row[item.key]).toFixed(1)}" r="3" fill="${escapeAttr(item.color)}" />`).join("")).join("");
  const labels = data.map((row, index) => {
    if (data.length > 8 && index !== 0 && index !== data.length - 1 && index % Math.ceil(data.length / 4) !== 0) return "";
    return `<text x="${x(index).toFixed(1)}" y="${height - 12}" text-anchor="middle" class="axis-label">${escapeHtml(row.date)}</text>`;
  }).join("");
  const grids = yTicks.map((tick) => `<line x1="${pad.left}" x2="${width - pad.right}" y1="${y(tick).toFixed(1)}" y2="${y(tick).toFixed(1)}" class="grid-line" /><text x="${pad.left - 8}" y="${(y(tick) + 4).toFixed(1)}" text-anchor="end" class="axis-label">${escapeHtml(chartValueLabel(tick, unit))}</text>`).join("");
  const legend = series.map((item, index) => `<g transform="translate(${pad.left + index * 138},12)"><circle r="4" fill="${escapeAttr(item.color)}"></circle><text x="10" y="4" class="legend-label">${escapeHtml(item.label)}</text></g>`).join("");
  return `<div class="pdf-chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="report chart">${legend}${grids}<line x1="${pad.left}" x2="${width - pad.right}" y1="${height - pad.bottom}" y2="${height - pad.bottom}" class="axis-line" />${paths}${dots}${labels}</svg></div>`;
}

function chartValueLabel(value, unit) {
  if (unit === "TWD") return Math.abs(value) >= 1000 ? `${Math.round(value / 1000)}k` : fmtNum(value);
  return fmtNum(value);
}
function pdfKpi(label, value, sub) {
  return `<div class="kpi"><span>${escapeHtml(label)}</span><strong>${value}</strong><small>${escapeHtml(sub)}</small></div>`;
}

function pdfMetaRow(label, value) {
  return `<div class="meta-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function pdfSummaryLine(label, value) {
  return `<div class="summary-line"><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`;
}

function pdfSignedMoney(value) {
  const amount = toNumber(value);
  return `<span class="${amount >= 0 ? "positive" : "negative"}">${fmtMoney(amount)}</span>`;
}

function pdfBarRow(label, value, maxAbs) {
  const amount = toNumber(value);
  const width = Math.max(4, Math.abs(amount) / Math.max(maxAbs, 1) * 100).toFixed(1);
  return `<div class="bar-row"><strong>${escapeHtml(label)}</strong><div class="bar-track"><div class="bar" style="width:${width}%"></div></div><strong class="num ${amount >= 0 ? "positive" : "negative"}">${fmtMoney(amount)}</strong></div>`;
}

function pdfReportTable(headers, rows, numericIndexes = [], emptyText = "沒有資料") {
  if (!rows.length) return `<div class="empty">${escapeHtml(emptyText)}</div>`;
  return `<table><thead><tr>${headers.map((header, index) => `<th class="${numericIndexes.includes(index) ? "num" : ""}">${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell, index) => `<td class="${numericIndexes.includes(index) ? "num" : ""}">${cell}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function reportSum(rows, getter) {
  return rows.reduce((total, row) => total + toNumber(getter(row)), 0);
}
function reportHtmlTable(title, rows) {
  const columns = rows.columns || [];
  const data = rows.rows || [];
  return `
    <h2>${escapeHtml(title)}</h2>
    <table border="1">
      <thead><tr>${columns.map((column) => `<th>${escapeHtml(column[1])}</th>`).join("")}</tr></thead>
      <tbody>${data.map((row) => `<tr>${columns.map(([key]) => `<td>${stripTags(row[key] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody>
    </table>
  `;
}

function borrowRebuyReportRows(portfolioId, accountId = "ALL") {
  const cycles = (state.borrowRebuyCycles || [])
    .filter((cycle) => {
      const sellTx = state.appTransactions.find((tx) => tx.id === cycle.sellTradeId);
      if (!sellTx) return false;
      if (sellTx.portfolioId !== portfolioId) return false;
      if (accountId !== "ALL" && sellTx.brokerAccountId !== accountId) return false;
      return true;
    });

  return {
    columns: [
      ["security", "股票"],
      ["sourceCost", "來源庫存成本"],
      ["sellPrice", "借券賣出價"],
      ["sellQty", "賣出股數"],
      ["rebuyQty", "已回補股數"],
      ["remainingQty", "待回補股數"],
      ["avgRebuyPrice", "平均回補價"],
      ["grossProfit", "借券操作毛利"],
      ["netProfit", "借券操作淨利"],
      ["status", "狀態"]
    ],
    rows: cycles.map((cycle) => {
      const sourceCostText = borrowSourceCostLabel(cycle.sourceInventoryLotId);
      
      const statusLabel = {
        open: "未回補",
        partial: "部分回補",
        closed: "已完成"
      }[cycle.status] || cycle.status;
      
      const statusClass = {
        open: "status-danger",
        partial: "status-warning",
        closed: "status-success"
      }[cycle.status] || "";

      return {
        security: escapeHtml(securityLabel(state.appTransactions.find(t => t.id === cycle.sellTradeId)?.securityId)),
        sourceCost: sourceCostText,
        sellPrice: fmtPrice(cycle.sellPrice),
        sellQty: fmtNum(cycle.sellQty),
        rebuyQty: fmtNum(cycle.totalRebuyQty),
        remainingQty: fmtNum(cycle.remainingRebuyQty),
        avgRebuyPrice: cycle.totalRebuyQty > 0 ? fmtPrice(cycle.avgRebuyPrice) : "-",
        grossProfit: fmtMoney(cycle.grossProfit),
        netProfit: fmtMoney(cycle.netProfit),
        status: `<span class="status-pill ${statusClass}">${statusLabel}</span>`
      };
    })
  };
}

function reportRows(type) {
  const portfolioId = selectedPortfolioId();
  const accountId = reportBrokerAccountId(portfolioId);
  if (type === "performance0050") return benchmarkPerformanceReportRows(portfolioId, accountId);
  if (type === "borrowRebuy") return borrowRebuyReportRows(portfolioId, accountId);
  if (type === "transactions") {
    return {
      columns: [
        ["date", "日期"], ["account", "券商帳戶"], ["security", "股票"], ["type", "類型"], ["price", "價格"], ["shares", "股數"], ["gross", "成交金額"], ["fee", "手續費"], ["tax", "交易稅"], ["net", "淨收付"], ["source", "來源"], ["linked", "linkedBuyId"], ["status", "對帳狀態"]
      ],
      rows: scopedTransactions(portfolioId).filter((tx) => reportAccountMatches(tx, accountId)).sort(sortByDateDesc).map((tx) => {
        const amounts = effectiveTransactionAmounts(tx);
        return {
          date: tx.tradeDate,
          account: escapeHtml(accountName(tx.brokerAccountId)),
          security: escapeHtml(securityLabel(tx.securityId)),
          type: escapeHtml(tx.transactionType),
          price: fmtPrice(tx.price),
          shares: fmtNum(tx.shares),
          gross: fmtMoney(amounts.grossAmount),
          fee: fmtMoney(amounts.fee),
          tax: fmtMoney(amounts.tax),
          net: fmtMoney(amounts.netAmount),
          source: amounts.isBrokerAligned ? "券商對齊" : escapeHtml(tx.sourceType),
          linked: escapeHtml(tx.linkedBuyTransactionId || "-"),
          status: statusPill(transactionReconStatus(tx.id))
        };
      })
    };
  }
  if (type === "dailyTransactions") return dailyTransactionReportRows(portfolioId, accountId);
  if (type === "dailyProfit") return profitSummaryReportRows("day", portfolioId, accountId);
  if (type === "monthlyProfit") return profitSummaryReportRows("month", portfolioId, accountId);
  if (type === "quarterlyProfit") return profitSummaryReportRows("quarter", portfolioId, accountId);
  if (type === "yearlyProfit") return profitSummaryReportRows("year", portfolioId, accountId);
  if (type === "matches") {
    return {
      columns: [
        ["sellDate", "賣出日"], ["account", "券商帳戶"], ["sellPrice", "賣出價"], ["shares", "配對股數"], ["buyDate", "原買進日"], ["buyPrice", "原買進價"], ["gross", "毛利"], ["fees", "費稅"], ["net", "淨利"]
      ],
      rows: state.sellMatches.filter((match) => match.portfolioId === portfolioId && reportAccountMatches(match, accountId)).map((match) => ({
        sellDate: match.sellDate,
        account: escapeHtml(accountName(match.brokerAccountId)),
        sellPrice: fmtPrice(match.sellPrice),
        shares: fmtNum(match.matchedShares),
        buyDate: match.buyDate,
        buyPrice: fmtPrice(match.buyPrice),
        gross: fmtMoney(match.grossProfit),
        fees: fmtMoney(match.allocatedBuyFee + match.allocatedSellFee + match.allocatedSellTax),
        net: fmtMoney(match.netProfit)
      }))
    };
  }
  if (type === "rebuy") {
    return {
      columns: [
        ["account", "券商帳戶"], ["security", "股票"], ["sellDate", "賣出日"], ["sellPrice", "賣出價"], ["target", "最低回補價"], ["shares", "原賣出股數"], ["remaining", "待回補股數"], ["status", "狀態"]
      ],
      rows: state.rebuyTasks.filter((task) => task.portfolioId === portfolioId && reportAccountMatches(task, accountId)).map((task) => ({
        account: escapeHtml(accountName(task.brokerAccountId)),
        security: escapeHtml(securityLabel(task.securityId)),
        sellDate: task.sellDate,
        sellPrice: fmtPrice(task.sellPrice),
        target: fmtPrice(task.targetRebuyPrice),
        shares: fmtNum(task.sellShares),
        remaining: fmtNum(task.remainingRebuyShares),
        status: statusPill(task.status)
      }))
    };
  }
  if (type === "inventory") {
    return {
      columns: [
        ["account", "券商帳戶"], ["security", "股票"], ["remaining", "剩餘股數"], ["price", "成本價"], ["quote", "現價"], ["market", "市值"], ["unrealized", "未實現"], ["buyDate", "買進日"], ["original", "原始股數"], ["status", "狀態"]
      ],
      rows: state.buyLots.filter((lot) => lot.portfolioId === portfolioId && reportAccountMatches(lot, accountId)).map((lot) => {
        const valuation = inventoryLotValuation(lot);
        return {
          account: escapeHtml(accountName(lot.brokerAccountId)),
          security: escapeHtml(securityLabel(lot.securityId)),
          remaining: fmtNum(lot.remainingShares),
          price: fmtPrice(lot.buyPrice),
          quote: valuation.quote ? fmtPrice(valuation.quote.price) : "-",
          market: valuation.quote ? fmtMoney(valuation.marketValue) : "-",
          unrealized: valuation.quote ? fmtMoney(valuation.unrealized) : "-",
          buyDate: lot.buyDate,
          original: fmtNum(lot.originalShares),
          status: statusPill(lot.status)
        };
      })
    };
  }  if (type === "reconciliation") {
    return {
      columns: [
        ["date", "日期"], ["account", "券商帳戶"], ["security", "股票"], ["side", "買賣"], ["shares", "股數"], ["diff", "淨額差異"], ["status", "狀態"]
      ],
      rows: state.reconciliationLinks.filter((link) => link.portfolioId === portfolioId && reportAccountMatches(link, accountId)).map((link) => ({
        date: link.tradeDate,
        account: escapeHtml(accountName(link.brokerAccountId)),
        security: escapeHtml(securityLabel(link.securityId)),
        side: escapeHtml(link.side),
        shares: fmtNum(link.allocatedShares),
        diff: fmtMoney(link.diffNetAmount),
        status: statusPill(link.matchStatus)
      }))
    };
  }
  return {
    columns: [
      ["broker", "券商"], ["account", "帳戶"], ["cash", "現金"], ["shares", "持股"], ["realized", "已實現損益"], ["rebuy", "待回補"], ["issues", "對帳異常"]
    ],
    rows: accountSummaries(portfolioId).filter((row) => accountId === "ALL" || row.accountId === accountId).map((row) => ({
      broker: escapeHtml(row.broker),
      account: escapeHtml(row.account),
      cash: fmtMoney(row.cash),
      shares: fmtNum(row.shares),
      realized: fmtMoney(row.realized),
      rebuy: fmtNum(row.rebuy),
      issues: fmtNum(row.issues)
    }))
  };
}

function benchmarkPerformanceReportRows(portfolioId, brokerAccountId = "ALL") {
  const transactions = scopedTransactions(portfolioId).filter((tx) => reportAccountMatches(tx, brokerAccountId)).slice().sort(sortByDateAsc);
  const matches = state.sellMatches.filter((match) => match.portfolioId === portfolioId && reportAccountMatches(match, brokerAccountId));
  const reportDate = latestReportDate(transactions, matches);
  const inventoryLots = state.buyLots.filter((lot) => lot.portfolioId === portfolioId && reportAccountMatches(lot, brokerAccountId) && toNumber(lot.remainingShares) > 0);
  const benchmark = build0050BenchmarkModel(portfolioId, brokerAccountId, transactions, inventoryLots, reportDate);
  return {
    columns: [
      ["date", "日期"], ["price", "0050價"], ["actual", "剩餘0050"], ["cash", "現金"], ["cashShares", "現金等值股"], ["equivalent", "操作等值股"], ["passive", "不操作基準"], ["excess", "超額股數"], ["value", "超額等值"]
    ],
    rows: (benchmark.dailyRows || benchmark.series || []).map((row) => ({
      date: escapeHtml(row.fullDate || row.date),
      price: row.price ? fmtPrice(row.price) : "-",
      actual: fmtNum(row.actualShares || 0, 2),
      cash: fmtMoney(row.cash || 0),
      cashShares: fmtNum(row.cashEquivalentShares || 0, 2),
      equivalent: fmtNum(row.equivalent || 0, 2),
      passive: fmtNum(row.passive || 0, 2),
      excess: fmtNum(row.excess || 0, 2),
      value: fmtMoney(row.excessValue || 0)
    }))
  };
}

function dailyTransactionReportRows(portfolioId, brokerAccountId = "ALL") {
  const tradeRows = scopedTransactions(portfolioId).filter((tx) => reportAccountMatches(tx, brokerAccountId)).map((tx) => {
    const amounts = effectiveTransactionAmounts(tx);
    const isCash = ["DEPOSIT", "WITHDRAW", "INTEREST", "DIVIDEND"].includes(tx.transactionType);
    return {
      date: tx.tradeDate,
      account: escapeHtml(accountName(tx.brokerAccountId)),
      security: isCash ? "現金" : escapeHtml(securityLabel(tx.securityId)),
      item: escapeHtml(tradeTypeLabel(tx.transactionType)),
      price: isCash ? "-" : fmtPrice(tx.price),
      shares: isCash ? "-" : fmtNum(tx.shares),
      gross: fmtMoney(amounts.grossAmount),
      fee: fmtMoney(amounts.fee),
      tax: fmtMoney(amounts.tax),
      net: fmtMoney(amounts.netAmount),
      source: amounts.isBrokerAligned ? "券商對齊" : escapeHtml(tx.sourceType),
      status: ["BUY", "SELL"].includes(tx.transactionType) ? statusPill(transactionReconStatus(tx.id)) : "-",
      note: escapeHtml(tx.note || "")
    };
  });
  const accountScoped = brokerAccountId && brokerAccountId !== "ALL";
  const cashTransferRows = state.accountTransfers
    .filter((transfer) => transfer.portfolioId === portfolioId && (!accountScoped || transfer.fromBrokerAccountId === brokerAccountId || transfer.toBrokerAccountId === brokerAccountId))
    .flatMap((transfer) => [
      {
        date: transfer.transferDate,
        account: escapeHtml(accountName(transfer.fromBrokerAccountId)),
        security: "現金",
        item: "現金轉出",
        price: "-",
        shares: "-",
        gross: fmtMoney(transfer.amount),
        fee: fmtMoney(transfer.fee),
        tax: "-",
        net: fmtMoney(-transfer.amount - transfer.fee),
        source: "TRANSFER",
        status: "-",
        note: escapeHtml(transfer.note || "")
      },
      {
        date: transfer.transferDate,
        account: escapeHtml(accountName(transfer.toBrokerAccountId)),
        security: "現金",
        item: "現金轉入",
        price: "-",
        shares: "-",
        gross: fmtMoney(transfer.amount),
        fee: "-",
        tax: "-",
        net: fmtMoney(transfer.amount),
        source: "TRANSFER",
        status: "-",
        note: escapeHtml(transfer.note || "")
      }
    ].filter((row) => !accountScoped || row.account === escapeHtml(accountName(brokerAccountId))));
  return {
    columns: [
      ["date", "日期"], ["account", "券商帳戶"], ["security", "股票/項目"], ["item", "買賣/項目"], ["price", "成交價"], ["shares", "股數"], ["gross", "成交/金額"], ["fee", "手續費"], ["tax", "交易稅"], ["net", "淨收付"], ["source", "來源"], ["status", "對帳"], ["note", "備註"]
    ],
    rows: [...tradeRows, ...cashTransferRows].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
  };
}

function profitSummaryReportRows(grain, portfolioId, brokerAccountId = "ALL") {
  const groups = new Map();
  const addProfitRow = (date, shares, gross, fees, net) => {
    const key = profitPeriodKey(date, grain);
    if (!groups.has(key)) {
      groups.set(key, { period: key, trades: 0, shares: 0, gross: 0, fees: 0, net: 0 });
    }
    const row = groups.get(key);
    row.trades += 1;
    row.shares += toNumber(shares);
    row.gross += toNumber(gross);
    row.fees += toNumber(fees);
    row.net += toNumber(net);
  };
  for (const event of realizedProfitEvents(portfolioId, brokerAccountId)) {
    addProfitRow(event.date, event.shares, event.grossProfit, event.costs, event.netProfit);
  }
  const tasksById = new Map(state.rebuyTasks.map((task) => [task.id, task]));
  for (const fill of state.rebuyFills.filter((item) => item.portfolioId === portfolioId)) {
    const task = tasksById.get(fill.rebuyTaskId);
    if (!task || !reportAccountMatches(task, brokerAccountId)) continue;
    const benefit = roundMoney((toNumber(task.sellPrice) - toNumber(fill.fillPrice)) * toNumber(fill.filledShares));
    addProfitRow(fill.fillDate, fill.filledShares, benefit, 0, benefit);
  }
  return {
    columns: [
      ["period", "期間"], ["trades", "配對筆數"], ["shares", "配對股數"], ["gross", "毛利"], ["fees", "費稅"], ["net", "淨利"]
    ],
    rows: Array.from(groups.values())
      .sort((a, b) => b.period.localeCompare(a.period))
      .map((row) => ({
        period: row.period,
        trades: fmtNum(row.trades),
        shares: fmtNum(row.shares),
        gross: fmtMoney(row.gross),
        fees: fmtMoney(row.fees),
        net: fmtMoney(row.net)
      }))
  };
}

function profitPeriodKey(dateText, grain) {
  const date = String(dateText || "");
  const year = date.slice(0, 4) || "未知";
  if (grain === "day") return date || "未知";
  if (grain === "year") return year;
  const month = toNumber(date.slice(5, 7));
  if (grain === "quarter") {
    const quarter = month ? Math.ceil(month / 3) : 0;
    return `${year}-Q${quarter || "?"}`;
  }
  return date.slice(0, 7) || "未知";
}
function renderSelectedReport(type) {
  const rows = reportRows(type);
  return renderTable(rows.columns, rows.rows, "尚無報表資料");
}

function renderImportBatches(sourceTypeFilter = "ALL", emptyText = "尚無匯入批次", brokerAccountId = accountScopeForRoute()) {
  const batches = state.importBatches
    .filter((batch) => batch.portfolioId === selectedPortfolioId())
    .filter((batch) => !brokerAccountId || brokerAccountId === "ALL" || batch.brokerAccountId === brokerAccountId)
    .filter((batch) => sourceTypeFilter === "ALL" || batch.sourceType === sourceTypeFilter)
    .sort((a, b) => b.importedAt.localeCompare(a.importedAt));
  return renderTable(
    [
      ["time", "時間"],
      ["source", "來源"],
      ["file", "檔名"],
      ["account", "券商帳戶"],
      ["range", "交易日"],
      ["rows", "原始"],
      ["created", "新增"],
      ["duplicate", "重複"],
      ["status", "狀態"],
      ["actions", "操作"]
    ],
    batches.map((batch) => ({
      time: formatDateTime(batch.importedAt),
      source: escapeHtml(batch.sourceType),
      file: escapeHtml(batch.sourceFilename),
      account: escapeHtml(accountName(batch.brokerAccountId)),
      range: escapeHtml(importBatchDateRange(batch)),
      rows: fmtNum(batch.rowCount),
      created: fmtNum(batch.createdCount ?? batch.rowCount),
      duplicate: fmtNum(batch.duplicateCount || 0),
      status: statusPill(batch.status),
      actions: `<button class="btn danger" data-action="delete-import-batch" data-id="${escapeAttr(batch.id)}">刪除</button>`,
      _mobile: renderImportBatchMobileRow(batch)
    })),
    emptyText
  );
}
function renderImportBatchMobileRow(batch) {
  return `
    <div class="mobile-list-item import-batch-mobile">
      <div class="mobile-list-row primary"><span>檔名</span><div>${escapeHtml(batch.sourceFilename)}</div></div>
      <div class="mobile-list-row"><span>時間</span><div>${formatDateTime(batch.importedAt)}</div></div>
      <div class="mobile-list-row"><span>券商帳戶</span><div>${escapeHtml(accountName(batch.brokerAccountId))}</div></div>
      <div class="mobile-list-row"><span>交易日</span><div>${escapeHtml(importBatchDateRange(batch))}</div></div>
      <div class="mobile-list-row"><span>新增 / 重複</span><div>${fmtNum(batch.createdCount ?? batch.rowCount)} / ${fmtNum(batch.duplicateCount || 0)}</div></div>
      <div class="mobile-list-row"><span>筆數 / 狀態</span><div>${fmtNum(batch.rowCount)} 筆 ${statusPill(batch.status)}</div></div>
      <div class="mobile-list-row"><span>操作</span><div><button class="btn danger" data-action="delete-import-batch" data-id="${escapeAttr(batch.id)}">刪除這份</button></div></div>
    </div>
  `;
}
function renderTransactionsTable(rows) {
  const filtered = filterTransactions(rows);
  const visibleRows = limitRows(filtered, state.ui.transactionLimit);
  const summary = `
    <div class="list-summary">
      <strong>${fmtNum(visibleRows.length)} / ${fmtNum(filtered.length)}</strong>
      <span>篩選結果，總資料 ${fmtNum(rows.length)} 筆</span>
    </div>
  `;
  return summary + renderTable(
    [
      ["date", "日期"],
      ["type", "買/賣"],
      ["shares", "股數"],
      ["price", "成交價"],
      ["security", "股票"],
      ["account", "券商帳戶"],
      ["gross", "成交金額"],
      ["fee", "手續費"],
      ["tax", "交易稅"],
      ["net", "淨收付"],
      ["source", "來源"],
      ["status", "對帳"],
      ["action", "操作"]
    ],
    visibleRows.map((tx) => {
      const amounts = effectiveTransactionAmounts(tx);
      return {
        date: tx.tradeDate,
        account: escapeHtml(accountName(tx.brokerAccountId)),
        security: escapeHtml(securityLabel(tx.securityId)),
        type: statusPill(tradeTypeLabel(tx.transactionType, tx.borrowRebuyType)),
        price: fmtPrice(tx.price),
        shares: fmtNum(tx.shares),
        gross: fmtMoney(amounts.grossAmount),
        fee: fmtMoney(amounts.fee),
        tax: fmtMoney(amounts.tax),
        net: fmtMoney(amounts.netAmount),
        source: escapeHtml(transactionSourceLabel(tx)),
        status: statusPill(transactionReconStatus(tx.id)),
        action: `<button class="btn" data-action="edit-transaction" data-id="${tx.id}">編輯</button><button class="btn danger" data-action="delete-transaction" data-id="${tx.id}">刪除</button>`,
        _mobile: renderTransactionMobileRow(tx, amounts)
      };
    }),
    "沒有符合篩選條件的交易"
  );
}

function filterTransactions(rows) {
  const symbolFilter = state.ui.transactionFilterSymbol || "ALL";
  const accountFilter = selectedBrokerAccountId();
  const typeFilter = state.ui.transactionFilterType || "ALL";
  const statusFilter = state.ui.transactionFilterStatus || "ALL";
  const from = state.ui.transactionFilterFrom || "";
  const to = state.ui.transactionFilterTo || "";
  const search = String(state.ui.transactionSearch || "").trim().toLowerCase();
  return rows.filter((tx) => {
    if (symbolFilter !== "ALL" && tx.securityId !== symbolFilter) return false;
    if (accountFilter !== "ALL" && tx.brokerAccountId !== accountFilter) return false;
    if (typeFilter !== "ALL" && tx.transactionType !== typeFilter) return false;
    if (from && tx.tradeDate < from) return false;
    if (to && tx.tradeDate > to) return false;
    const status = transactionReconStatus(tx.id);
    if (statusFilter === "ISSUES" && ["MATCHED", "AUTO_GROUP_MATCHED", "BROKER_ACCEPTED"].includes(status)) return false;
    if (statusFilter === "UNMATCHED" && status !== "未對帳") return false;
    if (!["ALL", "ISSUES", "UNMATCHED"].includes(statusFilter) && status !== statusFilter) return false;
    if (search) {
      const haystack = [
        tx.tradeDate,
        tx.transactionType,
        tx.price,
        tx.shares,
        securityLabel(tx.securityId),
        accountName(tx.brokerAccountId),
        tx.note,
        tx.linkedBuyTransactionId,
        tx.sourceTransactionId,
        transactionSourceLabel(tx)
      ].join(" ").toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

function filterReconciliationLinks(links) {
  const filter = state.ui.reconciliationFilterStatus || "ISSUES";
  return links
    .filter((link) => {
      if (filter === "ALL") return true;
      if (filter === "ISSUES") return !reconciliationIsSettled(link);
      return link.matchStatus === filter;
    })
    .sort((a, b) => String(b.tradeDate || "").localeCompare(String(a.tradeDate || "")));
}

function limitRows(rows, limitValue) {
  if (limitValue === "ALL") return rows;
  const limit = Math.max(1, toNumber(limitValue || 30));
  return rows.slice(0, limit);
}

function handleApplyTransactionFilters() {
  syncTransactionFiltersFromDom();
  render();
}

function handleClearTransactionFilters() {
  state.ui.transactionFilterSymbol = "ALL";
  state.ui.transactionFilterAccount = "ALL";
  state.ui.transactionFilterType = "ALL";
  state.ui.transactionFilterStatus = "ALL";
  state.ui.transactionFilterFrom = "";
  state.ui.transactionFilterTo = "";
  state.ui.transactionSearch = "";
  state.ui.transactionLimit = "30";
  persist();
  render();
}

function syncTransactionFiltersFromDom() {
  const ids = {
    transactionFilterSymbol: "transaction-symbol-filter",
    transactionFilterAccount: "transaction-account-filter",
    transactionFilterType: "transaction-type-filter",
    transactionFilterStatus: "transaction-status-filter",
    transactionFilterFrom: "transaction-from-filter",
    transactionFilterTo: "transaction-to-filter",
    transactionSearch: "transaction-search-filter",
    transactionLimit: "transaction-limit-filter"
  };
  for (const [key, id] of Object.entries(ids)) {
    const input = document.getElementById(id);
    if (input) state.ui[key] = input.value;
  }
  persist();
}
function transactionSourceLabel(tx) {
  const batch = tx.importBatchId ? state.importBatches.find((item) => item.id === tx.importBatchId) : null;
  if (batch) return `${tradeSourceLabel(tx.sourceType)} / ${batch.sourceFilename} / ${formatDateTime(batch.importedAt)}`;
  return tradeSourceLabel(tx.sourceType);
}
function renderTransactionMobileRow(tx, amounts) {
  const status = transactionReconStatus(tx.id);
  const action = `<button class="btn" data-action="edit-transaction" data-id="${tx.id}">編輯</button><button class="btn danger" data-action="delete-transaction" data-id="${tx.id}">刪除</button>`;
  return `
    <details class="mobile-transaction-row">
      <summary>
        <span class="mt-date"><strong>${escapeHtml(compactDate(tx.tradeDate))}</strong><small>${escapeHtml(securityLabel(tx.securityId).split(" ")[0] || "-")}</small></span>
        <span class="mt-side ${escapeAttr(tx.transactionType.toLowerCase())}">${escapeHtml(tradeTypeLabel(tx.transactionType, tx.borrowRebuyType))}</span>
        <span class="mt-num"><small>股數</small><strong>${fmtNum(tx.shares)}</strong></span>
        <span class="mt-num"><small>成交價</small><strong>${fmtPrice(tx.price)}</strong></span>
      </summary>
      <div class="mobile-transaction-detail">
        <div><span>券商帳戶</span><strong>${escapeHtml(accountName(tx.brokerAccountId))}</strong></div>
        <div><span>成交金額</span><strong>${fmtMoney(amounts.grossAmount)}</strong></div>
        <div><span>手續費</span><strong>${fmtMoney(amounts.fee)}</strong></div>
        <div><span>交易稅</span><strong>${fmtMoney(amounts.tax)}</strong></div>
        <div><span>淨收付</span><strong>${fmtMoney(amounts.netAmount)}</strong></div>
        <div><span>來源</span><strong>${escapeHtml(transactionSourceLabel(tx))}</strong></div>
        <div><span>對帳</span><strong>${statusPill(status)}</strong></div>
        <div class="detail-action"><span>操作</span>${action}</div>
      </div>
    </details>
  `;
}

function tradeTypeLabel(type, borrowRebuyType = "") {
  if (type === "SELL" && borrowRebuyType === "BORROW_SELL") return "借券賣出";
  if (type === "BUY" && borrowRebuyType === "REBUY_FILL") return "借券回補";
  const labels = { BUY: "買進", SELL: "賣出", DEPOSIT: "入金", INTEREST: "存款利息", DIVIDEND: "股息", WITHDRAW: "出金" };
  return labels[type] || type || "-";
}

function compactDate(dateText) {
  const text = String(dateText || "");
  const match = text.match(/^\d{4}-(\d{2})-(\d{2})$/);
  return match ? `${match[1]}/${match[2]}` : text || "-";
}

function renderMatchControl(sell) {
  const currentMatches = state.sellMatches.filter((match) => match.sellTransactionId === sell.id);
  const matchedByLot = new Map();
  for (const match of currentMatches) matchedByLot.set(match.buyLotId, (matchedByLot.get(match.buyLotId) || 0) + toNumber(match.matchedShares));
  const lots = state.buyLots
    .filter(
      (lot) =>
        lot.portfolioId === sell.portfolioId &&
        lot.brokerAccountId === sell.brokerAccountId &&
        lot.securityId === sell.securityId &&
        lot.buyDate <= sell.tradeDate &&
        toNumber(lot.remainingShares) + toNumber(matchedByLot.get(lot.id)) > 0
    )
    .sort(sortByBuyDateDesc)
    .map((lot) => lotMatchOption({
      ...lot,
      remainingShares: toNumber(lot.remainingShares) + toNumber(matchedByLot.get(lot.id))
    }));
  return `
    <div class="match-control match-control-picker">
      ${renderMatchLotPicker(lots, sell.linkedBuyTransactionId || "", `<input type="hidden" data-match-buy="${escapeAttr(sell.id)}" value="${escapeAttr(sell.linkedBuyTransactionId || "")}" />`, "沒有可配對的買進 lot")}
      <label class="match-share-input"><span>配對股數</span><input data-match-shares="${sell.id}" type="number" inputmode="numeric" step="1" max="${escapeAttr(sell.shares)}" value="${escapeAttr(sell.manualMatchedShares || sell.shares)}" aria-label="配對股數" /></label>
      <div class="btn-row match-edit-actions">
        <button class="btn" data-action="cancel-edit-match" data-sell-id="${escapeAttr(sell.id)}">取消</button>
        <button class="btn primary" data-action="save-match" data-sell-id="${escapeAttr(sell.id)}">儲存配對</button>
      </div>
    </div>
  `;
}
function renderAuditLogs() {
  const rows = state.auditLogs
    .filter((log) => !log.portfolioId || log.portfolioId === selectedPortfolioId())
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 100)
    .map((log) => ({
      time: formatDateTime(log.createdAt),
      action: escapeHtml(log.action),
      entity: escapeHtml(log.entityType),
      id: escapeHtml(log.entityId),
      before: `<div class="audit-json">${escapeHtml(JSON.stringify(log.beforeJson ?? "", null, 2)).slice(0, 520)}</div>`,
      after: `<div class="audit-json">${escapeHtml(JSON.stringify(log.afterJson ?? "", null, 2)).slice(0, 520)}</div>`
    }));
  return renderTable(
    [
      ["time", "時間"],
      ["action", "動作"],
      ["entity", "Entity"],
      ["id", "ID"],
      ["before", "Before"],
      ["after", "After"]
    ],
    rows,
    "尚無 audit log"
  );
}

function renderActions(entity, id, label) {
  return `<div class="btn-row"><button class="btn" data-action="edit-${entity}" data-id="${escapeAttr(id)}">編輯</button><button class="btn danger" data-action="delete-${entity}" data-id="${escapeAttr(id)}" data-label="${escapeAttr(label)}">刪除</button></div>`;
}

function promptText(label, currentValue = "") {
  const value = window.prompt(label, String(currentValue ?? ""));
  if (value === null) return null;
  return value.trim();
}

function cashDeleteToken(type) {
  return { DEPOSIT: "刪除入金", WITHDRAW: "刪除出金", INTEREST: "刪除存款利息", DIVIDEND: "刪除股息" }[type] || "刪除現金";
}

function confirmCashTransactionDelete(tx, impactText) {
  const finalToken = cashDeleteToken(tx.transactionType);
  const amount = fmtMoney(Math.abs(toNumber(tx.netAmount || tx.price)));
  const label = `${tx.tradeDate} ${tradeTypeLabel(tx.transactionType)} ${amount}`;
  if (!window.confirm(`第一次確認：確定要刪除這筆「${label}」？
${impactText}
此動作無法復原。`)) return false;
  const second = String(window.prompt("第二次確認：請輸入「刪除」以繼續。") || "").trim();
  if (second !== "刪除") {
    showToast("刪除已取消");
    return false;
  }
  const third = String(window.prompt(`第三次確認：請輸入「${finalToken}」。`) || "").trim();
  if (third !== finalToken) {
    showToast(`刪除已取消，請輸入「${finalToken}」`);
    return false;
  }
  return true;
}

function confirmImportBatchDelete(batch, impactText) {
  const filename = String(batch.sourceFilename || "匯入檔").trim();
  const importedAt = formatDateTime(batch.importedAt);
  const finalToken = batch.sourceType === "BROKER_CSV" ? "刪除報表" : "刪除匯入";
  if (!window.confirm(`第一次確認：確定要刪除這份匯入檔？\n檔名：${filename}\n時間：${importedAt}\n${impactText}\n此動作無法復原。`)) return false;
  const second = String(window.prompt(`第二次確認：請輸入「刪除」以繼續。`) || "").trim();
  if (second !== "刪除") {
    showToast("刪除已取消");
    return false;
  }
  const third = String(window.prompt(`第三次確認：請輸入「${finalToken}」。`) || "").trim();
  if (third !== finalToken) {
    showToast(`刪除已取消，請輸入「${finalToken}」`);
    return false;
  }
  return true;
}

function confirmDangerousDelete(label, impactText) {
  const safeLabel = String(label || "此項目").trim();
  if (!window.confirm(`第一次確認：確定要刪除「${safeLabel}」？\n${impactText}\n此動作無法復原。`)) return false;
  const second = window.prompt(`第二次確認：請輸入「刪除」以繼續刪除「${safeLabel}」。`);
  if (second !== "刪除") {
    showToast("刪除已取消");
    return false;
  }
  const third = window.prompt(`第三次確認：請完整輸入項目名稱「${safeLabel}」。`);
  if (third !== safeLabel) {
    showToast("刪除已取消，項目名稱不一致");
    return false;
  }
  return true;
}
function renderTable(columns, rows, emptyText) {
  if (!rows.length) return `<div class="empty">${escapeHtml(emptyText)}</div>`;
  const tableRows = rows
    .map(
      (row) =>
        `<tr>${columns
          .map(([key]) => `<td>${tableValue(row[key])}</td>`)
          .join("")}</tr>`
    )
    .join("");
  const mobileColumns = columns.slice(0, 4);
  const mobileHeader = `<div class="mobile-transaction-header">${mobileColumns.map(([, label]) => `<span>${escapeHtml(label)}</span>`).join("")}</div>`;
  const mobileRows = rows
    .map((row) => row._mobile || renderDefaultMobileListItem(columns, row))
    .join("");
  return `
    <div class="table-wrap">
      <table>
        <thead><tr>${columns.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join("")}</tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
    ${mobileHeader}
    <div class="mobile-list">${mobileRows}</div>
  `;
}

function renderDefaultMobileListItem(columns, row) {
  const summaryColumns = columns.slice(0, 4);
  const detailColumns = columns.slice(4);
  return `
    <details class="mobile-transaction-row mobile-table-row">
      <summary>
        ${summaryColumns.map(([key]) => `<span class="mt-cell">${tableValue(row[key])}</span>`).join("")}
      </summary>
      <div class="mobile-transaction-detail">
        ${detailColumns.map(([key, label]) => `
          <div><span>${escapeHtml(label)}</span><strong>${tableValue(row[key])}</strong></div>
        `).join("")}
      </div>
    </details>
  `;
}

function tableValue(value) {
  return value === undefined || value === null || value === "" ? "-" : value;
}

function metricCard(label, value, tone = "") {
  return `<div class="metric ${tone}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}

function statusPill(status) {
  const text = String(status || "-");
  const labels = { BROKER_ACCEPTED: "已採用券商", DUPLICATE: "全重複", PARTIAL_DUPLICATE: "部分重複" };
  let tone = "info";
  if (["MATCHED", "AUTO_GROUP_MATCHED", "ACTIVE", "PARSED", "OPEN", "BROKER_UPLOAD_READY", "BROKER_ACCEPTED"].includes(text)) tone = "ok";
  if (["NEEDS_REVIEW", "PARTIAL_MATCHED", "PARTIAL_FILLED", "AMOUNT_DIFF", "FEE_TAX_DIFF", "PENDING", "BROKER_UPLOAD_PARTIAL", "DUPLICATE", "PARTIAL_DUPLICATE"].includes(text)) tone = "warn";
  if (["MISSING_IN_APP", "MISSING_IN_BROKER", "MISSING_BROKER_UPLOAD", "CONFLICT", "FAILED", "INACTIVE"].includes(text)) tone = "bad";
  if (["BUY", "SELL", "DEPOSIT", "INTEREST", "DIVIDEND", "WITHDRAW", "CLOSED", "MANUAL_CLOSED"].includes(text)) tone = "info";
  return `<span class="status ${tone}">${escapeHtml(labels[text] || text)}</span>`;
}

function scopedBrokerAccounts(portfolioId = selectedPortfolioId()) {
  return state.brokerAccounts.filter((account) => account.portfolioId === portfolioId && account.isActive);
}

function scopedTransactions(portfolioId = selectedPortfolioId()) {
  const user = currentUser();
  if (!user) return [];
  return state.appTransactions.filter((tx) => tx.userId === user.id && tx.portfolioId === portfolioId);
}

function cashBalance(portfolioId, brokerAccountId = "ALL") {
  return sum(
    state.cashLedger.filter((row) => row.portfolioId === portfolioId && (brokerAccountId === "ALL" || row.brokerAccountId === brokerAccountId)),
    "amount"
  );
}

function portfolioMetrics(portfolioId, brokerAccountId = "ALL") {
  const accountScoped = brokerAccountId && brokerAccountId !== "ALL";
  const inAccount = (item) => !accountScoped || item.brokerAccountId === brokerAccountId;
  return {
    cash: cashBalance(portfolioId, brokerAccountId || "ALL"),
    remainingShares: sum(borrowAdjustedInventoryLots(state.buyLots).filter((lot) => lot.portfolioId === portfolioId && inAccount(lot)), "remainingShares"),
    realizedNetProfit: sum(realizedProfitEvents(portfolioId, accountScoped ? brokerAccountId : "ALL"), "netProfit"),
    openRebuyShares: sum(state.rebuyTasks.filter((task) => task.portfolioId === portfolioId && inAccount(task) && ["OPEN", "PARTIAL_FILLED"].includes(task.status)), "remainingRebuyShares")
  };
}
function brokerUploadChecklist(portfolioId, brokerAccountId = "ALL") {
  const appGroups = new Map();
  const brokerGroups = new Map();
  const accountScoped = brokerAccountId && brokerAccountId !== "ALL";
  for (const tx of scopedTransactions(portfolioId).filter((item) => ["BUY", "SELL"].includes(item.transactionType) && (!accountScoped || item.brokerAccountId === brokerAccountId))) {
    const key = uploadChecklistKey(tx);
    if (!appGroups.has(key)) appGroups.set(key, []);
    appGroups.get(key).push(tx);
  }
  for (const execution of state.brokerExecutions.filter((item) => item.portfolioId === portfolioId && (!accountScoped || item.brokerAccountId === brokerAccountId))) {
    const key = uploadChecklistKey({
      tradeDate: execution.tradeDate,
      brokerAccountId: execution.brokerAccountId,
      securityId: execution.securityId,
      transactionType: execution.side
    });
    if (!brokerGroups.has(key)) brokerGroups.set(key, []);
    brokerGroups.get(key).push(execution);
  }
  return Array.from(appGroups.entries())
    .map(([key, appItems]) => {
      const brokerItems = brokerGroups.get(key) || [];
      const sample = appItems[0];
      const appShares = sum(appItems, "shares");
      const brokerShares = sum(brokerItems, "shares");
      const appFee = sum(appItems, "fee");
      const brokerFee = sum(brokerItems, "fee");
      const appTax = sum(appItems, "tax");
      const brokerTax = sum(brokerItems, "tax");
      const appNet = sum(appItems, "netAmount");
      const brokerNet = sum(brokerItems, "netAmount");
      const relatedLinks = state.reconciliationLinks.filter((link) => uploadChecklistKey({
        tradeDate: link.tradeDate,
        brokerAccountId: link.brokerAccountId,
        securityId: link.securityId,
        transactionType: link.side
      }) === key);
      const acceptedBrokerDiff = relatedLinks.length > 0 && relatedLinks.every(reconciliationIsSettled);
      let status = "BROKER_UPLOAD_READY";
      if (!brokerItems.length) status = "MISSING_BROKER_UPLOAD";
      else if (
        !nearlyEqual(appShares, brokerShares) ||
        Math.abs(appNet - brokerNet) > getPortfolioSettings(portfolioId).amountTolerance ||
        Math.abs(brokerFee - appFee) > 0 ||
        Math.abs(brokerTax - appTax) > 0
      ) {
        status = acceptedBrokerDiff ? "BROKER_ACCEPTED" : "BROKER_UPLOAD_PARTIAL";
      }
      return {
        key,
        tradeDate: sample.tradeDate,
        brokerAccountId: sample.brokerAccountId,
        securityId: sample.securityId,
        side: sample.transactionType,
        appCount: appItems.length,
        brokerCount: brokerItems.length,
        appShares,
        brokerShares,
        feeDiff: roundMoney(brokerFee - appFee),
        taxDiff: roundMoney(brokerTax - appTax),
        netDiff: roundMoney(brokerNet - appNet),
        status
      };
    })
    .sort((a, b) => b.tradeDate.localeCompare(a.tradeDate));
}
function uploadChecklistKey(item) {
  return [item.tradeDate, item.brokerAccountId, item.securityId, item.transactionType || item.side].join("|");
}

function renderBrokerUploadChecklist(rows) {
  return renderTable(
    [["date", "交易日"], ["side", "買/賣"], ["app", "App 股數"], ["broker", "券商股數"], ["security", "股票"], ["account", "券商帳戶"], ["fee", "手續費差"], ["tax", "交易稅差"], ["net", "淨額差"], ["status", "狀態"]],
    rows.map((row) => ({
      date: row.tradeDate,
      side: tradeTypeLabel(row.side),
      app: `${fmtNum(row.appShares)} (${fmtNum(row.appCount)}筆)`,
      broker: `${fmtNum(row.brokerShares)} (${fmtNum(row.brokerCount)}筆)`,
      security: escapeHtml(securityLabel(row.securityId)),
      account: escapeHtml(accountName(row.brokerAccountId)),
      fee: fmtMoney(row.feeDiff),
      tax: fmtMoney(row.taxDiff),
      net: fmtMoney(row.netDiff),
      status: statusPill(row.status)
    })),
    "目前沒有需要上傳券商紀錄的交易日"
  );
}

function accountSummaries(portfolioId) {
  const adjustedLots = borrowAdjustedInventoryLots(state.buyLots);
  return state.brokerAccounts
    .filter((account) => account.portfolioId === portfolioId)
    .map((account) => {
      const lots = adjustedLots.filter((lot) => lot.brokerAccountId === account.id);
      const remainingShares = sum(lots, "remainingShares");
      const remainingCost = lots.reduce((total, lot) => total + lot.remainingShares * lot.buyPrice, 0);
      const imports = state.importBatches.filter((batch) => batch.brokerAccountId === account.id);
      return {
        accountId: account.id,
        broker: brokerName(account.brokerId),
        account: account.accountName,
        cash: sum(state.cashLedger.filter((row) => row.brokerAccountId === account.id), "amount"),
        shares: remainingShares,
        avgCost: remainingShares ? remainingCost / remainingShares : 0,
        realized: sum(realizedProfitEvents(portfolioId, account.id), "netProfit"),
        rebuy: sum(state.rebuyTasks.filter((task) => task.brokerAccountId === account.id && ["OPEN", "PARTIAL_FILLED"].includes(task.status)), "remainingRebuyShares"),
        issues: state.reconciliationLinks.filter((link) => link.brokerAccountId === account.id && !["MATCHED", "AUTO_GROUP_MATCHED"].includes(link.matchStatus)).length,
        lastImport: imports.length ? formatDateTime(imports.sort((a, b) => b.importedAt.localeCompare(a.importedAt))[0].importedAt) : "-"
      };
    });
}

function memberRole(portfolioId) {
  const user = currentUser();
  return state.portfolioMembers.find((member) => member.portfolioId === portfolioId && member.userId === user?.id)?.role || "OWNER";
}

function effectiveTransactionAmounts(tx) {
  const fallback = {
    grossAmount: tx.grossAmount,
    fee: tx.fee,
    tax: tx.tax,
    netAmount: tx.netAmount,
    isBrokerAligned: false
  };
  const link = reconciliationLinkForTransaction(tx.id);
  if (!link) return fallback;
  return {
    grossAmount: toNumber(link.allocatedGrossAmount),
    fee: toNumber(link.allocatedFee),
    tax: toNumber(link.allocatedTax),
    netAmount: toNumber(link.allocatedNetAmount),
    isBrokerAligned: true
  };
}

function reconciliationLinkForTransaction(transactionId) {
  return state.reconciliationLinks.find((link) => {
    if (!reconciliationLinkIsUsable(link)) return false;
    return String(link.appTransactionId || "").split(",").includes(transactionId);
  });
}

function reconciliationLinkIsUsable(link) {
  if (!["MATCHED", "AUTO_GROUP_MATCHED", "FEE_TAX_DIFF", "AMOUNT_DIFF"].includes(link.matchStatus) || !link.brokerExecutionId) return false;
  if (["FEE_TAX_DIFF", "AMOUNT_DIFF"].includes(link.matchStatus)) return Boolean(link.brokerAcceptedAt);
  return true;
}

function transactionReconStatus(transactionId) {
  const links = state.reconciliationLinks.filter((link) => String(link.appTransactionId || "").split(",").includes(transactionId));
  if (!links.length) return "MISSING_IN_BROKER";
  if (links.some((link) => link.brokerAcceptedAt)) return "BROKER_ACCEPTED";
  if (links.some((link) => !["MATCHED", "AUTO_GROUP_MATCHED"].includes(link.matchStatus))) return links[0].matchStatus;
  return links[0].matchStatus;
}

function cashAccountIdFor(portfolioId, brokerAccountId) {
  let account = state.cashAccounts.find((item) => item.portfolioId === portfolioId && item.brokerAccountId === brokerAccountId);
  if (!account) {
    account = {
      id: makeId("cash-account"),
      portfolioId,
      brokerAccountId,
      currency: "TWD",
      accountType: "BROKER_SETTLEMENT",
      name: "交割戶",
      isActive: true,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    state.cashAccounts.push(account);
  }
  return account.id;
}

function auditLog(action, entityType, entityId, beforeJson, afterJson, portfolioId = selectedPortfolioId()) {
  state.auditLogs.push({
    id: makeId("audit"),
    userId: currentUser()?.id || "",
    portfolioId,
    entityType,
    entityId,
    action,
    beforeJson: clone(beforeJson),
    afterJson: clone(afterJson),
    createdAt: nowIso()
  });
}

function marketQuoteAuditSnapshot(quotes) {
  return (quotes || []).map((quote) => ({
    id: quote.id,
    symbol: quote.symbol,
    price: quote.price,
    quoteTime: quote.quoteTime,
    source: quote.source,
    sourceDate: quote.sourceDate,
    updatedAt: quote.updatedAt
  }));
}

function drawDashboardCharts() {
  const portfolioId = selectedPortfolioId();
  const brokerAccountId = selectedBrokerAccountId(portfolioId);
  drawLineChart(document.querySelector("#cash-chart"), dailyCashSeries(portfolioId, brokerAccountId), ["現金", "已實現淨利"]);
  drawBarChart(document.querySelector("#inventory-chart"), dailyInventorySeries(portfolioId, brokerAccountId));
}

function dailyCashSeries(portfolioId, brokerAccountId = "ALL") {
  const days = new Map();
  const accountScoped = brokerAccountId && brokerAccountId !== "ALL";
  for (const row of state.cashLedger.filter((item) => item.portfolioId === portfolioId && (!accountScoped || item.brokerAccountId === brokerAccountId))) {
    if (!days.has(row.tradeDate)) days.set(row.tradeDate, { date: row.tradeDate, cash: 0, realized: 0 });
    days.get(row.tradeDate).cash += row.amount;
  }
  for (const event of realizedProfitEvents(portfolioId, accountScoped ? brokerAccountId : "ALL")) {
    if (!days.has(event.date)) days.set(event.date, { date: event.date, cash: 0, realized: 0 });
    days.get(event.date).realized += event.netProfit;
  }
  let cash = 0;
  let realized = 0;
  return Array.from(days.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => {
      cash += day.cash;
      realized += day.realized;
      return { date: day.date.slice(5), cash, realized };
    });
}

function dailyInventorySeries(portfolioId, brokerAccountId = "ALL") {
  const days = new Map();
  const accountScoped = brokerAccountId && brokerAccountId !== "ALL";
  for (const tx of scopedTransactions(portfolioId).filter((item) => !accountScoped || item.brokerAccountId === brokerAccountId)) {
    if (!days.has(tx.tradeDate)) days.set(tx.tradeDate, { date: tx.tradeDate, shares: 0, rebuy: 0 });
    if (tx.transactionType === "BUY") days.get(tx.tradeDate).shares += tx.shares;
    if (tx.transactionType === "SELL") days.get(tx.tradeDate).shares -= tx.shares;
  }
  for (const task of state.rebuyTasks.filter((item) => item.portfolioId === portfolioId && (!accountScoped || item.brokerAccountId === brokerAccountId))) {
    if (!days.has(task.sellDate)) days.set(task.sellDate, { date: task.sellDate, shares: 0, rebuy: 0 });
    days.get(task.sellDate).rebuy += task.remainingRebuyShares;
  }
  let shares = 0;
  return Array.from(days.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => {
      shares += day.shares;
      return { date: day.date.slice(5), shares, rebuy: day.rebuy };
    });
}

function drawLineChart(canvas, data) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  if (!data.length) return drawEmptyChart(ctx, width, height);
  const pad = 40;
  const values = data.flatMap((item) => [item.cash, item.realized]);
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  drawAxis(ctx, width, height, pad);
  drawSeries(ctx, data, "cash", "#0f766e", min, max, pad, width, height);
  drawSeries(ctx, data, "realized", "#2563eb", min, max, pad, width, height);
  drawLegend(ctx, ["現金", "已實現淨利"], ["#0f766e", "#2563eb"], width);
}

function drawBarChart(canvas, data) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  if (!data.length) return drawEmptyChart(ctx, width, height);
  const pad = 40;
  const max = Math.max(1, ...data.flatMap((item) => [item.shares, item.rebuy]));
  drawAxis(ctx, width, height, pad);
  const slot = (width - pad * 2) / data.length;
  data.forEach((item, index) => {
    const x = pad + index * slot + slot * 0.18;
    const barWidth = Math.max(5, slot * 0.24);
    const shareHeight = ((height - pad * 2) * item.shares) / max;
    const rebuyHeight = ((height - pad * 2) * item.rebuy) / max;
    ctx.fillStyle = "#0f766e";
    ctx.fillRect(x, height - pad - shareHeight, barWidth, shareHeight);
    ctx.fillStyle = "#c2410c";
    ctx.fillRect(x + barWidth + 4, height - pad - rebuyHeight, barWidth, rebuyHeight);
  });
  drawLegend(ctx, ["持股", "待回補"], ["#0f766e", "#c2410c"], width);
}

function drawAxis(ctx, width, height, pad) {
  ctx.strokeStyle = "#d9e0e8";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, pad);
  ctx.lineTo(pad, height - pad);
  ctx.lineTo(width - pad, height - pad);
  ctx.stroke();
}

function drawSeries(ctx, data, key, color, min, max, pad, width, height) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  data.forEach((item, index) => {
    const x = pad + (index * (width - pad * 2)) / Math.max(data.length - 1, 1);
    const y = height - pad - ((item[key] - min) * (height - pad * 2)) / Math.max(max - min, 1);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function drawLegend(ctx, labels, colors, width) {
  ctx.font = "14px sans-serif";
  let x = width - 230;
  labels.forEach((label, index) => {
    ctx.fillStyle = colors[index];
    ctx.fillRect(x, 18, 14, 14);
    ctx.fillStyle = "#17202a";
    ctx.fillText(label, x + 20, 30);
    x += 98;
  });
}

function drawEmptyChart(ctx, width, height) {
  ctx.fillStyle = "#617083";
  ctx.font = "16px sans-serif";
  ctx.fillText("尚無資料", width / 2 - 36, height / 2);
}

function normalizeType(type) {
  const text = String(type || "").trim().toUpperCase();
  if (["BUY", "SELL", "DEPOSIT", "INTEREST", "DIVIDEND", "WITHDRAW"].includes(text)) return text;
  return "BUY";
}

function normalizeSide(side) {
  const text = String(side || "").trim();
  if (text.includes("賣") || text.toUpperCase() === "SELL") return "SELL";
  return "BUY";
}

function parseDate(value) {
  const text = String(value || "").trim();
  if (!text) return today();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (match) return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  const excelDate = parseExcelSerialDate(text);
  if (excelDate) return excelDate;
  const date = new Date(text);
  if (!Number.isNaN(date.valueOf())) return date.toISOString().slice(0, 10);
  return today();
}

function parseExcelSerialDate(value) {
  if (!/^\d{4,6}(\.\d+)?$/.test(String(value || "").trim())) return "";
  const serial = toNumber(value);
  if (serial < 20000 || serial > 80000) return "";
  const millis = Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000;
  return new Date(millis).toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const clean = String(value ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/,/g, "")
    .replace(/"/g, "")
    .trim();
  if (!clean) return 0;
  const num = Number(clean);
  return Number.isFinite(num) ? num : 0;
}

function isHtmlResponse(text) {
  return /^\s*(<!doctype|<html)/i.test(String(text || ""));
}
function stripBom(text) {
  return String(text || "").replace(/^\uFEFF/, "");
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + toNumber(row[key]), 0);
}

function countBy(rows, key) {
  return rows.reduce((map, row) => {
    const value = row[key] || "UNKNOWN";
    map[value] = (map[value] || 0) + 1;
    return map;
  }, {});
}

function nearlyEqual(a, b, tolerance = 0.0001) {
  return Math.abs(toNumber(a) - toNumber(b)) <= tolerance;
}

function roundMoney(value) {
  return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;
}

function sortByDateAsc(a, b) {
  return String(a.tradeDate || a.date || "").localeCompare(String(b.tradeDate || b.date || ""));
}

function sortByDateDesc(a, b) {
  return sortByDateAsc(b, a);
}

function sortByTradeDateAsc(a, b) {
  return String(a.tradeDate || "").localeCompare(String(b.tradeDate || ""));
}

function sortByBuyDateDesc(a, b) {
  return String(b.buyDate || "").localeCompare(String(a.buyDate || ""));
}

function sortInventoryLotsByPriceDesc(a, b) {
  const priceDiff = toNumber(b.buyPrice) - toNumber(a.buyPrice);
  if (!nearlyEqual(priceDiff, 0)) return priceDiff;
  return sortByBuyDateDesc(a, b);
}

function sortByRebuyTargetDesc(a, b) {
  const priceDiff = toNumber(b.targetRebuyPrice) - toNumber(a.targetRebuyPrice);
  if (!nearlyEqual(priceDiff, 0)) return priceDiff;
  return sortBySellDateDesc(a, b);
}

function sortBySellDateAsc(a, b) {
  return String(a.sellDate || "").localeCompare(String(b.sellDate || ""));
}

function sortBySellDateDesc(a, b) {
  return String(b.sellDate || "").localeCompare(String(a.sellDate || ""));
}

function fmtMoney(value) {
  return new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(toNumber(value));
}

function fmtNum(value) {
  return new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 }).format(toNumber(value));
}

function fmtPrice(value) {
  return new Intl.NumberFormat("zh-TW", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(toNumber(value));
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return String(value);
  return `${date.toISOString().slice(0, 10)} ${date.toTimeString().slice(0, 5)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function stripTags(value) {
  const div = document.createElement("div");
  div.innerHTML = String(value ?? "");
  return div.textContent || div.innerText || "";
}



























