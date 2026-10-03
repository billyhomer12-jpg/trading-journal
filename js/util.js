// util.js

export var $=function(s,r){return (r||document).querySelector(s)};
export var $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
export function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
export function r2(n){return Math.round((+n||0)*100)/100}
export function fmt$(n,sign){n=r2(n);var a=Math.abs(n);var s=a.toLocaleString('en-US',{minimumFractionDigits:(a%1)?2:0,maximumFractionDigits:2});return (n<0?'−$':(sign&&n>0?'+$':'$'))+s}
export function fmtK(n){n=r2(n);var a=Math.abs(n);var s=a>=1000?(a/1000).toFixed(a>=10000?0:1).replace(/\.0$/,'')+'k':String(Math.round(a));return (n<0?'−':n>0?'+':'')+s}
export function cls(n){return n>0?'pos':n<0?'neg':'flat'}
export function pad(n){return String(n).padStart(2,'0')}
export function ds(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
export function pd(s){var p=String(s).split('-').map(Number);return new Date(p[0],p[1]-1,p[2])}
export function todayS(){return ds(new Date())}
export function addDays(d,n){var x=new Date(d.getTime());x.setDate(x.getDate()+n);return x}
export function fmtDate(s,o){return pd(s).toLocaleDateString(undefined,o||{weekday:'short',month:'short',day:'numeric'})}
export function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8)}
export function norm(s){return String(s||'').toLowerCase().replace(/\s+/g,' ').trim()}
export function clone(o){return JSON.parse(JSON.stringify(o))}
export function num(v){if(typeof v==='number')return v;var s=String(v==null?'':v).trim();var neg=/^\(.*\)$/.test(s)||/^-/.test(s.replace(/[\s$]/g,''));s=s.replace(/[()$,\s]/g,'').replace(/^-/,'');var n=parseFloat(s);return isFinite(n)?(neg?-n:n):NaN}
