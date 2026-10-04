import { BUILD } from './config.js';
// main.js
import { $, $$, clone, ds, esc, fmt$, fmtDate, norm, pad, todayS } from './util.js';
import { S, defaults, normalize, riskUsd, save, saveUi, setState, targetUsd, ui } from './state.js';
import { acctById, allowedTransitions, createBehavior, reindexLineup, scopeRecord, stopOf, transition } from './model.js';
import { parseImport } from './importer.js';
import { appearanceName, applyTheme, closeSheet, openSheet, seg, toast } from './ui.js';
import { rAccounts, rJournal, rOverview, JOURNAL_RECENT, jMonth } from './views.js';
import { rCalc, scenInputs, scenOut, calcPaint, calcStep, calcReset, calcMath, cv, CALC_LIM } from './calc.js';
import { newsState, rNews, refreshNews, setNews } from './news.js';
import { firmEditRow, downscale, handleJson, imp, impApply, impFiles, impSkip, isImageFile, impPreview, openAddAccount, openDay, openImport, openSettings, saveAccount, saveDay, saveSettings, tradeCard, updateBE } from './editors.js';
import { demoData } from './demo.js';
import { DATE_SOURCES, exifDate, importDayPnl, moveImport, moveSummary, planMove, recheckCandidates, undoImport } from './imports.js';
import { openOnboarding, openWelcome, obAction } from './onboarding.js';
import { ACC_ACTS, ACC_CHANGE, ACC_ON, ACC_SUBMIT, bootAccount, syncTheme } from './account.js';
import { rPayouts, openPayout, savePayout, deletePayout, payAcctChanged, setNextEligible, payCalc, setPayMode } from './payouts.js';

/* Count-up for headline totals. The element's real text is always the final value (screen readers,
   copy/paste and tests read it); the animated figure is painted by ::after from data-cu while .cu hides the text. */
var lastTab=null,cuRuns=new WeakMap();
export function reduceMotion(){return !!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches)}
export function countUp(el,from){if(!el||reduceMotion())return;var txt=el.textContent,m=txt.match(/^([+−-]?)\$([\d,]+(?:\.\d+)?)$/);if(!m)return;
  var sign=m[1]==='+'?1:m[1]?-1:1,to=sign*parseFloat(m[2].replace(/,/g,'')),dec=(m[2].split('.')[1]||'').length,f0=from==null?0:from;if(f0===to)return;
  var t0=performance.now(),dur=Math.min(700,320+Math.log10(Math.abs(to-f0)+1)*70),plus=m[1]==='+';
  el.style.setProperty('--cu-c',getComputedStyle(el).color);el.classList.add('cu');cuRuns.set(el,t0);
  function fm(v){var a=Math.abs(v),s=a.toLocaleString('en-US',{minimumFractionDigits:dec,maximumFractionDigits:dec});return (v<0?'−':plus&&v>0?'+':'')+'$'+s}
  (function step(now){if(cuRuns.get(el)!==t0)return;var k=Math.min(1,(now-t0)/dur),e=1-Math.pow(1-k,3),v=f0+(to-f0)*e;el.setAttribute('data-cu',fm(dec?v:Math.round(v)));
    if(k<1)requestAnimationFrame(step);else{el.classList.remove('cu');el.removeAttribute('data-cu')}})(t0)}
