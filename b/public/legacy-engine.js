// Derived unchanged calculation functions from Stockbook 7c595738. No browser bootstrap, persistence, or cloud sync.
const BROKER_PRESETS = [
  { id: "broker-yuanta", code: "YUANTA", name: "元大證券", country: "TW", defaultCurrency: "TWD", isActive: true },
  { id: "broker-fubon", code: "FUBON", name: "富邦證券", country: "TW", defaultCurrency: "TWD", isActive: true },
  { id: "broker-cathay", code: "CATHAY", name: "國泰證券", country: "TW", defaultCurrency: "TWD", isActive: true },
  { id: "broker-sino", code: "SINOPAC", name: "永豐金證券", country: "TW", defaultCurrency: "TWD", isActive: true },
  { id: "broker-kgi", code: "KGI", name: "凱基證券", country: "TW", defaultCurrency: "TWD", isActive: true },
  { id: "broker-capital", code: "CAPITAL", name: "群益證券", country: "TW", defaultCurrency: "TWD", isActive: true },
  { id: "broker-other", code: "OTHER", name: "其他", country: "TW", defaultCurrency: "TWD", isActive: true }
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


let state;

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
    inventoryCostExchanges: [],
    auditLogs: [],
    manualClosedRebuySellIds: [],
    borrowRebuyCycles: [],
    settings: {
      user: { timezone: "Asia/Taipei", baseCurrency: "TWD", dateFormat: "YYYY-MM-DD" },
      portfolios: {},
      firebase: { configText: "", namespace: "", lastSyncAt: "", lastError: "", lastErrorAt: "", status: "LOCAL_ONLY" },
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
      inventoryCostExchangeOpen: false,
      inventoryCostExchangeSourceBuyId: "",
      expandedMatchSellId: "",
      editingMatchSellId: "",
      quickActionSheetOpen: false,
      accountSheetOpen: false,
      settingsTab: "general",
      rebuyTab: "regular",
      quickEntry: null
    }
  };
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

function reportBrokerAccountId(portfolioId = selectedPortfolioId()) {
  const current = state.ui.reportBrokerAccountId || "ALL";
  if (current === "ALL") return "ALL";
  const accounts = scopedBrokerAccounts(portfolioId);
  if (accounts.some((account) => account.id === current)) return current;
  state.ui.reportBrokerAccountId = "ALL";
  return "ALL";
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

function brokerName(id) {
  return state.brokers.find((broker) => broker.id === id)?.name || "未設定券商";
}

function accountName(id) {
  const account = state.brokerAccounts.find((item) => item.id === id);
  if (!account) return "未設定帳戶";
  return `${brokerName(account.brokerId)} / ${account.accountName}`;
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
  const rawName = String(name || "").trim();
  const text = rawName.toUpperCase();
  const normalizedName = rawName.replace(/[\s　]/g, "").toUpperCase();
  // These CSVs do not include a stock-code column, so use full-name aliases.
  // Exact matching prevents 「元大台灣50正2」 from being classified as 0050.
  const knownNames = {
    "元大台灣50正2": "00631L",
    "群益台灣加權正2": "00685L",
    "群益臺灣加權正2": "00685L",
    "元大台灣50": "0050",
    "台灣50": "0050",
    "台積電": "2330",
    "元大高股息": "0056",
    "元大美債20年": "00679B",
    "國泰永續高股息": "00878",
    "群益台灣精選高息": "00919",
    "大華優利高填息30": "00918",
    "群益ESG投等債20+": "00937B",
    "緯穎": "6669",
    "0050": "0050",
    "006208": "006208",
    "0056": "0056"
  };
  if (knownNames[normalizedName]) return knownNames[normalizedName];

  if (typeof state !== "undefined" && state.securities) {
    const found = state.securities.find((security) => {
      const securityName = String(security.name || "").replace(/[\s　]/g, "").toUpperCase();
      return securityName && securityName === normalizedName;
    });
    if (found) return found.symbol;
  }

  const codeMatch = text.match(/\b\d{4,6}[A-Z]?\b/) || text.match(/\d{4,6}[A-Z]?/);
  if (codeMatch) return codeMatch[0];

  // Do not silently assign an unknown Chinese name to the selected/default stock.
  if (/[\u3400-\u9fff]/.test(rawName)) return "UNKNOWN";
  return text.replace(/[^\dA-Z]/g, "").slice(0, 12) || "UNKNOWN";
}

function isBorrowSellTransaction(tx = {}) {
  return tx.transactionType === "SELL" && tx.borrowRebuyType === SELL_TYPE_BORROW;
}

function isRegularRebuySellTransaction(tx = {}) {
  return tx.transactionType === "SELL" && !isBorrowSellTransaction(tx);
}

function sellInventoryLotOptions(lots, accountId, symbol, tradeDate = today()) {
  const cleanSymbol = String(symbol || "").trim().toUpperCase();
  const portfolioId = selectedPortfolioId();
  const cutoffDate = parseDate(tradeDate);
  return lots
    .filter((lot) => lot.remainingShares > 0)
    .filter((lot) => !portfolioId || lot.portfolioId === portfolioId)
    .filter((lot) => !accountId || lot.brokerAccountId === accountId)
    .filter((lot) => !cutoffDate || lot.buyDate <= cutoffDate)
    .filter((lot) => inventoryCostExchangeAllowsTradeDate(lot, cutoffDate))
    .filter((lot) => securityById(lot.securityId)?.symbol.toUpperCase() === cleanSymbol)
    .sort(sortInventoryLotsByPriceDesc)
    .map(lotMatchOption);
}

function quickSellLotOptions(accountId, symbol, tradeDate = today(), excludedSellId = "") {
  const lots = borrowAdjustedInventoryLots(state.buyLots).map((lot) => ({ ...lot }));
  if (excludedSellId) {
    const lotById = new Map(lots.map((lot) => [lot.id, lot]));
    for (const match of state.sellMatches.filter((item) => item.sellTransactionId === excludedSellId)) {
      const lot = lotById.get(match.buyLotId);
      if (lot) lot.remainingShares += toNumber(match.matchedShares);
    }
  }
  return sellInventoryLotOptions(lots, accountId, symbol, tradeDate);
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
      rawRemainingShares: toNumber(lot.remainingShares),
      remainingShares: Math.max(0, toNumber(lot.remainingShares) - borrowedShares),
      borrowedShares
    };
  });
}

