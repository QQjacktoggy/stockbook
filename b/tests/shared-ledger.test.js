import test from 'node:test';
// Core transaction and SDK boundary tests use synthetic fixtures only.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {projectLedger,buildOperation,sellOptions,borrowOptions,exchangePreview,estimateCosts,starterLedger,taipeiToday,minimalLots,CATEGORIES,reportView,reportPdf,reportXls,missingBenchmarks,contentCount} from '../public/model.js';
import {mobileBackupEnvelope,mobileParseBackup} from '../public/legacy-engine.js';
import {fetchQuote,benchmarkFor,yahooSymbolFor} from '../public/quotes.js';
import {createLedgerClient,namespaceFor,compressLedger,decodeLedger} from '../public/cloud-client.js';
const original=JSON.parse(readFileSync(new URL('./fixture.json',import.meta.url)));
const who={uid:'fake-uid',email:'review@example.test',emailVerified:true,displayName:'測試'};
const pid='review-p';
function fixture(){const raw=structuredClone(original);raw.extraUnknown={keep:true};raw.marketQuotes=[{portfolioId:pid,securityId:'sec-0050',price:110,quoteTime:'2026-10-01T02:00:00Z'}];return raw;}
function fields(overrides={}){return {type:'buy',account:'review-a',code:'sec-0050',date:taipeiToday(),time:'10:30',qty:10,price:100,fee:4,tax:0,note:'B 測試',category:'LONG_TERM',...overrides};}
function mockSdk(docs,user=who){
 const auth={currentUser:user};let writes=0;
 const clone=x=>structuredClone(x);
 const sdk=[
 {initializeApp:()=>({})},
 {getAuth:()=>auth,GoogleAuthProvider:class{setCustomParameters(){}},onAuthStateChanged(){},getRedirectResult:async()=>null,signInWithPopup:async()=>({user}),signInWithRedirect:async()=>{},signOut:async()=>{auth.currentUser=null;}},
 {getFirestore:()=>({}),doc:(_db,...p)=>p.join('/'),runTransaction:async(_db,fn)=>{
  const updates=[],deletes=[];let writing=false;
  const value=await fn({get:async key=>{assert.equal(writing,false,'All reads occur before writes');return {exists:()=>docs.has(key),data:()=>clone(docs.get(key))};},set:(key,data)=>{writing=true;updates.push([key,clone(data)]);},delete:key=>{writing=true;deletes.push(key);}});
  updates.forEach(([k,v])=>{docs.set(k,v);writes++;});deletes.forEach(k=>{docs.delete(k);writes++;});return value;
 }}];
 return {sdk,auth,get writes(){return writes;}};
}
const head='stockLedgers/'+namespaceFor(who.email);
test('Taipei day does not use UTC day',()=>assert.equal(taipeiToday(new Date('2026-09-30T17:00:00Z')),'2026-10-01'));
test('Projects legacy account cash, linked lots and unknown execution time',()=>{
 const raw=fixture(),before=JSON.stringify(raw),model=projectLedger(raw,who,pid);
 assert.equal(model.portfolioId,pid);assert.equal(model.trades.length,5);assert.equal(model.trades.filter(t=>t.cash).length,1);
 assert.ok(model.cash['review-a']>0);assert.ok(model.lots.some(l=>l.account==='review-a'));
 assert.equal(model.trades.find(t=>t.id==='demo-buy-a').time,'');
 assert.equal(JSON.stringify(raw),before,'Read projection must not mutate raw cloud payload');
});
test('Creates legacy-compatible trade, preserves unknown fields, records actual time',()=>{
 const raw=fixture(),next=buildOperation(raw,who,pid,{kind:'upsertTransaction',fields:fields()});
 assert.deepEqual(next.extraUnknown,raw.extraUnknown);assert.equal(next.appTransactions.length,raw.appTransactions.length+1);
 const t=next.appTransactions.at(-1);assert.equal(t.tradeTime,'10:30');assert.equal(t.transactionType,'BUY');assert.equal(t.netAmount,-1004);
 assert.equal(next.auditLogs.at(-1).source,'MOBILE_B');
 assert.equal(raw.appTransactions.some(x=>x.tradeTime==='10:30'),false);
});
test('Sell selects original highest-cost eligible lots and rejects oversell',()=>{
 const raw=fixture(),options=sellOptions(raw,who,pid,fields({type:'sell'}));
 assert.ok(options.length);assert.ok(options.every(o=>o.date<=taipeiToday()));
 assert.throws(()=>buildOperation(raw,who,pid,{kind:'upsertTransaction',fields:fields({type:'sell',qty:999999})}),/可賣/);
 const next=buildOperation(raw,who,pid,{kind:'upsertTransaction',fields:fields({type:'sell',qty:10})});
 assert.ok(next.appTransactions.at(-1).linkedBuyTransactionId);
 assert.equal(projectLedger(next,who,pid).lots.reduce((s,l)=>s+l.qty,0),projectLedger(raw,who,pid).lots.reduce((s,l)=>s+l.qty,0)-10);
});
test('Rejects invalid calendar date, future date, money and foreign account',()=>{
 for(const f of [fields({date:'2026-02-30'}),fields({date:'2099-01-01'}),fields({qty:0}),fields({fee:-1}),fields({account:'foreign'}),fields({price:999999})]){
  assert.throws(()=>buildOperation(fixture(),who,pid,{kind:'upsertTransaction',fields:f}));
 }
});
test('Protects referenced buys while permitting metadata edits',()=>{
 const raw=fixture(),old=raw.appTransactions.find(t=>t.id==='demo-buy-a');
 assert.throws(()=>buildOperation(raw,who,pid,{kind:'deleteTransaction',id:old.id}),/引用/);
 // Shrinking the buy below what the linked sell already used would leave that sell unmatched.
 assert.throws(()=>buildOperation(raw,who,pid,{kind:'upsertTransaction',id:old.id,fields:fields({qty:99,price:old.price,fee:old.fee,date:old.tradeDate})}),/配不到/);
 const next=buildOperation(raw,who,pid,{kind:'upsertTransaction',id:old.id,fields:fields({qty:old.shares,price:old.price,fee:old.fee,date:old.tradeDate,note:'只改備註'})});
 assert.equal(next.appTransactions.find(t=>t.id===old.id).note,'只改備註');
});
test('Does not give member read-only access write rights',()=>{
 const raw=fixture();raw.portfolios[0].userId='other-owner';raw.portfolioMembers=[{userId:'review-user',portfolioId:pid,role:'VIEWER'}];
 assert.throws(()=>buildOperation(raw,who,pid,{kind:'upsertTransaction',fields:fields()}),/編輯權限/);
});
test('Delete newly unreferenced trade restores cash and inventory',()=>{
 const raw=fixture(),added=buildOperation(raw,who,pid,{kind:'upsertTransaction',fields:fields()}),id=added.appTransactions.at(-1).id;
 const removed=buildOperation(added,who,pid,{kind:'deleteTransaction',id});
 assert.deepEqual(removed.appTransactions,raw.appTransactions);
 assert.deepEqual(projectLedger(removed,who,pid).cash,projectLedger(raw,who,pid).cash);
});
test('Compression round-trip keeps full legacy state',async()=>assert.deepEqual(await decodeLedger(await compressLedger(fixture())),fixture()));
test('Cloud load has zero writes; inline legacy state upgrades atomically',async()=>{
 const raw=fixture(),docs=new Map([[head,{state:raw,ownerUid:who.uid,ownerEmail:who.email,updatedAt:'old',customMetadata:42}]]),m=mockSdk(docs);
 const c=await createLedgerClient({}, {sdk:m.sdk});await c.reload();assert.equal(m.writes,0);
 await c.commit({kind:'upsertTransaction',fields:fields()});
 assert.equal(docs.get(head).customMetadata,42);assert.equal(docs.get(head).state,undefined);
 const saved=await decodeLedger(docs.get(head+'/chunks/chunk_0').data);assert.deepEqual(saved.extraUnknown,raw.extraUnknown);assert.equal(saved.appTransactions.at(-1).tradeTime,'10:30');
});
test('Cloud refuses stale main document without writing any chunks',async()=>{
 const docs=new Map([[head,{state:fixture(),ownerUid:who.uid,ownerEmail:who.email,updatedAt:'old'}]]),m=mockSdk(docs),c=await createLedgerClient({}, {sdk:m.sdk});await c.reload();
 docs.get(head).updatedAt='new-from-A';
 await assert.rejects(c.commit({kind:'upsertTransaction',fields:fields()}),{code:'stockbook/conflict'});
 assert.equal(m.writes,0);assert.equal(docs.size,1);
});
test('Cloud refuses changed chunks even when head metadata stayed identical',async()=>{
 const payload=await compressLedger(fixture()),docs=new Map([[head,{chunkCount:1,ownerUid:who.uid,ownerEmail:who.email,updatedAt:'old'}],[head+'/chunks/chunk_0',{data:payload,index:0,ownerUid:who.uid}]]),m=mockSdk(docs),c=await createLedgerClient({}, {sdk:m.sdk});
 await c.reload();docs.get(head+'/chunks/chunk_0').data=payload+'changed';
 await assert.rejects(c.commit({kind:'upsertTransaction',fields:fields()}),{code:'stockbook/conflict'});assert.equal(m.writes,0);
});
test('Missing ledger, missing chunk and unverified identity never create documents',async()=>{
 for(const docs of [new Map(),new Map([[head,{chunkCount:1,updatedAt:'old'}]])]){
  const m=mockSdk(docs),c=await createLedgerClient({}, {sdk:m.sdk});await assert.rejects(c.reload());assert.equal(m.writes,0);
 }
 const m=mockSdk(new Map(),{...who,emailVerified:false}),c=await createLedgerClient({}, {sdk:m.sdk});await assert.rejects(c.reload(),/已驗證/);
});
test('Successive cloud writes use new baseline and preserve unrelated accounts',async()=>{
 const docs=new Map([[head,{state:fixture(),ownerUid:who.uid,ownerEmail:who.email,updatedAt:'old'}]]),m=mockSdk(docs),c=await createLedgerClient({}, {sdk:m.sdk});
 await c.reload();await c.commit({kind:'upsertTransaction',fields:fields()});await c.commit({kind:'upsertTransaction',fields:fields({time:'10:31'})});
 const saved=await decodeLedger(docs.get(head+'/chunks/chunk_0').data);assert.equal(saved.appTransactions.length,fixture().appTransactions.length+2);
 assert.deepEqual(saved.appTransactions.filter(t=>t.brokerAccountId==='review-b'),fixture().appTransactions.filter(t=>t.brokerAccountId==='review-b'));
});

