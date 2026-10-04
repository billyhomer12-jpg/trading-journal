// auth.js — accounts. One adapter interface, two implementations:
//   SupabaseAdapter  — real accounts (Supabase Auth + TOTP MFA + 'profiles' table + 'avatars' bucket); used when config.js has keys.
//   LocalDemoAdapter — "Test mode": everything on this device (PBKDF2-hashed passwords, real RFC 6238 TOTP), so every flow
//                      works and can be tested with a real authenticator app before Supabase is connected.
// Trading data is NOT part of the account (it stays local; cloud sync is future work).
// Security: passwords are never logged or stored in plain text; failed attempts are rate-limited in the UI.
import { APP_NAME, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_CDN, AUTH_REDIRECT, OAUTH_PROVIDERS } from './config.js';

var TE=new TextEncoder();
export function randBytes(n){var u=new Uint8Array(n);crypto.getRandomValues(u);return u}
function toB64(u8){var s='';for(var i=0;i<u8.length;i++)s+=String.fromCharCode(u8[i]);return btoa(s)}
function fromB64(s){var b=atob(s),u=new Uint8Array(b.length);for(var i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u}
function hex(u8){return Array.prototype.map.call(u8,function(x){return x.toString(16).padStart(2,'0')}).join('')}
export async function sha256hex(s){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',TE.encode(s))))}
function ctEq(a,b){if(a.length!==b.length)return false;var r=0;for(var i=0;i<a.length;i++)r|=a.charCodeAt(i)^b.charCodeAt(i);return r===0}

/* ---------- base32 (RFC 4648) + TOTP (RFC 6238: HMAC-SHA1, 6 digits, 30 s) ---------- */
var B32='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function b32enc(u8){var bits=0,val=0,out='';for(var i=0;i<u8.length;i++){val=(val<<8)|u8[i];bits+=8;while(bits>=5){out+=B32[(val>>>(bits-5))&31];bits-=5}val&=(1<<bits)-1}if(bits>0)out+=B32[(val<<(5-bits))&31];return out}
export function b32dec(s){s=String(s).toUpperCase().replace(/[\s=-]/g,'');var bits=0,val=0,out=[];for(var i=0;i<s.length;i++){var k=B32.indexOf(s[i]);if(k<0)throw new Error('Invalid key');val=(val<<5)|k;bits+=5;if(bits>=8){out.push((val>>>(bits-8))&255);bits-=8}val&=(1<<bits)-1}return new Uint8Array(out)}
export async function hotp(secret,counter){var key=await crypto.subtle.importKey('raw',b32dec(secret),{name:'HMAC',hash:'SHA-1'},false,['sign']);
  var c=new Uint8Array(8),x=counter;for(var i=7;i>=0;i--){c[i]=x%256;x=Math.floor(x/256)}
  var h=new Uint8Array(await crypto.subtle.sign('HMAC',key,c)),o=h[19]&15,bin=((h[o]&127)*16777216)+(h[o+1]<<16)+(h[o+2]<<8)+h[o+3];return String(bin%1000000).padStart(6,'0')}
export function totpStep(t){return Math.floor((t==null?Date.now():t)/30000)}
/* accepts the current step ±1 (clock drift); never a step at or before lastStep (no replay). Returns the matched step or null. */
export async function totpCheck(secret,code,lastStep,t){code=String(code||'').replace(/\s/g,'');if(!/^\d{6}$/.test(code))return null;var s=totpStep(t);
  for(var d=-1;d<=1;d++){if(lastStep!=null&&s+d<=lastStep)continue;if(await hotp(secret,s+d)===code)return s+d}return null}
export function otpauthUri(secret,account){return 'otpauth://totp/'+encodeURIComponent(APP_NAME)+':'+encodeURIComponent(account)+'?secret='+secret+'&issuer='+encodeURIComponent(APP_NAME)+'&algorithm=SHA1&digits=6&period=30'}
export function newRecoveryCodes(){var A='abcdefghjkmnpqrstuvwxyz23456789',out=[];for(var n=0;n<8;n++){var b=randBytes(10),s='';for(var i=0;i<10;i++)s+=A[b[i]%A.length];out.push(s.slice(0,5)+'-'+s.slice(5))}return out}
export function normRecovery(c){return String(c||'').toLowerCase().replace(/[^a-z0-9]/g,'')}

/* ---------- PBKDF2-SHA256 (WebCrypto) ---------- */
var PBKDF2_ITER=310000;
async function pbkdf2(pw,salt,iter){var k=await crypto.subtle.importKey('raw',TE.encode(pw),'PBKDF2',false,['deriveBits']);return toB64(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:salt,iterations:iter,hash:'SHA-256'},k,256)))}
async function makeHash(pw){var salt=randBytes(16);return {salt:toB64(salt),iter:PBKDF2_ITER,hash:await pbkdf2(pw,salt,PBKDF2_ITER)}}
async function checkHash(pw,rec){return ctEq(await pbkdf2(pw,fromB64(rec.salt),rec.iter),rec.hash)}

