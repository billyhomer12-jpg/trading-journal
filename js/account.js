// account.js — Sign in / Create account screen, routing, Settings → Profile + Security, 2FA setup, avatar crop, delete account.
import { ALLOW_GUEST, APP_NAME, LINKS, SITE_URL, THEMES } from './config.js';
import { $, $$, esc, fmtDate } from './util.js';
import { S, defaults, save, saveUi, setState, ui } from './state.js';
import { ICON, applyTheme, closeSheet, info, openSheet, toast } from './ui.js';
import { auth, isGuest, normRecovery, pwProblem, qrCanvas, rlFail, rlOk, rlWait, setGuest, testMode, USERNAME_RE, validEmail } from './auth.js';
import { openOnboarding, openWelcome } from './onboarding.js';
import { openSettings } from './editors.js';
import { render } from './main.js';

export function curUser(){return auth().current()}
/* legal / support links: relative on the web, absolute in the native app or a file:// copy */
export function siteLink(k){var C=window.Capacitor,nat=(C&&C.isNativePlatform&&C.isNativePlatform())||!/^https?:$/.test(location.protocol);return (nat?SITE_URL:'./')+LINKS[k]}
export function legalLinks(){return '<nav class="set-links" id="set-links" aria-label="Help and legal">'+[['support','Support'],['privacy','Privacy'],['terms','Terms'],['disclaimer','Disclaimer']].map(function(x){return '<a href="'+siteLink(x[0])+'" target="_blank" rel="noopener" id="lnk-'+x[0]+'">'+x[1]+'</a>'}).join('')+'</nav>'}
function initials(u){return esc((u.username||u.email||'?').replace(/[^a-z0-9]/gi,'').slice(0,2).toUpperCase()||'?')}
var PERSON='<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="3.75"/><path d="M4.75 19.5c1.2-3.4 4-5 7.25-5s6.05 1.6 7.25 5"/></svg>';
var CAM='<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5h3l1.6-2.5h6.8L17 8.5h3v10H4z"/><circle cx="12" cy="13" r="3.25"/></svg>';
export function avatarHtml(u,cls){return '<span class="avatar '+(cls||'')+'">'+(u&&u.avatar?'<img src="'+esc(u.avatar)+'" alt="">':u?'<span class="av-ini">'+initials(u)+'</span>':PERSON)+'</span>'}
export function paintAvatar(){var b=$('#avatar-btn'),u=curUser();if(!b)return;b.innerHTML=avatarHtml(u,'sm');b.setAttribute('aria-label',u?'Profile: @'+u.username:'Profile (not signed in)');b.title=u?'@'+u.username:'Sign in'}
function testBadge(){return testMode()?'<span class="badge test" id="test-badge">Test mode'+info('About test mode','Accounts are stored only on this device (hashed passwords, real 2FA codes) until the app is connected to the cloud. No emails are sent.','r')+'</span>':''}
function themeStr(){return (ui.accent||'sea')+':'+(ui.theme||'auto')}
export function applyProfileTheme(u){if(!u||!u.theme)return;var p=u.theme.split(':');if(THEMES.some(function(t){return t[0]===p[0]}))ui.accent=p[0];if(['light','dark','auto'].indexOf(p[1])>=0)ui.theme=p[1];saveUi();applyTheme()}
var syncT;
export function syncTheme(){var u=curUser();if(!u)return;clearTimeout(syncT);syncT=setTimeout(function(){auth().updateProfile({theme:themeStr()})},300)}
function setErr(id,t){var e=$('#'+id);if(e){e.textContent=t||'';e.hidden=!t}}
function busy(btn,on,label){if(!btn)return;if(on){btn.dataset.label=btn.textContent;btn.disabled=true;btn.setAttribute('aria-busy','true');btn.textContent=label||'…'}else{btn.disabled=false;btn.removeAttribute('aria-busy');if(btn.dataset.label)btn.textContent=btn.dataset.label}}
function waitTxt(s){return s>=60?Math.ceil(s/60)+' min':s+' s'}
/* show the lock, disable the button until it lifts */
function locked(key,errId,btnId){var w=rlWait(key);if(!w)return false;setErr(errId,'Too many attempts. Try again in '+waitTxt(w)+'.');var b=$('#'+btnId);if(b){b.disabled=true;setTimeout(function(){var bb=$('#'+btnId);if(bb)bb.disabled=false;setErr(errId,'')},w*1000)}return true}
function failed(key,errId,btnId,msg){var w=rlFail(key);setErr(errId,msg);if(w)locked(key,errId,btnId)}
function v(id){var e=$('#'+id);return e?e.value:''}

