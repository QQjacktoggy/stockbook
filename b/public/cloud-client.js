import { projectLedger, buildOperation, estimateCosts, sellOptions, borrowOptions, exchangePreview, starterLedger } from './model.js';
import {createNativeAuth,nativeAuthError} from './native-auth.js';
const SDK='https://www.gstatic.com/firebasejs/10.12.5/';
export function namespaceFor(email,custom=''){const value=String(custom||String(email||'').toLowerCase()).trim().replace(/[^a-zA-Z0-9._-]/g,'_');if(!value)throw new Error('找不到帳本名稱。');return value;}
export function canonical(value){if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';}
export async function compressLedger(raw){
 const response=new Response(new Blob([JSON.stringify(raw)]).stream().pipeThrough(new CompressionStream('gzip'))),bytes=new Uint8Array(await response.arrayBuffer());
 let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
 return btoa(binary);
}
export async function decodeLedger(payload){
 const binary=atob(payload),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
 return JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
}
export function noLedgerError(){const e=new Error('這個帳號還沒有雲端帳本。可以在 B 版建立新帳本，或確認自訂帳本名稱。');e.code='stockbook/no-ledger';return e;}
export function conflictError(){const e=new Error('A 版或其他裝置已更新帳本。這次未儲存；請重新載入最新資料後再修改。');e.code='stockbook/conflict';return e;}
export function errorText(error){
 const code=String(error?.code||'');
 if(code.includes('unauthorized-domain'))return 'B 版網址尚未加入 Google 登入的授權網域，請先在 Firebase Authentication 設定。';
 if(code.startsWith('auth/'))return nativeAuthError(error);
 if(code.includes('permission-denied'))return '沒有這份雲端帳本的權限，請使用 A 版相同的 Google 帳號，並確認帳本名稱。';
 if(code.includes('popup-blocked'))return '登入視窗被擋住；請使用下方「重新導向登入」。';
 if(code.includes('popup-closed-by-user')||code.includes('cancelled-popup-request'))return '登入已取消。';
 if(code.includes('network-request-failed')||code.includes('unavailable'))return '連線失敗，無法確認操作是否完成。請重新載入並檢查這筆交易後再操作。';
 return error?.message||'操作失敗，請重試。';
}
export async function createLedgerClient(config,{sdk:injected=null,onAuthChange=()=>{}}={}){
 const [appModule,authModule,firestoreModule]=injected||await Promise.all([import(SDK+'firebase-app.js'),import(SDK+'firebase-auth.js'),import(SDK+'firebase-firestore.js')]);
 const app=appModule.initializeApp(config,'stockbook-mobile-b'),auth=authModule.getAuth(app),db=firestoreModule.getFirestore(app);
 let baseline=null,raw=null,model=null,customNamespace='',busy=false,epoch=0,emailLoginPending=false;
 const nativeAuth=createNativeAuth({auth,sdk:authModule,getEpoch:()=>epoch,getLedgerContext:()=>baseline?{ownerUid:baseline.main.ownerUid,namespace:baseline.ns}:null});
 function identity(){const u=auth.currentUser;if(!u?.email||!u.emailVerified)throw new Error('請使用已驗證的 Google 帳號登入。');return {uid:u.uid,email:u.email,displayName:u.displayName||''};}
 function refs(ns,count){return Array.from({length:count},(_,i)=>firestoreModule.doc(db,'stockLedgers',ns,'chunks','chunk_'+i));}
 async function readSnapshot(ns){
  return firestoreModule.runTransaction(db,async tx=>{
   const headRef=firestoreModule.doc(db,'stockLedgers',ns),head=await tx.get(headRef);
   if(!head.exists())throw noLedgerError();
   const main=head.data();
   if(main.state){if(typeof main.state!=='object')throw new Error('雲端帳本格式不正確。');return {ns,main,chunks:[],payload:main.state};}
   if(!Number.isInteger(main.chunkCount)||main.chunkCount<1||main.chunkCount>200)throw new Error('帳本資料區塊數量不正確。');
   const shots=await Promise.all(refs(ns,main.chunkCount).map(ref=>tx.get(ref)));
   const chunks=shots.map((shot,i)=>{if(!shot.exists()||typeof shot.data().data!=='string')throw new Error('雲端帳本缺少資料區塊 '+i+'，未修改資料。');return shot.data();});
   return {ns,main,chunks,payload:chunks.map(c=>c.data).join('')};
  });
 }
 async function reload({namespace=customNamespace,portfolioId=model?.portfolioId||'',account=model?.account||'all'}={}){
  if(busy)throw new Error('正在儲存，請稍候。');
  const who=identity(),ticket=++epoch,ns=namespaceFor(who.email,namespace),shot=await readSnapshot(ns);
  const next=typeof shot.payload==='string'?await decodeLedger(shot.payload):structuredClone(shot.payload);
  const projected=projectLedger(next,who,portfolioId,account);projected.updatedAt=shot.main.updatedAt||'';
  if(ticket!==epoch||auth.currentUser?.uid!==who.uid)throw new Error('登入狀態已改變，請重新載入。');
  baseline=shot;raw=next;model=projected;customNamespace=namespace;
  return model;
 }
 // First use: write a new ledger only where none exists. A ledger this account owns is always readable (firestore.rules),
 // so a denied read means there is nothing of ours to overwrite; the create rule then rejects anything owned by someone else.
 async function createLedger(options={}){
  if(busy)throw new Error('正在儲存，請稍候。');
  const who=identity(),wanted=options.namespace??customNamespace,ns=namespaceFor(who.email,wanted),headRef=firestoreModule.doc(db,'stockLedgers',ns);
  const raw0=starterLedger(who,options),payload=await compressLedger(raw0),updatedAt=new Date().toISOString(),bRevision=crypto.randomUUID();
  const main={namespace:ns,ownerUid:who.uid,ownerEmail:who.email,updatedAt,chunkCount:1,isCompressed:true,bRevision};
  if(payload.length>800000)throw new Error('新帳本資料異常，未建立。');
  busy=true;
  try{
   let readable=true;
   try{await firestoreModule.runTransaction(db,async tx=>{const head=await tx.get(headRef);if(head.exists())throw Object.assign(new Error('雲端已經有這個帳本，請重新載入，不會建立新帳本。'),{code:'stockbook/exists'});tx.set(headRef,main);tx.set(refs(ns,1)[0],{index:0,data:payload,ownerUid:who.uid,updatedAt});});}
   catch(error){if(!String(error?.code||'').includes('permission-denied'))throw error;readable=false;}
   if(!readable)await firestoreModule.runTransaction(db,async tx=>{tx.set(headRef,main);tx.set(refs(ns,1)[0],{index:0,data:payload,ownerUid:who.uid,updatedAt});});
  }finally{busy=false;}
  return reload({namespace:wanted});
 }
 async function commit(operation){
  if(busy)throw new Error('正在儲存，請勿重複送出。');
  if(!baseline||!raw||!model)throw new Error('請先載入原本的雲端帳本。');
  const who=identity(),base=baseline,ticket=epoch,priorModel=model;
  if(base.ns!==namespaceFor(who.email,customNamespace))throw new Error('帳本名稱已改變，請重新載入。');
  busy=true;
  try{
   const candidate=buildOperation(raw,who,priorModel.portfolioId,operation),payload=await compressLedger(candidate),chunks=[];
   for(let i=0;i<payload.length;i+=800000)chunks.push(payload.slice(i,i+800000));
   if(chunks.length>200)throw new Error('帳本超過 B 版可儲存的大小，這次未修改雲端資料。');
   const updatedAt=new Date().toISOString(),bRevision=crypto.randomUUID();
   await firestoreModule.runTransaction(db,async tx=>{
    if(epoch!==ticket||auth.currentUser?.uid!==who.uid)throw new Error('登入狀態已改變，儲存已取消。');
    const headRef=firestoreModule.doc(db,'stockLedgers',base.ns),head=await tx.get(headRef);
    if(!head.exists()||canonical(head.data())!==canonical(base.main))throw conflictError();
    const oldRefs=refs(base.ns,base.chunks.length),oldShots=await Promise.all(oldRefs.map(ref=>tx.get(ref)));
    oldShots.forEach((shot,i)=>{if(!shot.exists()||canonical(shot.data())!==canonical(base.chunks[i]))throw conflictError();});
    if(epoch!==ticket||auth.currentUser?.uid!==who.uid)throw new Error('登入狀態已改變，儲存已取消。');
    const main={...base.main,namespace:base.ns,ownerUid:who.uid,ownerEmail:who.email,updatedAt,chunkCount:chunks.length,isCompressed:true,bRevision};
    delete main.state;
    tx.set(headRef,main);
    const nextRefs=refs(base.ns,chunks.length);
    chunks.forEach((data,index)=>tx.set(nextRefs[index],{index,data,ownerUid:who.uid,updatedAt}));
    for(let i=chunks.length;i<base.chunks.length;i++)tx.delete(oldRefs[i]);
   });
   // Clear the old baseline immediately: a failed verification cannot trigger another stale write.
   baseline=null;
   if(epoch!==ticket||auth.currentUser?.uid!==who.uid)throw new Error('雲端儲存已完成，但登入狀態已改變，請重新登入確認。');
   const projected=projectLedger(candidate,who,priorModel.portfolioId,priorModel.account);projected.updatedAt=updatedAt;
   baseline={ns:base.ns,main:{...base.main,namespace:base.ns,ownerUid:who.uid,ownerEmail:who.email,updatedAt,chunkCount:chunks.length,isCompressed:true,bRevision},chunks:chunks.map((data,index)=>({index,data,ownerUid:who.uid,updatedAt})),payload};
   delete baseline.main.state;raw=candidate;model=projected;
   return model;
  }finally{busy=false;}
 }
 const client={
  nativeAuth,
  async signInPassword(email,password){
   if(emailLoginPending)throw Object.assign(new Error('正在登入。'),{code:'auth/native-busy'});
   emailLoginPending=true;
   try{return await nativeAuth.signInPassword(email,password);}
   finally{emailLoginPending=false;publishAuth(auth.currentUser);}
  },
  async signIn(redirect=false){const provider=new authModule.GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});if(redirect)return authModule.signInWithRedirect(auth,provider);return authModule.signInWithPopup(auth,provider);},
  async signOut(){epoch++;baseline=null;raw=null;model=null;return authModule.signOut(auth);},
  reload,commit,createLedger,
  view(){return model;},
  select(portfolioId,account='all'){if(!raw)throw new Error('請先載入帳本。');model=projectLedger(raw,identity(),portfolioId,account);model.updatedAt=baseline?.main.updatedAt||'';return model;},
  costs(fields){if(!raw||!model)return {fee:0,tax:0};return estimateCosts(raw,identity(),model.portfolioId,fields);},
  sellOptions(fields){if(!raw||!model)return [];return sellOptions(raw,identity(),model.portfolioId,fields);},
  borrowOptions(fields){if(!raw||!model)return [];return borrowOptions(raw,identity(),model.portfolioId,fields);},
  exchangePreview(fields){if(!raw||!model)throw new Error('請先載入帳本。');return exchangePreview(raw,identity(),model.portfolioId,fields);},
  get user(){return auth.currentUser;},get namespace(){return baseline?.ns||'';},get busy(){return busy;}
 };
 function publishAuth(user){epoch++;baseline=null;raw=null;model=null;onAuthChange(user,client);}
 authModule.onAuthStateChanged(auth,user=>{if(!emailLoginPending)publishAuth(user);});
 try{nativeAuth.completeRedirectReauthentication(await authModule.getRedirectResult(auth));}catch(error){onAuthChange(auth.currentUser,client,error);}
 return client;
}
