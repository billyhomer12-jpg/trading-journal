// views.js
import { cls, ds, esc, fmt$, fmtDate, fmtK, norm, pad, r2, todayS } from './util.js';
import { S, firmBuf, load, ui } from './state.js';
import { acctById, acctLabel, activeAccts, allowedTransitions, byLineup, cushionOf, dayMap, dayRecord, GRADE_ORDER, inView, liveAccts, record, refreshPending, stopOf, tradePnl, transition } from './model.js';
import { seg, ICON } from './ui.js';
import { dateSourceLabel, importAcctIds, importDayPnl, importsByDate } from './imports.js';
import { openDay, openImport } from './editors.js';

export function rOverview(){
  var view=ui.view,acts=activeAccts().filter(function(a){return inView(a.type,view)});
  var total=r2(acts.reduce(function(s,a){return s+a.balance},0)),rec=record(view);
  var nf=acts.filter(function(a){return a.type==='funded'}).length,ne=acts.length-nf;
  var h=seg('view',[['funded','Funded'],['evaluation','Evaluation'],['both','Both']],view);
  h+='<section class="card glass" id="ov-total"><h2>Total balance · active '+(view==='both'?'accounts':view==='funded'?'funded':'evaluation')+'</h2><div class="big" id="total-balance" data-count>'+fmt$(total)+'</div><div class="muted small">'+acts.length+' active'+(view==='both'?' · '+nf+' funded · '+ne+' evaluation':'')+'</div></section>';
  h+='<section class="card glass" id="ov-record"><h2>All-time record · never resets</h2><div class="grid4">'+
    '<div class="stat"><div class="l">Wins</div><div class="v pos" id="rec-w">'+rec.w+'</div></div>'+
    '<div class="stat"><div class="l">Losses</div><div class="v neg" id="rec-l">'+rec.l+'</div></div>'+
    '<div class="stat"><div class="l">BE</div><div class="v" id="rec-be">'+rec.be+'</div></div>'+
    '<div class="stat"><div class="l">Win rate</div><div class="v">'+(rec.wr==null?'—':Math.round(rec.wr*100)+'%')+'</div></div></div>'+
    '<div class="muted small" style="margin-top:8px">Record <b id="rec-str">'+rec.w+'–'+rec.l+'</b>'+(rec.be?' · '+rec.be+' BE (never counted)':'')+'</div></section>';
  h+=calendarHtml(view);
  if(!S.accounts.length&&!S.trades.length)h+='<div class="card glass empty">No data yet. Add accounts or import balances in <b>Accounts</b>, or load demo data in Settings.</div>';
  return h}
export function calendarHtml(view){
  var now=new Date(),ym=ui.cal||(now.getFullYear()+'-'+pad(now.getMonth()+1)),y=+ym.slice(0,4),m=+ym.slice(5,7)-1;
  var first=new Date(y,m,1),lead=first.getDay(),dim=new Date(y,m+1,0).getDate(),map=dayMap(view),tS=todayS();
  var mt=0,yt=0;Object.keys(map).forEach(function(d){if(+d.slice(0,4)===y){yt+=map[d].pnl;if(+d.slice(5,7)-1===m)mt+=map[d].pnl}});
  var cells=[];for(var i=lead;i>0;i--)cells.push({d:new Date(y,m,1-i),dim:true});for(var j=1;j<=dim;j++)cells.push({d:new Date(y,m,j)});
  var k=1;while(cells.length%7)cells.push({d:new Date(y,m+1,k++),dim:true});
  var h='<section class="card glass" id="calendar"><div class="cal-head"><button class="iconbtn" data-act="calNav" data-dir="-1" aria-label="Previous month">'+ICON.chevL+'</button><div class="mname" id="cal-month">'+first.toLocaleDateString('en-US',{month:'long',year:'numeric'})+'</div><button class="iconbtn" data-act="calNav" data-dir="1" aria-label="Next month">'+ICON.chevR+'</button></div>';
  h+='<div class="cal-tot"><div class="stat"><div class="l">Month P&amp;L</div><div class="v '+cls(mt)+'" id="month-total">'+fmt$(mt,true)+'</div></div><div class="stat"><div class="l">'+y+' P&amp;L</div><div class="v '+cls(yt)+'" id="year-total">'+fmt$(yt,true)+'</div></div></div>';
  h+='<div class="cal">'+['S','M','T','W','T','F','S'].map(function(x){return '<div class="dow">'+x+'</div>'}).join('');
  cells.forEach(function(c){var s=ds(c.d),e=map[s],st=e?(e.pnl>0?'win':e.pnl<0?'loss':'flat'):'';
    h+='<button class="cal-cell '+st+(c.dim?' dim':'')+(s===tS?' today':'')+'" data-act="openDay" data-date="'+s+'" data-pnl="'+(e?e.pnl:'')+'"><span class="dn">'+c.d.getDate()+'</span><span class="dp">'+(e?fmtK(e.pnl):'')+'</span></button>'});
  return h+'</div></section>'}
