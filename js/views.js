// views.js
import { cls, ds, esc, fmt$, fmtDate, fmtK, norm, pad, r2, todayS } from './util.js';
import { S, firmBuf, load, ui } from './state.js';
import { acctById, acctLabel, activeAccts, allowedTransitions, byLineup, cushionOf, dayMap, inView, liveAccts, record, refreshPending, stopOf, tradePnl, transition } from './model.js';
import { seg } from './ui.js';
import { openDay, openImport } from './editors.js';

export function rOverview(){
  var view=ui.view,acts=activeAccts().filter(function(a){return inView(a.type,view)});
  var total=r2(acts.reduce(function(s,a){return s+a.balance},0)),rec=record(view);
  var nf=acts.filter(function(a){return a.type==='funded'}).length,ne=acts.length-nf;
  var h=seg('view',[['funded','Funded'],['evaluation','Evaluation'],['both','Both']],view);
  h+='<section class="card glass" id="ov-total"><h2>Total balance · active '+(view==='both'?'accounts':view==='funded'?'funded':'evaluation')+'</h2><div class="big" id="total-balance">'+fmt$(total)+'</div><div class="muted small">'+acts.length+' active'+(view==='both'?' · '+nf+' funded · '+ne+' evaluation':'')+'</div></section>';
  h+='<section class="card glass" id="ov-record"><h2>All-time record · never resets</h2><div class="grid4">'+
    '<div class="stat"><div class="l">Wins</div><div class="v pos" id="rec-w">'+rec.w+'</div></div>'+
    '<div class="stat"><div class="l">Losses</div><div class="v neg" id="rec-l">'+rec.l+'</div></div>'+
    '<div class="stat"><div class="l">BE</div><div class="v" id="rec-be">'+rec.be+'</div></div>'+
    '<div class="stat"><div class="l">Win rate</div><div class="v">'+(rec.wr==null?'—':Math.round(rec.wr*100)+'%')+'</div></div></div>'+
    '<div class="muted small" style="margin-top:8px">Record <b id="rec-str">'+rec.w+'–'+rec.l+'</b>'+(rec.be?' · '+rec.be+' BE (never counted)':'')+'</div></section>';
  h+=calendarHtml(view);
  if(!S.accounts.length&&!S.trades.length)h+='<div class="card glass empty">No data yet. Add accounts or import balances in <b>Accounts</b>, or load demo data in Settings ⚙︎.</div>';
  return h}
export function calendarHtml(view){
  var now=new Date(),ym=ui.cal||(now.getFullYear()+'-'+pad(now.getMonth()+1)),y=+ym.slice(0,4),m=+ym.slice(5,7)-1;
  var first=new Date(y,m,1),lead=first.getDay(),dim=new Date(y,m+1,0).getDate(),map=dayMap(view),tS=todayS();
  var mt=0,yt=0;Object.keys(map).forEach(function(d){if(+d.slice(0,4)===y){yt+=map[d].pnl;if(+d.slice(5,7)-1===m)mt+=map[d].pnl}});
  var cells=[];for(var i=lead;i>0;i--)cells.push({d:new Date(y,m,1-i),dim:true});for(var j=1;j<=dim;j++)cells.push({d:new Date(y,m,j)});
  var k=1;while(cells.length%7)cells.push({d:new Date(y,m+1,k++),dim:true});
  var h='<section class="card glass" id="calendar"><div class="cal-head"><button class="iconbtn" data-act="calNav" data-dir="-1" aria-label="Previous month">‹</button><div class="mname" id="cal-month">'+first.toLocaleDateString('en-US',{month:'long',year:'numeric'})+'</div><button class="iconbtn" data-act="calNav" data-dir="1" aria-label="Next month">›</button></div>';
  h+='<div class="cal-tot"><div class="stat"><div class="l">Month P&amp;L</div><div class="v '+cls(mt)+'" id="month-total">'+fmt$(mt,true)+'</div></div><div class="stat"><div class="l">'+y+' P&amp;L</div><div class="v '+cls(yt)+'" id="year-total">'+fmt$(yt,true)+'</div></div></div>';
  h+='<div class="cal">'+['S','M','T','W','T','F','S'].map(function(x){return '<div class="dow">'+x+'</div>'}).join('');
  cells.forEach(function(c){var s=ds(c.d),e=map[s],st=e?(e.pnl>0?'win':e.pnl<0?'loss':'flat'):'';
    h+='<button class="cal-cell '+st+(c.dim?' dim':'')+(s===tS?' today':'')+'" data-act="openDay" data-date="'+s+'" data-pnl="'+(e?e.pnl:'')+'"><span class="dn">'+c.d.getDate()+'</span><span class="dp">'+(e?fmtK(e.pnl):'')+'</span></button>'});
  return h+'</div></section>'}