/* ================= routing ================= */
export function bootAccount(){var a=auth();paintAvatar();
  var go=function(u){paintAvatar();if(u)applyProfileTheme(u);if(!S.onboarded){if(!$('#welcome-sheet'))openWelcome();return}if(!u&&!isGuest())openAuth({from:'boot',mode:a.pendingMfa()?'mfa':'signin'})};
  if(a.kind==='local'){go(a.current());return}
  if(!S.onboarded)openWelcome();
  a.onEvent(function(e){if(e==='recovery')openAuth({from:'boot',mode:'newpass'})});
  a.init().then(go).catch(function(){toast('Could not reach the account server',true);if(S.onboarded&&!isGuest())openAuth({from:'boot'})})}
/* welcome page → "Start journal": account first (unless signed in / chose "Not now"), then Get started */
export function afterWelcome(){if(curUser()||isGuest())openOnboarding(false);else openAuth({from:'welcome',mode:'signup'})}
function afterAuth(u,created){setGuest(false);if(created||!u.theme)syncTheme();else applyProfileTheme(u);paintAvatar();
  if(!S.onboarded)openOnboarding(false);else{closeSheet();render()}toast(created?'Account created':'Signed in as @'+u.username)}

/* ================= Sign in / Create account ================= */
var AU={mode:'signin',from:'boot',locked:true,recovery:false,email:''};
export function openAuth(o){o=o||{};AU={mode:o.mode||'signin',from:o.from||'boot',locked:o.locked!==false,recovery:false,email:''};drawAuth()}
function fld(id,label,type,attrs,hint){return '<label class="fld"><span>'+label+'</span><input id="'+id+'" type="'+type+'" '+(attrs||'')+(hint?' aria-describedby="'+id+'-h"':'')+'>'+(hint?'<span class="tiny muted fld-h" id="'+id+'-h">'+hint+'</span>':'')+'</label>'}
var APPLE='<svg viewBox="0 0 24 24" aria-hidden="true" class="oa-ic"><path fill="currentColor" d="M16.4 12.6c0-2.4 2-3.5 2-3.6-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.2-2.8.8-3.5.8-.7 0-1.8-.8-3-.8-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2.1-1.1 2.8-2.3.9-1.3 1.3-2.6 1.3-2.6s-2.5-1-2.5-3.6zM14.1 5.6c.6-.8 1.1-1.9 1-3-1 0-2.1.7-2.8 1.4-.6.7-1.2 1.8-1 2.9 1 .1 2.1-.6 2.8-1.3z"/></svg>';
var GOOGLE='<svg viewBox="0 0 24 24" aria-hidden="true" class="oa-ic"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.5l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z"/><path fill="#FBBC05" d="M6.4 13.9a6 6 0 0 1 0-3.8V7.5H3.1a10 10 0 0 0 0 9z"/><path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.5l3.3 2.6C7.2 7.8 9.4 6 12 6z"/></svg>';
var TITLES={signin:'Welcome back',signup:'Create your account',mfa:'Two-factor code',forgot:'Reset password',newpass:'New password',confirm:'Check your email'};
var SUBMITS={signin:'Sign in',signup:'Create account',mfa:'Verify',forgot:'Send reset link',newpass:'Save password'};
function drawAuth(){var a=auth(),m=AU.mode,h='';
  h+='<div class="au-top">'+(AU.from==='welcome'?'<button class="iconbtn" data-act="au" data-au="back" id="au-back" aria-label="Back">'+ICON.chevL+'</button>':!AU.locked?'<button class="iconbtn" data-act="closeSheet" id="au-close" aria-label="Close">'+ICON.close+'</button>':'<span></span>')+testBadge()+'</div>';
  h+='<div class="au-hero"><div class="app-ic sm" aria-hidden="true"><span><svg viewBox="0 0 24 24"><path d="M5 16.5l5-5 3.5 3L19.5 8"/></svg></span></div><h1 id="au-title">'+TITLES[m]+'</h1></div>';
  h+='<div class="au-card glass">';
  if(m==='signin'||m==='signup')h+='<div class="seg au-seg" role="tablist" aria-label="Account">'+[['signin','Sign in'],['signup','Create account']].map(function(o){return '<button type="button" role="tab" aria-selected="'+(m===o[0])+'" class="'+(m===o[0]?'on':'')+'" data-act="au" data-au="mode" data-mode="'+o[0]+'" id="au-tab-'+o[0]+'">'+o[1]+'</button>'}).join('')+'</div>';
  h+='<form id="au-form" data-mode="'+m+'" novalidate>';
  if(m==='signin')h+=fld('au-login','Email or username','text','autocomplete="username" autocapitalize="none" spellcheck="false" required')+fld('au-pass','Password','password','autocomplete="current-password" required')+
    '<div class="au-links"><button type="button" class="link-btn" data-act="au" data-au="forgot" id="au-forgot">Forgot password?</button></div>';
  if(m==='signup')h+=fld('au-email','Email','email','autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false" required')+
    fld('au-username','Username','text','autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="20" required','3–20: a–z, 0–9, _ .')+
    fld('au-pass','Password','password','autocomplete="new-password" minlength="8" required','8+ characters')+fld('au-pass2','Confirm password','password','autocomplete="new-password" required')+
    '<label class="au-check"><input type="checkbox" id="au-mkt"><span>Email me updates and offers</span></label>'+
    '<p class="tiny muted au-legal">By creating an account you agree to the <a href="'+siteLink('terms')+'" target="_blank" rel="noopener" id="au-terms">Terms</a> and <a href="'+siteLink('privacy')+'" target="_blank" rel="noopener" id="au-privacy">Privacy Policy</a>.</p>';
  if(m==='mfa')h+='<p class="small muted au-p">'+(AU.recovery?'Enter one of your saved recovery codes.':'Enter the code from your authenticator app.')+'</p>'+
    (AU.recovery?fld('au-code','Recovery code','text','autocomplete="off" autocapitalize="none" spellcheck="false" required'):fld('au-code','6-digit code','text','inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="6" required'))+
    '<div class="au-links"><button type="button" class="link-btn" data-act="au" data-au="recovery" id="au-recovery-toggle">'+(AU.recovery?'Use authenticator code':'Use a recovery code')+'</button><button type="button" class="link-btn" data-act="au" data-au="cancel" id="au-cancel">Cancel</button></div>';
  if(m==='forgot')h+=fld('au-email','Email','email','autocomplete="email" inputmode="email" autocapitalize="none" required')+(testMode()?'<p class="tiny muted au-p">Test mode can\'t send email.</p>':'')+
    '<div class="au-links"><button type="button" class="link-btn" data-act="au" data-au="mode" data-mode="signin" id="au-to-signin">Back to sign in</button></div>';
  if(m==='newpass')h+=fld('au-pass','New password','password','autocomplete="new-password" minlength="8" required','8+ characters')+fld('au-pass2','Confirm password','password','autocomplete="new-password" required');
  if(m==='confirm')h+='<p class="au-p">We sent a link to <b>'+esc(AU.email)+'</b>. Open it to finish, then sign in.</p>';
  h+='<div class="au-err" id="au-err" role="alert" hidden></div>';
  h+=m==='confirm'?'<button type="button" class="btn primary wide" data-act="au" data-au="mode" data-mode="signin" id="au-submit">Back to sign in</button>':'<button type="submit" class="btn primary wide" id="au-submit">'+SUBMITS[m]+'</button>';
  h+='</form></div>';
  if(m==='signin'||m==='signup'){var pv=a.providers(),apple=pv.indexOf('apple')>=0&&!!a.oauth,google=apple&&pv.indexOf('google')>=0;
    h+='<div class="au-or" aria-hidden="true"><span>or</span></div><div class="au-oauth">'+
      '<button type="button" class="btn wide oa apple" data-act="au" data-au="oauth" data-p="apple" id="au-apple"'+(apple?'':' disabled aria-describedby="au-soon"')+'>'+APPLE+'<span>Sign in with Apple</span></button>'+
      '<button type="button" class="btn wide oa google" data-act="au" data-au="oauth" data-p="google" id="au-google"'+(google?'':' disabled aria-describedby="au-soon"')+'>'+GOOGLE+'<span>Sign in with Google</span></button>'+
      (apple&&google?'':'<span class="tiny muted au-soon" id="au-soon">'+(apple?'Google':'Apple and Google')+' sign-in coming soon</span>')+'</div>';
    if(ALLOW_GUEST&&AU.locked)h+='<button type="button" class="link-btn au-guest" data-act="au" data-au="guest" id="auth-guest">Not now</button>'}
  openSheet(TITLES[m],h,'auth-sheet',AU.locked);$('#auth-sheet').parentNode.classList.add('welcome-back','auth-back');
  if(window.matchMedia&&matchMedia('(hover:hover)').matches){var f=$('#au-form input');if(f)f.focus()}}