export function moneyOf(t){var m=String(t||'').match(/^([+−-]?)\$([\d,]+(?:\.\d+)?)$/);return m?(m[1]==='−'||m[1]==='-'?-1:1)*parseFloat(m[2].replace(/,/g,'')):null}
export function tap(){try{if(navigator.vibrate&&!reduceMotion())navigator.vibrate(6)}catch(e){}}
export function render(){
  applyTheme();$('#demo-badge').hidden=!S.demo;
  $$('#tabbar button').forEach(function(b){var on=b.dataset.tab===ui.tab;b.classList.toggle('on',on);if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
  var v=$('#view');var f={overview:rOverview,accounts:rAccounts,journal:rJournal,calculator:rCalc,payouts:rPayouts,news:rNews}[ui.tab]||rOverview;
  var tabChanged=lastTab!==ui.tab;lastTab=ui.tab;
  v.innerHTML=f();v.setAttribute('data-tab',ui.tab);if(ui.tab==='calculator')calcPaint();
  if(tabChanged){v.classList.remove('enter');void v.offsetWidth;v.classList.add('enter');$$('#view [data-count]').forEach(function(el){countUp(el)})}
}
export var A={
 tab:function(el){var t=el.dataset.tab;ui.acctGroup=null;ui.journalMore=false;ui.tab=t;saveUi();render();window.scrollTo(0,0)}, /* tapping a tab (incl. the current one) returns to its top level */
 openGroup:function(el){ui.acctGroup=el.dataset.group;render();window.scrollTo(0,0);var b=$('#btn-back');if(b)b.focus({preventScroll:true})},
 closeGroup:function(){var g=ui.acctGroup;ui.acctGroup=null;render();window.scrollTo(0,0);var c=$('#grp-'+g);if(c)c.focus({preventScroll:true})},
 undoImport:function(el){var im=S.imports.find(function(x){return x.id===el.dataset.id});if(!im)return;var n=im.lines.filter(function(l){return l.accountId}).length;
   if(!confirm('Undo the import of '+fmtDate(im.date,{month:'short',day:'numeric',year:'numeric'})+'? This removes the '+n+' balance point'+(n===1?'':'s')+' it recorded (restoring any value it replaced), so balances and Day P&L go back to before it. Journal entries you logged are kept.'))return;
   var r=undoImport(im.id);save();render();toast('Import undone: '+(r.removed+r.restored)+' balance point'+(r.removed+r.restored===1?'':'s')+' reverted'+(r.deletedAccounts.length?', removed '+r.deletedAccounts.join(', '):''))},
 editImpDate:function(el){var im=S.imports.find(function(x){return x.id===el.dataset.id});if(!im)return;
   openSheet('Correct trade date','<div class="small muted" style="margin-bottom:10px">'+esc(im.fileName||'Balance list')+' · now '+fmtDate(im.date,{weekday:'short',month:'short',day:'numeric',year:'numeric'})+'</div><label class="fld"><span>Trade date</span><input type="date" id="imp-move-date" data-on="impMovePlan" data-id="'+im.id+'" value="'+im.date+'"></label><div class="small" id="imp-move-plan"></div><button class="btn primary wide" style="margin-top:12px" data-act="impMoveSave" data-id="'+im.id+'" id="imp-move-save">Move</button>','imp-date-sheet')},
 impMoveSave:function(el){var d=$('#imp-move-date').value,pl=planMove(el.dataset.id,d);if(!pl)return;if(pl.from===d)return closeSheet();
   if(pl.conflicts.length)return toast(fmtDate(d,{month:'short',day:'numeric'})+' already has a balance for '+pl.conflicts.join(', ')+' — undo that import first',true);
   moveImport(el.dataset.id,d);save();closeSheet();render();toast('Moved '+moveSummary(pl)+' to '+fmtDate(d,{month:'short',day:'numeric'}))},
 recheckDates:function(){var c=recheckCandidates();
   if(!c.length)return toast(S.imports.some(function(i){return i.photoDate})?'Photo dates already match (manual dates are left alone)':'No photo dates to recheck — only screenshots whose photo carries a date (EXIF) can be rechecked');
   if(!confirm('Move '+c.length+' import'+(c.length===1?'':'s')+' to the date stored in the photo?\n'+c.map(function(i){return (i.fileName||'import')+': '+i.date+' → '+i.photoDate}).join('\n')))return;
   var ok=0,skip=[];c.forEach(function(im){var pl=planMove(im.id,im.photoDate);if(pl.conflicts.length){skip.push(im.fileName||im.date);return}moveImport(im.id,im.photoDate);S.imports.find(function(x){return x.id===im.id}).dateSource='photo';ok++});
   save();render();toast(ok+' moved to photo date'+(skip.length?', '+skip.length+' skipped (date conflict)':''))},
 seg:function(el){var s=el.dataset.seg,v=el.dataset.val;if(s==='theme'){ui.theme=v;saveUi();applyTheme();syncTheme();$$('[data-seg=theme]').forEach(function(b){b.classList.toggle('on',b.dataset.val===v)});return}
   if(s==='scope')ui.scope=v==='all'?'both':v;else if(s==='calcmode')ui.calc.mode=v;saveUi();render()},
 calcStep:function(el){var p=$('#proj-net'),f=p&&moneyOf(p.textContent);tap();calcStep(el.dataset.k,+el.dataset.d);countUp($('#proj-net'),f)},
 calcReset:function(){calcReset();toast('Scenario cleared')},
 theme:function(){ui.theme=ui.theme==='auto'?'light':ui.theme==='light'?'dark':'auto';saveUi();applyTheme();syncTheme();toast('Appearance: '+appearanceName())},
 accent:function(el){setAccent(el.dataset.val)},
 obBack:function(){obAction({dataset:{ob:'back'}})},
 settings:function(){openSettings()},closeSheet:closeSheet,
 sheetBack:function(el,e){if(e.target===el&&!el.dataset.lock)closeSheet()},
 rerunSetup:function(){openOnboarding(true)},
 openPayout:function(el){openPayout(el.dataset.id||null)},
 payMode:function(el){setPayMode(el.dataset.val)},
 payFill:function(){var v=$('#pay-fillv').value;$$('#pay-form .pay-gross').forEach(function(i){i.value=v;payCalc(i)})},
 savePayout:function(el){savePayout(el.dataset.id||null)},
 delPayout:function(el){deletePayout(el.dataset.id)},
 ob:function(el){obAction(el)},
 calNav:function(el){var now=new Date(),ym=ui.cal||(now.getFullYear()+'-'+pad(now.getMonth()+1)),d=new Date(+ym.slice(0,4),+ym.slice(5,7)-1+(+el.dataset.dir),1);ui.cal=d.getFullYear()+'-'+pad(d.getMonth()+1);saveUi();render()},
 openDay:function(el){openDay(el.dataset.date)},
 addTrade:function(){$('#day-trades').insertAdjacentHTML('beforeend',tradeCard())},
 delTrade:function(el){var c=el.closest('.trade-card');if(confirm('Delete this trade?'))c.dataset.deleted='1'},
 fillAll:function(el){var c=el.closest('.trade-card'),v=$('[data-role=fillv]',c).value;$$('input[data-acct]',c).forEach(function(i){i.value=v});updateBE(c)},
 chip:function(el){el.classList.toggle('on')},
 saveDay:saveDay,
 jcalNav:function(el){var ym=jMonth(),d=new Date(+ym.slice(0,4),+ym.slice(5,7)-1+(+el.dataset.dir),1);ui.jcal=d.getFullYear()+'-'+pad(d.getMonth()+1);saveUi();render();var b=document.querySelector('[data-act=jcalNav][data-dir="'+el.dataset.dir+'"]');if(b)b.focus({preventScroll:true})},
 jcalDay:function(el){var d=el.dataset.date;if(!S.trades.some(function(t){return t.date===d})){openDay(d);return}
   var card=document.querySelector('.day[data-day="'+d+'"]');if(!card&&!ui.journalMore){ui.journalMore=true;saveUi();render();card=document.querySelector('.day[data-day="'+d+'"]')}
   if(!card){openDay(d);return}card.scrollIntoView({behavior:reduceMotion()?'auto':'smooth',block:'center'});card.classList.remove('flash');void card.offsetWidth;card.classList.add('flash');var eb=card.querySelector('.day-edit');if(eb)eb.focus({preventScroll:true})},
 journalMore:function(){ui.journalMore=true;saveUi();render();var d=document.querySelectorAll('#view .day')[JOURNAL_RECENT];if(d){var b=d.querySelector('button');if(b)b.focus({preventScroll:true})}},
 createBeh:function(el){if(createBehavior(el.dataset.label)){save();render();toast('Box created')}},
 dismissBeh:function(el){S.dismissedBehaviors.push(norm(el.dataset.label));save();render()},
 openImport:function(){openImport()},impPreview:function(){impPreview(false)},impApply:impApply,impSkip:function(){impSkip()},
 addAccount:openAddAccount,saveAccount:saveAccount,
 transition:function(el){var a=acctById(el.dataset.id),t=allowedTransitions(a).find(function(x){return x.key===el.dataset.key});if(!t)return;
   if(!confirm(t.label+' — '+a.name+'? This is one-way and cannot be undone.'))return;transition(a,t.key);save();render();toast(a.name+': '+t.key)},
 removeAcct:function(el){var a=acctById(el.dataset.id);if(!confirm('Remove '+a.name+' from the lineup? Its journal entries stay in history (read-only).'))return;a.removed=true;a.events.push({date:todayS(),what:'removed'});reindexLineup();save();render()},
 viewImg:function(el){var im=S.imports.find(function(i){return i.id===el.dataset.id});if(im)openSheet('Screenshot · '+im.date,'<img src="'+im.image+'" style="width:100%;border-radius:14px" alt="">')},
 refreshNews:function(){refreshNews()},
 pasteNews:function(){try{var n=setNews(JSON.parse($('#news-paste').value),'pasted Forex Factory JSON');newsState.err=null;render();toast('Calendar updated: '+n+' USD events')}catch(e){toast('Could not read: '+e.message,true)}},
 saveSettings:saveSettings,
 addFirm:function(){$('#firms').insertAdjacentHTML('beforeend',firmEditRow({name:'',buffer:'',share:100},-1));var r=$$('#firms [data-firm]');$('[data-role=fname]',r[r.length-1]).focus()},
 delFirm:function(el){var r=el.closest('[data-firm]'),f=S.settings.firms[+r.dataset.firm];if(f&&S.accounts.some(function(a){return a.firm===f.name&&!a.removed}))return toast('Firm is used by an account',true);r.remove()},
 exportJson:function(){var txt=JSON.stringify(S,null,2),name='trading-journal-'+todayS()+'.json';
   try{var b=new Blob([txt],{type:'application/json'}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(u);a.remove()},1500)}catch(e){}
   var o=$('#export-out');if(o){o.style.display='block';o.value=txt}
   if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(txt).then(function(){toast('Exported '+name+' & copied')},function(){toast('Exported '+name)});else toast('Exported '+name)},
 importPaste:function(){handleJson($('#json-paste').value)},
 loadDemo:function(){if((S.accounts.length||S.trades.length)&&!confirm('Replace current data with DEMO data? Export first if you want a backup.'))return;setState(normalize(demoData()));save();closeSheet();render();toast('Demo data loaded')},
 clearAll:function(){if(!confirm('Clear ALL data on this device? This cannot be undone.'))return;if(!confirm('Really delete everything? Export a backup first if unsure.'))return;var news=S.news;setState(defaults());S.news=news;save();closeSheet();render();toast('All data cleared');openWelcome()}
};
export var ON={
 payAcct:function(el){payAcctChanged(el)},
 payCalc:function(el){payCalc(el)},
 payRcv:function(el){el.dataset.touched='1'},
 nextElig:function(el){setNextEligible(el.dataset.id,el.value)},
 dayDate:function(el){if(el.value)openDay(el.value)},
 pnlInput:function(el){updateBE(el.closest('.trade-card'))},
 beToggle:function(el){var c=el.closest('.trade-card');c.dataset.betouched='1';$('[data-role=behint]',c).textContent=''},
 calcSet:function(el){var k=el.dataset.k,L=CALC_LIM[k];if(el.value==='')return;var v=Math.round(+el.value);if(!isFinite(v))return;var c=cv(),x=Math.max(L[0],Math.min(L[1],v));c[k]=x;if(x!==v)el.value=x;saveUi();calcPaint()},
 calcSeq:function(el){ui.calc.seq=el.value;saveUi();$('#scen-out').innerHTML=scenOut()},
 calcDays:function(el){ui.calc.days=el.value;saveUi();$('#scen-in').innerHTML=scenInputs();$('#scen-out').innerHTML=scenOut();$('#calc-days').focus()},
 calcPD:function(el){var c=ui.calc,i=+el.dataset.i;c.perDay=c.perDay||[];c.perDay[i]=c.perDay[i]||{w:0,l:0,b:0};c.perDay[i][el.dataset.k]=+el.value||0;saveUi();$('#scen-out').innerHTML=scenOut()},
 calcDD:function(el){ui.calc.dd=el.value;saveUi();$('#scen-out').innerHTML=scenOut();var n=$('#calc-dd');n.focus();var L=n.value.length;try{n.setSelectionRange(L,L)}catch(e){}},
 impImg:function(el){var fs=Array.prototype.slice.call(el.files||[]);el.value='';if(fs.length)impFiles(fs)},
 impDate:function(){imp.dateManual=true;var s=$('#imp-date-src');if(s)s.textContent=DATE_SOURCES.manual},
 impMovePlan:function(el){var pl=planMove(el.dataset.id,el.value),o=$('#imp-move-plan');if(!pl||!o)return;o.innerHTML=pl.from===el.value?'Same date — nothing to move.':pl.conflicts.length?'<span class="neg">'+esc(fmtDate(el.value,{month:'short',day:'numeric'}))+' already has a balance for '+esc(pl.conflicts.join(', '))+'.</span>':'Moves '+moveSummary(pl)+' to '+esc(fmtDate(el.value,{weekday:'short',month:'short',day:'numeric'}))+'.'},
 impDec:function(){impPreview(true)},
 jsonFile:function(el){var f=el.files&&el.files[0];if(!f)return;var r=new FileReader();r.onload=function(){handleJson(String(r.result))};r.readAsText(f)}
};
export var CHANGE_ONLY={payAcct:1,nextElig:1,dayDate:1,impDec:1,impImg:1,jsonFile:1,beToggle:1};
document.addEventListener('click',function(e){var el=e.target.closest('[data-act]');if(!el)return;var f=A[el.dataset.act];if(f){if(el.tagName==='BUTTON')e.preventDefault();f(el,e)}});
document.addEventListener('input',function(e){var el=e.target,k=el.dataset&&el.dataset.on;if(k&&ON[k]&&!CHANGE_ONLY[k])ON[k](el,e)});
document.addEventListener('change',function(e){var el=e.target,k=el.dataset&&el.dataset.on;if(k&&ON[k]&&CHANGE_ONLY[k])ON[k](el,e)});
/* read-only hooks for tests; mutations go through the same guarded functions */
ui.acctGroup=null;ui.journalMore=false;
document.addEventListener('toggle',function(e){if(e.target&&e.target.id==='calc-adv'&&!!cv().adv!==e.target.open){cv().adv=e.target.open;saveUi()}},true);
window.TJ={calc:function(){return calcMath()},record:function(sc){var r=scopeRecord(sc);return {w:r.w,l:r.l,be:r.be,wr:r.wr,trading:r.trading,noTrading:r.noTrading}},scope:function(){return ui.scope},state:function(){return clone(S)},undoImport:function(id){var r=undoImport(id);save();render();return r},moveImport:function(id,d){var r=moveImport(id,d);save();render();return r&&{moved:!!r.moved,conflicts:r.conflicts,points:r.points,trades:r.trades.length}},dayPnl:function(id){var im=S.imports.find(function(x){return x.id===id});return im?importDayPnl(im):null},exifDate:function(bytes){return exifDate(new Uint8Array(bytes).buffer)},parseImport:parseImport,stopOf:function(id){return stopOf(acctById(id))},allowedTransitions:function(id){return allowedTransitions(acctById(id)).map(function(t){return t.key})},transition:function(id,k){var r=transition(acctById(id),k);save();render();return r}};
render();
/* accounts: actions, inputs and forms from account.js; routing (welcome → sign in → setup, or straight to the app) */
Object.assign(A,ACC_ACTS);Object.assign(ON,ACC_ON);Object.assign(CHANGE_ONLY,ACC_CHANGE);
document.addEventListener('submit',function(e){var f=ACC_SUBMIT[e.target.id];if(f){e.preventDefault();f(e.target)}});
bootAccount();
/* ---- drag-and-drop + paste for screenshot imports ----
   Import sheet open: the whole sheet accepts files (drop zone highlights). Accounts / Journal with no sheet open:
   drop anywhere → a full-page target appears → the import sheet opens with the files queued. Elsewhere file drops are
   swallowed (so the browser never navigates away to the image). Paste (⌘/Ctrl+V) of images works the same way. */
var dragDepth=0;
function dropTarget(){if($('#import-sheet'))return 'sheet';if(!$('.sheet-back')&&S.onboarded&&(ui.tab==='accounts'||ui.tab==='journal'))return 'tab';return null}
function hasFiles(e){var t=e.dataTransfer&&e.dataTransfer.types;return !!t&&Array.prototype.indexOf.call(t,'Files')>=0}
function dropUi(on){var t=on&&dropTarget(),ov=$('#drop-ov'),z=$('#imp-drop');
  if(t==='tab'&&!ov){ov=document.createElement('div');ov.id='drop-ov';ov.innerHTML='<div class="drop-card glass"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5V4.5M7.5 9 12 4.5 16.5 9"/><path d="M4.5 14.5v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3"/></svg><b>Drop screenshots to import</b></div>';ov.setAttribute('role','status');document.body.appendChild(ov)}
  if(ov)ov.hidden=t!=='tab';if(z)z.classList.toggle('over',t==='sheet')}
document.addEventListener('dragenter',function(e){if(!hasFiles(e))return;e.preventDefault();dragDepth++;dropUi(true)});
document.addEventListener('dragover',function(e){if(!hasFiles(e))return;e.preventDefault();e.dataTransfer.dropEffect=dropTarget()?'copy':'none'});
document.addEventListener('dragleave',function(e){if(!hasFiles(e))return;dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)dropUi(false)});
document.addEventListener('drop',function(e){if(!hasFiles(e))return;e.preventDefault();dragDepth=0;var t=dropTarget();dropUi(false);if(!t)return;
  var fs=Array.prototype.slice.call(e.dataTransfer.files||[]);if(fs.length)impFiles(fs)});
