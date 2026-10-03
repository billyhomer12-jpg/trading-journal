// news.js
import { FF_URL, NEWS_URL } from './config.js';
import { addDays, ds, esc, pd, todayS } from './util.js';
import { S, save, ui } from './state.js';
import { render } from './main.js';

export var newsState={loading:false,err:null,tried:false};
export function weekBounds(){var t=new Date(),s=new Date(t.getFullYear(),t.getMonth(),t.getDate()-t.getDay());return {start:s,end:addDays(s,7)}}
export function visibleNews(){var wb=weekBounds(),today0=pd(todayS());
  return (S.news.events||[]).filter(function(e){var d=new Date(e.date);if(isNaN(d))return false;return e.country==='USD'&&(e.impact==='High'||e.impact==='Medium')&&d>=wb.start&&d<wb.end&&new Date(d.getFullYear(),d.getMonth(),d.getDate())>=today0}).sort(function(a,b){return new Date(a.date)-new Date(b.date)})}
export function rNews(){
  if(!newsState.tried)setTimeout(refreshNews,0);
  var wb=weekBounds(),ev=visibleNews(),n=S.news,tz=(Intl.DateTimeFormat().resolvedOptions().timeZone||'local');
  var h='<section class="card glass" id="news"><div class="row between"><h2 style="margin:0">Forex Factory · USD this week</h2><button class="btn sm" data-act="refreshNews" id="btn-news-refresh">'+(newsState.loading?'…':'Refresh')+'</button></div>'+
   '<div class="small muted" style="margin:6px 0 10px">'+wb.start.toLocaleDateString(undefined,{month:'short',day:'numeric'})+' – '+addDays(wb.end,-1).toLocaleDateString(undefined,{month:'short',day:'numeric'})+' · times in '+esc(tz)+' · <span class="dot High" style="width:9px;height:9px"></span> High &nbsp;<span class="dot Medium" style="width:9px;height:9px"></span> Medium · <a href="'+FF_URL+'" target="_blank" rel="noopener">forexfactory.com/calendar ↗</a></div>';
  if(newsState.err)h+='<div class="note" id="news-note">Couldn\'t refresh — '+esc(newsState.err)+'. '+(n.fetchedAt?'Showing cached copy from '+new Date(n.fetchedAt).toLocaleString(undefined,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+(n.source?' ('+esc(n.source)+')':'')+'.':'No cached copy yet — paste the Forex Factory JSON below.')+'</div>';
  else if(n.fetchedAt&&!newsState.loading)h+='<div class="note ok small" id="news-ok">Updated '+new Date(n.fetchedAt).toLocaleString(undefined,{weekday:'short',hour:'numeric',minute:'2-digit'})+(n.source?' · '+esc(n.source):'')+'</div>';
  if(!ev.length)h+='<div class="empty">'+(n.events.length?'No remaining USD high/medium events this week.':'No calendar data yet.')+'</div>';
  var cur='';ev.forEach(function(e){var d=new Date(e.date),k=ds(d);if(k!==cur){if(cur)h+='</div>';cur=k;h+='<div class="news-day">'+(k===todayS()?'Today · ':'')+d.toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'})+'</div><div>'}
    h+='<div class="ev" data-impact="'+e.impact+'"><span class="dot '+e.impact+'" title="'+e.impact+' impact"></span><span class="tm">'+d.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})+'</span><div><div style="font-weight:650">'+esc(e.title)+'</div>'+((e.forecast||e.previous)?'<div class="tiny muted">'+(e.forecast?'Fcst '+esc(e.forecast):'')+(e.forecast&&e.previous?' · ':'')+(e.previous?'Prev '+esc(e.previous):'')+'</div>':'')+'</div></div>'});
  if(cur)h+='</div>';
  h+='<div class="tiny muted" style="margin-top:10px">Source: Forex Factory weekly calendar export (nfs.faireconomy.media). Days that have ended are hidden.</div></section>';
  h+='<details class="card glass"><summary>Paste Forex Factory JSON (manual update)</summary><div class="small muted" style="margin:8px 0">The Forex Factory feed does not send a CORS header, so browsers usually block the live refresh from this page. Open <a href="'+NEWS_URL+'" target="_blank" rel="noopener" style="word-break:break-all">'+NEWS_URL+'</a>, copy all, and paste it here (or import a file your assistant sends) to update the cache.</div><textarea id="news-paste" placeholder="[{&quot;title&quot;:…,&quot;country&quot;:&quot;USD&quot;,…}]"></textarea><button class="btn wide" data-act="pasteNews" style="margin-top:8px">Use pasted calendar</button></details>';
  return h}
export function setNews(arr,source){if(!Array.isArray(arr))throw new Error('Expected a JSON array of events');
  var ev=arr.filter(function(e){return e&&e.country==='USD'&&(e.impact==='High'||e.impact==='Medium')&&e.date}).map(function(e){return {title:String(e.title||''),country:'USD',date:e.date,impact:e.impact,forecast:e.forecast||'',previous:e.previous||''}});
  S.news={fetchedAt:new Date().toISOString(),source:source,events:ev};save();return ev.length}
export function refreshNews(){if(newsState.loading)return;newsState.loading=true;newsState.tried=true;if(ui.tab==='news')render();
  var ctl=window.AbortController?new AbortController():null,tm=setTimeout(function(){if(ctl)ctl.abort()},8000);
  fetch(NEWS_URL,{cache:'no-store',signal:ctl?ctl.signal:undefined}).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}).then(function(d){setNews(d,'Forex Factory live');newsState.err=null})
  .catch(function(e){newsState.err=(e&&e.name==='AbortError')?'request timed out':(navigator.onLine===false?'you appear to be offline':'Forex Factory blocks browser requests from other sites (no CORS header) or is unreachable')})
  .then(function(){clearTimeout(tm);newsState.loading=false;if(ui.tab==='news')render()})}
