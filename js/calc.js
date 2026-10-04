// calc.js — copy-trade calculator: accounts × contracts × per-contract target/risk, day scenario, advanced tools
import { $, cls, esc, fmt$ } from './util.js';
import { S, riskUsd, targetUsd, ui, saveUi } from './state.js';
import { seg } from './ui.js';

export var CALC_LIM={accts:[1,100],ctr:[1,100],wd:[0,999],ld:[0,999]};
/* normalise persisted calculator state (older saves only had n = number of accounts) */
export function cv(){var c=ui.calc||(ui.calc={});
  if(c.accts==null)c.accts=Math.max(1,+c.n||1);if(c.ctr==null)c.ctr=1;if(c.wd==null)c.wd=1;if(c.ld==null)c.ld=0;
  if(!c.mode)c.mode='seq';if(c.seq==null)c.seq='WWLWL';if(c.days==null)c.days=3;if(!c.perDay)c.perDay=[];if(c.dd==null)c.dd=2500;
  Object.keys(CALC_LIM).forEach(function(k){var L=CALC_LIM[k],v=Math.round(+c[k]);c[k]=isFinite(v)?Math.max(L[0],Math.min(L[1],v)):L[0]});
  return c}
/* all calculator maths in one place (also exposed to tests as TJ.calc()) */
export function calcMath(){var c=cv(),T=targetUsd(),R=riskUsd(),win=c.accts*c.ctr*T,loss=c.accts*c.ctr*R,gw=c.wd*win,gl=c.ld*loss,days=c.wd+c.ld;
  return {accts:c.accts,ctr:c.ctr,perWin:T,perLoss:R,win:win,loss:loss,wd:c.wd,ld:c.ld,days:days,gw:gw,gl:gl,net:gw-gl,wr:days?c.wd/days:null}}
function plural(n,w,p){return n+' '+(n===1?w:(p||w+'s'))}
export function wrTxt(wr){return wr==null?'—':(Math.round(wr*1000)/10)+'%'}
var IC_MINUS='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',IC_PLUS='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
function stepBtns(k,label,big){var c=cv(),L=CALC_LIM[k];
  return {minus:'<button class="stp-b" data-act="calcStep" data-k="'+k+'" data-d="-1" aria-label="Fewer '+label+'"'+(c[k]<=L[0]?' disabled':'')+'>'+IC_MINUS+'</button>',
          plus:'<button class="stp-b plus" data-act="calcStep" data-k="'+k+'" data-d="1" aria-label="More '+label+'"'+(c[k]>=L[1]?' disabled':'')+'>'+IC_PLUS+'</button>'}}
function stepper(k,label){var b=stepBtns(k,label),c=cv();return '<div class="stp stp-sm" data-stp="'+k+'">'+b.minus+'<output class="stp-v mono" id="calc-'+k+'" aria-live="polite" aria-label="'+label+'">'+c[k]+'</output>'+b.plus+'</div>'}
export function rCalc(){var c=cv(),m=calcMath(),bA=stepBtns('accts','accounts');
  var h='<section class="card glass calc-card" id="calc-basic"><h2 class="calc-h">Accounts being copy traded</h2><p class="calc-sub">Same trade copied to every selected account</p>'+
    '<div class="stp stp-lg" data-stp="accts">'+bA.minus+'<input class="stp-v mono" id="calc-accts" type="number" inputmode="numeric" min="1" max="100" step="1" value="'+c.accts+'" data-on="calcSet" data-k="accts" aria-label="Accounts being copy traded">'+bA.plus+'</div>'+
    '<div class="row-stp" id="row-ctr"><span class="row-l">Contracts per account</span>'+stepper('ctr','contracts per account')+'</div>'+
    '<div class="wl-box" id="calc-wl"><div class="wl"><div class="wl-l">One win</div><div class="wl-v mono pos" id="calc-win">'+'+'+fmt$(m.win)+'</div><div class="wl-c mono" id="win-cap"></div></div>'+
    '<div class="wl"><div class="wl-l">One loss</div><div class="wl-v mono neg" id="calc-loss">'+'−'+fmt$(m.loss)+'</div><div class="wl-c mono" id="loss-cap"></div></div></div></section>';
  h+='<section class="card glass calc-card" id="calc-scen"><div class="calc-hrow"><div><h2 class="calc-h">Run a scenario</h2><p class="calc-sub">Add winning and losing days to see the combined result.</p></div><button class="link-btn" data-act="calcReset" id="calc-reset">Reset</button></div>'+
    '<div class="scen-row" id="row-wd"><span class="row-l">Winning days</span>'+stepper('wd','winning days')+'</div>'+
    '<div class="scen-row" id="row-ld"><span class="row-l">Losing days</span>'+stepper('ld','losing days')+'</div>'+
    '<div class="proj" id="proj"><div class="proj-l">Projected net</div><div class="proj-v mono" id="proj-net"></div><div class="proj-c" id="proj-cap"></div></div>'+
    '<div class="gross"><div><div class="wl-l">Gross wins</div><div class="gross-v mono pos" id="gross-w"></div></div><div><div class="wl-l">Gross losses</div><div class="gross-v mono neg" id="gross-l"></div></div></div></section>';
  h+='<details class="card glass" id="calc-adv"'+(c.adv?' open':'')+'><summary><span>Advanced</span><span class="tiny muted">settings · firm buffers · sequences · recovery</span></summary><div id="adv-set">'+advSet()+'</div>'+
    '<h2 style="margin-top:16px">Multi-day sequence</h2>'+seg('calcmode',[['seq','W/L sequence'],['perday','Per day']],c.mode)+'<div id="scen-in">'+scenInputs()+'</div><div id="scen-out">'+scenOut()+'</div></details>';
  return h}
