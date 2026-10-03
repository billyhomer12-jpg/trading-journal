// payouts.js — payout ledger per funded account (layout follows the user's Payouts mockup, styled in the app's sea-green theme).
// Payouts are records only: they NEVER change account balances (balances change only via imports).
import { $, $$, esc, fmt$, r2, todayS, fmtDate, uid } from './util.js';
import { S, ui, save, saveUi, firmOf } from './state.js';
import { liveAccts, byLineup, acctById } from './model.js';
import { openSheet, closeSheet, toast } from './ui.js';
import { render } from './main.js';

var PAY_STATUSES=['requested','paid','denied'];
function fundedAccts(){var f=liveAccts().filter(function(a){return a.type==='funded'});return byLineup(f.filter(function(a){return a.status==='active'})).concat(byLineup(f.filter(function(a){return a.status!=='active'})))}
function activeFunded(){return fundedAccts().filter(function(a){return a.status==='active'})}
/* privacy-masked label like "TAKE*** 3": first 4 letters/digits + *** + trailing number */
export function maskName(name){var s=String(name||'').toUpperCase(),head=s.replace(/[^A-Z0-9]/g,'').slice(0,4),tail=(s.match(/(\d+)\D*$/)||[])[1]||'';if(tail.length>4)tail=tail.slice(-4);return head+'***'+(tail?' '+tail:'')}
function shareOf(a){return a?+firmOf(a.firm).share:100}
function net(gross,share){return r2((+gross||0)*(+share)/100)}
export function payoutTotals(){
  var t=todayS(),ym=t.slice(0,7),y=t.slice(0,4),out={all:0,month:0,year:0,paid:0,requested:0,denied:0,pending:0,byFirm:{},byMonth:{},byAcct:{}};
  S.payouts.forEach(function(p){
    out[p.status]=(out[p.status]||0)+1;
    var fk=p.firm||'—',f=out.byFirm[fk]||(out.byFirm[fk]={received:0,paid:0,pending:0,count:0});f.count++;
    var ak=out.byAcct[p.accountId]||(out.byAcct[p.accountId]={received:0,paid:0,last:null});
    if(p.status==='requested'){out.pending=r2(out.pending+(+p.requested||0));f.pending=r2(f.pending+(+p.requested||0))}
    if(p.status!=='paid')return;
    var amt=+p.received||0;out.all=r2(out.all+amt);if(p.date.slice(0,7)===ym)out.month=r2(out.month+amt);if(p.date.slice(0,4)===y)out.year=r2(out.year+amt);
    f.received=r2(f.received+amt);f.paid++;
    var mk=p.date.slice(0,7),m=out.byMonth[mk]||(out.byMonth[mk]={received:0,paid:0});m.received=r2(m.received+amt);m.paid++;
    ak.received=r2(ak.received+amt);ak.paid++;if(!ak.last||p.date>ak.last)ak.last=p.date});
  return out}
function shareNote(){var fs=S.settings.firms;if(!fs.length)return '';
  var parts=fs.map(function(f){return esc(f.name+(f.plan?' '+f.plan:''))+' '+(+f.share)+'%'});
  var txt=parts.length>1?parts.slice(0,-1).join(', ')+', and '+parts[parts.length-1]:parts[0];
  var links=fs.filter(function(f){return f.rulesUrl}).map(function(f){return '<a class="lnk" href="'+esc(f.rulesUrl)+'" target="_blank" rel="noopener">'+esc(f.short||f.name)+' rules</a>'}).join(' · ');
  return '<p class="pay-note" id="pay-note">Net payout totals apply the current standard trader share: '+txt+'. '+links+'</p>'}