function remainingCostBasis(lot) {
  const originalShares = Math.max(toNumber(lot.originalShares), 1);
  const basis = toNumber(lot.costBasisNet || lot.costBasisGross || lot.buyPrice * lot.originalShares);
  return roundMoney(basis * (toNumber(lot.remainingShares) / originalShares));
}

function inventoryCostAdjustmentForBuy(buyTransactionId) {
  return (state.inventoryCostExchanges || []).reduce((total, exchange) => {
    const adjustment = (exchange.lotAdjustments || []).find((item) => item.buyTransactionId === buyTransactionId);
    return total + toNumber(adjustment?.costDelta);
  }, 0);
}

function inventoryCostExchangeEarliestDateForBuy(buyTransactionId) {
  return (state.inventoryCostExchanges || [])
    .filter((exchange) => (exchange.lotAdjustments || []).some((item) => item.buyTransactionId === buyTransactionId))
    .map((exchange) => parseDate(exchange.exchangeDate || exchange.createdAt || ""))
    .filter(Boolean)
    .sort()[0] || "";
}

function inventoryCostExchangeAllowsTradeDate(lot, tradeDate) {
  const exchangeDate = inventoryCostExchangeEarliestDateForBuy(lot?.buyTransactionId);
  return !exchangeDate || !tradeDate || parseDate(tradeDate) >= exchangeDate;
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

function brokerExecutionChecksum(execution, securityId = execution.securityId) {
  return simpleHash(JSON.stringify({
    securityId,
    securityName: String(execution.securityName || "").trim(),
    tradeDate: parseDate(execution.tradeDate),
    shares: toNumber(execution.shares),
    netAmount: toNumber(execution.netAmount),
    side: normalizeSide(execution.brokerSideRaw || execution.side),
    brokerSideRaw: String(execution.brokerSideRaw || "").trim(),
    price: toNumber(execution.price),
    grossAmount: toNumber(execution.grossAmount),
    fee: toNumber(execution.fee),
    tax: toNumber(execution.tax),
    orderNo: String(execution.orderNo || "").trim()
  }));
}

function repairBrokerExecutionSecurityIds() {
  let changed = false;
  state.brokerExecutions = state.brokerExecutions.map((execution) => {
    const securityName = String(execution.securityName || "").trim();
    if (!securityName) return execution;
    const symbol = inferSymbol(securityName);
    if (!symbol || symbol === "UNKNOWN") return execution;
    const security = ensureSecurity(symbol, securityName);
    const checksum = brokerExecutionChecksum(execution, security.id);
    if (security.id === execution.securityId && checksum === execution.checksum) return execution;
    changed = true;
    return { ...execution, securityId: security.id, checksum, updatedAt: nowIso() };
  });
  return changed;
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
    const manualCostAdjustment = inventoryCostAdjustmentForBuy(buy.id);
    const adjustedBuyPrice = toNumber(buy.shares) > 0
      ? roundMoney(toNumber(buy.price) + manualCostAdjustment / toNumber(buy.shares))
      : toNumber(buy.price);
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
      buyPrice: adjustedBuyPrice,
      originalShares: buy.shares,
      remainingShares: buy.shares,
      allocatedBuyFee: buyAmounts.fee,
      costBasisGross: roundMoney(toNumber(buyAmounts.grossAmount) + manualCostAdjustment),
      costBasisNet: roundMoney(Math.abs(toNumber(buyAmounts.netAmount)) + manualCostAdjustment),
      manualCostAdjustment,
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
  repairBrokerExecutionSecurityIds();
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

function reconciliationIsSettled(link) {
  return ["MATCHED", "AUTO_GROUP_MATCHED"].includes(link.matchStatus) || Boolean(link.brokerAcceptedAt);
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

function scopedBrokerAccounts(portfolioId = selectedPortfolioId()) {
  return state.brokerAccounts.filter((account) => account.portfolioId === portfolioId && account.isActive);
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

function sum(rows, key) {
  return rows.reduce((total, row) => total + toNumber(row[key]), 0);
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
// Ported unchanged from A public/app.js for B phase 2 (borrow, cost exchange, securities).
function fmtNum(value) {
  return new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 }).format(toNumber(value));
}

function fmtPrice(value) {
  return new Intl.NumberFormat("zh-TW", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(toNumber(value));
}

function borrowSourceLotOptions(accountId, symbol, selectedValue = "", excludedSellId = "", tradeDate = today()) {
  const selectedIds = normalizeSourceInventoryLotIds(selectedValue);
  const reservations = borrowSourceReservations(excludedSellId);
  return sellInventoryLotOptions(state.buyLots, accountId, symbol, tradeDate)
    .map((option) => {
      const lot = findBuyLotBySourceId(option.value);
      const reserved = lot ? toNumber(reservations.get(lotPrimarySourceId(lot))) : 0;
      return { ...option, shares: Math.max(0, toNumber(option.shares) - reserved) };
    })
    .filter((option) => option.shares > 0 || selectedIds.some((id) => lotMatchesSourceId(findBuyLotBySourceId(option.value), id)));
}

function validateBorrowSellSourceLots(sourceValue, shares, account, securityId, portfolioId, excludedSellId = "", tradeDate = today()) {
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
    if (lot.buyDate > parseDate(tradeDate)) throw new Error("借券來源庫存的買進日期不可晚於賣出日期。");
    if (!inventoryCostExchangeAllowsTradeDate(lot, tradeDate)) throw new Error("這批庫存的賣出日期不可早於成本互換日期。");
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

function inventoryCostExchangeLotIsEligible(lot) {
  if (!lot || toNumber(lot.originalShares) <= 0) return false;
  const rawRemaining = toNumber(lot.rawRemainingShares ?? lot.remainingShares);
  return rawRemaining === toNumber(lot.originalShares) && toNumber(lot.borrowedShares) <= 0 && toNumber(lot.remainingShares) > 0;
}

function inventoryCostExchangeEligibleLots(portfolioId = selectedPortfolioId(), accountId = selectedBrokerAccountId(portfolioId)) {
  return borrowAdjustedInventoryLots(state.buyLots)
    .filter((lot) => lot.portfolioId === portfolioId && (!accountId || lot.brokerAccountId === accountId) && inventoryCostExchangeLotIsEligible(lot))
    .sort((a, b) => String(a.buyDate || "").localeCompare(String(b.buyDate || "")) || toNumber(b.buyPrice) - toNumber(a.buyPrice));
}

function inventoryCostExchangeLotLabel(lot) {
  return `${securityLabel(lot.securityId)}｜${lot.buyDate}｜${fmtNum(lot.originalShares)}股 @ ${fmtPrice(lot.buyPrice)}`;
}

function calculateInventoryCostExchangePlan(sourceLot, externalPriceInput, targetSelections = []) {
  const externalPrice = toNumber(externalPriceInput);
  const sourceShares = toNumber(sourceLot?.originalShares);
  const sourceCurrentPrice = toNumber(sourceLot?.buyPrice);
  if (!sourceLot || sourceShares <= 0) throw new Error("換入來源股數無效。");
  if (externalPrice <= 0) throw new Error("外部庫存成本必須大於 0。");
  const targetAdjustments = [];
  let redistributedAmount = 0;
  for (const selection of targetSelections) {
    const targetLot = selection.lot;
    const reductionPerShare = toNumber(selection.reductionPerShare);
    if (!targetLot || targetLot.buyTransactionId === sourceLot.buyTransactionId) throw new Error("選取的調降庫存已不符合調整資格。");
    if (targetLot.securityId !== sourceLot.securityId) throw new Error("只能在同一檔股票的庫存批次間分配成本。");
    if (reductionPerShare <= 0) throw new Error("勾選的庫存必須輸入大於 0 的每股調降金額。");
    const beforePrice = toNumber(targetLot.buyPrice);
    const afterPrice = roundMoney(beforePrice - reductionPerShare);
    if (afterPrice <= 0) throw new Error(`${inventoryCostExchangeLotLabel(targetLot)} 調整後成本必須大於 0。`);
    const shares = toNumber(targetLot.originalShares);
    const costDelta = -roundMoney(reductionPerShare * shares);
    redistributedAmount += Math.abs(costDelta);
    targetAdjustments.push({
      buyTransactionId: targetLot.buyTransactionId,
      brokerAccountId: targetLot.brokerAccountId,
      shares,
      beforePrice,
      reductionPerShare,
      afterPrice,
      costDelta
    });
  }
  redistributedAmount = roundMoney(redistributedAmount);
  const externalSwapCostDelta = roundMoney((externalPrice - sourceCurrentPrice) * sourceShares);
  const sourceCostDelta = roundMoney(externalSwapCostDelta + redistributedAmount);
  const sourceFinalPrice = roundMoney(sourceCurrentPrice + sourceCostDelta / sourceShares);
  if (sourceFinalPrice <= 0) throw new Error("換入批次調整後成本必須大於 0。");
  const lotAdjustments = [
    {
      role: "SOURCE",
      buyTransactionId: sourceLot.buyTransactionId,
      brokerAccountId: sourceLot.brokerAccountId,
      shares: sourceShares,
      beforePrice: sourceCurrentPrice,
      afterPrice: sourceFinalPrice,
      costDelta: sourceCostDelta
    },
    ...targetAdjustments.map((item) => ({ role: "TARGET", ...item }))
  ];
  const internalAllocationNet = roundMoney(lotAdjustments.reduce((total, item) => total + toNumber(item.costDelta), 0) - externalSwapCostDelta);
  if (Math.abs(internalAllocationNet) > 1) throw new Error("成本互換驗算失敗，內部分配沒有守恆。");
  return {
    externalPrice,
    sourceShares,
    sourceCurrentPrice,
    sourceFinalPrice,
    externalSwapCostDelta,
    redistributedAmount,
    targetAdjustments,
    lotAdjustments,
    internalAllocationNet
  };
}

// Ported unchanged from A public/app.js for B phase 4 (CSV and JSON import).
function stripBom(text) {
  return String(text || "").replace(/^\uFEFF/, "");
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
    symbol = securityName ? `UNKNOWN_${simpleHash(securityName)}` : securityById(context.securityId)?.symbol || "UNKNOWN";
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
    const checksum = brokerExecutionChecksum(mapped);
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

function parseDatasetIds(value) {
  return String(value || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
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

// B writes its own audit entry for each operation (model.js), so A's per-step audit calls are no-ops here.
function auditLog() {}

// Phase 5: A's reports (overview, 0050 benchmark, PDF/Excel builders) and backup envelope, copied unchanged.
function clone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function selectedPortfolio() {
  return state.portfolios.find((portfolio) => portfolio.id === selectedPortfolioId()) || null;
}

function reportAccountMatches(item, accountId = reportBrokerAccountId()) {
  return !accountId || accountId === "ALL" || item.brokerAccountId === accountId;
}

function reportInventoryLots(portfolioId, brokerAccountId = "ALL") {
  return borrowAdjustedInventoryLots(state.buyLots).filter((lot) =>
    lot.portfolioId === portfolioId &&
    reportAccountMatches(lot, brokerAccountId) &&
    toNumber(lot.remainingShares) > 0
  );
}

function borrowSourceCostLabel(sourceValue) {
  const lots = normalizeSourceInventoryLotIds(sourceValue)
    .map(findBuyLotBySourceId)
    .filter(Boolean);
  if (!lots.length) return "-";
  return lots.map((lot) => fmtPrice(lot.buyPrice) + " / " + fmtNum(lot.originalShares) + "股").join(" + ");
}

function activeBorrowRebuyCycles(portfolioId, brokerAccountId = "ALL") {
  const accountScoped = brokerAccountId && brokerAccountId !== "ALL";
  return (state.borrowRebuyCycles || [])
    .filter((cycle) => String(cycle.status || "").toLowerCase() !== "closed" && toNumber(cycle.remainingRebuyQty) > 0)
    .map((cycle) => ({
      ...cycle,
      sellTransaction: state.appTransactions.find((tx) => tx.id === cycle.sellTradeId) || null
    }))
    .filter((cycle) => cycle.sellTransaction?.portfolioId === portfolioId)
    .filter((cycle) => !accountScoped || cycle.sellTransaction?.brokerAccountId === brokerAccountId)
    .sort((a, b) => String(b.sellDate || "").localeCompare(String(a.sellDate || "")) || toNumber(b.sellPrice) - toNumber(a.sellPrice));
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

function exportCurrentUserState() {
  const user = currentUser();
  const portfolioIds = new Set(userPortfolios().map((portfolio) => portfolio.id));
  const accountIds = new Set(state.brokerAccounts.filter((account) => portfolioIds.has(account.portfolioId)).map((account) => account.id));
  const securityIds = new Set([
    ...state.appTransactions.filter((tx) => portfolioIds.has(tx.portfolioId)).map((tx) => tx.securityId),
    ...state.brokerExecutions.filter((execution) => portfolioIds.has(execution.portfolioId)).map((execution) => execution.securityId),
    ...state.positionTransfers.filter((transfer) => portfolioIds.has(transfer.portfolioId)).map((transfer) => transfer.securityId),
    ...state.inventoryCostExchanges.filter((exchange) => portfolioIds.has(exchange.portfolioId)).map((exchange) => exchange.securityId),
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
    inventoryCostExchanges: state.inventoryCostExchanges.filter((item) => portfolioIds.has(item.portfolioId)),
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
    "inventoryCostExchanges",
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
  state.inventoryCostExchanges = state.inventoryCostExchanges.filter((item) => !portfolioIds.has(item.portfolioId));
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
  for (const key of ["portfolios", "portfolioMembers", "brokerAccounts", "appTransactions", "brokerExecutions", "accountTransfers", "positionTransfers", "inventoryCostExchanges", "marketQuotes", "auditLogs"]) {
    for (const record of copy[key] || []) remapUserId(record);
  }
  return copy;
}

function buildPdfReportModel(portfolioId, brokerAccountId = reportBrokerAccountId(portfolioId)) {
  const transactions = scopedTransactions(portfolioId).filter((tx) => reportAccountMatches(tx, brokerAccountId)).slice().sort(sortByDateAsc);
  const matches = state.sellMatches.filter((match) => match.portfolioId === portfolioId && reportAccountMatches(match, brokerAccountId)).slice().sort((a, b) => String(a.sellDate || "").localeCompare(String(b.sellDate || "")));
  const profitEvents = realizedProfitEvents(portfolioId, brokerAccountId);
  if (!transactions.length && !matches.length) throw new Error("沒有可產生報告的交易資料");
  const reportDate = latestBenchmarkReportDate(portfolioId, brokerAccountId, transactions, profitEvents);
  const reportMonth = reportDate.slice(0, 7);
  const reportYear = reportDate.slice(0, 4);
  const dayTransactions = transactions.filter((tx) => tx.tradeDate === reportDate).sort(reportTransactionSort);
  const dayMatches = matches.filter((match) => match.sellDate === reportDate);
  const dayProfitEvents = profitEvents.filter((event) => event.date === reportDate);
  const monthProfitEvents = profitEvents.filter((event) => String(event.date || "").startsWith(reportMonth));
  const yearProfitEvents = profitEvents.filter((event) => String(event.date || "").startsWith(reportYear));
  const monthDailyRows = summarizeProfitEventsBy(monthProfitEvents, (event) => event.date);
  const yearMonthlyRows = summarizeProfitEventsBy(yearProfitEvents, (event) => String(event.date || "").slice(0, 7));
  const inventoryLots = reportInventoryLots(portfolioId, brokerAccountId)
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
  reportDate = latestBenchmarkReportDate(portfolioId, brokerAccountId, transactions, [{ date: reportDate }]);
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
  const dailyRows = build0050BenchmarkSeries(portfolioId, brokerAccountId, transactions, rows, reportDate, reportPrice, security?.id);
  const current = dailyRows[dailyRows.length - 1] || {
    actualShares: 0,
    cash: 0,
    cashEquivalentShares: 0,
    otherInventoryValue: 0,
    otherEquivalentShares: 0,
    equivalent: 0
  };
  const actualShares = current.actualShares;
  const otherInventoryValue = current.otherInventoryValue;
  const cash = current.cash;
  const cashEquivalentShares = current.cashEquivalentShares;
  const otherEquivalentShares = current.otherEquivalentShares;
  const operationEquivalentShares = current.equivalent;
  const liquidationValue = cash + reportSum(inventoryLots, (lot) => inventoryLotReportLiquidationValue(lot, reportPrice));
  const liquidationEquivalentShares = reportPrice ? liquidationValue / reportPrice : 0;
  const excessShares = operationEquivalentShares - passiveShares;
  const excessRate = passiveShares ? excessShares / passiveShares : 0;
  const benchmarkRatio = passiveShares ? operationEquivalentShares / passiveShares : null;
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
    benchmarkRatio,
    excessValue,
    equivalentAverageCost,
    fractionalShareRatio,
    rows,
    series: dailyRows,
    dailyRows,
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

function benchmarkPriceForDate(portfolioId, securityId, date, transactions = [], options = {}) {
  if (!securityId) return { price: 0, source: "無基準價" };
  const asOfOnly = options.asOfOnly === true;
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
  const priorTrade = transactions.filter((tx) => tx.securityId === securityId && tx.tradeDate <= date && ["BUY", "SELL"].includes(tx.transactionType) && toNumber(tx.price) > 0).sort((a, b) => String(b.tradeDate || "").localeCompare(String(a.tradeDate || "")))[0];
  if (priorQuote && (!priorTrade || priorQuote.date >= priorTrade.tradeDate)) {
    return { price: toNumber(priorQuote.price), source: `${priorQuote.source || "市場報價"} ${priorQuote.date}` };
  }
  if (priorTrade) return { price: toNumber(priorTrade.price), source: "APP最近成交價" };
  if (asOfOnly) return { price: 0, source: "無當日以前價格" };
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

function build0050BenchmarkSeries(portfolioId, brokerAccountId, transactions, benchmarkRows, reportDate, reportPrice, securityId) {
  const accountScoped = brokerAccountId && brokerAccountId !== "ALL";
  const cashDates = state.cashLedger
    .filter((row) => row.portfolioId === portfolioId && (!accountScoped || row.brokerAccountId === brokerAccountId))
    .map((row) => row.tradeDate);
  const quoteDates = (state.marketQuotes || [])
    .filter((quote) => quote.portfolioId === portfolioId)
    .map((quote) => String(quote.sourceDate || quote.quoteTime || "").slice(0, 10));
  const dates = Array.from(new Set([...transactions.map((tx) => tx.tradeDate), ...cashDates, ...quoteDates, reportDate].filter((date) => date && date <= reportDate))).sort();
  let lastKnownPrice = 0;
  return dates.map((date) => {
    const asOfPrice = toNumber(benchmarkPriceForDate(portfolioId, securityId, date, transactions, { asOfOnly: true }).price);
    const price = asOfPrice || lastKnownPrice || (date === reportDate ? reportPrice : 0);
    if (price) lastKnownPrice = price;
    const passive = benchmarkRows.filter((row) => row.date <= date).reduce((total, row) => total + toNumber(row.shares), 0);
    const snapshot = benchmarkOperationSnapshot(portfolioId, brokerAccountId, transactions, securityId, date, price);
    const equivalent = snapshot.actualShares + snapshot.cashEquivalentShares + snapshot.otherEquivalentShares;
    const excess = equivalent - passive;
    return {
      date: date.slice(5),
      fullDate: date,
      price,
      actualShares: snapshot.actualShares,
      cash: snapshot.cash,
      cashEquivalentShares: snapshot.cashEquivalentShares,
      otherInventoryValue: snapshot.otherInventoryValue,
      otherEquivalentShares: snapshot.otherEquivalentShares,
      passive,
      equivalent,
      excess,
      excessValue: excess * price
    };
  });
}

function benchmarkOperationSnapshot(portfolioId, brokerAccountId, transactions, benchmarkSecurityId, date, benchmarkPrice) {
  const accountScoped = brokerAccountId && brokerAccountId !== "ALL";
  const sharesBySecurity = new Map();
  for (const tx of transactions.filter((item) => item.tradeDate <= date && ["BUY", "SELL"].includes(item.transactionType))) {
    const direction = tx.transactionType === "BUY" ? 1 : -1;
    sharesBySecurity.set(tx.securityId, (sharesBySecurity.get(tx.securityId) || 0) + direction * toNumber(tx.shares));
  }
  const cash = reportSum(
    state.cashLedger.filter((row) => row.portfolioId === portfolioId && (!accountScoped || row.brokerAccountId === brokerAccountId) && row.tradeDate <= date),
    (row) => row.amount
  );
  const actualShares = toNumber(sharesBySecurity.get(benchmarkSecurityId));
  let otherInventoryValue = 0;
  for (const [securityId, shares] of sharesBySecurity.entries()) {
    if (securityId === benchmarkSecurityId || !shares) continue;
    const price = toNumber(benchmarkPriceForDate(portfolioId, securityId, date, transactions, { asOfOnly: true }).price);
    otherInventoryValue += shares * price;
  }
  const cashEquivalentShares = benchmarkPrice ? cash / benchmarkPrice : 0;
  const otherEquivalentShares = benchmarkPrice ? otherInventoryValue / benchmarkPrice : 0;
  return { actualShares, cash, cashEquivalentShares, otherInventoryValue, otherEquivalentShares };
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

function latestBenchmarkReportDate(portfolioId, brokerAccountId, transactions, profitItems = []) {
  const accountScoped = brokerAccountId && brokerAccountId !== "ALL";
  const cashRows = state.cashLedger.filter((row) =>
    row.portfolioId === portfolioId && (!accountScoped || row.brokerAccountId === brokerAccountId)
  );
  const quoteRows = (state.marketQuotes || [])
    .filter((quote) => quote.portfolioId === portfolioId)
    .map((quote) => ({ tradeDate: String(quote.sourceDate || quote.quoteTime || "").slice(0, 10) }))
    .filter((quote) => quote.tradeDate);
  return latestReportDate([...transactions, ...cashRows, ...quoteRows], profitItems);
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
      ${pdfBenchmarkMetric("等值／0050 基準比", benchmark.benchmarkRatio === null ? "-" : `${fmtNum(benchmark.benchmarkRatio, 2)}×`, "1.00× 代表與直接買進相同")}
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
  const reportDate = latestBenchmarkReportDate(portfolioId, brokerAccountId, transactions, matches);
  const inventoryLots = reportInventoryLots(portfolioId, brokerAccountId);
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
    openRebuyShares: sum(state.rebuyTasks.filter((task) => task.portfolioId === portfolioId && inAccount(task) && ["OPEN", "PARTIAL_FILLED"].includes(task.status)), "remainingRebuyShares"),
    openBorrowRebuyShares: activeBorrowRebuyCycles(portfolioId, brokerAccountId).reduce((total, cycle) => total + toNumber(cycle.remainingRebuyQty), 0)
  };
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

function transactionReconStatus(transactionId) {
  const links = state.reconciliationLinks.filter((link) => String(link.appTransactionId || "").split(",").includes(transactionId));
  if (!links.length) return "MISSING_IN_BROKER";
  if (links.some((link) => link.brokerAcceptedAt)) return "BROKER_ACCEPTED";
  if (links.some((link) => !["MATCHED", "AUTO_GROUP_MATCHED"].includes(link.matchStatus))) return links[0].matchStatus;
  return links[0].matchStatus;
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

function sortByDateDesc(a, b) {
  return sortByDateAsc(b, a);
}

function fmtMoney(value) {
  return new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(toNumber(value));
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

// A reads text through a DOM element; B also runs outside the browser (tests), so tags and entities are removed directly.
function stripTags(value) {
  return String(value ?? "").replace(/<[^>]*>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#096;/g, "`").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}

export function evaluateLedger(raw, identity, portfolioId='') {
  if (!raw || !Array.isArray(raw.appTransactions)) throw new Error('帳本交易格式不正確，請先在 A 版同步。');
  state=normalizeState(structuredClone(raw));
  const email=String(identity.email||'').toLowerCase();
  const owner=state.users.find(u=>u.firebaseUid===identity.uid)||state.users.find(u=>String(u.email||'').toLowerCase()===email);
  if (!owner) throw new Error('帳本使用者與 Google 登入帳號不符，請先在 A 版確認。');
  state.sessions.currentUserId=owner.id;
  state.ui.currentPortfolioId=portfolioId;
  const portfolios=userPortfolios();
  if (!portfolios.length) throw new Error('沒有可用的帳本，請先在 A 版建立並同步。');
  state.ui.currentPortfolioId=portfolios.some(p=>p.id===portfolioId)?portfolioId:portfolios[0].id;
  recomputeAll();
  return {data:state,user:owner,portfolioId:state.ui.currentPortfolioId,portfolios};
}
export function mobileInventory(data) {state=data;return borrowAdjustedInventoryLots(state.buyLots);}
export function mobileAmounts(data, tx) {state=data;return effectiveTransactionAmounts(tx);}
export function mobileBasis(data,lot) {state=data;return remainingCostBasis(lot);}
export function mobileSellOptions(data,account,symbol,date,excludedId='') {state=data;return quickSellLotOptions(account,symbol,date,excludedId);}
export function mobileCosts(data,type,price,shares,brokerId,security) {state=data;return estimateTradeCosts(type,price,shares,brokerId,security);}
export function acceptanceKey(link) {return brokerDiffAcceptanceKey(link);}
export function mobileNormalizeTransaction(tx) {return normalizeTransaction(tx);}
export function mobileSettings(data,portfolioId) {state=data;return getPortfolioSettings(portfolioId);}
export function mobileBorrowOptions(data,account,symbol,date,excludedId='',selected='') {state=data;return borrowSourceLotOptions(account,symbol,selected,excludedId,date);}
export function mobileValidateBorrow(data,sources,shares,account,securityId,portfolioId,excludedId,date) {state=data;return validateBorrowSellSourceLots(sources,shares,account,securityId,portfolioId,excludedId,date);}
export function mobileExchangeLots(data,portfolioId,accountId) {state=data;return inventoryCostExchangeEligibleLots(portfolioId,accountId);}
export function mobileExchangeEligible(lot) {return inventoryCostExchangeLotIsEligible(lot);}
export function mobileExchangePlan(data,sourceLot,externalPrice,targets) {state=data;return calculateInventoryCostExchangePlan(sourceLot,externalPrice,targets);}
export function mobileAssetType(symbol,name,value) {return normalizeSecurityAssetType(value||inferSecurityAssetType(symbol,name));}
export function mobileImport(raw,identity,portfolioId,{accountId,text,sourceType,filename}) {
  const {user,portfolioId:pid}=evaluateLedger(raw,identity,portfolioId);
  const account=state.brokerAccounts.find((item)=>item.id===accountId&&item.portfolioId===pid&&item.isActive!==false);
  if (!account) throw new Error('請選擇這份帳本的券商帳戶。');
  const symbol=getPortfolioSettings(pid).defaultSecurity||'0050';
  const security=ensureSecurity(symbol,symbol);
  const context={userId:user.id,portfolioId:pid,brokerId:account.brokerId,brokerAccountId:account.id,securityId:security.id,sourceFilename:String(filename||'')};
  const count=state.importBatches.length;
  if (sourceType==='JSON_LEDGER') importJsonLedger(text,context); else importBrokerCsv(text,context);
  if (state.importBatches.length!==count+1) throw new Error('匯入失敗，未建立批次。');
  return state;
}
export function mobileClearAcceptedDiffs(data,executionIds,transactionIds) {state=data;clearAcceptedBrokerDiffsForDeletedData(executionIds,transactionIds);return state.acceptedBrokerDiffs;}
function reportScope(raw,identity,portfolioId,accountId){
  const {portfolioId:pid}=evaluateLedger(raw,identity,portfolioId);
  state.ui.reportBrokerAccountId=accountId||'ALL';
  return {pid,account:reportBrokerAccountId(pid)};
}
// A's 報表頁: one report model plus the quality, inventory and cash-flow checks it renders from.
export function mobileReport(raw,identity,portfolioId,accountId='ALL') {
  const {pid,account}=reportScope(raw,identity,portfolioId,accountId);
  let model;
  try{model=buildPdfReportModel(pid,account);}catch(error){return {empty:error.message||String(error)};}
  const quality=buildReportQualityMetrics(model),inventory=buildInventoryRiskMetrics(model),cashflow=buildCashflowMetrics(model);
  return {model,quality,inventory,cashflow,insights:buildReportInsights(model,quality,inventory,cashflow),account};
}
// Same documents as A's 匯出 PDF (printable HTML) and 匯出 Excel (HTML table saved as .xls).
export function mobileReportPdfHtml(raw,identity,portfolioId,accountId='ALL') {
  const {pid,account}=reportScope(raw,identity,portfolioId,accountId);
  const model=buildPdfReportModel(pid,account);
  return {model,html:buildPrettyPdfReportHtml(model)};
}
export function mobileReportXls(raw,identity,portfolioId,accountId='ALL') {
  reportScope(raw,identity,portfolioId,accountId);
  return `
    <html><head><meta charset="utf-8" /></head><body>
      ${reportHtmlTable("0050 操作績效追蹤", reportRows("performance0050"))}
    </body></html>
  `;
}
export function mobileFmtPercent(value) {return fmtPercentValue(value);}
// A's JSON 備份 (stockbook-backup-v2, SHA-256 of the state) and 匯入備份 (replace this user's data with the file's).
export async function mobileBackupEnvelope(raw,identity,portfolioId,source='LOCAL_EXPORT') {
  evaluateLedger(raw,identity,portfolioId);
  return createBackupEnvelope(source);
}
export async function mobileParseBackup(parsed) {return parseBackupDocument(parsed);}
export function mobileExecutionChecksum(execution) {return brokerExecutionChecksum(execution);}
export function mobileContentCount(data) {
  return ['appTransactions','brokerExecutions','accountTransfers','positionTransfers','inventoryCostExchanges','importBatches'].reduce((s,k)=>s+((data&&data[k])||[]).length,0);
}
export function mobileRestore(raw,identity,portfolioId,backupState) {
  evaluateLedger(raw,identity,portfolioId);
  mergeCurrentUserState(backupState);
  return exportCurrentUserState();
}