/* fill in every computed number without re-rendering (keeps focus while stepping/typing) */
export function calcPaint(){var m=calcMath(),c=cv();if(!$('#calc-basic'))return;
  var a=$('#calc-accts');if(a&&document.activeElement!==a)a.value=c.accts;
  ['ctr','wd','ld'].forEach(function(k){var o=$('#calc-'+k);if(o)o.textContent=c[k]});
  document.querySelectorAll('#view [data-act=calcStep]').forEach(function(b){var k=b.dataset.k,L=CALC_LIM[k];b.disabled=+b.dataset.d<0?c[k]<=L[0]:c[k]>=L[1]});
  $('#calc-win').textContent='+'+fmt$(m.win);$('#calc-loss').textContent='−'+fmt$(m.loss);
  $('#win-cap').textContent=plural(m.accts,'acct')+' × '+plural(m.ctr,'contract')+' × '+fmt$(m.perWin);
  $('#loss-cap').textContent=plural(m.accts,'acct')+' × '+plural(m.ctr,'contract')+' × '+fmt$(m.perLoss);
  var p=$('#proj');p.classList.toggle('neg-panel',m.net<0);$('#proj-net').textContent=fmt$(m.net,true);
  $('#proj-cap').textContent=plural(m.days,'day')+' · '+(m.days?wrTxt(m.wr)+' win rate':'no days added yet');
  $('#gross-w').textContent='+'+fmt$(m.gw);$('#gross-l').textContent='−'+fmt$(m.gl);
  ['calc-win','calc-loss','proj-net','gross-w','gross-l'].forEach(function(id){var e=$('#'+id);e.style.setProperty('--len',Math.max(5,e.textContent.length))});
  var s=$('#adv-set');if(s)s.innerHTML=advSet();var o=$('#scen-out');if(o&&!(document.activeElement&&document.activeElement.id==='calc-dd'))o.innerHTML=scenOut()}
export function calcStep(k,d){var c=cv(),L=CALC_LIM[k];c[k]=Math.max(L[0],Math.min(L[1],c[k]+d));saveUi();calcPaint()}
export function calcReset(){var c=cv();c.wd=0;c.ld=0;saveUi();calcPaint()}
function advSet(){var st=S.settings,m=calcMath();
  var h='<div class="adv-grid"><div class="stat"><div class="l">Risk / trade</div><div class="v mono">'+st.riskPts+' pts</div></div><div class="stat"><div class="l">Target / trade</div><div class="v mono">'+st.targetPts+' pts</div></div><div class="stat"><div class="l">$ per point</div><div class="v mono">'+fmt$(st.dollarsPerPoint)+'</div></div></div>'+
    '<div class="small muted" style="margin:8px 0 12px">Per contract: win '+fmt$(m.perWin)+' · loss '+fmt$(m.perLoss)+' · <button class="link-btn sm" data-act="settings">Edit in Settings</button></div>';
  var firms=(st.firms||[]).filter(function(f){return f&&f.name});
  if(firms.length){h+='<h2>Firm buffers · per account at '+plural(m.ctr,'contract')+'</h2><div class="fb-list">';
    firms.forEach(function(f){var b=+f.buffer||0,w=m.ctr*m.perWin,l=m.ctr*m.perLoss;
      h+='<div class="fb" data-firm="'+esc(f.name)+'"><b>'+esc(f.name)+'</b><span class="mono small">buffer '+fmt$(b)+'</span><span class="small muted">'+(b&&w?Math.ceil(b/w)+' win'+(Math.ceil(b/w)===1?'':'s')+' to lock the stop at start':'no buffer')+(b&&l?' · '+Math.ceil(b/l)+' loss'+(Math.ceil(b/l)===1?'':'es')+' from start to the stop':'')+'</span></div>'});
    h+='</div>'}
  return h}