/* Accounts: top level = import pill + group cards + screenshot imports; tapping a group pushes a drill-in view */
export function acctGroups(){var live=liveAccts(),f=live.filter(function(a){return a.type==='funded'}),e=live.filter(function(a){return a.type!=='funded'});
  var c=function(l,st){return l.filter(function(a){return a.status===st}).length};
  return {funded:{active:c(f,'active'),blown:c(f,'blown'),passed:c(f,'passed')},evaluation:{active:c(e,'active'),blown:c(e,'blown'),passed:c(e,'passed')}}}
var CHEV='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
var PHOTO='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="3"/><circle cx="9" cy="10" r="1.7"/><path d="M5 17l4.5-4.5 3 3 2.5-2.5L19 17"/></svg>';
export function rAccounts(){
  if(ui.acctGroup==='funded'||ui.acctGroup==='evaluation')return rAcctGroup(ui.acctGroup);
  var g=acctGroups();
  var h='<div class="acct-top" id="acct-top"><button class="imp-pill glass" data-act="openImport" id="btn-open-import">Import screenshot</button><button class="round-add" data-act="addAccount" id="btn-add-acct" aria-label="Add account"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button></div>';
  var card=function(key,title,dot,sub){return '<button class="grp-card glass" data-act="openGroup" data-group="'+key+'" id="grp-'+key+'"><span class="grp-dot '+dot+'"></span><span class="grp-tx"><b>'+title+'</b><span class="mono small muted" data-k="sub">'+sub+'</span></span><span class="grp-open">Open'+CHEV+'</span></button>'};
  h+=card('funded','Funded accounts','dot-f',g.funded.active+' active · '+g.funded.blown+' blown');
  h+=card('evaluation','Evaluation accounts','dot-e',g.evaluation.active+' active · '+g.evaluation.blown+' blown · '+g.evaluation.passed+' passed');
  var list=importsByDate();
  h+='<section class="imp-sec" id="imp-sec"><h2 class="imp-h">Screenshot imports</h2><p class="small muted imp-cap">Arranged by trade date. Correcting a date moves its P&amp;L and journal entry to the same day.</p><button class="btn sm imp-recheck" data-act="recheckDates" id="btn-recheck">Recheck photo dates</button></section>';
  h+='<section class="imp-list glass" id="imp-list">'+(list.map(impEntry).join('')||'<div class="empty small">No screenshot imports yet. Tap Import screenshot to add balances.</div>')+'</section>';
  return h}
