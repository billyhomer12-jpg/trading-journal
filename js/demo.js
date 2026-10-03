// demo.js
import { DEFAULT_BEHAVIORS, FIRM_PRESETS } from './config.js';
import { addDays, clone, ds } from './util.js';
import { S, defaults, recompute, setState } from './state.js';
import { refreshPending } from './model.js';

export function demoData(){
  var st=defaults();st.demo=true;st.onboarded=true;st.settings=clone(S.settings);var seed=20261003;var rnd=function(){seed=seed+0x6D2B79F5|0;var t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296};
  var today=new Date(),t0=addDays(new Date(today.getFullYear(),today.getMonth(),today.getDate()),-48);
  var defs=[['TPT-F 4817','Take Profit Trader','funded',0,null],['TDY-F 2290','Tradeify','funded',0,null],['LUC-E 7731','Lucid','evaluation',0,null],['TPT-E 5102','Take Profit Trader','evaluation',6,null],['TDY-E 3365','Tradeify','evaluation',30,null],['LUC-F 1180','Lucid','funded',0,['blown',16]],['TPT-E 0457','Take Profit Trader','evaluation',0,['passed',24]]];
  defs.forEach(function(d){if(!st.settings.firms.some(function(f){return f.name===d[1]})){var p=FIRM_PRESETS.find(function(f){return f.name===d[1]});st.settings.firms.push({name:d[1],buffer:p?p.buffer:1000})}}); /* demo firms are added if the user didn't pick them */
  var accts=defs.map(function(d,i){return {id:'demo'+i,name:d[0],firm:d[1],type:d[2],status:'active',startBalance:25000,lineupIndex:i,history:[{date:ds(addDays(t0,d[3])),balance:25000,src:'start'}],events:[],from:d[3],end:d[4],bal:25000}});
  var notes=['Waited for the retest, clean fill.','Took it early before confirmation.','Fought the magnet line into VWAP.','Hesitated on the A+, got in late.','Chased after missing the first move.','Textbook setup, held to target.','Scratched it at entry — flat.','Over-filtered and missed the clean entry.'];
  var trades=[];
  for(var di=0;di<=48;di++){var d=addDays(t0,di),dw=d.getDay();if(dw===0||dw===6)continue;var dS=ds(d);
    var live=accts.filter(function(a){return di>=a.from&&!(a.end&&di>a.end[1])});var nT=rnd()<.35?2:1;
    for(var k=0;k<nT;k++){var r=rnd(),kind=r<.52?'W':r<.8?'L':r<.9?'B':'P',entries=[],pp=Math.round(150+rnd()*300)*(rnd()<.5?-1:1);
      live.forEach(function(a){if(a.type!=='funded'&&rnd()<.15)return;var p=kind==='W'?750:kind==='L'?-500:kind==='B'?Math.round(rnd()*30-15):pp;
        if(a.end&&a.end[0]==='blown'&&di>=a.end[1]-4)p=-500;entries.push({accountId:a.id,pnl:p,type:a.type});a.bal+=p});
      if(!entries.length)continue;
      var ni=kind==='W'?(rnd()<.6?0:5):kind==='L'?[1,2,3,4,7][Math.floor(rnd()*5)]:kind==='B'?6:Math.floor(rnd()*8);
      var tags=[];if(ni===3)tags.push(DEFAULT_BEHAVIORS[0]);if(ni===4)tags.push(DEFAULT_BEHAVIORS[1]);if(ni===2)tags.push(DEFAULT_BEHAVIORS[2]);if(ni===7)tags.push(DEFAULT_BEHAVIORS[3]);
      trades.push({id:'dt'+trades.length,date:dS,entries:entries,grade:kind==='W'?(rnd()<.6?'A':'B'):kind==='L'?['B','C','D'][Math.floor(rnd()*3)]:'C',notes:notes[ni],be:kind==='B',beManual:false,tags:tags,custom:[]})}
    live.forEach(function(a){var last=a.history[a.history.length-1];if(last.date===dS)last.balance=a.bal;else a.history.push({date:dS,balance:a.bal,src:'demo'})})}
  trades.filter(function(t){return /Chased/.test(t.notes)}).slice(0,2).forEach(function(t){t.custom.push('Chased the open')});
  var lm=trades.filter(function(t){return /early/.test(t.notes)});if(lm[0])lm[0].custom.push('Moved stop early');
  accts.forEach(function(a){if(a.end){a.status=a.end[0];a.events.push({date:ds(addDays(t0,a.end[1])),what:a.end[0]})}delete a.from;delete a.end;delete a.bal;recompute(a)});
  st.accounts=accts;st.trades=trades;st.lastImportDate=ds(today);
  /* demo payouts (records only — balances above are untouched) */
  var pd_=function(n){return ds(addDays(t0,n))};
  st.payouts=[{id:'dp1',date:pd_(20),accountId:'demo0',firm:'Take Profit Trader',share:80,requested:1500,received:1200,status:'paid',notes:'First payout'},
    {id:'dp2',date:pd_(38),accountId:'demo0',firm:'Take Profit Trader',share:80,requested:2000,received:1600,status:'paid',notes:''},
    {id:'dp3',date:pd_(30),accountId:'demo1',firm:'Tradeify',share:90,requested:1000,received:900,status:'paid',notes:''},
    {id:'dp4',date:pd_(46),accountId:'demo1',firm:'Tradeify',share:90,requested:1500,received:1350,status:'requested',notes:'Awaiting approval'},
    {id:'dp5',date:pd_(14),accountId:'demo5',firm:'Lucid',share:90,requested:800,received:0,status:'denied',notes:'Consistency rule'}];
  accts[0].nextPayoutDate=pd_(52);accts[1].nextPayoutDate=pd_(47);
  st.imports=[{id:'demoimp',date:ds(today),appliedAt:new Date().toISOString(),setLineup:true,lines:accts.filter(function(a){return a.status==='active'}).map(function(a){return {name:a.name,balance:a.balance,accountId:a.id,result:'matched',reason:'demo'}})}];
  st.news=S.news;var keep=S;setState(st);refreshPending();setState(keep);return st}
