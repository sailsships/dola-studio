/* ---- API 密钥 ---- */
async function loadKeys(){
  const r=await api('/api/admin/keys');
  // 允许时长由后端下发（随 DOLA_NATIVE_DURATION_MAX 变化），不再前端硬编码。
  if(Array.isArray(r.supported_durations)&&r.supported_durations.length)SUPPORTED_DURATIONS=r.supported_durations;
  const mask=k=>'sk-'+k.slice(3,9)+'…'+k.slice(-4);
  const keys=r.keys.filter(k=>searchHit('keys',k.name,k.key,k.enabled?'启用':'停用'));
  selPrune('keys',keys.map(k=>k.key));
  const rows=keys.map(k=>[
    selBox('keys',k.key,false),
    '<span style="font-family:monospace">'+mask(k.key)+'</span>',
    k.name?noTr(k.name):'—',
    (k.allowed_durations||[]).join(' / ')+' 秒',
    (k.daily_limit?`${k.today_total} / ${k.daily_limit}`:`${k.today_total} / 不限`),
    (k.concurrency_limit?`${k.today_active} / ${k.concurrency_limit}`:`${k.today_active} / 不限`)+(k.today_queued?` <span class=\"tiny\">排队 ${k.today_queued}</span>`:''),
    `<label class="sw"><input type="checkbox" ${k.enabled?'checked':''} onchange="setKey('${k.key}',this.checked)"><i></i></label>`,
    fmt(k.last_used_at),
    `<button class="btn" style="margin-right:6px" onclick="copyKey('${k.key}')">复制</button><button class="btn" style="margin-right:6px" onclick="openEditKey('${k.key}')">设置</button><button class="btn btn-danger" onclick="delKey('${k.key}')">删除</button>`
  ]);
  setHTML('#keysTable',table([selAllBox('keys'),'Key','名称','允许时长','今日任务','并发','启用','最近使用','操作'],rows)
    +(r.env_keys>0?`<div class="hint" style="margin-top:10px">另有 ${r.env_keys} 个环境变量 key（永久有效，面板只读）</div>`:''));
  selUpdate('keys');
}
async function setKey(key,on){
  try{await api('/api/admin/keys/'+encodeURIComponent(key),{method:'PATCH',body:{enabled:on}});}catch(e){alert(dialogText`${e.message}`);}refresh();
}
async function copyKey(key){
  await copy(key);
  toast(dialogText`已复制 ${key.slice(0,8)+'…'+key.slice(-4)}`);
}
async function delKey(key){
  if(!await confirm('删除该密钥？调用方将立即失效。'))return;
  try{await api('/api/admin/keys/'+encodeURIComponent(key),{method:'DELETE'});}catch(e){alert(dialogText`${e.message}`);}refresh();
}
// 仅作接口返回前的占位默认值；真实档位由 /api/admin/keys 下发（随 DOLA_NATIVE_DURATION_MAX 变化）。
let SUPPORTED_DURATIONS=[5,10,15,30];
function durationChecks(values){
  values=values||SUPPORTED_DURATIONS;
  return SUPPORTED_DURATIONS.map(v=>`<label style="display:inline-flex;align-items:center;gap:4px;margin-right:12px"><input type="checkbox" id="f_d${v}" ${values.includes(v)?'checked':''}>${v}秒</label>`).join('');
}
function openCreateKey(){
  showDlg(`<h2>创建 API 密钥</h2>
    <label>名称（可选）</label><input id="f_kname" placeholder="例如：客户A">
    <label>每日任务上限（0 = 不限）</label><input id="f_daily" type="number" min="0" value="0">
    <label>同时生成上限（0 = 不限）</label><input id="f_conc" type="number" min="0" value="0">
    <label>允许的视频时长</label><div style="padding:8px 0">${durationChecks()}</div>
    <label>过期时间戳（可选，留空 = 永久）</label><input id="f_exp" type="number" min="0" placeholder="Unix 时间戳">
    <div class="row"><button class="btn" onclick="hide('dlg')">取消</button><button class="btn btn-p" onclick="submitCreateKey()">创建</button></div>`);
}
function selectedDurations(){return SUPPORTED_DURATIONS.filter(v=>q('#f_d'+v)?.checked);}
async function submitCreateKey(){
  const name=q('#f_kname').value.trim();
  const allowed=selectedDurations();
  if(!allowed.length)return alert('至少选择一个视频时长');
  const body={name,daily_limit:Number(q('#f_daily').value||0),concurrency_limit:Number(q('#f_conc').value||0),allowed_durations:allowed};
  const exp=q('#f_exp').value.trim();if(exp)body.expires_at=Number(exp);
  try{
    const r=await api('/api/admin/keys',{method:'POST',body});
    const k=r.created.key;
    hide('dlg');
    showDlg(`<h2>创建成功，请保存密钥</h2>
      <div class="tiny">完整 key 只在此显示一次：</div>
      <div class="keyfull" id="newKey">${esc(k)}</div>
      <div class="row"><button class="btn" onclick="copyFromNewKey()">复制</button><button class="btn btn-p" onclick="hide('dlg');loadKeys()">完成</button></div>`);
  }catch(e){alert(dialogText`${e.message}`);}
}
async function openEditKey(key){
  const r=await api('/api/admin/keys');const k=r.keys.find(x=>x.key===key);if(!k)return;
  showDlg(`<h2>设置 API 密钥</h2>
    <div class="tiny" style="margin-bottom:8px">${noTr(k.name||key)}</div>
    <label>每日任务上限（0 = 不限）</label><input id="f_daily" type="number" min="0" value="${k.daily_limit}">
    <label>同时生成上限（0 = 不限）</label><input id="f_conc" type="number" min="0" value="${k.concurrency_limit}">
    <label>允许的视频时长</label><div style="padding:8px 0">${durationChecks(k.allowed_durations)}</div>
    <label>过期时间戳（0 = 永久）</label><input id="f_exp" type="number" min="0" value="${k.expires_at||0}">
    <div class="row"><button class="btn" onclick="hide('dlg')">取消</button><button class="btn btn-p" onclick="submitEditKey('${key}')">保存</button></div>`);
}
async function submitEditKey(key){
  const allowed=selectedDurations();if(!allowed.length)return alert('至少选择一个视频时长');
  try{await api('/api/admin/keys/'+encodeURIComponent(key),{method:'PATCH',body:{daily_limit:Number(q('#f_daily').value||0),concurrency_limit:Number(q('#f_conc').value||0),allowed_durations:allowed,expires_at:Number(q('#f_exp').value||0)}});hide('dlg');refresh();}catch(e){alert(dialogText`${e.message}`);}
}
function copyFromNewKey(){copy(q('#newKey').textContent.trim());}
async function copy(text){
  try{await navigator.clipboard.writeText(text);}catch(e){
    const t=document.createElement('textarea');t.value=text;document.body.appendChild(t);t.select();document.execCommand('copy');t.remove();
  }
}

function showDlg(html,variant=''){q('#dlgBox').classList.toggle('nodes-wide',variant==='nodes');dialogEpoch++;stopAppleProgress();if(typeof closeModelList==='function')closeModelList();q('#dlgBox').classList.remove('generation-box');q('#dlgBox').innerHTML=html;show('dlg');}

