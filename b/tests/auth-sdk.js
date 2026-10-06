const user={uid:'fake-uid',email:'review@example.test',emailVerified:true,displayName:'手機串接測試'};
const auth={currentUser:null};let listener=()=>{};
export function getAuth(){return auth;}
export class GoogleAuthProvider{setCustomParameters(){}}
export function onAuthStateChanged(_a,cb){listener=cb;queueMicrotask(()=>cb(auth.currentUser));return ()=>{};}
export async function getRedirectResult(){return null;}
export async function signInWithPopup(){auth.currentUser=user;listener(user);return {user};}
export async function signInWithRedirect(){return signInWithPopup();}
export async function signOut(){auth.currentUser=null;listener(null);}

