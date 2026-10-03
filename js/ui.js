// ui.js
import { $, esc } from './util.js';
import { ui } from './state.js';

export var mq=window.matchMedia?window.matchMedia('(prefers-color-scheme: dark)'):{matches:false};
export function applyTheme(){var t=ui.theme==='auto'?(mq.matches?'dark':'light'):ui.theme;document.documentElement.setAttribute('data-theme',t);
  var b=$('#theme-btn');b.textContent=ui.theme==='auto'?'◐':ui.theme==='dark'?'☾':'☀︎';b.title='Theme: '+ui.theme}
if(mq.addEventListener)mq.addEventListener('change',applyTheme);else if(mq.addListener)mq.addListener(applyTheme);
export var toastT;
export function toast(msg,bad){var el=$('#toast');if(!el){el=document.createElement('div');el.id='toast';el.className='toast glass';document.body.appendChild(el)}el.textContent=msg;el.style.color=bad?'var(--red)':'var(--text)';el.hidden=false;clearTimeout(toastT);toastT=setTimeout(function(){el.hidden=true},2600)}
export function openSheet(title,html,id,lock){$('#sheet-root').innerHTML='<div class="sheet-back'+(lock?' locked':'')+'" data-act="sheetBack"'+(lock?' data-lock="1"':'')+'><div class="sheet" id="'+(id||'sheet')+'" role="dialog" aria-label="'+esc(title)+'"><div class="sheet-h"><h2>'+esc(title)+'</h2>'+(lock?'':'<button class="iconbtn" data-act="closeSheet" aria-label="Close">✕</button>')+'</div><div class="sheet-b">'+html+'</div></div></div>';document.body.style.overflow='hidden'}
export function closeSheet(){$('#sheet-root').innerHTML='';document.body.style.overflow=''}
export function seg(name,opts,cur){return '<div class="seg" role="tablist" data-segname="'+name+'">'+opts.map(function(o){return '<button data-act="seg" data-seg="'+name+'" data-val="'+o[0]+'" class="'+(cur===o[0]?'on':'')+'">'+o[1]+'</button>'}).join('')+'</div>'}