function impEntry(im){var n=importAcctIds(im).length,pnl=importDayPnl(im);
  return '<article class="imp-entry" data-imp="'+im.id+'" data-date="'+im.date+'">'+
    '<div class="imp-row1">'+(im.thumb||im.image?'<img class="imp-thumb" src="'+(im.thumb||im.image)+'" alt="Screenshot thumbnail"'+(im.image?' data-act="viewImg" data-id="'+im.id+'"':'')+'>':'<div class="imp-thumb ph" aria-label="No screenshot">'+PHOTO+'</div>')+
    '<div class="imp-meta"><button class="imp-date" data-act="editImpDate" data-id="'+im.id+'" aria-label="Change trade date">'+fmtDate(im.date,{month:'short',day:'numeric',year:'numeric'})+'</button>'+
    '<div class="mono small imp-file">'+esc(im.fileName||'Balance list')+'</div>'+
    '<div class="mono small imp-sum" data-k="sum">'+n+' account'+(n===1?'':'s')+' · Day P&amp;L <span data-k="pnl" data-v="'+pnl+'">'+fmt$(pnl)+'</span></div>'+
    '<div class="imp-src" data-k="src">'+esc(dateSourceLabel(im))+'</div></div></div>'+
    '<button class="btn wide imp-undo" data-act="undoImport" data-id="'+im.id+'">Undo import</button></article>'}
export function rAcctGroup(key){
  var fundedView=key==='funded',live=liveAccts().filter(function(a){return fundedView?a.type==='funded':a.type!=='funded'});
  var act=byLineup(live.filter(function(a){return a.status==='active'})),hist=byLineup(live.filter(function(a){return a.status!=='active'}));
  var h='<div class="drill-h" id="drill-h"><button class="back-btn" data-act="closeGroup" id="btn-back" aria-label="Back to Accounts"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>Accounts</button><h2 class="drill-t"><span class="grp-dot '+(fundedView?'dot-f':'dot-e')+'"></span>'+(fundedView?'Funded':'Evaluation')+' accounts</h2></div>';
  if(fundedView){var sb=S.settings.startBalance,ab=r2(act.reduce(function(s,a){return s+(a.balance-sb-firmBuf(a.firm))},0));
    h+='<section class="card glass" id="after-buffer"><h2>This month · after buffer (active funded)</h2><div class="big '+cls(ab)+'" id="after-buffer-v" data-count>'+fmt$(ab,true)+'</div><div class="muted small">Σ (balance − '+fmt$(sb)+' − firm buffer) over '+act.length+' funded account'+(act.length===1?'':'s')+'</div>'+
      (act.length?'<div class="ab-rows">'+act.map(function(a){var v=r2(a.balance-sb-firmBuf(a.firm));return '<div class="ab-row" data-ab="'+a.id+'"><span>F '+esc(a.name)+'</span><b class="'+cls(v)+'" data-v="'+v+'">'+fmt$(v,true)+'</b></div>'}).join('')+'</div>':'')+'</section>'}
  h+='<div class="sect '+(fundedView?'f':'e')+'" id="'+(fundedView?'sect-funded':'sect-eval')+'">'+(fundedView?'Funded':'Evaluation')+' · '+act.length+'</div>'+(act.map(acctCard).join('')||'<div class="card glass empty small">No active '+(fundedView?'funded':'evaluation')+' accounts</div>');
  h+='<details class="card glass" id="acct-history"><summary>History · '+(fundedView?'blown':'blown / passed')+' ('+hist.length+')</summary>'+(hist.map(function(a){return '<div class="trade-line" data-hist="'+esc(a.name)+'"><div class="row between"><b>'+esc(acctLabel(a))+'</b><span class="tag '+(a.status==='passed'?'paid':'denied')+'">'+a.status+'</span></div><div class="small muted">'+esc(a.firm)+' · '+a.type+' · last balance '+fmt$(a.balance)+' · peak '+fmt$(a.peak)+'</div></div>'}).join('')||'<div class="muted small" style="margin-top:8px">None</div>')+'</details>';
  return h}