var WALLET='<svg viewBox="0 0 24 24"><path d="M5 7.5V6.8A2.3 2.3 0 017.3 4.5H17v3"/><rect x="3.5" y="7.5" width="17" height="12" rx="2.5"/><path d="M20.5 11.5h-4a2 2 0 000 4h4"/></svg>';
export function rPayouts(){
  var T=payoutTotals(),fa=fundedAccts(),t=todayS();
  /* (1) total withdrawn header + floating + */
  var h='<section class="pay-hero" id="pay-summary"><div class="small muted">Total withdrawn</div><div class="pay-big" id="pay-all">'+fmt$(T.all)+'</div><div class="muted">Across every account in the ledger</div><button class="fab" data-act="openPayout" id="pay-fab" aria-label="Record a payout">+</button></section>';
  /* (2) trader-share note with official rule links */
  h+=shareNote();
  /* (3) record a payout card */
  h+='<button class="rec-card glass" data-act="openPayout" id="btn-log-payout"><span class="rec-ic">'+WALLET+'</span><span class="rec-tx"><b>Record a payout</b><span class="muted small">Choose all active accounts or one account</span></span><span class="rec-go" aria-hidden="true">→</span></button>';
  /* (4) withdrawal history */
  var list=S.payouts.slice().sort(function(a,b){return a.date<b.date?1:a.date>b.date?-1:(b.createdAt||'')<(a.createdAt||'')?-1:1});
  h+='<h3 class="pay-h">Withdrawal history</h3><div id="pay-list">';
  if(!list.length)h+='<div class="card glass empty small">No withdrawals recorded yet. Tap “Record a payout” to log your first one.</div>';
  list.forEach(function(p){var a=acctById(p.accountId),f=firmOf(p.firm),share=p.share!=null?+p.share:+f.share,cut=r2(100-share);
    var amt=p.status==='paid'?p.received:p.status==='denied'?0:p.requested;
    h+='<div class="wd-card glass pay-row" data-pay="'+p.id+'"><div class="wd-av">W</div><div class="wd-main"><div class="row between" style="align-items:flex-start"><div><b>Withdrawal</b>'+(p.status!=='paid'?' <span class="tag '+p.status+'">'+p.status+'</span>':'')+'<div class="small muted">'+esc(a?maskName(a.name):'REMOVED***')+' · Funded'+(a&&a.status!=='active'?' ('+a.status+')':'')+'</div></div><div style="text-align:right"><div class="small muted">'+fmtDate(p.date,{month:'short',day:'numeric',year:'numeric'})+'</div><div class="wd-amt'+(p.status==='denied'?' denied':'')+'">'+(amt?'−':'')+fmt$(Math.abs(amt))+'</div></div></div>'+
      '<div class="small" style="margin-top:6px">'+cut+'% payout to '+esc(f.short||p.firm)+(p.status==='paid'&&+p.requested?' <span class="muted tiny">· gross '+fmt$(p.requested)+' → net '+fmt$(p.received)+'</span>':p.status==='requested'?' <span class="muted tiny">· est. net '+fmt$(p.received)+'</span>':'')+'</div>'+(p.notes?'<div class="tiny muted" style="margin-top:2px">'+esc(p.notes)+'</div>':'')+
      '<div class="wd-acts"><button class="lnk-btn ok" data-act="openPayout" data-id="'+p.id+'">Correct</button><button class="lnk-btn rm" data-act="delPayout" data-id="'+p.id+'">Remove entry</button></div></div></div>'});
  h+='</div>';
  /* secondary: totals, by firm, by month, next-eligible */
  h+='<h3 class="pay-h">Totals</h3><section class="card glass" id="pay-totals"><div class="grid2"><div class="stat"><div class="l">This month</div><div class="v" id="pay-month">'+fmt$(T.month)+'</div></div><div class="stat"><div class="l">'+t.slice(0,4)+'</div><div class="v" id="pay-year">'+fmt$(T.year)+'</div></div><div class="stat"><div class="l">Pending (requested)</div><div class="v" id="pay-pending">'+fmt$(T.pending)+'</div></div><div class="stat"><div class="l">Payouts paid</div><div class="v" id="pay-count">'+T.paid+'</div></div></div><div class="tiny muted" style="margin-top:8px">'+S.payouts.length+' entries · '+T.requested+' requested · '+T.denied+' denied. Payouts are records only — they never change account balances; balances update only from imports.</div></section>';
  var firms=Object.keys(T.byFirm).sort(function(a,b){return T.byFirm[b].received-T.byFirm[a].received});
  h+='<section class="card glass" id="pay-firms"><h2>By firm</h2>'+(firms.length?'<div class="hist" style="max-height:none">'+firms.map(function(k){var f=T.byFirm[k];return '<div data-firm-total="'+esc(k)+'"><span>'+esc(k)+' <span class="tiny muted">'+f.paid+' paid'+(f.pending?' · '+fmt$(f.pending)+' pending':'')+'</span></span><b>'+fmt$(f.received)+'</b></div>'}).join('')+'</div>':'<div class="muted small">No payouts yet.</div>')+'</section>';
  var months=Object.keys(T.byMonth).sort().reverse(),years={};months.forEach(function(m){var y=m.slice(0,4);years[y]=r2((years[y]||0)+T.byMonth[m].received)});
  h+='<section class="card glass" id="pay-months"><h2>By month</h2>'+(months.length?'<div class="hist" style="max-height:none">'+months.map(function(m){return '<div><span>'+new Date(+m.slice(0,4),+m.slice(5,7)-1,1).toLocaleDateString(undefined,{month:'long',year:'numeric'})+' <span class="tiny muted">'+T.byMonth[m].paid+' paid</span></span><b>'+fmt$(T.byMonth[m].received)+'</b></div>'}).join('')+'</div><div class="small muted" style="margin-top:8px">'+Object.keys(years).sort().reverse().map(function(y){return y+': <b>'+fmt$(years[y])+'</b>'}).join(' · ')+'</div>':'<div class="muted small">No paid payouts yet.</div>')+'</section>';
  h+='<section class="card glass" id="pay-accts"><h2>Next eligible payout date</h2>'+(fa.length?fa.map(function(a){var s=T.byAcct[a.id]||{received:0,paid:0,last:null},el=a.nextPayoutDate,now=el&&el<=t;
    return '<div class="elig" data-pacct="'+esc(a.name)+'"><div><b class="pos">F '+esc(a.name)+'</b>'+(a.status!=='active'?' <span class="tag">'+a.status+'</span>':'')+'<div class="tiny muted">'+esc(a.firm)+' · '+fmt$(s.received)+' over '+s.paid+' payout'+(s.paid===1?'':'s')+(s.last?' · last '+fmtDate(s.last):'')+(now&&a.status==='active'?' · <b class="pos">eligible now</b>':'')+'</div></div><input type="date" aria-label="Next eligible date" value="'+(el||'')+'" data-on="nextElig" data-id="'+a.id+'"'+(a.status!=='active'?' disabled':'')+'></div>'}).join(''):'<div class="muted small">No funded accounts yet.</div>')+'</section>';
  return h}
