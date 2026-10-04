// editors.js
import { RULES } from './config.js';
import { $, $$, clone, cls, esc, fmt$, fmtDate, norm, r2, todayS, uid } from './util.js';
import { S, fillFirm, normalize, riskUsd, save, saveUi, setState, targetUsd, ui } from './state.js';
import { acctById, acctLabel, createAccount, liveAccts, orderedActive, refreshPending, statusLabel, suggestBE } from './model.js';
import { parseImport, runImport } from './importer.js';
import { DATE_SOURCES } from './imports.js';
import { closeSheet, icoTxt, info, openSheet, seg, toast } from './ui.js';
import { newsState, setNews } from './news.js';
import { render } from './main.js';

export function tradeCard(t){
  t=t||{id:'',entries:[],grade:'',notes:'',be:false,beManual:false,tags:[],custom:[]};
  var act=orderedActive(),actIds={};act.forEach(function(a){actIds[a.id]=1});var em={};t.entries.forEach(function(e){em[e.accountId]=e});
  var boxes=act.map(function(a){var e=em[a.id];return '<label class="acct-box '+a.type+'"><span class="an">'+esc(acctLabel(a))+'</span><input type="number" inputmode="decimal" step="any" data-acct="'+a.id+'" value="'+(e?e.pnl:'')+'" placeholder="P&amp;L $" data-on="pnlInput"></label>'}).join('');
  var ro=t.entries.filter(function(e){return !actIds[e.accountId]}).map(function(e){var a=acctById(e.accountId);return '<div class="ro-entry" data-ro="'+e.accountId+'"><span>'+(a?esc(acctLabel(a))+' · '+statusLabel(a):'Removed account')+' <span class="tiny">(read-only)</span></span><b class="'+cls(e.pnl)+'">'+fmt$(e.pnl,true)+'</b></div>'}).join('');
  var gid='g'+Math.random().toString(36).slice(2,8);
  return '<div class="trade-card" data-id="'+t.id+'" data-betouched="'+(t.beManual?1:0)+'">'+
   (act.length?'<div class="row" style="margin-bottom:8px"><input type="number" inputmode="decimal" step="any" placeholder="P&amp;L for all" aria-label="Same P&amp;L for every account" data-role="fillv" style="flex:1"><button class="btn sm" data-act="fillAll">Fill all</button></div><div class="acct-boxes">'+boxes+'</div>':'<div class="note small">No active accounts.</div>')+ro+
   '<div class="fld"><span>Grade</span><div class="grade">'+['A','B','C','D'].map(function(g){return '<label><input type="radio" name="'+gid+'" value="'+g+'"'+(t.grade===g?' checked':'')+'><span>'+g+'</span></label>'}).join('')+'</div></div>'+
   '<div class="row-info" style="margin-bottom:10px"><label class="row" style="margin:0"><input type="checkbox" data-role="be" data-on="beToggle"'+(t.be?' checked':'')+'><b>Break-even</b><span class="tiny muted" data-role="behint"></span></label>'+info('About break-even','BE trades never count as wins or losses. Auto-suggested when |P&amp;L per account| ≤ '+fmt$(S.settings.beThreshold)+'.')+'</div>'+
   '<label class="fld"><span>Notes</span><textarea data-role="notes" placeholder="What happened?">'+esc(t.notes)+'</textarea></label>'+
   '<div class="fld"><span>Tags</span>'+S.behaviors.map(function(b){return '<button class="chip'+(t.tags.indexOf(b)>=0?' on':'')+'" data-act="chip" data-val="'+esc(b)+'">'+esc(b)+'</button>'}).join('')+
   '<input data-role="custom" placeholder="Custom tags, comma-separated" aria-label="Custom behavior labels, comma-separated" value="'+esc((t.custom||[]).join(', '))+'"></div>'+
   '<button class="btn sm danger" data-act="delTrade" aria-label="Delete trade">'+icoTxt('trash','Delete')+'</button></div>'}
export function openDay(date){date=date||todayS();var ts=S.trades.filter(function(t){return t.date===date});
  openSheet('Edit day','<label class="fld"><span>Date</span><input type="date" id="day-date" value="'+date+'" data-on="dayDate"></label><div class="row-info small muted" style="margin:-4px 0 10px"><span>Active accounts</span>'+info('Which accounts are shown','Boxes are shown for active accounts only; entries on blown/passed accounts stay in history, read-only.')+'</div><div id="day-trades">'+ts.map(tradeCard).join('')+'</div><button class="btn wide" data-act="addTrade" style="margin-bottom:10px">+ Add trade</button><button class="btn primary wide" data-act="saveDay" id="save-day">Save day</button>','day-sheet');
  if(!ts.length)$('#day-trades').insertAdjacentHTML('beforeend',tradeCard())}
