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
export function mobileBorrowOptions(data,account,symbol,date,excludedId='') {state=data;return borrowSourceLotOptions(account,symbol,'',excludedId,date);}
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