/* ---- record / correct form ---- */
export function openPayout(id){
  var p=id?S.payouts.find(function(x){return x.id===id}):null,fa=fundedAccts(),act=activeFunded();
  if(!p&&!fa.length)return toast('No funded accounts yet',true);
  var mode=p?'one':(act.length?(ui.payMode||'all'):'one');
  var cur=p||{date:todayS(),accountId:(act[0]||fa[0]).id,requested:'',received:'',status:'requested',notes:''};
  if(p&&!fa.some(function(a){return a.id===p.accountId})){var ra=acctById(p.accountId);if(ra)fa.push(ra)}
  var ca=acctById(cur.accountId),cs=p&&p.share!=null?p.share:shareOf(ca);
  var h='<div id="pay-form" data-mode="'+mode+'" data-id="'+(p?p.id:'')+'">'+
   (p?'':'<div class="seg" id="pay-mode"><button data-act="payMode" data-val="all" class="'+(mode==='all'?'on':'')+'"'+(act.length?'':' disabled')+'>All active accounts</button><button data-act="payMode" data-val="one" class="'+(mode==='one'?'on':'')+'">One account</button></div>')+
   '<label class="fld"><span>Date</span><input type="date" id="pay-date" value="'+cur.date+'"></label>'+
   '<div class="pm-all"><div class="row" style="margin-bottom:8px"><input type="number" inputmode="decimal" step="any" min="0" id="pay-fillv" placeholder="Same gross amount for every account" style="flex:1"><button class="btn sm" data-act="payFill">Fill all</button></div>'+
     act.map(function(a){var sh=shareOf(a);return '<div class="pay-acct-row" data-id="'+a.id+'"><div><b class="pos">F '+esc(a.name)+'</b><div class="tiny muted">'+esc(a.firm)+' · trader share '+sh+'%</div></div><div><input class="pay-gross" type="number" inputmode="decimal" step="any" min="0" placeholder="Gross $" data-on="payCalc" data-share="'+sh+'"><div class="tiny muted pay-net">net —</div></div></div>'}).join('')+'</div>'+
   '<div class="pm-one"><label class="fld"><span>Funded account</span><select id="pay-acct" data-on="payAcct">'+fa.map(function(a){return '<option value="'+a.id+'"'+(a.id===cur.accountId?' selected':'')+' data-share="'+shareOf(a)+'">F '+esc(a.name)+(a.status!=='active'?' ('+a.status+')':'')+'</option>'}).join('')+'</select></label>'+
     '<div class="small muted" style="margin:-4px 0 10px">Firm: <b id="pay-firm">'+esc(p?p.firm:(ca||{}).firm||'')+'</b> · trader share <b id="pay-share" data-share="'+cs+'">'+cs+'%</b></div>'+
     '<div class="grid2"><label class="fld"><span>Gross requested ($)</span><input type="number" inputmode="decimal" step="any" min="0" id="pay-req" data-on="payCalc" value="'+(cur.requested===''?'':cur.requested)+'"></label><label class="fld"><span>Net received ($)</span><input type="number" inputmode="decimal" step="any" min="0" id="pay-rcv" data-on="payRcv"'+(p?' data-touched="1"':'')+' value="'+(cur.received===''?'':cur.received)+'"></label></div></div>'+
   '<div class="fld"><span>Status</span><div class="grade" id="pay-status">'+PAY_STATUSES.map(function(s){return '<label><input type="radio" name="pay-status" value="'+s+'"'+(cur.status===s?' checked':'')+'><span style="text-transform:capitalize">'+s+'</span></label>'}).join('')+'</div></div>'+
   '<label class="fld"><span>Notes</span><textarea id="pay-notes" placeholder="e.g. processing time, fees">'+esc(cur.notes||'')+'</textarea></label>'+
   '<div class="tiny muted" style="margin-bottom:10px">Net = gross × the firm\'s trader share (editable per firm in Settings); you can override the net for a single account. Denied payouts count as $0. Recording a payout never changes the account balance — import the new balance from your screenshot.</div>'+
   '<button class="btn primary wide" data-act="savePayout" data-id="'+(p?p.id:'')+'" id="pay-save" style="margin-bottom:10px">'+(p?'Save correction':'Save payout')+'</button>'+(p?'<button class="btn danger wide" data-act="delPayout" data-id="'+p.id+'">Remove entry</button>':'')+'</div>';
  openSheet(p?'Correct payout':'Record a payout',h,'payout-sheet')}
