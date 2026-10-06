import {createLedgerClient,errorText} from './cloud-client.js';
import {taipeiToday} from './model.js';
import {fetchQuote,benchmarkFor} from './quotes.js';

(function(){
'use strict';
const paths={
home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
trades:'<path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4"/>',
inventory:'<path d="m3 7 9-4 9 4-9 4zM3 7v10l9 4 9-4V7M12 11v10"/>',
reconcile:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6m-6 4h6m-6 5 2 2 4-4"/>',
more:'<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
arrow:'<path d="m9 5 7 7-7 7"/>',down:'<path d="m6 9 6 6 6-6"/>',
plus:'<path d="M12 5v14M5 12h14"/>',minus:'<path d="M5 12h14"/>',
close:'<path d="m6 6 12 12M18 6 6 18"/>',
search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
chart:'<path d="M4 3v17h17M8 15v-4m5 4V7m5 8v-6"/>',
wallet:'<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 8h18M16 12h5v5h-5z"/>',
cloud:'<path d="M7 18a5 5 0 0 1-1-10 6 6 0 0 1 11-2 5 5 0 0 1 1 12zM12 10v6m-3-3 3 3 3-3"/>',
settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
bank:'<path d="m3 7 9-4 9 4M3 8h18M5 11v7m7-7v7m7-7v7M3 21h18"/>',
refresh:'<path d="M20 10a8 8 0 0 0-14-5L3 8m0-5v5h5M4 14a8 8 0 0 0 14 5l3-3m0 5v-5h-5"/>',
book:'<path d="M4 3h14a2 2 0 0 1 2 2v16H6a2 2 0 0 1-2-2zm0 14h16M8 7h8m-8 4h5"/>',
key:'<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9m-4 4 3 3m-6 0 2 2"/>',
external:'<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
logout:'<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3"/>'
};
function icon(name){return '<svg viewBox="0 0 24 24" aria-hidden="true">'+(paths[name]||paths.book)+'</svg>';}
const $=s=>document.querySelector(s), fmt=n=>new Intl.NumberFormat('zh-TW',{maximumFractionDigits:2}).format(n);
const esc=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#39;");
const money=n=>'NT$ '+fmt(Math.round(n));
const today=()=>taipeiToday();
const slash=d=>String(d||'').replaceAll('-','/'),short=d=>slash(d).slice(5);
const signed=n=>(n>0?'+':n<0?'−':'')+fmt(Math.abs(n));
const pct=(a,b)=>b?(a>=0?'+':'−')+Math.abs(a/b*100).toFixed(1)+'%':'';
const tone=n=>n>0?'up':n<0?'down':'';
let returnForm=null,client=null,state=null,stocks={},accounts=[{id:'all',name:'全部帳戶',full:'所有券商帳戶'}];
let page='home',period='7',tradeType='all',query='',composing=false,inventoryTab='held',reconTab='open',lastFocus=null,toastTimer,loading=false,authError='',identity=null,authEpoch=0;
function selected(list){return list.filter(x=>state.account==='all'||x.account===state.account);}
function totals(){let cash=Object.entries(state.cash).filter(([k])=>state.account==='all'||k===state.account).reduce((s,[,v])=>s+v,0),value=0,cost=0,pnl=0,missing=0;for(const l of selected(state.lots)){const price=stocks[l.code]?.price;if(price==null){value+=l.basis;missing++;}else{value+=l.qty*price;cost+=l.basis;pnl+=l.qty*price-l.basis;}}return {cash,value,cost,pnl,total:cash+value,missing};}
function recent(){return selected(state.trades).slice().sort((a,b)=>b.date.localeCompare(a.date)||(b.time||'00:00').localeCompare(a.time||'00:00')||b.recorded.localeCompare(a.recorded));}
const CASH_NAMES={deposit:'入金',withdraw:'出金',dividend:'股息',interest:'利息'},CASH_ICONS={deposit:'入',withdraw:'出',dividend:'息',interest:'利'};
function typeName(t){return CASH_NAMES[t.type]||(t.type==='buy'?'買進':'賣出');}
function tradeRow(t,fullDate){if(t.cash){const when=[fullDate?short(t.date):'',accountName(t.account)].filter(Boolean).join(' · ');return '<button class="trade-row" data-trade="'+esc(t.id)+'"><span class="trade-icon cash">'+CASH_ICONS[t.type]+'</span><span class="trade-main"><strong>'+CASH_NAMES[t.type]+'</strong><small>'+esc(when)+(t.note?' · '+esc(t.note):'')+'</small></span><span class="trade-end"><b>'+(t.net<0?'−':'+')+fmt(Math.abs(t.net))+'</b><small>現金</small></span></button>';}const when=[fullDate?short(t.date):'',t.time||(fullDate?'':'時間未填')].filter(Boolean).join(' ');return '<button class="trade-row" data-trade="'+esc(t.id)+'"><span class="trade-icon '+t.type+'">'+(t.type==='buy'?'買':'賣')+'</span><span class="trade-main"><strong>'+esc(stockName(t.code))+'<span class="code">'+esc(ticker(t.code))+'</span></strong><small>'+(t.borrow?(t.borrow==='BORROW_SELL'?'借券賣出 · ':'借券回補 · '):'')+esc(when)+' · '+esc(accountName(t.account))+'</small></span><span class="trade-end"><b>'+fmt(Math.abs(t.net))+'</b><small>'+fmt(t.qty)+' 股 × '+fmt(t.price)+'</small></span></button>';}
function go(next){closeSheet(false);page=next;render();document.documentElement.scrollTop=0;document.body.scrollTop=0;requestAnimationFrame(()=>window.scrollTo({top:0,behavior:'instant'}));}
function render(){ $('#brand-icon').innerHTML=icon('chart');$('#nav').hidden=!state;$('#account-switch').hidden=!state;if(!state){$('#nav').innerHTML='';$('#main').innerHTML=authView();return;}const scope=scopeLabel();$('#account-switch').innerHTML='<span>'+esc(scope)+'</span>'+icon('down');$('#account-switch').setAttribute('aria-label','切換帳本與帳戶，目前：'+scope);const tabs=[['home','首頁'],['trades','交易'],['inventory','庫存'],['reconcile','對帳'],['more','更多']];$('#nav').innerHTML=tabs.map(([id,name])=>'<button data-page="'+id+'" class="'+(id===page?'active':'')+'" '+(id===page?'aria-current="page"':'')+'>'+icon(id)+'<span>'+name+'</span></button>').join('');$('#main').innerHTML=({home,trades:tradePage,inventory:inventoryPage,reconcile:reconcilePage,more:morePage}[page])();}
function home(){const t=totals(),rows=recent().slice(0,3),pending=issues(),rebuy=buybacks(),lent=openCycles(),count=pending.length+rebuy.length+lent.length;
return '<p class="eyebrow">資產總覽 · '+esc(slash(today()))+'</p>'
+'<section class="hero"><p class="eyebrow">'+(t.missing?'總資產估值':'總資產')+'</p><div class="amount"><span class="currency">NT$</span>'+fmt(t.total)+'</div><p class="hero-pnl '+tone(t.pnl)+'">'+(t.cost?(t.pnl>0?'▲ ':t.pnl<0?'▼ ':'')+fmt(Math.abs(t.pnl))+'（'+pct(t.pnl,t.cost)+'）':'待取得報價')+'<span>未實現損益</span></p><div class="hero-grid"><div><span>'+(t.missing?'庫存估值':'股票市值')+'</span><b>'+fmt(t.value)+'</b></div><div><span>帳上現金</span><b>'+fmt(t.cash)+'</b></div></div></section>'
+(t.missing?'<p class="hint hero-hint">'+t.missing+' 筆庫存缺報價，估值暫以剩餘成本計算。</p>':'')+'<div class="quote-bar" style="margin:0 0 14px"><span>'+esc(quoteStamp())+'</span><button class="link" data-refresh-quotes>'+icon('refresh')+'更新報價</button></div>'
+(count?'<section class="todo" aria-label="待處理"><p class="todo-title">'+count+' 件待處理</p>'+(pending.length?'<button class="task" data-page="reconcile"><span><strong>'+pending.length+' 筆對帳差異</strong><small>檢查缺漏、費用或金額</small></span>'+icon('arrow')+'</button>':'')+(rebuy.length?'<button class="task" data-show-rebuy><span><strong>'+rebuy.length+' 筆等待買回</strong><small>查看買回計畫</small></span>'+icon('arrow')+'</button>':'')+(lent.length?'<button class="task" data-show-rebuy><span><strong>'+lent.length+' 筆借券待回補</strong><small>查看借券任務</small></span>'+icon('arrow')+'</button>':'')+'</section>':'')
+'<div class="quick"><button class="buy-button" data-new="buy">'+icon('plus')+'記買進</button><button class="sell-button" data-new="sell">'+icon('minus')+'記賣出</button></div><div class="cash-row"><button data-new-cash="deposit">入金</button><button data-new-cash="withdraw">出金</button><button data-new-cash="dividend">股息／利息</button></div>'
+'<section><div class="section-title"><h2>最近交易</h2><button class="link" data-page="trades">全部交易'+icon('arrow')+'</button></div>'+(rows.length?'<div class="list">'+rows.map(t=>tradeRow(t,true)).join('')+'</div>':'<div class="empty">這個帳戶還沒有買賣紀錄</div>')+'</section>'
+'<p class="quiet">共用正式帳本 · 上次載入 '+esc(stamp(state.updatedAt))+'</p>';}
function matchingTrades(){const since=new Date(today()+'T00:00:00Z');since.setUTCDate(since.getUTCDate()-(period==='today'?0:period==='7'?6:29));const min=since.toISOString().slice(0,10);return recent().filter(t=>(period==='all'||t.date>=min)&&(tradeType==='all'||(tradeType==='cash'?t.cash:t.type===tradeType))&&(!query||(t.cash?[typeName(t),t.note]:[ticker(t.code),stockName(t.code),t.note]).join(' ').toLowerCase().includes(query.trim().toLowerCase())));}
function tradePage(){return '<div class="page-head"><h1>交易紀錄</h1><button class="link" data-new="buy">'+icon('plus')+'記一筆</button></div>'+
'<label class="search">'+icon('search')+'<input id="trade-search" type="search" placeholder="搜尋股票名稱、代號或備註" aria-label="搜尋交易" value="'+esc(query)+'"></label>'+
'<div class="tabs period" role="group" aria-label="期間">'+[['today','今天'],['7','7 天'],['30','30 天'],['all','全部']].map(([id,name])=>'<button class="'+(period===id?'active':'')+'" data-period="'+id+'" aria-pressed="'+(period===id)+'">'+name+'</button>').join('')+'</div>'+
'<div id="trade-results">'+tradeResults()+'</div>';}
function tradeResults(){const trades=matchingTrades(),groups=new Map(),now=today(),yesterday=new Date(new Date(now+'T00:00:00Z').valueOf()-86400000).toISOString().slice(0,10);trades.forEach(t=>{if(!groups.has(t.date))groups.set(t.date,[]);groups.get(t.date).push(t);});
return '<div class="filter-line"><div class="chips" role="group" aria-label="買賣">'+[['all','全部'],['buy','買進'],['sell','賣出'],['cash','現金']].map(([id,name])=>'<button class="chip '+(tradeType===id?'active':'')+'" data-type="'+id+'" aria-pressed="'+(tradeType===id)+'">'+name+'</button>').join('')+'</div><small>'+trades.length+' 筆</small></div>'+
(groups.size?Array.from(groups).map(([date,rows])=>{const flow=rows.reduce((s,t)=>s+t.net,0);return '<div class="date-label">'+(date===now?'今天 ':date===yesterday?'昨天 ':'')+esc(slash(date))+'<span>'+(flow>=0?'淨流入 ':'淨流出 ')+fmt(Math.abs(flow))+'</span></div><div class="list">'+rows.map(t=>tradeRow(t,false)).join('')+'</div>';}).join(''):'<div class="empty">'+icon('search')+'沒有符合條件的交易</div>');}
function stockGroups(){const groups=new Map();selected(state.lots).forEach(l=>{const g=groups.get(l.code)||{code:l.code,qty:0,cost:0,lots:[]};g.qty+=l.qty;g.cost+=l.basis;g.lots.push(l);groups.set(l.code,g);});return Array.from(groups.values());}
function inventoryPage(){const t=totals(),groups=stockGroups(),rebuy=buybacks(),lent=openCycles(),closed=selected(state.cycles).filter(c=>c.remaining<=0);
return '<div class="page-head"><h1>我的庫存</h1></div><div class="summary-strip"><div><small>'+(t.missing?'庫存估值':'股票市值')+'</small><b>'+fmt(t.value)+'</b></div><div><small>未實現損益</small><b class="'+tone(t.pnl)+'">'+signed(t.pnl)+'</b></div></div>'
+'<div class="tabs"><button class="'+(inventoryTab==='held'?'active':'')+'" data-inventory-tab="held" aria-pressed="'+(inventoryTab==='held')+'">持有中 '+groups.length+'</button><button class="'+(inventoryTab==='rebuy'?'active':'')+'" data-inventory-tab="rebuy" aria-pressed="'+(inventoryTab==='rebuy')+'">待買回 '+(rebuy.length+lent.length)+'</button></div>'
+(inventoryTab==='held'?(groups.length?'<div class="col-head"><span>股票 · 股數 · 均價</span><span>市值 · 損益</span></div><div class="list">'+groups.map(g=>{const stock=stocks[g.code],has=stock?.price!=null,value=has?g.qty*stock.price:g.cost,pnl=value-g.cost;return '<button class="stock-row" data-stock="'+esc(g.code)+'"><span class="trade-main"><strong>'+esc(stockName(g.code))+'<span class="code">'+esc(ticker(g.code))+'</span></strong><small>'+fmt(g.qty)+' 股 · 均價 '+fmt(Math.round(g.cost/g.qty*100)/100)+'</small></span><span class="trade-end"><b>'+fmt(value)+'</b>'+(has?'<small class="'+tone(pnl)+'">'+signed(pnl)+'（'+pct(pnl,g.cost)+'）</small>':'<small>缺報價</small>')+'</span></button>';}).join('')+'</div>':'<div class="empty">目前沒有可賣庫存</div>')
:((rebuy.length?(lent.length?'<h3 class="mini-heading">買回計畫</h3>':'')+'<div class="list">'+rebuy.map(r=>'<button class="stock-row" data-rebuy="'+esc(r.id)+'"><span class="trade-main"><strong>'+esc(stockName(r.code))+'<span class="code">'+esc(ticker(r.code))+'</span></strong><small>'+short(r.date)+' 賣 '+fmt(r.price)+' · 待買回 '+fmt(r.qty)+' 股</small></span><span class="trade-end"><b>'+fmt(r.target)+'</b><small>參考買回價</small></span></button>').join('')+'</div>':lent.length?'':'<div class="empty">目前沒有待買回的股票</div>')
 +(lent.length?'<h3 class="mini-heading">借券待回補</h3><div class="list">'+lent.map(cycleRow).join('')+'</div>':'')
 +(closed.length?'<details class="details"><summary>已結清的借券 '+closed.length+' 筆</summary><div class="list">'+closed.slice().reverse().map(cycleRow).join('')+'</div></details>':'')))
+'<div class="quote-bar"><span>'+esc(quoteStamp())+'</span><button class="link" data-refresh-quotes>'+icon('refresh')+'更新報價</button></div>';}
function openCycles(){return selected(state.cycles).filter(c=>c.remaining>0);}
function cycleRow(c){return '<button class="stock-row" data-cycle="'+esc(c.id)+'"><span class="trade-main"><strong>'+esc(stockName(c.code))+'<span class="code">'+esc(ticker(c.code))+'</span></strong><small>'+short(c.date)+' 借券賣 '+fmt(c.price)+' · '+(c.remaining>0?'待回補 '+fmt(c.remaining)+' 股':'已結清')+'</small></span><span class="trade-end"><b>'+(c.filled?signed(c.profit):fmt(c.qty)+' 股')+'</b><small>'+(c.filled?'已回補損益':'借出股數')+'</small></span></button>';}
function cycleSheet(id){const c=state.cycles.find(x=>x.id===id);if(!c)return;sheet('借券任務','<p class="notice">'+esc(stockName(c.code))+' · '+esc(ticker(c.code))+' · '+(c.remaining>0?'還有 '+fmt(c.remaining)+' 股待回補':'已全部回補')+'</p><dl class="definition"><div><dt>借券賣出</dt><dd>'+esc(slash(c.date))+' · '+fmt(c.qty)+' 股 × '+fmt(c.price)+'</dd></div><div><dt>券商帳戶</dt><dd>'+esc(accountName(c.account))+'</dd></div><div><dt>借出來源</dt><dd>'+esc(c.sources.split(',').filter(Boolean).map(lotLabel).join('、')||'—')+'</dd></div><div><dt>已回補</dt><dd>'+fmt(c.filled)+' 股'+(c.filled?' · 均價 '+fmt(c.avg):'')+'</dd></div>'+(c.filled?'<div><dt>已回補損益</dt><dd class="'+tone(c.profit)+'">'+signed(c.profit)+'</dd></div>':'')+'</dl>'+(c.fills.length?'<h3 class="mini-heading">回補紀錄</h3><div class="list">'+c.fills.map(f=>'<button class="trade-row" data-trade="'+esc(f.id)+'"><span class="trade-main"><strong>'+esc(slash(f.date))+'</strong><small>'+fmt(f.qty)+' 股 × '+fmt(f.price)+'</small></span><span class="trade-end"><b class="'+tone(f.profit)+'">'+signed(f.profit)+'</b><small>損益</small></span></button>').join('')+'</div>':'')+(c.remaining>0?'<button class="primary wide buy" style="margin-top:16px" data-cycle-buy="'+esc(c.id)+'">記錄借券回補</button>':'')+'<button class="link" style="margin-top:10px" data-trade="'+esc(c.id)+'">查看借券賣出交易'+icon('arrow')+'</button>');}
// "06/30 買 105" for a buy id (sourceTransactionId or buyTransactionId).
function lotLabel(id){const t=state.trades.find(x=>x.id===id),l=state.lots.find(x=>x.source===id||x.buyTx===id);return t||l?short(t?.date||l.date)+' 買 '+fmt(t?.price??l.cost):id;}
function quoteStamp(){const times=stockGroups().map(g=>stocks[g.code]?.quoteTime).filter(Boolean).sort();return times.length?'報價更新於 '+stamp(times.at(-1)):'還沒有報價';}
function reconcilePage(){const all=reconItems(),open=all.filter(x=>!x.settled),done=all.filter(x=>x.settled),list=reconTab==='open'?open:done,labels={MISSING_IN_APP:'帳本缺少紀錄',MISSING_IN_BROKER:'缺少券商紀錄',FEE_TAX_DIFF:'費稅不一致',AMOUNT_DIFF:'金額不一致',PARTIAL_MATCHED:'股數不一致',MATCHED:'已相符',AUTO_GROUP_MATCHED:'已相符'},amount=(l,v,side)=>(side==='app'&&l.matchStatus==='MISSING_IN_APP')||(side==='broker'&&l.matchStatus==='MISSING_IN_BROKER')||v===null||v===''||!Number.isFinite(Number(v))?'—':fmt(v);
return '<div class="page-head"><h1>對帳</h1></div><div class="tabs"><button class="'+(reconTab==='open'?'active':'')+'" data-recon-tab="open" aria-pressed="'+(reconTab==='open')+'">待確認 '+open.length+'</button><button class="'+(reconTab==='done'?'active':'')+'" data-recon-tab="done" aria-pressed="'+(reconTab==='done')+'">已完成 '+done.length+'</button></div>'
+(list.length?list.slice(0,60).map(l=>'<section class="recon-card"><div class="stock-head"><strong>'+esc(stockName(l.securityId))+'<span class="code">'+esc(ticker(l.securityId))+'</span></strong><span class="tag '+(l.settled?'good':'warning')+'">'+esc(l.brokerAcceptedAt?'已採用券商金額':labels[l.matchStatus]||l.matchStatus)+'</span></div><p>'+esc(slash(l.tradeDate))+' · '+esc(accountName(l.brokerAccountId))+'</p><div class="recon-grid"><div><small>帳本金額</small><b>'+amount(l,l.appNetAmount,'app')+'</b></div><div><small>券商金額</small><b>'+amount(l,l.allocatedNetAmount,'broker')+'</b></div></div>'+(l.settled?'':'<div class="recon-footer"><span>差異 '+(Number.isFinite(Number(l.diffNetAmount))?signed(l.diffNetAmount):'—')+'</span><button class="link" data-recon-review="'+esc(l.key)+'">檢查'+icon('arrow')+'</button></div>')+'</section>').join('')+(list.length>60?'<p class="quiet">只顯示前 60 筆，其餘請到 A 版查看。</p>':''):'<div class="empty">'+(reconTab==='open'?'這個帳戶沒有待確認的差異':'還沒有已完成的對帳')+'</div>')
+'<a class="secondary wide" style="display:flex;justify-content:center;align-items:center;gap:6px;text-decoration:none;margin-top:16px" href="https://jackstock-ed2d2.web.app/#/app/import" target="_blank" rel="noopener">到 A 版匯入券商 CSV'+icon('external')+'</a>';}
function menu(iconName,title,sub,attr){return '<button class="menu-row" '+attr+'>'+icon(iconName)+'<span><strong>'+title+'</strong><small>'+sub+'</small></span>'+icon('arrow')+'</button>';}
function morePage(){const p=state.portfolios.find(p=>p.id===state.portfolioId);return '<div class="page-head"><h1>更多</h1></div><div class="profile"><div class="avatar">'+esc((state.user.name||'J').slice(0,1))+'</div><div><strong>'+esc(state.user.name)+'</strong><small>'+esc(state.user.email)+'</small></div></div>'
+'<section class="menu-section"><p class="eyebrow">我的帳本</p><div class="list">'+menu('chart','資產摘要','庫存與現金配置','data-report')+menu('wallet','現金餘額','依券商帳戶查看','data-cash')+menu('book','切換帳本與帳戶',esc(scopeLabel()),'data-scope')+menu('chart','股票清單','新增股票、查看代號與市場','data-stocks')+'</div></section>'
+'<section class="menu-section"><p class="eyebrow">資料與同步</p><div class="alert">B 版的買賣會寫入正式帳本。舊 A 版同步可能覆蓋這裡的修改：在 B 修改前請關閉 A 分頁，回 A 使用前先按「從 Firebase 載入」。</div><div class="list">'+menu('refresh','重新載入雲端資料','上次載入 '+esc(stamp(state.updatedAt)),'data-reload')+menu('cloud','連線與儲存狀態','Firebase · A、B 共用資料','data-backup')+menu('external','A 版完整功能','匯入、移轉、報表、備份與設定','data-original')+'</div></section>'
+'<section class="menu-section"><p class="eyebrow">帳號</p><div class="list">'+(client?.nativeAuth.isOwner()?menu('key','登入方式','Google 與 Email／密碼','data-native-settings'):'')+menu('logout','登出','清除這台裝置上的畫面資料','data-logout')+'</div></section>';}
function toast(msg){clearTimeout(toastTimer);$('#live').innerHTML='<div class="toast">'+esc(msg)+'</div>';toastTimer=setTimeout(()=>{$('#live').innerHTML='';},3300);}
function closeSheet(restore=true){if(!$('#sheets').firstChild)return;$('#sheets').innerHTML='';$('#app').inert=false;document.body.style.overflow='';if(restore&&lastFocus?.isConnected)lastFocus.focus();}
function sheet(title,body){lastFocus=document.activeElement;$('#app').inert=true;document.body.style.overflow='hidden';$('#sheets').innerHTML='<div class="overlay"><section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title"><div class="sheet-handle"></div><header class="sheet-head"><h2 id="sheet-title">'+esc(title)+'</h2><button class="close" data-close aria-label="關閉">'+icon('close')+'</button></header>'+body+'</section></div>';setTimeout(()=>$('.sheet .close')?.focus(),0);}
function scopeLabel(){const p=state.portfolios.find(p=>p.id===state.portfolioId),acc=state.account==='all'?'全部帳戶':accountName(state.account);return state.portfolios.length>1?(p?.name||'投資帳本')+' · '+acc:acc;}
function scopeSheet(){sheet('帳本與帳戶',(state.portfolios.length>1?'<p class="eyebrow sheet-eyebrow">投資帳本</p><div class="list">'+state.portfolios.map(p=>'<button class="menu-row" data-portfolio="'+esc(p.id)+'" aria-pressed="'+(p.id===state.portfolioId)+'">'+icon('book')+'<span><strong>'+esc(p.name)+'</strong><small>'+(p.id===state.portfolioId?'目前使用':'切換查看')+'</small></span>'+(p.id===state.portfolioId?'<span class="tag good">使用中</span>':'')+'</button>').join('')+'</div>':'')+'<p class="eyebrow sheet-eyebrow">券商帳戶</p><div class="list">'+accounts.map(a=>'<button class="menu-row" data-account="'+esc(a.id)+'" aria-pressed="'+(state.account===a.id)+'">'+icon(a.id==='all'?'wallet':'bank')+'<span><strong>'+esc(a.full)+'</strong><small>'+(state.account===a.id?'目前選用':'切換查看')+'</small></span>'+(state.account===a.id?'<span class="tag good">使用中</span>':'')+'</button>').join('')+'</div>');}
function tradeDetail(id){const t=state.trades.find(x=>x.id===id);if(!t)return;
 if(t.cash)return sheet(CASH_NAMES[t.type]+'明細','<div class="detail-lead"><span class="trade-icon cash">'+CASH_ICONS[t.type]+'</span><div><strong>'+CASH_NAMES[t.type]+'</strong><small>'+esc(accountName(t.account))+'</small></div></div><div class="big-detail">'+(t.net<0?'−':'+')+money(Math.abs(t.net))+'</div><dl class="definition"><div><dt>日期</dt><dd>'+esc(slash(t.date))+'</dd></div><div><dt>券商帳戶</dt><dd>'+esc(accountName(t.account))+'</dd></div><div><dt>備註</dt><dd>'+esc(t.note||'—')+'</dd></div><div><dt>記帳時間</dt><dd>'+esc(stamp(t.recorded))+'</dd></div></dl><button class="primary wide" data-edit="'+esc(t.id)+'">編輯'+CASH_NAMES[t.type]+'</button><button class="danger-link" data-delete="'+esc(t.id)+'">刪除這筆'+CASH_NAMES[t.type]+'</button>');
 const tags=[t.borrow==='BORROW_SELL'?'借券賣出':t.borrow?'借券回補':'',t.rebuyIds?'買回':'',t.linked&&!t.rebuyIds?'已配對':'',t.aligned?'已採用券商金額':''].filter(Boolean);
 sheet('交易明細','<div class="detail-lead"><span class="trade-icon '+t.type+'">'+(t.type==='buy'?'買':'賣')+'</span><div><strong>'+esc(stockName(t.code))+'</strong><small>'+esc(ticker(t.code))+(tags.length?' · '+esc(tags.join('、')):'')+'</small></div></div><div class="big-detail">'+money(Math.abs(t.net))+'<span class="hint" style="display:block">'+(t.type==='buy'?'含費用總支出':'扣費用淨收款')+'</span></div><dl class="definition"><div><dt>成交日期</dt><dd>'+esc(slash(t.date))+'</dd></div><div><dt>成交時間</dt><dd>'+esc(t.time||'未填')+'</dd></div><div><dt>券商帳戶</dt><dd>'+esc(accountName(t.account))+'</dd></div><div><dt>股數 × 價格</dt><dd>'+fmt(t.qty)+' 股 × '+fmt(t.price)+'</dd></div><div><dt>手續費／交易稅</dt><dd>'+fmt(t.fee)+' / '+fmt(t.tax)+'</dd></div><div><dt>策略分類</dt><dd>'+esc(categoryName(t.category))+'</dd></div><div><dt>備註</dt><dd>'+esc(t.note||'—')+'</dd></div><div><dt>記帳時間</dt><dd>'+esc(stamp(t.recorded))+'</dd></div></dl>'+tradeLinks(t)+'<button class="primary wide" data-edit="'+esc(t.id)+'">編輯交易</button>'+(t.linked||t.aligned||t.borrow?'<p class="hint" style="margin-top:12px">修改金額會重新計算配對、買回與損益'+(t.aligned?'，已採用的券商金額需重新確認':'')+'。</p>':'')+(t.refd?'<p class="hint">'+(t.borrow==='BORROW_SELL'?'這筆借券賣出已有回補，要刪除請先刪掉回補紀錄。':'這筆交易被其他賣出、借券或買回引用，要刪除請先處理那些紀錄。')+'</p>':'<button class="danger-link" data-delete="'+esc(t.id)+'">刪除這筆交易</button>'));}
// What a trade is tied to: the buys a sell was matched to (A 配對), a borrow cycle, or cost exchanges on a buy.
function tradeLinks(t){
 if(t.borrow==='BORROW_SELL'){const c=state.cycles.find(x=>x.id===t.id);return c?'<h3 class="mini-heading">借券任務</h3><button class="lot" style="width:100%;text-align:left" data-cycle="'+esc(c.id)+'"><span><b>'+(c.remaining>0?'待回補 '+fmt(c.remaining)+' 股':'已全部回補')+'</b><small>借出來源 '+esc(c.sources.split(',').filter(Boolean).map(lotLabel).join('、'))+'</small></span>'+icon('arrow')+'</button>':'';}
 if(t.borrow==='REBUY_FILL'){const c=state.cycles.find(x=>x.id===t.cycle);return c?'<h3 class="mini-heading">回補的借券</h3><button class="lot" style="width:100%;text-align:left" data-cycle="'+esc(c.id)+'"><span><b>'+esc(slash(c.date))+' 借券賣 '+fmt(c.qty)+' 股 × '+fmt(c.price)+'</b><small>'+(c.remaining>0?'還有 '+fmt(c.remaining)+' 股待回補':'已全部回補')+'</small></span>'+icon('arrow')+'</button>':'';}
 if(t.type==='sell'){const rows=state.matches[t.id]||[],matched=rows.reduce((n,m)=>n+m.qty,0);return '<h3 class="mini-heading">配對的買進</h3>'+(rows.length?rows.map(m=>'<div class="lot"><span><b>'+esc(short(m.date))+' 買 '+fmt(m.price)+' · '+fmt(m.qty)+' 股</b><small>已實現損益 <span class="'+tone(m.profit)+'">'+signed(m.profit)+'</span></small></span></div>').join(''):'<p class="hint">還沒有配對到買進。</p>')+(matched<t.qty?'<p class="hint">配對 '+fmt(matched)+' / '+fmt(t.qty)+' 股。</p>':'')+'<button class="secondary wide" style="margin:4px 0 14px" data-match-edit="'+esc(t.id)+'">調整配對</button>';}
 const ex=state.exchanges.filter(x=>x.source===t.id||x.targets.some(y=>y.id===t.id));
 return ex.length?'<p class="hint">這批庫存有 '+ex.length+' 筆成本交換，成本已調整；可到庫存頁的股票明細查看。</p>':'';}
function matchSheet(id){const t=state.trades.find(x=>x.id===id);if(!t)return;const options=client.sellOptions({account:t.account,code:t.code,date:t.date,id:t.id}),ids=t.sources.split(',');
 sheet('調整配對','<form id="match-form" data-id="'+esc(t.id)+'"><div id="form-error" role="alert"></div><p class="notice">'+esc(slash(t.date))+' 賣出 '+esc(stockName(t.code))+' '+fmt(t.qty)+' 股 × '+fmt(t.price)+'</p>'+(options.length?'<fieldset class="lots"><legend>要配對哪幾批買進 · 依勾選順序扣除</legend>'+options.map(o=>'<label class="lot"><input type="checkbox" name="source" value="'+esc(o.value)+'" '+(ids.includes(o.value)?'checked':'')+'><span><b>'+esc(short(o.date))+' 買 · '+fmt(o.price)+'</b><small>可配對 '+fmt(o.shares)+' 股</small></span></label>').join('')+'</fieldset>':'<p class="hint">成交日期前沒有可配對的買進。</p>')+'<div class="form-field"><label for="m-shares">配對股數</label><input id="m-shares" name="shares" type="number" inputmode="numeric" min="1" max="'+t.qty+'" step="1" value="'+(t.manual||t.qty)+'" required></div><p class="hint">和 A 版「儲存配對」相同，存檔後重新計算已實現損益與買回計畫。</p><div class="sticky-submit"><button class="primary wide" type="submit">儲存配對</button></div></form>');}

const CATEGORY_NAMES={LONG_TERM:'長期持有',TRADING:'交易部位',CORE:'核心持股',REBUY:'買回'};
function categoryName(v){return CATEGORY_NAMES[v]||v||'—';}
function heldCodes(account){return [...new Set(state.lots.filter(l=>l.account===account).map(l=>l.code))].filter(c=>stocks[c]);}
function form(type='buy',code='',id='',keep={}){
 if(!accounts.some(a=>a.id!=='all'))return toast('請先在 A 版建立券商帳戶。');
 if(!Object.keys(stocks).length)return securitySheet({type,...keep});
 const old=id?state.trades.find(x=>x.id===id):null;type=old?.type||type;const sell=type==='sell';
 const task=!old&&keep.rebuyIds?state.rebuy.find(r=>r.id===keep.rebuyIds):null;
 // Borrow buy-back (A: 回補借券任務) is tied to one cycle; a borrow sell lends shares from chosen lots.
 const cyc=old?.borrow==='REBUY_FILL'?state.cycles.find(c=>c.id===old.cycle):!old&&keep.cycle?state.cycles.find(c=>c.id===keep.cycle):null;
 const borrowSell=old?old.borrow==='BORROW_SELL':sell&&keep.borrow==='sell';
 const lockPlace=!!task||!!cyc||!!old?.rebuyIds||!!old?.borrow;
 const holder=code&&state.account==='all'?accounts.find(a=>a.id!=='all'&&heldCodes(a.id).includes(code)):null;
 const acc=old?.account||task?.account||cyc?.account||keep.account||(state.account==='all'?(holder||accounts.find(a=>a.id!=='all')).id:state.account);
 const held=heldCodes(acc),codes=lockPlace?[old?.code||task?.code||cyc.code]:sell&&!old&&held.length?held:Object.keys(stocks);
 const symbol=old?.code||(codes.includes(code)?code:'')||(codes.includes(keep.code)?keep.code:'')||codes[0];
 if(old&&!accounts.some(a=>a.id===acc))return toast('這筆交易的帳戶已停用，請在 A 版處理。');
 const cat=task||old?.rebuyIds?'REBUY':old?.category||keep.category||'LONG_TERM',cats=Object.keys(CATEGORY_NAMES).concat(Object.hasOwn(CATEGORY_NAMES,cat)?[]:[cat]);
 const price=old?.price||(symbol===keep.code&&keep.price)||task?.target||stocks[symbol]?.price||cyc?.price||'',qty=old?.qty||keep.qty||task?.qty||cyc?.remaining||100,word=borrowSell?'借券賣出':cyc?'借券回補':sell?'賣出':'買進';
 const minDate=task?.date||cyc?.date||'',accountChoices=accounts.filter(a=>a.id!=='all'&&(!lockPlace||a.id===acc));
 sheet(task?'記錄買回':old?'編輯'+word:'記一筆'+word,'<form id="trade-form" class="'+type+'" data-edit-id="'+esc(id)+'" data-lots-touched="'+(old?'1':'')+'" data-linked="'+(old&&(old.linked||old.aligned||old.borrow)?'1':'')+'"><div id="form-error" role="alert"></div><input type="hidden" name="rebuyIds" value="'+esc(task?.id||'')+'"><input type="hidden" name="cycle" value="'+esc(!old&&cyc?cyc.id:'')+'"><input type="hidden" name="borrow" value="'+(borrowSell?'sell':'')+'">'
 +'<div class="tabs type-tabs"><button type="button" class="'+(!sell?'active':'')+'" data-form-type="buy" aria-pressed="'+!sell+'" '+(old||task||cyc?'disabled':'')+'>買進</button><button type="button" class="'+(sell?'active':'')+'" data-form-type="sell" aria-pressed="'+sell+'" '+(old||task||cyc?'disabled':'')+'>賣出</button></div><input type="hidden" name="type" value="'+type+'">'
 +(sell&&!old?'<label class="check-row"><input type="checkbox" id="f-borrow" '+(borrowSell?'checked':'')+'><span><b>借券賣出</b><small>股票借出賣掉，之後再回補；庫存不會配對結清</small></span></label>':'')
 +'<div class="form-field"><label for="f-account">券商帳戶</label><select id="f-account" name="account">'+accountChoices.map(a=>'<option value="'+esc(a.id)+'" '+(acc===a.id?'selected':'')+'>'+esc(a.full)+'</option>').join('')+'</select></div>'
 +'<div class="form-field"><label for="f-stock">股票'+(sell&&!old&&held.length?' <small>只列這個帳戶有庫存的</small>':'')+'</label><select id="f-stock" name="code">'+codes.map(k=>'<option value="'+esc(k)+'" '+(symbol===k?'selected':'')+'>'+esc(stocks[k].symbol+' '+stocks[k].name)+'</option>').join('')+'</select>'+(!lockPlace&&!sell?'<button type="button" class="link" data-new-security>'+icon('plus')+'清單沒有？新增股票</button>':'')+'<p class="avail" id="availability"></p></div>'
 +'<div class="form-pair"><div class="form-field"><label for="f-date">成交日期</label><input id="f-date" name="date" type="date" max="'+today()+'" '+(minDate?'min="'+esc(minDate)+'" ':'')+'value="'+esc(old?.date||keep.date||today())+'" required></div><div class="form-field"><label for="f-time">成交時間 <small>選填</small></label><input id="f-time" name="time" type="time" value="'+esc(old?.time||keep.time||'')+'"></div></div>'
 +'<div class="form-pair"><div class="form-field"><label for="f-price">成交價格</label><input id="f-price" name="price" type="number" inputmode="decimal" min="0.01" step="0.01" value="'+price+'" required></div><div class="form-field"><label for="f-qty">股數</label><input id="f-qty" name="qty" type="number" inputmode="numeric" min="1" step="1" value="'+qty+'" required></div></div>'
 +'<div id="sell-options"></div><div class="form-preview"><span id="estimate-label"></span><b id="estimate"></b></div>'
 +'<details class="details"><summary>手續費、交易稅、分類與備註</summary><div class="form-pair"><div class="form-field"><label for="f-fee">手續費</label><input id="f-fee" name="fee" type="number" inputmode="numeric" min="0" step="0.01" value="'+esc(old?.fee??keep.fee??'')+'" placeholder="依帳本費率估算"></div><div class="form-field"><label for="f-tax">交易稅</label><input id="f-tax" name="tax" type="number" inputmode="numeric" min="0" step="0.01" value="'+esc(old?.tax??keep.tax??'')+'" placeholder="依帳本費率估算"></div></div><p class="hint">留白使用帳本的券商費率；填寫時採用實際金額。</p><div class="form-field"><label for="f-category">策略分類</label><select id="f-category" name="category">'+(task||old?.rebuyIds?['REBUY']:cats).map(v=>'<option value="'+esc(v)+'" '+(cat===v?'selected':'')+'>'+esc(categoryName(v))+'</option>').join('')+'</select></div><div class="form-field"><label for="f-note">備註</label><textarea id="f-note" name="note">'+esc(old?.note||keep.note||'')+'</textarea></div></details>'
 +(task?'<p class="notice">配對到 '+esc(slash(task.date))+' 以 '+fmt(task.price)+' 賣出的買回計畫，還有 '+fmt(task.qty)+' 股待買回。</p>':'')
 +(cyc?'<p class="notice">回補 '+esc(slash(cyc.date))+' 以 '+fmt(cyc.price)+' 借券賣出的 '+fmt(cyc.qty)+' 股，'+(old?'這筆回補 '+fmt(old.qty)+' 股，':'')+'目前還有 '+fmt(cyc.remaining)+' 股待回補。</p>':'')
 +(old?.borrow?'<p class="hint">借券交易的帳戶與股票不能更改；股數、日期與借出來源會依 A 版規則重新檢查。</p>':'')
 +(old&&(old.linked||old.aligned)?'<p class="hint">這筆交易已被配對或對帳。修改金額或股數會重新計算配對、買回與損益'+(old.aligned?'，已採用的券商金額需重新確認':'')+'。</p>':'')
 +'<p class="hint">會存入 A、B 共用的正式帳本。</p><div class="sticky-submit"><button class="primary wide '+type+'" type="submit">儲存'+word+'</button></div></form>');
 updateEstimate(true);
}
function updateEstimate(rebuild=false){const f=$('#trade-form');if(!f)return;const sell=f.elements.type.value==='sell';
 if(sell&&rebuild){const d=formFields(),lend=d.borrow==='sell',options=lend?client.borrowOptions(d):client.sellOptions(d),old=state.trades.find(t=>t.id===d.id),ids=((lend?old?.borrowSources:old?.sources)||'').split(',');f._options=options;
  $('#sell-options').innerHTML=options.length?'<fieldset class="lots"><legend>'+(lend?'從哪幾批庫存借出 · 依勾選順序扣除':'從哪幾批賣出 · 高價優先')+'</legend>'+options.map(o=>'<label class="lot"><input type="checkbox" name="source" value="'+esc(o.value)+'" data-shares="'+o.shares+'" '+(old&&ids.includes(o.value)?'checked':'')+'><span><b>'+esc(short(o.date))+' 買 · '+fmt(o.price)+'</b><small>'+(lend?'可借 ':'可賣 ')+fmt(o.shares)+' 股</small></span><em></em></label>').join('')+'<p class="hint">沒動過勾選時，會依高價優先自動取足夠股數。</p></fieldset>':'<p class="hint">成交日期前這個帳戶沒有'+(lend?'可借出的':'可賣')+'庫存。</p>';}
 if(sell&&!f.dataset.lotsTouched)autoPickLots(f);
 const d=formFields(),gross=Number(d.qty)*Number(d.price),fees=Number(d.fee)+Number(d.tax);
 $('#estimate').textContent=money(sell?gross-fees:gross+fees);$('#estimate-label').textContent=sell?'扣費用預估淨收款':'含費用預估支出';
 if(sell){const options=f._options||[],total=options.reduce((s,o)=>s+o.shares,0),cost=options.reduce((s,o)=>s+o.shares*o.price,0),picked=Array.from(f.querySelectorAll('[name="source"]:checked')).reduce((s,x)=>s+Number(x.dataset.shares),0);
  $('#availability').innerHTML=total?(d.borrow==='sell'?'可借 <b>':'可賣 <b>')+fmt(total)+' 股</b> · 均價 '+fmt(Math.round(cost/total*100)/100)+(picked<Number(d.qty)?' · <span class="warn">已勾選只夠 '+fmt(picked)+' 股</span>':''):(d.borrow==='sell'?'這個帳戶沒有可借出的庫存':'這個帳戶沒有可賣庫存');
  let left=Number(d.qty);f.querySelectorAll('.lot').forEach(l=>{const x=l.querySelector('input'),n=Number(x.dataset.shares),use=x.checked?Math.max(0,Math.min(n,left)):0;if(x.checked)left-=use;l.querySelector('em').textContent=x.checked?fmt(use)+' 股':'';});}
 else $('#availability').textContent='此帳戶現金 '+money(state.cash[d.account]||0);}
// What the user already typed, carried over when the form is rebuilt (type switch, sell account change).
function formSnapshot(f){const e=f.elements;return {account:e.account.value,code:e.code.value,date:e.date.value,time:e.time.value,price:e.price.value,qty:e.qty.value,fee:e.fee.value,tax:e.tax.value,category:e.category.value,note:e.note.value,borrow:e.borrow.value};}
function autoPickLots(f){let left=Number(f.elements.qty.value)||0;f.querySelectorAll('[name="source"]').forEach(x=>{x.checked=left>0;if(x.checked)left-=Number(x.dataset.shares);});}

function financialEdit(f){const old=state.trades.find(t=>t.id===f.dataset.editId);if(!old)return false;const d=formFields();return d.date!==old.date||d.account!==old.account||d.code!==old.code||Number(d.qty)!==old.qty||Number(d.price)!==old.price||Number(d.fee)!==old.fee||Number(d.tax)!==old.tax||(old.type==='sell'&&d.sources!==(old.borrow==='BORROW_SELL'?old.borrowSources:old.sources));}
function submitTrade(f){if(!f.reportValidity())return;
 // Like A's double confirmation: a second tap is needed before amounts on a matched trade are recomputed.
 if(f.dataset.linked&&f.dataset.confirmed!=='1'&&financialEdit(f)){f.dataset.confirmed='1';f.querySelector('#form-error').innerHTML='<div class="alert">修改這筆已配對的交易會重新計算庫存配對、買回與損益。確認無誤請再按一次「確認修改」。</div>';f.querySelector('[type="submit"]').textContent='確認修改';f.querySelector('#form-error').scrollIntoView({block:'nearest'});return;}
 const b=f.querySelector('[type="submit"]'),who=client.user?.uid;const label=b.textContent;b.disabled=true;b.textContent='正在儲存…';f.querySelector('#form-error').innerHTML='';client.commit({kind:'upsertTransaction',id:f.dataset.editId,fields:formFields()}).then(next=>{if(client.user?.uid!==who)return;setState(next);if(f.isConnected)closeSheet(false);render();toast('已儲存到共用帳本');}).catch(e=>{const box=f.querySelector('#form-error');if(f.isConnected&&box){box.innerHTML='<div class="error">'+esc(errorText(e))+'</div>';box.scrollIntoView({block:'nearest'});}else toast(errorText(e));}).finally(()=>{if(b.isConnected){b.disabled=false;b.textContent=label;}});}
function inventoryDetail(code){const g=stockGroups().find(x=>x.code===code),s=stocks[code];if(!g)return;sheet(stockName(code)+' · '+ticker(code),'<div class="big-detail">'+fmt(g.qty)+' 股<span class="hint" style="display:block">目前可賣股數</span></div><dl class="definition"><div><dt>剩餘成本</dt><dd>'+money(g.cost)+'</dd></div><div><dt>帳本最新報價</dt><dd>'+(s?.price!=null?fmt(s.price):'尚無報價')+'</dd></div><div><dt>報價時間</dt><dd>'+esc(s?.quoteTime?stamp(s.quoteTime):'尚無報價')+'</dd></div></dl><h3 class="mini-heading">各筆買進</h3>'+g.lots.map(l=>'<div class="lot"><span><b>'+fmt(l.qty)+' 股 · 買價 '+fmt(l.cost)+'</b><small>'+esc(slash(l.date))+' · '+esc(accountName(l.account))+(l.borrowed?' · 借出 '+fmt(l.borrowed)+' 股':'')+(l.adjusted?' · 已成本交換':'')+'</small></span></div>').join('')
 +exchangeList(code)+'<div class="sheet-actions"><button class="secondary buy-text" data-new="buy" data-code="'+esc(code)+'">再買進</button><button class="primary sell" data-new="sell" data-code="'+esc(code)+'">記一筆賣出</button></div><div class="sheet-actions" style="margin-top:10px"><button class="secondary" data-new="sell" data-borrow="sell" data-code="'+esc(code)+'">借券賣出</button><button class="secondary" data-exchange="'+esc(code)+'">成本交換</button></div>');}
function exchangeList(code){const list=selected(state.exchanges).filter(x=>x.code===code);return list.length?'<h3 class="mini-heading">成本交換</h3>'+list.map(x=>'<div class="lot"><span><b>'+esc(slash(x.date))+' · '+fmt(x.shares)+' 股 '+fmt(x.originalPrice)+' → '+fmt(x.finalPrice)+'</b><small>外部成本 '+fmt(x.externalPrice)+(x.redistributed?' · 其他批次調降 '+fmt(x.redistributed):'')+(x.label?' · '+esc(x.label):'')+'</small></span>'+(x.deletable?'<button class="link" data-delete-exchange="'+esc(x.id)+'">撤銷</button>':'<small>已賣出或借出，不能撤銷</small>')+'</div>').join(''):'';}
// A's 庫存成本交換: a full, unsold lot takes an outside cost; other full lots of the same stock can give up cost per share to it.
function exchangeSheet(code,keep={}){
 const lots=selected(state.lots).filter(l=>l.code===code&&l.exchangeable);
 if(!lots.length)return toast('這檔股票沒有完整未賣出、未借出的庫存批次，不能做成本交換。');
 const source=lots.find(l=>l.buyTx===keep.source)||lots[0],targets=lots.filter(l=>l.buyTx!==source.buyTx&&l.account===source.account);
 sheet('成本交換 · '+stockName(code),'<form id="exchange-form" data-code="'+esc(code)+'"><div id="form-error" role="alert"></div><p class="hint">只能選完整未賣出、未借出的買進批次。和 A 版一樣，換入批次改用外部成本；可再從同帳戶其他批次調降每股成本，調降的金額加回換入批次。</p>'
 +'<div class="form-field"><label for="x-source">換入批次</label><select id="x-source" name="source">'+lots.map(l=>'<option value="'+esc(l.buyTx)+'" '+(l===source?'selected':'')+'>'+esc(slash(l.date)+' · '+fmt(l.original)+' 股 @ '+fmt(l.cost)+' · '+accountName(l.account))+'</option>').join('')+'</select></div>'
 +'<div class="form-pair"><div class="form-field"><label for="x-price">外部庫存成本（每股）</label><input id="x-price" name="externalPrice" type="number" inputmode="decimal" min="0.01" step="0.01" value="'+esc(keep.externalPrice||'')+'" required></div><div class="form-field"><label for="x-date">交換日期</label><input id="x-date" name="date" type="date" min="'+esc(source.date)+'" max="'+today()+'" value="'+esc(keep.date||today())+'" required></div></div>'
 +'<div class="form-field"><label for="x-label">外部帳戶 <small>選填</small></label><input id="x-label" name="label" value="'+esc(keep.label||'')+'" placeholder="例如：另一家券商"></div>'
 +(targets.length?'<fieldset class="lots"><legend>同時調降其他批次（選填）</legend>'+targets.map(l=>'<label class="lot"><input type="checkbox" name="target" value="'+esc(l.buyTx)+'"><span><b>'+esc(short(l.date))+' · '+fmt(l.original)+' 股 @ '+fmt(l.cost)+'</b><small>每股調降</small></span><input class="reduce" name="reduce-'+esc(l.buyTx)+'" type="number" inputmode="decimal" min="0" step="0.01" aria-label="每股調降金額" style="width:90px"></label>').join('')+'</fieldset>':'')
 +'<div class="form-preview"><span>換入批次調整後成本</span><b id="exchange-preview">—</b></div><p class="hint" id="exchange-detail"></p><div class="sticky-submit"><button class="primary wide" type="submit">儲存成本交換</button></div></form>');
 updateExchangePreview();
}
function exchangeFields(f){const e=f.elements;return {source:e.source.value,externalPrice:e.externalPrice.value,date:e.date.value,label:e.label.value,targets:Array.from(f.querySelectorAll('[name="target"]:checked')).map(x=>({id:x.value,reduction:f.elements['reduce-'+x.value].value}))};}
function updateExchangePreview(){const f=$('#exchange-form');if(!f)return;const out=$('#exchange-preview'),detail=$('#exchange-detail');
 try{const p=client.exchangePreview(exchangeFields(f));out.textContent=fmt(p.sourceCurrentPrice)+' → '+fmt(p.sourceFinalPrice);detail.textContent='外部換入差額 '+signed(p.externalSwapCostDelta)+(p.redistributedAmount?'；其他批次調降合計 '+fmt(p.redistributedAmount)+'，加回換入批次':'')+'。';}
 catch(e){out.textContent='—';detail.textContent=f.elements.externalPrice.value?errorText(e):'';}}
function securitySheet(back=null){returnForm=back;sheet('新增股票','<form id="security-form"><div id="form-error" role="alert"></div><div class="form-pair"><div class="form-field"><label for="s-symbol">股票代號</label><input id="s-symbol" name="symbol" autocomplete="off" autocapitalize="characters" placeholder="2330" required></div><div class="form-field"><label for="s-market">市場</label><select id="s-market" name="market"><option value="TW">上市</option><option value="TWO">上櫃</option><option value="US">美股</option></select></div></div><div class="form-field"><label for="s-name">名稱</label><input id="s-name" name="name" placeholder="台積電"></div><div class="form-field"><label for="s-yahoo">Yahoo 代號 <small>選填，留白自動帶入</small></label><input id="s-yahoo" name="yahooSymbol" autocomplete="off" placeholder="2330.TW"></div><p class="hint">和 A 版相同：代號 00 開頭或名稱含 ETF 會標成 ETF，交易稅率跟著調整。</p><div class="sticky-submit"><button class="primary wide" type="submit">新增股票</button></div></form>');}
function stockListSheet(){const list=Object.entries(stocks).sort((a,b)=>a[1].symbol.localeCompare(b[1].symbol));sheet('股票清單','<div class="list">'+list.map(([,s])=>'<div class="menu-row"><span><strong>'+esc(s.symbol+' '+s.name)+'</strong><small>'+esc((s.assetType==='ETF'?'ETF':'股票')+' · '+({TW:'上市',TWO:'上櫃',US:'美股'}[s.market]||s.market)+(s.price!=null?' · 報價 '+fmt(s.price):''))+'</small></span></div>').join('')+'</div><button class="primary wide" style="margin-top:16px" data-new-security>新增股票</button>');}
async function submitForm(f,op,done){if(!f.reportValidity())return;const b=f.querySelector('[type="submit"]'),label=b.textContent,who=client.user?.uid;b.disabled=true;b.textContent='正在儲存…';f.querySelector('#form-error').innerHTML='';
 try{const next=await client.commit(op);if(client.user?.uid!==who)return;setState(next);if(f.isConnected)closeSheet(false);render();done(next);}
 catch(e){const box=f.querySelector('#form-error');if(f.isConnected&&box){box.innerHTML='<div class="error">'+esc(errorText(e))+'</div>';box.scrollIntoView({block:'nearest'});}else toast(errorText(e));}
 finally{if(b.isConnected){b.disabled=false;b.textContent=label;}}}

function reconReview(key){const l=state.reconciliation.find(x=>x.key===key);if(!l)return;const accept=['FEE_TAX_DIFF','AMOUNT_DIFF'].includes(l.matchStatus)&&l.brokerExecutionId&&!l.brokerAcceptedAt;sheet('檢查對帳差異','<p class="notice">'+esc(stockName(l.securityId))+' · '+esc(slash(l.tradeDate))+' · '+esc(accountName(l.brokerAccountId))+'</p><dl class="definition"><div><dt>帳本淨額</dt><dd>'+money(l.appNetAmount)+'</dd></div><div><dt>券商淨額</dt><dd>'+money(l.allocatedNetAmount)+'</dd></div><div><dt>手續費差異</dt><dd>'+money(l.diffFee)+'</dd></div><div><dt>交易稅差異</dt><dd>'+money(l.diffTax)+'</dd></div></dl>'+(accept?'<p class="hint">採用會寫入原本的對帳接受紀錄，成本、現金及報表依原本規則重新計算。</p><div class="sheet-actions"><button class="secondary" data-close>先保留</button><button class="primary" data-accept-recon="'+esc(key)+'">採用券商金額</button></div>':'<p class="hint">股數或交易缺漏請到 A 版匯入及調整。</p>'));}
function rebuy(id){const r=state.rebuy.find(x=>x.id===id);if(!r)return;sheet('買回計畫','<p class="notice">'+esc(stockName(r.code))+' · '+esc(ticker(r.code))+' · 還有 '+fmt(r.qty)+' 股待買回</p><dl class="definition"><div><dt>原賣出日</dt><dd>'+esc(slash(r.date))+'</dd></div><div><dt>券商帳戶</dt><dd>'+esc(accountName(r.account))+'</dd></div><div><dt>原賣價</dt><dd>'+fmt(r.price)+'</dd></div><div><dt>買回參考價</dt><dd>'+fmt(r.target)+'</dd></div>'+(r.sold&&r.sold>r.qty?'<div><dt>已買回</dt><dd>'+fmt(r.sold-r.qty)+' / '+fmt(r.sold)+' 股</dd></div>':'')+'</dl><div class="rebuy-actions"><button class="primary wide buy" data-rebuy-buy="'+esc(r.id)+'">記錄買回</button><button class="secondary wide" data-rebuy-close="'+esc(r.id)+'">不買回了，手動結案</button></div>');}
function rebuyCloseSheet(id){const r=state.rebuy.find(x=>x.id===id);if(!r)return;sheet('手動結案','<p class="notice">確認結案 '+esc(slash(r.date))+' 賣出的 '+esc(stockName(r.code))+' 買回計畫？剩下的 '+fmt(r.qty)+' 股不再列入待買回。</p><div class="sheet-actions"><button class="secondary" data-close>取消</button><button class="danger" data-confirm-rebuy-close="'+esc(r.id)+'">確認結案</button></div>');}
const CASH_TYPES=[['deposit','入金'],['withdraw','出金'],['dividend','股息'],['interest','利息']];
function cashForm(type='deposit',id='',keep={}){
 if(!accounts.some(a=>a.id!=='all'))return toast('請先在 A 版建立券商帳戶。');
 const old=id?state.trades.find(x=>x.id===id&&x.cash):null;type=old?.type||type;
 const acc=old?.account||keep.account||(state.account==='all'?accounts.find(a=>a.id!=='all').id:state.account);
 sheet(old?'編輯'+CASH_NAMES[type]:'記一筆'+CASH_NAMES[type],'<form id="cash-form" data-edit-id="'+esc(id)+'"><div id="form-error" role="alert"></div><div class="tabs type-tabs">'+CASH_TYPES.map(([v,n])=>'<button type="button" class="'+(type===v?'active':'')+'" data-cash-type="'+v+'" aria-pressed="'+(type===v)+'" '+(old?'disabled':'')+'>'+n+'</button>').join('')+'</div><input type="hidden" name="cashType" value="'+type+'">'
 +'<div class="form-field"><label for="c-account">券商帳戶</label><select id="c-account" name="account">'+accounts.filter(a=>a.id!=='all').map(a=>'<option value="'+esc(a.id)+'" '+(acc===a.id?'selected':'')+'>'+esc(a.full)+'</option>').join('')+'</select><p class="avail" id="cash-availability"></p></div>'
 +'<div class="form-pair"><div class="form-field"><label for="c-date">日期</label><input id="c-date" name="date" type="date" max="'+today()+'" value="'+esc(old?.date||keep.date||today())+'" required></div><div class="form-field"><label for="c-amount">金額</label><input id="c-amount" name="amount" type="number" inputmode="decimal" min="1" step="1" value="'+esc(old?Math.abs(old.net):keep.amount||'')+'" required></div></div>'
 +'<div class="form-field"><label for="c-note">備註 <small>選填</small></label><textarea id="c-note" name="note">'+esc(old?.note||keep.note||'')+'</textarea></div>'
 +(['deposit','withdraw'].includes(type)?'<p class="hint">入金、出金會一併記錄當天 0050 價格，作為績效比較基準，和 A 版相同。</p>':'')
 +'<p class="hint">會存入 A、B 共用的正式帳本。</p><div class="sticky-submit"><button class="primary wide" type="submit">儲存'+CASH_NAMES[type]+'</button></div></form>');
 updateCashHint();
}
function updateCashHint(){const f=$('#cash-form');if(!f)return;const box=$('#cash-availability');if(box)box.textContent='此帳戶現金 '+money(state.cash[f.elements.account.value]||0);}
function cashSnapshot(f){const e=f.elements;return {account:e.account.value,date:e.date.value,amount:e.amount.value,note:e.note.value};}
async function submitCash(f){if(!f.reportValidity())return;const b=f.querySelector('[type="submit"]'),label=b.textContent,who=client.user?.uid,d=Object.fromEntries(new FormData(f));b.disabled=true;b.textContent='正在儲存…';f.querySelector('#form-error').innerHTML='';
 try{
  const old=state.trades.find(t=>t.id===f.dataset.editId);
  let benchmark=null;
  // Same as A: deposits and withdrawals capture that day's 0050 price; reuse the old one when date and account did not change.
  if(['deposit','withdraw'].includes(d.cashType)&&(!old||old.date!==d.date||old.account!==d.account)&&state.defaultCode){b.textContent='正在查 0050 基準價…';benchmark=await benchmarkFor(stocks[state.defaultCode],state.defaultCode,d.date);b.textContent='正在儲存…';}
  const next=await client.commit({kind:'upsertCash',id:f.dataset.editId,fields:d,benchmark});
  if(client.user?.uid!==who)return;setState(next);if(f.isConnected)closeSheet(false);render();toast(CASH_NAMES[d.cashType]+'已儲存'+(benchmark||!['deposit','withdraw'].includes(d.cashType)||old?'':'（0050 基準價暫時查不到，A 版可之後補上）'));
 }catch(e){const box=f.querySelector('#form-error');if(f.isConnected&&box){box.innerHTML='<div class="error">'+esc(errorText(e))+'</div>';box.scrollIntoView({block:'nearest'});}else toast(errorText(e));}
 finally{if(b.isConnected){b.disabled=false;b.textContent=label;}}}
let quotesBusy=false;
async function refreshQuotes(button){
 if(quotesBusy)return;
 const codes=[...new Set(state.lots.map(l=>l.code))].filter(c=>stocks[c]);
 if(!codes.length)return toast('目前沒有持股可更新報價。');
 quotesBusy=true;document.querySelectorAll('[data-refresh-quotes]').forEach(x=>{x.disabled=true;x.lastChild.textContent='正在抓報價…';});
 try{
  const results=await Promise.all(codes.map(code=>fetchQuote(stocks[code]).then(q=>({ok:true,quote:{securityId:code,...q}}),e=>({ok:false,symbol:stocks[code].symbol,error:e.message}))));
  const quotes=results.filter(r=>r.ok).map(r=>r.quote),failed=results.filter(r=>!r.ok);
  if(!quotes.length)throw new Error('報價抓取失敗：'+(failed[0]?failed[0].symbol+' '+failed[0].error:'沒有回應'));
  setState(await client.commit({kind:'updateQuotes',quotes}));render();
  toast('已更新 '+quotes.length+' 檔報價'+(failed.length?'，'+failed.map(f=>f.symbol).join('、')+' 失敗':''));
 }finally{quotesBusy=false;document.querySelectorAll('[data-refresh-quotes]').forEach(x=>{x.disabled=false;x.lastChild.textContent='更新報價';});}
}


function report(){const t=totals();sheet('資產摘要','<div class="summary-strip"><div><small>總資產'+(t.missing?'估值':'')+'</small><b>'+fmt(t.total)+'</b></div><div><small>帳上現金</small><b>'+fmt(t.cash)+'</b></div></div><dl class="definition"><div><dt>庫存'+(t.missing?'估值':'市值')+'</dt><dd>'+money(t.value)+'</dd></div><div><dt>已報價庫存損益</dt><dd>'+money(t.pnl)+'</dd></div></dl>'+(t.missing?'<p class="hint">缺報價的庫存暫用成本估算，不計入未實現損益。</p>':'')+'<a class="link" href="https://jackstock-ed2d2.web.app/#/app/reports" target="_blank" rel="noopener">A 版完整報表'+icon('arrow')+'</a>');}


function ticker(id){return stocks[id]?.symbol||id;}

function stockName(id){return stocks[id]?.name||'未命名股票';}

function accountName(id){return accounts.find(a=>a.id===id)?.name||'已停用帳戶';}

function stamp(v){if(!v)return '尚無時間';const d=new Date(v);return Number.isNaN(d.valueOf())?v:new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',dateStyle:'short',timeStyle:'short',hour12:false}).format(d);}

function setState(next){state=next;stocks=next.stocks;accounts=next.accounts;}

function reconItems(){return selected(state.reconciliation.map(x=>({...x,account:x.brokerAccountId})));}
function issues(){return reconItems().filter(x=>!x.settled);}

function buybacks(){return selected(state.rebuy);}

function authView(){return '<div class="page-title" style="margin-top:34px"><h1>你的帳本，新的手機介面</h1><p>使用原有 Google 或已設定的 Email／密碼登入</p></div><div class="notice">A、B 版共用原本的帳本。<br>B 版新增、修改或刪除交易，會寫入正式資料。</div>'+(authError?'<div class="error" role="alert">'+esc(authError)+'</div>':'')+'<button class="primary wide" data-login '+(loading?'disabled':'')+'>'+(loading?'正在連接帳本…':identity?'重新載入帳本':'使用 Google 登入')+'</button>'+(!identity?'<button class="link" data-login-redirect '+(loading?'disabled':'')+'>登入視窗被擋住？使用重新導向登入</button><details class="details" style="margin-top:20px"><summary>使用 Email／密碼登入</summary><p class="hint">首次設定請先用 Google 登入，再到「更多 → 帳號登入方式」。</p><form id="email-login-form"><div class="form-field"><label for="login-email">Email</label><input id="login-email" type="email" name="email" value="punktoggy@gmail.com" autocomplete="username" readonly></div><div class="form-field"><label for="login-password">密碼</label><input id="login-password" type="password" name="password" autocomplete="current-password" required '+(loading?'disabled':'')+'></div><button class="secondary wide" type="submit" '+(loading?'disabled':'')+'>使用 Email／密碼登入</button></form></details>':'')+'<details class="details" style="margin-top:25px"><summary>A 版使用自訂雲端帳本名稱</summary><form id="namespace-form"><div class="form-field"><label for="namespace">雲端帳本名稱</label><input id="namespace" name="namespace" autocomplete="off" placeholder="未設定時留白，使用登入帳號"></div><button class="secondary wide" type="submit">載入這個帳本</button></form></details><p class="quiet">未登入前不會建立或顯示樣本交易。<br>找不到雲端資料時，請先回 A 版同步。</p><a class="link" href="https://jackstock-ed2d2.web.app" target="_blank" rel="noopener">開啟 A 版'+icon('arrow')+'</a>';}

async function accountSecuritySheet(){
 if(!client?.nativeAuth.isOwner())throw Object.assign(new Error('此設定只供原帳本擁有者。'),{code:'auth/native-owner-required'});
 const ticket=authEpoch,status=await client.nativeAuth.status();if(ticket!==authEpoch||!state)return;
 const body='<div class="notice">Google 與 Email／密碼會登入同一個既有管理帳號與帳本。</div><dl class="definition"><div><dt>Email</dt><dd>'+esc(status.email)+'</dd></div><div><dt>雲端帳本</dt><dd>'+esc(status.namespace)+'</dd></div><div><dt>登入方式</dt><dd>Google'+(status.hasPassword?' ＋ Email／密碼':'')+'</dd></div></dl>';
 if(status.hasPassword)return sheet('帳號登入方式',body+'<p class="hint">此帳號已支援密碼登入。使用既有密碼；忘記時可由你本人寄送官方重設信。</p><button class="secondary wide" data-native-reset>寄送密碼重設信</button>');
 sheet('設定 Email／密碼登入',body+'<p class="hint">請先確認 Google 身分，密碼由你自行輸入；完成後保留原 Google 登入。</p><button class="secondary wide" data-native-reauth>以 Google 重新驗證本人</button><button class="link" data-native-reauth-redirect>驗證視窗被擋住？使用重新導向</button><form id="native-password-form"><div class="form-field"><label for="native-email">Email</label><input id="native-email" type="email" value="'+esc(status.email)+'" autocomplete="username" readonly></div><fieldset style="border:0;padding:0;margin:0" '+(status.canSetPassword?'':'disabled')+'><div class="form-field"><label for="native-password">新密碼</label><input id="native-password" name="password" type="password" autocomplete="new-password" minlength="12" maxlength="4096" required></div><div class="form-field"><label for="native-password-confirm">再次輸入新密碼</label><input id="native-password-confirm" name="confirmation" type="password" autocomplete="new-password" minlength="12" maxlength="4096" required></div><p class="hint">至少 12 個字元。密碼直接送至 Firebase，不會寫入帳本。</p><button class="primary wide" type="submit">確認新增密碼登入</button></fieldset><div id="native-password-error" class="error" role="alert" hidden></div></form>');
}
async function submitEmailLogin(form){
 let email=form.elements.email.value,password=form.elements.password.value;form.reset();loading=true;authError='';render();
 try{await client.signInPassword(email,password);}catch(error){authError=errorText(error);}finally{email='';password='';loading=false;if(!state)render();}
}
async function submitNativePassword(form){
 let password=form.elements.password.value,confirmation=form.elements.confirmation.value;form.reset();const button=form.querySelector('[type="submit"]');button.disabled=true;
 try{await client.nativeAuth.linkPassword(password,confirmation);if(form.isConnected){closeSheet();toast('已新增密碼登入，Google 與原帳本保持不變');}}
 catch(error){if(form.isConnected){const box=form.querySelector('#native-password-error');box.textContent=errorText(error);box.hidden=false;}}
 finally{password='';confirmation='';if(button.isConnected)button.disabled=false;}
}



function formFields(){const f=$('#trade-form'),fields=Object.fromEntries(new FormData(f));fields.id=f.dataset.editId;const costs=client.costs(fields);fields.fee=fields.fee===''?costs.fee:Number(fields.fee);fields.tax=fields.tax===''?costs.tax:Number(fields.tax);fields.sources=Array.from(f.querySelectorAll('[name="source"]:checked')).map(x=>x.value).join(',');return fields;}

function reload(){loading=true;authError='';if(!state)render();return client.reload().then(next=>{setState(next);closeSheet(false);render();toast('已載入最新雲端帳本');}).finally(()=>{loading=false;});}

async function click(b){
 if(b.hasAttribute('data-close'))return closeSheet();
 if(b.hasAttribute('data-login')||b.hasAttribute('data-login-redirect')){if(!client)throw new Error('Firebase 尚未連接，請重新整理後再試。');if(identity)return reload();return client.signIn(b.hasAttribute('data-login-redirect'));}
 if(!state)return;
 if(b.hasAttribute('data-native-settings'))return accountSecuritySheet();
 if(b.hasAttribute('data-native-reauth')||b.hasAttribute('data-native-reauth-redirect')){b.disabled=true;try{await client.nativeAuth.reauthenticate(b.hasAttribute('data-native-reauth-redirect'));if(b.isConnected)return accountSecuritySheet();}finally{if(b.isConnected)b.disabled=false;}return;}
 if(b.hasAttribute('data-native-reset')){b.disabled=true;try{await client.nativeAuth.requestPasswordReset();toast('已要求 Firebase 寄送密碼重設信，請自行到信箱完成');}finally{if(b.isConnected)b.disabled=false;}return;}
 if(b.dataset.page)return go(b.dataset.page);
 if(b.id==='account-switch'||b.hasAttribute('data-scope')||b.hasAttribute('data-accounts')||b.hasAttribute('data-portfolios'))return scopeSheet();
 if(b.dataset.account){setState(client.select(state.portfolioId,b.dataset.account));closeSheet(false);return render();}
 if(b.dataset.portfolio){setState(client.select(b.dataset.portfolio));closeSheet(false);inventoryTab='held';return render();}
 if(b.dataset.trade)return tradeDetail(b.dataset.trade);
 if(b.dataset.new)return form(b.dataset.new,b.dataset.code||'','',{borrow:b.dataset.borrow||''});
 if(b.dataset.formType)return form(b.dataset.formType,'','',{...formSnapshot($('#trade-form')),fee:'',tax:''});
 if(b.dataset.period){period=b.dataset.period;return render();}
 if(b.dataset.type){tradeType=b.dataset.type;return renderTradeResults();}
 if(b.dataset.reconTab){reconTab=b.dataset.reconTab;return render();}
 if(b.dataset.inventoryTab){inventoryTab=b.dataset.inventoryTab;return render();}
 if(b.hasAttribute('data-show-rebuy')){inventoryTab='rebuy';return go('inventory');}
 if(b.dataset.stock)return inventoryDetail(b.dataset.stock);
 if(b.dataset.rebuy)return rebuy(b.dataset.rebuy);
 if(b.dataset.reconReview)return reconReview(b.dataset.reconReview);
 if(b.dataset.acceptRecon){b.disabled=true;try{setState(await client.commit({kind:'acceptReconciliation',key:b.dataset.acceptRecon}));closeSheet(false);render();toast('已儲存對帳接受紀錄');}finally{if(b.isConnected)b.disabled=false;}return;}
 if(b.hasAttribute('data-report'))return report();
 if(b.hasAttribute('data-cash'))return sheet('現金餘額','<dl class="definition">'+accounts.filter(a=>a.id!=='all').map(a=>'<div><dt>'+esc(a.full)+'</dt><dd>'+money(state.cash[a.id]||0)+'</dd></div>').join('')+'</dl><div class="cash-row"><button data-new-cash="deposit">入金</button><button data-new-cash="withdraw">出金</button><button data-new-cash="dividend">股息／利息</button></div>');
 if(b.hasAttribute('data-reload'))return reload();
 if(b.hasAttribute('data-backup'))return sheet('連線與儲存狀態','<dl class="definition"><div><dt>Google 帳號</dt><dd>'+esc(state.user.email)+'</dd></div><div><dt>雲端帳本</dt><dd>'+esc(client.namespace)+'</dd></div><div><dt>上次載入／儲存</dt><dd>'+esc(stamp(state.updatedAt))+'</dd></div><div><dt>資料寫入</dt><dd>A、B 共用正式資料</dd></div></dl><button class="primary wide" data-reload>重新載入最新資料</button>');
 if(b.hasAttribute('data-original'))return sheet('原本的完整功能','<p class="notice">CSV 匯入、現金轉帳、庫存移轉、報表、備份與費率，目前請在 A 版操作。</p><a class="primary wide" style="display:block;text-align:center;text-decoration:none" href="https://jackstock-ed2d2.web.app" target="_blank" rel="noopener">開啟 A 版</a>');
 if(b.hasAttribute('data-logout'))return client.signOut();
 if(b.dataset.edit){const t=state.trades.find(x=>x.id===b.dataset.edit);return t.cash?cashForm(t.type,t.id):form(t.type,t.code,t.id);}
 if(b.dataset.newCash)return cashForm(b.dataset.newCash);
 if(b.dataset.cashType)return cashForm(b.dataset.cashType,'',cashSnapshot($('#cash-form')));
 if(b.hasAttribute('data-refresh-quotes'))return refreshQuotes(b);
 if(b.dataset.rebuyBuy)return form('buy','','',{rebuyIds:b.dataset.rebuyBuy});
 if(b.dataset.cycle)return cycleSheet(b.dataset.cycle);
 if(b.dataset.cycleBuy)return form('buy','','',{cycle:b.dataset.cycleBuy});
 if(b.dataset.matchEdit)return matchSheet(b.dataset.matchEdit);
 if(b.dataset.exchange)return exchangeSheet(b.dataset.exchange);
 if(b.hasAttribute('data-new-security')){const f=$('#trade-form');return securitySheet(f?{type:f.elements.type.value,...formSnapshot(f)}:null);}
 if(b.hasAttribute('data-stocks'))return stockListSheet();
 if(b.dataset.deleteExchange){const x=state.exchanges.find(y=>y.id===b.dataset.deleteExchange);if(!x)return;return sheet('撤銷成本交換','<p class="notice">撤銷 '+esc(slash(x.date))+' '+esc(stockName(x.code))+' '+fmt(x.shares)+' 股的成本交換？外部換入與對應的成本分配都會撤銷，原本的買進交易不受影響。</p><div class="sheet-actions"><button class="secondary" data-close>取消</button><button class="danger" data-confirm-delete-exchange="'+esc(x.id)+'">確認撤銷</button></div>');}
 if(b.dataset.confirmDeleteExchange){b.disabled=true;try{setState(await client.commit({kind:'deleteCostExchange',id:b.dataset.confirmDeleteExchange}));closeSheet(false);render();toast('成本交換已撤銷，庫存成本已重算');}finally{if(b.isConnected)b.disabled=false;}return;}
 if(b.dataset.rebuyClose)return rebuyCloseSheet(b.dataset.rebuyClose);
 if(b.dataset.confirmRebuyClose){b.disabled=true;try{setState(await client.commit({kind:'closeRebuy',sellIds:[b.dataset.confirmRebuyClose]}));closeSheet(false);render();toast('買回計畫已結案');}finally{if(b.isConnected)b.disabled=false;}return;}
 if(b.dataset.delete){const t=state.trades.find(x=>x.id===b.dataset.delete);return sheet('刪除共用交易','<p class="notice">確認刪除 '+(t.cash?esc(slash(t.date))+' '+money(Math.abs(t.net))+' 的'+CASH_NAMES[t.type]:esc(stockName(t.code))+' '+fmt(t.qty)+' 股的'+(t.type==='buy'?'買進':'賣出'))+'？<br>A、B 的現金與庫存都會改變。'+(()=>{const n=state.exchanges.filter(x=>x.source===t.id||x.targets.some(y=>y.id===t.id)).length;return n?'<br>同時撤銷 '+n+' 筆相關成本交換。':'';})()+'</p><div class="sheet-actions"><button class="secondary" data-close>取消</button><button class="danger" data-confirm-delete="'+esc(t.id)+'">刪除這筆交易</button></div>');}
 if(b.dataset.confirmDelete){b.disabled=true;try{setState(await client.commit({kind:'deleteTransaction',id:b.dataset.confirmDelete}));closeSheet(false);render();toast('已刪除共用交易');}finally{if(b.isConnected)b.disabled=false;}}
}
document.addEventListener('keydown',e=>{if(!$('#sheets').firstChild)return;if(e.key==='Escape')closeSheet();if(e.key==='Tab'){const focusables=Array.from($('.sheet').querySelectorAll('a[href],button:not(:disabled),input:not([type=hidden]),select,textarea,summary')).filter(x=>x.getClientRects().length>0);const first=focusables[0],last=focusables.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b){if(e.target.classList.contains('overlay'))closeSheet();return;}Promise.resolve(click(b)).catch(error=>{const msg=errorText(error);if(!state){authError=msg;loading=false;render();}else toast(msg);});});
// Search re-renders only the results, and waits while an IME (注音/倉頡) is composing.
function renderTradeResults(){const box=$('#trade-results');if(box)box.innerHTML=tradeResults();else render();}
document.addEventListener('compositionstart',e=>{if(e.target.id==='trade-search')composing=true;});
document.addEventListener('compositionend',e=>{if(e.target.id==='trade-search'){composing=false;query=e.target.value;renderTradeResults();}});
document.addEventListener('input',e=>{if(e.target.id==='trade-search'){if(composing||e.isComposing)return;query=e.target.value;return renderTradeResults();}if(e.target.closest('#exchange-form'))return updateExchangePreview();if(e.target.closest('#trade-form'))updateEstimate(['f-date','f-account'].includes(e.target.id));});
document.addEventListener('change',e=>{if(e.target.id==='c-account')updateCashHint();
 const x=e.target.closest('#exchange-form');if(x){if(e.target.id==='x-source')return exchangeSheet(x.dataset.code,exchangeFields(x));return updateExchangePreview();}
 const f=e.target.closest('#trade-form');if(!f)return;
 if(e.target.id==='f-borrow')return form('sell','','',{...formSnapshot(f),borrow:e.target.checked?'sell':'',fee:'',tax:''});
 if(e.target.name==='source')f.dataset.lotsTouched='1';
 if(e.target.id==='f-account'&&f.elements.type.value==='sell'&&!f.dataset.editId)return form('sell','','',{...formSnapshot(f),account:e.target.value});
 if(e.target.id==='f-stock'){const q=stocks[e.target.value]?.price;if(q!=null&&!f.dataset.editId)f.elements.price.value=q;f.dataset.lotsTouched=f.dataset.editId?'1':'';}
 if(['f-date','f-stock'].includes(e.target.id)&&!f.dataset.editId)f.dataset.lotsTouched='';
 updateEstimate(['f-date','f-stock','f-account'].includes(e.target.id));});
document.addEventListener('submit',e=>{if(e.target.id==='email-login-form'){e.preventDefault();submitEmailLogin(e.target);}if(e.target.id==='native-password-form'){e.preventDefault();submitNativePassword(e.target);}if(e.target.id==='trade-form'){e.preventDefault();submitTrade(e.target);}if(e.target.id==='cash-form'){e.preventDefault();submitCash(e.target);}
 if(e.target.id==='match-form'){e.preventDefault();const f=e.target;submitForm(f,{kind:'updateMatch',id:f.dataset.id,sources:Array.from(f.querySelectorAll('[name="source"]:checked')).map(x=>x.value).join(','),shares:f.elements.shares.value},()=>toast('配對已更新並重算'));}
 if(e.target.id==='exchange-form'){e.preventDefault();const f=e.target;submitForm(f,{kind:'createCostExchange',fields:exchangeFields(f)},()=>toast('成本交換已儲存'));}
 if(e.target.id==='security-form'){e.preventDefault();const f=e.target,fields=Object.fromEntries(new FormData(f)),back=returnForm;submitForm(f,{kind:'createSecurity',fields},next=>{const code=Object.keys(next.stocks).find(k=>next.stocks[k].symbol===String(fields.symbol).trim().toUpperCase());toast('已新增 '+String(fields.symbol).trim().toUpperCase());if(back)form(back.type||'buy','','',{...back,code,price:''});});}if(e.target.id==='namespace-form'){e.preventDefault();const namespace=new FormData(e.target).get('namespace');if(!identity){authError='請先登入原有帳號。';return render();}loading=true;client.reload({namespace}).then(next=>{setState(next);authError='';render();}).catch(error=>{authError=errorText(error);render();}).finally(()=>{loading=false;render();});}});
render();loading=true;render();
createLedgerClient(window.stockLedgerFirebaseConfig,{onAuthChange:async(user,api,error)=>{
const ticket=++authEpoch;client=api;identity=user;state=null;loading=!!user;authError=error?errorText(error):'';closeSheet(false);render();
if(user&&!error){try{const next=await api.reload();if(ticket===authEpoch){setState(next);page='home';authError='';}}catch(e){if(ticket===authEpoch)authError=errorText(e);}finally{if(ticket===authEpoch){loading=false;render();}}}else{loading=false;render();}
}}).then(api=>{client=api;loading=false;if(!state)render();}).catch(error=>{authError=errorText(error);loading=false;render();});


})();
