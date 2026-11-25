const LS_KEY='dola_admin_key';
let adminKey=localStorage.getItem(LS_KEY)||'';
let autoRefresh=true, curTab='dash', timer=null;

function q(s){return document.querySelector(s);}
let dialogEpoch=0;
function show(id){const node=document.getElementById(id);if(node.classList.contains('dialog'))ConsoleSync.prepareDialog(node.querySelector('.box'),()=>hide(id));node.style.display='flex';}
function hide(id){if(id==='dlg'){dialogEpoch++;stopAppleProgress();if(typeof closeModelList==='function')closeModelList();['#f_ppass','#f_pass','#appleCode'].forEach(s=>{const pw=q(s);if(pw)pw.value='';});const pw=q('#f_ppass');if(pw)pw.type='password';if(q('#noteDetail'))q('#dlgBox').replaceChildren();}document.getElementById(id).style.display='none';}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
/** 用户 / 上游数据（账号名、代理名、备注、dola 原话…）：转义并标 translate="no"，面板多语言不会把它当文案改写 */
function noTr(s){return '<span translate="no">'+esc(s)+'</span>';}
/** 原生弹窗的模板与动态值分开传递；动态值始终保留原文，不能用 noTr() 的 HTML。 */
function dialogText(strings,...values){
  return {i18nParts:strings,i18nValues:values,toString(){
    return strings.reduce((out,part,i)=>out+part+(i<values.length?String(values[i]):''),'');
  }};
}
function fmt(ts){if(!ts)return '-';const d=new Date(ts*1000);const p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;}
function fmtHM(ts){const d=new Date(ts*1000);const p=n=>String(n).padStart(2,'0');return `${p(d.getHours())}:${p(d.getMinutes())}`;}

let pendingRequests=0,requestStatusTimer=0;
/** 写操作的「正在处理」提示：只算非 GET 请求，超过 400ms 才出现，读取和后台刷新不打扰 */
function requestStatus(count){
  pendingRequests=count;
  const status=q('#requestStatus');
  if(!status)return;
  if(!pendingRequests){
    clearTimeout(requestStatusTimer);requestStatusTimer=0;
    status.hidden=true;status.textContent='';return;
  }
  if(!requestStatusTimer&&status.hidden)requestStatusTimer=setTimeout(()=>{
    requestStatusTimer=0;
    if(pendingRequests){status.textContent='正在处理，请稍候…';status.hidden=false;}
  },400);
}
const transport=StudioHttp.create({
  credential:()=>adminKey,
  onUnauthorized:()=>showLogin(),
  onActivity:requestStatus,
  normalize:value=>StudioBrand.text(value)
});
function api(path,options={}){return transport.request(path,options);}

function showLogin(){
  hide('dlg');const m=q('#loginMask');
  if(m&&m.classList)m.classList.remove('is-filling','is-leaving');
  show('loginMask');q('#loginErr').style.display='none';
  Pool.start();
}
/** 登录页的号池水面：世界坐标里一张均匀的点阵，透视投影；几层正弦叠加成浪，涟漪从鼠标 / 点击 / 输入处扩散 */
const Pool={start(){},stop(){},stir(){},error(){},flood(){}};
function loginWrong(){
  q('#loginErr').style.display='block';
  replayClass(q('.login-form'),'is-wrong',420);
  Pool.error();
}
/** 登录成功：水面涨满整屏，再淡出露出面板；数据同时开始加载 */
function leaveLogin(){
  const m=q('#loginMask');
  const still=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(!m||!m.classList||still){hide('loginMask');Pool.stop();return;}
  m.classList.add('is-filling');Pool.flood();
  setTimeout(()=>{m.classList.add('is-leaving');
    setTimeout(()=>{hide('loginMask');Pool.stop();m.classList.remove('is-filling','is-leaving');},340);},760);
}
async function submitLogin(){
  const username=q('#loginUser').value.trim();
  const password=q('#loginPassword').value;
  if(!username||!password){loginWrong();return;}
  const btn=q('#loginBtn');
  if(btn&&btn.getAttribute&&btn.getAttribute('aria-busy')==='true')return;
  if(btn&&btn.setAttribute)btn.setAttribute('aria-busy','true');
  let r;
  try{r=await api('/api/admin/login',{method:'POST',body:{username,password}});}
  catch(e){loginWrong();return;}
  finally{if(btn&&btn.setAttribute)btn.setAttribute('aria-busy','false');}
  adminKey=r.token;localStorage.setItem(LS_KEY,r.token);
  ENTER_PENDING.add(curTab);
  leaveLogin();refresh();setTimeout(shellEnter,700);
  checkUpdateBadge();        // 登录页开着时服务器换了版本：这里发现后自动刷新
}
async function logout(){
  try{if(adminKey)await api('/api/admin/logout',{method:'POST'});}
  catch(e){if(e.message!=='unauthorized'){alert('服务器注销失败，请重试：'+e.message);return;}}
  if(window.ApiGuide)window.ApiGuide.clearSecret();
  adminKey='';localStorage.removeItem(LS_KEY);showLogin();
}