export function acctCard(a){
  var stop=stopOf(a),cu=cushionOf(a),buf=firmBuf(a.firm),pct=buf?Math.max(0,Math.min(1,cu/buf)):0,locked=stop>=a.startBalance;
  var tr=allowedTransitions(a).map(function(t){return '<button class="btn sm '+(t.key==='blown'?'danger':t.key==='funded'?'green':'')+'" data-act="transition" data-id="'+a.id+'" data-key="'+t.key+'">'+t.label+'</button>'}).join('');
  /* stop status: locked once peak − buffer reaches the start balance; until then it trails the peak */
  var stopSt=locked?' · <b class="pos" data-k="lock">stop locked at start</b>':' · <b class="muted" data-k="lock">stop trailing</b> <span class="muted">(locks at '+fmt$(a.startBalance+buf)+')</span>';
  var cuCls=cu<=0?'neg':pct<.35?'warn-t':'pos';
  return '<div class="acct glass '+a.type+'" data-acct="'+a.id+'" data-name="'+esc(a.name)+'"><div class="acct-h"><div class="nm" data-k="name">'+(a.type==='funded'?'<span class="f">F</span> ':'')+esc(a.name)+'</div><div class="mid" data-k="balance">'+fmt$(a.balance)+'</div></div>'+
   '<div class="small muted acct-sub" data-k="sub">#'+(a.lineupIndex+1)+' · '+esc(a.firm)+' · buffer '+fmt$(buf)+stopSt+'</div>'+
   '<div class="kv"><div><div class="l">Start</div><div class="v" data-k="start">'+fmt$(a.startBalance)+'</div></div><div><div class="l">Peak</div><div class="v" data-k="peak">'+fmt$(a.peak)+'</div></div><div><div class="l">Stop</div><div class="v" data-k="stop">'+fmt$(stop)+'</div></div><div><div class="l">Cushion</div><div class="v '+cuCls+'" data-k="cushion">'+fmt$(cu)+'</div></div></div>'+
   '<div class="bar '+(pct<.2?'bad':pct<.45?'warn':'')+'" data-k="bar" role="progressbar" aria-label="Cushion vs '+fmt$(buf)+' buffer" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+Math.round(pct*100)+'"><i style="width:'+Math.round(pct*100)+'%"></i></div>'+
   '<details class="acct-more" data-k="more"><summary class="small">Balance history ('+a.history.length+') &amp; actions</summary><div class="hist" data-k="hist">'+a.history.slice().reverse().map(function(x){return '<div><span>'+x.date+' <span class="muted tiny">'+(x.src||'')+'</span></span><b>'+fmt$(x.balance)+'</b></div>'}).join('')+'</div>'+
   '<div class="row wrap" style="margin-top:10px">'+tr+'<button class="btn sm danger" data-act="removeAcct" data-id="'+a.id+'">Remove</button></div><div class="tiny muted" style="margin-top:6px">Balances change only through Import balances. Status changes are one-way.</div></details></div>'}
export var JOURNAL_RECENT=5;
/* Journal: Win / loss record + trade-grades calendar (scope: funded | evaluation | all) */
export var JSCOPE={funded:{cap:'Trading days for funded accounts',rec:'Funded win / loss record',gh:'Funded trade grades',gs:'Only funded entries are shown'},
  evaluation:{cap:'Trading days for evaluation accounts',rec:'Evaluation win / loss record',gh:'Evaluation trade grades',gs:'Only evaluation entries are shown'},
  all:{cap:'Trading days across all accounts',rec:'All-time win / loss record',gh:'All trade grades',gs:'Funded and evaluation entries are shown'}};
