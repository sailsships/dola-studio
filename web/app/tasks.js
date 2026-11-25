/* ---- 任务列表 ---- */
function accChain(t){
  let arr=[];
  try{arr=JSON.parse(t.attempted_accounts||'[]');}catch(e){}
  if(!arr.length&&t.account)arr=[t.account];
  if(!arr.length)return '-';
  const txt=arr.join(' → ');
  return arr.length>1
    ?'<span class="tiny" title="换号顺序：'+esc(txt)+'">'+arr.map(noTr).join('<span style="color:var(--gray)"> → </span>')+'</span>'
    :noTr(arr[0]);
}
let TASK_MAP={};
const TASK_PAGE_SIZE=50;
let taskPage=1,taskTotalPages=1,taskLoadEpoch=0;
async function taskGo(page){
  taskPage=Math.max(1,Math.min(taskTotalPages,Math.floor(page)||1));
  SEL.tasks.clear();selUpdate('tasks');
  try{await loadTasks();}catch(e){if(e.message!=='unauthorized')alert(dialogText`${e.message}`);}
}
function renderTaskPager(total){
  const start=total?(taskPage-1)*TASK_PAGE_SIZE+1:0;
  const end=Math.min(taskPage*TASK_PAGE_SIZE,total);
  const first=taskPage<=1?' disabled':'',last=taskPage>=taskTotalPages?' disabled':'';
  setHTML('#tasksPager','<div class="pager">'
    +'<span>共 '+total+' 条 · 每页 50 条 · 本页 '+(total?start+'–'+end:'0')+' · 第 '+taskPage+'/'+taskTotalPages+' 页</span>'
    +'<button class="btn"'+first+' onclick="taskGo(1)">首页</button>'
    +'<button class="btn"'+first+' onclick="taskGo('+(taskPage-1)+')">上一页</button>'
    +'<button class="btn"'+last+' onclick="taskGo('+(taskPage+1)+')">下一页</button>'
    +'<button class="btn"'+last+' onclick="taskGo('+taskTotalPages+')">末页</button></div>');
  setHTML('#tasksPagerTop',q('#tasksPager').innerHTML);
}
/** 任务耗时：主显示生成耗时（开始生成→结束），有明显排队时下方补一行含排队的总耗时。 */
// 浏览器时钟与服务器的偏差（秒）：loadTasks 用接口返回的 now 校正，实时计时才准
let SERVER_SKEW=0;
function serverNow(){return Date.now()/1000+SERVER_SKEW;}
/** 实时计时文案：kind=queue 排队 X / run 已 X；eta 元素显示预计与剩余（倒计时）。 */
function liveText(el){
  const t0=Number(el.dataset.t0||0);if(!t0)return '';
  const el2=Math.max(0,serverNow()-t0);
  if(el.dataset.kind==='verify')return '验证中 · '+Math.floor(el2)+' 秒';
  if(el.dataset.kind==='queue')return '排队 '+fmtDur(el2);
  if(el.dataset.kind==='run')return '已 '+fmtDur(el2);
  if(el.dataset.kind==='eta'){
    const typ=Number(el.dataset.typ||0);if(!typ)return '';
    const left=typ-el2,lab=el.dataset.lab||'预计';
    return left>0?lab+' '+fmtDur(typ)+' · 还剩约 '+fmtDur(left)
                 :lab+' '+fmtDur(typ)+' · 已超出 '+fmtDur(-left);
  }
  return '';
}
function tickLive(){document.querySelectorAll('.live').forEach(el=>{const v=liveText(el);if(v&&el.textContent!==v)el.textContent=v;});}
function liveSpan(kind,t0,extra,style,lab){
  const el={dataset:{kind,t0:String(t0),typ:String(extra||''),lab:lab||''}};
  return '<span class="live" data-kind="'+kind+'" data-t0="'+t0+'"'+(extra?' data-typ="'+extra+'"':'')
    +(lab?' data-lab="'+esc(lab)+'"':'')
    +(style?' style="'+style+'"':'')+'>'+esc(liveText(el))+'</span>';
}
/** 超时任务自动取回的状态提示（报错/备注列最前面）。 */
// 折叠块的展开状态（面板每 10 秒重画，记住哪些是用户手动展开的）
const OPEN_NOTES=new Set();
function noteToggle(el){if(el.open)OPEN_NOTES.add(el.dataset.k);else OPEN_NOTES.delete(el.dataset.k);}
function foldText(k,label,text,limit){
  text=String(text||'').replace(/\*\*/g,'');   // dola 回执带 Markdown 粗体标记
  if(text.length<=limit)return '<div class="tiny note-line">'+label+noTr(text)+'</div>';
  return '<details class="tiny note-line" data-k="'+esc(k)+'" ontoggle="noteToggle(this)"'+(OPEN_NOTES.has(k)?' open':'')+'>'
    +'<summary>'+label+noTr(text.slice(0,limit))+'<span class="ell">…</span></summary>'+noTr(text.slice(limit))+'</details>';
}
/** 上游回执原话：当前号的在前（长了折叠），前面换过的号收进「前面 N 个号的回复」。
    失败时报错里已经带了同一句原话就不重复。 */