document.addEventListener('paste',function(e){var cd=e.clipboardData;if(!cd||!dropTarget())return;var fs=Array.prototype.slice.call(cd.files||[]).filter(isImageFile);
  if(!fs.length&&cd.items)Array.prototype.forEach.call(cd.items,function(it){if(it.kind==='file'){var f=it.getAsFile();if(isImageFile(f))fs.push(f)}});
  if(!fs.length)return;/* plain text paste stays untouched */e.preventDefault();impFiles(fs.map(function(f,i){return f.name&&f.name!=='image.png'?f:new File([f],'Pasted '+todayS()+(fs.length>1?' '+(i+1):'')+'.png',{type:f.type||'image/png',lastModified:Date.now()})}))});
/* accent theme: one shared setting (welcome page + Settings), applied live to every token */
function setAccent(v){ui.accent=v;saveUi();applyTheme();syncTheme();$$('[data-act=accent]').forEach(function(b){var on=b.dataset.val===v;b.classList.toggle('on',on);b.setAttribute('aria-checked',on);b.tabIndex=on?0:-1})}
/* radio-group keys for the swatches: arrows move + select (roving tabindex) */
document.addEventListener('keydown',function(e){var b=e.target.closest&&e.target.closest('[data-act=accent]');if(!b)return;var d={ArrowRight:1,ArrowDown:1,ArrowLeft:-1,ArrowUp:-1}[e.key];if(!d)return;e.preventDefault();
  var all=$$('[data-act=accent]',b.parentNode),n=all[(all.indexOf(b)+d+all.length)%all.length];setAccent(n.dataset.val);n.focus()});
