/* 英语练习 — 课程(courses.json) → 词库(decks/<course>/*.json) → 条目. 进度存 /api/progress (progress.json). */
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const today=()=>new Date().toISOString().slice(0,10);
const KEY='pte-typing-v1';

/* ---------- 词库: 过滤器按 filter.kind 生成 ---------- */
const POS=['','adj+n','v+n','adv+adj','adv+vpp','n+n'];
const FILTERS={
  sublist:{filters:items=>{const g=Math.max(0,...items.map(it=>+it.g||0));return ['全部',...Array.from({length:g},(_,i)=>`Sublist ${i+1}`)]}, match:(it,f)=>f===0||it.g===f},
  pos:{filters:()=>['全部','adj+n 形+名','v+n 动+名','adv+adj 副+形','adv+vpp 副+分词','n+n 名+名','其他'], match:(it,f)=>f===0||(f===6?!POS.includes(it.p):it.p===POS[f])},
  chunk100:{filters:items=>['全部',...Array.from({length:Math.ceil(items.length/100)},(_,i)=>`${i*100+1}–${Math.min((i+1)*100,items.length)}`)], match:(it,f)=>f===0||Math.ceil((it.n||0)/100)===f},
  none:{filters:()=>['全部'], match:()=>true},
};
let COURSES=[], DECKS={};
/* 目录只带元数据(条数/地址), 条目按课程用到时再下载 */
function buildDecks(courses,list){
  COURSES=courses; DECKS={};
  for(const d of list){
    const kind=(d.filter&&FILTERS[d.filter.kind])?d.filter.kind:'none';
    const D={name:d.name,course:d.course,kind:d.kind||'word',count:d.count||0,url:d.url,items:null,filterName:(d.filter&&d.filter.name)||'范围',match:FILTERS[kind].match};
    D.filters=()=>FILTERS[kind].filters(D.items||[]);
    DECKS[d.id]=D;
  }
  DECKS.fav={name:'收藏',virtual:true};
  DECKS.wrong={name:'错题',virtual:true};
}
const loading={};
async function ensureDeck(id){
  const d=DECKS[id]; if(!d||d.virtual||d.items) return;
  if(!loading[id]) loading[id]=fetch(d.url).then(r=>{ if(!r.ok) throw new Error(r.status); return r.json(); }).then(j=>{ d.items=j.items||[]; }).catch(e=>{ toast(`词库 ${d.name} 加载失败`); d.items=[]; }).finally(()=>{ delete loading[id]; });
  await loading[id];
}
const ensureCourse=c=>Promise.all(courseDecks(c).map(ensureDeck));
const courseDecks=c=>Object.keys(DECKS).filter(k=>!DECKS[k].virtual&&DECKS[k].course===c);

/* ---------- 账号与进度 ----------
   登录后: 服务器是唯一真相. 每答一题产生一条事件 {deck, idx, ok, ts, day}, 攒起来批量 POST; 收藏/界面偏好单独接口.
   未登录: 只存本机 localStorage(游客模式), 登录后可一键并入账号. */
