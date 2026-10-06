import test from 'node:test';
// Core transaction and SDK boundary tests use synthetic fixtures only.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {projectLedger,buildOperation,sellOptions,taipeiToday,minimalLots,CATEGORIES} from '../public/model.js';
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
 assert.equal(model.portfolioId,pid);assert.equal(model.trades.length,4);
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
 assert.throws(()=>buildOperation(raw,who,pid,{kind:'upsertTransaction',id:old.id,fields:fields({qty:old.shares-1,price:old.price,fee:old.fee,date:old.tradeDate})}),/引用/);
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
