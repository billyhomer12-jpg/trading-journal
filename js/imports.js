// imports.js — screenshot import records: day P&L, undo, date correction, photo dates.
// Integrity: an import only ever adds/overwrites balance points tagged with its id (h.imp).
// Undo removes exactly those points (restoring any value it overwrote); moving a date moves
// those points plus the journal entry of that day for the same accounts. Nothing else changes.
import { r2 } from './util.js';
import { S, recompute } from './state.js';
import { acctById } from './model.js';
import { prevBal } from './importer.js';

export var DATE_SOURCES={photo:'Date from photo',file:'Date from file',list:'Date from balance list',manual:'Date set manually',today:'Date = import day'};
export function dateSourceLabel(im){return DATE_SOURCES[im.dateSource]||'Date from import'}
/* the balance point an import wrote for an account (tagged; legacy imports matched by date + balance) */
export function pointOf(im,line){var a=line.accountId&&acctById(line.accountId);if(!a)return null;
  return a.history.find(function(h){return h.imp===im.id})||a.history.find(function(h){return !h.imp&&h.src==='import'&&h.date===im.date&&h.balance===line.balance})||null}
export function importLines(im){return im.lines.filter(function(l){return l.accountId&&l.result!=='skipped'&&acctById(l.accountId)})}
export function importAcctIds(im){var o=[];importLines(im).forEach(function(l){if(o.indexOf(l.accountId)<0)o.push(l.accountId)});return o}
/* Day P&L = Σ (balance this import recorded − the account's previous balance before that day) */
export function importDayPnl(im){return r2(importLines(im).reduce(function(s,l){var a=acctById(l.accountId),p=pointOf(im,l);if(!p)return s;return s+(p.balance-prevBal(a,im.date))},0))}
export function importsByDate(){return S.imports.slice().sort(function(a,b){return a.date<b.date?1:a.date>b.date?-1:(a.appliedAt||'')<(b.appliedAt||'')?1:-1})}
/* journal trades that belong to this import's day: same date, and every entry is for one of its accounts */
export function journalFor(im,date){var ids=importAcctIds(im);return S.trades.filter(function(t){return t.date===(date||im.date)&&t.entries.length&&t.entries.every(function(e){return ids.indexOf(e.accountId)>=0})})}

export function undoImport(id){
  var i=S.imports.findIndex(function(x){return x.id===id});if(i<0)return null;var im=S.imports[i],removed=0,restored=0,deleted=[];
  im.lines.forEach(function(l){var a=l.accountId&&acctById(l.accountId);if(!a)return;var p=pointOf(im,l);if(!p)return;
    if(l.prev){p.balance=l.prev.balance;p.src=l.prev.src;if(l.prev.imp)p.imp=l.prev.imp;else delete p.imp;restored++}else{a.history.splice(a.history.indexOf(p),1);removed++}
    /* an account this import created is removed again if nothing else refers to it */
    if(l.result==='created'&&!a.history.some(function(h){return h.src!=='start'})&&!S.trades.some(function(t){return t.entries.some(function(e){return e.accountId===a.id})})&&!S.payouts.some(function(p){return p.accountId===a.id})){S.accounts.splice(S.accounts.indexOf(a),1);deleted.push(a.name);return}
    if(!a.history.length)a.history.push({date:im.date,balance:a.startBalance,src:'start'});
    recompute(a)});
  S.imports.splice(i,1);
  /* lineup: only restored when this was the newest import that set it */
  var later=S.imports.some(function(x){return x.setLineup&&(x.appliedAt||'')>(im.appliedAt||'')});
  if(im.setLineup&&im.prevLineup&&!later){S.accounts.forEach(function(a){if(a.id in im.prevLineup)a.lineupIndex=im.prevLineup[a.id]});S.lastImportDate=im.prevLastImportDate||null}
  return {removed:removed,restored:restored,deletedAccounts:deleted}}

export function planMove(id,date){var im=S.imports.find(function(x){return x.id===id});if(!im||!date)return null;
  var conflicts=[],points=0;
  importLines(im).forEach(function(l){var a=acctById(l.accountId),p=pointOf(im,l);if(!p)return;points++;
    var other=a.history.find(function(h){return h!==p&&h.date===date&&h.src!=='start'});if(other)conflicts.push(a.name)});
  return {im:im,from:im.date,to:date,points:points,trades:journalFor(im),conflicts:conflicts}}
export function moveImport(id,date){var pl=planMove(id,date);if(!pl)return null;if(pl.conflicts.length||pl.from===date)return pl;var im=pl.im;
  importLines(im).forEach(function(l){var a=acctById(l.accountId),p=pointOf(im,l);if(!p)return;
    if(l.prev){/* give the old day back its overwritten value; this import's value moves */
      p.balance=l.prev.balance;p.src=l.prev.src;if(l.prev.imp)p.imp=l.prev.imp;else delete p.imp;l.prev=null;a.history.push({date:date,balance:l.balance,src:'import',imp:im.id})}
    else{p.date=date;p.imp=im.id}
    recompute(a)});
  pl.trades.forEach(function(t){t.date=date});
  im.date=date;im.dateSource='manual';im.movedAt=new Date().toISOString();
  S.lastImportDate=S.imports.reduce(function(m,x){return !m||x.date>m?x.date:m},null);
  pl.moved=true;return pl}

/* ---- photo dates: EXIF DateTimeOriginal / DateTime from JPEG bytes ---- */
export function exifDate(buf){try{var v=new DataView(buf);if(v.getUint16(0)!==0xFFD8)return null;var o=2;
  while(o<v.byteLength-4){var m=v.getUint16(o);if(m===0xFFE1){var st=o+4;if(v.getUint32(st)!==0x45786966)return null;var t=st+6,le=v.getUint16(t)===0x4949;
      var u16=function(x){return v.getUint16(x,le)},u32=function(x){return v.getUint32(x,le)};
      var readIfd=function(off){var n=u16(t+off),r={};for(var k=0;k<n;k++){var e=t+off+2+k*12;r[u16(e)]={type:u16(e+2),count:u32(e+4),val:e+8}}return r};
      var str=function(ent){if(!ent)return null;var p=ent.count>4?t+u32(ent.val):ent.val,s='';for(var q=0;q<ent.count-1;q++)s+=String.fromCharCode(v.getUint8(p+q));return s};
      var ifd0=readIfd(u32(t+4)),dt=null;if(ifd0[0x8769]){var ex=readIfd(u32(ifd0[0x8769].val));dt=str(ex[0x9003])||str(ex[0x9004])}dt=dt||str(ifd0[0x0132]);
      var mm=dt&&dt.match(/^(\d{4}):(\d{2}):(\d{2})/);return mm?mm[1]+'-'+mm[2]+'-'+mm[3]:null}
    if((m&0xFF00)!==0xFF00)return null;o+=2+v.getUint16(o+2)}}catch(e){}return null}
/* Recheck: imports whose photo carried an EXIF date (read at import time) but whose date differs and wasn't set by hand */
export function recheckCandidates(){return S.imports.filter(function(im){return im.photoDate&&im.dateSource!=='manual'&&im.photoDate!==im.date})}
export function moveSummary(pl){return pl.points+' balance point'+(pl.points===1?'':'s')+' and '+pl.trades.length+' journal entr'+(pl.trades.length===1?'y':'ies')}