export function cardEntries(card){var out=[];$$('input[data-acct]',card).forEach(function(i){var v=i.value.trim();if(v==='')return;var n=Number(v);if(isFinite(n))out.push({accountId:i.dataset.acct,pnl:r2(n)})});return out}
export function updateBE(card){var es=cardEntries(card),cb=$('[data-role=be]',card),hint=$('[data-role=behint]',card);if(!cb)return;var sug=suggestBE(es);
  if(card.dataset.betouched!=='1'){cb.checked=sug;hint.textContent=sug?'auto-suggested':''}else hint.textContent=sug&&!cb.checked?'looks like BE':''}
export function saveDay(){
  var date=$('#day-date').value;if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return toast('Pick a date',true);
  var act={};orderedActive().forEach(function(a){act[a.id]=a});
  var bad=$$('#day-trades .trade-card:not([data-deleted="1"]) input[data-acct]').some(function(i){return i.value.trim()!==''&&!isFinite(Number(i.value))});
  if(bad)return toast('Fix the invalid P&L values',true);
  $$('#day-trades .trade-card').forEach(function(card){
    var id=card.dataset.id,orig=id?S.trades.find(function(t){return t.id===id}):null;
    if(card.dataset.deleted==='1'){if(orig)S.trades=S.trades.filter(function(t){return t!==orig});return}
    var entries=[];$$('input[data-acct]',card).forEach(function(i){var v=i.value.trim();if(v==='')return;var a=act[i.dataset.acct];if(!a)return;var oe=orig&&orig.entries.find(function(e){return e.accountId===a.id});entries.push({accountId:a.id,pnl:r2(Number(v)),type:oe?oe.type:a.type})});
    if(orig)orig.entries.forEach(function(e){if(!act[e.accountId])entries.push(e)}); /* inactive entries preserved untouched */
    var notes=$('[data-role=notes]',card).value.trim(),g=$('input[type=radio]:checked',card),tags=$$('.chip.on',card).map(function(c){return c.dataset.val});
    var custom=$('[data-role=custom]',card).value.split(',').map(function(s){return s.trim()}).filter(Boolean);
    var known={};S.behaviors.forEach(function(b){known[norm(b)]=b});custom=custom.filter(function(c,i,arr){if(known[norm(c)]){if(tags.indexOf(known[norm(c)])<0)tags.push(known[norm(c)]);return false}return arr.findIndex(function(x){return norm(x)===norm(c)})===i});
    if(!entries.length&&!notes){if(orig)S.trades=S.trades.filter(function(t){return t!==orig});return}
    var t=orig||{id:uid(),createdAt:new Date().toISOString()};
    Object.assign(t,{date:date,entries:entries,grade:g?g.value:'',notes:notes,be:$('[data-role=be]',card).checked,beManual:card.dataset.betouched==='1',tags:tags,custom:custom});
    if(!orig)S.trades.push(t)});
  refreshPending();save();closeSheet();render();toast('Day saved')}
export var imp={blocks:[],image:null};
export function openImport(prefill){imp={blocks:[],image:null,thumb:null,fileName:null,photoDate:null,fileDate:null,dateManual:false};
  openSheet('Import screenshot','<div class="row-info small muted" style="margin-bottom:10px"><span><b>Name, balance</b> · screen order</span>'+info('Import format','Enter balances read from your screenshot <b>in screen order</b> (top → bottom): one per line <b>Name, balance</b>, or JSON. A date line (e.g. 2026-10-02) starts a new dated list. Matching uses lineup position + balance continuity first, then name. Nothing changes until you tap Apply.')+'</div>'+
  '<label class="fld"><span>Trade date</span><input type="date" id="imp-date" data-on="impDate" value="'+todayS()+'"></label><div class="imp-src small" id="imp-date-src">'+DATE_SOURCES.today+'</div>'+
  '<label class="fld"><span>Balances</span><textarea id="imp-text" rows="7" placeholder="TPT-F 4817, 27,340.50&#10;LUC-E 7731, 25,610">'+esc(prefill||'')+'</textarea></label>'+
  '<label class="fld"><span>Screenshot (optional)</span><input type="file" id="imp-img" accept="image/*" data-on="impImg"></label><div id="imp-img-prev"></div>'+
  '<button class="btn wide" data-act="impPreview" id="imp-preview-btn">Preview</button><div id="imp-out" style="margin-top:12px"></div>','import-sheet')}
