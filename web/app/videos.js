/* ---- 视频管理 ---- */
let selVideos=new Set();
let allVideoIds=[];
function fmtSize(b){
  if(!b||b<=0)return '-';
  if(b>=1<<30)return (b/(1<<30)).toFixed(2)+' GB';
  if(b>=1<<20)return (b/(1<<20)).toFixed(1)+' MB';
  return Math.round(b/1024)+' KB';
}
function fmtDur(s){
  if(!s||s<=0)return '-';
  s=Math.round(s);   // 先取整再拆分，避免出现「4 分 60 秒」
  if(s<60)return s+' 秒';
  const m=Math.floor(s/60);const sec=s%60;
  return m+' 分 '+sec+' 秒';
}
async function loadVideos(){
  await loadUpscaleSettings().catch(()=>{});
  const r=await api('/api/admin/videos'+(SEARCH.videos?'?limit=500'+searchQS('videos'):''));
  const total=r.total||0;
  const avail=r.available||0;
  q('#videoStat').textContent=`视频总数：${total}（正常 ${avail} / 已删除 ${total-avail}）`;
  allVideoIds=(r.videos||[]).map(v=>v.id);
  const rows=(r.videos||[]).map(v=>{
    const size=fmtSize(v.video_size||v.file_size);
    const dur=fmtDur(v.video_duration||v.duration);
    const dim=((v.video_width&&v.video_height)?v.video_width+'×'+v.video_height
      :(v.ratio&&v.ratio!=='default'?v.ratio:'-'))+upscaleDimLine(v);
    const state=v.video_url
      ?(v.file_exists===false?'<span class="badge b-orange">文件缺失</span>':'<span class="badge b-green">正常</span>')
      :'<span class="badge b-gray">文件已删</span>';
    const ops='<div class="video-wrap">'
      +(v.video_url?'<button class="btn" style="margin-right:6px" onclick="playVideo(&quot;'+esc(v.video_url)+'&quot;)">预览</button><button class="btn" style="margin-right:6px" onclick="copyLink(&quot;'+esc(v.video_url)+'&quot;)">复制链接</button>':'')
      +'<button class="btn btn-danger" onclick="delVideo(\''+v.id+'\')">删除</button></div>'+upscaleCell({...v,status:'completed'});
    return [
      `<input type="checkbox" ${selVideos.has(v.id)?'checked':''} onchange="toggleVideoSel('${v.id}',this.checked)">`,
      fmt(v.created_at),
      v.account?noTr(v.account):'-',
      state,
      pubModel(v.model),
      dur,
      dim,
      size,
      '<span class="prompt" translate="no" title="'+esc(v.prompt||'')+'">'+esc(v.prompt||'')+'</span>',
      ops
    ];
  });
  setHTML('#videosTable',table(
    ['<input type="checkbox" id="selAllV" onchange="toggleAllVideos(this.checked)" title="全选/取消全选">',
     '生成时间','账号','状态','模型','时长','尺寸','大小','提示词','操作'],rows,(r.videos||[]).map(v=>v.id)));
  const b=q('#btnDelVideos');b.disabled=selVideos.size===0;
  b.textContent=selVideos.size?`删除选中（${selVideos.size}）`:'删除选中';
  const selAll=q('#selAllV');
  if(selAll){
    selAll.checked=selVideos.size>0&&selVideos.size===allVideoIds.length;
    selAll.indeterminate=selVideos.size>0&&selVideos.size<allVideoIds.length;
  }
}
function toggleVideoSel(id,on){
  if(on)selVideos.add(id);else selVideos.delete(id);
  const b=q('#btnDelVideos');b.disabled=selVideos.size===0;
  b.textContent=selVideos.size?`删除选中（${selVideos.size}）`:'删除选中';
  const selAll=q('#selAllV');
  if(selAll){
    selAll.checked=selVideos.size>0&&selVideos.size===allVideoIds.length;
    selAll.indeterminate=selVideos.size>0&&selVideos.size<allVideoIds.length;
  }
}
function toggleAllVideos(on){
  selVideos.clear();
  if(on)allVideoIds.forEach(id=>selVideos.add(id));
  loadVideos();
}
async function delVideo(id){
  if(!await confirm('确定删除该视频？视频文件与任务记录将一并删除，不可恢复。'))return;
  try{await api('/api/admin/videos/'+id,{method:'DELETE'});}catch(e){alert(dialogText`${e.message}`);}
  selVideos.delete(id);
  refresh();
}
async function delSelectedVideos(){
  const list=[...selVideos];
  if(!list.length)return;
  if(!await confirm(`确定删除选中的 ${list.length} 个视频？文件与任务记录将一并删除，不可恢复。`))return;
  let ok=0;
  for(const id of list){
    try{await api('/api/admin/videos/'+id,{method:'DELETE'});ok++;}
    catch(e){alert(id+' 删除失败：'+e.message);}
  }
  selVideos.clear();
  refresh();
  if(ok)alert(`已删除 ${ok} 个视频（文件与记录）`);
}
async function copyLink(url){
  await copy(url);
  toast('链接已复制');
}