function upstreamNote(t){
  let notes=[];
  try{notes=JSON.parse(t.upstream_notes||'[]')||[];}catch(e){notes=[];}
  if(!notes.length&&t.upstream_note)notes=[{account:t.account||'',note:t.upstream_note}];
  if(!notes.length)return '';
  const cur=notes[notes.length-1],prev=notes.slice(0,-1);
  const rawSite=String(t.site||'').toLowerCase();
  const site=(rawSite==='doubao'||rawSite==='豆包')?'豆包'
    :(rawSite==='dola'?'dola':(String(t.model||'').toLowerCase().startsWith('doubao-')?'豆包':'dola'));
  let html='';
  const dup=t.status==='failed'&&t.error&&t.error.indexOf(String(cur.note).slice(0,12))>=0;
  if(!dup)html+=foldText(t.id+':cur',(cur.account?noTr(cur.account)+' · ':'')+site+'：',cur.note,60);
  if(prev.length){
    const k=t.id+':prev';
    html+='<details class="tiny note-line" data-k="'+esc(k)+'" ontoggle="noteToggle(this)"'+(OPEN_NOTES.has(k)?' open':'')+'>'
      +'<summary>前面 '+prev.length+' 个号的回复</summary>'
      +prev.map(n=>'<div>'+noTr(n.account||'?')+' · '+site+'：'+noTr(String(n.note||'').replace(/\*\*/g,''))+'</div>').join('')+'</details>';
  }
  return html;
}
function attemptHistory(t){
  let rows=[];try{rows=JSON.parse(t.attempt_history||'[]');}catch(e){}
  if(!Array.isArray(rows)||!rows.length)return '';
  const k=t.id+':attempts';
  return '<details class="tiny note-line task-attempt-history" data-k="'+esc(k)+'" ontoggle="noteToggle(this)"'+(OPEN_NOTES.has(k)?' open':'')+'>'
    +'<summary>尝试记录（'+rows.length+'）</summary>'
    +rows.map(r=>'<div style="margin:8px 0">'+noTr(r.account||'')+' · '+esc(r.stage||'准备生成')
      +' · '+fmtDur(Math.max(0,(r.finished_at||Date.now()/1000)-(r.started_at||Date.now()/1000)))
      +(r.error?'<div style="color:var(--red)">'+noTr(r.error)+'</div>':'')
      +(r.stages||[]).map(s=>'<div>'+fmt(s.at)+' · '+esc(s.stage)+'</div>').join('')+'</div>').join('')+'</details>';
}
/** 排队 / 换号原因（含 dola 原话）：只在任务还没结束时显示。 */
function queueNote(t){
  if(t.status!=='queued'&&t.status!=='processing')return '';
  const n=t.queue_note||(t.status==='queued'?'排队中：等待派号':'');
  if(!n)return '';
  return '<div class="tiny" style="color:var(--warning)">'+esc(n)+'</div>';
}
function recoverNote(t){
  if(t.recover_state==='watching'&&t.status==='completed')
    return (t.recovered_at?'<div class="tiny" style="color:#00a870"> 超时后已自动取回（'+fmtHM(t.recovered_at)+'）</div>':'')
      +'<div class="tiny">视频已交付，正在核对超时分段的额度</div>';
  if(t.recover_state==='watching')
    return '<div class="tiny" style="color:var(--info)">后台继续等 dola 出片（最晚到 '+fmtHM(t.recover_until)+'），出片后自动转为完成</div>';
  if(t.recover_state==='recovered')
    return '<div class="tiny" style="color:#00a870"> 超时后已自动取回（'+fmtHM(t.recovered_at)+'）</div>';
  if(t.recover_state==='gave_up')
    return '<div class="tiny">后台取回已结束，未取到视频</div>';
  return '';
}
function costCell(t){
  const c=t.created_at||0,s=t.started_at||0,f=t.finished_at||0;
  const pg=t.progress||{};
  // 上游报了「预计等待 N 分钟」就按它倒计时，否则用近 3 天同时长的平均耗时
  const upstreamWait=Number(t.upstream_wait||0);
  const typ=upstreamWait||Number(pg.typical_seconds||0);
  const rawSite=String(t.site||'').toLowerCase();
  const isDoubao=rawSite==='doubao'||rawSite==='豆包'
    ||(rawSite!=='dola'&&String(t.model||'').toLowerCase().startsWith('doubao-'));
  const lab=upstreamWait?(isDoubao?'豆包 预计':'dola 预计'):'预计';
  if(t.status==='queued'){
    if(!c)return '—';
    // 排队：实时排队时长 + 预计（含前面还有几个）
    const hint=pg.eta_text?('预计'+pg.eta_text+(pg.ahead?'（前面 '+pg.ahead+' 个）':'')):'';
    return liveSpan('queue',c,0,'')+(hint?'<div class="tiny">'+esc(hint)+'</div>':'');
  }
  if(t.status==='processing'){
    if(!s)return '—';
    const s2=t.attempt_started_at||s;   // 换号后从当前号开始计
    // 生成中：实时已用时 + 预计总时长与剩余倒计时（超出预计会提示已超出）
    return liveSpan('run',s,0,'color:var(--info)')
      +(typ?'<div class="tiny">'+liveSpan('eta',s2,typ,'',lab)+'</div>':'')
      +(s2>s+1&&t.account?'<div class="tiny">当前 '+noTr(t.account)+' '+liveSpan('run',s2,0,'')+'</div>':'');
  }
  if(!f)return '—';
  const total=c?f-c:0,gen=s?f-s:0,queue=(s&&c)?s-c:0;
  const tip='排队 '+fmtDur(queue)+' · 生成 '+fmtDur(gen)+' · 总计 '+fmtDur(total);
  if(!gen)return '<span title="未开始生成即结束；'+esc(tip)+'">'+(total?fmtDur(total):'—')+'</span>';
  return '<span title="'+esc(tip)+'">'+fmtDur(gen)+'</span>'
    +(queue>=5?'<div class="tiny">含排队 '+fmtDur(total)+'</div>':'');
}
async function loadTasks(){
  await loadUpscaleSettings().catch(()=>{});
  const epoch=++taskLoadEpoch;
  const r=await api('/api/admin/tasks?limit='+TASK_PAGE_SIZE+'&offset='+((taskPage-1)*TASK_PAGE_SIZE)+searchQS('tasks'));
  if(epoch!==taskLoadEpoch)return;
  taskTotalPages=Math.max(1,Math.ceil(r.total/TASK_PAGE_SIZE));
  taskPage=Math.floor(r.offset/TASK_PAGE_SIZE)+1;
  const tt=q('#tasksTitle');
  if(tt)tt.textContent='任务列表';
  if(r.now)SERVER_SKEW=r.now-Date.now()/1000;
  TASK_MAP={};
  r.tasks.forEach(t=>{TASK_MAP[t.id]=t;});
  const sb={'queued':'<span class="badge b-gray">排队中</span>','processing':'<span class="badge b-blue">生成中</span>','completed':'<span class="badge b-green">完成</span>','failed':'<span class="badge b-red">失败</span>','风控':'<span class="badge b-orange">风控</span>'};
  const running=t=>t.status==='queued'||t.status==='processing';
  selPrune('tasks',r.tasks.filter(t=>!running(t)).map(t=>t.id));
  const rows=r.tasks.map(t=>[
    selBox('tasks',t.id,running(t),running(t)?'还在排队/生成中，不能删除':''),
    '<span class="tiny" title="'+esc(t.id)+'">'+t.id.replace('video_','').slice(0,10)+'</span>',
    accChain(t),
    sb[t.status]||'<span class="badge b-gray">'+esc(t.status)+'</span>',
    (t.duration||10)+'秒'+(Number(t.video_count)>1?' × '+t.video_count:''),
    fmt(t.created_at),
    costCell(t),
    '<span class="prompt" translate="no" title="'+esc(t.prompt||'')+'">'+esc(t.prompt||'')+'</span>'
      +'<button class="btn" style="margin-left:6px" onclick="openPrompt(\''+esc(t.id)+'\')">查看</button>',
    refCell(t)+(t.reference_source==='ai_generated'?'<div class="tiny task-source" title="调用方已声明参考图人物完全由 AI 生成；提交时附加来源说明">AI 素材</div>':''),
    taskVideoCell(t),
    // 报错原文完整展示（含换行）：不再 slice(0,30)，上游「内容审核不合规 / 肖像保护 / 侵权」
    // 这类话术要能一眼看全。
    queueNote(t)+recoverNote(t)+upstreamNote(t)+attemptHistory(t)+(t.error
      ?'<span class="err" title="'+esc(t.error)+'">'+esc(t.error)+'</span>'
      :((t.recover_state||t.upstream_note||queueNote(t))?'':'<span class="tiny">—</span>'))
  ]);
  setHTML('#tasksTable',table(
    [selAllBox('tasks'),'ID','账号','状态','时长','创建时间','耗时','提示词','参考图','视频','报错/备注'],rows,r.tasks.map(t=>t.id)));
  renderTaskPager(r.total);
  selUpdate('tasks');
}

