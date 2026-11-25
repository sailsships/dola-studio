/* ---- 视频超分：fal（字节超分）或自建开源模型；在任务列表 / 视频管理里对已完成的视频发起 ---- */
let UPSCALE_SETTINGS=null,upscaleRevision=0;
function applyUpscaleSettings(c){
  UPSCALE_SETTINGS={at:Date.now(),data:c};
  document.documentElement.dataset.upscaleEnabled=String(c.enabled===true);
  document.querySelectorAll('[data-upscale-action]').forEach(button=>button.hidden=c.enabled!==true);
  return c;
}
async function loadUpscaleSettings(force=false){
  if(!force&&UPSCALE_SETTINGS&&Date.now()-UPSCALE_SETTINGS.at<10000)return UPSCALE_SETTINGS.data;
  const revision=upscaleRevision,c=await api('/api/admin/settings/upscale');
  if(revision!==upscaleRevision)return UPSCALE_SETTINGS?.data||c;
  return applyUpscaleSettings(c);
}
function upscaleEnabled(){return UPSCALE_SETTINGS?.data.enabled===true;}
function upscaleEnabledView(){
  const enabled=q('#upEnabled').checked;
  q('#upOptions').disabled=!enabled;
  q('#upEnabledHint').textContent=enabled?'开启后显示超分按钮，并允许按配置手动或自动超分。保存后生效。':'已关闭：隐藏任务和视频页的超分按钮，不发起新的超分任务。保存后生效。';
}
async function openUpscaleSettings(){
  const cached=null;
  if(!cached)showDlg(`<h2>视频超分</h2><p class="hint">正在读取超分设置…</p>`);
  const epoch=dialogEpoch;
  try{
    const c=await loadUpscaleSettings(true);
    if(epoch!==dialogEpoch)return;
    applyUpscaleSettings(c);
    const opt=(v,label,cur)=>`<option value="${v}" ${v===cur?'selected':''}>${label}</option>`;
    const price=c.fal_price_per_second;
    showDlg(`<h2>视频超分</h2>
      <div class="upscale-toggle-row"><label for="upEnabled">启用视频超分</label><label class="sw"><input id="upEnabled" type="checkbox" role="switch" aria-label="启用视频超分" ${c.enabled===true?'checked':''} onchange="upscaleEnabledView()"><i></i></label></div>
      <p id="upEnabledHint" class="hint" role="status"></p>
      <fieldset id="upOptions" class="upscale-options" ${c.enabled===true?'':'disabled'}>
      <p class="hint">把已完成的 720p 视频放大到更高分辨率。在任务列表或视频管理里点「超分」发起，完成后多出一个高清地址。</p>
      <label for="upProvider">默认服务</label>
      <select id="upProvider" onchange="upscaleProviderView()">${opt('fal','fal（字节超分，按秒计费）',c.provider)}${opt('open','自建开源模型（云端 GPU）',c.provider)}${opt('custom','自定义 API（Apiverse、波波等）',c.provider)}</select>
      <div id="upFal">
        <label for="upFalKey" class="label-row">fal API Key<a href="https://fal.ai/dashboard/keys" target="_blank" rel="noopener">获取 Key ↗</a></label>
        <input id="upFalKey" type="password" autocomplete="off" placeholder="${c.fal_key_set?`已保存 ${c.fal_key_hint}，留空不修改`:'在 fal.ai 控制台创建'}">
        <label for="upPreset">增强预设</label>
        <select id="upPreset">${opt('aigc','AI 生成视频（推荐）',c.fal_preset)}${opt('general','通用',c.fal_preset)}${opt('ugc','用户拍摄短视频',c.fal_preset)}</select>
        <p class="hint">价格：1080p 每秒 $${price}，10 秒约 $${(price*10).toFixed(2)}；失败不计费。2K / 4K 分别是 2 倍 / 4 倍价格。
          <a href="https://fal.ai/models/fal-ai/bytedance-upscaler/upscale/video" target="_blank" rel="noopener">模型与价格 ↗</a></p>
      </div>
      <div id="upOpen">
        <label for="upEndpoint">服务地址</label>
        <input id="upEndpoint" type="url" placeholder="https://your-gpu-service.example" value="${esc(c.open_endpoint||'')}">
        <label for="upToken">访问令牌（可选）</label>
        <input id="upToken" type="password" autocomplete="off" placeholder="${c.open_token_set?`已保存 ${c.open_token_hint}，留空不修改`:'服务要求时填写'}">
        <p class="hint">接口约定和部署示例见 <a href="/docs/upscale.html#自建开源超分服务" target="_blank" rel="noopener">UPSCALE.md ↗</a>（Real-ESRGAN 等开源模型）。</p>
      </div>
      <div id="upCustom">
        <p class="hint">任意「提交 → 轮询」或「同步返回」的 JSON 接口。可先填入现成模板再改：
          <button class="btn" onclick="fillCustomPreset('apiverse')">Apiverse 模板</button>
          <button class="btn" onclick="fillCustomPreset('apibobo')">波波 API 模板</button></p>
        <p class="hint" id="cuLinks">${customLinks(c.custom_presets,c.custom_name)}</p>
        <label for="cuName">名称</label>
        <input id="cuName" value="${esc(c.custom_name||'')}" placeholder="如 Apiverse">
        <label for="cuSubmit">提交地址（POST）</label>
        <input id="cuSubmit" type="url" value="${esc(c.custom_submit_url||'')}" placeholder="https://你的服务地址/upscale">
        <label for="cuHeaders">请求头（JSON，含密钥）</label>
        <textarea id="cuHeaders" rows="2" spellcheck="false" placeholder="${c.custom_headers_set?`已保存（${c.custom_headers_hint}），留空不修改`:'{"Authorization": "Bearer 你的 Key"}'}"></textarea>
        <label for="cuBody">请求体模板（JSON）</label>
        <textarea id="cuBody" rows="3" spellcheck="false" placeholder='{"video_url": "{{video_url}}", "resolution": "{{target}}"}'>${esc(c.custom_body||'')}</textarea>
        <p class="hint">占位符：{{video_url}} 原片地址、{{target}} 目标分辨率、{{duration}} 时长（秒，整数）、{{task_id}} 任务 ID。</p>
        <label for="cuTargetMap">分辨率改名（可选）</label>
        <input id="cuTargetMap" value="${esc(c.custom_target_map||'')}" placeholder="1080p=1080p,2k=2K,4k=4K">
        <label for="cuIdPath">任务 ID 字段路径（留空 = 同步接口）</label>
        <input id="cuIdPath" value="${esc(c.custom_id_path||'')}" placeholder="data.taskId">
        <label for="cuPoll">查询地址（GET，{{id}} 换成任务 ID）</label>
        <input id="cuPoll" type="url" value="${esc(c.custom_poll_url||'')}" placeholder="https://你的服务地址/tasks/{{id}}">
        <label for="cuStatus">状态字段路径</label>
        <input id="cuStatus" value="${esc(c.custom_status_path||'')}" placeholder="data.status">
        <label for="cuSuccess">成功状态值（逗号分隔）</label>
        <input id="cuSuccess" value="${esc(c.custom_success||'')}">
        <label for="cuFailed">失败状态值（逗号分隔）</label>
        <input id="cuFailed" value="${esc(c.custom_failed||'')}">
        <label for="cuResult">结果视频地址字段路径</label>
        <input id="cuResult" value="${esc(c.custom_result_path||'')}" placeholder="data.result.0">
        <label for="cuError">失败原因字段路径（可选）</label>
        <input id="cuError" value="${esc(c.custom_error_path||'')}" placeholder="data.errorMsg">
        <label for="cuCodePath">业务码字段路径（可选）</label>
        <input id="cuCodePath" value="${esc(c.custom_code_path||'')}" placeholder="code">
        <label for="cuCodeOk">业务码成功值</label>
        <input id="cuCodeOk" value="${esc(c.custom_code_ok||'0')}">
        <p class="hint">字段路径用点号分隔，数组用下标，如 data.result.0。费用以服务商账单为准。</p>
      </div>
      <label for="upAuto">按请求分辨率自动超分</label>
      <select id="upAuto">${opt('off','关闭（全部交原片 720p）',c.auto)}${opt('param','按请求的 resolution 参数',c.auto)}${opt('param_or_size','按 resolution 参数，没有时按 size 尺寸',c.auto)}</select>
      <p class="hint">客户请求 720p（或不写）交原片；请求 1080p / 2k / 4k 时出片后自动用上面的服务超分到请求的档位，完成前客户查询显示生成中，超分失败交原片。「按 size」会把 1920x1080 这类尺寸也当成 1080p 请求，很多客户端默认就带，开启前请确认费用。</p>
      <label for="upTarget">手动超分的目标分辨率</label>
      <select id="upTarget">${opt('1080p','1080p',c.target)}${opt('2k','2K',c.target)}${opt('4k','4K',c.target)}</select>
      <label for="upDelivery">交付方式</label>
      <select id="upDelivery">${opt('download','下载到服务器（推荐，链接长期有效）',c.delivery)}${opt('link','直链到服务商（不占服务器流量，链接可能过期）',c.delivery)}</select>
      </fieldset><p id="upFeedback" class="hint" role="status" aria-live="polite"></p>
      <div class="row"><button class="btn" onclick="hide('dlg')">关闭</button><button id="upSave" class="btn btn-p" onclick="saveUpscaleSettings()">保存</button></div>`);
    upscaleProviderView();upscaleEnabledView();
  }catch(e){
    if(epoch===dialogEpoch&&e.message!=='unauthorized')showDlg(`<h2>视频超分</h2><p role="alert">${esc(e.message)}</p><button class="btn" onclick="openUpscaleSettings()">重试</button>`);
  }
}