test('Explicitly deselecting every sell lot cannot sell inventory silently',()=>{
 assert.throws(()=>buildOperation(fixture(),who,pid,{kind:'upsertTransaction',fields:fields({type:'sell',sources:''})}),/可賣 0 股/);
});
test('Reconciliation acceptance uses legacy acceptance key and changes effective cash',()=>{
 const raw=fixture(),buy=raw.appTransactions.find(t=>t.id==='demo-buy-a');
 raw.brokerExecutions=[{...buy,id:'broker-filled-a',side:'BUY',fee:buy.fee-2,netAmount:buy.netAmount+2}];
 const before=projectLedger(raw,who,pid),link=before.reconciliation.find(l=>l.appTransactionId===buy.id);
 assert.equal(link.matchStatus,'FEE_TAX_DIFF');
 const saved=buildOperation(raw,who,pid,{kind:'acceptReconciliation',key:link.key}),after=projectLedger(saved,who,pid);
 assert.ok(saved.acceptedBrokerDiffs[link.key]);
 assert.equal(after.cash['review-a'],before.cash['review-a']+2);
 assert.equal(saved.appTransactions.find(t=>t.id===buy.id).fee,buy.fee,'Accepted broker amounts remain a separate legacy record');
});
test('Signout during compression cancels pending save before writing',async()=>{
 const docs=new Map([[head,{state:fixture(),ownerUid:who.uid,ownerEmail:who.email,updatedAt:'old'}]]),m=mockSdk(docs),c=await createLedgerClient({}, {sdk:m.sdk});
 await c.reload();
 const rejected=assert.rejects(c.commit({kind:'upsertTransaction',fields:fields()}),/登入狀態/);
 await c.signOut();await rejected;assert.equal(m.writes,0);assert.equal(c.view(),null);
});

test('Signout while transaction reads are pending cancels before any mutations',async()=>{
 const docs=new Map([[head,{state:fixture(),ownerUid:who.uid,ownerEmail:who.email,updatedAt:'old'}]]),m=mockSdk(docs),c=await createLedgerClient({}, {sdk:m.sdk});
 await c.reload();
 const run=m.sdk[2].runTransaction;let reached,release;
 const paused=new Promise(resolve=>{reached=resolve;});
 const gate=new Promise(resolve=>{release=resolve;});
 m.sdk[2].runTransaction=async(db,fn)=>run(db,tx=>fn({...tx,get:async ref=>{const result=await tx.get(ref);if(ref===head){reached();await gate;}return result;}}));
 const rejected=assert.rejects(c.commit({kind:'upsertTransaction',fields:fields()}),/登入狀態/);
 await paused;await c.signOut();release();await rejected;assert.equal(m.writes,0);
});

test('Sell without chosen lots takes just enough lots, high price first',()=>{
 const raw=fixture(),options=sellOptions(raw,who,pid,fields({type:'sell'}));
 assert.ok(options.length>1,'fixture offers several lots');
 const saved=buildOperation(raw,who,pid,{kind:'upsertTransaction',fields:fields({type:'sell',qty:10})});
 const sell=saved.appTransactions.at(-1);
 assert.equal(sell.linkedBuyTransactionId,options[0].value);
 assert.deepEqual(minimalLots(options,options[0].shares+1).map(o=>o.value),options.slice(0,2).map(o=>o.value));
});
test('Editing a trade saves the chosen category, including CORE',()=>{
 const raw=fixture(),old=projectLedger(raw,who,pid).trades.find(t=>t.id==='demo-buy-pm');
 const edit=category=>buildOperation(raw,who,pid,{kind:'upsertTransaction',id:old.id,fields:fields({type:'buy',account:old.account,code:old.code,date:old.date,time:old.time,qty:old.qty,price:old.price,fee:old.fee,tax:old.tax,note:old.note,category})}).appTransactions.find(t=>t.id===old.id).strategyCategory;
 assert.ok(CATEGORIES.includes('CORE'));
 assert.equal(edit('CORE'),'CORE');assert.equal(edit('TRADING'),'TRADING');
 assert.equal(edit('NOT_A_CATEGORY'),raw.appTransactions.find(t=>t.id===old.id).strategyCategory||'LONG_TERM');
});

