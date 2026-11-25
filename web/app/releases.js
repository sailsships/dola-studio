/* ---- 面板一键更新：外部更新程序（systemd / Docker updater）换版本、重启、验证，失败自动回滚 ---- */
let UPDATE_INFO=null,updatePollTimer=null,updateReloadAt=0,PAGE_VERSION=null;
const PROJECT_URL='/docs/build.html';
const UPDATE_STATES={draining:'等待任务完成',ready:'等待更新程序开始',started:'已开始',backing_up:'备份中',
  downloading:'下载新版本',installing:'安装依赖',restarting:'重启服务',verifying:'验证新版本',
  done:'更新完成',failed:'更新失败',rolled_back:'已回滚',cancelled:'已取消'};
function updateBadge(info){
  const b=q('#verBtn');if(!b||!info)return;
  const current=info.current||info.current_version||info.version,latest=info.latest&&info.latest.version;
  b.textContent=info.available&&latest?`有新版本 v${latest}`:current?`v${current}`:'版本与更新';
  b.title=info.available?'查看更新说明并一键更新':'版本信息';
  b.classList.toggle('has-update',!!info.available);
}
/** 服务器版本和本页加载时的版本不同（更新完成、或别处更新过）就刷新页面，不留旧页面在跑 */
function reloadIfNewVersion(info){
  if(!info||!info.current)return;
  if(!PAGE_VERSION){PAGE_VERSION=info.current;return;}
  if(info.current!==PAGE_VERSION)goNewVersion(info.current);
}
/** /health 不用登录：返回服务器现在的版本号，连不上返回空串 */
async function serverVersion(){
  try{
    const r=await fetch('/health',{cache:'no-store'});
    if(!r.ok)return '';
    const h=await r.json();
    return (h&&h.version)||'';
  }catch(e){return '';}
}
/** 本页是哪个版本时打开的：一打开就记下（不用登录），之后服务器版本变了就刷新 */
async function rememberPageVersion(){
  if(!PAGE_VERSION){const v=await serverVersion();if(v&&!PAGE_VERSION)PAGE_VERSION=v;}
}
/** 每分钟看一眼：在别处更新过、或登录页开着时更新完成，也能自动换到新页面 */
async function checkPageVersion(){
  if(!PAGE_VERSION||updateReloadAt||updatePollTimer)return;
  if(typeof document!=='undefined'&&document.hidden)return;
  const v=await serverVersion();
  if(v&&v!==PAGE_VERSION)goNewVersion(v);
}
/** 服务器已经是新版本：给一句提示，马上刷新到新页面 */
function goNewVersion(v){
  if(updateReloadAt)return;
  updateReloadAt=Date.now();
  updRunShow(UPDATE_INFO,{reloading:v});
  setTimeout(()=>location.reload(),350);
}
const UR_STEPS=['等待生成中的任务完成','下载并安装新版本','重启服务','打开新版本'];
function urStep(state){
  if(['started','backing_up','downloading','installing'].includes(state))return 1;
  if(['restarting','verifying'].includes(state))return 2;
  if(state==='done')return 3;
  return 0;
}
/** 更新进度卡：等任务时在右下角；开始换版本（或服务暂时连不上）后铺满整屏 */
function updRunShow(info,opt={}){
  if(typeof document.createElement!=='function')return;
  const req=(info&&info.request)||{},prog=(info&&info.progress)||{};
  const state=prog.state||req.state||'';
  const target=req.version||prog.to_version||opt.reloading||'';
  const step=opt.reloading?3:opt.down?Math.max(2,urStep(state)):urStep(state);
  let el=q('#updRun');
  if(!el){el=document.createElement('div');el.id='updRun';el.className='upd-run';el.setAttribute('role','status');
    el.setAttribute('aria-live','polite');document.body.append(el);}
  el.classList.toggle('full',step>=1);
  const since=req.requested_at?Math.max(0,Math.round(Date.now()/1000-req.requested_at)):0;
  const mmss=Math.floor(since/60)+':'+String(since%60).padStart(2,'0');
  const msg=opt.reloading?'新版本已就绪，正在打开…':opt.down?'服务重启中，几秒后自动打开新版本…':(prog.message||req.message||'');
  el.innerHTML=`<div class="ur-box"><h3>正在更新到 <span translate="no">v${esc(target)}</span></h3>
    <ol class="ur-steps">${UR_STEPS.map((t,i)=>`<li class="${i<step?'done':i===step?'on':''}">${t}</li>`).join('')}</ol>
    <div class="ur-bar"><i style="transform:scaleX(${Math.min(1,(step+.5)/UR_STEPS.length)})"></i></div>
    <p class="ur-msg" translate="no">${esc(msg)}</p>
    ${since?`<p class="ur-time">已用 <span translate="no">${mmss}</span></p>`:''}</div>`;
}
function updRunHide(){const el=q('#updRun');if(el&&el.remove)el.remove();}
async function checkUpdateBadge(){
  try{UPDATE_INFO=await api('/api/admin/update');updateBadge(UPDATE_INFO);reloadIfNewVersion(UPDATE_INFO);
    if(UPDATE_INFO.request&&!updatePollTimer)watchUpdate();
    notifyNewVersion(UPDATE_INFO);}catch(e){}
}
/** 发现新正式版时右下角提醒一次；点「查看更新」或「稍后」后同一版本不再提醒（存在本浏览器） */
const UPDATE_SEEN_KEY='dola-update-seen';
function updateSeen(){try{return localStorage.getItem(UPDATE_SEEN_KEY)||'';}catch(e){return '';}}
function markUpdateSeen(v){try{localStorage.setItem(UPDATE_SEEN_KEY,v);}catch(e){}}
function notifyNewVersion(info){
  const v=info&&info.available&&info.latest&&info.latest.version;
  if(!v||info.request||updateSeen()===v||q('#updNotice')||typeof document.createElement!=='function')return;
  const summary=StudioBrand.text(info.latest.notes||'').replace(/\r/g,'').split('\n').map(x=>x.trim())
    .find(x=>x&&!x.startsWith('#'))||'';
  const box=document.createElement('div');
  box.className='upd-notice';box.id='updNotice';box.setAttribute('role','status');
  box.innerHTML=`<h3>发现新版本 <span translate="no">v${esc(v)}</span></h3>`
    +(summary?`<p translate="no">${esc(summary.replace(/\*\*/g,'').slice(0,90))}${summary.length>90?'…':''}</p>`:'')
    +`<div class="nd-actions"><button class="btn" type="button" id="updLater">稍后</button>`
    +`<button class="btn btn-p" type="button" id="updView">查看更新</button></div>`;
  document.body.append(box);
  requestAnimationFrame(()=>box.classList.add('nd-in'));
  const close=()=>{markUpdateSeen(v);box.remove();};
  q('#updLater').addEventListener('click',close);
  q('#updView').addEventListener('click',()=>{close();openUpdate();});
}
function updateProgressHtml(info){
  const p=info.progress||{},st=p.state||'';
  if(!info.request&&!st)return '';
  if(!info.request){   // 已结束的上一次更新：一行小字，不抢当前状态的位置
    const label=UPDATE_STATES[st]||st;
    return `<p class="hint upd-last">上次更新：<span translate="no">${esc(p.from_version||'')} → ${esc(p.to_version||'')}</span> · <span>${esc(label)}</span></p>`;
  }
  const label=UPDATE_STATES[st]||st;
  const cls=st==='done'?'b-green':(st==='failed'||st==='rolled_back')?'b-red':st==='cancelled'?'b-gray':'b-blue';
  const versions=p.to_version?`<span class="tiny" translate="no">${esc(p.from_version||'')} → ${esc(p.to_version)}</span>`:'';
  return `<div class="upd-steps"><span class="badge ${cls}">${esc(label)}</span>${versions}</div>`
    +(p.message?`<p class="hint" translate="no">${esc(StudioBrand.text(p.message))}</p>`:'');
}
/** GitHub 发布说明（Markdown）→ 安全 HTML：先整体转义，再还原标题、加粗、列表、行内代码和链接 */
function renderNotes(md){
  const inline=t=>esc(t)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,(_,txt,url)=>`<a href="${url}" target="_blank" rel="noopener">${txt}</a>`)
    .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
    .replace(/`([^`]+)`/g,'<code>$1</code>');
  const out=[];let list=false;
  for(const raw of String(md||'').replace(/\r/g,'').split('\n')){
    const line=raw.trimEnd();
    const item=line.match(/^\s*[-*]\s+(.*)$/);
    if(item){if(!list){out.push('<ul>');list=true;}out.push('<li>'+inline(item[1])+'</li>');continue;}
    if(list){out.push('</ul>');list=false;}
    if(!line.trim())continue;
    const h=line.match(/^(#{1,4})\s+(.*)$/);
    if(h){out.push(`<h4${h[1].length===1?' class="upd-h1"':''}>${inline(h[2])}</h4>`);continue;}
    out.push('<p>'+inline(line)+'</p>');
  }
  if(list)out.push('</ul>');
  return StudioBrand.markup(out.join(''));
}
function renderUpdate(info){
  const latest=info.latest||{},agent=info.agent||{},req=info.request;
  const running=!!req;
  const modeText=info.mode==='docker'?'Docker 部署':'源码部署';
  let action='';
  if(running){
    const started=info.progress&&info.progress.id===req.id&&!['draining','ready'].includes(info.progress.state);
    action=started?'<p class="hint">更新程序正在执行，完成后页面会自动刷新。</p>'
      :'<button class="btn" onclick="cancelUpdate()">取消更新</button>';
  }else if(info.available){
    action=agent.ready
      ?`<button class="btn btn-p" onclick="startUpdate('${esc(latest.version)}')">更新到 v${esc(latest.version)}</button>`
      :`<p class="hint">不能自动更新：${noTr(StudioBrand.text(agent.reason||''))}</p>`
        +(info.mode==='docker'?'<p class="hint">手动更新：在 docker-compose.yml 所在目录执行 docker compose pull && docker compose up -d</p>'
          :'<p class="hint">安装更新程序：sudo bash deploy/install-updater.sh</p>');
  }
  showDlg(`<h2 data-dlg="update">版本</h2>
    <p class="hint">当前版本 <strong translate="no">v${esc(info.current)}</strong> · <span>${modeText}</span>
      · 最新正式版 <strong translate="no">${latest.version?'v'+esc(latest.version):'—'}</strong>
      ${latest.published_at?`<span class="tiny" translate="no">（${esc(latest.published_at.slice(0,10))}）</span>`:''}</p>
    ${latest.configured===false?'<p class="hint">未配置自定义发布通道；当前定制构建不会自动覆盖安装上游版本。</p>':''}
    ${latest.error?`<p class="hint">查询发布通道失败：${noTr(StudioBrand.text(latest.error))}</p>`:''}
    ${!info.available&&!running&&latest.version?'<p class="hint">已是最新版本。</p>':''}
    ${updateProgressHtml(info)}
    ${info.available&&latest.notes?`<div class="upd-notes" translate="no">${renderNotes(latest.notes)}</div>`:''}
    ${info.available&&!running?'<p class="hint">更新时会暂停派新单，等正在生成的任务完成后再换版本并重启（约 1～3 分钟）；新提交的任务排队等待，更新后自动继续。更新前自动备份代码和数据库，失败自动回滚。</p>':''}
    <div class="row">${action}
      <a class="btn" href="${PROJECT_URL}" target="_blank" rel="noopener" aria-label="构建说明"><svg viewBox="0 0 24 24" aria-hidden="true" style="width:15px;height:15px;fill:currentColor"><path d="M12 2.5a9.5 9.5 0 0 0-3 18.52c.48.09.65-.21.65-.46v-1.67c-2.65.58-3.21-1.12-3.21-1.12-.44-1.1-1.07-1.4-1.07-1.4-.87-.59.07-.58.07-.58.96.07 1.47.99 1.47.99.86 1.47 2.25 1.05 2.8.8.09-.62.34-1.05.61-1.29-2.12-.24-4.35-1.06-4.35-4.72 0-1.04.37-1.89.98-2.56-.1-.24-.43-1.21.09-2.52 0 0 .8-.26 2.62.98a9.14 9.14 0 0 1 4.77 0c1.82-1.24 2.62-.98 2.62-.98.52 1.31.19 2.28.09 2.52.61.67.98 1.52.98 2.56 0 3.67-2.23 4.48-4.36 4.72.35.3.65.87.65 1.75v2.59c0 .25.17.55.66.46A9.5 9.5 0 0 0 12 2.5Z"/></svg>构建说明</a>
      ${latest.url?`<a class="btn" href="${esc(latest.url)}" target="_blank" rel="noopener">发布说明</a>`:''}
      <button class="btn" onclick="checkUpdateNow()">检查更新</button>
      <button class="btn" onclick="closeUpdate()">关闭</button></div>`);
}
async function openUpdate(){
  showDlg('<h2>版本</h2><p class="hint">正在查询版本信息…</p>');
  try{UPDATE_INFO=await api('/api/admin/update');updateBadge(UPDATE_INFO);renderUpdate(UPDATE_INFO);watchUpdate();}
  catch(e){if(e.message!=='unauthorized')showDlg(`<h2>版本</h2><p role="alert">${esc(e.message)}</p><button class="btn" onclick="openUpdate()">重试</button>`);}
}
async function checkUpdateNow(){
  try{UPDATE_INFO=await api('/api/admin/update/check',{method:'POST'});updateBadge(UPDATE_INFO);renderUpdate(UPDATE_INFO);}
  catch(e){if(e.message!=='unauthorized')alert(dialogText`${e.message}`);}
}
async function startUpdate(version){
  if(!await confirm(dialogText`更新到 v${version}？会暂停派新单，等正在生成的任务完成后重启服务，失败自动回滚。`))return;
  try{UPDATE_INFO=await api('/api/admin/update',{method:'POST',body:{version}});renderUpdate(UPDATE_INFO);hide('dlg');watchUpdate();}
  catch(e){if(e.message!=='unauthorized')alert(dialogText`${e.message}`);}
}
async function cancelUpdate(){
  if(!await confirm('取消这次更新？'))return;
  try{UPDATE_INFO=await api('/api/admin/update/cancel',{method:'POST'});renderUpdate(UPDATE_INFO);updRunHide();}
  catch(e){if(e.message!=='unauthorized')alert(dialogText`${e.message}`);}
}
/** 关掉对话框不停止盯更新进度：更新完成后仍要自动刷新页面 */
function closeUpdate(){hide('dlg');}
/** 更新进行中约每 1.2 秒刷新进度；服务重启时接口连不上，就每秒直接问 /health 的版本号；版本一变立刻刷新页面。 */
function watchUpdate(){
  clearTimeout(updatePollTimer);
  if(!UPDATE_INFO||!UPDATE_INFO.request)return;
  if(!PAGE_VERSION)PAGE_VERSION=UPDATE_INFO.current;
  updRunShow(UPDATE_INFO);
  const tick=async()=>{
    let info=null,denied=false;
    // 重启后旧版本的登录会失效（2.7.9 及以前会话只在内存里）：这里不弹登录页，先看版本变没变
    try{info=await api('/api/admin/update',{quiet401:true});}
    catch(e){denied=e.message==='unauthorized';}
    if(!info){
      updRunShow(UPDATE_INFO,{down:true});
      const v=await serverVersion();
      if(v&&v!==PAGE_VERSION){goNewVersion(v);return;}
      if(v&&denied){updRunHide();updatePollTimer=null;showLogin();return;}   // 服务在、版本没变、登录失效
      updatePollTimer=setTimeout(tick,1000);return;
    }
    UPDATE_INFO=info;updateBadge(info);
    if(q('#dlg').style.display!=='none'&&q('#dlgBox').querySelector('[data-dlg="update"]'))renderUpdate(info);
    if(info.current&&PAGE_VERSION&&info.current!==PAGE_VERSION){goNewVersion(info.current);return;}
    if(!info.request){updRunHide();updatePollTimer=null;return;}   // 结束但版本没变：失败 / 回滚 / 取消，结果在版本对话框里
    updRunShow(info);
    updatePollTimer=setTimeout(tick,1200);
  };
  updatePollTimer=setTimeout(tick,800);
}