/* ---------- UI rate limit: 5 failures → 30 s lock, doubling to 15 min (per action, not per account: no enumeration) ---------- */
var RL='tj.auth.rl';
function rlAll(){try{return JSON.parse(localStorage.getItem(RL))||{}}catch(e){return {}}}
function rlSave(a){try{localStorage.setItem(RL,JSON.stringify(a))}catch(e){}}
export function rlWait(k){var m=rlAll()[k];return m&&m.until>Date.now()?Math.ceil((m.until-Date.now())/1000):0}
export function rlFail(k){var a=rlAll(),m=a[k]||{n:0,until:0,lock:0};m.n++;if(m.n>=5){m.lock=Math.min(900,m.lock?m.lock*2:30);m.until=Date.now()+m.lock*1000;m.n=0}a[k]=m;rlSave(a);return rlWait(k)}
export function rlOk(k){var a=rlAll();if(a[k]){a[k].n=0;rlSave(a)}}

/* ---------- validation shared by both adapters ---------- */
export var USERNAME_RE=/^[a-z0-9_.]{3,20}$/;
export function validEmail(e){return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e||''))}
export function pwProblem(p){return !p||p.length<8?'Use at least 8 characters':p.length>128?'Use at most 128 characters':''}

/* public user shape: {id,email,username,avatar,theme,marketing,optInAt,mfa,createdAt} */
var GUEST='tj.auth.guest';
export function isGuest(){try{return localStorage.getItem(GUEST)==='1'}catch(e){return false}}
export function setGuest(on){try{if(on)localStorage.setItem(GUEST,'1');else localStorage.removeItem(GUEST)}catch(e){}}

