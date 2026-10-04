// ui.js
import { $, esc } from './util.js';
import { ui } from './state.js';
import { APPEARANCE, THEMES } from './config.js';

/* SF-Symbols-style line icons (24px grid, 1.75 stroke set in CSS) */
function svgI(d){return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">'+d+'</svg>'}
export var ICON={
  auto:svgI('<circle cx="12" cy="12" r="8.25"/><path d="M12 3.75v16.5a8.25 8.25 0 0 0 0-16.5z" class="fill"/>'),
  sun:svgI('<circle cx="12" cy="12" r="3.75"/><path d="M12 2.75v2M12 19.25v2M4.75 12h-2M21.25 12h-2M6.9 6.9 5.5 5.5M18.5 18.5l-1.4-1.4M6.9 17.1l-1.4 1.4M18.5 5.5l-1.4 1.4"/>'),
  moon:svgI('<path d="M19.5 14.6A7.75 7.75 0 0 1 9.4 4.5a7.75 7.75 0 1 0 10.1 10.1z"/>'),
  gear:svgI('<circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l1.9-1.5-1.9-3.3-2.3.9a7.5 7.5 0 0 0-2.6-1.5L14.1 2.8h-4.2l-.4 2.3a7.5 7.5 0 0 0-2.6 1.5l-2.3-.9-1.9 3.3 1.9 1.5a7.6 7.6 0 0 0 0 3l-1.9 1.5 1.9 3.3 2.3-.9a7.5 7.5 0 0 0 2.6 1.5l.4 2.3h4.2l.4-2.3a7.5 7.5 0 0 0 2.6-1.5l2.3.9 1.9-3.3z"/>'),
  close:svgI('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>'),
  chevL:svgI('<path d="M14.5 5.5 8 12l6.5 6.5"/>'),
  chevR:svgI('<path d="M9.5 5.5 16 12l-6.5 6.5"/>'),
  info:svgI('<circle cx="12" cy="12" r="8.75"/><path d="M12 11v5.5"/><path d="M12 7.6v.01" class="dot"/>'),
  undo:svgI('<path d="M9 14.5 4.5 10 9 5.5"/><path d="M4.5 10h10a5 5 0 0 1 0 10H11"/>'),
  pencil:svgI('<path d="M4.5 19.5l1-4.2L15.6 5.2a2 2 0 0 1 2.8 0l.4.4a2 2 0 0 1 0 2.8L8.7 18.5z"/><path d="M13.8 7l3.2 3.2"/>'),
  trash:svgI('<path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l.9 12.2h9.2L17.5 7M10.2 10.5v5.5M13.8 10.5v5.5"/>'),
  plus:svgI('<path d="M12 5v14M5 12h14"/>')};
/* (i) popover: native <details> (keyboard + screen-reader friendly, no JS needed); main.js closes it on outside tap / Esc.
   label = accessible name of the toggle; side 'r' anchors the bubble to the right edge (for icons near the right side). */
export function info(label,html,side,id){return '<details class="info'+(side?' '+side:'')+'"'+(id?' id="'+id+'"':'')+'><summary aria-label="'+esc(label)+'" title="'+esc(label)+'">'+ICON.info+'</summary><div class="info-pop" role="note">'+html+'</div></details>'}
/* icon + short word; the full wording goes to aria-label */
export function icoTxt(ic,txt){return ICON[ic]+'<span>'+txt+'</span>'}
export var mq=window.matchMedia?window.matchMedia('(prefers-color-scheme: dark)'):{matches:false};
export function applyTheme(){var t=ui.theme==='auto'?(mq.matches?'dark':'light'):ui.theme,de=document.documentElement;de.setAttribute('data-theme',t);de.setAttribute('data-accent',ui.accent||'sea');
  var b=$('#theme-btn');b.innerHTML=ui.theme==='auto'?ICON.auto:ui.theme==='dark'?ICON.moon:ICON.sun;b.title='Appearance: '+appearanceName();
  /* browser chrome (status bar / Android toolbar) follows the themed backdrop */
  var bg=getComputedStyle(de).getPropertyValue('--body-bg').trim();if(bg)document.querySelectorAll('meta[name=theme-color]').forEach(function(m){m.setAttribute('content',bg)})}
export function appearanceName(){var a=APPEARANCE.find(function(x){return x[0]===ui.theme});return a?a[1]:'System'}
/* the one theme picker (welcome page + Settings): accent swatches (radio group) + Light / Dark / System */
export function themePicker(){return '<div class="tp"><div class="sw-row" role="radiogroup" aria-label="Color theme">'+THEMES.map(function(t){var on=ui.accent===t[0];
    return '<button class="sw'+(on?' on':'')+'" data-act="accent" data-val="'+t[0]+'" role="radio" aria-checked="'+on+'" tabindex="'+(on?0:-1)+'"><i style="background:linear-gradient(135deg,'+t[2]+','+t[3]+')"></i><span>'+t[1]+'</span></button>'}).join('')+'</div>'+
  seg('theme',APPEARANCE,ui.theme)+'</div>'}
if(mq.addEventListener)mq.addEventListener('change',applyTheme);else if(mq.addListener)mq.addListener(applyTheme);
export var toastT;
export function toast(msg,bad){var el=$('#toast');if(!el){el=document.createElement('div');el.id='toast';el.className='toast glass';document.body.appendChild(el)}el.textContent=msg;el.style.color=bad?'var(--red)':'var(--text)';el.hidden=false;clearTimeout(toastT);toastT=setTimeout(function(){el.hidden=true},2600)}
/* back = optional data-act for a leading ‹ Back control (multi-page flows, e.g. onboarding page 2 → page 1) */
export function openSheet(title,html,id,lock,back){$('#sheet-root').innerHTML='<div class="sheet-back'+(lock?' locked':'')+'" data-act="sheetBack"'+(lock?' data-lock="1"':'')+'><div class="sheet" id="'+(id||'sheet')+'" role="dialog" aria-modal="true" aria-label="'+esc(title)+'"><div class="sheet-h">'+(back?'<button class="iconbtn sheet-backbtn" data-act="'+back+'" id="'+(id||'sheet')+'-back" aria-label="Back">'+ICON.chevL+'</button>':'')+'<h2>'+esc(title)+'</h2>'+(lock?'':'<button class="iconbtn" data-act="closeSheet" aria-label="Close">'+ICON.close+'</button>')+'</div><div class="sheet-b">'+html+'</div></div></div>';document.body.style.overflow='hidden'}
export function closeSheet(){$('#sheet-root').innerHTML='';document.body.style.overflow=''}
export function seg(name,opts,cur){return '<div class="seg" role="tablist" data-segname="'+name+'">'+opts.map(function(o){return '<button data-act="seg" data-seg="'+name+'" data-val="'+o[0]+'" class="'+(cur===o[0]?'on':'')+'">'+o[1]+'</button>'}).join('')+'</div>'}