export function jScope(){return JSCOPE[ui.jscope]?ui.jscope:'funded'}
export function jMonth(){var now=new Date();return /^\d{4}-\d{2}$/.test(ui.jcal||'')?ui.jcal:now.getFullYear()+'-'+pad(now.getMonth()+1)}
function plu(n,w){return n+' '+w+(n===1?'':'s')}
export function rWinLoss(){var sc=jScope(),L=JSCOPE[sc],R=dayRecord(sc);
  var h='<div class="wl-head" id="wl-head"><div><h2 class="sec-h">Win / loss</h2><p class="sec-cap" id="wl-cap">'+L.cap+'</p></div><button class="round-add sm" data-act="openDay" data-date="'+todayS()+'" id="btn-log-round" aria-label="Log today">'+'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button></div>';
  h+=seg('jscope',[['funded','Funded'],['evaluation','Evaluation'],['all','All-time']],sc).replace('class="seg"','class="seg" id="wl-seg"');
  h+='<section class="card glass wl-card" id="wl-card"><div class="wl-split"><div class="wl-rec"><div class="wl-l" id="wl-rec-l">'+L.rec+'</div><div class="wl-big mono" id="wl-rec" style="--len:'+(R.w+'W — '+R.l+'L — '+R.be+'BE').length+'" aria-label="'+R.w+' wins, '+R.l+' losses, '+R.be+' break-even"><span class="pos">'+R.w+'W</span><span class="wl-sep"> — </span><span class="neg">'+R.l+'L</span><span class="wl-sep"> — </span><span class="amb">'+R.be+'BE</span></div></div>'+
    '<div class="wl-rate"><div class="wl-l">Win rate</div><div class="wl-big mono" id="wl-wr">'+(R.wr==null?'—':Math.round(R.wr*100)+'%')+'</div></div></div>'+
    '<div class="wl-foot tiny muted" id="wl-foot">'+plu(R.trading,'trading day')+' · '+plu(R.noTrading,'no-trading day')+' · break-even excluded from win rate</div></section>';
  h+='<div class="gr-head" id="gr-head"><h2 class="sec-h" id="gr-h">'+L.gh+'</h2><div class="gr-sub"><span class="sec-cap" id="gr-sub">'+L.gs+'</span><span class="sec-cap">Tap a day to view or edit</span></div></div>';
  return h+rGradeCal(R)}
export function rGradeCal(R){var ym=jMonth(),y=+ym.slice(0,4),m=+ym.slice(5,7)-1,first=new Date(y,m,1),lead=first.getDay(),dim=new Date(y,m+1,0).getDate(),tS=todayS();
  var h='<section class="card glass jcal" id="jcal" data-month="'+ym+'"><div class="jcal-head"><button class="jcal-nav" data-act="jcalNav" data-dir="-1" aria-label="Previous month">'+ICON.chevL+'</button><div class="jcal-m" id="jcal-month">'+first.toLocaleDateString('en-US',{month:'long',year:'numeric'})+'</div><button class="jcal-nav" data-act="jcalNav" data-dir="1" aria-label="Next month">'+ICON.chevR+'</button></div>';
  h+='<div class="jcal-grid" role="grid">'+['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(function(x){return '<div class="jcal-dow mono" role="columnheader">'+x+'</div>'}).join('');
  for(var i=0;i<lead;i++)h+='<div class="jcal-cell pad" aria-hidden="true"></div>';
  for(var j=1;j<=dim;j++){var s=y+'-'+pad(m+1)+'-'+pad(j),e=R.map[s],fut=s>tS,g=e?e.worst:'',all=e?e.grades.slice().sort(function(a,b){return GRADE_ORDER[a]-GRADE_ORDER[b]}):[];
    var lab=new Date(y,m,j).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})+(e?': '+plu(e.trades,'trade')+(all.length?', grade'+(all.length>1?'s ':' ')+all.join(', ')+(all.length>1?' (worst '+g+')':''):', no grade')+', '+(e.res==='W'?'win':e.res==='L'?'loss':'break-even')+' day':(fut?'':': no trades — tap to log'));
    h+='<button class="jcal-cell'+(e?' has'+(g?' g-'+g:''):'')+(s===tS?' today':'')+'" data-act="jcalDay" data-date="'+s+'" data-grade="'+g+'" data-grades="'+all.join('')+'" aria-label="'+esc(lab)+'"'+(fut&&!e?' disabled':'')+'><span class="jd mono">'+j+'</span>'+(e?'<span class="jg mono">'+(g||'·')+'</span>'+(new Set(all).size>1?'<span class="jg-all mono">'+all.join(' ')+'</span>':''):'')+'</button>'}
  var tail=(7-(lead+dim)%7)%7;for(var t=0;t<tail;t++)h+='<div class="jcal-cell pad" aria-hidden="true"></div>';
  return h+'</div></section>'}
