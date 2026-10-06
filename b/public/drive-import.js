// 對帳：從 Google Drive 指定資料夾找最新的券商 CSV。只讀取，不會修改 Drive 上的檔案。
// jack's broker CSV folder (2026-10-06); used until a ledger saves its own folder in the Drive settings.
export const DEFAULT_FOLDER_ID='1bH_zM8xBiRe0wyhn28B2p7sOukziN1GQ';
export const DRIVE_SCOPE='https://www.googleapis.com/auth/drive.readonly';
const API='https://www.googleapis.com/drive/v3/files';
const SHEET='application/vnd.google-apps.spreadsheet';

// Accepts a folder link (…/folders/<id>, ?id=<id>) or a bare folder id.
export function parseFolderId(input){
 const text=String(input||'').trim();if(!text)return '';
 const m=text.match(/\/folders\/([A-Za-z0-9_-]{10,})/)||text.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
 if(m)return m[1];
 return /^[A-Za-z0-9_-]{10,}$/.test(text)?text:'';
}
export function defaultKeyword(name){return String(name||'').trim().toLowerCase();}
// Newest file per account: the file name must contain that account's keyword (case-insensitive) and no other account's keyword.
export function latestByAccount(files,accounts){
 const rows=accounts.filter(a=>String(a.keyword||'').trim()).map(a=>({...a,kw:String(a.keyword).trim().toLowerCase()}));
 const sorted=files.slice().sort((a,b)=>String(b.modifiedTime||'').localeCompare(String(a.modifiedTime||'')));
 return rows.map(a=>{
  const others=rows.filter(o=>o.id!==a.id&&!o.kw.includes(a.kw)).map(o=>o.kw);
  const file=sorted.find(f=>{const n=String(f.name||'').toLowerCase();return n.includes(a.kw)&&!others.some(k=>n.includes(k));})||null;
  return {account:a.id,keyword:a.keyword,file};
 });
}
function driveError(status,body){
 const reason=body?.error?.errors?.[0]?.reason||body?.error?.status||'',message=body?.error?.message||'';
 if(status===401)return Object.assign(new Error('Google Drive 授權已過期，請再按一次。'),{code:'drive/unauthorized'});
 if(reason==='accessNotConfigured'||/has not been used|is disabled/i.test(message))return Object.assign(new Error('Firebase 專案還沒啟用 Google Drive API，請到 Google Cloud Console 啟用後再試。'),{code:'drive/api-disabled'});
 if(status===404)return Object.assign(new Error('找不到這個資料夾，或這個 Google 帳號沒有權限。請確認資料夾連結。'),{code:'drive/not-found'});
 if(status===403)return Object.assign(new Error('Google Drive 拒絕讀取（'+(reason||status)+'）。請確認授權時有允許讀取 Drive。'),{code:'drive/forbidden'});
 return Object.assign(new Error('Google Drive 讀取失敗（'+(reason||status)+'）。'),{code:'drive/failed'});
}
async function call(fetcher,url,token){
 let response;
 try{response=await fetcher(url,{headers:{Authorization:'Bearer '+token}});}
 catch(error){throw Object.assign(new Error('連線失敗，無法讀取 Google Drive。'),{code:'unavailable',cause:error});}
 if(!response.ok)throw driveError(response.status,await response.json().catch(()=>null));
 return response;
}
export async function listCsvFiles(folderId,token,fetcher=fetch){
 const q="'"+folderId+"' in parents and trashed=false and (mimeType='text/csv' or mimeType='"+SHEET+"' or name contains '.csv' or name contains '.CSV')";
 const url=API+'?'+new URLSearchParams({q,orderBy:'modifiedTime desc',pageSize:'200',fields:'files(id,name,mimeType,modifiedTime,size)',supportsAllDrives:'true',includeItemsFromAllDrives:'true'});
 return ((await (await call(fetcher,url,token)).json()).files||[]);
}
export async function folderName(folderId,token,fetcher=fetch){
 return (await (await call(fetcher,API+'/'+encodeURIComponent(folderId)+'?fields=name,mimeType&supportsAllDrives=true',token)).json()).name||'';
}
// Broker CSVs are usually UTF-8; fall back to Big5 when UTF-8 has no header and contains replacement characters (same as a local file).
export function decodeCsv(buffer){
 let text=new TextDecoder('utf-8').decode(buffer);
 if(!text.includes('股名')&&text.includes('�')){try{text=new TextDecoder('big5').decode(buffer);}catch{}}
 return text;
}
export async function downloadCsv(file,token,fetcher=fetch){
 if(Number(file.size)>5000000)throw new Error('檔案太大（超過 5MB），請分批匯入。');
 const url=file.mimeType===SHEET?API+'/'+encodeURIComponent(file.id)+'/export?mimeType=text%2Fcsv':API+'/'+encodeURIComponent(file.id)+'?alt=media&supportsAllDrives=true';
 return decodeCsv(await (await call(fetcher,url,token)).arrayBuffer());
}
