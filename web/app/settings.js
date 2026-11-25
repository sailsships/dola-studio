/* ---- 全局并发：输入不会被后台自动刷新覆盖 ---- */
async function openConcurrencySettings(){
  showDlg(`<h2>全局并发</h2><p class="hint">正在读取并发设置…</p>`);
  const epoch=dialogEpoch;
  try{
    const data=await api('/api/admin/settings/concurrency');
    if(epoch!==dialogEpoch)return;
    showDlg(`<h2>全局并发</h2>
      <p class="hint">所有客户共用的生成任务上限，包含准备、生成和下载阶段。每个账号仍同时只处理一个任务。</p>
      <p class="hint">当前上限：<strong id="concurrencyCurrent" translate="no">${data.max_concurrency===0?'∞':data.max_concurrency}</strong> · 占用名额：<strong id="concurrencyActive" translate="no">${data.active}</strong> · 等待名额：<strong id="concurrencyWaiting" translate="no">${data.waiting}</strong></p>
      <label for="globalConcurrency">同时处理上限（0 = 不限）</label>
      <input id="globalConcurrency" type="number" min="0" max="1000" step="1" required value="${data.max_concurrency}" aria-describedby="concurrencyHint">
      <p class="hint" id="concurrencyHint">保存后立即生效，重启后保留。调低上限不会中断正在运行的任务；API Key 限制、账号占用和出口隔离仍然有效。浏览器模式建议先从 2 开始观察资源占用。</p>
      <p id="concurrencyFeedback" class="hint" role="status" aria-live="polite"></p>
      <div class="row"><button class="btn" onclick="hide('dlg')">关闭</button><button id="saveConcurrency" class="btn btn-p" onclick="saveConcurrencySettings()">保存并生效</button></div>`);
  }catch(e){
    if(epoch===dialogEpoch&&e.message!=='unauthorized')showDlg(`<h2>全局并发</h2><p role="alert">${esc(e.message)}</p><button class="btn" onclick="openConcurrencySettings()">重试</button>`);
  }
}

async function saveConcurrencySettings(){
  const input=q('#globalConcurrency'),button=q('#saveConcurrency'),feedback=q('#concurrencyFeedback');
  if(!input||!button||button.disabled)return;
  const value=Number(input.value);
  if(!input.value.trim()||!Number.isInteger(value)||value<0||value>1000){
    feedback.textContent='请输入 0～1000 的整数，0 表示不限。';input.focus();return;
  }
  const epoch=dialogEpoch;
  button.disabled=true;input.disabled=true;feedback.textContent='正在保存…';
  try{
    const data=await api('/api/admin/settings/concurrency',{method:'PATCH',body:{max_concurrency:value}});
    if(epoch!==dialogEpoch)return;
    input.value=data.max_concurrency;
    q('#concurrencyCurrent').textContent=data.max_concurrency===0?'∞':data.max_concurrency;
    q('#concurrencyActive').textContent=data.active;
    q('#concurrencyWaiting').textContent=data.waiting;
    feedback.textContent=data.max_concurrency>0&&data.active>data.max_concurrency
      ?'已保存并生效；当前任务继续运行，空位释放后再接下一条。'
      :'已保存并生效，无需重启服务。';
    refresh();
  }catch(e){if(epoch===dialogEpoch&&e.message!=='unauthorized')feedback.textContent='保存失败：'+e.message;}
  finally{if(epoch===dialogEpoch){button.disabled=false;input.disabled=false;}}
}