export function auAction(el){var k=el.dataset.au,a=auth();
  if(k==='mode'){AU.mode=el.dataset.mode;AU.recovery=false;return drawAuth()}
  if(k==='forgot'){AU.mode='forgot';return drawAuth()}
  if(k==='back'){a.cancelMfa&&a.cancelMfa();return openWelcome()}
  if(k==='recovery'){AU.recovery=!AU.recovery;return drawAuth()}
  if(k==='cancel'){a.cancelMfa();AU.mode='signin';AU.recovery=false;return drawAuth()}
  if(k==='guest'){setGuest(true);paintAvatar();if(!S.onboarded)openOnboarding(false);else{closeSheet();render()}return}
  if(k==='oauth'&&a.oauth)return a.oauth(el.dataset.p).then(function(r){if(!r.ok)setErr('au-err',r.error)})}
async function authSubmit(){var a=auth(),m=AU.mode,btn=$('#au-submit'),key={signin:'login',mfa:'mfa',forgot:'reset'}[m];setErr('au-err','');
  if(key&&locked(key,'au-err','au-submit'))return;
  try{
    if(m==='signin'){var login=v('au-login').trim(),pw=v('au-pass');if(!login||!pw)return setErr('au-err','Enter your email or username and password');
      busy(btn,true,'Signing in…');var r=await a.signIn({login:login,password:pw});busy(btn,false);
      if(r.mfa){rlOk('login');AU.mode='mfa';AU.recovery=false;return drawAuth()}if(!r.ok)return failed('login','au-err','au-submit',r.error);rlOk('login');return afterAuth(r.user)}
    if(m==='signup'){var email=v('au-email').trim(),un=v('au-username').trim().toLowerCase(),p1=v('au-pass'),p2=v('au-pass2');
      if(!validEmail(email))return setErr('au-err','Enter a valid email');if(!USERNAME_RE.test(un))return setErr('au-err','Username: 3–20 characters, a–z, 0–9, _ or .');
      var pp=pwProblem(p1);if(pp)return setErr('au-err',pp);if(p1!==p2)return setErr('au-err','Passwords don\'t match');
      busy(btn,true,'Creating…');var s=await a.signUp({email:email,username:un,password:p1,marketing:$('#au-mkt').checked,theme:themeStr()});busy(btn,false);
      if(!s.ok)return setErr('au-err',s.error);if(s.confirm){AU.mode='confirm';AU.email=email;return drawAuth()}return afterAuth(s.user,true)}
    if(m==='mfa'){var code=v('au-code');if(!code.trim())return setErr('au-err','Enter the code');busy(btn,true,'Checking…');
      var q=AU.recovery?await a.useRecovery(code):await a.verifyMfa(code);busy(btn,false);if(!q.ok)return failed('mfa','au-err','au-submit',q.error);rlOk('mfa');
      afterAuth(q.user);if(q.mfaRemoved)toast('2FA was turned off — set it up again in Settings');else if(q.left!=null)toast(q.left+' recovery code'+(q.left===1?'':'s')+' left');return}
    if(m==='forgot'){var em=v('au-email').trim();if(!validEmail(em))return setErr('au-err','Enter a valid email');busy(btn,true,'Sending…');var f=await a.resetPassword(em);busy(btn,false);
      if(!f.ok){rlFail('reset');return setErr('au-err',f.error)}AU.mode='confirm';AU.email=em;return drawAuth()}
    if(m==='newpass'){var n1=v('au-pass'),n2=v('au-pass2'),np=pwProblem(n1);if(np)return setErr('au-err',np);if(n1!==n2)return setErr('au-err','Passwords don\'t match');
      busy(btn,true);var z=await a.setNewPassword(n1);busy(btn,false);if(!z.ok)return setErr('au-err',z.error);return afterAuth(z.user)}
  }catch(e){busy(btn,false);setErr('au-err',window.isSecureContext===false?'Accounts need a secure (https) page':'Something went wrong. Try again.')}}

