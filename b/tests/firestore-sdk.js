export function getFirestore(){return {};}
export function doc(_db,...parts){return parts.join('/');}
export async function runTransaction(_db,fn){
 const store=globalThis.__testDocs,updates=[],deletes=[];let writing=false;
 const value=await fn({get:async key=>{if(writing)throw new Error('Read after write');return {exists:()=>Object.hasOwn(store,key),data:()=>structuredClone(store[key])};},set:(key,data)=>{writing=true;updates.push([key,structuredClone(data)]);},delete:key=>{writing=true;deletes.push(key);}});
 if(updates.length && globalThis.__holdWrites)await new Promise(resolve=>globalThis.__releaseWrite=resolve);
 updates.forEach(([k,v])=>store[k]=v);deletes.forEach(k=>delete store[k]);globalThis.__testWrites+=updates.length+deletes.length;return value;
}