/* =================== LocalDemoAdapter (Test mode) =================== */
var LA='tj.auth.v1';
function LocalDemoAdapter(){
  var mem={pending:null,enroll:null};
  function db(){try{var d=JSON.parse(localStorage.getItem(LA));if(d&&Array.isArray(d.users))return d}catch(e){}return {users:[],session:null}}
  function put(d){localStorage.setItem(LA,JSON.stringify(d))}
  function find(d,login){var l=String(login||'').trim().toLowerCase();return d.users.find(function(u){return u.email===l||u.username===l})}
  function pub(u){return u&&{id:u.id,email:u.email,username:u.username,avatar:u.avatar||null,theme:u.theme||null,marketing:!!u.marketing,optInAt:u.optInAt||null,mfa:!!(u.totp&&u.totp.enabled),createdAt:u.createdAt}}
  function me(d){var s=d.session;return s&&d.users.find(function(u){return u.id===s.uid})}
  function upd(fn){var d=db(),u=me(d);if(!u)return {ok:false,error:'Signed out'};var r=fn(u,d);put(d);return r||{ok:true,user:pub(u)}}
  var dummy=null;
  return {kind:'local',
    init:function(){return Promise.resolve(this.current())},
    current:function(){return pub(me(db()))},
    pendingMfa:function(){return !!mem.pending},
    providers:function(){return []},
    usernameAvailable:function(n){n=String(n||'').toLowerCase();var mine=this.current();return Promise.resolve(USERNAME_RE.test(n)&&!db().users.some(function(u){return u.username===n&&(!mine||u.id!==mine.id)}))},
    signUp:async function(o){var d=db(),email=String(o.email||'').trim().toLowerCase(),un=String(o.username||'').trim().toLowerCase();
      if(d.users.some(function(u){return u.email===email}))return {ok:false,error:'An account with this email already exists',field:'email'};
      if(d.users.some(function(u){return u.username===un}))return {ok:false,error:'That username is taken',field:'username'};
      var now=new Date().toISOString(),u={id:'u_'+hex(randBytes(8)),email:email,username:un,pw:await makeHash(o.password),createdAt:now,marketing:!!o.marketing,optInAt:o.marketing?now:null,theme:o.theme||null,avatar:null,totp:null};
      d=db();d.users.push(u);d.session={uid:u.id,at:now};put(d);return {ok:true,user:pub(u)}},
    signIn:async function(o){var d=db(),u=find(d,o.login);
      if(!u){if(!dummy)dummy=await makeHash('x'+Math.random());await checkHash(String(o.password||''),dummy);return {ok:false,error:'Wrong email/username or password'}}
      if(!(await checkHash(String(o.password||''),u.pw)))return {ok:false,error:'Wrong email/username or password'};
      if(u.totp&&u.totp.enabled){mem.pending=u.id;return {ok:false,mfa:true}}
      d=db();d.session={uid:u.id,at:new Date().toISOString()};put(d);return {ok:true,user:pub(u)}},
    verifyMfa:async function(code){var d=db(),u=d.users.find(function(x){return x.id===mem.pending});if(!u)return {ok:false,error:'Sign in again'};
      var st=await totpCheck(u.totp.secret,code,u.totp.last);if(st==null)return {ok:false,error:'That code didn\'t work'};
      d=db();u=d.users.find(function(x){return x.id===mem.pending});u.totp.last=st;d.session={uid:u.id,at:new Date().toISOString(),aal:2};mem.pending=null;put(d);return {ok:true,user:pub(u)}},
    useRecovery:async function(code){var d=db(),u=d.users.find(function(x){return x.id===mem.pending});if(!u)return {ok:false,error:'Sign in again'};
      var h=await sha256hex(normRecovery(code)),i=(u.totp.recovery||[]).indexOf(h);if(i<0)return {ok:false,error:'That recovery code didn\'t work'};
      u.totp.recovery.splice(i,1);d.session={uid:u.id,at:new Date().toISOString(),aal:2};mem.pending=null;put(d);return {ok:true,user:pub(u),left:u.totp.recovery.length}},
    cancelMfa:function(){mem.pending=null},
    signOut:function(){var d=db();d.session=null;put(d);mem.pending=null;mem.enroll=null;return Promise.resolve({ok:true})},
    resetPassword:function(){return Promise.resolve({ok:false,error:'Test mode can\'t send email. Connect Supabase to enable password reset.'})},
    updateProfile:function(p){var self=this;return (p.username!=null?self.usernameAvailable(p.username):Promise.resolve(true)).then(function(free){
      if(!free)return {ok:false,error:USERNAME_RE.test(String(p.username).toLowerCase())?'That username is taken':'3–20 characters: a–z, 0–9, _ or .',field:'username'};
      return upd(function(u){if(p.username!=null)u.username=String(p.username).toLowerCase();if(p.theme!=null)u.theme=p.theme;
        if(p.marketing!=null&&!!p.marketing!==!!u.marketing){u.marketing=!!p.marketing;if(u.marketing){u.optInAt=new Date().toISOString();u.optOutAt=null}else u.optOutAt=new Date().toISOString()}})})},
    setAvatar:function(blob,dataUrl){return Promise.resolve(upd(function(u){u.avatar=dataUrl}))},
    changePassword:async function(cur,next){var u=me(db());if(!u)return {ok:false,error:'Signed out'};if(!(await checkHash(String(cur||''),u.pw)))return {ok:false,error:'Current password is wrong',field:'current'};
      var h=await makeHash(next);return upd(function(x){x.pw=h})},
    mfaEnroll:async function(){var u=me(db());if(!u)return {ok:false,error:'Signed out'};var secret=b32enc(randBytes(20));mem.enroll=secret;return {ok:true,secret:secret,uri:otpauthUri(secret,u.username)}},
    mfaVerifyEnroll:async function(code){if(!mem.enroll)return {ok:false,error:'Start again'};var st=await totpCheck(mem.enroll,code,null);if(st==null)return {ok:false,error:'That code didn\'t work'};
      var codes=newRecoveryCodes(),hs=[];for(var i=0;i<codes.length;i++)hs.push(await sha256hex(normRecovery(codes[i])));var secret=mem.enroll;mem.enroll=null;
      var r=upd(function(u){u.totp={secret:secret,enabled:true,last:st,recovery:hs,since:new Date().toISOString()}});return r.ok?{ok:true,recovery:codes,user:r.user}:r},
    mfaDisable:async function(code){var u=me(db());if(!u||!u.totp)return {ok:false,error:'2FA is off'};var ok=await totpCheck(u.totp.secret,code,u.totp.last)!=null;
      if(!ok){var h=await sha256hex(normRecovery(code));ok=(u.totp.recovery||[]).indexOf(h)>=0}if(!ok)return {ok:false,error:'That code didn\'t work'};return upd(function(x){x.totp=null})},
    deleteAccount:async function(pw){var d=db(),u=me(d);if(!u)return {ok:false,error:'Signed out'};if(!(await checkHash(String(pw||''),u.pw)))return {ok:false,error:'Password is wrong',field:'password'};
      d=db();d.users=d.users.filter(function(x){return x.id!==u.id});d.session=null;put(d);return {ok:true}},
    setNewPassword:function(){return Promise.resolve({ok:false,error:'Not available in test mode'})},
    onEvent:function(){}};
}