/* ================= Settings: Profile + Security ================= */
export function accountSections(){var u=curUser();
  if(!u)return '<section class="set-sec" id="set-profile"><h3 class="set-h">Profile</h3><div class="card glass prof-card"><div class="prof-row">'+avatarHtml(null,'xl')+'<div class="prof-id"><b>Not signed in</b><div class="small muted">Your journal stays on this device.</div>'+testBadge()+'</div></div><button class="btn primary wide" data-act="openSignIn" id="btn-signin">Sign in or create account</button></div></section>';
  var h='<section class="set-sec" id="set-profile"><h3 class="set-h">Profile</h3><div class="card glass prof-card"><div class="prof-row"><button type="button" class="avatar-edit" data-act="avatarPick" id="btn-avatar" aria-label="Change profile photo">'+avatarHtml(u,'xl')+'<span class="avatar-cam">'+CAM+'</span></button>'+
    '<div class="prof-id"><b id="prof-handle">@'+esc(u.username)+'</b><div class="small muted" id="prof-email">'+esc(u.email)+'</div>'+testBadge()+'</div></div>'+
    '<input type="file" id="avatar-file" class="sr" accept="image/*" data-on="avatarFile" tabindex="-1" aria-hidden="true">'+
    '<label class="fld" for="prof-username"><span>Username</span></label><div class="row prof-un"><input id="prof-username" value="'+esc(u.username)+'" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="20" data-on="unameCheck" aria-describedby="uname-msg"><button class="btn sm" data-act="saveUsername" id="btn-save-username">Save</button></div><div class="tiny fld-h" id="uname-msg" aria-live="polite"></div></div>';
  h+='<div class="card glass prof-card"><label class="switch-row" for="mkt-toggle"><span><b>Marketing emails</b><span class="small muted" id="mkt-msg">'+mktMsg(u)+'</span></span><input type="checkbox" role="switch" class="switch" id="mkt-toggle" data-on="mktToggle"'+(u.marketing?' checked':'')+'></label></div>';
  h+='<div class="grid2 prof-actions"><button class="btn" data-act="signOut" id="btn-signout">Sign out</button><button class="btn danger" data-act="deleteAcct" id="btn-delete-acct">Delete account</button></div></section>';
  h+='<section class="set-sec" id="set-security"><h3 class="set-h">Security</h3><details class="card glass sec-card" id="pw-card"><summary>Change password</summary><form id="pw-form" novalidate>'+
    fld('s-pw-cur','Current password','password','autocomplete="current-password"')+fld('s-pw-new','New password','password','autocomplete="new-password" minlength="8"','8+ characters')+fld('s-pw-new2','Confirm new password','password','autocomplete="new-password"')+
    '<div class="au-err" id="pw-err" role="alert" hidden></div><button type="submit" class="btn primary wide" id="btn-change-pw">Update password</button></form></details>';
  h+='<div class="card glass sec-card" id="mfa-card"><div class="row between"><span class="sec-t"><b>Two-factor authentication</b><span class="small muted">Authenticator app</span></span><span class="pill '+(u.mfa?'on':'off')+'" id="mfa-state">'+(u.mfa?'On':'Off')+'</span></div>'+
    (u.mfa?'<form id="mfa-off-form" class="row mfa-off" novalidate><input id="mfa-off-code" autocomplete="one-time-code" autocapitalize="none" spellcheck="false" placeholder="Code or recovery code" aria-label="Code or recovery code to turn off 2FA"><button class="btn sm" type="submit" id="btn-mfa-disable">Turn off</button></form><div class="au-err" id="mfa-off-err" role="alert" hidden></div>'
      :'<button class="btn primary wide" data-act="mfaEnable" id="btn-mfa-enable">Set up 2FA</button>')+'</div></section>';
  return h}