function refThumbs(t){
  try{const a=JSON.parse(t.reference_thumbs||'[]');return Array.isArray(a)?a:[];}catch(e){return [];}
}
/** 参考图缩略图：原图在任务结束时已清理，这里显示的是服务端留存的缩略图。 */
function refCell(t){
  const list=refThumbs(t);
  if(!list.length)return '<span class="tiny">无</span>';
  const url='/thumbs/'+encodeURIComponent(list[0]);
  return '<img class="thumb" src="'+url+'" title="点击放大" onclick="showThumb(\''+esc(url)+'\')">'
    +(list.length>1?'<span class="tiny">+'+(list.length-1)+'</span>':'');
}
function showThumb(url){q('#thumbImg').src=url;show('thumbModal');}

function openPrompt(id){
  const t=TASK_MAP[id]||{};
  q('#promptMeta').innerHTML=esc(id)+' · '+esc(pubModel(t.model))+' · '+(t.duration||10)+'秒 · '
    +(t.api_key_name?('客户 '+noTr(t.api_key_name)):'');
  q('#promptBody').textContent=(t.prompt&&String(t.prompt).length)?t.prompt:'（空提示词）';
  q('#promptCopyBtn').textContent='复制';
  show('promptModal');
}
function copyPrompt(){
  const txt=q('#promptBody').textContent||'';
  const done=()=>{const b=q('#promptCopyBtn');b.textContent='已复制';setTimeout(()=>b.textContent='复制',1200);};
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(txt).then(done,done);}
  else{const ta=document.createElement('textarea');ta.value=txt;document.body.appendChild(ta);ta.select();
       try{document.execCommand('copy');}catch(e){}document.body.removeChild(ta);done();}
}

