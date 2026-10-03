import { BUILD } from './config.js';
// main.js
import { $, $$, clone, fmt$, norm, pad, todayS } from './util.js';
import { S, defaults, normalize, riskUsd, save, saveUi, setState, targetUsd, ui } from './state.js';
import { acctById, allowedTransitions, createBehavior, reindexLineup, stopOf, transition } from './model.js';
import { parseImport } from './importer.js';
import { applyTheme, closeSheet, openSheet, seg, toast } from './ui.js';
import { rAccounts, rJournal, rOverview } from './views.js';
import { rCalc, scenInputs, scenOut } from './calc.js';
import { newsState, rNews, refreshNews, setNews } from './news.js';
import { firmEditRow, downscale, handleJson, imp, impApply, impPreview, openAddAccount, openDay, openImport, openSettings, saveAccount, saveDay, saveSettings, tradeCard, updateBE } from './editors.js';
import { demoData } from './demo.js';
import { openOnboarding, obAction } from './onboarding.js';
import { rPayouts, openPayout, savePayout, deletePayout, payAcctChanged, setNextEligible, payCalc, setPayMode } from './payouts.js';

export function render(){
  applyTheme();$('#demo-badge').hidden=!S.demo;
  $$('#tabbar button').forEach(function(b){var on=b.dataset.tab===ui.tab;b.classList.toggle('on',on);if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
  var v=$('#view');var f={overview:rOverview,accounts:rAccounts,journal:rJournal,calculator:rCalc,payouts:rPayouts,news:rNews}[ui.tab]||rOverview;
  v.innerHTML=f();v.setAttribute('data-tab',ui.tab);
}
export var A={
 tab:function(el){ui.tab=el.dataset.tab;saveUi();render();window.scrollTo(0,0)},
 seg:function(el){var s=el.dataset.seg,v=el.dataset.val;if(s==='theme'){ui.theme=v;saveUi();applyTheme();$$('[data-seg=theme]').forEach(function(b){b.classList.toggle('on',b.dataset.val===v)});return}
   if(s==='view')ui.view=v;else if(s==='calcmode')ui.calc.mode=v;saveUi();render()},
 theme:function(){ui.theme=ui.theme==='auto'?'light':ui.theme==='light'?'dark':'auto';saveUi();applyTheme();toast('Theme: '+ui.theme)},
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
 journalMore:function(){ui.journalMore=true;render()},
 createBeh:function(el){if(createBehavior(el.dataset.label)){save();render();toast('Box created')}},
 dismissBeh:function(el){S.dismissedBehaviors.push(norm(el.dataset.label));save();render()},
 openImport:function(){openImport()},impPreview:function(){impPreview(false)},impApply:impApply,
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
 clearAll:function(){if(!confirm('Clear ALL data on this device? This cannot be undone.'))return;if(!confirm('Really delete everything? Export a backup first if unsure.'))return;var news=S.news;setState(defaults());S.news=news;save();closeSheet();render();toast('All data cleared');openOnboarding(false)}
};
export var ON={
 payAcct:function(el){payAcctChanged(el)},
 payCalc:function(el){payCalc(el)},
 payRcv:function(el){el.dataset.touched='1'},
 nextElig:function(el){setNextEligible(el.dataset.id,el.value)},
 dayDate:function(el){if(el.value)openDay(el.value)},
 pnlInput:function(el){updateBE(el.closest('.trade-card'))},
 beToggle:function(el){var c=el.closest('.trade-card');c.dataset.betouched='1';$('[data-role=behint]',c).textContent=''},
 calcN:function(el){ui.calc.n=el.value;saveUi();var n=Math.max(0,+el.value||0);$('#calc-win').textContent=fmt$(n*targetUsd(),true);$('#calc-loss').textContent=fmt$(-n*riskUsd());$('#scen-out').innerHTML=scenOut()},
 calcSeq:function(el){ui.calc.seq=el.value;saveUi();$('#scen-out').innerHTML=scenOut()},
 calcDays:function(el){ui.calc.days=el.value;saveUi();$('#scen-in').innerHTML=scenInputs();$('#scen-out').innerHTML=scenOut();$('#calc-days').focus()},
 calcPD:function(el){var c=ui.calc,i=+el.dataset.i;c.perDay=c.perDay||[];c.perDay[i]=c.perDay[i]||{w:0,l:0,b:0};c.perDay[i][el.dataset.k]=+el.value||0;saveUi();$('#scen-out').innerHTML=scenOut()},
 calcDD:function(el){ui.calc.dd=el.value;saveUi();$('#scen-out').innerHTML=scenOut();var n=$('#calc-dd');n.focus();var L=n.value.length;try{n.setSelectionRange(L,L)}catch(e){}},
 impImg:function(el){var f=el.files&&el.files[0];if(!f)return;downscale(f,640,.6).then(function(u){imp.image=u;$('#imp-img-prev').innerHTML='<img style="width:100%;max-height:220px;object-fit:contain;border-radius:12px" src="'+u+'" alt=""><div class="tiny muted">Stored with this import ('+Math.round(u.length*.75/1024)+' KB)</div>'}).catch(function(){toast('Could not read image',true)})},
 impDec:function(){impPreview(true)},
 jsonFile:function(el){var f=el.files&&el.files[0];if(!f)return;var r=new FileReader();r.onload=function(){handleJson(String(r.result))};r.readAsText(f)}
};
export var CHANGE_ONLY={payAcct:1,nextElig:1,dayDate:1,impDec:1,impImg:1,jsonFile:1,beToggle:1};
document.addEventListener('click',function(e){var el=e.target.closest('[data-act]');if(!el)return;var f=A[el.dataset.act];if(f){if(el.tagName==='BUTTON')e.preventDefault();f(el,e)}});
document.addEventListener('input',function(e){var el=e.target,k=el.dataset&&el.dataset.on;if(k&&ON[k]&&!CHANGE_ONLY[k])ON[k](el,e)});
document.addEventListener('change',function(e){var el=e.target,k=el.dataset&&el.dataset.on;if(k&&ON[k]&&CHANGE_ONLY[k])ON[k](el,e)});
/* read-only hooks for tests; mutations go through the same guarded functions */
window.TJ={state:function(){return clone(S)},parseImport:parseImport,stopOf:function(id){return stopOf(acctById(id))},allowedTransitions:function(id){return allowedTransitions(acctById(id)).map(function(t){return t.key})},transition:function(id,k){var r=transition(acctById(id),k);save();render();return r}};
render();
if(!S.onboarded)openOnboarding(false);
/* keyboard: Esc closes an (unlocked) sheet */
document.addEventListener('keydown',function(e){if(e.key==='Escape'){var b=document.querySelector('.sheet-back');if(b&&!b.dataset.lock)closeSheet()}});
/* PWA offline support (web only; Capacitor apps already bundle their files) */
if(BUILD==='modular'&&'serviceWorker' in navigator&&/^https?:$/.test(location.protocol)&&!window.Capacitor){window.addEventListener('load',function(){navigator.serviceWorker.register('sw.js').catch(function(e){console.warn('Service worker not registered',e)})})}