function mktMsg(u){return u.marketing?'On since '+esc(fmtDate(String(u.optInAt||'').slice(0,10)||new Date().toISOString().slice(0,10),{month:'short',day:'numeric',year:'numeric'})):'Off'}
var unT;
function unameCheck(el){var n=el.value.toLowerCase();if(el.value!==n)el.value=n;var m=$('#uname-msg'),u=curUser();clearTimeout(unT);
  if(u&&n===u.username){m.textContent='';m.className='tiny fld-h';return}
  if(!USERNAME_RE.test(n)){m.textContent='3–20: a–z, 0–9, _ .';m.className='tiny fld-h neg';return}
  unT=setTimeout(function(){auth().usernameAvailable(n).then(function(ok){if($('#prof-username').value!==n)return;m.textContent=ok?'Available':'Taken';m.className='tiny fld-h '+(ok?'pos':'neg')})},300)}
async function saveUsername(){var n=v('prof-username').trim().toLowerCase(),m=$('#uname-msg'),b=$('#btn-save-username'),u=curUser();if(!u||n===u.username)return;
  busy(b,true);var r=await auth().updateProfile({username:n});busy(b,false);
  if(!r.ok){m.textContent=r.error;m.className='tiny fld-h neg';return}m.textContent='Saved';m.className='tiny fld-h pos';$('#prof-handle').textContent='@'+r.user.username;paintAvatar();
  $$('#set-profile .avatar.xl .av-ini').forEach(function(e){e.textContent=initials(r.user)});toast('Username saved')}
