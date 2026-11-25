/* API guide and direct browser client. Client keys never enter persistent templates. */
window.ApiGuide=(function(){
 'use strict';
 const STORE='studio-api-template-v1',VERSION=1;
 const $=id=>document.getElementById('ag-'+id);
 const VIDEO_MODELS=['seedance-2.0-fast','seedance-2.5','doubao-seedance-2.0-mini','doubao-seedance-2.0-fast','doubao-seedance-2.0','doubao-seedance-2.5'];
 const IMAGE_MODELS=['doubao-seedream-5.0-flash','doubao-seedream-5.0-pro','doubao-seedream-4.5','doubao-seedream-4.0'];
 const fields={name:'name',website:'website',base:'base',model:'model',mode:'mode',duration:'duration',ratio:'ratio',imageModel:'image-model',prompt:'prompt',notes:'notes'};
 const operations={models:{method:'GET',path:'/v1/models'},video:{method:'POST',path:'/v1/videos/generations'},task:{method:'GET',path:'/v1/videos/'},image:{method:'POST',path:'/v1/images/generations'},arkCreate:{method:'POST',path:'/api/v3/contents/generations/tasks'},arkTask:{method:'GET',path:'/api/v3/contents/generations/tasks/'}};
 const languages=['powershell','curl','python','javascript'];
 let mounted=false,language='powershell',controller=null,lastId='',snippets={},timedOut=false;
 function defaults(){return {name:'我的 API 接入',website:'',base:location.origin,model:VIDEO_MODELS[0],mode:'chat',duration:'15',ratio:'16:9',imageModel:IMAGE_MODELS[0],prompt:typeof DEFAULT_TEST_PROMPT==='string'?DEFAULT_TEST_PROMPT:'清晨湖面，镜头缓缓前移。',notes:''};}
 function config(){const c={};for(const [key,id] of Object.entries(fields))c[key]=$(id).value;return c;}
 function clean(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('模板应为 JSON 对象。');
  const c=defaults();for(const key of Object.keys(fields))if(Object.hasOwn(input,key)){
   if(typeof input[key]!=='string'||input[key].length>(key==='prompt'?10000:key==='notes'?2000:2048))throw new Error('模板字段格式不正确：'+key);
   c[key]=input[key];
  }
  if(!VIDEO_MODELS.includes(c.model)||!IMAGE_MODELS.includes(c.imageModel)||!['chat','work'].includes(c.mode)||!['5','10','15'].includes(c.duration)||!['16:9','9:16','1:1','4:3','3:4'].includes(c.ratio))throw new Error('模板模型、时长、比例或模式不受支持。');
  baseURL(c.base);if(c.website)webURL(c.website);return c;
 }
 function webURL(value){const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash)throw new Error('地址只支持 HTTP / HTTPS，不能包含账号、密码、查询参数或 #。');return u;}
 function baseURL(value){const u=webURL(String(value).trim());u.pathname=u.pathname.replace(/\/+$/,'').replace(/\/v1$/,'');return u.href.replace(/\/$/,'');}
 function apply(c){for(const [key,id] of Object.entries(fields))$(id).value=c[key];}
 function status(message){$('save-status').textContent=message;}
 function operation(){return $('operation').value;}
 function request(allowPlaceholder=false){
  const c=config(),op=operations[operation()],id=$('task-id').value.trim();
  if(!op)throw new Error('请选择支持的操作。');
  const query=['task','arkTask'].includes(operation());
  if(query&&!id&&!allowPlaceholder)throw new Error('请先填写创建请求返回的任务 ID。');
  return {method:op.method,url:baseURL(c.base)+op.path+(query?encodeURIComponent(id||'TASK_ID'):''),query};
 }
 function body(){
  const c=config(),op=operation();
  if(op==='image')return {model:c.imageModel,prompt:c.prompt,n:1,ratio:c.ratio,response_format:'url'};
  if(op==='arkCreate')return {model:c.model,content:[{type:'text',text:c.prompt}],duration:Number(c.duration),ratio:c.ratio,execution_mode:c.mode};
  return {model:c.model,prompt:c.prompt,duration:Number(c.duration),ratio:c.ratio,execution_mode:c.mode,video_count:1};
 }
 function jsonBody(){let data;try{data=JSON.parse($('body').value);}catch{throw new Error('请求 JSON 格式无效，请修正后发送。');}if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('请求体必须是 JSON 对象。');return data;}
 function sh(value){return "'"+String(value).replace(/'/g,"'\"'\"'")+"'";}
 function secretFree(value,requestKey=''){let out=String(value);const keys=new Set([requestKey,$('key').value.trim()]);for(const key of [...keys].filter(Boolean).sort((a,b)=>b.length-a.length))out=out.split(key).join('YOUR_API_KEY');return out;}
 function ps(value){return "'"+String(value).replace(/'/g,"''")+"'";}
 function makeSnippets(){
  let r;try{r=request(true);}catch(e){for(const lang of languages)$('code-'+lang).textContent=e.message;snippets={};return;}
  let data=null;if(r.method==='POST'){try{data=jsonBody();}catch(e){for(const lang of languages)$('code-'+lang).textContent=e.message;snippets={};return;}}
  const serialized=data?secretFree(JSON.stringify(data)):null;
  const curl=['# Bash / zsh；Windows 请切换到 PowerShell 示例。','# 先设置：export API_KEY=YOUR_API_KEY','curl --request '+r.method+' '+sh(secretFree(r.url)), '  --header "Authorization: Bearer $API_KEY"'];
  if(data)curl.push('  --header '+sh('Content-Type: application/json'),'  --data-raw '+sh(serialized));
  const isVideo=['video','arkCreate'].includes(operation()),ark=operation()==='arkCreate';
  const queryBase=secretFree(baseURL(config().base))+(ark?'/api/v3/contents/generations/tasks/':'/v1/videos/');
  let curlText=curl.slice(0,2).join('\n')+'\n'+curl.slice(2).join(' \\\n');
  if(isVideo)curlText+='\n\n# 保存响应中的 id，然后单独查询（替换 TASK_ID）：\ncurl '+sh(queryBase+'TASK_ID')+' --header "Authorization: Bearer $API_KEY"';
  const powershell=['# Windows PowerShell 5.1 / PowerShell 7','# 先设置：$env:API_KEY = "YOUR_API_KEY"','if (-not $env:API_KEY) { throw "请设置 API_KEY" }','$headers = @{ Authorization = "Bearer $env:API_KEY" }','$url = '+ps(secretFree(r.url))];
  if(data)powershell.push('$payload = '+ps(serialized),'$bytes = [Text.Encoding]::UTF8.GetBytes($payload)',`$result = Invoke-RestMethod -Uri $url -Method Post -Headers $headers -ContentType 'application/json; charset=utf-8' -Body $bytes -TimeoutSec ${operation()==='image'?600:60}`);
  else powershell.push('$result = Invoke-RestMethod -Uri $url -Method Get -Headers $headers -TimeoutSec 30');
  powershell.push('$result | ConvertTo-Json -Depth 30');
  if(isVideo)powershell.push('','# 保存任务 ID；等待 5～10 秒后单独执行以下查询，直到完成。','$taskId = $result.id','$queryUrl = '+ps(queryBase)+' + [Uri]::EscapeDataString($taskId)','$task = Invoke-RestMethod -Uri $queryUrl -Method Get -Headers $headers -TimeoutSec 30','$task | ConvertTo-Json -Depth 30');
  const python=['# pip install requests；先设置环境变量 API_KEY','import os, json, time','import requests','',`url = ${JSON.stringify(secretFree(r.url))}`,'headers = {"Authorization": "Bearer " + os.environ["API_KEY"]}'];
  if(data)python.push('payload = json.loads('+JSON.stringify(serialized)+')',`response = requests.post(url, headers=headers, json=payload, timeout=${operation()==='image'?600:60})`);
  else python.push('response = requests.get(url, headers=headers, timeout=30)');
  python.push('response.raise_for_status()','result = response.json()','print(json.dumps(result, ensure_ascii=False, indent=2))');
  if(isVideo)python.push('','task_id = result["id"]','for _ in range(120):','    time.sleep(5)',`    response = requests.get(${JSON.stringify(queryBase)} + requests.utils.quote(task_id, safe=""), headers=headers, timeout=30)`,'    response.raise_for_status()','    result = response.json()',`    if result.get("status") in ${ark?'("succeeded", "failed")':'("completed", "failed")'}:`,'        print(json.dumps(result, ensure_ascii=False, indent=2))','        break','else:','    print("查询时间已到，请保留 task_id 后续继续查询：", task_id)');
  const js=['// Node.js 18+ 后台代码；先设置环境变量 API_KEY。','// 网站前端通过自己的后台调用，不在公开网页保存服务器 Key。','const key = process.env.API_KEY;','if (!key) throw new Error("请设置 API_KEY");','const headers = {Authorization: `Bearer ${key}`, "Content-Type": "application/json"};',`const url = ${JSON.stringify(secretFree(r.url))};`,`const response = await fetch(url, {method: ${JSON.stringify(r.method)}, headers,`];
  if(data)js.push('  body: JSON.stringify('+serialized+'),');
  js.push(`  signal: AbortSignal.timeout(${operation()==='image'?600000:60000})`, '});','if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);','let result = await response.json();','console.log(result);');
  if(isVideo)js.push('','const taskId = result.id;','for (let i = 0; i < 120; i++) {','  await new Promise(resolve => setTimeout(resolve, 5000));',`  const poll = await fetch(${JSON.stringify(queryBase)} + encodeURIComponent(taskId), {headers, signal: AbortSignal.timeout(30000)});`,'  if (!poll.ok) throw new Error(`${poll.status} ${await poll.text()}`);','  result = await poll.json();','  console.log(result);',`  if (${JSON.stringify(ark?['succeeded','failed']:['completed','failed'])}.includes(result.status)) break;`,'}','// 如仍在排队或处理中，请保留 taskId 后续继续查询；不要重发创建请求。');
  snippets={curl:curlText,powershell:powershell.join('\n'),python:python.join('\n'),javascript:js.join('\n')};
  for(const [lang,code] of Object.entries(snippets))$('code-'+lang).textContent=code;
 }
 function render(rebuild=true){
  const op=operation(),write=operations[op].method==='POST',query=['task','arkTask'].includes(op);
  $('id-field').hidden=!query;$('body-field').hidden=!write;$('confirm-field').hidden=!write;
  $('headers').textContent='Authorization: Bearer '+($('key').value?'•••••••• (当前页面密钥)':'YOUR_API_KEY')+(write?'\nContent-Type: application/json':'');
  $('method').textContent=operations[op].method;
  try{$('url').textContent=request(true).url;$('transport').textContent=new URL(request(true).url).origin===location.origin?'同源请求':'跨域请求 · 需目标允许 CORS';}catch(e){$('url').textContent=e.message;}
  $('operation-note').textContent=op==='models'?'先读取模型列表，确认地址可访问；模型列表不验证 Key 是否有效。':query?'用创建时的同一个客户 Key 查询；这里不会自动轮询。':op==='image'?'图片同步返回，耗时可能较长，可适当提高请求超时。':'创建后先保存任务 ID，再查询最终状态；受理不代表已完成。';
  if(write&&rebuild)$('body').value=JSON.stringify(body(),null,2);
  if(rebuild)$('confirm').checked=false;
  makeSnippets();
 }
 function exportTemplate(){const c=clean(config());for(const key of Object.keys(c))c[key]=secretFree(c[key]);return {version:VERSION,config:c};}
 function download(name,text,type){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 async function readResponse(response){
  if(!response.body)return '';
  const reader=response.body.getReader(),decoder=new TextDecoder();let total=0,out='';
  try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>2*1024*1024){await reader.cancel();return out+'\n[响应超过 2 MiB，停止展示；请使用后台脚本读取完整结果]';}out+=decoder.decode(value,{stream:true});}return out+decoder.decode();}finally{reader.releaseLock();}
 }
 function busy(value){for(const el of document.querySelectorAll('#ag-connection input,#ag-connection select,#ag-connection textarea,#ag-connection button,#ag-debug input,#ag-debug select,#ag-debug textarea,#ag-debug button'))el.disabled=value;$('cancel').disabled=!value;}
 async function send(){
  if(controller)return;
  let r,data,key,timeout;try{
   r=request();key=$('key').value.trim();timeout=Number($('timeout').value);
   if(!Number.isInteger(timeout)||timeout<5||timeout>600)throw new Error('请求超时应为 5～600 的整数秒。');
   if(operation()!=='models'&&!key)throw new Error('请填写客户 API Key。');
   if(r.method==='POST'){data=jsonBody();if(!$('confirm').checked)throw new Error('请勾选本次提交真实生成任务，再发送。');}
  }catch(e){$('result-status').textContent='未发送';$('response').textContent=e.message;return;}
  controller=new AbortController();timedOut=false;const start=performance.now(),currentOp=operation();
  const timer=setTimeout(()=>{timedOut=true;controller?.abort();},timeout*1000);
  $('send').disabled=true;$('cancel').disabled=false;$('use-id').hidden=true;$('result-status').textContent='请求中…';$('response').textContent='等待服务响应…';
  busy(true);
  try{
   const headers={};if(key)headers.Authorization='Bearer '+key;if(data)headers['Content-Type']='application/json';
   const response=await fetch(r.url,{method:r.method,headers,body:data?JSON.stringify(data):undefined,credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:controller.signal});
   const raw=await readResponse(response);let parsed;try{parsed=JSON.parse(raw);}catch{}
   $('result-status').textContent='HTTP '+response.status+' · '+Math.round(performance.now()-start)+' ms';
   $('response').textContent=secretFree(parsed?JSON.stringify(parsed,null,2):raw||'(空响应)',key);
   if(response.ok&&response.headers.get('content-type')?.includes('json')===false)$('response').textContent+='\n\n预期 JSON，当前可能是网站首页或代理页面，请核对 API 地址。';
   if(response.ok&&parsed&&typeof parsed.id==='string'&&['video','arkCreate'].includes(currentOp)){
    lastId=parsed.id;$('use-id').hidden=false;$('use-id').dataset.operation=currentOp==='arkCreate'?'arkTask':'task';
   }
   if(response.ok&&Array.isArray(parsed?.data)&&currentOp==='models')status('已返回 '+parsed.data.length+' 个模型；模型列表不验证 Key 或账号是否可生成。');
  }catch(e){
   $('result-status').textContent=controller.signal.aborted?(timedOut?'请求超时':'已停止等待'):'连接失败';
   $('response').textContent=controller.signal.aborted?'已停止等待响应。服务端可能已受理；请先核对任务列表，勿直接重发创建请求。':'未能读取响应：'+secretFree(e.message,key)+'\n请检查地址、网络、HTTPS 与 CORS；可用下方 cURL 或后台示例交叉验证。';
  }finally{clearTimeout(timer);controller=null;busy(false);$('confirm').checked=false;}
 }
 function selectLanguage(lang){language=lang;for(const l of languages){$('lang-'+l).setAttribute('aria-selected',String(l===lang));$('lang-'+l).tabIndex=l===lang?0:-1;$('code-'+l).hidden=l!==lang;}}
 function mount(){
  if(mounted)return;mounted=true;
  for(const [id,models] of [['model',VIDEO_MODELS],['image-model',IMAGE_MODELS]])for(const model of models){const o=document.createElement('option');o.value=model;o.textContent=model;$(id).append(o);}
  let c=defaults();try{const raw=localStorage.getItem(STORE);if(raw){const t=JSON.parse(raw);if(t.version!==VERSION)throw new Error('版本不匹配');c=clean(t.config);}}catch{status('本地模板无效，已使用默认配置。');}
  apply(c);render();selectLanguage(language);
  for(const [key,id] of Object.entries(fields))$(id).addEventListener('input',()=>{$('confirm').checked=false;render(!['name','website','base','notes'].includes(key));});
  $('operation').addEventListener('change',()=>render());$('task-id').addEventListener('input',()=>render(false));$('key').addEventListener('input',()=>{$('confirm').checked=false;render(false);});
  $('body').addEventListener('input',()=>{$('confirm').checked=false;makeSnippets();});$('rebuild').addEventListener('click',()=>render());
  $('key-toggle').addEventListener('click',()=>{const show=$('key').type==='password';$('key').type=show?'text':'password';$('key-toggle').textContent=show?'隐藏':'显示';$('key-toggle').setAttribute('aria-pressed',String(show));$('key-toggle').setAttribute('aria-label',(show?'隐藏':'显示')+'客户 API Key');});
  $('save').addEventListener('click',()=>{try{localStorage.setItem(STORE,JSON.stringify(exportTemplate()));status('模板已保存在当前浏览器，不包含客户 Key。');}catch(e){status('保存失败：'+e.message);}});
  $('export').addEventListener('click',()=>{try{download('api-connection-template.json',JSON.stringify(exportTemplate(),null,2),'application/json');status('模板已导出，不包含客户 Key。');}catch(e){status('导出失败：'+e.message);}});
  $('import').addEventListener('click',()=>$('import-file').click());
  $('import-file').addEventListener('change',async()=>{try{const file=$('import-file').files[0];if(!file)return;if(file.size>100000)throw new Error('模板文件过大');const t=JSON.parse(await file.text());if(t.version!==VERSION)throw new Error('模板版本不支持');const imported=clean(t.config);apply(imported);$('key').value='';render();status('已载入模板，请单独填写客户 Key，确认后保存。');}catch(e){status('导入失败：'+e.message);}finally{$('import-file').value='';}});
  $('reset').addEventListener('click',()=>{if(controller){status('请先停止当前请求，再恢复默认配置。');return;}try{localStorage.removeItem(STORE);}catch{}apply(defaults());$('key').value='';$('key').type='password';$('key-toggle').textContent='显示';$('key-toggle').setAttribute('aria-label','显示客户 API Key');$('key-toggle').setAttribute('aria-pressed','false');$('task-id').value='';lastId='';$('timeout').value='30';$('operation').value='models';$('use-id').hidden=true;$('result-status').textContent='尚未发送请求';$('response').textContent='请求完成后，会在这里显示 HTTP 状态、耗时和响应正文。';render();status('已恢复默认配置并清除当前 Key。');});
  $('send').addEventListener('click',send);$('cancel').addEventListener('click',()=>controller?.abort());
  $('use-id').addEventListener('click',()=>{$('task-id').value=lastId;$('operation').value=$('use-id').dataset.operation;render();$('id-field').scrollIntoView({block:'nearest'});});
  for(const lang of languages){$('lang-'+lang).addEventListener('click',()=>selectLanguage(lang));$('lang-'+lang).addEventListener('keydown',e=>{let i=languages.indexOf(lang);if(e.key==='ArrowRight')i=(i+1)%languages.length;else if(e.key==='ArrowLeft')i=(i+languages.length-1)%languages.length;else if(e.key==='Home')i=0;else if(e.key==='End')i=languages.length-1;else return;e.preventDefault();selectLanguage(languages[i]);$('lang-'+languages[i]).focus();});}
  $('copy').addEventListener('click',async()=>{try{if(!snippets[language])throw new Error('请先修正配置');await navigator.clipboard.writeText(snippets[language]);$('copy-status').textContent='已复制 '+language+' 示例。';}catch{$('copy-status').textContent='未能访问剪贴板，可直接选中代码复制。';}});
  $('download-guide').addEventListener('click',()=>{try{const c=exportTemplate().config;const lines=['# '+c.name,'','API 服务地址：'+baseURL(c.base),'调用方网站：'+(c.website||'未填写'),'OpenAI Base URL：'+baseURL(c.base)+'/v1','客户 Key：请在运行环境设置 API_KEY（本说明不包含密钥）','备注：'+c.notes,'',document.getElementById('ag-handbook').innerText,'','## 当前请求示例',...Object.entries(snippets).flatMap(([lang,code])=>['','```'+lang,code,'```'])];download('api-connection-guide.md',secretFree(lines.join('\n')),'text/markdown');status('接入说明已下载，不包含客户 Key。');}catch(e){status('下载失败：'+e.message);}});
 }
 function clearSecret(){if(!mounted)return;controller?.abort();$('key').value='';$('key').type='password';$('key-toggle').textContent='显示';$('key-toggle').setAttribute('aria-pressed','false');$('key-toggle').setAttribute('aria-label','显示客户 API Key');$('response').textContent='已注销，客户 Key 与响应展示已清除。';$('use-id').hidden=true;lastId='';$('task-id').value='';render(false);}
 return Object.freeze({mount,clearSecret});
})();