function upscaleProviderView(){
  const p=q('#upProvider')&&q('#upProvider').value;
  if(q('#upFal'))q('#upFal').style.display=p==='fal'?'':'none';
  if(q('#upOpen'))q('#upOpen').style.display=p==='open'?'':'none';
  if(q('#upCustom'))q('#upCustom').style.display=p==='custom'?'':'none';
}

/** 现成模板对应服务商的「获取 Key / 接入文档」链接；名称对不上模板时显示通用接入说明 */
function customLinks(presets,name){
  const p=Object.values(presets||{}).find(x=>x.custom_name===name);
  const doc='<a href="/docs/upscale.html#自定义-api" target="_blank" rel="noopener">填写说明 ↗</a>';
  if(!p)return doc;
  return (p.key_url?`<a href="${esc(p.key_url)}" target="_blank" rel="noopener">获取 Key ↗</a> · `:'')
    +(p.docs_url?`<a href="${esc(p.docs_url)}" target="_blank" rel="noopener">接口文档 ↗</a> · `:'')+doc;
}
/** 自定义 API 的现成模板（只改表单，保存后才生效；请求头里的密钥要换成自己的） */
const CUSTOM_FIELDS={custom_name:'cuName',custom_submit_url:'cuSubmit',custom_body:'cuBody',custom_target_map:'cuTargetMap',
  custom_id_path:'cuIdPath',custom_poll_url:'cuPoll',custom_status_path:'cuStatus',custom_success:'cuSuccess',
  custom_failed:'cuFailed',custom_result_path:'cuResult',custom_error_path:'cuError',custom_code_path:'cuCodePath',custom_code_ok:'cuCodeOk'};