export function readDecisions(){var d={};$$('#imp-out .imp-row.new').forEach(function(r){d[r.dataset.key]={confirm:$('[data-role=confirm]',r).checked,firm:$('[data-role=firm]',r).value,type:$('[data-role=type]',r).value,start:+$('[data-role=start]',r).value||S.settings.startBalance}});return d}
export function impPreview(keep){
  var dec=keep?readDecisions():{},p=parseImport($('#imp-text').value,$('#imp-date').value||todayS());imp.blocks=p.blocks;
  var out='';if(p.errors.length)out+='<div class="note">'+p.errors.map(esc).join('<br>')+'</div>';
  if(!p.blocks.length){$('#imp-out').innerHTML=out||'<div class="note">Nothing to import</div>';return}
  var res=runImport(clone(S),p.blocks,dec,null);
  res.forEach(function(b){out+='<div class="sect" style="margin-top:6px">'+fmtDate(b.date,{weekday:'short',month:'short',day:'numeric',year:'numeric'})+' · '+b.rows.length+' lines</div>';
    b.rows.forEach(function(r){if(r.isNew){var d=r.dec;out+='<div class="imp-row new" data-key="'+r.key+'"><div class="row between"><b>#'+(r.i+1)+' '+esc(r.name)+'</b><b>'+fmt$(r.balance)+'</b></div><div class="flagtxt">No match — not created unless confirmed</div>'+
      '<label class="row small" style="margin:8px 0"><input type="checkbox" data-role="confirm" data-on="impDec"'+(d.confirm?' checked':'')+'>Create as new account</label><div class="grid2"><select data-role="firm" data-on="impDec">'+S.settings.firms.map(function(f){return '<option'+(f.name===d.firm?' selected':'')+'>'+esc(f.name)+'</option>'}).join('')+'</select><select data-role="type" data-on="impDec"><option value="evaluation"'+(d.type!=='funded'?' selected':'')+'>Evaluation</option><option value="funded"'+(d.type==='funded'?' selected':'')+'>Funded</option></select></div><label class="fld" style="margin-top:8px"><span>Starting balance</span><input type="number" data-role="start" data-on="impDec" value="'+(d.start||S.settings.startBalance)+'"></label></div>'}
      else{var dl=r2(r.newBal-r.oldBal);out+='<div class="imp-row'+(r.flags.length?' flag':'')+'" data-match="'+esc(r.acctName)+'"><div class="row between"><b>#'+(r.i+1)+' '+esc(r.name)+'</b><b>'+fmt$(r.balance)+'</b></div><div class="small">→ '+esc(r.acctName)+' <span class="muted">('+r.acctStatus+')</span> · '+fmt$(r.oldBal)+' → '+fmt$(r.balance)+' <b class="'+cls(r.balance-r.oldBal)+'">'+fmt$(r.balance-r.oldBal,true)+'</b></div><div class="tiny muted">matched by '+esc(r.reason)+'</div>'+r.flags.map(function(f){return '<div class="flagtxt">⚠︎ '+esc(f)+'</div>'}).join('')+'</div>'}});
    out+=b.lineup?'<div class="small muted" style="margin:4px 0 10px">Lineup: '+b.lineup.map(function(n,i){return (i+1)+'. '+esc(n)}).join(' · ')+'</div>':'<div class="small muted">Older import — lineup unchanged.</div>'});
  out+='<button class="btn primary wide" data-act="impApply" id="imp-apply">Apply</button>';
  $('#imp-out').innerHTML=out}
export function impApply(){if(!imp.blocks.length)return;var dec=readDecisions(),keys=Object.keys(dec),nNew=keys.filter(function(k){return dec[k].confirm}).length,nSkip=keys.length-nNew;
  if(nNew&&!confirm('Create '+nNew+' new account'+(nNew>1?'s':'')+' from unmatched lines? Only do this if the screenshot really shows a new account.'))return;
  var dv=$('#imp-date').value,src=imp.dateManual?'manual':imp.photoDate&&dv===imp.photoDate?'photo':imp.fileDate&&dv===imp.fileDate&&dv!==todayS()?'file':'today';
  var res=runImport(S,imp.blocks,dec,{image:imp.image,thumb:imp.thumb,fileName:imp.fileName,photoDate:imp.photoDate,fileDate:imp.fileDate,dateSource:src});save();closeSheet();ui.tab='accounts';saveUi();render();
  var m=0,c=0;res.forEach(function(b){b.rows.forEach(function(r){if(r.created)c++;else if(r.acct)m++})});toast('Imported: '+m+' updated, '+c+' created'+(nSkip?', '+nSkip+' skipped':''))}