async function mktToggle(el){var on=el.checked;el.disabled=true;var r=await auth().updateProfile({marketing:on});el.disabled=false;
  if(!r.ok){el.checked=!on;return toast(r.error,true)}$('#mkt-msg').innerHTML=mktMsg(r.user);toast(on?'Subscribed to updates':'Unsubscribed')}
async function changePw(){var c=v('s-pw-cur'),n=v('s-pw-new'),n2=v('s-pw-new2'),b=$('#btn-change-pw');setErr('pw-err','');if(locked('pw','pw-err','btn-change-pw'))return;
  if(!c)return setErr('pw-err','Enter your current password');var p=pwProblem(n);if(p)return setErr('pw-err',p);if(n!==n2)return setErr('pw-err','Passwords don\'t match');if(n===c)return setErr('pw-err','Choose a new password');
  busy(b,true,'Updating…');var r=await auth().changePassword(c,n);busy(b,false);if(!r.ok)return failed('pw','pw-err','btn-change-pw',r.error);rlOk('pw');
  ['s-pw-cur','s-pw-new','s-pw-new2'].forEach(function(i){$('#'+i).value=''});$('#pw-card').open=false;toast('Password updated')}
/* ---- 2FA setup ---- */
var mfaSecret='';
async function mfaEnable(){var r=await auth().mfaEnroll();if(!r.ok)return toast(r.error,true);mfaSecret=r.secret;
  openSheet('Two-factor authentication','<p class="small muted mfa-p">Scan with your authenticator app (Google Authenticator, Authy, 1Password…).</p><div class="qr-wrap" id="mfa-qr"></div>'+
    '<div class="mfa-key"><span class="small muted">Or enter this key</span><code id="mfa-key">'+esc(r.secret.replace(/(.{4})/g,'$1 ').trim())+'</code><button type="button" class="btn sm" data-act="copyKey" id="btn-copy-key">Copy key</button></div>'+
    '<form id="mfa-verify-form" novalidate>'+fld('mfa-code','6-digit code','text','inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="6"')+'<div class="au-err" id="mfa-err" role="alert" hidden></div><button type="submit" class="btn primary wide" id="btn-mfa-verify">Verify and turn on</button></form>','mfa-sheet',false,'mfaBack');
  var c=qrCanvas(r.uri,6);c.id='mfa-qr-canvas';c.setAttribute('role','img');c.setAttribute('aria-label','QR code for your authenticator app');$('#mfa-qr').appendChild(c);$('#mfa-qr').dataset.uri=r.uri}