const blank=()=>({fav:{},rec:{},daily:{},ui:{}});
let S=blank(), me=null;
const QKEY='le-events-v1';
let evq=[]; try{ evq=JSON.parse(localStorage.getItem(QKEY)||'[]'); }catch(e){ evq=[]; }
function cacheLocal(){ try{ localStorage.setItem(KEY,JSON.stringify(S)); }catch(e){} }
let AUTH={providers:[],email:false};
async function loadMe(){ try{ const [r,c]=await Promise.all([fetch('/api/me',{cache:'no-store'}),fetch('/api/auth-config',{cache:'no-store'})]); me=(await r.json()).user||null; AUTH=await c.json(); }catch(e){ me=null; } }
const canLogin=()=>AUTH.email||(AUTH.providers&&AUTH.providers.length);
async function loadProgress(){
  let local=null; try{ local=JSON.parse(localStorage.getItem(KEY)||'null'); }catch(e){}
  if(me){
    try{ const r=await fetch('/api/progress',{cache:'no-store'}); if(r.ok){ S=Object.assign(blank(),await r.json()); cacheLocal(); offerImport(local); return; } }catch(e){}
    toast('读取云端进度失败，先用本机缓存');
  }
  S=Object.assign(blank(),local||{});
}
/* 本机(游客期间)有记录而云端没有 → 提示并入 */
function offerImport(local){
  if(!local||!local.rec) return;
  const mine=Object.keys(local.rec).filter(k=>!S.rec[k]).length; if(!mine) return;
  showAction(`本机有 ${mine} 条未同步的练习记录`, '并入账号', async()=>{
    try{ const r=await fetch('/api/progress/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(local)}); if(!r.ok) throw 0; const rr=await fetch('/api/progress',{cache:'no-store'}); S=Object.assign(blank(),await rr.json()); invalidateStats(); cacheLocal(); renderCourses(); renderDecks(); renderStats(); toast('已并入'); }
    catch(e){ toast('并入失败'); }
  });
}
let flushT=null, backoff=1000;
function pushEvent(ev){ if(!me) return; evq.push(ev); try{ localStorage.setItem(QKEY,JSON.stringify(evq)); }catch(e){} clearTimeout(flushT); flushT=setTimeout(flushEvents,800); }
async function flushEvents(){
  if(!me||!evq.length) return;
  const batch=evq.slice(0,200);
  try{
    const r=await fetch('/api/progress/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({events:batch})});
    if(r.status===401){ me=null; renderAccount(); toast('登录已过期，进度暂存本机'); return; }
    if(!r.ok) throw new Error(r.status);
    evq=evq.slice(batch.length); localStorage.setItem(QKEY,JSON.stringify(evq)); backoff=1000; syncState('ok');
    if(evq.length) flushEvents();
  }catch(e){ syncState('retry'); flushT=setTimeout(flushEvents,backoff); backoff=Math.min(backoff*2,30000); }
}
window.addEventListener('online',flushEvents);
window.addEventListener('beforeunload',()=>{ if(me&&evq.length){ try{ fetch('/api/progress/events',{method:'POST',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify({events:evq.slice(0,200)})}); }catch(e){} } });
let uiT=null;
function save(){ cacheLocal(); if(me){ clearTimeout(uiT); uiT=setTimeout(()=>fetch('/api/progress/ui',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({ui:S.ui})}).catch(()=>{}),1500); } }
async function apiFav(deck,idx,on){ if(!me) return; try{ await fetch('/api/progress/fav',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({deck,idx,on})}); }catch(e){ toast('收藏未同步'); } }
function syncState(st){ const el=$('sync'); if(!el) return; el.textContent=st==='retry'?`· ${evq.length} 条待同步`:''; }
let toastT=null;
function toast(msg){ const t=$('toast'); t.textContent=msg; t.hidden=false; clearTimeout(toastT); toastT=setTimeout(()=>t.hidden=true,2600); }
function showAction(msg,label,fn){ const t=$('toast'); t.innerHTML=`${esc(msg)} <button class="tbtn">${esc(label)}</button>`; t.hidden=false; clearTimeout(toastT); t.querySelector('button').onclick=()=>{ t.hidden=true; fn(); }; toastT=setTimeout(()=>t.hidden=true,15000); }

/* ---------- 账号区(侧边栏底部) ---------- */
function renderAccount(){
  const a=$('account'); if(!a) return;
  if(me) a.innerHTML=`<span class="who" title="${esc(me.email)}">${esc(me.name||me.email)}</span><button id="logout">退出</button>`;
  else if(canLogin()) a.innerHTML=`<a class="login" href="/login.html">登录 / 注册</a><small>未登录，进度只存在本机</small>`;
  else a.innerHTML=`<small>进度保存在本机浏览器，可在设置里导出备份</small>`;
  const lo=$('logout'); if(lo) lo.onclick=async()=>{ await flushEvents(); await fetch('/api/auth/sign-out',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).catch(()=>{}); try{ localStorage.removeItem(KEY); localStorage.removeItem(QKEY); }catch(e){} location.reload(); };
  const del=$('deleteAccount'); if(del) del.hidden=!me;
}

/* ---------- state ---------- */
let course=null, deck=null, filter=0, queue=[], qi=0, cur=null, phase='typing', session={n:0,c:0,streak:0};
const idOf=(d,i)=>`${d}:${i}`;
const norm=s=>s.toLowerCase().replace(/[’']/g,"'").replace(/\s+/g,' ').trim();
/* 目标文本: "encourage (the) development (of)" 括号只是标记可选词, 不用打; 括号里的字符标 opt; 提交时省略可选词也算对 */
function targetOf(it){
  if(it._tg) return it._tg;
  const chars=[]; let depth=0;
  for(const ch of it.t){ if(ch==='('){depth++;continue;} if(ch===')'){depth=Math.max(0,depth-1);continue;} chars.push({ch,opt:depth>0}); }
  const out=[]; for(const c of chars){ if(c.ch===' '&&(out.length===0||out[out.length-1].ch===' ')) continue; out.push(c); }
  while(out.length&&out[out.length-1].ch===' ') out.pop();
  const full=out.map(c=>c.ch).join('');
  const toks=it.t.trim().split(/\s+/).map(w=>({w:w.replace(/[()]/g,''),opt:/^\(.*\)$/.test(w)}));
  const accept=new Set(); const walk=(i,acc)=>{ if(i===toks.length){ accept.add(norm(acc.join(' '))); return; } const t=toks[i]; walk(i+1,[...acc,t.w]); if(t.opt) walk(i+1,acc); };
  walk(0,[]);
  return it._tg={chars:out,full,accept,toks,hasOpt:out.some(c=>c.opt)};
}
const normCh=c=>c.toLowerCase().replace(/[’']/g,"'");
/* 打字过程中用: 长度必须和输入框内容一一对应(只做大小写/引号归一), 光标位置才能和真实输入对齐 */
const normLive=s=>s.toLowerCase().replace(/[’]/g,"'");
/* 输入法产生的字符清理: 全角转半角, 丢掉中文等非 ASCII 字符 */
function sanitize(v){
  let dropped=false;
  const out=[...v].map(ch=>{ const c=ch.charCodeAt(0);
    if(c===0x3000) return ' ';
    if(c>=0xFF01&&c<=0xFF5E) return String.fromCharCode(c-0xFEE0);
    if(ch==='’'||ch==='‘') return "'";
    if(c<0x20||c>0x7E){ dropped=true; return ''; }
    return ch; }).join('');
  return {v:out,dropped};
}
let composing=false, imeToastAt=0;
/* 光标位置由页面自己记账(caretPos), 不信任浏览器: 输入法切换/组合结束后 Chrome 会把光标丢回开头.
   每次 input 事件按"上次位置 + 长度变化"推算应在的位置并强制设回; ←→ Home End 由我们自己移动. */
let caretPos=0, lastVal='', forwardDelete=false;
function setCaret(pos){ const tp=$('typing'); caretPos=Math.max(0,Math.min(tp.value.length,pos)); if(tp.selectionStart!==caretPos||tp.selectionEnd!==caretPos) tp.setSelectionRange(caretPos,caretPos); }
function onInput(){
  const tp=$('typing');
  if(!composing){
    const r=sanitize(tp.value);
    if(r.v!==tp.value){ tp.value=r.v; }
    const delta=tp.value.length-lastVal.length;
    setCaret(forwardDelete?caretPos:caretPos+delta); forwardDelete=false;
    lastVal=tp.value;
    if(r.dropped&&Date.now()-imeToastAt>3000){ imeToastAt=Date.now(); toast('检测到中文输入法，请切到英文（中文字符已忽略）'); }
  }
  paint();
  autoSubmitCheck();
}
/* 打完自动提交: 输入长度达到完整目标且是可接受答案时, 不用按回车. 短的可选词省略形式仍需回车(否则打到一半就被提交) */
function autoSubmitCheck(){
  if(!cur||composing||phase==='done'||mode()==='say'||mode()==='read'||!$('autoSubmit').checked) return;
  const tg=targetOf(cur.it), v=$('typing').value;
  if(v.length>=tg.full.length&&tg.accept.has(norm(v))) submit();
}
function caretEnd(){ setCaret($('typing').value.length); }
const rec=id=>S.rec[id]||{c:0,w:0,streak:0};
const isMastered=id=>rec(id).streak>=2;
const isWeak=id=>{const r=rec(id);return r.w>0&&r.streak<2};
const segVal=id=>$(id).dataset.value;
const mode=()=>segVal('mode');
function setSeg(id,v){ $(id).dataset.value=v; $(id).querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.v===v)); }
// 词库按课程懒加载: 其他课程的词库 items 还是 null, 错题/收藏里引用到它们时要跳过, 不能直接取下标
const realItem=k=>{const [dd,i]=k.split(':'); const d=DECKS[dd]; return d&&!d.virtual&&d.items&&d.items[+i]?{deck:dd,idx:+i,it:d.items[+i]}:null;};

function allItems(d){
  if(d==='fav') return Object.keys(S.fav).filter(k=>S.fav[k]).map(realItem).filter(x=>x&&DECKS[x.deck].course===course);
  if(d==='wrong') return Object.keys(S.rec).filter(k=>isWeak(k)).map(realItem).filter(x=>x&&DECKS[x.deck].course===course);
  return DECKS[d].items.map((it,idx)=>({deck:d,idx,it}));
}
function score(x){const id=idOf(x.deck,x.idx); if(!S.rec[id]) return 1; const r=rec(id); return r.w*3 - r.streak + 1;}
function buildQueue(){
  let items=allItems(deck);
  if(!DECKS[deck].virtual) items=items.filter(x=>DECKS[deck].match(x.it,filter));
  if($('skipMastered').checked && deck!=='fav') items=items.filter(x=>!isMastered(idOf(x.deck,x.idx)));
  const order=segVal('order');
  if(order==='rand') items.sort(()=>Math.random()-.5);
  else if(order==='alpha') items.sort((a,b)=>a.it.t.toLowerCase().localeCompare(b.it.t.toLowerCase()));
  else if(order==='weak') items.sort((a,b)=>score(b)-score(a)||Math.random()-.5);
  if(order!=='weak'){ const un=items.filter(x=>!S.rec[idOf(x.deck,x.idx)]), pr=items.filter(x=>S.rec[idOf(x.deck,x.idx)]); items=un.concat(pr); }  // 没练过的优先
  queue=items; qi=0; savePos();
}
/* 本轮位置持久化: 课程/词库/范围/顺序/队列(按 id)/当前下标, 下次打开从这里继续 */
function savePos(){ S.ui.pos={course,deck,filter,order:segVal('order'),skip:$('skipMastered').checked,qi,ids:queue.map(x=>idOf(x.deck,x.idx))}; S.ui.course=course; S.ui.deck=deck; (S.ui.deckByCourse||(S.ui.deckByCourse={}))[course]=deck; save(); }
async function resume(){
  const p=S.ui.pos; if(!p||!DECKS[p.deck]||!Array.isArray(p.ids)) return false;
  deck=p.deck; course=DECKS[deck].virtual?(p.course||course):DECKS[deck].course; filter=+p.filter||0;
  setSeg('order',['seq','alpha','rand','weak'].includes(p.order)?p.order:'seq'); if(p.skip!==undefined) $('skipMastered').checked=p.skip;
  await ensureCourse(course); renderCourses(); renderFilter();
  queue=p.ids.map(realItem).filter(Boolean); qi=Math.min(+p.qi||0,queue.length);
  if(!queue.length||qi>=queue.length) return false;
  session={n:0,c:0,streak:0}; show();
  toast(`从上次继续：${DECKS[deck].name} ${qi+1} / ${queue.length}`);
  return true;
}

/* ---------- render ---------- */
let statCache=null;
function deckStat(k){
  if(!statCache){ statCache={}; for(const id in S.rec){ const dk=id.slice(0,id.lastIndexOf(':')); const st=statCache[dk]||(statCache[dk]={m:0,w:0,pr:0}); if(isMastered(id)) st.m++; else if(isWeak(id)) st.w++; else st.pr++; } }
  const d=DECKS[k], n=d.items?d.items.length:(d.count||0), st=statCache[k]||{m:0,w:0,pr:0};
  return {n,m:st.m,w:st.w,pr:st.pr,done:st.m+st.w+st.pr};
}
function invalidateStats(){ statCache=null; }
const pctStr=(a,b)=>{ if(!b) return '0%'; const p=a/b*100; return (p>0&&p<10?p.toFixed(1):Math.round(p))+'%'; };
function renderCourses(){
  $('courses').innerHTML=COURSES.map(c=>{
    let n=0,done=0,m=0; courseDecks(c.id).forEach(k=>{const s=deckStat(k); n+=s.n; done+=s.done; m+=s.m;});
    return `<button class="course ${c.id===course?'active':''}" data-course="${c.id}"><b>${esc(c.name)}</b><small>${esc(c.desc||'')}</small><span class="cp"><i><b style="width:${n?m/n*100:0}%"></b><b class="prog" style="width:${n?(done-m)/n*100:0}%"></b></i>${done} / ${n} · ${pctStr(done,n)}</span></button>`;
  }).join('');
  document.querySelectorAll('.course').forEach(t=>t.onclick=()=>{ switchCourse(t.dataset.course); if(window.innerWidth<900) setSide(false); });
  const d=S.daily[today()]||{n:0,c:0}; $('sideToday').textContent=d.n; $('sideTodayOk').textContent=d.c;
}
async function switchCourse(c){
  if(!COURSES.some(x=>x.id===c)) return;
  course=c; const ds=courseDecks(c); const remembered=(S.ui.deckByCourse||{})[c];
  deck=(remembered&&DECKS[remembered]&&(DECKS[remembered].virtual||DECKS[remembered].course===c))?remembered:(ds[0]||'fav');
  filter=0; renderCourses(); renderDecks(); $('word').innerHTML='<div class="final">加载中…</div>';
  await ensureCourse(c); renderFilter(); restart();
}
function renderDecks(){
  const keys=[...courseDecks(course),'fav','wrong'];
  $('decks').classList.toggle('many', keys.length>10);   // 词库多的课程(如口语 39 个场景)用紧凑标签
  $('decks').innerHTML=keys.map(k=>{
    const d=DECKS[k]; let sub='',pm=0,pp=0,pw=0;
    if(!d.virtual){ const s=deckStat(k); sub=s.n?`已练 ${s.done} / ${s.n} · ${pctStr(s.done,s.n)}`:'空'; pm=s.n?s.m/s.n*100:0; pp=s.n?s.pr/s.n*100:0; pw=s.n?s.w/s.n*100:0; }
    else sub=`${allItems(k).length} 条`;
    return `<button class="deck ${k===deck?'active':''}" data-deck="${k}"><b>${esc(d.name)}</b><small>${sub}</small><i><b style="width:${pm}%"></b><b class="prog" style="width:${pp}%"></b><b class="weak" style="width:${pw}%"></b></i></button>`;
  }).join('');
  document.querySelectorAll('.deck').forEach(t=>t.onclick=()=>{deck=t.dataset.deck;filter=0;renderFilter();restart();});
}
function renderFilter(){
  const d=DECKS[deck];
  $('filterWrap').style.display=d.virtual?'none':'';
  if(d.virtual) return;
  $('filterName').textContent=d.filterName;
  $('filter').innerHTML=d.filters().map((f,i)=>`<option value="${i}">${esc(f)}</option>`).join('');
  $('filter').value=filter;
}
function renderStats(){
  $('sN').textContent=session.n; $('sAcc').textContent=session.n?Math.round(session.c/session.n*100)+'%':'–'; $('sStreak').textContent=session.streak;
  const dd=S.daily[today()]||{n:0,c:0}; $('sToday').textContent=dd.n; $('sideToday').textContent=dd.n; $('sideTodayOk').textContent=dd.c;
  const all=allItems(deck); let m=0,w=0,pr=0; all.forEach(x=>{const id=idOf(x.deck,x.idx); if(isMastered(id))m++; else if(isWeak(id))w++; else if(S.rec[id])pr++;});
  const u=all.length-m-w-pr, N=all.length||1;
  $('sMaster').textContent=m; $('sWeak').textContent=w;
  $('deckbar').innerHTML=all.length?`<div class="bar"><b class="m" style="width:${m/N*100}%"></b><b class="p" style="width:${pr/N*100}%"></b><b class="w" style="width:${w/N*100}%"></b></div><div class="legend"><span class="m">已掌握 <b>${m}</b> · ${Math.round(m/N*100)}%</span><span class="p">练过一次 <b>${pr}</b></span><span class="w">待巩固 <b>${w}</b></span><span>未练 <b>${u}</b></span><span>共 ${all.length}</span></div>`:'';
  const pos=Math.min(qi,queue.length), miss=session.n-session.c;
  $('track').style.width=(queue.length?pos/queue.length*100:0)+'%';
  $('roundLbl').textContent=`${pos} / ${queue.length}`+(session.n?` · 对 ${session.c} 错 ${miss}`:'');
  $('roundOk').style.width=(queue.length?session.c/queue.length*100:0)+'%';
  $('roundMiss').style.width=(queue.length?miss/queue.length*100:0)+'%';
  if($('review').classList.contains('open')) renderReview();
}
function renderReview(){
  const rows=allItems(deck).filter(x=>{const id=idOf(x.deck,x.idx);return isWeak(id)||S.fav[id]}).slice(0,400)
    .map(x=>{const id=idOf(x.deck,x.idx),r=rec(id);return `<div><span>${S.fav[id]?'<span style="color:var(--star)">★</span> ':''}${esc(x.it.t)}</span><span>${r.w?`<span class="w">错 ${r.w}</span> `:''}<span class="k">${r.streak?`连对 ${r.streak}`:''}</span></span></div>`}).join('');
  $('review').innerHTML=rows||'<div class="empty">这个库里还没有错题或收藏</div>';
}
function show(){
  stopListen(); heard=''; $('heard').className='heard off'; $('heard').innerHTML='';
  renderDecks(); renderStats();
  const tp=$('typing'); tp.value=''; lastVal=''; caretPos=0; phase='typing';
  $('feedback').textContent=''; $('feedback').className='feedback';
  const w=$('word'); w.classList.remove('done','out');
  $('mic').hidden=mode()!=='say'; $('reveal').hidden=mode()==='read';
  if(qi>=queue.length){
    cur=null; $('context').textContent=''; $('wordbar').style.visibility='hidden'; $('zh').className='zh off'; $('ex').className='ex off';
    w.className='word'; w.innerHTML=queue.length?`<div class="final">这一轮打完了<small>换个范围、换成随机或薄弱优先，或在设置里取消"跳过已掌握"再来一轮。按 Enter 重新开始。</small></div>`:`<div class="final">这个范围没有可练的条目<small>换一个分表或取消"跳过已掌握"。</small></div>`;
    return;
  }
  $('wordbar').style.visibility='';
  cur=queue[qi]; const id=idOf(cur.deck,cur.idx), it=cur.it, r=rec(id);
  const parts=[DECKS[cur.deck].name.split(' ')[0]];
  if(it.tag&&parts[0].toUpperCase()!==it.tag) parts.push(it.tag); if(it.ref) parts.push(`#${it.ref}`);
  if(it.g) parts.push(`Sublist ${it.g}`); if(it.n&&DECKS[cur.deck].kind!=='sentence') parts.push(`#${it.n}`); if(it.p) parts.push(it.p); if(targetOf(it).hasOpt) parts.push('浅色词可省略');
  parts.push(`${qi+1} / ${queue.length}`);
  parts.push(S.rec[id]?`对 ${r.c} 错 ${r.w} 连对 ${r.streak}`:'首次');
  $('context').innerHTML=parts.map(p=>`<span>${esc(p)}</span>`).join('');
  $('star').classList.toggle('on',!!S.fav[id]); $('star').querySelector('.g').textContent=S.fav[id]?'★':'☆';
  paintZh(); paint(); if(mode()!=='say'&&mode()!=='read') tp.focus({preventScroll:true});
  if($('autoSpeak').checked) speak('出题自动朗读', navigating?450:180);
}
/* 听读模式: 整句按意群显示("/"处留空隙), 中文和意群译文常显 */
function renderReadText(){
  const tg=targetOf(cur.it), src=cur.it.chunks||tg.full;
  const parts=src.split('/').map(s=>s.trim()).filter(Boolean);
  return parts.map(p=>`<span class="chunk">${esc(p)}</span>`).join('<span class="gap"></span>');
}
function paintZh(){
  const z=$('zh'), ex=$('ex'), ck=$('chunks');
  if(cur&&mode()==='read'&&cur.it.chunks){ ck.className='chunks'; ck.innerHTML=cur.it.chunks.split('/').map(s=>`<span>${esc(s.trim())}</span>`).join('<i>/</i>'); } else { ck.className='chunks off'; ck.innerHTML=''; }
  if(!cur||(!$('showZh').checked&&mode()!=='spell'&&mode()!=='read')){ z.className='zh off'; z.textContent=''; ex.className='ex off'; ex.innerHTML=''; return; }
  const veil=mode()==='dict' && phase==='typing';
  const ph=cur.it.ph?`<span class="ph">/${esc(cur.it.ph)}/</span> `:'';
  z.className='zh'+(veil?' veiled':''); z.innerHTML=veil?'（听写中，提交后显示中文）':ph+esc(cur.it.z||'');
  // 例句只在答完后显示(例句里含目标词)
  if(cur.it.ex&&phase!=='typing'){ ex.className='ex'; ex.innerHTML=`<i>${esc(cur.it.ex)}</i>${cur.it.exz?`<small>${esc(cur.it.exz)}</small>`:''}`; } else { ex.className='ex off'; ex.innerHTML=''; }
}
function paint(){
  if(!cur) return;
  const w=$('word'), tg=targetOf(cur.it), v=$('typing').value, vn=normLive(v);
  const idle=mode()!=='say' && mode()!=='read' && document.activeElement!==$('typing') && !v;
  w.classList.toggle('idle', idle);
  const fb=$('feedback'); if(idle&&!fb.textContent){ fb.className='feedback hint'; fb.textContent='点击或按任意键开始'; } else if(!idle&&fb.classList.contains('hint')){ fb.className='feedback'; fb.textContent=''; }
  w.classList.toggle('long', tg.full.length>16); w.classList.toggle('xlong', tg.full.length>30); w.classList.toggle('xxlong', tg.full.length>60);
  w.classList.toggle('say', mode()==='say'); w.classList.toggle('read', mode()==='read');
  if(mode()==='say'){ w.classList.remove('blind'); w.innerHTML=renderSayWords(); return; }
  if(mode()==='read'){ w.classList.remove('blind'); w.innerHTML=renderReadText(); return; }
  const blind=(mode()==='dict'||mode()==='spell') && phase==='typing';
  if(blind){
    w.classList.add('blind');
    w.innerHTML=`<span class="typed">${esc(v.slice(0,caretPos))}</span><span class="caret"></span><span class="typed">${esc(v.slice(caretPos))}</span>${v?'':`<span class="ph">${mode()==='dict'?'听写：输入你听到的':'拼写：根据中文写出英文'}</span>`}`;
    return;
  }
  w.classList.remove('blind');
  w.innerHTML=tg.chars.map(({ch,opt},i)=>{
    let cls='c'; if(opt) cls+=' opt'; if(ch===' ') cls+=' sp';
    if(i<vn.length) cls+= (normCh(ch)===vn[i]) ?' ok':' bad';
    if(i===caretPos&&phase!=='done') cls+=' cur';        // 光标在哪个位置前面, 就高亮哪个字符
    return `<span class="${cls}">${esc(ch)}</span>`}).join('')
    +[...v.slice(tg.chars.length)].map((ch,j)=>`<span class="c bad extra${ch===' '?' sp':''}${tg.chars.length+j===caretPos&&phase!=='done'?' cur':''}">${esc(ch)}</span>`).join('');
}

/* ---------- actions (打字/听写) ---------- */
function record(ok){
  const id=idOf(cur.deck,cur.idx), ts=Date.now();
  const r=S.rec[id]||(S.rec[id]={c:0,w:0,streak:0}); r.last=ts;
  const dd=S.daily[today()]||(S.daily[today()]={n:0,c:0}); dd.n++; session.n++;
  if(ok){ r.c++; r.streak++; dd.c++; session.c++; session.streak++; } else { r.w++; r.streak=0; session.streak=0; }
  invalidateStats(); cacheLocal(); pushEvent({deck:cur.deck,idx:cur.idx,ok:!!ok,ts,day:today()}); return r;
}
function submit(){
  if(!cur){ restart(); return; }
  if(mode()==='say'){ submitSay(); return; }
  if(mode()==='read'){ go(1); return; }
  const tp=$('typing'), tg=targetOf(cur.it), ok=tg.accept.has(norm(tp.value)), fb=$('feedback');
  if(phase==='done'){ advance(); return; }
  if(phase==='typing'){
    const r=record(ok);
    if(ok){ phase='done'; paint(); paintZh(); $('word').classList.add('done'); fb.className='feedback ok'; fb.textContent=r.streak>=2?'正确，已掌握':'正确'; setTimeout(()=>{ if(phase==='done') advance(); },cur.it.ex?1400:550); }
    else { phase='wrong-retry'; tp.value=''; lastVal=''; caretPos=0; fb.className='feedback bad'; fb.innerHTML=`应为 <b>${esc(tg.full)}</b>，请照着重打一遍`; paint(); paintZh(); if($('speakOnWrong').checked) speak('答错朗读'); }
    renderStats(); return;
  }
  if(phase==='wrong-retry'){
    if(ok){ phase='done'; paint(); paintZh(); $('word').classList.add('done'); fb.className='feedback ok'; fb.textContent='订正正确'; setTimeout(()=>{ if(phase==='done') advance(); },cur.it.ex?1400:450); }
    else { tp.value=''; lastVal=''; caretPos=0; fb.className='feedback bad'; fb.innerHTML=`还不对，应为 <b>${esc(tg.full)}</b>`; paint(); }
  }
}
function advance(){ const w=$('word'); w.classList.add('out'); setTimeout(()=>{ qi++; savePos(); show(); },160); }
/* ← → 前后切换, 不计对错; 可连按 */
let goT=null, navigating=false;
function go(delta){
  if(!queue.length) return;
  qi=Math.max(0,Math.min(queue.length,qi+delta)); phase='typing';
  navigating=true; show(); navigating=false; clearTimeout(goT); goT=setTimeout(savePos,300);
}
function skip(){ if(cur) advance(); }
async function restart(){ await ensureCourse(course); buildQueue(); session={n:0,c:0,streak:0}; show(); }
function toggleStar(){ if(!cur) return; const id=idOf(cur.deck,cur.idx); S.fav[id]=!S.fav[id]; if(!S.fav[id]) delete S.fav[id]; cacheLocal(); apiFav(cur.deck,cur.idx,!!S.fav[id]); $('star').classList.toggle('on',!!S.fav[id]); $('star').querySelector('.g').textContent=S.fav[id]?'★':'☆'; renderDecks(); renderStats(); if(mode()!=='say') $('typing').focus({preventScroll:true}); }

/* ---------- 跟读: Web Speech API 识别, 按词对比 ---------- */
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
let recog=null, listening=false, heard='', sayResult=null;
const words=s=>s.toLowerCase().replace(/[’']/g,"'").replace(/[^a-z0-9' ]+/g,' ').split(/\s+/).filter(Boolean);
function lcsMatch(a,b){ // 返回 a 中被 b 按序匹配到的下标集合
  const n=a.length,m=b.length, dp=Array.from({length:n+1},()=>new Array(m+1).fill(0));
  for(let i=n-1;i>=0;i--) for(let j=m-1;j>=0;j--) dp[i][j]=a[i]===b[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
  const hit=new Set(); let i=0,j=0; while(i<n&&j<m){ if(a[i]===b[j]){hit.add(i);i++;j++;} else if(dp[i+1][j]>=dp[i][j+1]) i++; else j++; }
  return hit;
}
function evalSay(transcripts){ // 多个候选取最好的
  const tg=targetOf(cur.it), tw=tg.toks.map(t=>({w:words(t.w).join(' '),opt:t.opt})).filter(t=>t.w);
  let best=null;
  for(const tr of transcripts){
    const hw=words(tr), hit=lcsMatch(tw.map(t=>t.w),hw);
    const req=tw.map((t,i)=>!t.opt||hit.has(i)); const need=req.filter(Boolean).length; const got=tw.filter((t,i)=>hit.has(i)&&req[i]).length;
    const sc=need?got/need:1;
    if(!best||sc>best.sc) best={sc,hit,hw,tr};
  }
  return best;
}
function renderSayWords(){
  const tg=targetOf(cur.it), toks=tg.toks;
  return toks.map((t,i)=>{ let cls='sw'; if(t.opt) cls+=' opt'; if(sayResult){ cls+=sayResult.hit.has(i)?' ok':(t.opt?'':' bad'); } return `<span class="${cls}">${esc(t.w)}</span>`; }).join(' ');
}
function startListen(){
  if(!cur||mode()!=='say') return;
  if(!SR){ toast('此浏览器不支持语音识别，请用 Chrome'); return; }
  if(listening){ stopListen(); return; }
  speechSynthesis.cancel();
  recog=new SR(); recog.lang='en-US'; recog.interimResults=true; recog.maxAlternatives=3; recog.continuous=false;
  let finals=[];
  recog.onresult=e=>{ let interim=''; finals=[]; for(const res of e.results){ if(res.isFinal){ finals=[...res].map(a=>a.transcript); } else interim+=res[0].transcript; } heard=finals[0]||interim; $('heard').className='heard'; $('heard').innerHTML=`<span class="lbl">听到</span>${esc(heard||'…')}`; };
  recog.onerror=e=>{ const m={'not-allowed':'麦克风权限被拒绝，请在地址栏允许','network':'语音识别需要联网（走代理）','no-speech':'没听到声音，再试一次','audio-capture':'没有可用的麦克风'}; toast(m[e.error]||('识别出错: '+e.error)); };
  recog.onend=()=>{ if($('soundLog').checked) toast('🎙 录音结束'); listening=false; $('mic').classList.remove('on'); $('mic').innerHTML='<span class="dot"></span>再说一次<kbd>Space</kbd>'; if(finals.length){ sayResult=evalSay(finals); heard=sayResult.tr; $('heard').innerHTML=`<span class="lbl">听到</span>${esc(heard)}`; paint(); submitSay(); } };
  if($('soundLog').checked) toast('🎙 开始录音（Chrome 语音识别）'); listening=true; sayResult=null; heard=''; $('heard').className='heard'; $('heard').innerHTML='<span class="lbl">听到</span>…'; $('mic').classList.add('on'); $('mic').innerHTML='<span class="dot"></span>正在听…<kbd>Space</kbd>'; paint();
  try{ recog.start(); }catch(e){ listening=false; toast('无法启动识别: '+e.message); }
}
window.addEventListener('beforeunload',()=>{ try{ speechSynthesis.cancel(); }catch(e){} });
function stopListen(){ if(recog&&listening){ try{ recog.stop(); }catch(e){} } listening=false; $('mic').classList.remove('on'); $('mic').innerHTML='<span class="dot"></span>开始跟读<kbd>Space</kbd>'; }
function submitSay(){
  if(!cur) return; const fb=$('feedback');
  if(phase==='done'){ advance(); return; }
  if(!sayResult){ startListen(); return; }
  const ok=sayResult.sc>=0.8, pct=Math.round(sayResult.sc*100);
  if(phase==='typing'){ const r=record(ok); if(ok){ phase='done'; $('word').classList.add('done'); fb.className='feedback ok'; fb.textContent=(r.streak>=2?'正确，已掌握':'正确')+` · 匹配 ${pct}%`; paintZh(); setTimeout(()=>{ if(phase==='done') advance(); },1200); } else { phase='wrong-retry'; fb.className='feedback bad'; fb.textContent=`匹配 ${pct}%，红色的词没听清，再说一次`; paintZh(); } }
  else if(phase==='wrong-retry'){ if(ok){ phase='done'; $('word').classList.add('done'); fb.className='feedback ok'; fb.textContent=`订正正确 · 匹配 ${pct}%`; setTimeout(()=>{ if(phase==='done') advance(); },1000); } else { fb.className='feedback bad'; fb.textContent=`匹配 ${pct}%，再试一次或按 Esc 跳过`; } }
  renderStats();
}

/* ---------- speech (TTS) ---------- */
let voices=[];
function loadVoices(){ voices=speechSynthesis.getVoices().filter(v=>/^en[-_]/i.test(v.lang)); const sel=$('voice'); const pref=S.ui.voice; sel.innerHTML=voices.map(v=>`<option value="${esc(v.name)}">${esc(v.name)} (${v.lang})</option>`).join('')||'<option value="">（无英文语音）</option>'; const def=voices.find(v=>v.name===pref)||voices.find(v=>/en[-_]US/i.test(v.lang)&&/Samantha|Ava|Allison|Zoe|Nicky/i.test(v.name))||voices.find(v=>/en[-_]US/i.test(v.lang))||voices.find(v=>/en[-_]AU/i.test(v.lang))||voices[0]; if(def) sel.value=def.name; }
/* 朗读: 上一条还在读时不硬切, 等它读完(最多等 900ms)再读新的; 连续切题/快速答对时只读最后停下的那题.
   硬切会留下半截音("oh… wha… you…"), 这就是之前听到的怪声 */
let speakT=null, curUtter=null;
function speak(src='手动朗读',delay=180){
  if(!cur||!('speechSynthesis' in window)||listening) return;
  clearTimeout(speakT);
  const item=cur;
  const fire=()=>{
    if(cur!==item||listening) return;             // 期间又切题了, 不读这条
    speechSynthesis.cancel();
    const text=targetOf(item.it).full; if($('soundLog').checked) toast(`🔊 ${src}：${text}`);
    const u=new SpeechSynthesisUtterance(text); const v=voices.find(v=>v.name===$('voice').value); if(v) u.voice=v; u.lang=v?v.lang:'en-US'; u.rate=parseFloat($('rate').value);
    curUtter=u; u.onend=u.onerror=()=>{ if(curUtter===u) curUtter=null; };
    speechSynthesis.speak(u);
  };
  if(speechSynthesis.speaking&&curUtter){        // 让上一条读完再开新的, 但最多等 900ms
    let done=false; const go=()=>{ if(done) return; done=true; clearTimeout(speakT); speakT=setTimeout(fire,80); };
    const prev=curUtter; const prevEnd=prev.onend; prev.onend=e=>{ prevEnd&&prevEnd(e); go(); };
    speakT=setTimeout(go,900);
  } else speakT=setTimeout(fire,delay);
}

/* ---------- 我的词库: 浏览器本地导入, 不经过服务器 ----------
   支持四种格式: 本项目 JSON / 单词数组 JSON([{name,trans,usphone}]) / 两列文本(单词<Tab>释义) / PTE 机经文本(编号+句子+意群划分+翻译) */
const CKEY='le-custom-decks-v1';
function loadCustomDecks(){ try{ return JSON.parse(localStorage.getItem(CKEY)||'[]'); }catch(e){ return []; } }
function saveCustomDecks(list){ localStorage.setItem(CKEY,JSON.stringify(list)); }
function registerCustomDecks(){
  const list=loadCustomDecks(); Object.keys(DECKS).forEach(k=>{ if(DECKS[k].custom) delete DECKS[k]; });
  list.forEach((d,i)=>{ const kind=(d.filter&&FILTERS[d.filter.kind])?d.filter.kind:'none'; const D={name:d.name,course:'custom',kind:d.kind||'word',count:d.items.length,items:d.items,custom:true,filterName:'范围',match:FILTERS[kind].match}; D.filters=()=>FILTERS[kind].filters(D.items); DECKS[d.id]=D; });
  const has=list.length>0, idx=COURSES.findIndex(c=>c.id==='custom');
  if(has&&idx<0) COURSES.push({id:'custom',name:'我的词库',desc:'从本机导入，只存在这个浏览器里',order:999});
  if(!has&&idx>=0) COURSES.splice(idx,1);
}
function parseJijing(text){   // "136. 41200 RS" / 句子 / 意群划分及翻译: / 意群 / 译文
  const lines=text.split(/\r?\n/).map(l=>l.trim()); const items=[]; let i=0;
  while(i<lines.length){
    const m=/^(\d+)\.\s*(\d+)?\s*([A-Za-z]{2,4})?\s*$/.exec(lines[i]);
    if(!m){ i++; continue; }
    let j=i+1; while(j<lines.length&&!lines[j]) j++;
    const t=lines[j]||''; if(!t||/^\d+\./.test(t)){ i=j; continue; }
    let chunks='', z=''; let k=j+1;
    while(k<lines.length&&!/^\d+\.\s*\d*\s*[A-Za-z]{0,4}\s*$/.test(lines[k])){
      const l=lines[k];
      if(/意群划分/.test(l)){ k++; continue; }
      if(!l){ k++; continue; }
      if(!chunks&&/\//.test(l)&&/[A-Za-z]/.test(l)){ const cm=/^(.*?[.!?'"”)]?)\s*([一-鿿].*)?$/.exec(l); chunks=cm?cm[1].trim():l; if(cm&&cm[2]) z=cm[2].trim(); }
      else if(/[一-鿿]/.test(l)) z=(z?z+' ':'')+l;
      k++;
    }
    items.push({t,z,chunks:chunks||undefined,tag:m[3]?m[3].toUpperCase():undefined,ref:m[2]||undefined,n:items.length+1});
    i=k;
  }
  return items;
}
function parseDeckFile(name,text){
  text=text.replace(/^﻿/,''); const base=name.replace(/\.[^.]+$/,'');
  if(/^\s*[\[{]/.test(text)){
    const j=JSON.parse(text);
    if(Array.isArray(j)){ // 单词数组 JSON
      const items=j.filter(w=>w&&w.name).map((w,i)=>({t:String(w.name).trim(),z:Array.isArray(w.trans)?w.trans.join('；'):String(w.trans||''),ph:w.usphone||w.ukphone||undefined,n:i+1}));
      return {id:'c-'+Date.now().toString(36),name:base,kind:'word',items};
    }
    if(j&&Array.isArray(j.items)) return {id:'c-'+Date.now().toString(36),name:j.name||base,kind:j.kind||'word',filter:j.filter,items:j.items.filter(x=>x&&x.t)};
    throw new Error('JSON 结构不认识');
  }
  if(/^\s*\d+\.\s*\d*\s*[A-Za-z]{0,4}\s*$/m.test(text)&&/意群|\//.test(text)){ const items=parseJijing(text); if(items.length) return {id:'c-'+Date.now().toString(36),name:base,kind:'sentence',items}; }
  const items=text.split(/\r?\n/).map(l=>l.trim()).filter(l=>l&&!l.startsWith('#')).map((l,i)=>{ const [t,...rest]=l.split(/\t|,(?=[^,]*$)|  +/); return {t:t.trim(),z:rest.join(' ').trim(),n:i+1}; }).filter(x=>x.t);
  if(!items.length) throw new Error('没有解析出条目');
  const kind=items.some(x=>x.t.split(' ').length>4)?'sentence':'word';
  return {id:'c-'+Date.now().toString(36),name:base,kind,items};
}
async function importDeckFile(f){
  try{ const d=parseDeckFile(f.name,await f.text()); const list=loadCustomDecks(); list.push(d); saveCustomDecks(list); registerCustomDecks(); renderCourses(); toast(`已导入「${d.name}」${d.items.length} 条`); await switchCourse('custom'); deck=d.id; renderFilter(); await restart(); }
  catch(e){ toast('导入失败：'+e.message); }
}
function renderMyDecks(){
  const box=$('mydecks'); const list=loadCustomDecks();
  box.innerHTML=list.length?list.map(d=>`<div><span>${esc(d.name)} <small>${d.items.length} 条 · ${d.kind==='sentence'?'句子':'单词'}</small></span><span><button data-exp="${d.id}">导出</button> <button data-del="${d.id}">删除</button></span></div>`).join(''):'<div class="empty">还没有导入的词库。设置里「导入词库」支持 JSON、两列文本、PTE 机经文本。</div>';
  box.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{ if(!confirm('删除这个词库？练习记录会保留但不再显示。')) return; saveCustomDecks(loadCustomDecks().filter(d=>d.id!==b.dataset.del)); registerCustomDecks(); renderCourses(); renderMyDecks(); if(DECKS[deck]===undefined){ switchCourse(COURSES[0].id); } else renderDecks(); });
  box.querySelectorAll('[data-exp]').forEach(b=>b.onclick=()=>{ const d=loadCustomDecks().find(x=>x.id===b.dataset.exp); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(d,null,1)],{type:'application/json'})); a.download=`${d.name}.json`; a.click(); });
}

/* ---------- 侧边栏 / 专注模式 ---------- */
function setSide(open){ document.body.classList.toggle('side-open',open); S.ui.side=open; save(); }
function setFocus(on){
  document.body.classList.toggle('focus',on); S.ui.focus=on;
  if(on){ S.ui.sideBeforeFocus=document.body.classList.contains('side-open'); document.body.classList.remove('side-open'); $('settings').classList.remove('open'); $('gear').setAttribute('aria-expanded',false); $('gear').textContent='设置 ▾'; toast('专注模式 · ⌘. 退出'); }
  else if(S.ui.sideBeforeFocus) document.body.classList.add('side-open');
  save(); if(mode()!=='say'&&cur) $('typing').focus({preventScroll:true});
}

/* ---------- wiring ---------- */
function wire(){
  const tp=$('typing');
  tp.addEventListener('input',onInput);
  tp.addEventListener('compositionstart',()=>{composing=true;});
  tp.addEventListener('compositionend',()=>{composing=false; onInput();});
  tp.addEventListener('focus',()=>{setCaret(caretPos);paint();}); tp.addEventListener('blur',paint);
  tp.addEventListener('keydown',e=>{
    if(e.isComposing||e.keyCode===229) return;
    const mod=e.metaKey||e.ctrlKey;
    if(e.key==='Enter'){e.preventDefault();submit();}
    else if(e.key==='Escape'){e.preventDefault();skip();}
    else if(e.key==='ArrowLeft'||e.key==='ArrowRight'){ e.preventDefault(); if(mod) go(e.key==='ArrowLeft'?-1:1); else { setCaret(caretPos+(e.key==='ArrowLeft'?-1:1)); paint(); } }   // ←→ 移光标改错, ⌘←→ 切题
    else if(e.key==='Home'){e.preventDefault();setCaret(0);paint();}
    else if(e.key==='End'){e.preventDefault();caretEnd();paint();}
    else if(e.key==='Delete'){forwardDelete=true;}
    else if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();}
  });
  $('word').addEventListener('click',()=>{ if(mode()==='say') startListen(); else tp.focus({preventScroll:true}); });
  document.addEventListener('keydown',e=>{
    const mod=e.metaKey||e.ctrlKey, inField=/^(SELECT|INPUT|TEXTAREA|BUTTON)$/.test(document.activeElement.tagName)&&document.activeElement!==tp;
    if((mod&&e.key.toLowerCase()==='s')||(e.key==='Tab'&&!mod&&!e.altKey&&!inField)){e.preventDefault();toggleStar();return;}
    if(mod&&e.key.toLowerCase()==='p'){e.preventDefault();speak();return;}
    if(mod&&e.key.toLowerCase()==='b'){e.preventDefault();setSide(!document.body.classList.contains('side-open'));return;}
    if(mod&&e.key==='.'){e.preventDefault();setFocus(!document.body.classList.contains('focus'));return;}
    const ae=document.activeElement, arrowBlocked=ae!==tp&&(ae.tagName==='SELECT'||ae.tagName==='TEXTAREA'||(ae.tagName==='INPUT'&&!/^(checkbox|radio)$/.test(ae.type)));
    if(!arrowBlocked&&ae!==tp&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){ e.preventDefault(); if(mod||mode()==='read') go(e.key==='ArrowLeft'?-1:1); else if(mode()!=='say'&&cur){ tp.focus({preventScroll:true}); } return; }
    if(mode()==='read'){   // 听读: 回车/→ 下一句, ← 上一句, 空格重听
      if(inField) return;
      if(e.key==='Enter'||e.key==='ArrowRight'){ e.preventDefault(); go(1); return; }
      if(e.key==='ArrowLeft'){ e.preventDefault(); go(-1); return; }
      if(e.key===' '){ e.preventDefault(); speak(); return; }
      if(e.key==='Escape'){ e.preventDefault(); go(1); return; }
      return;
    }
    if(mode()==='say'){
      if(inField) return;
      if(e.key===' '){ e.preventDefault(); startListen(); return; }
      if(e.key==='Enter'){ e.preventDefault(); submit(); return; }
      if(e.key==='Escape'){ e.preventDefault(); skip(); return; }
      if(mod&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){ e.preventDefault(); go(e.key==='ArrowLeft'?-1:1); return; }
      return;
    }
    // 焦点落在按钮上(刚点过设置/朗读等)时, 打字母也应进入输入框; 只有下拉框/别的文本框才不抢
    const typingBlocked=ae!==tp&&(ae.tagName==='SELECT'||ae.tagName==='TEXTAREA'||(ae.tagName==='INPUT'&&!/^(checkbox|radio)$/.test(ae.type)));
    if(!mod&&!e.altKey&&e.key.length===1&&document.activeElement!==tp&&!typingBlocked){ tp.focus({preventScroll:true}); }
    if(e.key==='Enter'&&document.activeElement!==tp&&!inField){ e.preventDefault(); submit(); }
  });
  $('star').onclick=toggleStar; $('speak').onclick=()=>{speak(); if(mode()!=='say') tp.focus({preventScroll:true});}; $('skip').onclick=skip; $('mic').onclick=startListen;
  $('reveal').onclick=()=>{ if(!cur) return; phase='wrong-retry'; const id=idOf(cur.deck,cur.idx); const r=S.rec[id]||(S.rec[id]={c:0,w:0,streak:0}); r.w++; r.streak=0; save(); tp.value=''; lastVal=''; caretPos=0; $('feedback').className='feedback bad'; $('feedback').innerHTML=`答案 <b>${esc(targetOf(cur.it).full)}</b>，${mode()==='say'?'再说一遍':'照着打一遍再继续'}`; paint(); paintZh(); renderStats(); if(mode()!=='say') tp.focus({preventScroll:true}); };
  document.querySelectorAll('.seg').forEach(seg=>seg.querySelectorAll('button').forEach(b=>b.onclick=()=>{ setSeg(seg.id,b.dataset.v); S.ui[seg.id]=b.dataset.v; save(); if(seg.id==='mode'){ stopListen(); sayResult=null; show(); } else restart(); }));
  $('showZh').onchange=()=>{ S.ui.showZh=$('showZh').checked; save(); paintZh(); if(mode()!=='say') tp.focus({preventScroll:true}); };
  $('gear').onclick=()=>{ const o=$('settings').classList.toggle('open'); $('gear').setAttribute('aria-expanded',o); $('gear').textContent=o?'设置 ▴':'设置 ▾'; };
  $('reviewToggle').onclick=()=>{ const o=$('review').classList.toggle('open'); $('reviewToggle').textContent=o?'错题与收藏 ▴':'错题与收藏 ▾'; if(o) renderReview(); };
  $('skipMastered').onchange=()=>{S.ui.skipMastered=$('skipMastered').checked;save();restart();};
  $('filter').onchange=()=>{filter=+$('filter').value;restart();};
  $('voice').onchange=()=>{S.ui.voice=$('voice').value;save();};
  $('autoSpeak').onchange=()=>{S.ui.autoSpeak=$('autoSpeak').checked;save();};
  $('autoSubmit').onchange=()=>{S.ui.autoSubmit=$('autoSubmit').checked;save(); if(mode()!=='say') tp.focus({preventScroll:true});};
  $('speakOnWrong').onchange=()=>{S.ui.speakOnWrong=$('speakOnWrong').checked;save();};
  $('soundLog').onchange=()=>{S.ui.soundLog=$('soundLog').checked;save();};
  $('rate').onchange=()=>{S.ui.rate=$('rate').value;save();};
  $('export').onclick=()=>{ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(S)],{type:'application/json'})); a.download=`learn-english-progress-${today()}.json`; a.click(); };
  $('import').onclick=()=>$('file').click();
  $('importDeck').onclick=()=>$('deckFile').click();
  $('deckFile').onchange=e=>{ const f=e.target.files[0]; if(f) importDeckFile(f); e.target.value=''; };
  $('manageDecks').onclick=()=>{ const b=$('mydecks'); b.hidden=!b.hidden; if(!b.hidden) renderMyDecks(); };
  $('file').onchange=e=>{ const f=e.target.files[0]; if(!f) return; f.text().then(async t=>{ try{ const s=JSON.parse(t); if(!s.rec) throw 0;
      if(me){ const r=await fetch('/api/progress/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(s)}); if(!r.ok) throw 0; const rr=await fetch('/api/progress',{cache:'no-store'}); S=Object.assign(blank(),await rr.json()); }
      else { for(const k in s.rec) if(!S.rec[k]||(s.rec[k].c||0)+(s.rec[k].w||0)>(S.rec[k].c||0)+(S.rec[k].w||0)) S.rec[k]=s.rec[k]; Object.assign(S.fav,s.fav||{}); for(const d in s.daily||{}) if(!S.daily[d]||s.daily[d].n>S.daily[d].n) S.daily[d]=s.daily[d]; }
      invalidateStats(); cacheLocal(); renderCourses(); renderFilter(); await restart(); toast('进度已导入'); }catch(x){ toast('导入失败：文件格式不对或未登录'); } }); e.target.value=''; };
  $('reset').onclick=async()=>{ if(DECKS[deck].virtual){ toast('请在具体词库里清空'); return; } if(!confirm(`确定清空「${DECKS[deck].name}」的练习记录？收藏会保留。`)) return; Object.keys(S.rec).forEach(k=>{ if(k.startsWith(deck+':')) delete S.rec[k]; }); invalidateStats(); cacheLocal(); if(me){ try{ await fetch('/api/progress/deck/'+deck,{method:'DELETE'}); }catch(e){ toast('云端清空失败'); } } restart(); };
  $('deleteAccount').onclick=async()=>{ if(!me) return; if(!confirm('删除账号会永久删除云端的全部练习记录，确定？')) return; const r=await fetch('/api/auth/delete-user',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({callbackURL:'/'})}).catch(()=>null); if(r&&r.ok){ try{ localStorage.clear(); }catch(e){} location.href='/'; } else toast('删除失败，请重新登录后再试'); };
  $('menuBtn').onclick=()=>setSide(!document.body.classList.contains('side-open'));
  $('focusBtn').onclick=()=>setFocus(true); $('unfocus').onclick=()=>setFocus(false);
  $('sideClose').onclick=()=>setSide(false); $('backdrop').onclick=()=>setSide(false);
}
function applyUi(){
  setSeg('mode',['see','spell','dict','say','read'].includes(S.ui.mode)?S.ui.mode:'see'); setSeg('order',['seq','alpha','rand','weak'].includes(S.ui.order)?S.ui.order:'seq');
  $('showZh').checked=S.ui.showZh===undefined?true:!!S.ui.showZh;   // 默认显示中文 if(S.ui.skipMastered!==undefined) $('skipMastered').checked=S.ui.skipMastered; if(S.ui.autoSpeak!==undefined) $('autoSpeak').checked=S.ui.autoSpeak; if(S.ui.autoSubmit!==undefined) $('autoSubmit').checked=S.ui.autoSubmit; if(S.ui.speakOnWrong!==undefined) $('speakOnWrong').checked=S.ui.speakOnWrong; $('soundLog').checked=!!S.ui.soundLog; if(S.ui.rate) $('rate').value=S.ui.rate;
  course=(S.ui.course&&COURSES.some(c=>c.id===S.ui.course))?S.ui.course:(S.ui.deck&&DECKS[S.ui.deck]&&!DECKS[S.ui.deck].virtual?DECKS[S.ui.deck].course:COURSES[0].id);
  const ds=courseDecks(course); deck=(S.ui.deck&&DECKS[S.ui.deck]&&(DECKS[S.ui.deck].virtual||DECKS[S.ui.deck].course===course))?S.ui.deck:(ds[0]||'fav'); filter=0;
  document.body.classList.toggle('side-open', S.ui.side!==undefined?!!S.ui.side:window.innerWidth>=900);
  document.body.classList.toggle('focus', !!S.ui.focus); if(S.ui.focus) document.body.classList.remove('side-open');
}

/* ---------- boot ---------- */
(async function boot(){
  let cat=null;
  try{ const [r1]=await Promise.all([fetch('/content/catalog.json'),loadMe()]); cat=await r1.json(); }catch(e){}
  if(!cat||!Array.isArray(cat.decks)||!cat.decks.length){ $('word').className='word'; $('word').innerHTML='<div class="final">没有词库<small>内容目录加载失败，请刷新。</small></div>'; $('wordbar').style.visibility='hidden'; return; }
  buildDecks(cat.courses,cat.decks); registerCustomDecks();
  await loadProgress();
  if(me&&queue.length) flushEvents();
  if('speechSynthesis' in window){ speechSynthesis.onvoiceschanged=loadVoices; loadVoices(); }
  wire(); applyUi(); renderAccount(); renderCourses(); await ensureCourse(course); renderFilter(); if(!(await resume())) await restart();
})();
