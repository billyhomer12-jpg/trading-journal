// onboarding.js — first-run setup (generic for any user; nothing personal hardcoded)
import { APP_NAME } from './config.js';
import { $, $$, esc, fmt$, norm } from './util.js';
import { S, save, setState, normalize, fillFirm } from './state.js';
import { liveAccts } from './model.js';
import { openSheet, closeSheet, toast, info, themePicker } from './ui.js';
import { render } from './main.js';
import { demoData } from './demo.js';
import { afterWelcome } from './account.js';

function firmRow(f, checked){
  return '<div class="row ob-firm" style="margin-bottom:6px" data-orig="'+esc(f.name||'')+'"><input type="checkbox" data-role="use"'+(checked?' checked':'')+' aria-label="Use firm"><input data-role="fname" value="'+esc(f.name||'')+'" placeholder="Firm name" style="flex:2"><input data-role="fbuf" type="number" inputmode="decimal" min="0" value="'+(f.buffer!=null?f.buffer:'')+'" placeholder="Buffer $" style="flex:1"></div>'}
/* ---- page 1: welcome + theme (first run only) ---- */
var TAB_IC=['<path d="M3.5 11L12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/>','<path d="M6.5 3h7.5l4.5 4.5V21h-12z"/><path d="M14 3v4.5h4.5M9 12h6.5M9 15h6.5M9 18h4"/>','<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M8 7h8M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 14.5h.01M12 14.5h.01M15.5 14.5h.01M8.5 18h.01M12 18h.01M15.5 18h.01"/>'];
export function openWelcome(){
  var h='<div class="wl-hero"><div class="app-ic" aria-hidden="true"><span><svg viewBox="0 0 24 24"><path d="M5 16.5l5-5 3.5 3L19.5 8"/><circle cx="19.5" cy="8" r=".6"/></svg></span></div>'+
    '<h1 id="wl-title">Welcome to your <span>'+esc(APP_NAME)+'</span></h1><p class="muted">Private. Stored on this device.</p></div>';
  h+='<section class="wl-card glass" aria-labelledby="wl-theme-h"><h2 id="wl-theme-h" class="sr">Theme</h2>'+themePicker()+
    '<div class="tp-prev" role="img" aria-label="Preview: tab bar in your theme; gains stay green, losses red"><div class="tp-tab">'+TAB_IC.map(function(d,i){return '<i'+(i?'':' class="on"')+'><svg viewBox="0 0 24 24">'+d+'</svg></i>'}).join('')+'</div>'+
    '<div class="tp-pl"><b class="pos">+$1,250</b><b class="neg">−$400</b></div></div></section>';
  h+='<button class="btn primary wide wl-go" data-act="ob" data-ob="next" id="ob-next-btn">Start journal</button>';
  openSheet('Welcome to your '+APP_NAME,h,'welcome-sheet',true);
  $('#welcome-sheet').parentNode.classList.add('welcome-back');
}
/* page-2 edits survive a trip back to page 1 */
var draft=null;
function grab(){return {firms:$$('#ob-firms .ob-firm').map(function(r){return {orig:r.dataset.orig,use:$('[data-role=use]',r).checked,name:$('[data-role=fname]',r).value,buf:$('[data-role=fbuf]',r).value}}),v:vals()}}
/* ---- page 2: setup (also 'Run setup again' from Settings, without the back control) ---- */
export function openOnboarding(rerun){
  var st=S.settings,d=!rerun&&draft,dv=d?d.v:{start:st.startBalance,dpp:st.dollarsPerPoint,risk:st.riskPts,target:st.targetPts,be:st.beThreshold};
  var h=rerun?'<div class="ob-hero"><div class="ob-logo">📈</div><div><b>Update your setup</b><div class="small muted">Stored only on this device.</div></div></div>':'';
  var rows=d?d.firms.map(function(f){var r=firmRow({name:f.name,buffer:f.buf},f.use);return f.orig!==undefined?r.replace(/data-orig="[^"]*"/,'data-orig="'+esc(f.orig)+'"'):r}):st.firms.map(function(f){return firmRow(f,true)});
  h+='<div class="fld"><span class="h-info">Prop firms · buffer ($)'+info('About buffers','Trailing drawdown buffers are starting suggestions — check your firm\'s current rules. Untick firms you don\'t use. You can change all of this later in Settings.')+'</span><div id="ob-firms">'+rows.join('')+'</div><button class="btn sm" data-act="ob" data-ob="addFirm">+ Add firm</button></div>';
  h+='<div class="grid2"><label class="fld"><span>Starting balance</span><input id="ob-start" type="number" inputmode="decimal" value="'+dv.start+'"></label><label class="fld"><span>$ per point</span><input id="ob-dpp" type="number" inputmode="decimal" step="any" value="'+dv.dpp+'"></label><label class="fld"><span>Risk (pts)</span><input id="ob-risk" type="number" inputmode="decimal" value="'+dv.risk+'"></label><label class="fld"><span>Target (pts)</span><input id="ob-target" type="number" inputmode="decimal" value="'+dv.target+'"></label><label class="fld"><span>BE threshold ($)</span><input id="ob-be" type="number" inputmode="decimal" value="'+dv.be+'"></label></div>';
  h+='<div class="note ok small" id="ob-sum"></div>';
  h+='<button class="btn primary wide" data-act="ob" data-ob="start" id="ob-start-btn" style="margin-bottom:10px">'+(rerun?'Save setup':'Start my journal')+'</button>';
  h+='<button class="btn wide" data-act="ob" data-ob="demo" id="ob-demo-btn">'+(rerun?'Replace with demo data':'Try demo data')+'</button>';
  openSheet(rerun?'Setup':'Get started',h,'onboarding-sheet',!rerun,rerun?null:'obBack');
  $('#onboarding-sheet').addEventListener('input',updateSum);updateSum();
}
function vals(){return {start:+$('#ob-start').value,dpp:+$('#ob-dpp').value,risk:+$('#ob-risk').value,target:+$('#ob-target').value,be:+$('#ob-be').value}}
function updateSum(){var v=vals(),el=$('#ob-sum');if(!el)return;el.innerHTML='Per contract: risk <b>'+fmt$(v.risk*v.dpp)+'</b> · target <b>'+fmt$(v.target*v.dpp)+'</b>'+(v.risk>0?' · R:R 1:'+(Math.round(v.target/v.risk*100)/100):'')}
function apply(withDemo){
  var rows=$$('#ob-firms .ob-firm'),firms=[],renames={},err='';
  rows.forEach(function(r){var use=$('[data-role=use]',r).checked,name=$('[data-role=fname]',r).value.trim(),buf=$('[data-role=fbuf]',r).value;
    if(!use||!name)return;if(!(+buf>=0)||buf==='')err='Enter a buffer for '+name;
    if(firms.some(function(f){return norm(f.name)===norm(name)}))err='Duplicate firm: '+name;
    var o=r.dataset.orig,prev=S.settings.firms.find(function(f){return f.name===(o||name)})||{};firms.push(fillFirm({name:name,buffer:+buf,share:prev.share,short:o&&o!==name?'':prev.short,plan:prev.plan,rulesUrl:prev.rulesUrl}));if(o&&o!==name)renames[o]=name});
  if(!firms.length)err=err||'Pick or add at least one prop firm';
  var v=vals();if(!(v.start>0)||!(v.dpp>0)||!(v.risk>0)||!(v.target>0)||!(v.be>=0))err=err||'Check the numbers — they must be positive';
  if(!err&&!withDemo){var used=liveAccts().map(function(a){return renames[a.firm]||a.firm}).filter(function(n){return !firms.some(function(f){return f.name===n})});if(used.length)err='"'+used[0]+'" is used by an account — keep it ticked'}
  if(err){toast(err,true);return false}
  if(withDemo&&(S.accounts.length||S.trades.length)&&!confirm('Replace current data with DEMO data? Export first if you want a backup.'))return false;
  S.accounts.forEach(function(a){if(renames[a.firm])a.firm=renames[a.firm]});
  Object.assign(S.settings,{firms:firms,startBalance:v.start,dollarsPerPoint:v.dpp,riskPts:v.risk,targetPts:v.target,beThreshold:v.be});
  S.onboarded=true;draft=null;
  if(withDemo)setState(normalize(demoData()));
  save();closeSheet();render();toast(withDemo?'Demo data loaded':'You\'re all set');return true}
export function obAction(el){var k=el.dataset.ob;
  if(k==='addFirm'){$('#ob-firms').insertAdjacentHTML('beforeend',firmRow({name:'',buffer:''},true));var i=$$('#ob-firms [data-role=fname]');i[i.length-1].focus();return}
  if(k==='next')return afterWelcome();
  if(k==='back'){draft=grab();return openWelcome()}
  if(k==='start')return apply(false);
  if(k==='demo')return apply(true)}