/* =================== SupabaseAdapter =================== */
/* Uses the schema in supabase/schema.sql (profiles + RLS, username_available, login_email, verify_my_password,
   set_recovery_codes, redeem_recovery_code, delete_my_account). supabase-js is loaded from the CDN only when configured. */
function SupabaseAdapter(){
  var sb=null,user=null,pending=false,enroll=null,events=[];
  function emit(e){events.forEach(function(f){f(e)})}
  function errMsg(e){var m=(e&&e.message)||'Something went wrong';if(/invalid login/i.test(m))return 'Wrong email/username or password';if(/not confirmed/i.test(m))return 'Confirm your email first (check your inbox)';if(/rate limit|too many/i.test(m))return 'Too many attempts. Try again later.';if(/failed to fetch|networkerror|load failed|network request failed/i.test(m))return 'Can\'t reach the server. Check your connection and try again.';return m}
  async function load(){if(sb)return sb;var mod=await import(SUPABASE_CDN);sb=mod.createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'}});
    sb.auth.onAuthStateChange(function(ev){if(ev==='PASSWORD_RECOVERY')emit('recovery')});return sb}
  async function refresh(){var s=(await sb.auth.getSession()).data.session;if(!s){user=null;pending=false;return null}
    var al=(await sb.auth.mfa.getAuthenticatorAssuranceLevel()).data;if(al&&al.nextLevel==='aal2'&&al.currentLevel!=='aal2'){pending=true;user=null;return null}
    pending=false;var p=(await sb.from('profiles').select('*').eq('id',s.user.id).single()).data||{},f=(await sb.auth.mfa.listFactors()).data||{};
    user={id:s.user.id,email:s.user.email,username:p.username||'',avatar:p.avatar_url||null,theme:p.theme||null,marketing:!!p.marketing_opt_in,optInAt:p.opt_in_at||null,mfa:!!(f.totp||[]).some(function(x){return x.status==='verified'}),createdAt:p.created_at||s.user.created_at};return user}
  function redirect(){return AUTH_REDIRECT||location.href.split('#')[0].split('?')[0]}
  function totpFactor(){return sb.auth.mfa.listFactors().then(function(r){return ((r.data&&r.data.totp)||[]).find(function(x){return x.status==='verified'})})}
  return {kind:'supabase',
    init:async function(){await load();return refresh()},
    current:function(){return user},
    pendingMfa:function(){return pending},
    providers:function(){return OAUTH_PROVIDERS||[]},
    oauth:async function(provider){await load();var r=await sb.auth.signInWithOAuth({provider:provider,options:{redirectTo:redirect()}});return r.error?{ok:false,error:errMsg(r.error)}:{ok:true}},
    usernameAvailable:async function(n){await load();n=String(n||'').toLowerCase();if(!USERNAME_RE.test(n))return false;if(user&&user.username===n)return true;var r=await sb.rpc('username_available',{p_username:n});return !r.error&&r.data===true},
    signUp:async function(o){await load();if(!(await this.usernameAvailable(o.username)))return {ok:false,error:'That username is taken',field:'username'};
      var r=await sb.auth.signUp({email:String(o.email).trim(),password:o.password,options:{emailRedirectTo:redirect(),data:{username:String(o.username).toLowerCase(),marketing_opt_in:!!o.marketing}}});
      if(r.error)return {ok:false,error:errMsg(r.error)};if(!r.data.session)return {ok:true,confirm:true};await refresh();if(o.theme)await this.updateProfile({theme:o.theme});return {ok:true,user:user}},
    signIn:async function(o){await load();var login=String(o.login||'').trim(),email=login;
      if(login.indexOf('@')<0){var q=await sb.rpc('login_email',{p_login:login.toLowerCase(),p_password:o.password});if(q.error)return {ok:false,error:errMsg(q.error)};if(!q.data)return {ok:false,error:'Wrong email/username or password'};email=q.data}
      var r=await sb.auth.signInWithPassword({email:email,password:o.password});if(r.error)return {ok:false,error:errMsg(r.error)};
      await refresh();return pending?{ok:false,mfa:true}:{ok:true,user:user}},
    verifyMfa:async function(code){var f=await totpFactor();if(!f)return {ok:false,error:'Sign in again'};var r=await sb.auth.mfa.challengeAndVerify({factorId:f.id,code:String(code).trim()});if(r.error)return {ok:false,error:'That code didn\'t work'};await refresh();return {ok:true,user:user}},
    useRecovery:async function(code){var r=await sb.rpc('redeem_recovery_code',{p_hash:await sha256hex(normRecovery(code))});if(r.error||r.data!==true)return {ok:false,error:'That recovery code didn\'t work'};
      await sb.auth.refreshSession();await refresh();return {ok:true,user:user,mfaRemoved:true}},
    cancelMfa:function(){if(sb)sb.auth.signOut();pending=false},
    signOut:async function(){await load();await sb.auth.signOut();user=null;pending=false;return {ok:true}},
    resetPassword:async function(email){await load();var r=await sb.auth.resetPasswordForEmail(String(email).trim(),{redirectTo:redirect()});return r.error?{ok:false,error:errMsg(r.error)}:{ok:true}},
    setNewPassword:async function(pw){var r=await sb.auth.updateUser({password:pw});if(r.error)return {ok:false,error:errMsg(r.error)};await refresh();return {ok:true,user:user}},
    updateProfile:async function(p){var patch={};if(p.username!=null){var n=String(p.username).toLowerCase();if(!(await this.usernameAvailable(n)))return {ok:false,error:USERNAME_RE.test(n)?'That username is taken':'3–20 characters: a–z, 0–9, _ or .',field:'username'};patch.username=n}
      if(p.theme!=null)patch.theme=p.theme;if(p.marketing!=null)patch.marketing_opt_in=!!p.marketing;
      var r=await sb.from('profiles').update(patch).eq('id',user.id);if(r.error)return {ok:false,error:r.error.code==='23505'?'That username is taken':errMsg(r.error)};await refresh();return {ok:true,user:user}},
    setAvatar:async function(blob){var path=user.id+'/avatar.jpg',r=await sb.storage.from('avatars').upload(path,blob,{upsert:true,contentType:'image/jpeg',cacheControl:'3600'});if(r.error)return {ok:false,error:errMsg(r.error)};
      var url=sb.storage.from('avatars').getPublicUrl(path).data.publicUrl+'?v='+Date.now();var u=await sb.from('profiles').update({avatar_url:url}).eq('id',user.id);if(u.error)return {ok:false,error:errMsg(u.error)};await refresh();return {ok:true,user:user}},
    changePassword:async function(cur,next){var v=await sb.rpc('verify_my_password',{p_password:cur});if(v.error||v.data!==true)return {ok:false,error:'Current password is wrong',field:'current'};
      var r=await sb.auth.updateUser({password:next});return r.error?{ok:false,error:errMsg(r.error)}:{ok:true,user:user}},
    mfaEnroll:async function(){var l=(await sb.auth.mfa.listFactors()).data||{};for(var f of (l.all||[]))if(f.factor_type==='totp'&&f.status!=='verified')await sb.auth.mfa.unenroll({factorId:f.id});
      var r=await sb.auth.mfa.enroll({factorType:'totp',issuer:APP_NAME,friendlyName:APP_NAME+' '+new Date().toISOString().slice(0,10)});if(r.error)return {ok:false,error:errMsg(r.error)};enroll=r.data.id;
      return {ok:true,secret:r.data.totp.secret,uri:r.data.totp.uri}},
    mfaVerifyEnroll:async function(code){var r=await sb.auth.mfa.challengeAndVerify({factorId:enroll,code:String(code).trim()});if(r.error)return {ok:false,error:'That code didn\'t work'};
      var codes=newRecoveryCodes(),hs=[];for(var c of codes)hs.push(await sha256hex(normRecovery(c)));await sb.rpc('set_recovery_codes',{p_hashes:hs});enroll=null;await refresh();return {ok:true,recovery:codes,user:user}},
    mfaDisable:async function(code){var f=await totpFactor();if(!f)return {ok:false,error:'2FA is off'};
      if(!/^\s*\d{6}\s*$/.test(code)){var rc=await sb.rpc('redeem_recovery_code',{p_hash:await sha256hex(normRecovery(code))});if(rc.error||rc.data!==true)return {ok:false,error:'That code didn\'t work'};await sb.auth.refreshSession();await refresh();return {ok:true,user:user}}
      var v=await sb.auth.mfa.challengeAndVerify({factorId:f.id,code:String(code).trim()});if(v.error)return {ok:false,error:'That code didn\'t work'};
      await sb.rpc('set_recovery_codes',{p_hashes:[]});var r=await sb.auth.mfa.unenroll({factorId:f.id});if(r.error)return {ok:false,error:errMsg(r.error)};await sb.auth.refreshSession();await refresh();return {ok:true,user:user}},
    deleteAccount:async function(pw){var v=await sb.rpc('verify_my_password',{p_password:pw});if(v.error||v.data!==true)return {ok:false,error:'Password is wrong',field:'password'};
      await sb.storage.from('avatars').remove([user.id+'/avatar.jpg']);var r=await sb.rpc('delete_my_account');if(r.error)return {ok:false,error:errMsg(r.error)};await sb.auth.signOut();user=null;return {ok:true}},
    onEvent:function(f){events.push(f)}};
}