async function mfaVerify(){var code=v('mfa-code'),b=$('#btn-mfa-verify');setErr('mfa-err','');if(locked('mfa','mfa-err','btn-mfa-verify'))return;if(!/^\d{6}$/.test(code.trim()))return setErr('mfa-err','Enter the 6-digit code');
  busy(b,true,'Checking…');var r=await auth().mfaVerifyEnroll(code);busy(b,false);if(!r.ok)return failed('mfa','mfa-err','btn-mfa-verify',r.error);rlOk('mfa');mfaSecret='';
  $('#mfa-sheet .sheet-b').innerHTML='<div class="mfa-done"><span class="pill on" id="mfa-on">2FA is on</span><p class="small">Save these recovery codes somewhere safe. Each one works once if you lose your phone.</p><ol class="rec-codes" id="mfa-recovery">'+
    r.recovery.map(function(c){return '<li><code>'+esc(c)+'</code></li>'}).join('')+'</ol><div class="grid2"><button type="button" class="btn" data-act="copyCodes" id="btn-copy-codes">Copy</button><button type="button" class="btn" data-act="downloadCodes" id="btn-dl-codes">Download</button></div><button type="button" class="btn primary wide" data-act="mfaBack" id="btn-mfa-done">Done</button></div>';
  toast('2FA is on')}
async function mfaDisable(){var code=v('mfa-off-code'),b=$('#btn-mfa-disable');setErr('mfa-off-err','');if(locked('mfa','mfa-off-err','btn-mfa-disable'))return;if(!code.trim())return setErr('mfa-off-err','Enter a code');
  busy(b,true);var r=await auth().mfaDisable(code);busy(b,false);if(!r.ok)return failed('mfa','mfa-off-err','btn-mfa-disable',r.error);rlOk('mfa');openSettings('security');toast('2FA turned off')}
function codesText(){return APP_NAME+' recovery codes (each works once)\n'+$$('#mfa-recovery code').map(function(c){return c.textContent}).join('\n')+'\n'}
function copy(t,label){(navigator.clipboard&&navigator.clipboard.writeText?navigator.clipboard.writeText(t):Promise.reject()).then(function(){toast(label+' copied')},function(){toast('Select and copy it manually',true)})}
/* ---- delete account ---- */
function deleteAcct(){var u=curUser();if(!u)return;
  openSheet('Delete account','<p class="small">This permanently deletes <b>@'+esc(u.username)+'</b> ('+esc(u.email)+'). Your journal on this device stays unless you tick the box. <a href="'+siteLink('deleteAccount')+'" target="_blank" rel="noopener" id="del-info">What gets deleted</a></p><form id="del-form" novalidate>'+fld('del-pass','Password','password','autocomplete="current-password"')+
    '<label class="au-check"><input type="checkbox" id="del-local"><span>Also erase my journal on this device</span></label><div class="au-err" id="del-err" role="alert" hidden></div><button type="submit" class="btn danger wide" id="btn-delete-confirm">Delete account</button></form>','del-sheet',false,'delBack')}
async function deleteConfirm(){var pw=v('del-pass'),b=$('#btn-delete-confirm');setErr('del-err','');if(locked('del','del-err','btn-delete-confirm'))return;if(!pw)return setErr('del-err','Enter your password');
  if(!confirm('Delete your account permanently? This can\'t be undone.'))return;busy(b,true,'Deleting…');var r=await auth().deleteAccount(pw);busy(b,false);
  if(!r.ok)return failed('del','del-err','btn-delete-confirm',r.error);rlOk('del');var wipe=$('#del-local').checked;
  if(wipe){var news=S.news;setState(defaults());S.news=news;save()}setGuest(false);paintAvatar();render();if(!S.onboarded)openWelcome();else openAuth({from:'boot',mode:'signup'});toast('Account deleted')}