function taskVideoCell(t){
  let videos=[];try{videos=JSON.parse(t.work_video_results||'[]');}catch(e){}
  if(!videos.length&&t.video_url)videos=[{video_url:t.video_url}];
  return videos.length?videos.map((v,i)=>'<div class="video-wrap"><a href="'+esc(v.video_url)+'" target="_blank">打开'+(videos.length>1?' '+(i+1):'')+'</a><button class="btn" onclick="playVideo(&quot;'+esc(v.video_url)+'&quot;)">预览</button></div>').join('')+upscaleCell(t):'—';
}
function videoRelayUrl(url){
  try{
    const parsed=new URL(url,location.origin);
    if(parsed.origin!==location.origin||!/^\/v\/[^/]+\.mp4$/.test(parsed.pathname))return '';
    parsed.searchParams.set('relay','1');
    return parsed.href;
  }catch(e){return '';}
}
function playVideo(url){
  const video=q('#videoEl');
  video.dataset.relayFallback='';
  video.onerror=()=>{
    if(video.dataset.relayFallback==='1')return;
    const fallback=videoRelayUrl(url);
    if(!fallback||video.currentSrc===fallback)return;
    video.dataset.relayFallback='1';
    video.src=fallback;
    video.load();
  };
  video.src=url;
  show('videoModal');
}
function closeVideo(){const video=q('#videoEl');video.pause();video.onerror=null;video.src='';hide('videoModal');}

