/* ---- 2.0 的 15 秒：走 Dola 工作模式，开关即时生效 ---- */
async function openWork15Settings(){
  showDlg(`<h2>2.0 的 15 秒</h2><p class="hint">正在读取设置…</p>`);
  const epoch=dialogEpoch;
  try{
    const c=await api('/api/admin/settings/work-15s');
    if(epoch!==dialogEpoch)return;
    const off=c.available?'':'disabled';
    showDlg(`<h2>2.0 的 15 秒</h2>
      <p class="hint">开启后，seedance-2.0-fast 请求 15 秒时走 Dola 工作模式，支持参考图；请求 30 秒时用两个号各出 15 秒再拼接。一单约 6 分钟；助手可能改写提示词；每个号 7 天只能出 1 条 15 秒，和每日额度分开。</p>
      ${c.reason?`<p class="hint" role="alert" style="color:var(--red)">${esc(c.reason)}</p>`:''}
      <label class="sw-row" style="margin-top:14px"><span class="sw"><input type="checkbox" id="w15Enabled" ${c.enabled?'checked':''} ${off}><i></i></span>开启</label>
      <p class="hint">窗口并发：<strong translate="no">${c.concurrency}</strong> 个 <button class="btn" onclick="openWindowConcurrencySettings()">设置窗口并发</button></p>
      <div id="w15Feedback" class="tiny" role="status" style="margin:10px 0;min-height:18px"></div>
      <div class="row"><button class="btn" onclick="hide('dlg')">关闭</button>
        <button class="btn btn-p" id="w15Save" onclick="saveWork15Settings()" ${off}>保存</button></div>`);
  }catch(e){
    if(epoch===dialogEpoch&&e.message!=='unauthorized')showDlg(`<h2>2.0 的 15 秒</h2><p role="alert">${esc(e.message)}</p>
      <div class="row"><button class="btn" onclick="hide('dlg')">关闭</button></div>`);
  }
}
async function saveWork15Settings(){
  const fb=q('#w15Feedback'),btn=q('#w15Save');if(!btn||btn.disabled)return;
  btn.disabled=true;fb.textContent='正在保存…';
  try{
    const c=await api('/api/admin/settings/work-15s',{method:'PATCH',body:{enabled:q('#w15Enabled').checked}});
    TEST_GEN_DURATIONS['seedance-2.0-fast']=c.v20_durations.filter(d=>d!==30);
    fb.textContent=c.enabled?'已开启，立即生效。测试生成现在可以选 15 秒。':'已关闭，立即生效。';
  }catch(e){if(e.message!=='unauthorized')fb.textContent='保存失败：'+e.message;}
  finally{btn.disabled=false;}
}

