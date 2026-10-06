// Market quotes, ported from A (public/app.js fetchMarketQuote / fetchYahooDailyClose): Yahoo first, then TWSE, then FinMind.
import {taipeiToday} from './model.js';
const num=v=>Number(v)||0;
function readerProxyUrl(url){return 'https://r.jina.ai/http://'+String(url||'').replace(/^https?:\/\//,'');}
function parseMaybeWrappedJson(text){
 const raw=String(text||'').trim();if(!raw)throw new Error('空白回應');
 try{return JSON.parse(raw);}catch{}
 const start=raw.indexOf('{'),end=raw.lastIndexOf('}');
 if(start>=0&&end>start)return JSON.parse(raw.slice(start,end+1));
 throw new Error('回應不是 JSON');
}
async function fetchJson(url,timeoutMs=8000,fetcher=fetch){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{const response=await fetcher(url,{cache:'no-store',signal:controller.signal}),text=await response.text();if(!response.ok)throw new Error('HTTP '+response.status);return parseMaybeWrappedJson(text);}
 finally{clearTimeout(timer);}
}
export function yahooSymbolFor(stock){
 const explicit=String(stock?.yahooSymbol||'').trim().toUpperCase();if(explicit)return explicit;
 const symbol=String(stock?.symbol||'').trim().toUpperCase();if(!symbol)return '';
 if(symbol.includes('.'))return symbol;
 const market=String(stock?.market||'TW').trim().toUpperCase();
 if(market==='TWO'||market==='OTC')return symbol+'.TWO';
 if(market==='US')return symbol;
 return symbol+'.TW';
}
function stockId(stock){return String(stock?.symbol||'').trim().toUpperCase().replace(/\.(TW|TWO)$/i,'');}
function yahooPrice(data){
 const result=data?.chart?.result?.[0],meta=num(result?.meta?.regularMarketPrice||result?.meta?.previousClose);
 if(meta>0)return meta;
 const closes=result?.indicators?.quote?.[0]?.close||[];
 for(let i=closes.length-1;i>=0;i--)if(num(closes[i])>0)return num(closes[i]);
 return 0;
}
async function viaAttempts(attempts,read){
 let last='';
 for(const attempt of attempts){try{return await read(attempt);}catch(error){last=error.message;}}
 throw new Error(last||'無回應');
}
async function yahoo(stock,fetcher){
 const symbol=yahooSymbolFor(stock),url='https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(symbol)+'?range=1d&interval=1m';
 return viaAttempts([{url,source:'YAHOO_FINANCE'},{url:readerProxyUrl(url),source:'YAHOO_FINANCE_READER'},{url:'https://api.allorigins.win/raw?url='+encodeURIComponent(url),source:'YAHOO_FINANCE_PROXY'}],async a=>{
  const price=yahooPrice(await fetchJson(a.url,7000,fetcher));if(price<=0)throw new Error('Yahoo 沒有價格');
  return {yahooSymbol:symbol,price,source:a.source,sourceDate:taipeiToday(),quoteTime:new Date().toISOString()};
 });
}
async function twse(stock,fetcher){
 const id=stockId(stock);if(!/^\d{4,6}[A-Z]?$/.test(id))throw new Error('TWSE 僅支援台股代號');
 const market=String(stock?.market||'TW').toUpperCase(),ex=market==='TWO'||market==='OTC'?'otc':'tse';
 const data=await fetchJson('https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch='+ex+'_'+encodeURIComponent(id)+'.tw&json=1&delay=0',7000,fetcher);
 const row=Array.isArray(data.msgArray)?data.msgArray[0]:null,price=num(row?.z)||num(row?.pz)||num(row?.y);
 if(price<=0)throw new Error('TWSE 無有效價格');
 return {yahooSymbol:yahooSymbolFor(stock),price,source:'TWSE_SNAPSHOT',sourceDate:row?.d?String(row.d).slice(0,4)+'-'+String(row.d).slice(4,6)+'-'+String(row.d).slice(6,8):taipeiToday(),quoteTime:new Date().toISOString()};
}
async function finmind(stock,fetcher){
 const id=stockId(stock);if(!/^\d{4,6}[A-Z]?$/.test(id))throw new Error('FinMind 僅支援台股代號');
 const start=new Date(Date.now()-14*86400000).toISOString().slice(0,10);
 const url='https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id='+encodeURIComponent(id)+'&start_date='+start+'&end_date='+taipeiToday();
 return viaAttempts([{url,source:'FINMIND_DAILY_CLOSE'},{url:readerProxyUrl(url),source:'FINMIND_DAILY_CLOSE_READER'}],async a=>{
  const data=await fetchJson(a.url,9000,fetcher);if(data.status&&Number(data.status)!==200)throw new Error(data.msg||'FinMind '+data.status);
  const latest=(Array.isArray(data.data)?data.data:[]).filter(r=>num(r.close)>0).sort((x,y)=>String(y.date||'').localeCompare(String(x.date||'')))[0];
  if(!latest)throw new Error('FinMind 無最近收盤價');
  return {yahooSymbol:yahooSymbolFor(stock),price:num(latest.close),source:a.source,sourceDate:latest.date,quoteTime:latest.date?latest.date+'T13:30:00+08:00':new Date().toISOString()};
 });
}
export async function fetchQuote(stock,fetcher=fetch){
 const errors=[];
 for(const source of [yahoo,twse,finmind]){try{return await source(stock,fetcher);}catch(error){errors.push(error.message);}}
 throw new Error(errors.filter(Boolean).slice(-2).join(' / ')||'沒有可用現價來源');
}
export async function fetchDailyClose(stock,date,fetcher=fetch){
 const symbol=yahooSymbolFor(stock),start=Math.floor(new Date(date+'T00:00:00+08:00').getTime()/1000);
 const url='https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(symbol)+'?period1='+start+'&period2='+(start+86400*8)+'&interval=1d';
 return viaAttempts([{url,source:'YAHOO_DAILY_CLOSE'},{url:readerProxyUrl(url),source:'YAHOO_DAILY_CLOSE_READER'},{url:'https://api.allorigins.win/raw?url='+encodeURIComponent(url),source:'YAHOO_DAILY_CLOSE_PROXY'}],async a=>{
  const result=(await fetchJson(a.url,8000,fetcher))?.chart?.result?.[0],stamps=result?.timestamp||[],closes=result?.indicators?.quote?.[0]?.close||[];
  for(let i=0;i<stamps.length;i++){const price=num(closes[i]);if(price<=0)continue;const sourceDate=new Date(stamps[i]*1000).toISOString().slice(0,10);if(sourceDate>=date)return {yahooSymbol:symbol,price,source:a.source,sourceDate,quoteTime:sourceDate+'T13:30:00+08:00'};}
  throw new Error('Yahoo 無日收盤價');
 });
}
// Benchmark fields A records on deposits and withdrawals (0050 price for that day). Best effort: empty on failure.
export async function benchmarkFor(stock,securityId,date,{fetcher=fetch,timeoutMs=12000}={}){
 if(!stock||!securityId)return null;
 const lookup=date===taipeiToday()?fetchQuote(stock,fetcher):fetchDailyClose(stock,date,fetcher);
 const timeout=new Promise(resolve=>setTimeout(()=>resolve(null),timeoutMs));
 const quote=await Promise.race([lookup.catch(()=>null),timeout]);
 if(!quote||!(num(quote.price)>0))return null;
 return {benchmarkSecurityId:securityId,benchmarkSymbol:stock.symbol||'0050',benchmarkPrice:Math.round(num(quote.price)*100)/100,benchmarkPriceSource:quote.source||'',benchmarkPriceDate:quote.sourceDate||date,benchmarkPriceCapturedAt:new Date().toISOString()};
}
