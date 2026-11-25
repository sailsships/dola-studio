/* ---- AI 代答：Dola / 豆包的对话判断与受约束回复 ---- */
async function openResponderSettings(){
  showDlg(`<h2>AI 代答</h2><p class="hint">正在读取设置…</p>`);
  const epoch=dialogEpoch;
  try{
    const c=await api('/api/admin/settings/responder');
    if(epoch!==dialogEpoch)return;
    showDlg(`<h2>AI 代答</h2>
      <p class="hint">Dola 或豆包没有开始生成时，程序先识别明确的额度、权限和内容拒绝；遇到未知回复，再请 AI 判断回复、换号、等待或结束，并保留判断原因和上游原文。</p>
      <p class="hint">AI 只按原提示词和参数回答，不改模型、时长、比例或参考图，不确认付费。已接单或正在生成时继续查询原会话；内容审核拒绝直接结束。每个会话最多判断 3 次，每个任务最多因 AI 判断换号 2 次。</p>
      <p class="hint">工作模式选择题会优先请 AI 选择已有选项；未开启、请求失败或答案不匹配时，使用推荐／确认／第一个的规则选择。</p>
      <label class="sw-row" style="margin-top:14px"><span class="sw"><input type="checkbox" id="rpEnabled" ${c.enabled?'checked':''}><i></i></span>开启 AI 代答</label>
      <label for="rpBase">接口地址（兼容 OpenAI）</label>
      <input id="rpBase" placeholder="https://你的网关/v1" value="${esc(c.base_url||'')}" autocomplete="off" spellcheck="false">
      <label for="rpKey">API Key</label>
      <input id="rpKey" type="password" autocomplete="new-password" placeholder="${c.api_key_set?esc('已保存 '+(c.api_key_hint||'')+'，留空不修改'):'sk-…'}">
      <label for="rpModel">模型</label>
      <div class="combo-row">
        <input id="rpModel" placeholder="填写或点「获取模型」选择" value="${esc(c.model||'')}" autocomplete="off" spellcheck="false"
          role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="rpModelList">
        <button class="btn" id="rpFetch" type="button" onclick="fetchResponderModels()">获取模型</button>
      </div>
      <p id="rpFeedback" class="hint" role="status" aria-live="polite" style="margin-top:12px">${c.ready?'已开启，配置完整。':'未开启或配置不全：使用现有规则。'}</p>
      <div class="row"><button class="btn" onclick="hide('dlg')">关闭</button>
        <button class="btn" id="rpTest" onclick="testResponder()">测试</button>
        <button class="btn btn-p" id="rpSave" onclick="saveResponderSettings()">保存</button></div>`);
  }catch(e){
    if(epoch===dialogEpoch&&e.message!=='unauthorized')showDlg(`<h2>AI 代答</h2><p role="alert">${esc(e.message)}</p><button class="btn" onclick="openResponderSettings()">重试</button>`);
  }
}
async function saveResponderSettings(){
  const fb=q('#rpFeedback'),btn=q('#rpSave');if(!btn||btn.disabled)return;
  const body={enabled:q('#rpEnabled').checked,base_url:q('#rpBase').value.trim(),model:q('#rpModel').value.trim()};
  const key=q('#rpKey').value.trim();if(key)body.api_key=key;
  btn.disabled=true;fb.textContent='正在保存…';
  try{
    const c=await api('/api/admin/settings/responder',{method:'PATCH',body});
    q('#rpKey').value='';
    if(c.api_key_set)q('#rpKey').placeholder=`已保存 ${c.api_key_hint||''}，留空不修改`;
    fb.textContent=c.ready?'已保存并开启。可以点「测试」看看它会怎么回。':'已保存，但未开启或配置不全：使用现有规则。';
  }catch(e){if(e.message!=='unauthorized')fb.textContent='保存失败：'+e.message;}
  finally{btn.disabled=false;}
}
/* 模型下拉：拉到的列表弹在输入框下方，边输入边筛选，上下键 / 回车 / Esc。
   列表挂在 body 下：弹窗盒子带 transform，fixed 定位放在里面会按盒子算坐标 */
