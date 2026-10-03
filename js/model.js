// model.js
import { norm, r2, todayS, uid } from './util.js';
import { S, firmBuf, recompute } from './state.js';

export function stopOf(a){var b=firmBuf(a.firm);return Math.min(Math.max(a.peak-b,a.startBalance-b),a.startBalance)}
export function cushionOf(a){return r2(a.balance-stopOf(a))}
export function liveAccts(){return S.accounts.filter(function(a){return !a.removed})}
export function byLineup(list){return list.slice().sort(function(a,b){return a.lineupIndex-b.lineupIndex})}
export function activeAccts(){return byLineup(liveAccts().filter(function(a){return a.status==='active'}))}
export function orderedActive(){var a=activeAccts();return a.filter(function(x){return x.type==='funded'}).concat(a.filter(function(x){return x.type!=='funded'}))}
export function acctById(id){return S.accounts.find(function(a){return a.id===id})}
export function acctLabel(a){return (a.type==='funded'?'F ':'')+a.name}
export function inView(type,view){return view==='both'||(view==='funded'?type==='funded':type!=='funded')}
export function nextLineup(){return liveAccts().reduce(function(m,a){return Math.max(m,a.lineupIndex+1)},0)}
export function reindexLineup(){byLineup(liveAccts()).forEach(function(a,i){a.lineupIndex=i})}
export function createAccount(o){
  var start=+o.startBalance||S.settings.startBalance;
  var a={id:uid(),name:String(o.name).trim(),firm:o.firm,type:o.type==='funded'?'funded':'evaluation',status:'active',startBalance:start,
    lineupIndex:(o.lineupIndex!=null?o.lineupIndex:nextLineup()),history:[{date:o.date||todayS(),balance:start,src:'start'}],events:[{date:todayS(),what:'created'}],createdAt:new Date().toISOString()};
  if(o.initialBalance!=null&&o.date)a.history=[{date:o.date,balance:r2(o.initialBalance),src:'import'}];
  recompute(a);return a}
/* one-way status machine: evaluation/active -> funded (type) | passed ; funded/active -> blown ; nothing else */
export function allowedTransitions(a){
  if(!a||a.removed||a.status!=='active')return [];
  if(a.type==='evaluation')return [{key:'funded',label:'Mark funded',set:{type:'funded'}},{key:'passed',label:'Mark passed',set:{status:'passed'}}];
  return [{key:'blown',label:'Mark blown',set:{status:'blown'}}];
}
export function transition(a,key){
  var t=allowedTransitions(a).find(function(x){return x.key===key});
  if(!t)throw new Error('Transition not allowed: '+(a&&a.type)+'/'+(a&&a.status)+' -> '+key);
  Object.assign(a,t.set);a.events.push({date:todayS(),what:key});return true}
export function statusLabel(a){return a.removed?'removed':a.status==='active'?(a.type==='funded'?'funded':'evaluation'):a.status}
export function tradePnl(t,view){return r2(t.entries.reduce(function(s,e){return s+(inView(e.type,view||'both')?e.pnl:0)},0))}
export function tradeInView(t,view){return t.entries.some(function(e){return inView(e.type,view)})}
export function record(view){var w=0,l=0,be=0;S.trades.forEach(function(t){if(!tradeInView(t,view))return;if(t.be){be++;return}var p=tradePnl(t,view);if(p>0)w++;else if(p<0)l++});return {w:w,l:l,be:be,wr:(w+l)?w/(w+l):null}}
export function dayMap(view){var m={};S.trades.forEach(function(t){if(!tradeInView(t,view))return;var d=m[t.date]||(m[t.date]={pnl:0,n:0});d.pnl=r2(d.pnl+tradePnl(t,view));d.n++});return m}
export function suggestBE(entries){if(!entries.length)return false;var avg=entries.reduce(function(s,e){return s+e.pnl},0)/entries.length;return Math.abs(avg)<=S.settings.beThreshold}
export function refreshPending(){
  var known={};S.behaviors.forEach(function(b){known[norm(b)]=1});
  var m={};S.trades.forEach(function(t){var seen={};(t.custom||[]).forEach(function(c){var k=norm(c);if(!k||known[k]||seen[k])return;seen[k]=1;(m[k]||(m[k]={label:c.trim(),count:0})).count++})});
  S.pendingBehaviors=Object.keys(m).map(function(k){return m[k]}).sort(function(a,b){return b.count-a.count});
}
export function createBehavior(label){
  label=label.trim();var k=norm(label);
  var pend=S.pendingBehaviors.find(function(p){return norm(p.label)===k});if(!pend||pend.count<2)return false; /* only after >=2 notes */
  if(!S.behaviors.some(function(b){return norm(b)===k}))S.behaviors.push(label);
  S.trades.forEach(function(t){var hit=false;t.custom=t.custom.filter(function(c){if(norm(c)===k){hit=true;return false}return true});if(hit&&t.tags.indexOf(label)<0)t.tags.push(label)});
  refreshPending();return true}