export function scenInputs(){var c=cv();if(c.mode==='seq')return '<label class="fld"><span>Sequence — W, L, B (break-even); separate days with spaces, e.g. "WWL WL"</span><input id="calc-seq" autocapitalize="characters" autocomplete="off" value="'+esc(c.seq)+'" data-on="calcSeq"></label>';
  var days=Math.max(1,Math.min(60,+c.days||1)),pdx=c.perDay||[];var h='<label class="fld"><span>Number of days</span><input id="calc-days" type="number" inputmode="numeric" min="1" max="60" value="'+days+'" data-on="calcDays"></label><div class="pd-row tiny muted"><span></span><span>Wins</span><span>Losses</span><span>BE</span></div>';
  for(var i=0;i<days;i++){var r=pdx[i]||{w:0,l:0,b:0};h+='<div class="pd-row"><span class="small">Day '+(i+1)+'</span>'+['w','l','b'].map(function(k){return '<input type="number" inputmode="numeric" min="0" value="'+(r[k]||0)+'" data-on="calcPD" data-i="'+i+'" data-k="'+k+'">'}).join('')+'</div>'}return h}
export function scenData(){var c=cv(),days=[];
  if(c.mode==='seq'){String(c.seq||'').toUpperCase().split(/[\s\/|,]+/).filter(Boolean).forEach(function(chunk){var d={w:0,l:0,b:0};chunk.replace(/[^WLB]/g,'').split('').forEach(function(ch){d[ch==='W'?'w':ch==='L'?'l':'b']++});days.push(d)})}
  else{var n=Math.max(1,Math.min(60,+c.days||1));for(var i=0;i<n;i++){var r=(c.perDay||[])[i]||{};days.push({w:+r.w||0,l:+r.l||0,b:+r.b||0})}}
  return days}
export function scenOut(){var m=calcMath(),W=m.win,L=m.loss,days=scenData(),n=m.accts;
  var tw=0,tl=0,tb=0,cum=0,peak=0,mdd=0,rows='';
  days.forEach(function(d,i){tw+=d.w;tl+=d.l;tb+=d.b;var net=d.w*W-d.l*L;cum+=net;peak=Math.max(peak,cum);mdd=Math.max(mdd,peak-cum);rows+='<div class="seqday"><span>Day '+(i+1)+' <span class="muted small">'+d.w+'W '+d.l+'L '+d.b+'BE</span></span><span><b class="mono '+cls(net)+'">'+fmt$(net,true)+'</b> <span class="muted small">Σ '+fmt$(cum,true)+'</span></span></div>'});
  var net=tw*W-tl*L,wr=(tw+tl)?tw/(tw+tl):null,dd=Math.max(0,+cv().dd||0);
  var need=W>0?Math.ceil(dd/W):Infinity,exp=wr==null?null:wr*W-(1-wr)*L;
  var h='<div class="calc-res" style="margin-top:4px"><div class="stat"><div class="l">Net P&amp;L</div><div class="v mono '+cls(net)+'" id="seq-net">'+fmt$(net,true)+'</div></div><div class="stat"><div class="l">Win rate</div><div class="v mono" id="seq-wr">'+wrTxt(wr)+'</div></div></div>';
  h+='<div class="small muted" style="margin:8px 0">'+tw+' wins · '+tl+' losses · '+tb+' BE over '+days.length+' day'+(days.length===1?'':'s')+' · max drawdown '+fmt$(mdd)+'</div>'+rows;
  h+='<h2 style="margin-top:16px">Recovery math</h2><label class="fld"><span>Drawdown to recover ($)</span><input id="calc-dd" type="number" inputmode="decimal" min="0" value="'+dd+'" data-on="calcDD"></label>';
  h+='<div class="calc-res"><div class="stat"><div class="l">Straight wins needed</div><div class="v mono" id="rec-need">'+(isFinite(need)?need:'—')+'</div><div class="tiny muted">at '+fmt$(W)+' per win ('+plural(n,'acct')+' × '+plural(m.ctr,'contract')+')</div></div>'+
     '<div class="stat"><div class="l">Trades at this win rate</div><div class="v mono" id="rec-trades">'+(exp==null?'—':exp<=0?'∞':Math.ceil(dd/exp))+'</div><div class="tiny muted">'+(exp==null?'enter a sequence':exp<=0?'negative expectancy — not recoverable':'expectancy '+fmt$(exp,true)+'/trade')+'</div></div></div>';
  h+='<div class="tiny muted" style="margin-top:8px">Each extra loss adds '+(W>0?(L/W).toFixed(2):'—')+' wins to the recovery (1 loss = '+fmt$(L)+', 1 win = '+fmt$(W)+').</div>';
  return h}
