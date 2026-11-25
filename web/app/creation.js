/* UI state only. Account credentials and generation state remain in existing APIs. */
const DEFAULT_TEST_PROMPT="古风玄幻夜景，山崖之巅，月色如银盘，漫天繁星。少年斜躺在青草地上，嘴里叼着一根青草，轻轻咀嚼，神色淡然。他抬起白皙手掌挡在眼前，目光透过指缝望向空中巨大银月，氛围静谧悠远，柔和清冷月光，氛围感拉满，构图稳定，人物面部一致，运镜缓慢推拉，写实漫剧质感，光影统一，细节细腻，无闪烁";
let studioMode='chat';
const MODE_LABELS={chat:'聊天模式',work:'工作模式',force15:'聊天模式',auto:'聊天模式'};
function modeLabel(mode){return MODE_LABELS[mode]||'聊天模式';}
function setStudioMode(mode){
  studioMode=mode==='work'?'work':'chat';
  document.querySelectorAll('[data-studio-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.studioMode===studioMode)));
}
function modeDeck(mode,handler,attr='data-gen-mode'){
  return ['chat','work'].map((m,i)=>`<button type="button" class="mode-channel" ${attr}="${m}" aria-pressed="${mode===m}" onclick="${handler}('${m}')"><b>${modeLabel(m)}</b><span class="mode-time">15<span style="font-size:11px">s</span></span><small>${i?'在工作空间中生成视频':'在聊天会话中生成视频'}</small></button>`).join('');
}
async function openStudioCreate(){
  const name=q('#studioAccount').value;
  if(!name){q('#studioAccount').focus();toast('请先选择一个生成账号');return;}
  openTestGen(name,{mode:studioMode,prompt:q('#studioPrompt').value});
}
async function openNewCreation(){
  try{await loadAccounts();}catch(e){toast('账号列表读取失败，请刷新后重试');return;}
  if(!allAccounts.length){switchTab('accounts');toast('请先添加并登录账号');return;}
  showDlg(`<h2>选择生成账号</h2><p class="gen-intro">选择账号后配置视频。开始生成会消耗该账号的真实额度。</p><label for="createAccount">生成账号</label><select id="createAccount" style="width:100%;height:40px">${allAccounts.map(a=>`<option value="${esc(a.name)}">${esc(a.name)} · ${esc(a.group||'未分组')}</option>`).join('')}</select><div class="row"><button class="btn" onclick="hide('dlg')">取消</button><button class="btn btn-p" onclick="openTestGen(q('#createAccount').value,{mode:studioMode})">继续配置</button></div>`);
}
async function loadDash(){
  await legacyLoadDash();
  const results=await Promise.allSettled([loadAccounts(),api('/api/admin/tasks?limit=4')]);
  if(results[0].status==='fulfilled'){
    const selected=q('#studioAccount').value;
    setHTML('#studioAccount','<option value="">选择生成账号</option>'+allAccounts.map(a=>`<option value="${esc(a.name)}">${esc(a.name)} · ${esc(a.group||'未分组')}${a.busy?' · 忙碌':''}</option>`).join(''));
    q('#studioAccount').value=allAccounts.some(a=>a.name===selected)?selected:'';
    q('#studioAccount').disabled=false;
  }else{q('#studioAccount').innerHTML='<option value="">账号读取失败，请刷新</option>';q('#studioAccount').disabled=true;}
  const lane=q('#recentLanes');
  if(results[1].status==='fulfilled'){
    const tasks=results[1].value.tasks||[],labels={queued:'等待调度',processing:'生成中',completed:'已完成',failed:'未完成'};
    q('#queueSummary').textContent='最近 '+Math.min(tasks.length,4)+' 条';
    setHTML(lane,tasks.length?tasks.slice(0,4).map(t=>`<div class="task-lane"><span class="lane-state ${esc(t.status)}">${esc(labels[t.status]||t.status)}</span><span class="lane-prompt" title="${esc(t.prompt||'')}">${esc(t.prompt||'未填写提示词')}</span><small>${esc(t.account||'等待分配账号')}</small><small style="text-align:right">${Number(t.duration)||10}s</small><span class="lane-mode">${modeLabel(t.execution_mode)}</span></div>`).join(''):'<div class="empty">还没有生成任务。选择模式，写下第一个画面。</div>');
  }else{q('#queueSummary').textContent='暂时无法读取';lane.innerHTML='<div class="queue-error">任务读取失败，请使用侧栏刷新重试。</div>';}
}
function accountRowActions(a){
  const n=esc(JSON.stringify(a.name)),busy=pendingVerifications.has(a.name)||a.busy;
  return `<button class="btn" onclick="openTestGen(${n})">生成</button><button class="btn" ${busy?'disabled':''} onclick="verify(${n},this)">${busy?'忙碌':'验证'}</button><details class="more-tools row-tools" ontoggle="positionRowTools(this)"><summary aria-label="${esc(a.name)} 的更多操作">更多</summary><div class="tool-menu"><button class="btn" onclick="openSetAccountProxy(${n},${esc(JSON.stringify(a.proxy_id||''))})">设置代理</button><button class="btn" onclick="openRenameAccount(${n})">重命名</button><button class="btn" onclick="exportAccountCookies(${n})">导出 Cookie</button>${['风控','异常','待激活'].includes(a.group)?`<button class="btn" onclick="probeHello(${n})">检测聊天状态</button>`:''}${['风控','异常'].includes(a.group)?`<button class="btn" onclick="recoverAccount(${n},'${a.group==='异常'?'abnormal':'risk'}')">恢复调度</button>`:''}<button class="btn btn-danger" onclick="delAccount(${n})">删除账号</button></div></details>`;
}
function positionRowTools(el){
  if(!el.open)return;
  document.querySelectorAll('.row-tools[open]').forEach(x=>{if(x!==el)x.open=false;});
  const r=el.getBoundingClientRect(),menu=el.querySelector('.tool-menu');
  const top=Math.max(72,Math.min(r.bottom+6,innerHeight-menu.offsetHeight-16));
  el.style.setProperty('--tools-top',top+'px');el.style.setProperty('--tools-right',Math.max(16,innerWidth-r.right)+'px');
}
document.addEventListener('click',e=>{document.querySelectorAll('.more-tools[open]').forEach(x=>{if(!x.contains(e.target))x.open=false;});});
document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelectorAll('.more-tools[open]').forEach(x=>x.open=false);});
function openTestGen(name,initial={}){
  stopTestGenPoll();testGenAttachments={images:[],audio:[]};
  const account=allAccounts.find(a=>a.name===name);
  if(!account){toast('账号不存在，请刷新列表');return;}
  const isDoubao=account.site==='doubao',workOnly=isDoubao&&account.doubao_account_type==='work';
  const personal=isDoubao&&!workOnly;
  const mode=workOnly?'work':personal?'chat':initial.mode||studioMode;
  const model=isDoubao?(workOnly?'doubao-seedance-2.0-fast':'doubao-seedance-2.0-mini'):'seedance-2.0-fast';
  const models=isDoubao?['doubao-seedance-2.0-mini','doubao-seedance-2.0-fast','doubao-seedance-2.0','doubao-seedance-2.5']:['seedance-2.0-fast','seedance-2.5'];
  showDlg(`<div class="gen-meta"><span>新建视频</span><span>${esc(name)}</span></div><h2>把想象，变成画面。</h2><p class="gen-intro">两种模式均提供 15 秒选项。提交后会消耗真实额度，结果以任务回执为准。</p><div class="mode-deck" id="genModeDeck">${modeDeck(mode,'setGenMode')}</div><select id="tg_mode" onchange="syncTestGenDurations()"><option value="chat"${mode==='chat'?' selected':''}>聊天模式</option><option value="work"${mode==='work'?' selected':''}>工作模式</option></select><div class="gen-grid"><div><label for="tg_model">视频模型</label><select id="tg_model" onchange="syncTestGenDurations()">${models.map(m=>`<option value="${m}"${m===model?' selected':''}>${m.replace('doubao-','').replace('seedance-','Seedance ')}</option>`).join('')}</select></div><div><label for="tg_duration">视频时长</label><select id="tg_duration" onchange="syncTestGenCount();syncGenAudio()">${testGenDurationOptions(model,15,mode)}</select></div><div><label for="tg_ratio">画面比例</label><select id="tg_ratio"><option>16:9</option><option>9:16</option><option>1:1</option><option>4:3</option><option>3:4</option></select></div><div><label for="tg_count">视频条数</label><select id="tg_count" onchange="syncTestGenCount()"><option value="1">1 条视频</option><option value="2">2 条视频 · 每条 15 秒</option></select></div></div><div id="tg_hint" class="tiny"></div><label for="tg_prompt">画面描述</label><textarea id="tg_prompt" rows="4" style="width:100%;padding:12px;margin-top:8px" placeholder="描述主体、场景、动作，以及镜头如何移动…">${esc(initial.prompt||DEFAULT_TEST_PROMPT)}</textarea><details class="material-tools"><summary>添加参考素材</summary><label for="tg_images">参考图片</label><input id="tg_images" type="file" multiple accept="image/jpeg,image/png,image/webp" onchange="readTestGenFiles(this,'images')" aria-describedby="tg_ref_limits">${isDoubao?'':`<label for="tg_audio">参考音频</label><input id="tg_audio" type="file" multiple accept=".mp3,.wav,.m4a,.flac,.ogg" onchange="readTestGenFiles(this,'audio')" aria-describedby="tg_audio_hint"><div id="tg_audio_hint" class="tiny">音频仅支持聊天模式 · Seedance 2.0 Fast · 15 秒。</div>`}<div id="tg_ref_limits" class="tiny">图片最多 30 张；音频最多 3 个，每个 90 秒以内。单文件 20 MiB，合计 60 MiB。</div></details><div id="tg_refs" aria-live="polite"></div><div id="tg_status" role="status" class="tiny" style="margin:14px 0;white-space:pre-wrap"></div><div class="row"><button class="btn" onclick="hide('dlg')">取消</button><button class="btn btn-p" id="tg_btn" onclick="submitTestGen(${esc(JSON.stringify(name))})">开始生成 →</button></div>`);
  q('#dlgBox').classList.add('generation-box');
  q('#dlgBox').setAttribute('role','dialog');q('#dlgBox').setAttribute('aria-modal','true');q('#dlgBox').setAttribute('aria-label','新建视频');
  q('#tg_mode').dataset.lock=workOnly?'work':personal?'chat':'';
  syncTestGenDurations();
  q('#tg_prompt').focus();
}
function setGenMode(mode){
  const sel=q('#tg_mode'),lock=sel.dataset.lock;
  if(lock&&lock!==mode){toast(lock==='work'?'该豆包账号仅支持工作模式':'该豆包账号仅支持聊天模式');return;}
  if(mode==='work'&&q('#tg_model').value==='seedance-2.5'){toast('工作模式请选择 Seedance 2.0 Fast');return;}
  sel.value=mode;syncTestGenDurations();
}
function testGenDurationOptions(model,current,mode='chat'){
  const list=model.startsWith('doubao-')?(model.endsWith('2.5')?[5,10,15,30]:[5,10,15]):mode==='work'||model==='seedance-2.5'?[5,10,15,30]:[5,10,15];
  const pick=list.includes(Number(current))?Number(current):15;
  return list.map(d=>`<option value="${d}"${d===pick?' selected':''}>${d} 秒</option>`).join('');
}
function testGenHint(model,mode='chat'){
  return mode==='work'?'工作模式 · 使用工作空间的视频能力；账号需要绑定代理，实际时长以回执为准。':'聊天模式 · 在聊天会话中生成；15 秒使用专用提交流程，提交后持续查询同一会话。';
}
function syncTestGenDurations(){
  const sel=q('#tg_duration');if(!sel)return;
  const model=q('#tg_model').value,mode=q('#tg_mode');
  if(model==='seedance-2.5'&&mode.value==='work')mode.value='chat';
  sel.innerHTML=testGenDurationOptions(model,sel.value,mode.value);sel.disabled=false;
  q('#tg_hint').textContent=testGenHint(model,mode.value);
  document.querySelectorAll('[data-gen-mode]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.genMode===mode.value));b.disabled=(!!mode.dataset.lock&&mode.dataset.lock!==b.dataset.genMode)||(model==='seedance-2.5'&&b.dataset.genMode==='work');});
  syncTestGenCount();syncGenAudio();
}
function syncGenAudio(){
  const a=q('#tg_audio');if(a)a.disabled=!(q('#tg_mode').value==='chat'&&q('#tg_model').value==='seedance-2.0-fast'&&q('#tg_duration').value==='15');
}
function syncTestGenCount(){
  const sel=q('#tg_count');if(!sel)return;
  sel.disabled=!(q('#tg_mode')&&q('#tg_mode').value==='work'&&q('#tg_model').value==='seedance-2.0-fast'&&Number(q('#tg_duration').value)===15);
  if(sel.disabled)sel.value='1';
}
/* The original form submitter still validates reference limits and the explicit warning retry. */
document.addEventListener('keydown',e=>{
 if(e.defaultPrevented||document.querySelector('.nd'))return;
 const overlay=[...document.querySelectorAll('.dialog')].filter(el=>el.style.display!=='none').at(-1);
 if(!overlay)return;const box=overlay.querySelector('.box');
 if(e.key==='Escape'){e.preventDefault();box.querySelector('.dialog-close')?.click();return;}
 if(e.key!=='Tab')return;
 const items=[...box.querySelectorAll('button:not(:disabled),select:not(:disabled),input:not(:disabled),textarea:not(:disabled),summary')].filter(el=>el.getClientRects().length);
 if(!items.length)return;const i=items.indexOf(document.activeElement);
 if(e.shiftKey&&i<=0){e.preventDefault();items.at(-1).focus();}else if(!e.shiftKey&&(i<0||i===items.length-1)){e.preventDefault();items[0].focus();}
});