async function fillCustomPreset(name){
  try{
    const c=await api('/api/admin/settings/upscale');
    const preset=(c.custom_presets||{})[name];if(!preset)return;
    Object.entries(CUSTOM_FIELDS).forEach(([key,id])=>{if(q('#'+id))q('#'+id).value=preset[key]??'';});
    if(q('#cuHeaders'))q('#cuHeaders').value=preset.custom_headers_example||'';
    if(q('#cuLinks'))q('#cuLinks').innerHTML=customLinks(c.custom_presets,preset.custom_name);
    q('#upFeedback').textContent='已填入模板：把请求头里的 Key 换成自己的，再保存。';
  }catch(e){if(e.message!=='unauthorized')q('#upFeedback').textContent='读取模板失败：'+e.message;}
}

async function saveUpscaleSettings(){
  const button=q('#upSave'),feedback=q('#upFeedback');
  if(!button||button.disabled)return;
  const body={enabled:q('#upEnabled').checked,provider:q('#upProvider').value,target:q('#upTarget').value,delivery:q('#upDelivery').value,auto:q('#upAuto').value,
    fal_preset:q('#upPreset').value,open_endpoint:q('#upEndpoint').value.trim()};
  const falKey=q('#upFalKey').value.trim(),token=q('#upToken').value.trim();
  if(falKey)body.fal_key=falKey;      // 留空 = 不修改已保存的密钥
  if(token)body.open_token=token;
  Object.entries(CUSTOM_FIELDS).forEach(([key,id])=>{if(q('#'+id))body[key]=q('#'+id).value.trim();});
  const headers=q('#cuHeaders')?q('#cuHeaders').value.trim():'';
  if(headers)body.custom_headers=headers;
  const epoch=dialogEpoch;
  button.disabled=true;upscaleRevision++;feedback.textContent='正在保存…';
  try{
    const c=await api('/api/admin/settings/upscale',{method:'PATCH',body:body.enabled?body:{enabled:false}});
    upscaleRevision++;applyUpscaleSettings(c);
    void Promise.allSettled([loadTasks(),loadVideos()]);
    if(epoch!==dialogEpoch)return;
    q('#upFalKey').value='';q('#upToken').value='';q('#cuHeaders').value='';
    if(c.custom_headers_set)q('#cuHeaders').placeholder=`已保存（${c.custom_headers_hint}），留空不修改`;
    if(c.fal_key_set)q('#upFalKey').placeholder=`已保存 ${c.fal_key_hint}，留空不修改`;
    if(c.open_token_set)q('#upToken').placeholder=`已保存 ${c.open_token_hint}，留空不修改`;
    feedback.textContent=!c.enabled?'已保存，视频超分已关闭，所有超分按钮已隐藏。':c.ready[c.provider]?'已保存，可以在任务列表里发起超分。'
      :(c.provider==='fal'?'已保存，但还没有 fal API Key，暂时不能超分。'
        :c.provider==='custom'?'已保存，但自定义 API 的必填项还没填全，暂时不能超分。':'已保存，但还没有填写服务地址，暂时不能超分。');
    refresh();
  }catch(e){if(epoch===dialogEpoch&&e.message!=='unauthorized')feedback.textContent='保存失败：'+e.message;}
  finally{if(epoch===dialogEpoch)button.disabled=false;}
}