// --- First-batch features: cash entries, quotes, editing matched trades, rebuy actions ---
function cash(overrides={}){return {cashType:'DEPOSIT',account:'review-a',date:taipeiToday(),amount:5000,note:'B 入金',...overrides};}
const cashOf=(raw,acc='review-a')=>projectLedger(raw,who,pid).cash[acc];
test('Deposit, dividend and withdrawal follow A cash rules and keep the benchmark price',()=>{
 const raw=fixture(),base=cashOf(raw);
 const bench={benchmarkSecurityId:'sec-0050',benchmarkSymbol:'0050',benchmarkPrice:101.234,benchmarkPriceSource:'YAHOO_FINANCE',benchmarkPriceDate:taipeiToday(),benchmarkPriceCapturedAt:new Date().toISOString()};
 let next=buildOperation(raw,who,pid,{kind:'upsertCash',fields:cash(),benchmark:bench});
 const dep=next.appTransactions.at(-1);
 assert.equal(dep.transactionType,'DEPOSIT');assert.equal(dep.price,5000);assert.equal(dep.shares,0);assert.equal(dep.netAmount,5000);assert.equal(dep.strategyCategory,'CORE');assert.equal(dep.securityId,'sec-0050');
 assert.equal(dep.benchmarkPrice,101.23);assert.equal(dep.benchmarkSymbol,'0050');
 assert.equal(cashOf(next),base+5000);
 next=buildOperation(next,who,pid,{kind:'upsertCash',fields:cash({cashType:'DIVIDEND',amount:321})});
 const div=next.appTransactions.at(-1);assert.equal(div.strategyCategory,'DIVIDEND');assert.equal(div.benchmarkPrice,undefined);
 assert.equal(cashOf(next),base+5321);
 next=buildOperation(next,who,pid,{kind:'upsertCash',fields:cash({cashType:'WITHDRAW',amount:1000})});
 assert.equal(next.appTransactions.at(-1).netAmount,-1000);assert.equal(cashOf(next),base+4321);
 assert.throws(()=>buildOperation(next,who,pid,{kind:'upsertCash',fields:cash({cashType:'WITHDRAW',amount:base+10000})}),/現金不足/);
 assert.throws(()=>buildOperation(next,who,pid,{kind:'upsertCash',fields:cash({amount:0})}),/大於 0/);
 assert.throws(()=>buildOperation(next,who,pid,{kind:'upsertCash',fields:cash({cashType:'BUY'})}),/入金、出金/);
 const model=projectLedger(next,who,pid);
 assert.deepEqual(model.trades.filter(t=>t.cash).map(t=>t.type).sort(),['deposit','deposit','dividend','withdraw']);
});
test('Cash entries can be edited (same type) and deleted; benchmark is cleared when the date moves',()=>{
 const raw=fixture(),bench={benchmarkSecurityId:'sec-0050',benchmarkSymbol:'0050',benchmarkPrice:100,benchmarkPriceSource:'X',benchmarkPriceDate:taipeiToday(),benchmarkPriceCapturedAt:'t'};
 let next=buildOperation(raw,who,pid,{kind:'upsertCash',fields:cash(),benchmark:bench});const id=next.appTransactions.at(-1).id;
 next=buildOperation(next,who,pid,{kind:'upsertCash',id,fields:cash({amount:7000,note:'改金額'})});
 let tx=next.appTransactions.find(t=>t.id===id);assert.equal(tx.price,7000);assert.equal(tx.benchmarkPrice,100,'same date keeps benchmark');
 next=buildOperation(next,who,pid,{kind:'upsertCash',id,fields:cash({amount:7000,date:'2026-09-29'})});
 tx=next.appTransactions.find(t=>t.id===id);assert.equal(tx.benchmarkPrice,'','moved date drops stale benchmark so A can backfill');
 assert.throws(()=>buildOperation(next,who,pid,{kind:'upsertCash',id,fields:cash({cashType:'WITHDRAW'})}),/類型/);
 assert.throws(()=>buildOperation(next,who,pid,{kind:'upsertCash',id:'demo-buy-a',fields:cash()}),/不是現金/);
 const before=cashOf(next);next=buildOperation(next,who,pid,{kind:'deleteTransaction',id});
 assert.equal(cashOf(next),before-7000);assert.equal(next.appTransactions.some(t=>t.id===id),false);
});
test('Quotes are stored with the same id and fields as A and replace older quotes',()=>{
 const raw=fixture();raw.marketQuotes=[{id:'quote-review-p-sec-0050',portfolioId:pid,securityId:'sec-0050',price:110,quoteTime:'2026-10-01T02:00:00Z',createdAt:'c0'}];
 const next=buildOperation(raw,who,pid,{kind:'updateQuotes',quotes:[{securityId:'sec-0050',price:123.456,source:'YAHOO_FINANCE',sourceDate:'2026-10-06',quoteTime:'2026-10-06T05:00:00Z',yahooSymbol:'0050.TW'}]});
 assert.equal(next.marketQuotes.length,1);const q=next.marketQuotes[0];
 assert.equal(q.id,'quote-review-p-sec-0050');assert.equal(q.price,123.46);assert.equal(q.createdAt,'c0');assert.equal(q.finmindStockId,'0050');assert.equal(q.yahooSymbol,'0050.TW');
 assert.equal(projectLedger(next,who,pid).stocks['sec-0050'].price,123.46);
 assert.equal(next.auditLogs.at(-1).entityType,'market_quote');
 assert.throws(()=>buildOperation(raw,who,pid,{kind:'updateQuotes',quotes:[{securityId:'sec-0050',price:0}]}),/報價/);
 assert.throws(()=>buildOperation(raw,who,pid,{kind:'updateQuotes',quotes:[{securityId:'nope',price:10}]}),/報價/);
});
test('Quote fetch falls back like A: Yahoo, then TWSE, then FinMind',async()=>{
 const stock={symbol:'0050',market:'TW'};assert.equal(yahooSymbolFor(stock),'0050.TW');assert.equal(yahooSymbolFor({symbol:'6488',market:'TWO'}),'6488.TWO');
 const seen=[];
 const fetcher=async url=>{seen.push(url);if(url.includes('yahoo'))return {ok:false,status:403,text:async()=>''};if(url.includes('twse'))return {ok:true,text:async()=>JSON.stringify({msgArray:[{z:'-',y:'191.5',d:'20261006'}]})};throw new Error('unexpected');};
 const q=await fetchQuote(stock,fetcher);
 assert.equal(q.price,191.5);assert.equal(q.source,'TWSE_SNAPSHOT');assert.equal(q.sourceDate,'2026-10-06');
 assert.ok(seen.some(u=>u.includes('r.jina.ai'))&&seen.some(u=>u.includes('allorigins')),'Yahoo proxies tried before TWSE');
 const none=await benchmarkFor(stock,'sec-0050',taipeiToday(),{fetcher:async()=>{throw new Error('offline');},timeoutMs:200});
 assert.equal(none,null,'benchmark is best effort');
});
test('Matched trades: amounts can change and matching is recomputed',()=>{
 const raw=fixture(),buy=raw.appTransactions.find(t=>t.id==='demo-buy-a');
 const sellPnl=d=>projectLedger(d,who,pid).raw.sellMatches.filter(m=>m.sellTransactionId==='demo-sell-am').reduce((s,m)=>s+Number(m.netProfit||0),0);
 const before=sellPnl(raw);
 const next=buildOperation(raw,who,pid,{kind:'upsertTransaction',id:buy.id,fields:fields({qty:buy.shares,price:90,fee:buy.fee,tax:buy.tax,date:buy.tradeDate,time:''})});
 assert.equal(next.appTransactions.find(t=>t.id===buy.id).price,90);
 assert.ok(sellPnl(next)>before,'cheaper buy raises the realized gain on the matched sell');
 // A linked sell can also change size; inventory for it is re-checked.
 const sell=raw.appTransactions.find(t=>t.id==='demo-sell-am');
 const bigger=buildOperation(raw,who,pid,{kind:'upsertTransaction',id:sell.id,fields:fields({type:'sell',qty:150,price:sell.price,fee:sell.fee,tax:sell.tax,date:sell.tradeDate,time:'',sources:sell.linkedBuyTransactionId})});
 assert.equal(bigger.appTransactions.find(t=>t.id===sell.id).shares,150);
});
test('Borrow sell from several lots, buy-back cycle, and their limits (A rules)',()=>{
 const raw=fixture(),before=projectLedger(raw,who,pid),total=m=>m.lots.reduce((s,l)=>s+l.qty,0);
 const options=borrowOptions(raw,who,pid,fields({type:'sell'}));
 assert.ok(options.some(o=>o.value==='demo-buy-pm')&&options.some(o=>o.value==='demo-buy-a'));
 const borrowSell=o=>fields({type:'sell',borrow:'sell',qty:150,price:112,fee:0,tax:0,sources:'demo-buy-pm,demo-buy-a',...o});
 assert.throws(()=>buildOperation(raw,who,pid,{kind:'upsertTransaction',fields:borrowSell({qty:400})}),/借出股數/);
 assert.throws(()=>buildOperation(raw,who,pid,{kind:'upsertTransaction',fields:borrowSell({sources:''})}),/借券來源/);
 const lent=buildOperation(raw,who,pid,{kind:'upsertTransaction',fields:borrowSell()}),sell=lent.appTransactions.at(-1);
 assert.equal(sell.borrowRebuyType,'BORROW_SELL');assert.equal(sell.sourceInventoryLotId,'demo-buy-pm,demo-buy-a');assert.equal(sell.linkedBuyTransactionId,'');
 let m=projectLedger(lent,who,pid);
 assert.equal(total(m),total(before)-150,'lent shares leave the sellable inventory');
 assert.deepEqual(m.cycles.map(c=>[c.id,c.remaining,c.status]),[[sell.id,150,'open']]);
 assert.equal(borrowOptions(lent,who,pid,fields({type:'sell'})).reduce((s,o)=>s+o.shares,0),total(before)-150-100,'other account not offered; reserved shares not lendable twice');
 // Buy-back fills the cycle.
 assert.throws(()=>buildOperation(lent,who,pid,{kind:'upsertTransaction',fields:fields({cycle:sell.id,qty:200,price:108})}),/待回補/);
 assert.throws(()=>buildOperation(lent,who,pid,{kind:'upsertTransaction',fields:fields({cycle:sell.id,account:'review-b'})}),/相同/);
 assert.throws(()=>buildOperation(lent,who,pid,{kind:'upsertTransaction',fields:fields({cycle:'nope'})}),/借券任務/);
 const filled=buildOperation(lent,who,pid,{kind:'upsertTransaction',fields:fields({cycle:sell.id,qty:100,price:108,fee:0})}),fill=filled.appTransactions.at(-1);
 assert.equal(fill.borrowRebuyType,'REBUY_FILL');assert.equal(fill.rebuyCycleId,sell.id);
 m=projectLedger(filled,who,pid);
 assert.deepEqual(m.cycles.map(c=>[c.remaining,c.filled,c.status]),[[50,100,'partial']]);
 assert.equal(total(m),total(before)-50,'returned shares are sellable again');
 // Edits follow the same checks; the fill keeps its cycle.
 const repriced=buildOperation(filled,who,pid,{kind:'upsertTransaction',id:fill.id,fields:fields({qty:100,price:104,fee:0})});
 assert.equal(repriced.appTransactions.find(t=>t.id===fill.id).rebuyCycleId,sell.id);
 assert.throws(()=>buildOperation(filled,who,pid,{kind:'upsertTransaction',id:fill.id,fields:fields({qty:151,price:104,fee:0})}),/待回補/);
 assert.throws(()=>buildOperation(filled,who,pid,{kind:'upsertTransaction',id:sell.id,fields:borrowSell({qty:90})}),/已回補/);
 const bigger=buildOperation(filled,who,pid,{kind:'upsertTransaction',id:sell.id,fields:borrowSell({qty:120,sources:'demo-buy-pm,demo-buy-a'})});
 assert.equal(projectLedger(bigger,who,pid).cycles[0].remaining,20);
 assert.throws(()=>buildOperation(filled,who,pid,{kind:'deleteTransaction',id:sell.id}),/回補/);
 const unfilled=buildOperation(filled,who,pid,{kind:'deleteTransaction',id:fill.id});
 assert.equal(projectLedger(unfilled,who,pid).cycles[0].remaining,150);
 assert.equal(total(projectLedger(buildOperation(unfilled,who,pid,{kind:'deleteTransaction',id:sell.id}),who,pid)),total(before));
});
test('Adds a security like A and rejects duplicates',()=>{
 const raw=fixture();
 assert.throws(()=>buildOperation(raw,who,pid,{kind:'createSecurity',fields:{symbol:'0050'}}),/已存在/);
 assert.throws(()=>buildOperation(raw,who,pid,{kind:'createSecurity',fields:{symbol:'台積'}}),/代號/);
 const next=buildOperation(raw,who,pid,{kind:'createSecurity',fields:{symbol:' 2330 ',name:'台積電'}}),sec=next.securities.at(-1);
 assert.deepEqual([sec.symbol,sec.name,sec.market,sec.currency,sec.assetType],['2330','台積電','TW','TWD','STOCK']);
 assert.equal(buildOperation(raw,who,pid,{kind:'createSecurity',fields:{symbol:'00919'}}).securities.at(-1).assetType,'ETF');
 assert.equal(projectLedger(next,who,pid).stocks[sec.id].symbol,'2330');
 assert.equal(next.auditLogs.at(-1).entityType,'security');
 const bought=buildOperation(next,who,pid,{kind:'upsertTransaction',fields:fields({code:sec.id,qty:10,price:900})});
 assert.ok(projectLedger(bought,who,pid).lots.some(l=>l.code===sec.id));
});
test('Sell matching can be viewed and changed (A save-match)',()=>{
 const raw=fixture(),m=projectLedger(raw,who,pid);
 assert.deepEqual(m.matches['demo-sell-am'].map(x=>[x.buy,x.qty]),[['demo-buy-a',100]]);
 assert.throws(()=>buildOperation(raw,who,pid,{kind:'updateMatch',id:'demo-sell-am',sources:'demo-buy-b'}),/無效/,'other account');
 assert.throws(()=>buildOperation(raw,who,pid,{kind:'updateMatch',id:'demo-sell-am',sources:'demo-buy-pm',shares:0}),/配對股數/);
 assert.throws(()=>buildOperation(raw,who,pid,{kind:'updateMatch',id:'demo-buy-a',sources:'demo-buy-pm'}),/一般賣出/);
 const moved=buildOperation(raw,who,pid,{kind:'updateMatch',id:'demo-sell-am',sources:'demo-buy-pm',shares:100});
 assert.deepEqual(projectLedger(moved,who,pid).matches['demo-sell-am'].map(x=>[x.buy,x.qty,x.price]),[['demo-buy-pm',100,105]]);
 assert.equal(moved.auditLogs.at(-1).action,'UPDATE_MATCH');
 const partial=buildOperation(raw,who,pid,{kind:'updateMatch',id:'demo-sell-am',sources:'demo-buy-a',shares:60});
 assert.equal(projectLedger(partial,who,pid).matches['demo-sell-am'][0].qty,60);
 assert.equal(projectLedger(partial,who,pid).trades.find(t=>t.id==='demo-sell-am').manual,60);
});
test('Inventory cost exchange: create, preview, delete, and protection after selling',()=>{
 const raw=buildOperation(fixture(),who,pid,{kind:'upsertTransaction',fields:fields({date:'2026-10-01',qty:100,price:120,fee:0})}),extra=raw.appTransactions.at(-1);
 const ex=o=>({source:'demo-buy-pm',externalPrice:95,date:'2026-10-02',label:'外部帳戶',targets:[{id:extra.id,reduction:5}],...o});
 assert.throws(()=>buildOperation(raw,who,pid,{kind:'createCostExchange',fields:ex({source:'demo-buy-a'})}),/完整未售出/);
 assert.throws(()=>buildOperation(raw,who,pid,{kind:'createCostExchange',fields:ex({date:'2026-09-30'})}),/買進日期/);
 assert.throws(()=>buildOperation(raw,who,pid,{kind:'createCostExchange',fields:ex({targets:[{id:'demo-buy-b',reduction:1}]})}),/資格/,'other account');
 assert.equal(exchangePreview(raw,who,pid,ex()).sourceFinalPrice,100);
 const next=buildOperation(raw,who,pid,{kind:'createCostExchange',fields:ex()}),m=projectLedger(next,who,pid);
 assert.equal(m.lots.find(l=>l.buyTx==='demo-buy-pm').cost,100);assert.equal(m.lots.find(l=>l.buyTx===extra.id).cost,115);
 assert.equal(m.exchanges.length,1);assert.equal(m.exchanges[0].redistributed,500);assert.equal(m.exchanges[0].deletable,true);
 assert.equal(next.inventoryCostExchanges[0].externalAccountLabel,'外部帳戶');
 assert.equal(buildOperation(next,who,pid,{kind:'deleteCostExchange',id:next.inventoryCostExchanges[0].id}).inventoryCostExchanges.length,0);
 const sold=buildOperation(next,who,pid,{kind:'upsertTransaction',fields:fields({type:'sell',qty:10,price:130,sources:'demo-buy-pm'})});
 assert.equal(projectLedger(sold,who,pid).exchanges[0].deletable,false);
 assert.throws(()=>buildOperation(sold,who,pid,{kind:'deleteCostExchange',id:next.inventoryCostExchanges[0].id}),/不能撤銷/);
 assert.equal(buildOperation(next,who,pid,{kind:'deleteTransaction',id:extra.id}).inventoryCostExchanges.length,0,'deleting a buy removes its exchanges, as in A');
});
test('Rebuy: a B buy fills the plan like A, and plans can be closed manually',()=>{
 const raw=fixture(),task=projectLedger(raw,who,pid).rebuy.find(r=>r.id==='demo-sell-am');
 assert.ok(task,'fixture has an open rebuy plan');
 assert.throws(()=>buildOperation(raw,who,pid,{kind:'upsertTransaction',fields:fields({rebuyIds:task.id,date:'2026-09-29'})}),/早於/);
 assert.throws(()=>buildOperation(raw,who,pid,{kind:'upsertTransaction',fields:fields({rebuyIds:task.id,account:'review-b'})}),/相同/);
 assert.throws(()=>buildOperation(raw,who,pid,{kind:'upsertTransaction',fields:fields({rebuyIds:'nope'})}),/不存在/);
 const next=buildOperation(raw,who,pid,{kind:'upsertTransaction',fields:fields({rebuyIds:task.id,qty:task.qty,price:task.target})});
 const tx=next.appTransactions.at(-1);
 assert.equal(tx.buyIntent,'REBUY');assert.equal(tx.rebuySellTransactionIds,task.id);assert.equal(tx.strategyCategory,'REBUY');
 assert.equal(projectLedger(next,who,pid).rebuy.some(r=>r.id===task.id),false,'filled plan leaves the open list');
 const t=projectLedger(next,who,pid).trades.find(x=>x.id===tx.id);assert.equal(t.linked,true);assert.equal(t.refd,false);
 const removed=buildOperation(next,who,pid,{kind:'deleteTransaction',id:tx.id});
 assert.ok(projectLedger(removed,who,pid).rebuy.some(r=>r.id===task.id),'deleting the rebuy buy reopens the plan');
 assert.throws(()=>buildOperation(next,who,pid,{kind:'deleteTransaction',id:task.id}),/引用/,'sell with a rebuy cannot be deleted');
 const closed=buildOperation(raw,who,pid,{kind:'closeRebuy',sellIds:[task.id]});
 assert.deepEqual(closed.manualClosedRebuySellIds,[task.id]);assert.equal(projectLedger(closed,who,pid).rebuy.length,0);
 assert.equal(closed.auditLogs.at(-1).action,'MANUAL_CLOSE');
 assert.throws(()=>buildOperation(closed,who,pid,{kind:'closeRebuy',sellIds:[task.id]}),/已改變/);
});
test('Cash transfers move cash between accounts without counting as deposits (A 現金轉帳)',()=>{
 const raw=fixture(),cash=d=>projectLedger(d,who,pid).cash,before=cash(raw),f=o=>({from:'review-a',to:'review-b',date:taipeiToday(),amount:1000,fee:10,note:'轉帳',...o});
 assert.throws(()=>buildOperation(raw,who,pid,{kind:'upsertCashTransfer',fields:f({to:'review-a'})}),/不可相同/);
 assert.throws(()=>buildOperation(raw,who,pid,{kind:'upsertCashTransfer',fields:f({amount:99999999})}),/不足/);
 assert.throws(()=>buildOperation(raw,who,pid,{kind:'upsertCashTransfer',fields:f({amount:0})}),/大於 0/);
 const next=buildOperation(raw,who,pid,{kind:'upsertCashTransfer',fields:f()}),id=next.accountTransfers.at(-1).id;
 assert.equal(cash(next)['review-a'],before['review-a']-1010);assert.equal(cash(next)['review-b'],before['review-b']+1000);
 assert.equal(projectLedger(next,who,pid).transfers[0].amount,1000);assert.equal(next.auditLogs.at(-1).entityType,'account_transfer');
 const edited=buildOperation(next,who,pid,{kind:'upsertCashTransfer',id,fields:f({amount:1500,fee:0})});
 assert.equal(cash(edited)['review-a'],before['review-a']-1500);assert.equal(edited.accountTransfers.length,1);
 // review-b starts below zero in the fixture: an edit may not push it further down.
 assert.ok(before['review-b']<0);
 assert.throws(()=>buildOperation(next,who,pid,{kind:'upsertCashTransfer',id,fields:f({amount:500,fee:0})}),/現金會變成/);
 assert.throws(()=>buildOperation(next,who,pid,{kind:'deleteCashTransfer',id}),/現金會變成/);
});
test('Position transfers are recorded like A and do not move inventory',()=>{
 const raw=fixture(),lots=d=>JSON.stringify(projectLedger(d,who,pid).lots.map(l=>[l.source,l.account,l.qty]));
 const f={code:'sec-0050',from:'review-a',to:'review-b',date:taipeiToday(),shares:100,basis:10000,note:''};
 assert.throws(()=>buildOperation(raw,who,pid,{kind:'upsertPositionTransfer',fields:{...f,shares:1.5}}),/正整數/);
 const next=buildOperation(raw,who,pid,{kind:'upsertPositionTransfer',fields:f}),id=next.positionTransfers[0].id;
 assert.equal(lots(next),lots(raw));assert.equal(projectLedger(next,who,pid).positions[0].basis,10000);
 assert.equal(buildOperation(next,who,pid,{kind:'upsertPositionTransfer',id,fields:{...f,shares:50}}).positionTransfers[0].shares,50);
 assert.equal(buildOperation(next,who,pid,{kind:'deletePositionTransfer',id}).positionTransfers.length,0);
 assert.throws(()=>buildOperation(next,who,pid,{kind:'deleteSecurity',id:'sec-0050'}),/不能刪除/);
});
test('Ledger structure: portfolios, broker accounts, fees and settings',()=>{
 const raw=fixture();
 const p=buildOperation(raw,who,pid,{kind:'upsertPortfolio',fields:{name:'第二本帳'}}),newPid=p.portfolios.at(-1).id;
 assert.ok(projectLedger(p,who,pid).portfolios.some(x=>x.name==='第二本帳'));
 assert.equal(projectLedger(p,who,newPid).portfolioId,newPid,'new portfolio can be opened');
 assert.equal(buildOperation(p,who,pid,{kind:'upsertPortfolio',id:pid,fields:{name:'改名'}}).portfolios.find(x=>x.id===pid).name,'改名');
 const a=buildOperation(raw,who,pid,{kind:'upsertBrokerAccount',fields:{brokerId:'broker-fubon',name:'富邦',isDefault:true}}),acc=a.brokerAccounts.at(-1);
 assert.equal(acc.brokerId,'broker-fubon');assert.equal(a.brokerAccounts.filter(x=>x.portfolioId===pid&&x.isDefault).length,1);
 assert.ok(projectLedger(a,who,pid).accounts.some(x=>x.id===acc.id));
 const off=buildOperation(a,who,pid,{kind:'upsertBrokerAccount',id:acc.id,fields:{name:'富邦',active:false}});
 assert.equal(projectLedger(off,who,pid).accounts.some(x=>x.id===acc.id),false,'inactive accounts leave the pickers');
 assert.equal(buildOperation(a,who,pid,{kind:'deleteBrokerAccount',id:acc.id}).brokerAccounts.some(x=>x.id===acc.id),false);
 assert.throws(()=>buildOperation(raw,who,pid,{kind:'deleteBrokerAccount',id:'review-a'}),/停用/);
 const broker=raw.brokerAccounts.find(x=>x.id==='review-a').brokerId,cost=d=>estimateCosts(d,who,pid,{type:'buy',account:'review-a',code:'sec-0050',price:100,qty:1000});
 assert.throws(()=>buildOperation(raw,who,pid,{kind:'saveBrokerFees',fields:{brokerId:broker,feeRate:1.425,discountRate:0.28,minFee:1,stockSellTaxRate:0.003,etfSellTaxRate:0.001}}),/小數/);
 const fees=buildOperation(raw,who,pid,{kind:'saveBrokerFees',fields:{brokerId:broker,feeRate:0.001425,discountRate:0.6,minFee:20,stockSellTaxRate:0.003,etfSellTaxRate:0.001}});
 assert.equal(cost(fees).fee,Math.max(20,Math.floor(100000*0.001425*0.6)));assert.notEqual(cost(fees).fee,cost(raw).fee);
 assert.throws(()=>buildOperation(raw,who,pid,{kind:'saveSettings',fields:{defaultSecurity:'9999',defaultRebuyOffset:0.5,coreHoldingShares:0,priceTolerance:0,amountTolerance:5,feeAllocationMethod:'BY_SHARES'}}),/清單/);
 const set=buildOperation(raw,who,pid,{kind:'saveSettings',fields:{defaultSecurity:'0050',defaultRebuyOffset:1,coreHoldingShares:2000,priceTolerance:0.05,amountTolerance:5,feeAllocationMethod:'BY_SHARES'}});
 assert.equal(projectLedger(set,who,pid).settings.defaultRebuyOffset,1);assert.equal(set.auditLogs.at(-1).entityType,'portfolio_settings');
});
test('Securities can be edited, and deleted only when unused',()=>{
 const raw=buildOperation(fixture(),who,pid,{kind:'createSecurity',fields:{symbol:'2317',name:'鴻海'}}),sec=raw.securities.at(-1);
 const ed=buildOperation(raw,who,pid,{kind:'updateSecurity',id:sec.id,fields:{symbol:'2317',name:'鴻海精密',market:'TW',yahooSymbol:'2317.TW',assetType:'STOCK'}});
 assert.equal(ed.securities.at(-1).name,'鴻海精密');
 assert.throws(()=>buildOperation(raw,who,pid,{kind:'updateSecurity',id:sec.id,fields:{symbol:'0050'}}),/已存在/);
 assert.equal(buildOperation(raw,who,pid,{kind:'deleteSecurity',id:sec.id}).securities.some(x=>x.id===sec.id),false);
 assert.equal(projectLedger(raw,who,pid).stocks[sec.id].used,false);assert.equal(projectLedger(raw,who,pid).stocks['sec-0050'].used,true);
});
test('First use: B creates a new ledger only where none exists',async()=>{
 const raw=starterLedger(who,{portfolioName:'我的帳本',brokerId:'broker-fubon',accountName:'富邦主帳戶'}),m=projectLedger(raw,who,'');
 assert.equal(m.portfolios[0].name,'我的帳本');assert.equal(m.accounts.length,2);assert.equal(m.trades.length,0);assert.ok(m.defaultCode);
 // A REST commit with exists:false preconditions: it creates both documents or neither, and never overwrites.
 const docs=new Map(),user={...who,getIdToken:async()=>'id-token'},sdkA=mockSdk(docs,user),calls=[];
 const fetcher=async(url,init)=>{const body=JSON.parse(init.body);calls.push({url,auth:init.headers.Authorization,body});
  if(body.writes.some(w=>w.currentDocument?.exists!==false))return {ok:false,status:400,json:async()=>({})};
  const paths=body.writes.map(w=>w.update.name.split('/documents/')[1]);
  if(paths.some(p=>docs.has(p)))return {ok:false,status:409,json:async()=>({error:{status:'ALREADY_EXISTS'}})};
  body.writes.forEach((w,i)=>docs.set(paths[i],Object.fromEntries(Object.entries(w.update.fields).map(([k,v])=>[k,v.integerValue!==undefined?Number(v.integerValue):v.booleanValue??v.stringValue]))));
  return {ok:true,status:200,json:async()=>({})};};
 const c=await createLedgerClient({projectId:'demo-p'}, {sdk:sdkA.sdk,fetcher});
 await assert.rejects(c.reload(),{code:'stockbook/no-ledger'});
 const model=await c.createLedger({portfolioName:'我的帳本',brokerId:'broker-cathay',accountName:'主帳戶'});
 assert.equal(calls[0].url,'https://firestore.googleapis.com/v1/projects/demo-p/databases/(default)/documents:commit');assert.equal(calls[0].auth,'Bearer id-token');
 assert.equal(model.portfolios[0].name,'我的帳本');assert.equal(docs.get(head).ownerUid,who.uid);assert.equal(docs.get(head).ownerEmail,who.email);assert.equal(docs.get(head).chunkCount,1);
 const acct=model.accounts.find(a=>a.id!=='all').id,after=await c.commit({kind:'upsertCash',fields:{cashType:'DEPOSIT',account:acct,date:taipeiToday(),amount:5000}});
 assert.equal(after.cash[acct],5000);
 const saved=JSON.stringify(docs.get(head));
 await assert.rejects(c.createLedger({}),{code:'stockbook/exists'});assert.equal(JSON.stringify(docs.get(head)),saved,'a second create never overwrites');
 const denied=await createLedgerClient({projectId:'demo-p'}, {sdk:mockSdk(new Map(),user).sdk,fetcher:async()=>({ok:false,status:403,json:async()=>({error:{status:'PERMISSION_DENIED'}})})});
 await assert.rejects(denied.createLedger({}),{code:'stockbook/create-denied'});
 const offline=await createLedgerClient({projectId:'demo-p'}, {sdk:mockSdk(new Map(),user).sdk,fetcher:async()=>{throw new TypeError('Failed to fetch');}});
 await assert.rejects(offline.createLedger({}),{code:'unavailable',message:/連線失敗/});
});
const CSV='﻿證券對帳單\n股名,日期,成交股數,淨收付金額,買賣別,成交價,成本,手續費,交易稅,委託書號\n元大台灣50,2026/09/29,"300","-30,012",現買,"100","30,000","12","0",A1\n元大台灣50,2026/09/30,"100","-10,509",現買,"105","10,500","9","0",A2\n元大台灣50,2026/09/25,"50","-5,002",現買,"100","5,000","2","0",A3\n';
test('CSV import like A: records broker rows, skips duplicates, feeds reconciliation, and batches can be deleted',()=>{
 const raw=fixture();
 assert.throws(()=>buildOperation(raw,who,pid,{kind:'importFile',account:'review-a',text:'a,b\n1,2',filename:'x.csv'}),/header/);
 const next=buildOperation(raw,who,pid,{kind:'importFile',account:'review-a',text:CSV,filename:'對帳單.csv'}),m=projectLedger(next,who,pid);
 assert.equal(next.brokerExecutions.length,3);assert.equal(m.batches[0].created,3);assert.equal(m.batches[0].filename,'對帳單.csv');
 assert.equal(next.auditLogs.at(-1).action,'IMPORT');assert.equal(next.appTransactions.length,raw.appTransactions.length,'CSV never creates trades');
 const status=d=>Object.fromEntries(projectLedger(d,who,pid).reconciliation.map(l=>[l.tradeDate+'/'+l.matchStatus,1]));
 assert.ok(status(next)['2026-09-25/MISSING_IN_APP']);assert.ok(status(next)['2026-09-30/FEE_TAX_DIFF']);
 const again=buildOperation(next,who,pid,{kind:'importFile',account:'review-a',text:CSV,filename:'again.csv'});
 assert.equal(again.brokerExecutions.length,3);assert.equal(projectLedger(again,who,pid).batches[0].duplicate,3);
 // Bulk accept, then deleting the batch also clears those acceptances (A clearAcceptedBrokerDiffsForDeletedData).
 const keys=projectLedger(next,who,pid).reconciliation.filter(l=>['FEE_TAX_DIFF','AMOUNT_DIFF'].includes(l.matchStatus)&&!l.settled).map(l=>l.key);
 assert.ok(keys.length);const accepted=buildOperation(next,who,pid,{kind:'acceptReconciliation',keys});
 assert.equal(Object.keys(accepted.acceptedBrokerDiffs).length,keys.length);
 const removed=buildOperation(accepted,who,pid,{kind:'deleteImportBatch',id:next.importBatches.at(-1).id});
 assert.equal(removed.brokerExecutions.length,0);assert.equal(removed.rawImportRows.length,0);assert.deepEqual(removed.acceptedBrokerDiffs,{});
 assert.equal(removed.appTransactions.length,raw.appTransactions.length);
});
test('JSON ledger import creates trades; deleting the batch removes them',()=>{
 const raw=fixture(),json=JSON.stringify([{id:'j-1',date:'2026-09-20',type:'BUY',symbol:'0050',price:90,shares:10,fee:1,tax:0}]);
 const next=buildOperation(raw,who,pid,{kind:'importFile',account:'review-a',sourceType:'JSON_LEDGER',text:json,filename:'ledger.json'});
 const tx=next.appTransactions.at(-1);assert.equal(tx.sourceType,'JSON_IMPORT');assert.equal(tx.sourceTransactionId,'j-1');
 assert.equal(projectLedger(buildOperation(next,who,pid,{kind:'importFile',account:'review-a',sourceType:'JSON_LEDGER',text:json,filename:'ledger.json'}),who,pid).batches[0].duplicate,1);
 const removed=buildOperation(next,who,pid,{kind:'deleteImportBatch',id:next.importBatches.at(-1).id});
 assert.equal(removed.appTransactions.some(t=>t.id===tx.id),false);
 // A batch whose deposit has already been spent can't be deleted, and the message says why.
 const dep=buildOperation(raw,who,pid,{kind:'importFile',account:'review-a',sourceType:'JSON_LEDGER',text:JSON.stringify([{id:'j-dep',date:'2026-09-20',type:'DEPOSIT',price:500000,shares:0,fee:0,tax:0}]),filename:'cash.json'});
 const spent=buildOperation(dep,who,pid,{kind:'upsertTransaction',fields:fields({qty:3000,price:100,fee:0})});
 assert.throws(()=>buildOperation(spent,who,pid,{kind:'deleteImportBatch',id:dep.importBatches.at(-1).id}),/這批匯入的入出金已被之後的交易使用/);
});
test('Import templates can be added and removed; the default stays',()=>{
 const raw=fixture();
 assert.throws(()=>buildOperation(raw,who,pid,{kind:'createTemplate',fields:{name:'自訂',brokerId:'broker-fubon',mapping:'{bad'}}),/JSON/);
 const next=buildOperation(raw,who,pid,{kind:'createTemplate',fields:{name:'富邦 CSV',brokerId:'broker-fubon',mapping:'{"tradeDate":"成交日"}'}});
 const t=projectLedger(next,who,pid).templates.find(x=>x.name==='富邦 CSV');assert.equal(t.mapping.tradeDate,'成交日');
 assert.throws(()=>buildOperation(next,who,pid,{kind:'deleteTemplate',id:'tpl-cathay-default'}),/不能刪除/);
 assert.equal(projectLedger(buildOperation(next,who,pid,{kind:'deleteTemplate',id:t.id}),who,pid).templates.some(x=>x.id===t.id),false);
});
test('Reports use A\'s report model: 0050 benchmark, P&L, PDF and Excel documents',()=>{
 const raw=fixture(),before=JSON.stringify(raw),r=reportView(raw,who,pid);
 assert.ok(!r.empty,r.empty);assert.ok(r.model.reportDate);assert.ok(r.model.benchmark);assert.ok(Array.isArray(r.insights)&&r.insights.length);
 assert.equal(typeof r.quality.winRate,'number');assert.equal(typeof r.cashflow.totalAssets,'number');
 const pdf=reportPdf(raw,who,pid);assert.match(pdf.html,/<html/i);assert.ok(pdf.html.includes(pdf.model.reportDate));
 assert.match(reportXls(raw,who,pid),/0050 操作績效追蹤/);
 const one=reportView(raw,who,pid,'review-a');assert.ok(one.empty||one.model.transactions.every(t=>t.brokerAccountId==='review-a'));
 assert.equal(JSON.stringify(raw),before,'Reports must not mutate the ledger');
 assert.ok(reportView(starterLedger(who),who,'').empty,'An empty ledger reports that there is no data');
});
test('Backfills missing 0050 benchmark prices on deposits and withdrawals only',()=>{
 const raw=fixture();raw.appTransactions.filter(t=>['DEPOSIT','WITHDRAW'].includes(t.transactionType)).forEach(t=>{delete t.benchmarkPrice;});
 const missing=missingBenchmarks(raw,who,pid);assert.ok(missing.length>0);
 const b={benchmarkSecurityId:'sec-0050',benchmarkSymbol:'0050',benchmarkPrice:101.234,benchmarkPriceSource:'TEST',benchmarkPriceDate:'2026-01-02',benchmarkPriceCapturedAt:'2026-01-02T00:00:00Z'};
 const next=buildOperation(raw,who,pid,{kind:'backfillBenchmarks',rows:missing.map(m=>({id:m.id,fields:b}))});
 assert.equal(missingBenchmarks(next,who,pid).length,0);assert.equal(next.appTransactions.find(t=>t.id===missing[0].id).benchmarkPrice,101.23);
 assert.throws(()=>buildOperation(next,who,pid,{kind:'backfillBenchmarks',rows:missing.map(m=>({id:m.id,fields:b}))}),/已改變/);
 const buy=raw.appTransactions.find(t=>t.transactionType==='BUY');
 assert.throws(()=>buildOperation(raw,who,pid,{kind:'backfillBenchmarks',rows:[{id:buy.id,fields:b}]}),/已改變/);
 assert.throws(()=>buildOperation(raw,who,pid,{kind:'backfillBenchmarks',rows:[{id:missing[0].id,fields:{}}]}),/查不到/);
});
test('JSON backup uses A\'s stockbook-backup-v2 format; restore replaces the ledger and rejects a damaged file',async()=>{
 const raw=fixture(),env=await mobileBackupEnvelope(raw,who,pid);
 assert.equal(env.format,'stockbook-backup-v2');assert.equal(env.schemaVersion,2);assert.equal(env.checksum.algorithm,'SHA-256');assert.match(env.checksum.value,/^[0-9a-f]{64}$/);
 const state=await mobileParseBackup(JSON.parse(JSON.stringify(env)));assert.equal(state.appTransactions.length,raw.appTransactions.length);
 const tampered=JSON.parse(JSON.stringify(env));tampered.state.appTransactions[0].price=999;
 await assert.rejects(mobileParseBackup(tampered),/驗證失敗/);
 // Change the ledger, then restore the earlier backup: the new trade disappears, and the restore is audited.
 const changed=buildOperation(raw,who,pid,{kind:'upsertTransaction',fields:fields()});
 assert.equal(contentCount(changed),contentCount(raw)+1);
 const restored=buildOperation(changed,who,pid,{kind:'restoreBackup',state,createdAt:env.createdAt,source:env.source});
 assert.equal(restored.appTransactions.length,raw.appTransactions.length);
 assert.equal(restored.auditLogs.at(-1).action,'RESTORE_BACKUP');assert.deepEqual(restored.extraUnknown,raw.extraUnknown);
 assert.deepEqual(projectLedger(restored,who,pid).cash,projectLedger(raw,who,pid).cash);
 assert.throws(()=>buildOperation(raw,who,pid,{kind:'restoreBackup',state:{}}),/不正確/);
});
test('Review fixes: lent buys, cost-exchanged buys, negative cash and ledger permissions',()=>{
 const raw=fixture();
 // 1. Shrinking a buy that a borrow sell lends from is rejected once the source lots can no longer cover the lent shares.
 const lent=buildOperation(raw,who,pid,{kind:'upsertTransaction',fields:fields({type:'sell',borrow:'sell',qty:250,price:112,fee:0,tax:0,sources:'demo-buy-pm,demo-buy-a'})});
 const t=lent.appTransactions.find(x=>x.id==='demo-buy-pm'),edit=o=>({kind:'upsertTransaction',id:'demo-buy-pm',fields:fields({date:t.tradeDate,account:t.brokerAccountId,qty:t.shares,price:t.price,fee:t.fee,tax:t.tax,...o})});
 assert.throws(()=>buildOperation(lent,who,pid,edit({qty:1})),/借不到足夠庫存/);
 assert.ok(buildOperation(lent,who,pid,edit({qty:60})),'200 + 60 still covers 250');
 assert.ok(buildOperation(lent,who,pid,edit({note:'只改備註'})));
 // 2. A buy touched by a cost exchange can't change size or price until the exchange is undone.
 const base=buildOperation(raw,who,pid,{kind:'upsertTransaction',fields:fields({date:'2026-10-01',qty:100,price:120,fee:0})}),extra=base.appTransactions.at(-1);
 const ex=buildOperation(base,who,pid,{kind:'createCostExchange',fields:{source:'demo-buy-pm',externalPrice:95,date:'2026-10-02',label:'外部',targets:[{id:extra.id,reduction:1}]}});
 const xedit=(id,o)=>{const b=ex.appTransactions.find(x=>x.id===id);return {kind:'upsertTransaction',id,fields:fields({date:b.tradeDate,account:b.brokerAccountId,qty:b.shares,price:b.price,fee:b.fee,tax:b.tax,...o})};};
 assert.throws(()=>buildOperation(ex,who,pid,xedit(extra.id,{qty:50,price:200})),/成本交換/);
 assert.throws(()=>buildOperation(ex,who,pid,xedit('demo-buy-pm',{price:90})),/成本交換/);
 assert.ok(buildOperation(ex,who,pid,xedit(extra.id,{note:'備註可以改'})));
 // Low: deleting a deposit can't leave the account below zero.
 assert.throws(()=>buildOperation(raw,who,pid,{kind:'deleteTransaction',id:'demo-deposit'}),/現金會變成/);
 // Low: renaming another portfolio needs edit rights on that portfolio.
 const shared=structuredClone(raw);shared.portfolios.push({id:'other-p',userId:'someone',name:'別人的帳本'});shared.portfolioMembers.push({id:'m2',portfolioId:'other-p',userId:'review-user',role:'VIEWER'});
 assert.throws(()=>buildOperation(shared,who,pid,{kind:'upsertPortfolio',id:'other-p',fields:{name:'改名'}}),/權限|找不到/);
});