/* ---- 窗口并发：与模式开关独立，保存后立即生效 ---- */
async function openWindowConcurrencySettings(){
  showDlg(`<h2>窗口并发</h2><p class="hint">正在读取窗口设置…</p>`);
  const epoch=dialogEpoch;
  try{
    const c=await api('/api/admin/settings/window-concurrency');
    if(epoch!==dialogEpoch)return;
    showDlg(`<h2>窗口并发</h2>
      <p class="hint">强开模式和工作模式共用的生成窗口数量。</p>
      <p class="hint">正在运行：<strong id="windowActive" translate="no">${c.active}</strong> · 等待窗口：<strong id="windowWaiting" translate="no">${c.waiting}</strong></p>
      <label for="windowConcurrency">同时运行的生成窗口数</label>
      <input id="windowConcurrency" type="number" min="1" step="1" required value="${c.concurrency}" aria-describedby="windowConcurrencyHint">
      <p class="hint" id="windowConcurrencyHint">输入正整数，不设固定上限。保存后立即生效，重启后保留；调低时已运行的窗口继续执行，释放名额后再启动新窗口。</p>
      <p class="tiny">当前全局并发：${c.global_concurrency===0?'不限':c.global_concurrency}。实际运行数量仍受全局并发和可用账号数限制；加号、登录不由此项控制。</p>
      <p id="windowConcurrencyFeedback" class="hint" role="status" aria-live="polite"></p>
      <div class="row"><button class="btn" onclick="hide('dlg')">关闭</button><button id="saveWindowConcurrency" class="btn btn-p" onclick="saveWindowConcurrencySettings()">保存并生效</button></div>`);
  }catch(e){
    if(epoch===dialogEpoch&&e.message!=='unauthorized')showDlg(`<h2>窗口并发</h2><p role="alert">${esc(e.message)}</p><button class="btn" onclick="openWindowConcurrencySettings()">重试</button>`);
  }
}

async function saveWindowConcurrencySettings(){
  const input=q('#windowConcurrency'),button=q('#saveWindowConcurrency'),feedback=q('#windowConcurrencyFeedback');
  if(!input||!button||button.disabled)return;
  const value=Number(input.value);
  if(!input.value.trim()||!Number.isSafeInteger(value)||value<1){
    feedback.textContent='请输入有效的正整数。';input.focus();return;
  }
  const epoch=dialogEpoch;
  button.disabled=true;input.disabled=true;feedback.textContent='正在保存…';
  try{
    const c=await api('/api/admin/settings/window-concurrency',{method:'PATCH',body:{concurrency:value}});
    if(epoch!==dialogEpoch)return;
    input.value=c.concurrency;
    q('#windowActive').textContent=c.active;q('#windowWaiting').textContent=c.waiting;
    feedback.textContent='已保存并生效，无需重启服务。';
  }catch(e){if(epoch===dialogEpoch&&e.message!=='unauthorized')feedback.textContent='保存失败：'+e.message;}
  finally{if(epoch===dialogEpoch){button.disabled=false;input.disabled=false;}}
}

/* ---- 底部「设置」菜单：向上展开，并限制在当前视口内 ---- */
function toggleTopMenu(ev){
  ev.stopPropagation();
  const menu=q('#topMenu'),btn=q('#setBtn');
  if(!menu.hidden){closeTopMenu();return;}
  const r=btn.getBoundingClientRect();
  menu.style.maxHeight=Math.max(0,r.top-14)+'px';
  menu.hidden=false;
  menu.style.top=Math.max(8,r.top-menu.offsetHeight-6)+'px';
  menu.style.left=Math.max(8,Math.min(r.right-menu.offsetWidth,window.innerWidth-menu.offsetWidth-8))+'px';
  btn.setAttribute('aria-expanded','true');
  menu.querySelector('button').focus();
}
function closeTopMenu(){
  const menu=q('#topMenu');if(!menu||menu.hidden)return;
  menu.hidden=true;q('#setBtn').setAttribute('aria-expanded','false');
}
if(typeof document.addEventListener==='function'){
  document.addEventListener('click',e=>{if(!e.target.closest||!e.target.closest('#topMenu'))closeTopMenu();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeTopMenu();});
}
if(typeof window!=='undefined'&&typeof window.addEventListener==='function'){
  window.addEventListener('resize',closeTopMenu);
  window.addEventListener('scroll',closeTopMenu,true);
}

