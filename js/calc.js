// calc.js
import { $, cls, esc, fmt$, pd } from './util.js';
import { S, riskUsd, targetUsd, ui } from './state.js';
import { seg } from './ui.js';

export function rCalc(){
  var c=ui.calc,n=Math.max(0,+c.n||0),W=n*targetUsd(),L=n*riskUsd();
  var h='<section class="card glass" id="calc-basic"><h2>Per trade · '+S.settings.riskPts+' pt risk / '+S.settings.targetPts+' pt target · $'+S.settings.dollarsPerPoint+'/pt</h2><label class="fld"><span>Number of accounts</span><input id="calc-n" type="number" inputmode="numeric" min="0" step="1" value="'+n+'" data-on="calcN"></label>'+
    '<div class="calc-res"><div class="stat"><div class="l">Win</div><div class="v pos" id="calc-win">'+fmt$(W,true)+'</div></div><div class="stat"><div class="l">Loss</div><div class="v neg" id="calc-loss">'+fmt$(-L)+'</div></div></div></section>';
  h+='<section class="card glass" id="calc-scen"><h2>Multi-day scenario</h2>'+seg('calcmode',[['seq','W/L sequence'],['perday','Per day']],c.mode)+'<div id="scen-in">'+scenInputs()+'</div><div id="scen-out">'+scenOut()+'</div></section>';
  return h}
export function scenInputs(){var c=ui.calc;if(c.mode==='seq')return '<label class="fld"><span>Sequence — W, L, B (break-even); separate days with spaces, e.g. "WWL WL"</span><input id="calc-seq" autocapitalize="characters" autocomplete="off" value="'+esc(c.seq)+'" data-on="calcSeq"></label>';
  var days=Math.max(1,Math.min(60,+c.days||1)),pdx=c.perDay||[];var h='<label class="fld"><span>Number of days</span><input id="calc-days" type="number" inputmode="numeric" min="1" max="60" value="'+days+'" data-on="calcDays"></label><div class="pd-row tiny muted"><span></span><span>Wins</span><span>Losses</span><span>BE</span></div>';
  for(var i=0;i<days;i++){var r=pdx[i]||{w:0,l:0,b:0};h+='<div class="pd-row"><span class="small">Day '+(i+1)+'</span>'+['w','l','b'].map(function(k){return '<input type="number" inputmode="numeric" min="0" value="'+(r[k]||0)+'" data-on="calcPD" data-i="'+i+'" data-k="'+k+'">'}).join('')+'</div>'}return h}
export function scenData(){var c=ui.calc,days=[];
  if(c.mode==='seq'){String(c.seq||'').toUpperCase().split(/[\s\/|,]+/).filter(Boolean).forEach(function(chunk){var d={w:0,l:0,b:0};chunk.replace(/[^WLB]/g,'').split('').forEach(function(ch){d[ch==='W'?'w':ch==='L'?'l':'b']++});days.push(d)})}
  else{var n=Math.max(1,Math.min(60,+c.days||1));for(var i=0;i<n;i++){var r=(c.perDay||[])[i]||{};days.push({w:+r.w||0,l:+r.l||0,b:+r.b||0})}}
  return days}
export function scenOut(){var n=Math.max(0,+ui.calc.n||0),W=n*targetUsd(),L=n*riskUsd(),days=scenData();
  var tw=0,tl=0,tb=0,cum=0,peak=0,mdd=0,rows='';
  days.forEach(function(d,i){tw+=d.w;tl+=d.l;tb+=d.b;var net=d.w*W-d.l*L;cum+=net;peak=Math.max(peak,cum);mdd=Math.max(mdd,peak-cum);rows+='<div class="seqday"><span>Day '+(i+1)+' <span class="muted small">'+d.w+'W '+d.l+'L '+d.b+'BE</span></span><span><b class="'+cls(net)+'">'+fmt$(net,true)+'</b> <span class="muted small">Σ '+fmt$(cum,true)+'</span></span></div>'});
  var net=tw*W-tl*L,wr=(tw+tl)?tw/(tw+tl):null,dd=Math.max(0,+ui.calc.dd||0);
  var need=W>0?Math.ceil(dd/W):Infinity,exp=wr==null?null:wr*W-(1-wr)*L;
  var h='<div class="calc-res" style="margin-top:4px"><div class="stat"><div class="l">Net P&amp;L</div><div class="v '+cls(net)+'" id="scen-net">'+fmt$(net,true)+'</div></div><div class="stat"><div class="l">Win rate</div><div class="v" id="scen-wr">'+(wr==null?'—':Math.round(wr*1000)/10+'%')+'</div></div></div>';
  h+='<div class="small muted" style="margin:8px 0">'+tw+' wins · '+tl+' losses · '+tb+' BE over '+days.length+' day'+(days.length===1?'':'s')+' · max drawdown '+fmt$(mdd)+'</div>'+rows;
  h+='<hr><h2>Recovery math</h2><label class="fld"><span>Drawdown to recover ($)</span><input id="calc-dd" type="number" inputmode="decimal" min="0" value="'+dd+'" data-on="calcDD"></label>';
  h+='<div class="calc-res"><div class="stat"><div class="l">Straight wins needed</div><div class="v" id="rec-need">'+(isFinite(need)?need:'—')+'</div><div class="tiny muted">at '+fmt$(W)+' per win ('+n+' acct)</div></div>'+
     '<div class="stat"><div class="l">Trades at this win rate</div><div class="v" id="rec-trades">'+(exp==null?'—':exp<=0?'∞':Math.ceil(dd/exp))+'</div><div class="tiny muted">'+(exp==null?'enter a sequence':exp<=0?'negative expectancy — not recoverable':'expectancy '+fmt$(exp,true)+'/trade')+'</div></div></div>';
  h+='<div class="tiny muted" style="margin-top:8px">Each extra loss adds '+(W>0?(L/W).toFixed(2):'—')+' wins to the recovery (1 loss = '+fmt$(L)+', 1 win = '+fmt$(W)+').</div>';
  return h}