/* ---- profile photo: square crop (drag / arrow keys + zoom) → 512 px JPEG ---- */
var CR=null,CV=600;
function avatarFile(el){var f=el.files&&el.files[0];el.value='';if(!f)return;if(!/^image\//.test(f.type||''))return toast('Choose an image',true);
  var img=new Image(),url=URL.createObjectURL(f);img.onload=function(){CR={img:img,zoom:1,ox:0,oy:0,url:url};openCrop()};img.onerror=function(){toast('Could not read image',true)};img.src=url}
function openCrop(){openSheet('Profile photo','<div class="crop-wrap"><canvas id="crop-cv" width="'+CV+'" height="'+CV+'" tabindex="0" aria-label="Photo crop: drag or use arrow keys to move"></canvas><div class="crop-ring" aria-hidden="true"></div></div>'+
    '<label class="fld"><span>Zoom</span><input type="range" id="crop-zoom" min="1" max="4" step="0.01" value="1" data-on="cropZoom"></label><button type="button" class="btn primary wide" data-act="cropSave" id="btn-crop-save">Save photo</button>','crop-sheet',false,'cropBack');
  var c=$('#crop-cv'),drag=null;drawCrop();
  c.addEventListener('pointerdown',function(e){drag={x:e.clientX,y:e.clientY};c.setPointerCapture(e.pointerId)});
  c.addEventListener('pointermove',function(e){if(!drag)return;var k=CV/c.getBoundingClientRect().width;CR.ox+=(e.clientX-drag.x)*k;CR.oy+=(e.clientY-drag.y)*k;drag={x:e.clientX,y:e.clientY};drawCrop()});
  c.addEventListener('pointerup',function(){drag=null});
  c.addEventListener('keydown',function(e){var d={ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]}[e.key];if(!d)return;e.preventDefault();CR.ox+=d[0];CR.oy+=d[1];drawCrop()})}
function cropGeom(size){var w=CR.img.naturalWidth,h=CR.img.naturalHeight,s=Math.max(CV/w,CV/h)*CR.zoom,dw=w*s,dh=h*s,mx=(dw-CV)/2,my=(dh-CV)/2;
  CR.ox=Math.max(-mx,Math.min(mx,CR.ox));CR.oy=Math.max(-my,Math.min(my,CR.oy));var k=size/CV;return {x:((CV-dw)/2+CR.ox)*k,y:((CV-dh)/2+CR.oy)*k,w:dw*k,h:dh*k}}
function drawCrop(){var c=$('#crop-cv');if(!c||!CR)return;var g=c.getContext('2d'),r=cropGeom(CV);g.fillStyle='#000';g.fillRect(0,0,CV,CV);g.drawImage(CR.img,r.x,r.y,r.w,r.h)}
async function cropSave(){if(!CR)return;var c=document.createElement('canvas');c.width=c.height=512;var g=c.getContext('2d'),r=cropGeom(512);g.fillStyle='#fff';g.fillRect(0,0,512,512);g.imageSmoothingQuality='high';g.drawImage(CR.img,r.x,r.y,r.w,r.h);
  var url=c.toDataURL('image/jpeg',.88),blob=await new Promise(function(res){c.toBlob(res,'image/jpeg',.88)}),b=$('#btn-crop-save');busy(b,true,'Saving…');
  var s=await auth().setAvatar(blob,url);busy(b,false);if(!s.ok)return toast(s.error,true);URL.revokeObjectURL(CR.url);CR=null;paintAvatar();openSettings('profile');toast('Photo updated')}

/* ================= wiring (main.js merges these) ================= */
export var ACC_ACTS={au:auAction,profile:function(){openSettings('profile')},openSignIn:function(){openAuth({from:'settings',locked:false,mode:'signin'})},
  signOut:function(){auth().signOut().then(function(){setGuest(false);paintAvatar();closeSheet();openAuth({from:'boot',mode:'signin'});toast('Signed out')})},
  deleteAcct:deleteAcct,saveUsername:saveUsername,mfaEnable:mfaEnable,mfaBack:function(){mfaSecret='';openSettings('security')},delBack:function(){openSettings('profile')},cropBack:function(){CR=null;openSettings('profile')},
  avatarPick:function(){var i=$('#avatar-file');if(i)i.click()},cropSave:cropSave,copyKey:function(){copy(mfaSecret||$('#mfa-key').textContent.replace(/\s/g,''),'Key')},copyCodes:function(){copy(codesText(),'Codes')},
  downloadCodes:function(){var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([codesText()],{type:'text/plain'}));a.download='trading-journal-recovery-codes.txt';document.body.appendChild(a);a.click();a.remove()},
  setNav:function(el){var s=$('#set-'+el.dataset.k);if(s)s.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})}};
export var ACC_ON={unameCheck:unameCheck,mktToggle:mktToggle,avatarFile:avatarFile,cropZoom:function(el){if(CR){CR.zoom=+el.value;drawCrop()}}};
export var ACC_CHANGE={mktToggle:1,avatarFile:1};
export var ACC_SUBMIT={'au-form':authSubmit,'pw-form':changePw,'mfa-verify-form':mfaVerify,'mfa-off-form':mfaDisable,'del-form':deleteConfirm};
