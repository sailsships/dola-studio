/* ---- 通用多选（代理 / 任务 / 用户）：勾选单个或多个、全选，然后「删除选中」 ----
   选中状态存在 SEL 里，自动刷新重画表格时保持勾选；已经不在列表里（或变成不可删）的自动去掉。 */
const SEL={proxies:new Set(),tasks:new Set(),users:new Set(),keys:new Set()};
const SEL_LABEL={proxies:'个代理',tasks:'条任务',keys:'个 API 密钥'};
function selBox(kind,id,disabled,why){
  return `<input type="checkbox" data-sel="${kind}" value="${esc(id)}" ${SEL[kind].has(id)?'checked':''}`
    +` ${disabled?'disabled':''} title="${esc(why||'')}" onchange="selToggle('${kind}',this.value,this.checked)">`;
}
function selAllBox(kind){
  return `<input type="checkbox" id="selAll_${kind}" title="全选当前列表" onchange="selAllSet('${kind}',this.checked)">`;
}
function selBoxes(kind){return [...document.querySelectorAll(`input[data-sel="${kind}"]:not(:disabled)`)];}
function selToggle(kind,id,on){on?SEL[kind].add(id):SEL[kind].delete(id);selUpdate(kind);}
function selAllSet(kind,on){
  selBoxes(kind).forEach(cb=>{cb.checked=on;on?SEL[kind].add(cb.value):SEL[kind].delete(cb.value);});
  selUpdate(kind);
}
function selAllToggle(kind){
  const boxes=selBoxes(kind);
  selAllSet(kind,!(boxes.length&&boxes.every(cb=>cb.checked)));
}
function selPrune(kind,validIds){
  const ok=new Set(validIds);
  for(const id of [...SEL[kind]])if(!ok.has(id))SEL[kind].delete(id);
}
function selUpdate(kind){
  const n=SEL[kind].size,b=q('#delSel_'+kind);
  if(b){b.disabled=!n;b.textContent='删除选中'+(n?'（'+n+'）':'');}
  const all=q('#selAll_'+kind),boxes=selBoxes(kind);
  if(all){all.checked=boxes.length>0&&boxes.every(cb=>cb.checked);all.disabled=!boxes.length;}
}
async function delSelected(kind){
  const ids=[...SEL[kind]];
  if(!ids.length)return;
  let tip='确定删除选中的 '+ids.length+' '+SEL_LABEL[kind]+'？';
  if(kind==='proxies'){
    const bound=proxyCache.filter(p=>SEL.proxies.has(p.id)).reduce((s,p)=>s+(p.account_count||0),0);
    if(bound)tip+='\n其中共绑定了 '+bound+' 个账号，删除后这些账号改回默认代理。';
  }
  if(kind==='tasks')tip+='\n已完成任务的视频文件会一起删除，无法恢复。';
  if(kind==='keys')tip+='\n用这些密钥的调用方会立即失效。';
  if(!await confirm(tip))return;
  const url={proxies:'/api/admin/proxies/delete-batch',tasks:'/api/admin/tasks/delete-batch',
             keys:'/api/admin/keys/delete-batch'}[kind];
  const body={ids};
  let r;
  try{r=await api(url,{method:'POST',body});}catch(e){return alert(dialogText`${e.message}`);}
  (r.deleted||[]).forEach(id=>SEL[kind].delete(id));
  if(r.skipped&&r.skipped.length)alert('已删除 '+(r.deleted||[]).length+' '+SEL_LABEL[kind]+'；跳过：\n'+r.skipped.join('\n'));
  ({proxies:loadProxies,tasks:loadTasks,keys:loadKeys})[kind]();
}

