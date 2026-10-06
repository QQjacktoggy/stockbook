// Account linking keeps the existing Firebase UID; passwords go only to Firebase Auth.
export const NATIVE_OWNER=Object.freeze({uid:'2xsPbE2S4sMFLWgTMP9ITOywt6D3',email:'punktoggy@gmail.com',namespace:'punktoggy_gmail.com'});
const failure=code=>Object.assign(new Error('登入或帳號設定未完成。'),{code});
const normalized=value=>String(value||'').trim().toLowerCase();
const providers=user=>(user?.providerData||[]).map(row=>row.providerId);
export function nativeAuthError(error){
 const code=String(error?.code||'');
 if(['auth/invalid-credential','auth/wrong-password','auth/user-not-found','auth/invalid-email','auth/native-identity-mismatch'].includes(code))return 'Email 或密碼不正確，請使用原有 Google 帳號登入確認。';
 if(code==='auth/operation-not-allowed')return 'Email／密碼登入尚未啟用，請先使用 Google 登入；啟用後再設定密碼。';
 if(['auth/credential-already-in-use','auth/email-already-in-use','auth/account-exists-with-different-credential'].includes(code))return '這組登入資料已屬於其他帳號。請停止設定並使用原有 Google 登入，不建立或合併帳號。';
 if(code==='auth/provider-already-linked')return '此帳號已有密碼登入，請使用既有密碼或由本人點選「寄送密碼重設信」。';
 if(['auth/requires-recent-login','auth/native-reauth-required','auth/user-token-expired','auth/invalid-user-token'].includes(code))return '請先重新驗證 Google 身分，再自行提交新密碼。';
 if(['auth/user-mismatch','auth/native-owner-required','auth/native-cancelled'].includes(code))return '登入身分或帳本已改變，設定已停止。請回到原帳本重新驗證。';
 if(['auth/weak-password','auth/native-password-invalid','auth/password-does-not-meet-requirements'].includes(code))return '兩次密碼必須相同，至少 12 個字元，並符合 Firebase 的密碼要求。';
 if(code==='auth/too-many-requests')return '嘗試次數過多，請稍後再試。';
 if(['auth/popup-closed-by-user','auth/cancelled-popup-request'].includes(code))return 'Google 身分驗證已取消。';
 if(code==='auth/popup-blocked')return '驗證視窗被阻擋，請使用重新導向驗證。';
 if(code==='auth/network-request-failed')return '連線失敗，請重新登入確認目前設定；不要重複建立帳號。';
 if(code==='auth/native-busy')return '正在處理帳號登入或設定，請稍候。';
 return '登入或帳號設定未完成，請使用原有 Google 登入確認。';
}
export function createNativeAuth({auth,sdk,getLedgerContext,getEpoch=()=>0,owner=NATIVE_OWNER,now=()=>Date.now()}){
 let pending=false,confirmedEpoch=null,redirectOwnerUid=null;
 function recentGoogle(info){return info.claims.firebase?.sign_in_provider==='google.com'&&Number.isFinite(info.claims.auth_time)&&Math.abs(now()/1000-info.claims.auth_time)<=300;}
 function matches(user){return !!user&&user.uid===owner.uid&&normalized(user.email)===normalized(owner.email)&&user.emailVerified===true&&providers(user).includes('google.com');}
 function isOwner(){const context=getLedgerContext();return matches(auth.currentUser)&&context?.ownerUid===owner.uid&&context.namespace===owner.namespace;}
 function capture(){if(!isOwner())throw failure('auth/native-owner-required');return {user:auth.currentUser,epoch:getEpoch()};}
 function current(ticket){if(auth.currentUser!==ticket.user||getEpoch()!==ticket.epoch||!isOwner())throw failure('auth/native-cancelled');}
 async function refreshed(ticket){await sdk.reload(ticket.user);current(ticket);return ticket.user;}
 async function serial(operation){if(pending)throw failure('auth/native-busy');pending=true;try{return await operation();}finally{pending=false;}}
 async function status(){
  const ticket=capture(),user=await refreshed(ticket);
  if(redirectOwnerUid===owner.uid){const info=await sdk.getIdTokenResult(user,true);current(ticket);confirmedEpoch=recentGoogle(info)?ticket.epoch:null;redirectOwnerUid=null;}
  let ready=confirmedEpoch===ticket.epoch;
  if(ready){const info=await sdk.getIdTokenResult(user);current(ticket);ready=recentGoogle(info);if(!ready)confirmedEpoch=null;}
  return {email:owner.email,uid:owner.uid,namespace:owner.namespace,hasPassword:providers(user).includes('password'),canSetPassword:ready};
 }
 function completeRedirectReauthentication(result){if(result?.operationType==='reauthenticate'&&matches(result.user)){redirectOwnerUid=result.user.uid;return true;}return false;}
 async function reauthenticate(redirect=false){return serial(async()=>{
  const ticket=capture();confirmedEpoch=null;const provider=new sdk.GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account',login_hint:owner.email});
  if(redirect){await sdk.reauthenticateWithRedirect(ticket.user,provider);return;}
  const result=await sdk.reauthenticateWithPopup(ticket.user,provider);current(ticket);if(result.user.uid!==owner.uid)throw failure('auth/user-mismatch');
  const info=await sdk.getIdTokenResult(ticket.user,true);current(ticket);
  if(!recentGoogle(info))throw failure('auth/native-reauth-required');
  confirmedEpoch=ticket.epoch;return status();
 });}
 async function linkPassword(password,confirmation){return serial(async()=>{
  const ticket=capture(),user=await refreshed(ticket);
  if(providers(user).includes('password'))throw failure('auth/provider-already-linked');
  if(typeof password!=='string'||password.length<12||password.length>4096||password!==confirmation)throw failure('auth/native-password-invalid');
  const info=await sdk.getIdTokenResult(user,true);current(ticket);
  if(confirmedEpoch!==ticket.epoch||!recentGoogle(info)){confirmedEpoch=null;throw failure('auth/native-reauth-required');}
  if(sdk.validatePassword){const policy=await sdk.validatePassword(auth,password);current(ticket);if(!policy.isValid)throw failure('auth/password-does-not-meet-requirements');}
  const credential=sdk.EmailAuthProvider.credential(owner.email,password);current(ticket);
  const result=await sdk.linkWithCredential(user,credential);confirmedEpoch=null;current(ticket);
  await sdk.reload(user);current(ticket);
  if(result.user.uid!==owner.uid||!providers(user).includes('password')||!providers(user).includes('google.com'))throw failure('auth/native-identity-mismatch');
  return {linked:true,uid:user.uid,email:owner.email,namespace:owner.namespace};
 });}
 async function signInPassword(email,password){return serial(async()=>{
  if(normalized(email)!==normalized(owner.email)||typeof password!=='string'||!password)throw failure('auth/invalid-credential');
  const result=await sdk.signInWithEmailAndPassword(auth,owner.email,password);
  if(!matches(result.user)||!matches(auth.currentUser)||!providers(result.user).includes('password')){await sdk.signOut(auth);throw failure('auth/native-identity-mismatch');}
  return result;
 });}
 async function requestPasswordReset(){return serial(async()=>{
  const ticket=capture(),user=await refreshed(ticket);if(!providers(user).includes('password'))throw failure('auth/native-owner-required');
  current(ticket);await sdk.sendPasswordResetEmail(auth,owner.email);return {requested:true};
 });}
 return {isOwner,status,reauthenticate,completeRedirectReauthentication,linkPassword,signInPassword,requestPasswordReset,get busy(){return pending;},owner};
}