export function setPayMode(m){var f=$('#pay-form');if(!f)return;f.dataset.mode=m;ui.payMode=m;saveUi();$$('#pay-mode button').forEach(function(b){b.classList.toggle('on',b.dataset.val===m)})}
export function payAcctChanged(el){var a=acctById(el.value),sh=shareOf(a);$('#pay-firm').textContent=a?a.firm:'';var s=$('#pay-share');s.textContent=sh+'%';s.dataset.share=sh;payCalc($('#pay-req'))}
export function payCalc(el){
  if(el.classList.contains('pay-gross')){var n=el.parentNode.querySelector('.pay-net');n.textContent=el.value===''?'net —':'net '+fmt$(net(el.value,el.dataset.share));return}
  var rcv=$('#pay-rcv');if(rcv&&rcv.dataset.touched!=='1')rcv.value=el.value===''?'':net(el.value,$('#pay-share').dataset.share)}
export function savePayout(id){
  var form=$('#pay-form'),mode=id?'one':form.dataset.mode,date=$('#pay-date').value,st=(document.querySelector('input[name=pay-status]:checked')||{}).value||'requested',notes=$('#pay-notes').value.trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return toast('Pick a date',true);
  if(mode==='all'){
    var rows=$$('#pay-form .pay-acct-row').map(function(r){return {a:acctById(r.dataset.id),v:$('.pay-gross',r).value.trim(),share:+$('.pay-gross',r).dataset.share}}).filter(function(x){return x.v!==''});
    if(!rows.length)return toast('Enter a gross amount for at least one account',true);
    if(rows.some(function(x){return !isFinite(+x.v)||+x.v<0}))return toast('Amounts must be positive numbers',true);
    var batch=uid();rows.forEach(function(x){S.payouts.push({id:uid(),batchId:batch,createdAt:new Date().toISOString(),date:date,accountId:x.a.id,firm:x.a.firm,share:x.share,requested:r2(+x.v),received:st==='denied'?0:net(x.v,x.share),status:st,notes:notes})});
    save();closeSheet();render();return toast('Recorded '+rows.length+' payout'+(rows.length>1?'s':''))}
  var acct=acctById($('#pay-acct').value),req=$('#pay-req').value.trim(),rcv=$('#pay-rcv').value.trim();
  if(!acct)return toast('Pick a funded account',true);
  var R=+req,V=rcv===''?null:+rcv;if(req===''||!isFinite(R)||R<0)return toast('Enter the gross amount requested',true);if(V!=null&&(!isFinite(V)||V<0))return toast('Net received must be a positive number',true);
  var p=id?S.payouts.find(function(x){return x.id===id}):null,share=(p&&p.accountId===acct.id&&p.share!=null)?p.share:shareOf(acct);
  if(V==null)V=net(R,share);if(st==='denied')V=0;
  var rec={date:date,accountId:acct.id,firm:(p&&p.accountId===acct.id)?p.firm:acct.firm,share:share,requested:r2(R),received:r2(V),status:st,notes:notes};
  if(p)Object.assign(p,rec);else S.payouts.push(Object.assign({id:uid(),createdAt:new Date().toISOString()},rec));
  save();closeSheet();render();toast(p?'Payout corrected':'Payout saved')}
export function deletePayout(id){if(!confirm('Remove this payout entry? This cannot be undone.'))return;S.payouts=S.payouts.filter(function(p){return p.id!==id});save();closeSheet();render();toast('Entry removed')}
export function setNextEligible(id,val){var a=acctById(id);if(!a||a.type!=='funded')return;if(val)a.nextPayoutDate=val;else delete a.nextPayoutDate;save();render()}