var adapter=null;
/* window.__TJ_FORCE_LOCAL is set only by the automated tests (init script) so they never touch the real project */
export function auth(){if(!adapter)adapter=SUPABASE_URL&&SUPABASE_ANON_KEY&&!(typeof window!=='undefined'&&window.__TJ_FORCE_LOCAL===true)?SupabaseAdapter():LocalDemoAdapter();return adapter}
export function testMode(){return auth().kind==='local'}

/* =================== QR code (byte mode, ECC M, versions 1–40) — no dependencies =================== */
var QR_ECC=[-1,10,16,26,18,24,16,18,22,22,26,30,22,22,24,24,28,28,26,26,26,26,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28];
var QR_BLK=[-1,1,1,1,2,2,4,4,4,5,5,5,8,9,9,10,10,11,13,14,16,17,17,18,20,21,23,25,26,28,29,31,33,35,37,38,40,43,45,47,49];
function qrRaw(v){var r=(16*v+128)*v+64;if(v>=2){var n=Math.floor(v/7)+2;r-=(25*n-10)*n-55;if(v>=7)r-=36}return r}
function qrData(v){return Math.floor(qrRaw(v)/8)-QR_ECC[v]*QR_BLK[v]}
function gfMul(x,y){var z=0;for(var i=7;i>=0;i--){z=(z<<1)^((z>>>7)*0x11D);z^=((y>>>i)&1)*x}return z&255}
function rsDiv(d){var r=[];for(var i=0;i<d;i++)r.push(0);r[d-1]=1;var root=1;for(i=0;i<d;i++){for(var j=0;j<r.length;j++){r[j]=gfMul(r[j],root);if(j+1<r.length)r[j]^=r[j+1]}root=gfMul(root,2)}return r}
function rsRem(data,div){var r=div.map(function(){return 0});data.forEach(function(b){var f=b^r.shift();r.push(0);div.forEach(function(c,i){r[i]^=gfMul(c,f)})});return r}
export function qrMatrix(text){var bytes=Array.from(TE.encode(text)),v=1;
  for(;v<=40;v++){if(4+(v<10?8:16)+bytes.length*8<=qrData(v)*8)break}if(v>40)throw new Error('Too long for a QR code');
  var bits=[];function put(val,len){for(var i=len-1;i>=0;i--)bits.push((val>>>i)&1)}
  put(4,4);put(bytes.length,v<10?8:16);bytes.forEach(function(b){put(b,8)});var cap=qrData(v)*8;put(0,Math.min(4,cap-bits.length));put(0,(8-bits.length%8)%8);
  for(var pad=0xEC;bits.length<cap;pad^=0xEC^0x11)put(pad,8);
  var data=[];for(var i=0;i<bits.length;i+=8){var x=0;for(var k=0;k<8;k++)x=(x<<1)|bits[i+k];data.push(x)}
  var nb=QR_BLK[v],ecl=QR_ECC[v],raw=Math.floor(qrRaw(v)/8),nShort=nb-raw%nb,shortLen=Math.floor(raw/nb),div=rsDiv(ecl),blocks=[];
  for(i=0,k=0;i<nb;i++){var dat=data.slice(k,k+shortLen-ecl+(i<nShort?0:1));k+=dat.length;var ec=rsRem(dat,div);if(i<nShort)dat.push(0);blocks.push(dat.concat(ec))}
  var all=[];for(i=0;i<blocks[0].length;i++)blocks.forEach(function(b,j){if(i!==shortLen-ecl||j>=nShort)all.push(b[i])});
  var size=v*4+17,M=[],F=[];for(i=0;i<size;i++){M.push(new Array(size).fill(false));F.push(new Array(size).fill(false))}
  function fn(x,y,d){M[y][x]=d;F[y][x]=true}
  for(i=0;i<size;i++){fn(6,i,i%2===0);fn(i,6,i%2===0)}
  [[3,3],[size-4,3],[3,size-4]].forEach(function(p){for(var dy=-4;dy<=4;dy++)for(var dx=-4;dx<=4;dx++){var dist=Math.max(Math.abs(dx),Math.abs(dy)),xx=p[0]+dx,yy=p[1]+dy;if(xx>=0&&xx<size&&yy>=0&&yy<size)fn(xx,yy,dist!==2&&dist!==4)}});
  var al=[];if(v>1){var na=Math.floor(v/7)+2,step=v===32?26:Math.ceil((v*4+4)/(na*2-2))*2;al=[6];for(var pos=size-7;al.length<na;pos-=step)al.splice(1,0,pos)}
  al.forEach(function(ax,ai){al.forEach(function(ay,aj){if((ai===0&&aj===0)||(ai===0&&aj===al.length-1)||(ai===al.length-1&&aj===0))return;for(var dy=-2;dy<=2;dy++)for(var dx=-2;dx<=2;dx++)fn(ax+dx,ay+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1)})});
  function fmt(mask){var d=(0<<3)|mask,r=d;for(var q=0;q<10;q++)r=(r<<1)^((r>>>9)*0x537);var b=((d<<10)|r)^0x5412,g=function(n){return ((b>>>n)&1)!==0};
    for(var q2=0;q2<=5;q2++)fn(8,q2,g(q2));fn(8,7,g(6));fn(8,8,g(7));fn(7,8,g(8));for(q2=9;q2<15;q2++)fn(14-q2,8,g(q2));
    for(q2=0;q2<8;q2++)fn(size-1-q2,8,g(q2));for(q2=8;q2<15;q2++)fn(8,size-15+q2,g(q2));fn(8,size-8,true)}
  fmt(0);
  if(v>=7){var r2=v;for(i=0;i<12;i++)r2=(r2<<1)^((r2>>>11)*0x1F25);var vb=(v<<12)|r2;for(i=0;i<18;i++){var bit=((vb>>>i)&1)!==0,a=size-11+i%3,c=Math.floor(i/3);fn(a,c,bit);fn(c,a,bit)}}
  var bi=0;for(var right=size-1;right>=1;right-=2){if(right===6)right=5;for(var vert=0;vert<size;vert++)for(var j=0;j<2;j++){var x=right-j,up=((right+1)&2)===0,y=up?size-1-vert:vert;
    if(!F[y][x]&&bi<all.length*8){M[y][x]=((all[bi>>>3]>>>(7-(bi&7)))&1)!==0;bi++}}}
  function maskBit(m,x,y){switch(m){case 0:return (x+y)%2===0;case 1:return y%2===0;case 2:return x%3===0;case 3:return (x+y)%3===0;case 4:return (Math.floor(x/3)+Math.floor(y/2))%2===0;case 5:return x*y%2+x*y%3===0;case 6:return (x*y%2+x*y%3)%2===0;default:return ((x+y)%2+x*y%3)%2===0}}
  function applyMask(m){for(var y=0;y<size;y++)for(var x=0;x<size;x++)if(!F[y][x]&&maskBit(m,x,y))M[y][x]=!M[y][x]}
  function penalty(){var p=0,dark=0,x,y;for(y=0;y<size;y++){var run=1;for(x=1;x<size;x++){if(M[y][x]===M[y][x-1]){run++;if(run===5)p+=3;else if(run>5)p++}else run=1}}
    for(x=0;x<size;x++){run=1;for(y=1;y<size;y++){if(M[y][x]===M[y-1][x]){run++;if(run===5)p+=3;else if(run>5)p++}else run=1}}
    for(y=0;y<size-1;y++)for(x=0;x<size-1;x++){var c=M[y][x];if(c===M[y][x+1]&&c===M[y+1][x]&&c===M[y+1][x+1])p+=3}
    for(y=0;y<size;y++)for(x=0;x<size;x++)if(M[y][x])dark++;p+=Math.floor(Math.abs(dark*20-size*size*10)/(size*size))*10;return p}
  var best=0,bestP=Infinity;for(var m=0;m<8;m++){applyMask(m);fmt(m);var pp=penalty();if(pp<bestP){bestP=pp;best=m}applyMask(m)}
  applyMask(best);fmt(best);return M}
/* draw to a canvas: dark modules on white with the 4-module quiet zone (scanners need light background) */
export function qrCanvas(text,px){var M=qrMatrix(text),n=M.length,q=4,s=px||6,c=document.createElement('canvas');c.width=c.height=(n+q*2)*s;var g=c.getContext('2d');
  g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.fillStyle='#000';for(var y=0;y<n;y++)for(var x=0;x<n;x++)if(M[y][x])g.fillRect((x+q)*s,(y+q)*s,s,s);return c}
