// demo.js
import { DEFAULT_BEHAVIORS, FIRM_PRESETS } from './config.js';
import { addDays, clone, ds } from './util.js';
import { S, defaults, recompute, setState } from './state.js';
import { refreshPending } from './model.js';

function tradePnl_(t){return t.entries.reduce(function(s,e){return s+e.pnl},0)}
export function demoData(){
  var st=defaults();st.demo=true;st.onboarded=true;st.settings=clone(S.settings);var seed=20261003;var rnd=function(){seed=seed+0x6D2B79F5|0;var t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296};
  var today=new Date(),t0=addDays(new Date(today.getFullYear(),today.getMonth(),today.getDate()),-48);
  var defs=[['TPT-F 4817','Take Profit Trader','funded',0,null],['TDY-F 2290','Tradeify','funded',0,null],['LUC-E 7731','Lucid','evaluation',0,null],['TPT-E 5102','Take Profit Trader','evaluation',6,null],['TDY-E 3365','Tradeify','evaluation',30,null],['LUC-F 1180','Lucid','funded',0,['blown',16]],['TPT-E 0457','Take Profit Trader','evaluation',0,['passed',24]]];
  defs.forEach(function(d){if(!st.settings.firms.some(function(f){return f.name===d[1]})){var p=FIRM_PRESETS.find(function(f){return f.name===d[1]});st.settings.firms.push({name:d[1],buffer:p?p.buffer:1000})}}); /* demo firms are added if the user didn't pick them */
  var accts=defs.map(function(d,i){return {id:'demo'+i,name:d[0],firm:d[1],type:d[2],status:'active',startBalance:25000,lineupIndex:i,history:[{date:ds(addDays(t0,d[3])),balance:25000,src:'start'}],events:[],from:d[3],end:d[4],bal:25000}});
  var notes=['Waited for the retest, clean fill.','Took it early before confirmation.','Fought the magnet line into VWAP.','Hesitated on the A+, got in late.','Chased after missing the first move.','Textbook setup, held to target.','Scratched it at entry — flat.','Over-filtered and missed the clean entry.'];
  var trades=[];
  var wdays=[];for(var wi=0;wi<=48;wi++){var wd_=addDays(t0,wi).getDay();if(wd_&&wd_!==6)wdays.push(wi)}var beDi=wdays[wdays.length-3]; /* a break-even trade 3 trading days ago */
  for(var di=0;di<=48;di++){var d=addDays(t0,di),dw=d.getDay();if(dw===0||dw===6)continue;var dS=ds(d);
    var live=accts.filter(function(a){return di>=a.from&&!(a.end&&di>a.end[1])});var nT=rnd()<.35?2:1;
    for(var k=0;k<nT;k++){var r=rnd(),kind=(di===beDi&&k===nT-1)?'B':r<.52?'W':r<.8?'L':r<.9?'B':'P',entries=[],pp=Math.round(150+rnd()*300)*(rnd()<.5?-1:1);
      live.forEach(function(a){if(a.type!=='funded'&&rnd()<.15)return;var p=kind==='W'?750:kind==='L'?-500:kind==='B'?Math.round(rnd()*30-15):pp;
        if(a.end&&a.end[0]==='blown'&&di>=a.end[1]-4)p=-500;entries.push({accountId:a.id,pnl:p,type:a.type});a.bal+=p});
      if(!entries.length)continue;
      var ni=kind==='W'?(rnd()<.6?0:5):kind==='L'?[1,2,3,4,7][Math.floor(rnd()*5)]:kind==='B'?6:Math.floor(rnd()*8);
      var tags=[];if(ni===3)tags.push(DEFAULT_BEHAVIORS[0]);if(ni===4)tags.push(DEFAULT_BEHAVIORS[1]);if(ni===2)tags.push(DEFAULT_BEHAVIORS[2]);if(ni===7)tags.push(DEFAULT_BEHAVIORS[3]);
      trades.push({id:'dt'+trades.length,date:dS,entries:entries,grade:kind==='W'?(rnd()<.6?'A':'B'):kind==='L'?['B','C','D'][Math.floor(rnd()*3)]:'C',notes:notes[ni],be:kind==='B',beManual:false,tags:tags,custom:[]})}
    live.forEach(function(a){var last=a.history[a.history.length-1];if(last.date===dS)last.balance=a.bal;else a.history.push({date:dS,balance:a.bal,src:'demo'})})}
  /* deterministic demo patterns: Hesitated 3 · Forced 2 · Magnet 6 · Filters 2 on the newest losing/partial trades,
     plus custom labels "Chased the open" ×2 (→ box suggestion) and "Moved stop early" ×1 (pending) */
  var PNOTE={0:'Hesitated on the A+, got in late.',1:'Chased after missing the first move — forced one.',2:'Fought the magnet line into VWAP.',3:'Over-filtered and missed the clean entry.'};
  trades.forEach(function(t){t.tags=[];if(!t.be&&/Hesitated|Chased|magnet|filtered/.test(t.notes))t.notes=tradePnl_(t)<0?'Took it early before confirmation.':'Waited for the retest, clean fill.'});
  var newest=trades.length?trades[trades.length-1].date:'',cand=trades.filter(function(t){return !t.be&&tradePnl_(t)<0}).reverse().concat(trades.filter(function(t){return !t.be&&tradePnl_(t)>=0&&t.date!==newest}).reverse()),seq=[2,0,2,1,2,0,3,2,0,1,2,3,2];
  seq.forEach(function(bi,i){var t=cand[i];if(!t)return;t.tags=[DEFAULT_BEHAVIORS[bi]];t.notes=PNOTE[bi]});
  var rest=cand.slice(seq.length);[['Chased the open',rest[0]],['Chased the open',rest[1]],['Moved stop early',rest[2]]].forEach(function(x){if(x[1]){x[1].custom.push(x[0]);x[1].notes=x[0]==='Moved stop early'?'Moved my stop to break-even too early.':'Chased the open, no setup.'}});
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
  /* demo screenshot imports: the last 4 trading days; each one owns (tags) that day's balance points */
  var days=[];for(var back=0;days.length<4&&back<10;back++){var dd=addDays(new Date(today.getFullYear(),today.getMonth(),today.getDate()),-back);if(dd.getDay()%6)days.push(ds(dd))}
  var meta=[{file:'IMG_2822.jpeg',src:'photo'},{file:'IMG_2804.jpeg',src:'manual'},{file:'IMG_2791.jpeg',src:'photo'},{file:null,src:'list'}];
  st.imports=days.map(function(dS,k){var id='demoimp'+k,lines=[];
    accts.forEach(function(a){var p=a.history.find(function(h){return h.date===dS&&h.src!=='start'});if(!p)return;p.imp=id;lines.push({name:a.name,balance:p.balance,accountId:a.id,result:'matched',reason:'demo',prev:null})});
    var m=meta[k],im={id:id,date:dS,appliedAt:new Date(Date.now()-k*864e5).toISOString(),setLineup:k===0,dateSource:m.src,lines:lines};
    if(m.file){im.fileName=m.file;im.thumb=demoThumb(lines.reduce(function(s,l){return s+l.balance},0));if(m.src==='photo')im.photoDate=dS}
    return im}).filter(function(im){return im.lines.length});
  st.news=S.news;var keep=S;setState(st);refreshPending();setState(keep);return st}

/* tiny generated 'broker screenshot' thumbnail for demo imports (canvas; skipped where unavailable) */
export function demoThumb(total){try{var c=document.createElement('canvas');c.width=96;c.height=120;var g=c.getContext('2d');if(!g)return null;
  var gr=g.createLinearGradient(0,0,0,120);gr.addColorStop(0,'#123a8c');gr.addColorStop(1,'#0b2a6e');g.fillStyle=gr;g.fillRect(0,0,96,120);
  g.fillStyle='rgba(255,255,255,.85)';g.font='bold 8px sans-serif';g.fillText('Account balance',8,16);
  g.fillStyle='#3ddc84';g.font='bold 15px sans-serif';g.fillText('$'+Math.round(total/1000)+'k',8,36);
  g.fillStyle='rgba(255,255,255,.25)';for(var i=0;i<5;i++)g.fillRect(8,50+i*13,80-(i%2)*22,5);
  return c.toDataURL('image/jpeg',.7)}catch(e){return null}}
