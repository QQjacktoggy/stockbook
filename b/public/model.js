import { evaluateLedger, mobileInventory, mobileAmounts, mobileBasis, mobileSellOptions, mobileCosts, acceptanceKey, mobileNormalizeTransaction, mobileSettings, mobileBorrowOptions, mobileValidateBorrow, mobileExchangeLots, mobileExchangeEligible, mobileExchangePlan, mobileAssetType, mobileImport, mobileClearAcceptedDiffs, mobileReport, mobileReportPdfHtml, mobileReportXls, mobileRestore, mobileContentCount } from './legacy-engine.js';
import { DEFAULT_FOLDER_ID } from './drive-import.js';
export function taipeiToday(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
function num(v){return Number(v)||0;}
const clone=x=>structuredClone(x);
function scoped(data,portfolioId,key){return (data[key]||[]).filter(x=>x.portfolioId===portfolioId);}
export function projectLedger(raw,identity,portfolioId='',account='all'){
 const evaluated=evaluateLedger(raw,identity,portfolioId),{data,user}=evaluated,pid=evaluated.portfolioId;
 const stocks={};
 for(const sec of data.securities){const quote=data.marketQuotes.filter(q=>q.portfolioId===pid&&q.securityId===sec.id).sort((a,b)=>String(b.quoteTime||'').localeCompare(String(a.quoteTime||'')))[0];stocks[sec.id]={symbol:sec.symbol,name:sec.name||sec.symbol,price:num(quote?.price)>0?num(quote.price):null,quoteTime:quote?.quoteTime||'',quoteSource:quote?.source||'',assetType:sec.assetType,market:sec.market||'TW',yahooSymbol:sec.yahooSymbol||''};}
 const accounts=[{id:'all',name:'全部帳戶',full:'所有券商帳戶'},...scoped(data,pid,'brokerAccounts').filter(a=>a.isActive!==false).map(a=>{const broker=data.brokers.find(b=>b.id===a.brokerId);return {id:a.id,name:a.accountName||a.name||broker?.name||a.accountNo||a.id,full:(broker?.name||'券商')+' · '+(a.accountName||a.name||a.accountNo||'帳戶'),brokerId:a.brokerId};})];
 if(!accounts.some(a=>a.id===account))account='all';
 const cash={};accounts.filter(a=>a.id!=='all').forEach(a=>{cash[a.id]=scoped(data,pid,'cashLedger').filter(r=>r.brokerAccountId===a.id).reduce((s,r)=>s+num(r.amount),0);});
 const lots=mobileInventory(data).filter(l=>l.portfolioId===pid&&num(l.remainingShares)>0).map(l=>({id:l.id,source:l.sourceTransactionId||l.buyTransactionId,code:l.securityId,qty:num(l.remainingShares),cost:num(l.buyPrice),basis:mobileBasis(data,l),date:l.buyDate,account:l.brokerAccountId,borrowed:num(l.borrowedShares),buyTx:l.buyTransactionId,original:num(l.originalShares),exchangeable:mobileExchangeEligible(l),adjusted:num(l.manualCostAdjustment),quoteTime:stocks[l.securityId]?.quoteTime||''}));
 const cashKinds={DEPOSIT:'deposit',WITHDRAW:'withdraw',DIVIDEND:'dividend',INTEREST:'interest'};
 const trades=scoped(data,pid,'appTransactions').filter(t=>t.userId===user.id&&(['BUY','SELL'].includes(t.transactionType)||cashKinds[t.transactionType])).map(t=>{const amounts=mobileAmounts(data,t),cashKind=cashKinds[t.transactionType],refd=!cashKind&&referenced(raw,t,true);return {id:t.id,type:cashKind||(t.transactionType==='BUY'?'buy':'sell'),cash:!!cashKind,code:t.securityId,qty:num(t.shares),price:num(t.price),date:t.tradeDate,time:t.tradeTime||'',account:t.brokerAccountId,fee:num(t.fee),tax:num(t.tax),net:amounts.netAmount,note:t.note||'',recorded:t.createdAt||'',borrow:t.borrowRebuyType||'',cycle:t.rebuyCycleId||'',borrowSources:t.sourceInventoryLotId||'',manual:num(t.manualMatchedShares),rebuyIds:t.rebuySellTransactionIds||'',linked:!cashKind&&(!!t.rebuySellTransactionIds||refd),refd,category:t.strategyCategory||'LONG_TERM',sources:t.linkedBuyTransactionId||'',aligned:amounts.isBrokerAligned,canEdit:true};});
 const rebuy=scoped(data,pid,'rebuyTasks').filter(t=>['OPEN','PARTIAL_FILLED'].includes(t.status)&&num(t.remainingRebuyShares)>0).map(t=>({id:t.sellTransactionId,code:t.securityId,account:t.brokerAccountId,date:t.sellDate,price:t.sellPrice,target:t.targetRebuyPrice,qty:t.remainingRebuyShares,sold:num(t.sellShares)}));
 const txById=new Map(data.appTransactions.map(t=>[t.id,t])),lotById=new Map(data.buyLots.map(l=>[l.id,l]));
 const cycles=(data.borrowRebuyCycles||[]).map(c=>{const s=txById.get(c.sellTradeId);return s&&s.portfolioId===pid?{id:c.id,code:s.securityId,account:s.brokerAccountId,date:c.sellDate,price:num(c.sellPrice),qty:num(c.sellQty),remaining:num(c.remainingRebuyQty),filled:num(c.totalRebuyQty),avg:num(c.avgRebuyPrice),profit:num(c.netProfit),status:c.status,sources:c.sourceInventoryLotId||'',fills:(c.rebuyMatches||[]).map(m=>({id:m.rebuyTradeId,date:m.rebuyDate,price:num(m.rebuyPrice),qty:num(m.rebuyQty),profit:num(m.netProfit)}))}:null;}).filter(Boolean);
 const matches={};for(const m of data.sellMatches.filter(m=>m.portfolioId===pid)){const lot=lotById.get(m.buyLotId);(matches[m.sellTransactionId]=matches[m.sellTransactionId]||[]).push({buy:lot?.sourceTransactionId||lot?.buyTransactionId||'',date:m.buyDate,price:num(m.buyPrice),qty:num(m.matchedShares),profit:num(m.netProfit)});}
 const adjusted=new Map(mobileInventory(data).map(l=>[l.buyTransactionId,l]));
 const exchanges=scoped(data,pid,'inventoryCostExchanges').map(x=>({id:x.id,code:x.securityId,account:x.brokerAccountId,date:x.exchangeDate,source:x.sourceBuyTransactionId,shares:num(x.sourceShares),originalPrice:num(x.sourceOriginalPrice),externalPrice:num(x.externalPrice),finalPrice:num(x.sourceFinalPrice),redistributed:num(x.redistributedAmount),label:x.externalAccountLabel||'',targets:(x.targetAdjustments||[]).map(t=>({id:t.buyTransactionId,shares:num(t.shares),before:num(t.beforePrice),after:num(t.afterPrice)})),deletable:(x.lotAdjustments||[]).every(a=>mobileExchangeEligible(adjusted.get(a.buyTransactionId)))}));
 const settings=mobileSettings(data,pid);
 const allAccounts=scoped(data,pid,'brokerAccounts').map(a=>({id:a.id,name:a.accountName||a.name||a.id,brokerId:a.brokerId,broker:data.brokers.find(b=>b.id===a.brokerId)?.name||'券商',masked:a.accountNoMasked||'',branch:a.branchName||'',isDefault:!!a.isDefault,active:a.isActive!==false,used:accountUsed(data,a.id)}));
 const transfers=scoped(data,pid,'accountTransfers').map(x=>({id:x.id,from:x.fromBrokerAccountId,to:x.toBrokerAccountId,date:x.transferDate,amount:num(x.amount),fee:num(x.fee),note:x.note||''})).sort((a,b)=>b.date.localeCompare(a.date));
 const positions=scoped(data,pid,'positionTransfers').map(x=>({id:x.id,code:x.securityId,from:x.fromBrokerAccountId,to:x.toBrokerAccountId,date:x.transferDate,shares:num(x.shares),basis:num(x.originalCostBasis),note:x.note||''})).sort((a,b)=>b.date.localeCompare(a.date));
 const brokers=data.brokers.filter(b=>b.isActive!==false).map(b=>({id:b.id,name:b.name,fees:{feeRate:0.001425,discountRate:0.28,minFee:1,stockSellTaxRate:0.003,etfSellTaxRate:0.001,...(settings.brokerFees||{})[b.id]}}));
 const securitiesUsed=new Set([...data.appTransactions,...data.brokerExecutions,...data.positionTransfers].map(x=>x.securityId));
 for(const id of Object.keys(stocks))stocks[id].used=securitiesUsed.has(id);
 const batches=scoped(data,pid,'importBatches').map(b=>({id:b.id,filename:b.sourceFilename||'',sourceType:b.sourceType||'',importedAt:b.importedAt||b.createdAt||'',rows:num(b.rowCount),created:num(b.createdCount),duplicate:num(b.duplicateCount),from:b.dateFrom||'',to:b.dateTo||'',status:b.status||'',account:b.brokerAccountId,executions:data.brokerExecutions.filter(x=>x.importBatchId===b.id).length,transactions:data.appTransactions.filter(t=>t.importBatchId===b.id).length})).sort((a,b)=>String(b.importedAt).localeCompare(String(a.importedAt)));
 const templates=(data.importTemplates||[]).map(t=>({id:t.id,name:t.templateName||t.id,brokerId:t.brokerId,isDefault:!!t.isDefault||t.id==='tpl-cathay-default',mapping:t.columnMapping||{}}));
 // Links only carry the broker total and the difference, so the ledger side is derived (A shows the same numbers on its reconciliation table).
 const extras=duplicateExecutions(data,pid),batchById=new Map(data.importBatches.map(b=>[b.id,b])),execById=new Map(data.brokerExecutions.map(x=>[x.id,x]));
 const reconciliation=scoped(data,pid,'reconciliationLinks').map(l=>{const execs=String(l.brokerExecutionId||'').split(',').filter(Boolean),hasApp=!!String(l.appTransactionId||'').trim(),broker=execs.length?num(l.allocatedNetAmount):null,app=!hasApp?null:execs.length?Math.round((num(l.allocatedNetAmount)-num(l.diffNetAmount))*100)/100:num(l.allocatedNetAmount);
  const duplicates=execs.filter(id=>extras.has(id)).map(id=>{const x=execById.get(id),b=batchById.get(x?.importBatchId)||{};return {id,orderNo:x?.orderNo||'',shares:num(x?.shares),netAmount:num(x?.netAmount),batch:b.id||'',filename:b.sourceFilename||'',importedAt:b.importedAt||b.createdAt||x?.createdAt||''};});
  return {...l,key:acceptanceKey(l),appNetAmount:app,brokerNetAmount:broker,duplicates,settled:['MATCHED','AUTO_GROUP_MATCHED'].includes(l.matchStatus)||!!l.brokerAcceptedAt};});
 const drive=raw.settings?.driveImport?.[pid]||{},driveImport={folderId:String(drive.folderId||DEFAULT_FOLDER_ID),folderName:String(drive.folderName||''),keywords:{...(drive.keywords||{})}};
 return {schema:2,driveImport,batches,templates,cycles,matches,exchanges,allAccounts,transfers,positions,brokers,settings:{defaultSecurity:settings.defaultSecurity,defaultRebuyOffset:num(settings.defaultRebuyOffset),coreHoldingShares:num(settings.coreHoldingShares),priceTolerance:num(settings.priceTolerance),amountTolerance:num(settings.amountTolerance),feeAllocationMethod:settings.feeAllocationMethod},defaultCode:(data.securities.find(s=>String(s.symbol||'').toUpperCase()===String(mobileSettings(data,pid).defaultSecurity||'0050').toUpperCase())||{}).id||'',account,cash,lots,trades,stocks,accounts,rebuy,reconciliation,portfolioId:pid,portfolios:evaluated.portfolios.map(p=>({id:p.id,name:p.name||p.portfolioName||'投資帳本'})),user:{id:user.id,name:identity.displayName||user.name||user.email,email:identity.email},updatedAt:'',raw:data};
}
export const CATEGORIES=['LONG_TERM','TRADING','CORE','REBUY'];
// Like A's quick sell: when no lots are chosen, take just enough lots in the offered (high price first) order.
export function minimalLots(options,qty){const out=[];let left=num(qty);for(const o of options){if(left<=0)break;out.push(o);left-=num(o.shares);}return out;}
export function estimateCosts(raw,identity,portfolioId,fields){
 const {data}=evaluateLedger(raw,identity,portfolioId),account=data.brokerAccounts.find(a=>a.id===fields.account),security=data.securities.find(s=>s.id===fields.code);
 return mobileCosts(data,fields.type==='sell'?'SELL':'BUY',num(fields.price),num(fields.qty),account?.brokerId,security);
}
export function sellOptions(raw,identity,portfolioId,fields){
 const {data}=evaluateLedger(raw,identity,portfolioId),sec=data.securities.find(s=>s.id===fields.code);
 if(!sec)return [];
 return mobileSellOptions(data,fields.account,sec.symbol,fields.date,fields.id||'');
}
export function borrowOptions(raw,identity,portfolioId,fields){
 const {data}=evaluateLedger(raw,identity,portfolioId),sec=data.securities.find(s=>s.id===fields.code);
 if(!sec)return [];
 const old=fields.id?data.appTransactions.find(t=>t.id===fields.id):null;
 return mobileBorrowOptions(data,fields.account,sec.symbol,fields.date,fields.id||'',old?.sourceInventoryLotId||'');
}
// Preview of A's cost exchange plan for the form; throws the same messages A shows.
export function exchangePreview(raw,identity,portfolioId,fields){
 const {data,portfolioId:pid}=evaluateLedger(raw,identity,portfolioId);
 return exchangePlan(data,pid,fields).plan;
}
function exchangePlan(data,pid,f){
 const eligible=mobileExchangeLots(data,pid,''),source=eligible.find(l=>l.buyTransactionId===f.source);
 if(!source)throw new Error('換入來源必須是完整未售出、未借券的庫存批次。');
 const targets=(f.targets||[]).map(t=>{const lot=eligible.find(l=>l.buyTransactionId===t.id);if(!lot||lot.buyTransactionId===source.buyTransactionId||lot.brokerAccountId!==source.brokerAccountId)throw new Error('選取的調降庫存已不符合調整資格。');return {lot,reductionPerShare:t.reduction};});
 return {source,targets,plan:mobileExchangePlan(data,source,f.externalPrice,targets)};
}
function accountUsed(data,id){return ['appTransactions','brokerExecutions','importBatches'].some(k=>(data[k]||[]).some(x=>x.brokerAccountId===id))||['accountTransfers','positionTransfers'].some(k=>(data[k]||[]).some(x=>x.fromBrokerAccountId===id||x.toBrokerAccountId===id));}
// A brand-new ledger, shaped like A's first login (upsertFirebaseUser + ensureStarterData) and A's cloud export.
export function starterLedger(identity,{portfolioName='',brokerId='broker-cathay',accountName=''}={},now=new Date().toISOString()){
 const uid=String(identity.uid||''),email=String(identity.email||'').toLowerCase();
 if(!uid||!email)throw new Error('請先登入。');
 const userId='firebase-'+uid,pid='portfolio-b-'+crypto.randomUUID(),aid='broker-account-b-'+crypto.randomUUID();
 const raw={
  users:[{id:userId,email,name:identity.displayName||email,passwordHash:'',authProvider:'google',firebaseUid:uid,photoURL:'',createdAt:now,updatedAt:now}],
  portfolios:[{id:pid,userId,name:String(portfolioName||'').trim()||'0050 策略帳本',baseCurrency:'TWD',createdAt:now,updatedAt:now}],
  portfolioMembers:[{id:'member-b-'+crypto.randomUUID(),portfolioId:pid,userId,role:'OWNER',createdAt:now,updatedAt:now}],
  securities:[{id:'sec-0050',symbol:'0050',name:'元大台灣50',market:'TW',currency:'TWD',assetType:'ETF',createdAt:now,updatedAt:now}],
  brokerAccounts:[{id:aid,userId,portfolioId:pid,brokerId,accountName:String(accountName||'').trim()||'主帳戶',accountNoMasked:'',branchName:'',currency:'TWD',isDefault:true,isActive:true,createdAt:now,updatedAt:now}],
  importBatches:[],rawImportRows:[],appTransactions:[],brokerExecutions:[],accountTransfers:[],positionTransfers:[],inventoryCostExchanges:[],marketQuotes:[],
  auditLogs:[{id:'audit-b-'+crypto.randomUUID(),userId,portfolioId:pid,action:'CREATE',entityType:'portfolio',entityId:pid,before:null,after:{name:String(portfolioName||'').trim()||'0050 策略帳本'},createdAt:now,source:'MOBILE_B'}],
  settings:{user:{timezone:'Asia/Taipei',baseCurrency:'TWD',dateFormat:'YYYY-MM-DD'},portfolios:{[pid]:mobileSettings({settings:{portfolios:{}}},'')}},
  acceptedBrokerDiffs:{},manualClosedRebuySellIds:[]
 };
 evaluateLedger(raw,identity,pid);
 return raw;
}
function canWrite(data,user,pid){
 const p=data.portfolios.find(x=>x.id===pid);
 return p?.userId===user.id||data.portfolioMembers.some(m=>m.portfolioId===pid&&m.userId===user.id&&['OWNER','EDITOR'].includes(m.role));
}
// ignoreExchanges: A deletes a buy together with its cost exchanges, so deleting does not count them as references.
function referenced(raw,tx,ignoreExchanges=false){
 const needle=tx.id;
 return (raw.appTransactions||[]).some(t=>t.id!==needle&&['linkedBuyTransactionId','sourceInventoryLotId','rebuySellTransactionIds','rebuyCycleId'].some(k=>String(t[k]||'').split(/[,\s]+/).includes(needle)))
 || (ignoreExchanges?['positionTransfers']:['positionTransfers','inventoryCostExchanges']).some(k=>(raw[k]||[]).some(x=>JSON.stringify(x).includes(needle)));
}
function validateDate(date){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('請填寫有效的成交日期。');
 const d=new Date(date+'T00:00:00Z');
 if(Number.isNaN(d.valueOf())||d.toISOString().slice(0,10)!==date||date>taipeiToday())throw new Error('成交日期無效，或晚於台灣今天的日期。');
}
const CASH_TYPES=['DEPOSIT','WITHDRAW','DIVIDEND','INTEREST'];
const BENCHMARK_KEYS=['benchmarkSecurityId','benchmarkSymbol','benchmarkPrice','benchmarkPriceSource','benchmarkPriceDate','benchmarkPriceCapturedAt'];
function activeAccount(data,pid,id){return data.brokerAccounts.find(a=>a.id===id&&a.portfolioId===pid&&a.isActive!==false);}
function evaluatedPortfolios(raw,identity){return evaluateLedger(raw,identity,'').portfolios.map(p=>p.id);}
function accountCash(data,pid,accountId){return data.cashLedger.filter(r=>r.portfolioId===pid&&r.brokerAccountId===accountId).reduce((s,r)=>s+num(r.amount),0);}
function ownNet(data,id){const t=data.appTransactions.find(x=>x.id===id);return t?num(mobileAmounts(data,t).netAmount):0;}
function activeTask(task){return task&&!['CLOSED','MANUAL_CLOSED'].includes(task.status)&&num(task.remainingRebuyShares)>0;}
function benchmarkFields(b){
 // Same fields A stores on deposits and withdrawals; skipped when the quote lookup failed.
 if(!b||!(num(b.benchmarkPrice)>0))return {};
 return Object.fromEntries(BENCHMARK_KEYS.map(k=>[k,k==='benchmarkPrice'?Math.round(num(b[k])*100)/100:String(b[k]||'')]));
}
// A's 報表頁 for one portfolio and account ('all' = every account).
export function reportView(raw,identity,portfolioId,account='all'){return mobileReport(raw,identity,portfolioId,account==='all'?'ALL':account);}
export function reportPdf(raw,identity,portfolioId,account='all'){return mobileReportPdfHtml(raw,identity,portfolioId,account==='all'?'ALL':account);}
export function reportXls(raw,identity,portfolioId,account='all'){return mobileReportXls(raw,identity,portfolioId,account==='all'?'ALL':account);}
// Deposits and withdrawals still missing a 0050 benchmark price (A fills these before every report export).
export function missingBenchmarks(raw,identity,portfolioId,account='all'){
 const {data,portfolioId:pid}=evaluateLedger(raw,identity,portfolioId);
 return data.appTransactions.filter(t=>t.portfolioId===pid&&['DEPOSIT','WITHDRAW'].includes(t.transactionType)&&(account==='all'||t.brokerAccountId===account)&&!(num(t.benchmarkPrice)>0)).map(t=>({id:t.id,date:t.tradeDate}));
}
export function contentCount(data){return mobileContentCount(data);}
// The same broker fill imported twice (e.g. one CSV loaded again after the import checksum format changed): same account, day, side,
// stock, order number, execution number, shares, price and net amount. The earliest copy is kept; fills without an order number are never flagged.
function duplicateExecutions(data,pid){
 const seen=new Map(),extras=new Map();
 const rows=data.brokerExecutions.filter(x=>x.portfolioId===pid&&String(x.orderNo||'').trim()).sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||''))||String(a.id).localeCompare(String(b.id)));
 for(const x of rows){const sig=[x.brokerAccountId,x.tradeDate,x.side,x.securityId,String(x.orderNo).trim(),String(x.executionNo||'').trim(),num(x.shares),num(x.price),num(x.netAmount)].join('|');if(seen.has(sig))extras.set(x.id,seen.get(sig));else seen.set(sig,x.id);}
 return extras;
}
export function buildOperation(raw,identity,portfolioId,op){
 const {data,user,portfolioId:pid}=evaluateLedger(raw,identity,portfolioId);
 if(!canWrite(data,user,pid))throw new Error('這份投資帳本沒有編輯權限。');
 const next=clone(raw),now=new Date().toISOString();next.appTransactions=next.appTransactions||[];
 let before=null,after=null,entityId='',action='',entityType='transaction';
 if(op.kind==='acceptReconciliation'){
  // One key (檢查 → 採用) or several (A's 採用券商金額 for every pending fee/amount difference).
  const keys=[...new Set(op.keys||[op.key])];
  for(const key of keys){
   const link=data.reconciliationLinks.find(l=>acceptanceKey(l)===key&&l.portfolioId===pid);
   if(!link||!['FEE_TAX_DIFF','AMOUNT_DIFF'].includes(link.matchStatus)||!link.brokerExecutionId||link.brokerAcceptedAt)throw new Error('這筆對帳差異已改變，請重新載入。');
  }
  if(!keys.length)throw new Error('沒有可採用的差異。');
  next.acceptedBrokerDiffs={...(next.acceptedBrokerDiffs||{}),...Object.fromEntries(keys.map(k=>[k,now]))};
  action='ACCEPT_BROKER_AMOUNTS';entityType='reconciliation';entityId=keys.join(',');after={acceptedAt:now,count:keys.length};
 }else if(op.kind==='updateQuotes'){
  const rows=Array.isArray(op.quotes)?op.quotes:[];
  if(!rows.length)throw new Error('沒有可更新的報價。');
  next.marketQuotes=Array.isArray(next.marketQuotes)?next.marketQuotes:[];
  const updates=rows.map(q=>{
   const sec=data.securities.find(s=>s.id===q.securityId),price=Number(q.price);
   if(!sec||!Number.isFinite(price)||price<=0)throw new Error('報價資料不正確，這次未儲存。');
   const id='quote-'+pid+'-'+sec.id,existing=next.marketQuotes.find(x=>x.id===id);
   return {...(existing||{}),id,userId:user.id,portfolioId:pid,securityId:sec.id,symbol:sec.symbol,yahooSymbol:String(q.yahooSymbol||''),finmindStockId:String(sec.symbol||'').toUpperCase().replace(/\.(TW|TWO)$/i,''),price:Math.round(price*100)/100,quoteTime:String(q.quoteTime||now),source:String(q.source||''),sourceDate:String(q.sourceDate||''),createdAt:existing?.createdAt||now,updatedAt:now};
  });
  const ids=new Set(updates.map(q=>q.id));
  before=next.marketQuotes.filter(q=>ids.has(q.id)).map(q=>({securityId:q.securityId,price:q.price,quoteTime:q.quoteTime}));
  next.marketQuotes=next.marketQuotes.filter(q=>!ids.has(q.id)).concat(updates);
  action='UPDATE';entityType='market_quote';entityId=pid;after=updates.map(q=>({securityId:q.securityId,price:q.price,quoteTime:q.quoteTime,source:q.source}));
 }else if(op.kind==='closeRebuy'){
  const ids=[...new Set((op.sellIds||[]).map(String))];
  const tasks=ids.map(id=>data.rebuyTasks.find(t=>t.sellTransactionId===id&&t.portfolioId===pid));
  if(!ids.length||tasks.some(t=>!activeTask(t)))throw new Error('這筆買回計畫已改變，請重新載入。');
  next.manualClosedRebuySellIds=[...new Set([...(next.manualClosedRebuySellIds||[]),...ids])];
  action='MANUAL_CLOSE';entityType='rebuy_task_group';entityId=ids.join(',');after={sellIds:ids};
 }else if(op.kind==='createSecurity'){
  // Same record A's handleSecurityCreate writes.
  const f=op.fields||{},symbol=String(f.symbol||'').trim().toUpperCase(),name=String(f.name||'').trim().slice(0,80)||symbol,market=String(f.market||'TW').trim().toUpperCase();
  if(!/^[0-9A-Z][0-9A-Z.\-]{0,14}$/.test(symbol))throw new Error('請輸入股票代號（英文或數字）。');
  if(data.securities.some(x=>String(x.symbol||'').toUpperCase()===symbol))throw new Error('這個股票代號已存在。');
  if(!['TW','TWO','US'].includes(market))throw new Error('市場請選上市、上櫃或美股。');
  entityId='security-b-'+crypto.randomUUID();
  after={id:entityId,userId:user.id,symbol,name,market,currency:'TWD',yahooSymbol:String(f.yahooSymbol||'').trim().toUpperCase(),assetType:mobileAssetType(symbol,name,f.assetType),createdAt:now,updatedAt:now};
  next.securities=[...(next.securities||[]),after];action='CREATE';entityType='security';
 }else if(op.kind==='upsertCashTransfer'||op.kind==='deleteCashTransfer'){
  // A's 現金轉帳: moves cash between broker accounts without counting as a deposit.
  next.accountTransfers=next.accountTransfers||[];
  const old=op.id?next.accountTransfers.find(x=>x.id===op.id&&x.portfolioId===pid):null;
  if(op.id&&!old)throw new Error('找不到這筆轉帳，請重新載入。');
  before=old?clone(old):null;entityType='account_transfer';
  if(op.kind==='deleteCashTransfer'){next.accountTransfers=next.accountTransfers.filter(x=>x.id!==old.id);action='DELETE';entityId=old.id;}
  else{
   const f=op.fields||{},amount=Number(f.amount),fee=Number(f.fee||0),from=activeAccount(data,pid,f.from),to=activeAccount(data,pid,f.to);
   validateDate(f.date);
   if(!from||!to)throw new Error('請選擇這份帳本的轉出與轉入帳戶。');
   if(from.id===to.id)throw new Error('轉出與轉入帳戶不可相同。');
   if(!Number.isFinite(amount)||amount<=0||!Number.isFinite(fee)||fee<0)throw new Error('金額必須大於 0，費用不可為負數。');
   const restored=old&&old.fromBrokerAccountId===from.id?num(old.amount)+num(old.fee):old&&old.toBrokerAccountId===from.id?-num(old.amount):0;
   if(amount+fee>accountCash(data,pid,from.id)+restored)throw new Error('轉出帳戶現金不足。');
   entityId=old?.id||'cash-transfer-b-'+crypto.randomUUID();
   after={...(old||{}),id:entityId,portfolioId:pid,fromBrokerAccountId:from.id,toBrokerAccountId:to.id,transferDate:f.date,amount,fee,note:String(f.note||'').trim().slice(0,4000),createdAt:old?.createdAt||now,updatedAt:now};
   next.accountTransfers=old?next.accountTransfers.map(x=>x.id===old.id?after:x):[...next.accountTransfers,after];action=old?'UPDATE':'CREATE';
  }
 }else if(op.kind==='upsertPositionTransfer'||op.kind==='deletePositionTransfer'){
  // A's 股票轉戶 is a record of shares moved between accounts with their original cost; like A it does not move inventory lots.
  next.positionTransfers=next.positionTransfers||[];
  const old=op.id?next.positionTransfers.find(x=>x.id===op.id&&x.portfolioId===pid):null;
  if(op.id&&!old)throw new Error('找不到這筆轉戶，請重新載入。');
  before=old?clone(old):null;entityType='position_transfer';
  if(op.kind==='deletePositionTransfer'){next.positionTransfers=next.positionTransfers.filter(x=>x.id!==old.id);action='DELETE';entityId=old.id;}
  else{
   const f=op.fields||{},shares=Number(f.shares),basis=Number(f.basis),from=activeAccount(data,pid,f.from),to=activeAccount(data,pid,f.to),security=data.securities.find(x=>x.id===f.code);
   validateDate(f.date);
   if(!from||!to||!security)throw new Error('請選擇股票與這份帳本的轉出、轉入帳戶。');
   if(from.id===to.id)throw new Error('轉出與轉入帳戶不可相同。');
   if(!Number.isInteger(shares)||shares<=0||!Number.isFinite(basis)||basis<0)throw new Error('股數必須是正整數，原始成本不可為負數。');
   entityId=old?.id||'position-transfer-b-'+crypto.randomUUID();
   after={...(old||{}),id:entityId,portfolioId:pid,securityId:security.id,fromBrokerAccountId:from.id,toBrokerAccountId:to.id,transferDate:f.date,shares,originalCostBasis:basis,note:String(f.note||'').trim().slice(0,4000),createdAt:old?.createdAt||now,updatedAt:now};
   next.positionTransfers=old?next.positionTransfers.map(x=>x.id===old.id?after:x):[...next.positionTransfers,after];action=old?'UPDATE':'CREATE';
  }
 }else if(op.kind==='upsertPortfolio'){
  const f=op.fields||{},name=String(f.name||'').trim().slice(0,80),old=op.id?next.portfolios.find(x=>x.id===op.id):null;
  if(!name)throw new Error('請輸入帳本名稱。');
  if(op.id&&(!old||!evaluatedPortfolios(raw,identity).includes(old.id)))throw new Error('找不到這份帳本。');
  if(old&&!canWrite(data,user,old.id))throw new Error('這份投資帳本沒有編輯權限。');
  entityType='portfolio';
  if(old){before=clone(old);after={...old,name,updatedAt:now};next.portfolios=next.portfolios.map(x=>x.id===old.id?after:x);entityId=old.id;action='UPDATE';}
  else{
   entityId='portfolio-b-'+crypto.randomUUID();after={id:entityId,userId:user.id,name,baseCurrency:'TWD',createdAt:now,updatedAt:now};
   next.portfolios=[...next.portfolios,after];next.portfolioMembers=[...(next.portfolioMembers||[]),{id:'member-b-'+crypto.randomUUID(),portfolioId:entityId,userId:user.id,role:'OWNER',createdAt:now,updatedAt:now}];
   next.settings={...(next.settings||{}),portfolios:{...(next.settings?.portfolios||{}),[entityId]:mobileSettings({settings:{portfolios:{}}},'')}};action='CREATE';
  }
 }else if(op.kind==='upsertBrokerAccount'||op.kind==='deleteBrokerAccount'){
  const old=op.id?next.brokerAccounts.find(x=>x.id===op.id&&x.portfolioId===pid):null;
  if(op.id&&!old)throw new Error('找不到這個券商帳戶。');
  before=old?clone(old):null;entityType='broker_account';
  if(op.kind==='deleteBrokerAccount'){
   if(accountUsed(data,old.id))throw new Error('這個帳戶已有交易、匯入或轉帳紀錄，不能刪除；可以改成停用。');
   next.brokerAccounts=next.brokerAccounts.filter(x=>x.id!==old.id);next.cashAccounts=(next.cashAccounts||[]).filter(x=>x.brokerAccountId!==old.id);action='DELETE';entityId=old.id;
  }else{
   const f=op.fields||{},name=String(f.name||'').trim().slice(0,80),broker=data.brokers.find(b=>b.id===(old?.brokerId||f.brokerId));
   if(!name)throw new Error('請輸入帳戶名稱。');
   if(!broker)throw new Error('請選擇券商。');
   const active=f.active!==false&&f.active!=='false',isDefault=!!f.isDefault&&f.isDefault!=='false'&&active;
   if(old&&!active&&scoped(data,pid,'brokerAccounts').filter(a=>a.isActive!==false&&a.id!==old.id).length===0)throw new Error('至少要保留一個啟用中的帳戶。');
   entityId=old?.id||'broker-account-b-'+crypto.randomUUID();
   after={...(old||{userId:user.id,portfolioId:pid,brokerId:broker.id,currency:'TWD',createdAt:now}),id:entityId,accountName:name,accountNoMasked:String(f.masked||'').trim().slice(0,40),branchName:String(f.branch||'').trim().slice(0,40),isDefault,isActive:active,updatedAt:now};
   next.brokerAccounts=(old?next.brokerAccounts.map(x=>x.id===old.id?after:x):[...next.brokerAccounts,after]).map(x=>isDefault&&x.portfolioId===pid&&x.id!==entityId&&x.isDefault?{...x,isDefault:false,updatedAt:now}:x);
   if(!old&&Array.isArray(next.cashAccounts))next.cashAccounts.push({id:'cash-account-b-'+crypto.randomUUID(),portfolioId:pid,brokerAccountId:entityId,currency:'TWD',accountType:'BROKER_SETTLEMENT',name:broker.name+'交割戶',isActive:true,createdAt:now,updatedAt:now});
   action=old?'UPDATE':'CREATE';
  }
 }else if(op.kind==='saveBrokerFees'){
  const f=op.fields||{},broker=data.brokers.find(b=>b.id===f.brokerId),keys=['feeRate','discountRate','minFee','stockSellTaxRate','etfSellTaxRate'];
  if(!broker)throw new Error('請選擇券商。');
  const fees=Object.fromEntries(keys.map(k=>[k,Number(f[k])]));
  if(keys.some(k=>!Number.isFinite(fees[k])||fees[k]<0)||fees.feeRate>0.01||fees.discountRate>1||fees.stockSellTaxRate>0.01||fees.etfSellTaxRate>0.01)throw new Error('費率數字不正確，請用小數（例如 0.001425、0.28）。');
  fees.sellTaxRate=fees.stockSellTaxRate;
  const current=next.settings?.portfolios?.[pid]||{};before=clone(current.brokerFees?.[broker.id]||null);
  next.settings={...(next.settings||{}),portfolios:{...(next.settings?.portfolios||{}),[pid]:{...mobileSettings(data,pid),...current,brokerFees:{...(current.brokerFees||{}),[broker.id]:fees}}}};
  action='UPDATE';entityType='broker_fee_settings';entityId=pid;after={[broker.id]:fees};
 }else if(op.kind==='saveDriveImport'){
  // B only: the Drive folder that holds broker CSVs, and the file-name keyword for each broker account (e.g. jack, penny).
  const f=op.fields||{},folderId=String(f.folderId||'').trim(),keywords={};
  if(!/^[A-Za-z0-9_-]{10,}$/.test(folderId))throw new Error('請貼上 Google Drive 資料夾連結。');
  for(const [id,kw] of Object.entries(f.keywords||{})){
   if(!data.brokerAccounts.some(a=>a.id===id&&a.portfolioId===pid))throw new Error('券商帳戶已改變，請重新載入。');
   const k=String(kw||'').trim().slice(0,40);if(k)keywords[id]=k;
  }
  const lower=Object.values(keywords).map(k=>k.toLowerCase());
  if(new Set(lower).size!==lower.length)throw new Error('每個帳戶的關鍵字要不一樣。');
  before=clone(next.settings?.driveImport?.[pid]||null);after={folderId,folderName:String(f.folderName||'').slice(0,200),keywords,updatedAt:now};
  next.settings={...(next.settings||{}),driveImport:{...(next.settings?.driveImport||{}),[pid]:after}};
  action='UPDATE';entityType='drive_import_settings';entityId=pid;
 }else if(op.kind==='saveSettings'){
  const f=op.fields||{},symbol=String(f.defaultSecurity||'0050').trim().toUpperCase(),nums=['defaultRebuyOffset','coreHoldingShares','priceTolerance','amountTolerance'];
  if(!data.securities.some(x=>String(x.symbol||'').toUpperCase()===symbol))throw new Error('預設股票 '+symbol+' 不在股票清單，請先新增。');
  if(nums.some(k=>!Number.isFinite(Number(f[k]))||Number(f[k])<0))throw new Error('設定數字不可為負數。');
  if(!['BY_SHARES','BY_GROSS_AMOUNT'].includes(f.feeAllocationMethod))throw new Error('費稅分攤方式不正確。');
  const current={...mobileSettings(data,pid),...(next.settings?.portfolios?.[pid]||{})};before=clone(current);
  after={...current,defaultSecurity:symbol,...Object.fromEntries(nums.map(k=>[k,Number(f[k])])),feeAllocationMethod:f.feeAllocationMethod,defaultRebuyScope:'SAME_BROKER_ACCOUNT'};
  next.settings={...(next.settings||{}),portfolios:{...(next.settings?.portfolios||{}),[pid]:after}};
  action='UPDATE';entityType='portfolio_settings';entityId=pid;
 }else if(op.kind==='updateSecurity'||op.kind==='deleteSecurity'){
  const old=(next.securities||[]).find(x=>x.id===op.id);
  if(!old)throw new Error('找不到這檔股票。');
  before=clone(old);entityType='security';entityId=old.id;
  if(op.kind==='deleteSecurity'){
   if(data.appTransactions.some(t=>t.securityId===old.id)||data.brokerExecutions.some(x=>x.securityId===old.id)||data.positionTransfers.some(x=>x.securityId===old.id))throw new Error('這檔股票已有交易、券商紀錄或轉戶資料，不能刪除。可以改名或調整 Yahoo 代號。');
   next.securities=next.securities.filter(x=>x.id!==old.id);next.marketQuotes=(next.marketQuotes||[]).filter(q=>q.securityId!==old.id);action='DELETE';
  }else{
   const f=op.fields||{},symbol=String(f.symbol||'').trim().toUpperCase(),name=String(f.name||'').trim().slice(0,80)||symbol,market=String(f.market||'TW').trim().toUpperCase();
   if(!/^[0-9A-Z][0-9A-Z.\-]{0,14}$/.test(symbol))throw new Error('請輸入股票代號（英文或數字）。');
   if(data.securities.some(x=>x.id!==old.id&&String(x.symbol||'').toUpperCase()===symbol))throw new Error('這個股票代號已存在。');
   if(!['TW','TWO','US'].includes(market))throw new Error('市場請選上市、上櫃或美股。');
   after={...old,symbol,name,market,yahooSymbol:String(f.yahooSymbol||'').trim().toUpperCase(),assetType:mobileAssetType(symbol,name,f.assetType),updatedAt:now};
   next.securities=next.securities.map(x=>x.id===old.id?after:x);action='UPDATE';
  }
 }else if(op.kind==='importFile'){
  // A's 匯入: broker CSV (國泰 format, duplicates skipped by checksum) or a JSON ledger. Only new records are appended.
  const text=String(op.text||'');
  if(!text.trim())throw new Error('檔案是空的。');
  if(text.length>5000000)throw new Error('檔案太大（超過 5MB），請分批匯入。');
  const imported=mobileImport(raw,identity,pid,{accountId:op.account,text,sourceType:op.sourceType==='JSON_LEDGER'?'JSON_LEDGER':'BROKER_CSV',filename:op.filename});
  for(const key of ['securities','importBatches','rawImportRows','brokerExecutions','appTransactions']){
   const have=new Set((next[key]||[]).map(x=>x.id));next[key]=[...(next[key]||[]),...imported[key].filter(x=>!have.has(x.id))];
  }
  const batch=imported.importBatches.at(-1);
  action='IMPORT';entityType='import_batch';entityId=batch.id;after={sourceType:batch.sourceType,sourceFilename:batch.sourceFilename,rowCount:batch.rowCount,createdCount:batch.createdCount,duplicateCount:batch.duplicateCount};
 }else if(op.kind==='deleteImportBatch'){
  // Same scope as A's handleDeleteImportBatch: a CSV batch removes its broker records; a JSON batch also removes the trades it created.
  const batch=(next.importBatches||[]).find(b=>b.id===op.id&&b.portfolioId===pid);
  if(!batch)throw new Error('找不到這個匯入批次，請重新載入。');
  const rows=(next.rawImportRows||[]).filter(r=>r.importBatchId===batch.id),jsonIds=new Set(rows.map(r=>String(r.rawJson?.id||'').trim()).filter(Boolean));
  const execIds=new Set((next.brokerExecutions||[]).filter(x=>x.importBatchId===batch.id).map(x=>x.id));
  const txIds=new Set(next.appTransactions.filter(t=>t.importBatchId===batch.id||(batch.sourceType==='JSON_LEDGER'&&t.sourceType==='JSON_IMPORT'&&jsonIds.has(t.sourceTransactionId||''))).map(t=>t.id));
  const outside=next.appTransactions.find(t=>!txIds.has(t.id)&&['linkedBuyTransactionId','sourceInventoryLotId','rebuySellTransactionIds','rebuyCycleId'].some(k=>String(t[k]||'').split(/[,\s]+/).some(id=>txIds.has(id))));
  if(outside)throw new Error('這批匯入的交易被 '+outside.tradeDate+' 的其他交易引用，請先處理那筆交易。');
  const accepted=mobileClearAcceptedDiffs(data,execIds,txIds);
  before={...clone(batch),acceptedBrokerDiffs:clone(next.acceptedBrokerDiffs||{})};
  next.acceptedBrokerDiffs=accepted;
  next.importBatches=next.importBatches.filter(b=>b.id!==batch.id);next.rawImportRows=(next.rawImportRows||[]).filter(r=>r.importBatchId!==batch.id);next.brokerExecutions=(next.brokerExecutions||[]).filter(x=>x.importBatchId!==batch.id);
  if(txIds.size){next.appTransactions=next.appTransactions.filter(t=>!txIds.has(t.id));next.manualClosedRebuySellIds=(next.manualClosedRebuySellIds||[]).filter(id=>!txIds.has(id));}
  action='DELETE';entityType='import_batch';entityId=batch.id;after={sourceType:batch.sourceType,brokerExecutionCount:execIds.size,appTransactionCount:txIds.size,rawRowCount:rows.length};
 }else if(op.kind==='removeDuplicateExecutions'){
  // Removes only broker records that are exact repeats of an earlier import; the earlier copy and every trade stay.
  const ids=[...new Set(op.ids||[])],extras=duplicateExecutions(data,pid);
  if(!ids.length)throw new Error('沒有重複的券商紀錄。');
  if(ids.some(id=>!extras.has(id)))throw new Error('這些券商紀錄已改變，請重新載入。');
  const execIds=new Set(ids),removed=(next.brokerExecutions||[]).filter(x=>execIds.has(x.id));
  before={brokerExecutions:clone(removed),acceptedBrokerDiffs:clone(next.acceptedBrokerDiffs||{})};
  next.acceptedBrokerDiffs=mobileClearAcceptedDiffs(data,execIds,new Set());
  next.brokerExecutions=(next.brokerExecutions||[]).filter(x=>!execIds.has(x.id));
  action='DELETE_DUPLICATE_BROKER_EXECUTIONS';entityType='broker_execution';entityId=ids.join(',');after={count:ids.length,kept:ids.map(id=>extras.get(id))};
 }else if(op.kind==='backfillBenchmarks'){
  // A's backfillMissingBenchmarkPrices: only deposits and withdrawals without a price, and only when the lookup found one.
  const rows=(Array.isArray(op.rows)?op.rows:[]).map(r=>({id:r.id,fields:benchmarkFields(r.fields)})).filter(r=>Object.keys(r.fields).length);
  if(!rows.length)throw new Error('查不到 0050 基準價，這次沒有回補。');
  const ids=new Set();
  for(const r of rows){
   const t=next.appTransactions.find(x=>x.id===r.id&&x.portfolioId===pid);
   if(!t||!['DEPOSIT','WITHDRAW'].includes(t.transactionType)||num(t.benchmarkPrice)>0)throw new Error('入出金紀錄已改變，請重新載入。');
   Object.assign(t,r.fields,{updatedAt:now});ids.add(t.id);
  }
  action='BACKFILL_BENCHMARK';entityId=[...ids].join(',');after={count:ids.size};
 }else if(op.kind==='restoreBackup'){
  // A's 匯入備份: the file's data replaces this user's ledger (checksum checked before this point; a safety backup is downloaded first).
  if(!op.state||typeof op.state!=='object'||!Array.isArray(op.state.appTransactions))throw new Error('備份檔內容不正確。');
  const restored=mobileRestore(raw,identity,pid,clone(op.state));
  Object.assign(next,clone(restored));
  before={count:mobileContentCount(raw)};after={count:mobileContentCount(restored),createdAt:String(op.createdAt||''),source:String(op.source||'')};
  action='RESTORE_BACKUP';entityType='ledger';entityId=pid;
 }else if(op.kind==='createTemplate'||op.kind==='deleteTemplate'){
  next.importTemplates=Array.isArray(next.importTemplates)?next.importTemplates:clone(data.importTemplates||[]);
  entityType='broker_import_template';
  if(op.kind==='deleteTemplate'){
   const t=next.importTemplates.find(x=>x.id===op.id);
   if(!t)throw new Error('找不到這個模板。');
   if(t.isDefault||t.id==='tpl-cathay-default')throw new Error('預設的國泰模板不能刪除。');
   before=clone(t);next.importTemplates=next.importTemplates.filter(x=>x.id!==t.id);action='DELETE';entityId=t.id;
  }else{
   const f=op.fields||{},name=String(f.name||'').trim().slice(0,80),broker=data.brokers.find(b=>b.id===f.brokerId);
   if(!name||!broker)throw new Error('請輸入模板名稱並選擇券商。');
   let mapping=clone((data.importTemplates||[]).find(t=>t.id==='tpl-cathay-default')?.columnMapping||{});
   if(String(f.mapping||'').trim()){try{mapping=JSON.parse(f.mapping);}catch{throw new Error('欄位對應要是 JSON，例如 {"tradeDate":"日期"}。');}if(!mapping||typeof mapping!=='object'||Array.isArray(mapping))throw new Error('欄位對應要是 JSON 物件。');}
   entityId='tpl-b-'+crypto.randomUUID();
   after={id:entityId,brokerId:broker.id,templateName:name,fileType:'CSV',encoding:'UTF-8-BOM',headerDetectionRule:'find mapped header',dateFormat:String(f.dateFormat||'YYYY/MM/DD'),numberFormat:'comma',sideBuyValues:['現買','買進'],sideSellValues:['現賣','賣出'],columnMapping:mapping,isDefault:false,createdAt:now,updatedAt:now};
   next.importTemplates=[...next.importTemplates,after];action='CREATE';
  }
 }else if(op.kind==='updateMatch'){
  // A's "儲存配對": choose which buys a sell is matched to, and optionally match fewer shares.
  const old=next.appTransactions.find(t=>t.id===op.id);
  if(!old||old.portfolioId!==pid||old.userId!==user.id||old.transactionType!=='SELL'||old.borrowRebuyType)throw new Error('只能調整一般賣出的配對。');
  const sec=data.securities.find(x=>x.id===old.securityId),options=mobileSellOptions(data,old.brokerAccountId,sec?.symbol||'',old.tradeDate,old.id);
  const ids=[...new Set(String(op.sources||'').split(/[,\s]+/).filter(Boolean))],chosen=ids.map(id=>options.find(o=>o.value===id));
  if(!ids.length)throw new Error('請至少選一批買進。');
  if(chosen.some(x=>!x))throw new Error('選擇的庫存無效，請重新檢查。');
  const shares=op.shares===''||op.shares==null?num(old.shares):Number(op.shares),available=chosen.reduce((t,o)=>t+num(o.shares),0);
  if(!Number.isInteger(shares)||shares<=0||shares>num(old.shares))throw new Error('配對股數要介於 1 到 '+num(old.shares)+' 股。');
  if(shares>available)throw new Error('選定的買進只有 '+available+' 股可配對。');
  before=clone(old);entityId=old.id;
  after={...old,linkedBuyTransactionId:chosen.map(o=>o.value).join(','),manualMatchedShares:shares,updatedAt:now};
  next.appTransactions=next.appTransactions.map(t=>t.id===old.id?after:t);
  action='UPDATE_MATCH';entityType='app_transaction';
 }else if(op.kind==='createCostExchange'){
  const f=op.fields||{},date=String(f.date||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>taipeiToday())throw new Error('成本交換日期無效，或晚於今天。');
  const {source,targets,plan}=exchangePlan(data,pid,f);
  const latest=[source,...targets.map(t=>t.lot)].map(l=>l.buyDate).filter(Boolean).sort().at(-1)||'';
  if(date<latest)throw new Error('成本交換日期不可早於任何受影響庫存的買進日期。');
  entityId='cost-exchange-b-'+crypto.randomUUID();
  after={id:entityId,userId:user.id,portfolioId:pid,brokerAccountId:source.brokerAccountId,securityId:source.securityId,sourceBuyTransactionId:source.buyTransactionId,exchangeDate:date,sourceShares:plan.sourceShares,sourceOriginalPrice:plan.sourceCurrentPrice,externalPrice:plan.externalPrice,sourceFinalPrice:plan.sourceFinalPrice,externalSwapCostDelta:plan.externalSwapCostDelta,redistributedAmount:plan.redistributedAmount,targetAdjustments:plan.targetAdjustments,lotAdjustments:plan.lotAdjustments,externalAccountLabel:String(f.label||'').trim().slice(0,80),createdAt:now,updatedAt:now};
  next.inventoryCostExchanges=[...(next.inventoryCostExchanges||[]),after];action='CREATE';entityType='inventory_cost_exchange';
 }else if(op.kind==='deleteCostExchange'){
  const exchange=(next.inventoryCostExchanges||[]).find(x=>x.id===op.id&&x.portfolioId===pid);
  if(!exchange)throw new Error('找不到這筆成本交換，請重新載入。');
  const lots=new Map(mobileInventory(data).map(l=>[l.buyTransactionId,l]));
  if((exchange.lotAdjustments||[]).some(a=>!mobileExchangeEligible(lots.get(a.buyTransactionId))))throw new Error('這筆交換涉及的庫存已有賣出或借券，為保護歷史損益不能撤銷。');
  next.inventoryCostExchanges=next.inventoryCostExchanges.filter(x=>x.id!==exchange.id);
  before=clone(exchange);action='DELETE';entityType='inventory_cost_exchange';entityId=exchange.id;
 }else{
  const old=op.id?next.appTransactions.find(t=>t.id===op.id):null;
  if(op.id&&(!old||old.portfolioId!==pid||old.userId!==user.id))throw new Error('找不到這筆交易，或沒有編輯權限。');
  const oldCash=old&&CASH_TYPES.includes(old.transactionType);
  if(old&&!oldCash&&!['BUY','SELL'].includes(old.transactionType))throw new Error('這筆交易請在 A 版修改。');
  before=old?clone(old):null;
  if(op.kind==='deleteTransaction'){
   if(!old)throw new Error('找不到交易。');
   if(referenced(raw,old,true))throw new Error(old.borrowRebuyType==='BORROW_SELL'?'這筆借券賣出已有回補紀錄，請先刪除回補。':'這筆交易被其他賣出、借券、買回或庫存移轉引用，請先處理那些紀錄。');
   next.appTransactions=next.appTransactions.filter(t=>t.id!==old.id);action='DELETE_TRANSACTION';entityId=old.id;
   // Like A: deleting a buy also removes the cost exchanges that adjusted it.
   next.inventoryCostExchanges=(next.inventoryCostExchanges||[]).filter(x=>!(x.lotAdjustments||[]).some(a=>a.buyTransactionId===old.id));
  }else if(op.kind==='upsertCash'){
   const f=op.fields||{},type=String(f.cashType||'').toUpperCase(),amount=Number(f.amount);
   validateDate(f.date);
   if(!CASH_TYPES.includes(type))throw new Error('請選擇入金、出金、股息或利息。');
   if(old&&!oldCash)throw new Error('這筆不是現金交易。');
   if(old&&old.transactionType!==type)throw new Error('不能更改交易類型。');
   if(!Number.isFinite(amount)||amount<=0)throw new Error('金額必須大於 0。');
   const account=data.brokerAccounts.find(a=>a.id===f.account&&a.portfolioId===pid&&a.isActive!==false);
   if(!account)throw new Error('請選擇這份帳本的券商帳戶。');
   const defaultSymbol=String(mobileSettings(data,pid).defaultSecurity||'0050').toUpperCase();
   const security=data.securities.find(s=>String(s.symbol||'').toUpperCase()===defaultSymbol)||(old&&data.securities.find(s=>s.id===old.securityId));
   if(!security)throw new Error('帳本找不到預設股票 '+defaultSymbol+'，請先在 A 版建立。');
   if(type==='WITHDRAW'){
    const restored=old&&old.brokerAccountId===account.id?-ownNet(data,old.id):0;
    if(amount>accountCash(data,pid,account.id)+restored)throw new Error('帳上現金不足，出金金額不能超過這個帳戶的現金。');
   }
   const moved=!old||old.tradeDate!==f.date||old.brokerAccountId!==account.id;
   const bench=['DEPOSIT','WITHDRAW'].includes(type)?benchmarkFields(op.benchmark):{};
   entityId=old?.id||'tx-b-'+crypto.randomUUID();
   after={...(old||{sourceType:'MANUAL',sourceTransactionId:'',isConfirmed:true}),...(moved&&old?Object.fromEntries(BENCHMARK_KEYS.map(k=>[k,''])):{}),...bench,id:entityId,userId:user.id,portfolioId:pid,brokerId:account.brokerId,brokerAccountId:account.id,securityId:security.id,transactionType:type,tradeDate:f.date,tradeTime:'',price:amount,shares:0,fee:0,tax:0,strategyCategory:['INTEREST','DIVIDEND'].includes(type)?type:'CORE',linkedBuyTransactionId:'',rebuySellTransactionIds:'',buyIntent:'',borrowRebuyType:'',sourceInventoryLotId:'',rebuyCycleId:'',note:String(f.note||'').slice(0,4000),createdAt:old?.createdAt||now,updatedAt:now};
   after=mobileNormalizeTransaction(after);
   if(old)next.appTransactions=next.appTransactions.map(t=>t.id===old.id?after:t);else next.appTransactions.push(after);
   action=old?'UPDATE_TRANSACTION':'CREATE_TRANSACTION';
  }else if(op.kind==='upsertTransaction'){
   const f=op.fields;validateDate(f.date);
   if(oldCash)throw new Error('這筆是現金交易，請用現金表單修改。');
   if(f.time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(f.time))throw new Error('請填寫有效的成交時間，或留白。');
   const qty=Number(f.qty),price=Number(f.price),fee=Number(f.fee),tax=Number(f.tax);
   if(!Number.isInteger(qty)||qty<=0||!Number.isFinite(price)||price<=0||!Number.isFinite(fee)||fee<0||!Number.isFinite(tax)||tax<0)throw new Error('股數、成交價或費用不正確。');
   const type=f.type==='sell'?'SELL':f.type==='buy'?'BUY':'';
   if(!type||(old&&old.transactionType!==type))throw new Error('不能更改交易類型。');
   const account=data.brokerAccounts.find(a=>a.id===f.account&&a.portfolioId===pid&&a.isActive!==false),security=data.securities.find(s=>s.id===f.code);
   if(!account||!security)throw new Error('請選擇這份帳本的券商帳戶與股票。');
   const placeChanged=old&&(['tradeDate','brokerAccountId','securityId'].some((k,i)=>old[k]!==[f.date,f.account,f.code][i])||num(old.shares)!==qty);
   const borrow=old?String(old.borrowRebuyType||''):type==='SELL'&&f.borrow==='sell'?'BORROW_SELL':type==='BUY'&&f.cycle?'REBUY_FILL':'';
   const sourceField=borrow==='BORROW_SELL'?'sourceInventoryLotId':'linkedBuyTransactionId';
   const financialChanged=old&&(placeChanged||num(old.price)!==price||num(old.fee)!==fee||num(old.tax)!==tax||(type==='SELL'&&Object.hasOwn(f,'sources')&&String(f.sources)!==String(old[sourceField]||'')));
   // A lets a cost-exchanged buy change size or price and keeps the old adjustment; B asks for the exchange to be undone first.
   if(type==='BUY'&&old&&(placeChanged||num(old.price)!==price)&&(next.inventoryCostExchanges||[]).some(x=>x.sourceBuyTransactionId===old.id||(x.lotAdjustments||[]).some(a=>a.buyTransactionId===old.id)))throw new Error('這筆買進做過成本交換。請先在庫存頁撤銷成本交換，再修改日期、帳戶、股數或價格。');
   // Borrow sells and borrow buy-backs follow A's quick entry rules (validateBorrowSellSourceLots and the cycle checks).
   let borrowSources=old?.sourceInventoryLotId||'',cycleId=old?.rebuyCycleId||'';
   if(borrow==='BORROW_SELL'&&(!old||financialChanged)){
    borrowSources=mobileValidateBorrow(data,Object.hasOwn(f,'sources')?f.sources:borrowSources,qty,account,security.id,pid,old?.id||'',f.date);
    const cycle=old&&(data.borrowRebuyCycles||[]).find(c=>c.id===old.id);
    if(cycle&&qty<num(cycle.totalRebuyQty))throw new Error('已回補 '+cycle.totalRebuyQty+' 股，借券賣出股數不能少於這個數字。');
    if(cycle&&(cycle.rebuyMatches||[]).some(m=>m.rebuyDate<f.date))throw new Error('已有比這個日期更早的回補，請先調整回補日期。');
   }
   if(borrow==='REBUY_FILL'){
    if(!old)cycleId=String(f.cycle);
    const cycle=(data.borrowRebuyCycles||[]).find(c=>c.id===cycleId),sell=data.appTransactions.find(t=>t.id===cycleId);
    if(!cycle||!sell||sell.portfolioId!==pid)throw new Error('找不到對應的借券任務，請重新載入。');
    if(sell.securityId!==security.id||sell.brokerAccountId!==account.id)throw new Error('借券回補的股票與帳戶要和借券賣出相同。');
    if(cycle.sellDate>f.date)throw new Error('借券回補日期不可早於原賣出日期。');
    const limit=num(cycle.remainingRebuyQty)+(old?num(old.shares):0);
    if(qty>limit)throw new Error('回補股數 ('+qty+' 股) 不可超過待回補股數 ('+limit+' 股)。');
   }
   if(borrow&&f.rebuyIds&&!old)throw new Error('借券交易不能同時配對買回計畫。');
   let rebuyIds=old?String(old.rebuySellTransactionIds||''):'';
   if(type==='BUY'&&!old&&f.rebuyIds)rebuyIds=String(f.rebuyIds);
   const rebuyList=rebuyIds.split(/[,\s]+/).filter(Boolean);
   if(type==='BUY'&&rebuyList.length&&(!old||financialChanged)){
    for(const sellId of rebuyList){
     const task=data.rebuyTasks.find(t=>t.sellTransactionId===sellId);
     const alreadyLinked=!!old&&String(old.rebuySellTransactionIds||'').split(/[,\s]+/).includes(sellId);
     if(!task||(!alreadyLinked&&!activeTask(task)))throw new Error('選到的買回計畫不存在或已完成，請重新載入。');
     if(task.portfolioId!==pid||task.securityId!==security.id||task.brokerAccountId!==account.id)throw new Error('買回的股票與帳戶要和原本賣出相同。');
     if(task.sellDate>f.date)throw new Error('買回日期不可早於原賣出日期。');
    }
   }
   let sources=old?.linkedBuyTransactionId||'';
   if(type==='SELL'&&!borrow&&(!old||financialChanged)){
    const options=mobileSellOptions(data,account.id,security.symbol,f.date,old?.id||'');
    const requested=String(f.sources||'').split(',').filter(Boolean);
    const chosen=Object.hasOwn(f,'sources')?requested.map(id=>options.find(l=>l.value===id)):minimalLots(options,qty);
    if(chosen.some(x=>!x)||new Set(chosen.map(x=>x.value)).size!==chosen.length)throw new Error('選擇的庫存無效，請重新檢查。');
    const available=chosen.reduce((s,l)=>s+num(l.shares),0);
    if(qty>available)throw new Error('成交日期前選定庫存可賣 '+available+' 股，請調整股數或庫存。');
    sources=chosen.map(l=>l.value).join(',');
   }
   if(type==='SELL'&&qty*price<fee+tax)throw new Error('費用不能高於賣出成交金額。');
   if(type==='BUY'&&(!old||financialChanged)){
    const restored=old&&old.brokerAccountId===account.id?-ownNet(data,old.id):0;
    if(qty*price+fee+tax>accountCash(data,pid,account.id)+restored)throw new Error('帳上現金不足，請先記錄入金或調整金額。');
   }
   const category=rebuyList.length?'REBUY':CATEGORIES.includes(f.category)?f.category:(old?.strategyCategory||'LONG_TERM');
   entityId=old?.id||'tx-b-'+crypto.randomUUID();
   after={...(old||{sourceType:'MANUAL'}),borrowRebuyType:borrow,sourceInventoryLotId:borrow==='BORROW_SELL'?borrowSources:'',rebuyCycleId:borrow==='REBUY_FILL'?cycleId:'',id:entityId,userId:user.id,portfolioId:pid,brokerId:account.brokerId,brokerAccountId:account.id,securityId:security.id,transactionType:type,tradeDate:f.date,tradeTime:f.time||'',price,shares:qty,fee,tax,strategyCategory:category,linkedBuyTransactionId:type==='SELL'?(borrow?'':sources):(old?.linkedBuyTransactionId||''),rebuySellTransactionIds:type==='BUY'?rebuyList.join(','):'',buyIntent:type==='BUY'?(rebuyList.length?'REBUY':(old?.buyIntent||'NEW')):'',note:String(f.note||'').slice(0,4000),createdAt:old?.createdAt||now,updatedAt:now};
   after=mobileNormalizeTransaction(after);
   if(old)next.appTransactions=next.appTransactions.map(t=>t.id===old.id?after:t);else next.appTransactions.push(after);
   action=old?'UPDATE_TRANSACTION':'CREATE_TRANSACTION';
  }else throw new Error('不支援的帳本操作。');
 }
 // Keep every legacy and unknown field; the B interface never exports its presentation model.
 next.auditLogs=[...(next.auditLogs||[]),{id:'audit-b-'+crypto.randomUUID(),userId:user.id,portfolioId:pid,action,entityType,entityId,before,after,createdAt:now,source:'MOBILE_B'}];
 const candidate=evaluateLedger(next,identity,pid).data;
 // Editing amounts recomputes matching (as in A), but never leaves another sell without the inventory it had.
 const matched=(d,id)=>d.sellMatches.filter(m=>m.sellTransactionId===id).reduce((s,m)=>s+num(m.matchedShares),0);
 if(op.kind==='restoreBackup')return next;
 for(const tx of data.appTransactions.filter(t=>t.transactionType==='SELL'&&!t.borrowRebuyType&&t.id!==op.id)){
  if(matched(candidate,tx.id)<matched(data,tx.id))throw new Error('修改後，'+tx.tradeDate+' 的賣出會配不到足夠庫存。請先調整那筆賣出，或在 A 版處理。');
 }
 // Borrow sells must still find the lent shares in their source lots (A's validateBorrowSellSourceLots), e.g. after a source buy shrinks.
 const lendable=(d,tx)=>{try{mobileValidateBorrow(d,tx.sourceInventoryLotId,tx.shares,{id:tx.brokerAccountId},tx.securityId,tx.portfolioId,tx.id,tx.tradeDate);return true;}catch{return false;}};
 for(const tx of data.appTransactions.filter(t=>t.transactionType==='SELL'&&t.borrowRebuyType==='BORROW_SELL'&&t.portfolioId===pid&&t.id!==op.id)){
  const now2=candidate.appTransactions.find(t=>t.id===tx.id);
  if(now2&&lendable(data,tx)&&!lendable(candidate,now2))throw new Error('修改後，'+tx.tradeDate+' 的借券賣出會借不到足夠庫存。請先調整那筆借券，或改回原本的股數。');
 }
 // No account may end with less than zero cash because of this change (an existing shortfall may stay, but not grow).
 if(op.kind!=='importFile')for(const a of data.brokerAccounts.filter(a=>a.portfolioId===pid)){
  const was=accountCash(data,pid,a.id),will=accountCash(candidate,pid,a.id);
  if(will<-0.5&&will<was-0.5)throw new Error((a.accountName||a.name||'券商帳戶')+' 的現金會變成 '+Math.round(will).toLocaleString('zh-TW')+(op.kind==='deleteImportBatch'?'，因為這批匯入的入出金已被之後的交易使用。請先刪除或調整那些交易，或先記錄入金。':'。請先記錄入金，或調整這次修改。'));
 }
 return next;
}
