import { projectLedger, buildOperation, estimateCosts, sellOptions, borrowOptions, exchangePreview, starterLedger, reportView, reportPdf, reportXls, missingBenchmarks, contentCount } from './model.js';
import { mobileBackupEnvelope, mobileParseBackup } from './legacy-engine.js';
import { DRIVE_SCOPE, listCsvFiles, downloadCsv, folderName } from './drive-import.js';
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
export async function createLedgerClient(config,{sdk:injected=null,functionsSdk=null,fetcher=(...a)=>fetch(...a),onAuthChange=()=>{},onSyncChange=()=>{}}={}){
 const [appModule,authModule,firestoreModule]=injected||await Promise.all([import(SDK+'firebase-app.js'),import(SDK+'firebase-auth.js'),import(SDK+'firebase-firestore.js')]);
 const app=appModule.initializeApp(config,'stockbook-mobile-b'),auth=authModule.getAuth(app),db=firestoreModule.getFirestore(app);
 let baseline=null,raw=null,model=null,customNamespace='',busy=false,epoch=0,emailLoginPending=false;
 // confirmed: the ledger as last read from or written to the cloud. raw/model may be ahead of it while saves are syncing.
 let confirmed=null,queued=null,flushing=null;
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
  await idle();
  const who=identity(),ticket=++epoch,ns=namespaceFor(who.email,namespace),shot=await readSnapshot(ns);
  const next=typeof shot.payload==='string'?await decodeLedger(shot.payload):structuredClone(shot.payload);
  const projected=projectLedger(next,who,portfolioId,account);projected.updatedAt=shot.main.updatedAt||'';
  if(ticket!==epoch||auth.currentUser?.uid!==who.uid)throw new Error('登入狀態已改變，請重新載入。');
  baseline=shot;raw=next;confirmed=next;model=projected;customNamespace=namespace;
  return model;
 }
 // First use: Firestore rules can't read a document that doesn't exist, so a read-then-write transaction can't tell "missing" from "denied".
 // B therefore creates the head and chunk_0 in one REST commit with an exists:false precondition: it can only create, never overwrite,
 // even when two devices (or A's first sync) create the same ledger at the same moment. The create rule still checks the owner.
 async function createOnly(ns,docs){
  const user=auth.currentUser,token=await user.getIdToken(),base='projects/'+config.projectId+'/databases/(default)/documents/';
  const value=v=>typeof v==='boolean'?{booleanValue:v}:Number.isInteger(v)?{integerValue:String(v)}:{stringValue:String(v)};
  const writes=docs.map(([path,data])=>({update:{name:base+path,fields:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,value(v)]))},currentDocument:{exists:false}}));
  let response;
  try{response=await fetcher('https://firestore.googleapis.com/v1/'+base.slice(0,-1)+':commit',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({writes})});}
  catch(error){throw Object.assign(new Error('連線失敗，無法確認帳本是否已建立。請重新載入；若已建立就會直接開啟。'),{code:'unavailable',cause:error});}
  if(response.ok)return;
  const status=(await response.json().catch(()=>({})))?.error?.status||'';
  if(response.status===409||status==='ALREADY_EXISTS'||status==='FAILED_PRECONDITION')throw Object.assign(new Error('雲端已經有這個帳本，請重新載入，不會建立新帳本。'),{code:'stockbook/exists'});
  if(response.status===403||status==='PERMISSION_DENIED')throw Object.assign(new Error('沒有權限建立這個帳本名稱。它可能屬於其他帳號，請確認登入的帳號與帳本名稱。'),{code:'stockbook/create-denied'});
  throw Object.assign(new Error('建立帳本失敗（'+(status||response.status)+'），請稍後再試。'),{code:'unavailable'});
 }
 async function createLedger(options={}){
  if(busy)throw new Error('正在儲存，請稍候。');
  const who=identity(),wanted=options.namespace??customNamespace,ns=namespaceFor(who.email,wanted);
  const raw0=starterLedger(who,options),payload=await compressLedger(raw0),updatedAt=new Date().toISOString(),bRevision=crypto.randomUUID();
  if(payload.length>800000)throw new Error('新帳本資料異常，未建立。');
  busy=true;
  try{await createOnly(ns,[['stockLedgers/'+ns,{namespace:ns,ownerUid:who.uid,ownerEmail:who.email,updatedAt,chunkCount:1,isCompressed:true,bRevision}],['stockLedgers/'+ns+'/chunks/chunk_0',{index:0,data:payload,ownerUid:who.uid,updatedAt}]]);}
  finally{busy=false;}
  return reload({namespace:wanted});
 }
 // Saving feels instant, like A: the change is checked and shown at once, then written to the cloud in the background.
 // Each write still checks the cloud against the last version B read or wrote, so A's or another device's edits are never overwritten.
 // Saves made while one is syncing are merged into the next write. If a write fails, B reloads the cloud ledger
 // (so the screen never shows changes that are not in the cloud) and reports it through onSyncChange.
 async function commit(operation,{wait=false}={}){
  if(busy)throw new Error('正在儲存，請勿重複送出。');
  if(!baseline||!raw||!model)throw new Error('請先載入原本的雲端帳本。');
  const who=identity(),base=baseline,ticket=epoch,priorModel=model;
  if(base.ns!==namespaceFor(who.email,customNamespace))throw new Error('帳本名稱已改變，請重新載入。');
  const candidate=buildOperation(raw,who,priorModel.portfolioId,operation);
  const projected=projectLedger(candidate,who,priorModel.portfolioId,priorModel.account);projected.updatedAt=priorModel.updatedAt;
  raw=candidate;model=projected;
  queued={raw:candidate,who,ticket,count:(queued?.count||0)+1};
  const done=flush();
  if(wait){await done;return model;}
  done.catch(()=>{});
  return model;
 }
 function syncing(){return !!(flushing||queued);}
 function notify(extra={}){try{onSyncChange({pending:syncing(),...extra},client);}catch(error){console.error(error);}}
 async function idle(){while(flushing)await flushing.catch(()=>{});}
 function flush(){
  if(flushing)return flushing;
  flushing=(async()=>{
   let failure=null,lost=0,ticket=epoch;
   while(queued&&!failure){
    const job=queued;queued=null;lost=job.count;ticket=job.ticket;notify();
    try{await write(job);}catch(error){failure=error;lost+=queued?.count||0;queued=null;}
   }
   flushing=null;
   if(!failure){notify();return;}
   if(ticket===epoch){
    // Never leave unsaved changes on screen: fall back to the last cloud version, then try to read the newest one.
    baseline=null;
    if(confirmed){raw=confirmed;try{const who=identity();model=projectLedger(raw,who,model?.portfolioId||'',model?.account||'all');}catch{}}
    try{await reload();}catch(error){console.error(error);}
   }
   notify({error:failure,lost});
   throw failure;
  })();
  return flushing;
 }
 async function write({raw:candidate,who,ticket}){
  const base=baseline;
  if(epoch!==ticket||auth.currentUser?.uid!==who.uid)throw new Error('登入狀態已改變，儲存已取消。');
  if(!base)throw new Error('請先載入原本的雲端帳本。');
  const payload=await compressLedger(candidate),chunks=[];
  for(let i=0;i<payload.length;i+=800000)chunks.push(payload.slice(i,i+800000));
  if(chunks.length>200)throw new Error('帳本超過 B 版可儲存的大小，這次未修改雲端資料。');
  const updatedAt=new Date().toISOString(),bRevision=crypto.randomUUID();
  await firestoreModule.runTransaction(db,async tx=>{
   if(epoch!==ticket||auth.currentUser?.uid!==who.uid)throw new Error('登入狀態已改變，儲存已取消。');
   // Head and chunks are read together (one round trip instead of two); the checks are unchanged.
   const headRef=firestoreModule.doc(db,'stockLedgers',base.ns),oldRefs=refs(base.ns,base.chunks.length);
   const [head,...oldShots]=await Promise.all([headRef,...oldRefs].map(ref=>tx.get(ref)));
   if(!head.exists()||canonical(head.data())!==canonical(base.main))throw conflictError();
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
  baseline={ns:base.ns,main:{...base.main,namespace:base.ns,ownerUid:who.uid,ownerEmail:who.email,updatedAt,chunkCount:chunks.length,isCompressed:true,bRevision},chunks:chunks.map((data,index)=>({index,data,ownerUid:who.uid,updatedAt})),payload};
  delete baseline.main.state;confirmed=candidate;
  if(model)model.updatedAt=updatedAt;
 }
 // Google Drive backup uses A's existing Cloud Functions (asia-east1); the functions themselves are unchanged.
 let functions=null;
 async function callFunction(name,data={}){
  identity();
  if(!functions){const mod=functionsSdk||await import(SDK+'firebase-functions.js');functions={mod,instance:mod.getFunctions(app,'asia-east1')};}
  return (await functions.mod.httpsCallable(functions.instance,name)(data)).data;
 }
 // Drive import reads the person's own Drive with a short-lived Google access token from a Google re-sign-in (read-only scope).
 let driveAccess=null;
 async function driveToken(force=false){
  const user=auth.currentUser;identity();
  if(!force&&driveAccess&&driveAccess.uid===user.uid&&driveAccess.expires>Date.now())return driveAccess.token;
  const provider=new authModule.GoogleAuthProvider();provider.addScope(DRIVE_SCOPE);provider.setCustomParameters({login_hint:user.email});
  const result=await authModule.reauthenticateWithPopup(user,provider);
  if(result.user.uid!==user.uid)throw Object.assign(new Error('請用同一個 Google 帳號授權。'),{code:'auth/user-mismatch'});
  const token=authModule.GoogleAuthProvider.credentialFromResult(result)?.accessToken;
  if(!token)throw Object.assign(new Error('Google 沒有提供 Drive 授權，請再試一次並允許讀取 Drive。'),{code:'drive/no-token'});
  driveAccess={uid:user.uid,token,expires:Date.now()+50*60*1000};return token;
 }
 async function withDrive(run){try{return await run(await driveToken());}catch(error){if(error?.code!=='drive/unauthorized')throw error;return run(await driveToken(true));}}
 function loaded(){if(!raw||!model)throw new Error('請先載入帳本。');return identity();}
 const client={
  nativeAuth,
  async signInPassword(email,password){
   if(emailLoginPending)throw Object.assign(new Error('正在登入。'),{code:'auth/native-busy'});
   emailLoginPending=true;
   try{return await nativeAuth.signInPassword(email,password);}
   finally{emailLoginPending=false;publishAuth(auth.currentUser);}
  },
  async signIn(redirect=false){const provider=new authModule.GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});if(redirect)return authModule.signInWithRedirect(auth,provider);return authModule.signInWithPopup(auth,provider);},
  async signOut(){epoch++;driveAccess=null;baseline=null;raw=null;confirmed=null;queued=null;model=null;return authModule.signOut(auth);},
  reload,commit,createLedger,idle,
  view(){return model;},
  select(portfolioId,account='all'){if(!raw)throw new Error('請先載入帳本。');model=projectLedger(raw,identity(),portfolioId,account);model.updatedAt=baseline?.main.updatedAt||'';return model;},
  costs(fields){if(!raw||!model)return {fee:0,tax:0};return estimateCosts(raw,identity(),model.portfolioId,fields);},
  sellOptions(fields){if(!raw||!model)return [];return sellOptions(raw,identity(),model.portfolioId,fields);},
  borrowOptions(fields){if(!raw||!model)return [];return borrowOptions(raw,identity(),model.portfolioId,fields);},
  exchangePreview(fields){if(!raw||!model)throw new Error('請先載入帳本。');return exchangePreview(raw,identity(),model.portfolioId,fields);},
  report(account=model?.account||'all'){const who=loaded();return reportView(raw,who,model.portfolioId,account);},
  reportPdf(account=model?.account||'all'){const who=loaded();return reportPdf(raw,who,model.portfolioId,account);},
  reportXls(account=model?.account||'all'){const who=loaded();return reportXls(raw,who,model.portfolioId,account);},
  missingBenchmarks(account=model?.account||'all'){const who=loaded();return missingBenchmarks(raw,who,model.portfolioId,account);},
  backup(source='LOCAL_EXPORT'){const who=loaded();return mobileBackupEnvelope(raw,who,model.portfolioId,source);},
  async readBackup(text){let parsed;try{parsed=JSON.parse(text);}catch{throw new Error('備份檔不是有效的 JSON。');}const state=await mobileParseBackup(parsed);if(!state||typeof state!=='object'||!Array.isArray(state.appTransactions))throw new Error('備份檔缺少交易資料。');return {state,createdAt:parsed.createdAt||'',source:parsed.source||'',incoming:contentCount(state),current:contentCount(raw)};},
  driveFiles(folderId){return withDrive(token=>listCsvFiles(folderId,token,fetcher));},
  driveFolderName(folderId){return withDrive(token=>folderName(folderId,token,fetcher));},
  driveDownload(file){return withDrive(token=>downloadCsv(file,token,fetcher));},
  driveStatus(){return callFunction('getBackupStatus');},
  driveConnect(){return callFunction('startDriveAuthorization',{namespace:baseline?.ns||namespaceFor(identity().email,customNamespace)});},
  driveRunNow(){return callFunction('runBackupNow');},
  driveDisconnect(){return callFunction('disconnectDrive');},
  get user(){return auth.currentUser;},get namespace(){return baseline?.ns||'';},get busy(){return busy;},get syncing(){return syncing();}
 };
 function publishAuth(user){epoch++;driveAccess=null;baseline=null;raw=null;confirmed=null;queued=null;model=null;onAuthChange(user,client);}
 authModule.onAuthStateChanged(auth,user=>{if(!emailLoginPending)publishAuth(user);});
 try{nativeAuth.completeRedirectReauthentication(await authModule.getRedirectResult(auth));}catch(error){onAuthChange(auth.currentUser,client,error);}
 return client;
}
