/* 登录页: 邮箱 → magic link + OTP 同一封邮件; 第三方 → Better Auth 社交登录 */
const $=id=>document.getElementById(id);
const q=new URLSearchParams(location.search);
const msg=(t,cls='')=>{ const m=$('msg'); m.textContent=t; m.className='msg '+cls; };
const post=(path,body)=>fetch('/api/auth'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const ICONS={
  google:'<svg viewBox="0 0 24 24"><path fill="#4285F4" d="M22.6 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h6c-.3 1.4-1 2.5-2.2 3.3v2.8h3.6c2.1-1.9 3.2-4.8 3.2-8.1z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.6H2.1v2.9C3.9 20.5 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.8 14c-.2-.7-.4-1.4-.4-2.1s.1-1.4.4-2.1V6.9H2.1C1.4 8.4 1 10.1 1 12s.4 3.6 1.1 5.1L5.8 14z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2C17.5 2.1 15 1 12 1 7.7 1 3.9 3.5 2.1 6.9L5.8 9.8c.9-2.7 3.3-4.4 6.2-4.4z"/></svg>',
  microsoft:'<svg viewBox="0 0 24 24"><path fill="#F25022" d="M2 2h9.5v9.5H2z"/><path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z"/><path fill="#00A4EF" d="M2 12.5h9.5V22H2z"/><path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z"/></svg>',
  github:'<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.2.8-.6v-2c-3.2.7-3.9-1.4-3.9-1.4-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.2c0 .3.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z"/></svg>'};
const NAMES={google:'使用 Google 登录',microsoft:'使用 Microsoft 账号登录',github:'使用 GitHub 登录'};

(async()=>{
  // 已登录直接回首页
  try{ const r=await fetch('/api/me'); if((await r.json()).user){ location.href='/'; return; } }catch(e){}
  if(q.get('email')) $('email').value=q.get('email');
  if(q.get('error')) msg('登录链接无效或已过期，请重新发送','bad');
  try{ const cfg=await (await fetch('/api/auth-config')).json(); const ps=cfg.providers||[];
    if(!ps.length){ $('sep').hidden=true; }
    if(!cfg.email){ $('emailForm').hidden=true; $('otp').hidden=true; if(!ps.length) msg('当前站点未开启登录，进度保存在本机浏览器','bad'); }
    $('social').innerHTML=ps.map(p=>`<button data-p="${p}">${ICONS[p]||''}${NAMES[p]||p}</button>`).join('');
    $('social').querySelectorAll('button').forEach(b=>b.onclick=async()=>{ b.disabled=true; try{ const r=await post('/sign-in/social',{provider:b.dataset.p,callbackURL:'/',errorCallbackURL:'/login.html?error=social'}); const j=await r.json(); if(j.url) location.href=j.url; else msg(j.message||'跳转失败','bad'); }catch(e){ msg('网络错误','bad'); } b.disabled=false; });
  }catch(e){}
})();

$('emailForm').onsubmit=async e=>{
  e.preventDefault(); const email=$('email').value.trim(); if(!email) return;
  $('sendBtn').disabled=true; msg('发送中…');
  try{
    const r=await post('/sign-in/magic-link',{email,callbackURL:'/',errorCallbackURL:'/login.html?error=link'});
    const j=await r.json().catch(()=>({}));
    if(r.ok){ msg('已发送，请查收邮箱（也看看垃圾邮件）','ok'); $('otp').classList.add('open'); $('code').focus(); }
    else msg(j.message||'发送失败，稍后再试','bad');
  }catch(x){ msg('网络错误','bad'); }
  $('sendBtn').disabled=false;
};
$('otpForm').onsubmit=async e=>{
  e.preventDefault(); const email=$('email').value.trim(), otp=$('code').value.trim(); if(!/^\d{6}$/.test(otp)){ msg('请输入 6 位数字','bad'); return; }
  $('otpBtn').disabled=true;
  try{ const r=await post('/sign-in/email-otp',{email,otp}); const j=await r.json().catch(()=>({})); if(r.ok) location.href='/'; else msg(j.code==='INVALID_OTP'?'验证码不对或已过期':(j.message||'登录失败'),'bad'); }
  catch(x){ msg('网络错误','bad'); }
  $('otpBtn').disabled=false;
};