/** 任务 / 视频行里的超分状态与按钮（只对已完成、视频还在的任务显示） */
/** 超分完成的视频：按档位短边（1080p / 2K / 4K = 1080 / 1440 / 2160）和原片比例算出成片尺寸 */
const UPSCALE_SHORT={'1080p':1080,'2k':1440,'4k':2160};
function upscaleDims(v){
  const short=UPSCALE_SHORT[String(v.upscale_target||'').toLowerCase()];
  const w=Number(v.video_width),h=Number(v.video_height);
  if(!short||!w||!h)return '';
  const k=short/Math.min(w,h),even=x=>Math.round(x*k/2)*2;
  return even(w)+'×'+even(h);
}
function upscaleDimLine(v){
  if(v.upscale_status!=='completed'||!v.upscale_target)return '';
  const d=upscaleDims(v);
  return '<div class="tiny up-dim" translate="no">'+esc(String(v.upscale_target).toUpperCase())+(d?' · '+d:'')+'</div>';
}
function upscaleCell(t){
  if(t.status!=='completed'||!t.video_url)return '';
  const st=t.upscale_status||'';
  const secs=Math.max(1,Math.round(t.video_duration||t.duration||10));
  const start=upscaleEnabled()?'<button data-upscale-action class="btn" onclick="startUpscale(\''+esc(t.id)+'\','+secs+')">':null;
  const action=label=>start?start+label+'</button>':'';
  const asked=t.requested_resolution&&t.requested_resolution!=='720p'
    ?'<span class="tiny" translate="no">'+esc(t.requested_resolution)+'</span> ':'';
  if(st==='queued'||st==='processing'||(t.upscale_auto&&!st))
    return '<div class="upscale-cell">'+asked+'<span class="badge b-blue">超分中</span></div>';
  if(st==='skipped')
    return '<div class="upscale-cell"><span class="tiny" translate="no">'+esc(t.upscale_error||'')+'</span>'
      +action('超分')+'</div>';
  if(st==='completed'&&t.upscale_public_url){
    const u=esc(t.upscale_public_url);
    return '<div class="upscale-cell"><div class="video-wrap"><a href="'+u+'" target="_blank" translate="no">'
      +esc((t.upscale_target||'1080p').toUpperCase())+'</a>'
      +'<button class="btn" onclick="playVideo(&quot;'+u+'&quot;)">预览</button>'
      +'<button class="btn" onclick="copyLink(&quot;'+u+'&quot;)">复制链接</button></div>'
      +(t.upscale_error?'<span class="tiny" translate="no">'+esc(t.upscale_error)+'</span>':'')+'</div>';
  }
  if(st==='failed')
    return '<div class="upscale-cell"><span class="tiny err">超分失败：'+noTr(t.upscale_error||'')+'</span>'
      +action('重试超分')+'</div>';
  return start?'<div class="upscale-cell">'+action('超分')+'</div>':'';
}

async function startUpscale(id,secs){
  let c;
  try{c=await loadUpscaleSettings(true);}
  catch(e){if(e.message!=='unauthorized')alert(dialogText`${e.message}`);return;}
  if(c.enabled!==true){toast('视频超分已关闭，请先在设置中开启');return;}
  if(!c.ready[c.provider]){
    if(await confirm('还没有配置超分服务，现在去设置吗？'))openUpscaleSettings();
    return;
  }
  const scale={'1080p':1,'2k':2,'4k':4}[c.target]||1;
  const msg=c.provider==='fal'
    ?dialogText`用 fal 把这条视频超分到 ${c.target}，按输出时长计费，约 $${(c.fal_price_per_second*scale*secs).toFixed(3)}（${secs} 秒）。确定吗？`
    :c.provider==='custom'
      ?dialogText`用 ${c.custom_name||'自定义 API'} 把这条视频超分到 ${c.target}（按服务商价格计费），确定吗？`
      :dialogText`用自建超分模型把这条视频超分到 ${c.target}，确定吗？`;
  if(!await confirm(msg))return;
  try{await api('/api/admin/tasks/'+encodeURIComponent(id)+'/upscale',{method:'POST',body:{}});}
  catch(e){if(e.message!=='unauthorized')alert(dialogText`${e.message}`);return;}
  refresh();
}