export function rAccounts(){
  var act=activeAccts(),fund=act.filter(function(a){return a.type==='funded'}),ev=act.filter(function(a){return a.type!=='funded'});
  var sb=S.settings.startBalance,ab=r2(fund.reduce(function(s,a){return s+(a.balance-sb-firmBuf(a.firm))},0));
  var h='<section class="card glass" id="after-buffer"><h2>This month · after buffer (active funded)</h2><div class="big '+cls(ab)+'" id="after-buffer-v">'+fmt$(ab,true)+'</div><div class="muted small">Σ (balance − '+fmt$(sb)+' − firm buffer) over '+fund.length+' funded account'+(fund.length===1?'':'s')+'</div>'+
    (fund.length?'<div class="hist">'+fund.map(function(a){var v=r2(a.balance-sb-firmBuf(a.firm));return '<div><span>F '+esc(a.name)+'</span><b class="'+cls(v)+'">'+fmt$(v,true)+'</b></div>'}).join('')+'</div>':'')+'</section>';
  h+='<div class="grid2" style="margin-bottom:6px"><button class="btn primary" data-act="openImport" id="btn-open-import">Import balances</button><button class="btn" data-act="addAccount" id="btn-add-acct">+ Add account</button></div>';
  h+='<div class="sect f">Funded · '+fund.length+'</div>'+(fund.map(acctCard).join('')||'<div class="card glass empty small">No active funded accounts</div>');
  h+='<div class="sect e">Evaluation · '+ev.length+'</div>'+(ev.map(acctCard).join('')||'<div class="card glass empty small">No active evaluation accounts</div>');
  var hist=byLineup(liveAccts().filter(function(a){return a.status!=='active'}));
  h+='<details class="card glass" id="acct-history"><summary>History · blown / passed ('+hist.length+')</summary>'+(hist.map(function(a){return '<div class="trade-line" data-hist="'+esc(a.name)+'"><div class="row between"><b>'+esc(acctLabel(a))+'</b><span class="tag">'+a.status+'</span></div><div class="small muted">'+esc(a.firm)+' · '+a.type+' · last balance '+fmt$(a.balance)+' · peak '+fmt$(a.peak)+'</div></div>'}).join('')||'<div class="muted small" style="margin-top:8px">None</div>')+'</details>';
  h+='<details class="card glass" id="import-log"><summary>Import log ('+S.imports.length+')</summary>'+(S.imports.slice().reverse().map(function(im){return '<div class="trade-line row" style="align-items:flex-start">'+(im.image?'<img class="thumb" src="'+im.image+'" alt="screenshot" data-act="viewImg" data-id="'+im.id+'">':'')+'<div><b>'+fmtDate(im.date,{weekday:'short',month:'short',day:'numeric',year:'numeric'})+'</b><div class="small muted">'+im.lines.length+' lines · '+im.lines.filter(function(l){return l.result==='matched'}).length+' matched · '+im.lines.filter(function(l){return l.result==='created'}).length+' created'+(im.setLineup?' · set lineup':'')+'</div></div></div>'}).join('')||'<div class="muted small" style="margin-top:8px">No imports yet</div>')+'</details>';
  return h}
export function acctCard(a){
  var stop=stopOf(a),cu=cushionOf(a),buf=firmBuf(a.firm),pct=buf?Math.max(0,Math.min(1,cu/buf)):0,locked=stop>=a.startBalance;
  var tr=allowedTransitions(a).map(function(t){return '<button class="btn sm '+(t.key==='blown'?'danger':t.key==='funded'?'green':'')+'" data-act="transition" data-id="'+a.id+'" data-key="'+t.key+'">'+t.label+'</button>'}).join('');
  return '<div class="acct glass '+a.type+'" data-acct="'+a.id+'" data-name="'+esc(a.name)+'"><div class="row between"><div class="nm">'+(a.type==='funded'?'<span class="f">F</span>':'')+esc(a.name)+'</div><div class="mid" data-k="balance">'+fmt$(a.balance)+'</div></div>'+
   '<div class="small muted">#'+(a.lineupIndex+1)+' · '+esc(a.firm)+' · buffer '+fmt$(buf)+(locked?' · <b class="pos">stop locked at start</b>':'')+'</div>'+
   '<div class="kv"><div><div class="l">Start</div><div class="v">'+fmt$(a.startBalance)+'</div></div><div><div class="l">Peak</div><div class="v" data-k="peak">'+fmt$(a.peak)+'</div></div><div><div class="l">Stop</div><div class="v" data-k="stop">'+fmt$(stop)+'</div></div><div><div class="l">Cushion</div><div class="v '+(cu<=0?'neg':pct<.35?'':'pos')+'" data-k="cushion">'+fmt$(cu)+'</div></div></div>'+
   '<div class="bar '+(pct<.2?'bad':pct<.45?'warn':'')+'"><i style="width:'+Math.round(pct*100)+'%"></i></div>'+
   '<details style="margin-top:10px"><summary class="small">Balance history ('+a.history.length+') &amp; actions</summary><div class="hist">'+a.history.slice().reverse().map(function(x){return '<div><span>'+x.date+' <span class="muted tiny">'+(x.src||'')+'</span></span><b>'+fmt$(x.balance)+'</b></div>'}).join('')+'</div>'+
   '<div class="row wrap" style="margin-top:10px">'+tr+'<button class="btn sm danger" data-act="removeAcct" data-id="'+a.id+'">Remove</button></div><div class="tiny muted" style="margin-top:6px">Balances change only through Import balances. Status changes are one-way.</div></details></div>'}