export function downscale(file,max,q){return new Promise(function(res,rej){var fr=new FileReader();fr.onload=function(){var img=new Image();img.onload=function(){var s=Math.min(1,max/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=Math.round(img.width*s);c.height=Math.round(img.height*s);c.getContext('2d').drawImage(img,0,0,c.width,c.height);res(c.toDataURL('image/jpeg',q))};img.onerror=rej;img.src=fr.result};fr.onerror=rej;fr.readAsDataURL(file)})}
export function openAddAccount(){openSheet('Add account','<div class="row-info small muted" style="margin-bottom:10px"><span>Balance changes only via imports</span>'+info('About new accounts','Starts at its starting balance. After this, its balance only changes through imports.')+'</div><label class="fld"><span>Name</span><input id="na-name" autocomplete="off"></label><label class="fld"><span>Prop firm</span><select id="na-firm">'+S.settings.firms.map(function(f){return '<option>'+esc(f.name)+'</option>'}).join('')+'</select></label><label class="fld"><span>Type</span><select id="na-type"><option value="evaluation">Evaluation</option><option value="funded">Funded</option></select></label><label class="fld"><span>Starting balance</span><input id="na-start" type="number" inputmode="decimal" value="'+S.settings.startBalance+'"></label><button class="btn primary wide" data-act="saveAccount" id="na-save">Add account</button>','add-sheet')}
export function saveAccount(){var name=$('#na-name').value.trim();if(!name)return toast('Enter a name',true);
  if(liveAccts().some(function(a){return norm(a.name)===norm(name)}))return toast('An account with that name already exists',true);
  S.accounts.push(createAccount({name:name,firm:$('#na-firm').value,type:$('#na-type').value,startBalance:+$('#na-start').value||S.settings.startBalance}));save();closeSheet();render();toast('Added '+name)}
export function firmEditRow(f,i){return '<div class="firm-edit" data-firm="'+i+'"><div class="row" style="margin-bottom:6px"><input data-role="fname" aria-label="Firm name" placeholder="Firm name" value="'+esc(f.name||'')+'" style="flex:2"><input data-role="fbuf" aria-label="Trailing drawdown buffer" placeholder="Buffer $" type="number" inputmode="decimal" value="'+(f.buffer!=null?f.buffer:'')+'" style="flex:1"><button class="btn sm" data-act="delFirm">✕</button></div><div class="row" style="margin-bottom:6px"><label class="mini"><span>Trader share %</span><input data-role="fshare" type="number" inputmode="decimal" min="0" max="100" value="'+(f.share!=null?f.share:100)+'"></label><label class="mini"><span>Short name</span><input data-role="fshort" value="'+esc(f.short||'')+'"></label><label class="mini"><span>Plan</span><input data-role="fplan" value="'+esc(f.plan||'')+'" placeholder="e.g. Pro"></label></div><input data-role="furl" type="url" inputmode="url" placeholder="Payout rules URL" aria-label="Official payout rules URL" value="'+esc(f.rulesUrl||'')+'"></div>'}
export function openSettings(){var st=S.settings;
  var h='<details class="card glass rules" id="rules"><summary>Rules ('+RULES.length+')</summary><ol>'+RULES.map(function(r){return '<li>'+esc(r)+'</li>'}).join('')+'</ol><div class="tiny muted">Enforced in code: balances change only via imports · status transitions are one-way · all totals, stops and records are recomputed from the records every time.</div></details>';
  h+='<div class="fld"><span>Appearance</span>'+seg('theme',[['auto','Auto'],['light','Light'],['dark','Dark']],ui.theme)+'</div>';
  h+='<div class="fld"><span>Prop firms</span><div id="firms">'+st.firms.map(function(f,i){return firmEditRow(f,i)}).join('')+'</div><button class="btn sm" data-act="addFirm">+ Firm</button></div>';
  h+='<div class="grid2"><label class="fld"><span>Starting balance</span><input id="s-start" type="number" value="'+st.startBalance+'"></label><label class="fld"><span>$ per point</span><input id="s-dpp" type="number" step="any" value="'+st.dollarsPerPoint+'"></label><label class="fld"><span>Risk (points)</span><input id="s-risk" type="number" value="'+st.riskPts+'"></label><label class="fld"><span>Target (points)</span><input id="s-target" type="number" value="'+st.targetPts+'"></label><label class="fld"><span>BE threshold ($)</span><input id="s-be" type="number" value="'+st.beThreshold+'"></label><label class="fld"><span>Import tolerance ($)</span><input id="s-tol" type="number" value="'+st.continuityTol+'"></label></div>';
  h+='<div class="small muted" style="margin-bottom:10px">Per contract: risk '+fmt$(riskUsd())+' · target '+fmt$(targetUsd())+'</div><button class="btn primary wide" data-act="saveSettings" id="s-save">Save settings</button><hr>';
  h+='<h2 style="font-size:13px;text-transform:uppercase;color:var(--muted)">Data</h2><div class="grid2"><button class="btn" data-act="exportJson" id="btn-export">Export JSON</button><button class="btn" data-act="loadDemo" id="btn-demo">Load demo data</button></div>';
  h+='<label class="fld" style="margin-top:10px"><span>Import JSON file</span><input type="file" id="json-file" accept="application/json,.json,text/plain" data-on="jsonFile"></label><label class="fld"><span>…or paste JSON</span><textarea id="json-paste"></textarea></label><button class="btn wide" data-act="importPaste" id="btn-import-paste">Import pasted</button>';
  h+='<textarea id="export-out" readonly style="margin-top:10px;display:none"></textarea><hr><button class="btn wide" data-act="rerunSetup" id="btn-setup" style="margin-bottom:10px">Run setup again</button><button class="btn danger wide" data-act="clearAll" id="btn-clear">Clear all data</button><div class="tiny muted row-info" style="margin-top:10px"><span>Stored only on this device</span>'+info('Privacy','Your journal is stored only on this device (localStorage) — no account, no tracking. The only network request is the optional economic-calendar refresh. Export regularly as a backup.')+'</div>';
  openSheet('Settings',h,'settings-sheet')}
export function saveSettings(){var st=S.settings,old=st.firms.map(function(f){return f.name});
  var firms=$$('#firms [data-firm]').map(function(r){var sh=$('[data-role=fshare]',r);return fillFirm({name:$('[data-role=fname]',r).value.trim(),buffer:+$('[data-role=fbuf]',r).value||0,share:sh&&sh.value!==''?Math.max(0,Math.min(100,+sh.value)):null,short:sh?$('[data-role=fshort]',r).value.trim():'',plan:sh?$('[data-role=fplan]',r).value.trim():'',rulesUrl:sh?$('[data-role=furl]',r).value.trim():'',i:+r.dataset.firm})}).filter(function(f){return f.name});
  firms.forEach(function(f){var o=old[f.i];if(o&&o!==f.name)S.accounts.forEach(function(a){if(a.firm===o)a.firm=f.name});delete f.i});
  st.firms=firms;st.startBalance=+$('#s-start').value||25000;st.dollarsPerPoint=+$('#s-dpp').value||5;st.riskPts=+$('#s-risk').value||100;st.targetPts=+$('#s-target').value||150;st.beThreshold=Math.max(0,+$('#s-be').value||0);st.continuityTol=+$('#s-tol').value||2500;
  save();render();openSettings();toast('Settings saved')}
export function handleJson(text){var o;try{o=JSON.parse(text)}catch(e){return toast('Invalid JSON: '+e.message,true)}
  if(o&&!Array.isArray(o)&&(o.app==='trading-journal'||(Array.isArray(o.accounts)&&Array.isArray(o.trades)))){if(!confirm('Replace ALL current data with this backup?'))return;setState(normalize(o));save();closeSheet();render();return toast('Backup restored')}
  if(Array.isArray(o)&&o.length&&o[0]&&'impact' in o[0]&&'country' in o[0]){var n=setNews(o,'Forex Factory file');newsState.err=null;closeSheet();render();return toast('News updated: '+n+' USD events')}
  var p=parseImport(text,todayS());if(p.blocks.length){closeSheet();openImport(text);impPreview(false);return toast('Balance list loaded — review and apply')}
  toast('Unrecognized JSON',true)}
