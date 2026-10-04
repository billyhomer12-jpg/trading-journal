// onboarding.js — first-run setup (generic for any user; nothing personal hardcoded)
import { APP_NAME } from './config.js';
import { $, $$, esc, fmt$, norm } from './util.js';
import { S, save, setState, normalize, fillFirm } from './state.js';
import { liveAccts } from './model.js';
import { openSheet, closeSheet, toast, info } from './ui.js';
import { render } from './main.js';
import { demoData } from './demo.js';

function firmRow(f, checked){
  return '<div class="row ob-firm" style="margin-bottom:6px" data-orig="'+esc(f.name||'')+'"><input type="checkbox" data-role="use"'+(checked?' checked':'')+' aria-label="Use firm"><input data-role="fname" value="'+esc(f.name||'')+'" placeholder="Firm name" style="flex:2"><input data-role="fbuf" type="number" inputmode="decimal" min="0" value="'+(f.buffer!=null?f.buffer:'')+'" placeholder="Buffer $" style="flex:1"></div>'}
export function openOnboarding(rerun){
  var st=S.settings;
  var h='<div class="ob-hero"><div class="ob-logo">📈</div><div><b>'+(rerun?'Update your setup':'Welcome to '+esc(APP_NAME))+'</b><div class="small muted">Stored only on this device.</div></div></div>';
  h+='<div class="fld"><span class="h-info">Prop firms · buffer ($)'+info('About buffers','Trailing drawdown buffers are starting suggestions — check your firm\'s current rules. Untick firms you don\'t use. You can change all of this later in Settings.')+'</span><div id="ob-firms">'+st.firms.map(function(f){return firmRow(f,true)}).join('')+'</div><button class="btn sm" data-act="ob" data-ob="addFirm">+ Add firm</button></div>';
  h+='<div class="grid2"><label class="fld"><span>Starting balance</span><input id="ob-start" type="number" inputmode="decimal" value="'+st.startBalance+'"></label><label class="fld"><span>$ per point</span><input id="ob-dpp" type="number" inputmode="decimal" step="any" value="'+st.dollarsPerPoint+'"></label><label class="fld"><span>Risk (pts)</span><input id="ob-risk" type="number" inputmode="decimal" value="'+st.riskPts+'"></label><label class="fld"><span>Target (pts)</span><input id="ob-target" type="number" inputmode="decimal" value="'+st.targetPts+'"></label><label class="fld"><span>BE threshold ($)</span><input id="ob-be" type="number" inputmode="decimal" value="'+st.beThreshold+'"></label></div>';
  h+='<div class="note ok small" id="ob-sum"></div>';
  h+='<button class="btn primary wide" data-act="ob" data-ob="start" id="ob-start-btn" style="margin-bottom:10px">'+(rerun?'Save setup':'Start my journal')+'</button>';
  h+='<button class="btn wide" data-act="ob" data-ob="demo" id="ob-demo-btn">'+(rerun?'Replace with demo data':'Try demo data')+'</button>';
  openSheet(rerun?'Setup':'Get started',h,'onboarding-sheet',!rerun);
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
  S.onboarded=true;
  if(withDemo)setState(normalize(demoData()));
  save();closeSheet();render();toast(withDemo?'Demo data loaded':'You\'re all set');return true}
export function obAction(el){var k=el.dataset.ob;
  if(k==='addFirm'){$('#ob-firms').insertAdjacentHTML('beforeend',firmRow({name:'',buffer:''},true));var i=$$('#ob-firms [data-role=fname]');i[i.length-1].focus();return}
  if(k==='start')return apply(false);
  if(k==='demo')return apply(true)}
