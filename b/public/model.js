import { evaluateLedger, mobileInventory, mobileAmounts, mobileBasis, mobileSellOptions, mobileCosts, acceptanceKey, mobileNormalizeTransaction, mobileSettings, mobileBorrowOptions, mobileValidateBorrow, mobileExchangeLots, mobileExchangeEligible, mobileExchangePlan, mobileAssetType } from './legacy-engine.js';
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
 const reconciliation=scoped(data,pid,'reconciliationLinks').map(l=>({...l,key:acceptanceKey(l),settled:['MATCHED','AUTO_GROUP_MATCHED'].includes(l.matchStatus)||!!l.brokerAcceptedAt}));
 return {schema:2,cycles,matches,exchanges,defaultCode:(data.securities.find(s=>String(s.symbol||'').toUpperCase()===String(mobileSettings(data,pid).defaultSecurity||'0050').toUpperCase())||{}).id||'',account,cash,lots,trades,stocks,accounts,rebuy,reconciliation,portfolioId:pid,portfolios:evaluated.portfolios.map(p=>({id:p.id,name:p.name||p.portfolioName||'投資帳本'})),user:{id:user.id,name:identity.displayName||user.name||user.email,email:identity.email},updatedAt:'',raw:data};
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
 return mobileBorrowOptions(data,fields.account,sec.symbol,fields.date,fields.id||'');
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
function accountCash(data,pid,accountId){return data.cashLedger.filter(r=>r.portfolioId===pid&&r.brokerAccountId===accountId).reduce((s,r)=>s+num(r.amount),0);}
function ownNet(data,id){const t=data.appTransactions.find(x=>x.id===id);return t?num(mobileAmounts(data,t).netAmount):0;}
function activeTask(task){return task&&!['CLOSED','MANUAL_CLOSED'].includes(task.status)&&num(task.remainingRebuyShares)>0;}
function benchmarkFields(b){
 // Same fields A stores on deposits and withdrawals; skipped when the quote lookup failed.
 if(!b||!(num(b.benchmarkPrice)>0))return {};
 return Object.fromEntries(BENCHMARK_KEYS.map(k=>[k,k==='benchmarkPrice'?Math.round(num(b[k])*100)/100:String(b[k]||'')]));
}
export function buildOperation(raw,identity,portfolioId,op){
 const {data,user,portfolioId:pid}=evaluateLedger(raw,identity,portfolioId);
 if(!canWrite(data,user,pid))throw new Error('這份投資帳本沒有編輯權限。');
 const next=clone(raw),now=new Date().toISOString();next.appTransactions=next.appTransactions||[];
 let before=null,after=null,entityId='',action='',entityType='transaction';
 if(op.kind==='acceptReconciliation'){
  const link=data.reconciliationLinks.find(l=>acceptanceKey(l)===op.key&&l.portfolioId===pid);
  if(!link||!['FEE_TAX_DIFF','AMOUNT_DIFF'].includes(link.matchStatus)||!link.brokerExecutionId||link.brokerAcceptedAt)throw new Error('這筆對帳差異已改變，請重新載入。');
  next.acceptedBrokerDiffs={...(next.acceptedBrokerDiffs||{}),[op.key]:now};
  action='ACCEPT_BROKER_AMOUNTS';entityType='reconciliation';entityId=op.key;after={acceptedAt:now};
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
 for(const tx of data.appTransactions.filter(t=>t.transactionType==='SELL'&&!t.borrowRebuyType&&t.id!==op.id)){
  if(matched(candidate,tx.id)<matched(data,tx.id))throw new Error('修改後，'+tx.tradeDate+' 的賣出會配不到足夠庫存。請先調整那筆賣出，或在 A 版處理。');
 }
 return next;
}