/* keyboard: Esc closes an (unlocked) sheet */
/* (i) popovers: one open at a time, close on outside tap / Esc, nudge the bubble back on-screen */
function closeInfos(except){document.querySelectorAll('details.info[open]').forEach(function(d){if(d!==except)d.open=false})}
document.addEventListener('click',function(e){var d=e.target.closest&&e.target.closest('details.info');closeInfos(d)},true);
document.addEventListener('toggle',function(e){var d=e.target;if(!d.classList||!d.classList.contains('info')||!d.open)return;closeInfos(d);
  var p=d.querySelector('.info-pop');p.style.left='';p.style.right='';var r=p.getBoundingClientRect(),W=document.documentElement.clientWidth,dx=0;
  if(r.right>W-12)dx=W-12-r.right;if(r.left+dx<12)dx=12-r.left;
  if(dx){var base=r.left-d.getBoundingClientRect().left;p.style.right='auto';p.style.left=Math.round(base+dx)+'px'}},true);
document.addEventListener('keydown',function(e){if(e.key==='Escape'){var oi=document.querySelector('details.info[open]');if(oi){oi.open=false;var sm=oi.querySelector('summary');if(sm)sm.focus();e.stopImmediatePropagation();return}}},true);
document.addEventListener('keydown',function(e){if(e.key==='Escape'){var b=document.querySelector('.sheet-back');if(b){if(!b.dataset.lock)closeSheet()}else if(ui.acctGroup&&ui.tab==='accounts')A.closeGroup()}});
/* PWA offline support (web only; Capacitor apps already bundle their files) */
if(BUILD==='modular'&&'serviceWorker' in navigator&&/^https?:$/.test(location.protocol)&&!window.Capacitor){window.addEventListener('load',function(){navigator.serviceWorker.register('sw.js').catch(function(e){console.warn('Service worker not registered',e)})})}