function switchTab(t){
  curTab=t;
  q('main').classList.toggle('wide-tasks',t==='tasks');
  document.querySelectorAll('.side-nav .nav-item').forEach(b=>b.classList.toggle('on',b.dataset.tab===t));
  ['dash','accounts','proxies','tasks','videos','keys','api'].forEach(x=>{q('#tab-'+x).style.display=x===t?'block':'none';});
  if(matchMedia('(max-width:560px)').matches)q('.side-nav .nav-item.on')?.scrollIntoView({block:'nearest',inline:'nearest'});
  tabLoadingNote(t,!LOADED_TABS.has(t));
  // 已有数据（预取过 / 来过）的页：只淡入一次；数据刷新回来后不再把表格行清空重播，
  // 否则同一批行先显示、又变透明逐行出现，看起来像「弹一下」
  tabEnter(t,!LOADED_TABS.has(t));
  refresh();
}
/** 切页动效：只在切换 / 首次进入时播放一次，每 10 秒的自动刷新不重播 */
const ENTER_PENDING=new Set(['dash']);
function replayClass(el,cls,ms){
  if(!el||!el.classList)return;
  el.classList.remove(cls);void el.offsetWidth;el.classList.add(cls);
  clearTimeout(el['_'+cls]);el['_'+cls]=setTimeout(()=>el.classList.remove(cls),ms);
}
function tabEnter(t,rows=true){
  if(rows)ENTER_PENDING.add(t);else ENTER_PENDING.delete(t);
  replayClass(q('#tab-'+t),'tab-in',500);moveNavInd();
}
function rowsEnter(t){
  if(!ENTER_PENDING.delete(t))return;
  const sec=q('#tab-'+t);
  replayClass(sec,'rows-in',1200);
  countUp(sec);
}
const motionOK=()=>false;
/** 数字从 0 滚到实际值（只在切页 / 首次进入时，自动刷新不重播）；「3/48」这类两段数字分别滚 */
function countUp(root){
  if(!root||typeof root.querySelectorAll!=='function'||!motionOK()||typeof requestAnimationFrame!=='function')return;
  root.querySelectorAll('.stat .v, .gbtn b').forEach(el=>{
    const text=el.textContent.trim();
    if(!/^\d+(?:\/\d+)?$/.test(text)||text==='0')return;
    const parts=text.split('/').map(Number),t0=performance.now(),dur=720;
    const step=now=>{
      const k=Math.min(1,(now-t0)/dur),e=1-Math.pow(1-k,4);
      if(el.textContent.trim()!==text&&k<1&&!el._counting)return;      // 期间被刷新改写：放弃
      el._counting=k<1;
      el.textContent=parts.map(v=>Math.round(v*e)).join('/');
      if(k<1)requestAnimationFrame(step);else el.textContent=text;
    };
    el._counting=true;el.textContent=parts.map(()=>0).join('/');requestAnimationFrame(step);
  });
}
/** 侧边栏选中块：一块底色在导航项之间滑动 */
function moveNavInd(){
  const nav=q('.side-nav');if(!nav||typeof nav.querySelector!=='function')return;
  const on=nav.querySelector('.nav-item.on');if(!on)return;
  let ind=nav.querySelector('.nav-ind');
  if(!ind){ind=document.createElement('span');ind.className='nav-ind';nav.prepend(ind);nav.classList.add('has-ind');
    ind.style.transition='none';requestAnimationFrame(()=>{ind.style.transition='';});}
  ind.style.transform='translateY('+on.offsetTop+'px)';
}
/** 筛选栏下划线：从上一个选中项滑到新的（筛选栏每次刷新会重画，所以记住上一次的位置） */
function moveGroupInd(bar){
  if(!bar||typeof bar.querySelector!=='function')return;
  const on=bar.querySelector('.gbtn.on');if(!on)return;
  let ind=bar.querySelector('.grp-ind');if(!ind){ind=document.createElement('span');ind.className='grp-ind';ind.setAttribute('data-ui-persist','');bar.append(ind);}bar.classList.add('has-ind');
  const to='translateX('+on.offsetLeft+'px) scaleX('+on.offsetWidth+')';
  const from=bar._grpInd;
  if(from&&from!==to&&motionOK()){
    ind.style.transition='none';ind.style.transform=from;void ind.offsetWidth;ind.style.transition='';
  }
  ind.style.transform=to;bar._grpInd=to;
}
/** 外壳入场：登录后 / 打开页面时导航、顶栏、主区依次到位 */
function shellEnter(){
  const b=document.body;if(!b||!b.classList)return;
  replayClass(b,'shell-in',1100);
  setTimeout(moveNavInd,0);
}
/** 已经加载过的页：再切回来先显示上次的内容，后台刷新；没加载过的显示一行「正在加载…」 */
const LOADED_TABS=new Set();
function tabLoadingNote(tab,on){
  const sec=q('#tab-'+tab);if(!sec||typeof sec.querySelector!=='function')return;
  const note=sec.querySelector(':scope > .tab-loading');
  if(on&&!note){const p=document.createElement('p');p.className='hint tab-loading';p.textContent='正在加载…';sec.append(p);}
  if(!on&&note)note.remove();
}
/* Console integration: visible freshness belongs to the selected tab only. */
const TAB_LOADERS={
 dash:()=>loadDash(),accounts:()=>loadAccounts(),tasks:()=>loadTasks(),
 videos:()=>loadVideos(),proxies:()=>loadProxies(),keys:()=>loadKeys(),
 api:()=>window.ApiGuide.mount(),upscale:()=>loadUpscaleSettings()
};
let tabsPrefetched=false,prefetchRunning=null;
function loginShowing(){
 const mask=q('#loginMask');
 return mask.style.display!=='none'&&!mask.classList.contains('is-filling');
}
const refreshEngine=StudioRefresh.create({
 load:tab=>TAB_LOADERS[tab](),
 canRun:(tab,options)=>Object.hasOwn(TAB_LOADERS,tab)&&!loginShowing()
  &&(!options.background||(!document.hidden&&navigator.onLine!==false)),
 onSettled:(tab,result)=>{
  if(loginShowing())return;
  if(result.ok){
   if(tab!=='upscale'){LOADED_TABS.add(tab);tabLoadingNote(tab,false);}
   if(tab===curTab){
    rowsEnter(tab);
    q('#lastUpdate').textContent='更新于 '+new Date(result.status.lastSuccess).toLocaleTimeString();
   }
   if(!tabsPrefetched&&!prefetchRunning)setTimeout(()=>void prefetchTabs(),800);
  }else if(tab===curTab&&result.error?.message!=='unauthorized'){
   q('#lastUpdate').textContent='刷新失败，请重试';
  }
 }
});
function refresh(options={}){return refreshTab(curTab,options);}
function refreshTab(tab,options={}){
 return refreshEngine.request(tab,options).catch(()=>{});
}
function prefetchTabs(){
 if(tabsPrefetched)return Promise.resolve();
 if(prefetchRunning)return prefetchRunning;
 const run=(async()=>{
  for(const tab of ['tasks','videos','accounts','upscale']){
   if(tab===curTab||LOADED_TABS.has(tab)||refreshEngine.status(tab).loaded)continue;
   try{await refreshEngine.request(tab,{background:true});}catch{}
  }
  // Failed/skipped resources stay eligible for a later prefetch pass.
  tabsPrefetched=['tasks','videos','accounts','upscale'].every(tab=>LOADED_TABS.has(tab)||refreshEngine.status(tab).loaded);
 })();
 const pending=run.finally(()=>{if(prefetchRunning===pending)prefetchRunning=null;});
 prefetchRunning=pending;return pending;
}
async function manualRefresh(button){
 if(!button||button.getAttribute('aria-busy')==='true')return;
 const tab=curTab,started=Date.now();
 button.setAttribute('aria-busy','true');
 try{
  await refreshEngine.request(tab,{fresh:true});
  if(curTab===tab&&!loginShowing())replayClass(q('#lastUpdate'),'just-updated',900);
 }catch{}finally{
  setTimeout(()=>button.setAttribute('aria-busy','false'),Math.max(0,450-(Date.now()-started)));
 }
}
