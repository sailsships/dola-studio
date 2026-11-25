/* ---- 压力测试 ---- */
let stressPollTimer=null;
function stopStressPoll(){if(stressPollTimer){clearInterval(stressPollTimer);stressPollTimer=null;}}
function openStress(){
  showDlg(`<h2>压力测试</h2>
    <p class="tiny" style="line-height:1.7;margin-bottom:10px">模拟“多个账号/视频任务同时拉起浏览器”：服务器会从 1 个开始，
    逐级同时拉起 1、2、3…N 个 headed Chromium（临时 profile，使用与账号登录相同的浏览器参数；
    不访问 Google/dola，不消耗任何号池额度），并统计操作系统里真实拉起的浏览器主进程数、
    Chromium 总进程数、内存峰值和系统剩余内存，得出当前可稳定并发的浏览器数。</p>
    <label>最大测试级数（默认 8，最大 12）</label>
    <input id="stressMax" type="number" min="1" max="12" value="8">
    <div class="hint" style="margin-top:4px">测试期间请不要同时进行真实账号登录/视频任务。</div>
    <div id="stressOut" class="tiny log-pane" style="margin-top:10px"></div>
    <div class="row"><button class="btn" onclick="stopStressPoll();hide('dlg')">关闭</button>
      <button class="btn btn-p" id="stressStartBtn" onclick="startStress()">开始压测</button></div>`);
  loadStressStatus(true);
}
async function loadStressStatus(showLogs){
  try{
    const st=await api('/api/admin/stress');
    const out=q('#stressOut');if(!out)return;
    const lines=[];
    if(st.busy_tasks>0)lines.push('当前有 '+st.busy_tasks+' 个视频任务在排队/运行，压测会被拒绝，建议等空闲后再试。');
    if(st.running_jobs>0)lines.push('当前有账号登录任务进行中，压测会被拒绝。');
    if(st.status==='running'){
      lines.push('压测运行中，正在逐级拉起浏览器…请稍候');
      if(st.logs&&st.logs.length)lines.push('---\n'+st.logs.join('\n'));
      const btn=q('#stressStartBtn');if(btn)btn.disabled=true;
    }else{
      if(stressPollTimer){clearInterval(stressPollTimer);stressPollTimer=null;}
      const btn=q('#stressStartBtn');if(btn)btn.disabled=false;
      if(st.status==='completed'){
        lines.push('推荐并发：'+st.recommended+' 个浏览器');
        if(st.logs&&st.logs.length)lines.push('---\n'+st.logs.join('\n'));
      }else if(st.status==='failed'){
        if(st.logs&&st.logs.length)lines.push('压测失败：\n'+st.logs.join('\n'));
      }else if(showLogs&&st.logs&&st.logs.length){
        lines.push(st.logs.join('\n'));
      }
    }
    out.textContent=lines.join('\n');
  }catch(e){}
}
async function startStress(){
  const btn=q('#stressStartBtn');btn.disabled=true;
  const n=Math.min(12,Math.max(1,parseInt(q('#stressMax').value||'8',10)));
  try{
    await api('/api/admin/stress',{method:'POST',body:{max_concurrency:n,hold_seconds:5}});
    q('#stressOut').textContent='压测已开始：1→'+n+' 个浏览器逐级同时拉起…';
    stressPollTimer=setInterval(()=>loadStressStatus(false),2500);
  }catch(e){alert(dialogText`${e.message}`);btn.disabled=false;}
}

