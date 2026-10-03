// state.js
import { DEFAULT_BEHAVIORS, FIRM_PRESETS, LS, LSU } from './config.js';
import { norm, r2, uid } from './util.js';
import { toast } from './ui.js';

export function defaults(){return {app:'trading-journal',version:2,demo:false,onboarded:false,
  settings:{firms:FIRM_PRESETS.map(function(f){return Object.assign({},f)}),
    startBalance:25000,riskPts:100,targetPts:150,dollarsPerPoint:5,beThreshold:25,continuityTol:2500},
  accounts:[],trades:[],imports:[],payouts:[],behaviors:DEFAULT_BEHAVIORS.slice(),dismissedBehaviors:[],pendingBehaviors:[],
  lastImportDate:null,news:{fetchedAt:null,source:null,events:[]}}}
export function normalize(o){
  var s=Object.assign(defaults(),o||{});
  s.settings=Object.assign(defaults().settings,(o&&o.settings)||{});
  if(!Array.isArray(s.settings.firms))s.settings.firms=defaults().settings.firms;
  s.settings.firms.forEach(fillFirm);
  ['accounts','trades','imports','payouts','behaviors','dismissedBehaviors','pendingBehaviors'].forEach(function(k){if(!Array.isArray(s[k]))s[k]=defaults()[k]});
  if(!s.news||!Array.isArray(s.news.events))s.news=defaults().news;
  /* data from older builds (no flag) counts as already set up if it has any records */
  if(o&&typeof o.onboarded!=='boolean')s.onboarded=!!((o.accounts&&o.accounts.length)||(o.trades&&o.trades.length));
  s.accounts.forEach(function(a){a.history=Array.isArray(a.history)?a.history:[];a.events=a.events||[];if(!a.startBalance)a.startBalance=s.settings.startBalance;recompute(a)});
  s.trades.forEach(function(t){t.entries=t.entries||[];t.tags=t.tags||[];t.custom=t.custom||[];if(!t.id)t.id=uid()});
  return s}
export function load(){try{var raw=localStorage.getItem(LS);if(raw)return normalize(JSON.parse(raw))}catch(e){console.warn('Could not load saved data',e)}return defaults()}
export var S=load();
export var ui=Object.assign({tab:'overview',view:'both',cal:null,theme:'auto',calc:{n:1,mode:'seq',seq:'WWLWL',days:3,perDay:[],dd:2500}},(function(){try{return JSON.parse(localStorage.getItem(LSU))||{}}catch(e){return {}}})());
export function save(){try{localStorage.setItem(LS,JSON.stringify(S));return true}catch(e){toast('Storage full — remove screenshot images or export & clear',true);return false}}
export function setState(x){S=x}
export function saveUi(){try{localStorage.setItem(LSU,JSON.stringify(ui))}catch(e){}}
export function riskUsd(){return S.settings.riskPts*S.settings.dollarsPerPoint}
export function targetUsd(){return S.settings.targetPts*S.settings.dollarsPerPoint}
export function firmBuf(name){var f=S.settings.firms.find(function(f){return f.name===name});return f?+f.buffer:0}
export function recompute(a){
  a.history.sort(function(x,y){return x.date<y.date?-1:x.date>y.date?1:((x.src==='start')-(y.src==='start'))*-1});
  /* the manual 'start' marker never overrides an imported observation, whatever its date */
  var obs=a.history.filter(function(h){return h.src!=='start'});
  a.balance=obs.length?r2(obs[obs.length-1].balance):(a.history.length?r2(a.history[a.history.length-1].balance):a.startBalance);
  a.peak=a.history.reduce(function(m,h){return Math.max(m,h.balance)},a.startBalance);
}
/* fill payout metadata for a firm (presets by name; custom firms default to 100% share until edited) */
export function fillFirm(f){var p=FIRM_PRESETS.find(function(x){return norm(x.name)===norm(f.name)})||{};
  if(f.share==null||!isFinite(+f.share))f.share=p.share!=null?p.share:100;f.share=+f.share;
  if(!f.short)f.short=p.short||String(f.name||'').split(/\s+/).map(function(w){return w[0]}).join('').toUpperCase()||f.name;
  if(f.plan==null)f.plan=p.plan||'';if(f.rulesUrl==null)f.rulesUrl=p.rulesUrl||'';return f}
export function firmOf(name){return S.settings.firms.find(function(f){return f.name===name})||fillFirm({name:name||'—'})}
