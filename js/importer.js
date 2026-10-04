// importer.js
import { $, fmt$, norm, num, pad, r2, uid } from './util.js';
import { S, recompute, setState } from './state.js';
import { byLineup, createAccount, statusLabel } from './model.js';

export function parseDateToken(s){s=String(s).trim().replace(/^date\s*[:=]?\s*/i,'').replace(/[:\s]+$/,'');var m;
  if((m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)))return m[1]+'-'+pad(m[2])+'-'+pad(m[3]);
  if((m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/))){var y=+m[3];if(y<100)y+=2000;return y+'-'+pad(m[1])+'-'+pad(m[2])}
  return null}
export function parseImport(text,defDate){
  text=String(text||'').trim();var blocks=[],errors=[];
  if(!text)return {blocks:blocks,errors:['Nothing to import']};
  if(/^[\[{]/.test(text)){
    var o;try{o=JSON.parse(text)}catch(e){return {blocks:[],errors:['Invalid JSON: '+e.message]}}
    var toLine=function(x){return {name:String(x.name||x.account||'').trim(),balance:num(x.balance),firm:x.firm||null,type:x.type||null}};
    var addBlock=function(b){var lines=(b.accounts||b.lines||b.balances||[]).map(toLine),hd=parseDateToken(b.date||'');blocks.push({date:hd||defDate,lines:lines,hdr:!!hd})};
    if(Array.isArray(o)){if(o.length&&o[0]&&(o[0].accounts||o[0].lines||o[0].balances))o.forEach(addBlock);else blocks.push({date:defDate,lines:o.map(toLine)})}
    else if(o.imports)o.imports.forEach(addBlock);else addBlock(o);
  }else{
    var cur=null;text.split(/\r?\n/).forEach(function(raw,ln){var line=raw.trim();if(!line||line[0]==='#')return;
      var d=parseDateToken(line);if(d){cur={date:d,lines:[],hdr:true};blocks.push(cur);return}
      var m=line.match(/^(.+?)\s*[,\t;:|=]\s*(\(?-?\s*\$?\s*-?[\d,]*\.?\d+\)?)\s*$/)||line.match(/^(.+?)\s+(\(?-?\$?-?[\d,]*\.?\d+\)?)$/);
      if(!m){errors.push('Line '+(ln+1)+': could not read "'+line+'"');return}
      if(!cur){cur={date:defDate,lines:[]};blocks.push(cur)}
      cur.lines.push({name:m[1].trim().replace(/[,;:]$/,''),balance:num(m[2])})});
  }
  blocks.forEach(function(b,bi){b.lines=b.lines.filter(function(l,i){var ok=l.name&&isFinite(l.balance);if(!ok)errors.push('List '+(bi+1)+' line '+(i+1)+': missing name or balance');return ok});if(!b.date)errors.push('List '+(bi+1)+': no date')});
  blocks=blocks.filter(function(b){return b.lines.length&&b.date});
  blocks.sort(function(a,b){return a.date<b.date?-1:a.date>b.date?1:0});
  return {blocks:blocks,errors:errors}}
export function guessFirm(name){var n=norm(name),f=S.settings.firms;
  for(var i=0;i<f.length;i++){var fn=norm(f[i].name);if(n.indexOf(fn)>=0)return f[i].name;var ab=fn.split(' ').map(function(w){return w[0]}).join('');if(ab.length>1&&new RegExp('\\b'+ab+'\\b').test(n))return f[i].name}
  var pick=function(re){return (f.find(function(x){return re.test(x.name)})||f[0]||{}).name};
  if(/\btdy\b|tradeify/.test(n))return pick(/tradeify/i);
  if(/\bluc/.test(n))return pick(/lucid/i);
  return (f[0]||{}).name}
export function prevBal(a,date){var h=a.history.filter(function(x){return x.date<date&&x.src!=='start'});if(!h.length)h=a.history.filter(function(x){return x.date<date});if(h.length)return h[h.length-1].balance;return a.history.length?a.history[a.history.length-1].balance:a.startBalance}
/* Matching: (1) same lineup position + balance continuity + same name, (2) same position + continuity, (3) name + continuity, (4) name only (flagged).
   Every existing record (incl. passed/blown) is a candidate, each record is used at most once -> no duplicates.
   Unmatched lines are only created when explicitly confirmed. */
export function matchBlock(st,block,decisions,bi,meta){
  var impId=uid();meta=meta||{};
  var tol=+st.settings.continuityTol||2500;
  var cands=st.accounts.filter(function(a){return !a.removed});
  var used={};var rows=block.lines.map(function(l,i){return {i:i,name:l.name,balance:r2(l.balance),firm:l.firm,type:l.type,acct:null,reason:'',flags:[]}});
  var lineNames={};rows.forEach(function(r){lineNames[norm(r.name)]=1});
  var cont=function(a,bal){return Math.abs(bal-prevBal(a,block.date))<=tol};
  var free=function(a){return !used[a.id]};
  var byName=function(n){return cands.filter(function(a){return norm(a.name)===norm(n)&&free(a)})};
  var take=function(r,a,why){r.acct=a;used[a.id]=1;r.reason=why};
  rows.forEach(function(r){var a=cands.find(function(a){return free(a)&&a.lineupIndex===r.i&&norm(a.name)===norm(r.name)&&cont(a,r.balance)});if(a)take(r,a,'position + balance continuity + name')});
  /* position-only matches (name differs) are limited to ACTIVE records so a new account can't silently land on a blown/passed one */
  rows.forEach(function(r){if(r.acct)return;var a=cands.find(function(a){return free(a)&&a.status==='active'&&a.lineupIndex===r.i&&cont(a,r.balance)});
    if(a&&!lineNames[norm(a.name)]&&!byName(r.name).length){take(r,a,'position + balance continuity');r.flags.push('Name differs from record "'+a.name+'" — record name kept')}});
  rows.forEach(function(r){if(r.acct)return;var a=byName(r.name).find(function(a){return cont(a,r.balance)});if(a){take(r,a,'name + balance continuity');if(a.lineupIndex!==r.i)r.flags.push('Lineup position moved #'+(a.lineupIndex+1)+' → #'+(r.i+1))}});
  rows.forEach(function(r){if(r.acct)return;var a=byName(r.name)[0];if(a){take(r,a,'name only');r.flags.push('Balance jump of '+fmt$(r.balance-prevBal(a,block.date),true)+' vs previous — verify against screenshot')}});
  var isNewest=!st.lastImportDate||block.date>=st.lastImportDate;
  rows.forEach(function(r){
    if(r.acct){var a=r.acct;r.oldBal=prevBal(a,block.date);r.acctName=a.name;r.acctId=a.id;r.acctStatus=statusLabel(a);
      if(a.status!=='active')r.flags.push('Record is '+a.status+' — balance history updated, status unchanged (one-way)');
      var obsH=a.history.filter(function(h){return h.src!=='start'}),latest=obsH.length?obsH[obsH.length-1].date:null;
      if(latest&&latest>block.date)r.flags.push('Older than latest record ('+latest+') — history only');
      var ex=a.history.find(function(h){return h.date===block.date&&h.src!=='start'});if(ex){r.prev={balance:ex.balance,src:ex.src,imp:ex.imp||null};ex.balance=r.balance;ex.src='import';ex.imp=impId}else a.history.push({date:block.date,balance:r.balance,src:'import',imp:impId});
      recompute(a);r.newBal=a.balance;
    }else{
      var key=bi+':'+r.i,dec=decisions[key]||{confirm:false,firm:(r.firm&&st.settings.firms.some(function(f){return f.name===r.firm}))?r.firm:guessFirm(r.name),type:r.type==='funded'?'funded':'evaluation',start:st.settings.startBalance};
      r.isNew=true;r.key=key;r.dec=dec;
      if(dec.confirm){var na=createAccountIn(st,{name:r.name,firm:dec.firm,type:dec.type,startBalance:+dec.start||st.settings.startBalance,initialBalance:r.balance,date:block.date});na.history.forEach(function(h){if(h.src==='import')h.imp=impId});r.acct=na;r.acctId=na.id;r.created=true;r.newBal=na.balance}
    }});
  var lineup=null,prevLineup=null,prevLast=st.lastImportDate||null;
  if(isNewest){prevLineup={};st.accounts.forEach(function(a){prevLineup[a.id]=a.lineupIndex});var order=[];rows.forEach(function(r){if(r.acct&&order.indexOf(r.acct)<0)order.push(r.acct)});
    var all=st.accounts.filter(function(a){return !a.removed});
    var rest=byLineup(all.filter(function(a){return order.indexOf(a)<0}));order.concat(rest).forEach(function(a,i){a.lineupIndex=i});st.lastImportDate=block.date;
    lineup=order.map(function(a){return a.name})}
  var rec={id:impId,date:block.date,appliedAt:new Date().toISOString(),setLineup:isNewest,prevLineup:prevLineup,prevLastImportDate:prevLast,
    dateSource:block.hdr?'list':(meta.dateSource||'today'),lines:rows.map(function(r){return {name:r.name,balance:r.balance,accountId:r.acctId||null,result:r.created?'created':r.acct?'matched':'skipped',reason:r.reason,prev:r.prev||null}})};
  ['image','thumb','fileName','photoDate','fileDate'].forEach(function(k){if(meta[k])rec[k]=meta[k]});st.imports.push(rec);
  return {date:block.date,rows:rows,lineup:lineup}}
export function createAccountIn(st,o){var keep=S;setState(st);try{var a=createAccount(o);a.lineupIndex=1000+st.accounts.length;st.accounts.push(a);return a}finally{setState(keep)}}
/* meta = {image, thumb, fileName, photoDate, fileDate, dateSource}; the photo belongs to the last (newest) block */
export function runImport(st,blocks,decisions,meta){meta=meta||{};return blocks.map(function(b,bi){return matchBlock(st,b,decisions,bi,bi===blocks.length-1?meta:{dateSource:meta.dateSource})})}