export function rJournal(){
  refreshPending();
  var h='<button class="btn primary wide" data-act="openDay" data-date="'+todayS()+'" id="btn-log-today" style="margin-bottom:12px">+ Log / edit today</button>';
  var counts={};S.behaviors.forEach(function(b){counts[b]=0});S.trades.forEach(function(t){t.tags.forEach(function(g){if(g in counts)counts[g]++})});
  h+='<section class="card glass" id="patterns"><h2>Patterns in my notes · all-time</h2><div class="behs">'+S.behaviors.map(function(b){return '<div class="beh" data-beh="'+esc(b)+'"><div class="c">'+counts[b]+'</div><div class="t">'+esc(b)+'</div></div>'}).join('')+'</div>';
  var props=S.pendingBehaviors.filter(function(p){return p.count>=2&&S.dismissedBehaviors.indexOf(norm(p.label))<0});
  props.forEach(function(p){h+='<div class="propose"><div class="small">You\'ve tagged <b>“'+esc(p.label)+'”</b> on '+p.count+' notes. Make it a box?</div><div class="row" style="margin-top:8px"><button class="btn sm primary" data-act="createBeh" data-label="'+esc(p.label)+'">Create box</button><button class="btn sm" data-act="dismissBeh" data-label="'+esc(p.label)+'">Not now</button></div></div>'});
  var pend=S.pendingBehaviors.filter(function(p){return p.count<2});
  if(pend.length)h+='<div class="tiny muted" style="margin-top:8px">Pending custom labels: '+pend.map(function(p){return esc(p.label)+' ('+p.count+')'}).join(', ')+' — a box is proposed after 2 notes.</div>';
  h+='</section>';
  var byDay={};S.trades.forEach(function(t){(byDay[t.date]=byDay[t.date]||[]).push(t)});
  var days=Object.keys(byDay).sort().reverse();
  if(!days.length)h+='<div class="card glass empty">No trades logged yet.</div>';
  days.slice(0,ui.journalMore?9999:30).forEach(function(d){var ts=byDay[d],p=r2(ts.reduce(function(s,t){return s+tradePnl(t)},0));
    h+='<section class="day glass" data-day="'+d+'"><div class="row between"><b>'+fmtDate(d,{weekday:'short',month:'short',day:'numeric',year:'numeric'})+'</b><b class="'+cls(p)+'">'+fmt$(p,true)+'</b></div>'+
    ts.map(function(t){var tp=tradePnl(t);return '<div class="trade-line"><div class="row between"><span>'+(t.grade?'<span class="gb '+t.grade+'">'+t.grade+'</span>':'')+'<span class="small muted">'+t.entries.map(function(e){var a=acctById(e.accountId);return esc(a?acctLabel(a):'removed')}).join(', ')+'</span></span><b class="'+cls(tp)+'">'+fmt$(tp,true)+'</b></div>'+
      (t.notes?'<div class="small" style="margin-top:4px">'+esc(t.notes)+'</div>':'')+'<div>'+(t.be?'<span class="tag be">BE</span>':'')+t.tags.map(function(g){return '<span class="tag">'+esc(g)+'</span>'}).join('')+t.custom.map(function(g){return '<span class="tag" style="border:1px dashed var(--muted)">'+esc(g)+'</span>'}).join('')+'</div></div>'}).join('')+
    '<button class="btn sm" data-act="openDay" data-date="'+d+'" style="margin-top:8px">Edit day</button></section>'});
  if(days.length>30&&!ui.journalMore)h+='<button class="btn wide" data-act="journalMore">Show all '+days.length+' days</button>';
  return h}