export function rJournal(){
  refreshPending();
  var h='<button class="btn primary wide" data-act="openDay" data-date="'+todayS()+'" id="btn-log-today">+ Log / edit today</button>'+rWinLoss();
  var counts={};S.behaviors.forEach(function(b){counts[b]=0});S.trades.forEach(function(t){t.tags.forEach(function(g){if(g in counts)counts[g]++})});
  h+='<section class="card glass" id="patterns"><h2>Patterns in my notes · all-time</h2><div class="behs">'+S.behaviors.map(function(b){return '<div class="beh" data-beh="'+esc(b)+'"><div class="c mono" data-k="count">'+counts[b]+'</div><div class="t">'+esc(b)+'</div></div>'}).join('')+'</div>';
  var props=S.pendingBehaviors.filter(function(p){return p.count>=2&&S.dismissedBehaviors.indexOf(norm(p.label))<0});
  props.forEach(function(p){h+='<div class="propose" data-prop="'+esc(p.label)+'"><div class="prop-q">You\'ve tagged <b>“'+esc(p.label)+'”</b> on '+p.count+' notes. Make it a box?</div><div class="prop-btns"><button class="btn sm primary" data-act="createBeh" data-label="'+esc(p.label)+'">Create box</button><button class="btn sm" data-act="dismissBeh" data-label="'+esc(p.label)+'">Not now</button></div></div>'});
  var pend=S.pendingBehaviors.filter(function(p){return p.count<2&&S.dismissedBehaviors.indexOf(norm(p.label))<0});
  if(pend.length)h+='<div class="tiny muted pend-cap" id="pend-cap">Pending custom labels: '+pend.map(function(p){return esc(p.label)+' ('+p.count+')'}).join(', ')+' — a box is proposed after 2 notes.</div>';
  h+='</section>';
  var byDay={};S.trades.forEach(function(t){(byDay[t.date]=byDay[t.date]||[]).push(t)});
  var days=Object.keys(byDay).sort().reverse();
  if(!days.length)h+='<div class="card glass empty">No trades logged yet.</div>';
  days.slice(0,ui.journalMore?days.length:JOURNAL_RECENT).forEach(function(d){var ts=byDay[d],p=r2(ts.reduce(function(s,t){return s+tradePnl(t)},0));
    h+='<section class="day glass" data-day="'+d+'"><div class="day-h"><b class="day-d">'+fmtDate(d,{weekday:'short',month:'short',day:'numeric',year:'numeric'})+'</b><b class="day-p mono '+cls(p)+'" data-k="daypnl">'+fmt$(p,true)+'</b></div>'+
    ts.map(function(t){var tp=tradePnl(t);return '<div class="trade-line" data-trade="'+t.id+'"><div class="tl-h">'+(t.grade?'<span class="gb '+t.grade+'" aria-label="Grade '+t.grade+'">'+t.grade+'</span>':'')+'<span class="tl-a small muted">'+t.entries.map(function(e){var a=acctById(e.accountId);return esc(a?acctLabel(a):'removed')}).join(', ')+'</span><b class="tl-p mono '+cls(tp)+'" data-k="pnl">'+fmt$(tp,true)+'</b></div>'+
      (t.notes?'<div class="tl-n">'+esc(t.notes)+'</div>':'')+((t.be||t.tags.length||t.custom.length)?'<div class="tl-tags">'+(t.be?'<span class="be-badge" title="Break-even — never counted as a win or loss">BE</span>':'')+t.tags.map(function(g){return '<span class="tag">'+esc(g)+'</span>'}).join('')+t.custom.map(function(g){return '<span class="tag custom">'+esc(g)+'</span>'}).join('')+'</div>':'')+'</div>'}).join('')+
    '<button class="btn sm day-edit" data-act="openDay" data-date="'+d+'">Edit day</button></section>'});
  if(days.length>JOURNAL_RECENT&&!ui.journalMore)h+='<button class="btn wide show-all" id="btn-show-all" data-act="journalMore">Show all '+days.length+' days</button>';
  return h}