let RP_MODELS=[],rpActive=-1;
function modelListEl(){
  let list=document.getElementById('rpModelList');
  if(!list){
    list=document.createElement('div');list.id='rpModelList';list.className='combo-list';
    list.setAttribute('role','listbox');list.setAttribute('aria-label','模型列表');list.hidden=true;
    document.body.append(list);
  }
  return list;
}
async function fetchResponderModels(){
  const fb=q('#rpFeedback'),btn=q('#rpFetch');if(!btn||btn.getAttribute('aria-busy')==='true')return;
  const body={base_url:q('#rpBase').value.trim()};
  const key=q('#rpKey').value.trim();if(key)body.api_key=key;
  btn.setAttribute('aria-busy','true');btn.disabled=true;fb.textContent='正在获取模型列表…';
  try{
    const r=await api('/api/admin/settings/responder/models',{method:'POST',body});
    RP_MODELS=r.models||[];
    fb.textContent=`获取到 ${RP_MODELS.length} 个模型，在下拉框里选一个，或直接输入筛选。`;
    const inp=q('#rpModel');inp.focus();openModelList(true);
  }catch(e){if(e.message!=='unauthorized')fb.textContent='获取模型失败：'+e.message;}
  finally{btn.removeAttribute('aria-busy');btn.disabled=false;}
}
function modelMatches(all){
  const inp=q('#rpModel'),v=(inp&&inp.value||'').trim().toLowerCase();
  if(all||!v)return RP_MODELS;
  return RP_MODELS.filter(m=>m.toLowerCase().includes(v));
}
function openModelList(all){
  const inp=q('#rpModel');if(!inp||!RP_MODELS.length)return;
  const list=modelListEl();
  const items=modelMatches(all),cur=inp.value.trim();
  if(!items.length){closeModelList();return;}
  list.innerHTML=items.slice(0,300).map((m,i)=>`<div class="combo-opt" role="option" id="rpOpt${i}" data-v="${esc(m)}" aria-selected="${m===cur}" translate="no">${esc(m)}</div>`).join('');
  rpActive=Math.max(0,items.indexOf(cur));
  const r=inp.getBoundingClientRect(),below=innerHeight-r.bottom-12,h=Math.min(260,items.length*34+10);
  list.style.left=r.left+'px';list.style.width=r.width+'px';
  if(below<h&&r.top>below){list.style.top='';list.style.bottom=(innerHeight-r.top+4)+'px';list.style.maxHeight=Math.min(260,r.top-12)+'px';}
  else{list.style.bottom='';list.style.top=(r.bottom+4)+'px';list.style.maxHeight=Math.min(260,below)+'px';}
  list.hidden=false;inp.setAttribute('aria-expanded','true');markModelActive();
}
function closeModelList(){
  const list=document.getElementById('rpModelList');if(!list||list.hidden)return;
  list.hidden=true;
  const inp=q('#rpModel');if(inp){inp.setAttribute('aria-expanded','false');inp.removeAttribute('aria-activedescendant');}
}
function markModelActive(){
  const list=q('#rpModelList'),inp=q('#rpModel');if(!list)return;
  const opts=list.querySelectorAll('.combo-opt');
  opts.forEach((o,i)=>o.classList.toggle('active',i===rpActive));
  const a=opts[rpActive];if(!a)return;
  // 只滚列表自己（scrollIntoView 会连带滚动页面，触发关闭）
  if(a.offsetTop<list.scrollTop)list.scrollTop=a.offsetTop-4;
  else if(a.offsetTop+a.offsetHeight>list.scrollTop+list.clientHeight)list.scrollTop=a.offsetTop+a.offsetHeight-list.clientHeight+4;
  if(inp)inp.setAttribute('aria-activedescendant',a.id);
}
function pickModel(v){const inp=q('#rpModel');inp.value=v;closeModelList();inp.focus();}
if(typeof document.addEventListener==='function'){
document.addEventListener('input',e=>{if(e.target&&e.target.id==='rpModel')openModelList(false);});
document.addEventListener('focusin',e=>{if(e.target&&e.target.id==='rpModel'&&RP_MODELS.length)openModelList(true);});
document.addEventListener('keydown',e=>{
  if(!e.target||e.target.id!=='rpModel')return;
  const list=q('#rpModelList'),open=list&&!list.hidden,n=open?list.querySelectorAll('.combo-opt').length:0;
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){
    if(!open){openModelList(true);e.preventDefault();return;}
    rpActive=(rpActive+(e.key==='ArrowDown'?1:-1)+n)%n;markModelActive();e.preventDefault();
  }else if(e.key==='Enter'&&open){
    const a=list.querySelectorAll('.combo-opt')[rpActive];if(a){pickModel(a.dataset.v);e.preventDefault();}
  }else if(e.key==='Escape'&&open){closeModelList();e.preventDefault();e.stopPropagation();}
},true);
document.addEventListener('mousedown',e=>{
  const opt=e.target.closest&&e.target.closest('#rpModelList .combo-opt');
  if(opt){e.preventDefault();pickModel(opt.dataset.v);return;}
  if(!(e.target.closest&&e.target.closest('#rpModelList,#rpModel')))closeModelList();
});
window.addEventListener('resize',closeModelList);
document.addEventListener('scroll',e=>{if(!(e.target.closest&&e.target.closest('#rpModelList')))closeModelList();},true);
}

async function testResponder(){
  const fb=q('#rpFeedback'),btn=q('#rpTest');if(!btn||btn.disabled)return;
  // 用框里当前填的内容测试，不需要先保存；Key 留空则沿用已保存的
  const body={enabled:q('#rpEnabled').checked,base_url:q('#rpBase').value.trim(),model:q('#rpModel').value.trim()};
  const key=q('#rpKey').value.trim();if(key)body.api_key=key;
  btn.disabled=true;fb.textContent='正在测试（用当前填写的内容，最多约 25 秒）…';
  try{
    const r=await api('/api/admin/settings/responder/test',{method:'POST',body});
    fb.innerHTML='示例追问：<span translate="no">'+esc(r.sample)+'</span><br>模型回复：<strong translate="no">'+esc(r.reply)+'</strong>'
      +(r.saved?'':'<br>测试通过，点「保存」后生效。');
  }catch(e){if(e.message!=='unauthorized')fb.textContent='测试失败：'+e.message;}
  finally{btn.disabled=false;}
}

