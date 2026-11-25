"""Observe native fetch receipts while leaving request and response bytes unchanged."""
INSTALL_JS = r'''()=>{
 if(window.__dolaCompletionReceipt)return;
 const root={entries:[]};window.__dolaCompletionReceipt=root;
 const original=window.fetch;
 const numeric=v=>typeof v==='string'&&/^[1-9][0-9]{5,30}$/.test(v)?v:'';
 function payload(entry,event,data){
  if(!data||typeof data!=='object')return;
  const ack=data.ack_client_meta;
  const cid=numeric(ack?.conversation_id)||numeric(data.conversation_id)||numeric(data.data?.conversation_id);
  if(cid){
   if(entry.conversation_id&&entry.conversation_id!==cid)entry.conflicting_ack=true;
   else entry.conversation_id=cid;
  }
  const code=data.code??data.status_code??data.error_code??data.err_code??data.ret;
  const nonzero=code!==undefined&&code!==null&&String(code)!=='0'&&String(code)!=='';
  const errorEvent=/^(gateway-error|error|STREAM_ERROR)$/i.test(event);
  if(nonzero||errorEvent){
   entry.error={code:code??null,message:String(data.message??data.msg??data.status_msg??data.err_msg??data.error_msg??'').slice(0,1500),event};
  }
  if(entry.headers.length<8)entry.headers.push({event,keys:Object.keys(data).slice(0,20),conversation_id:cid||null,code:code??null});
 }
 async function consume(response,entry){
  let reader;
  try{
   const type=response.headers.get('content-type')||'';
   if(!/event-stream|json/i.test(type)){entry.unparsed_type=type;return;}
   reader=response.body?.getReader();if(!reader)return;
   const decoder=new TextDecoder('utf-8');let pending='',event='',dataLines=[],json='';
   const flush=()=>{if(dataLines.length){try{payload(entry,event,JSON.parse(dataLines.join('\n')))}catch{}dataLines=[];}event='';};
   const line=s=>{if(!s){flush();return;}if(s.startsWith('event:'))event=s.slice(6).trim();else if(s.startsWith('data:'))dataLines.push(s.slice(5).trimStart());};
   while(true){
    const part=await reader.read();if(part.done)break;
    entry.received_bytes+=part.value.byteLength;
    const chunk=decoder.decode(part.value,{stream:true});
    if(/json/i.test(type)&&!/event-stream/i.test(type)){if(json.length<262144)json+=chunk;continue;}
    pending+=chunk;
    if(pending.length>524288){entry.observer_error='oversized SSE line';await reader.cancel();return;}
    let pos;
    while((pos=pending.indexOf('\n'))>=0){line(pending.slice(0,pos).replace(/\r$/,''));pending=pending.slice(pos+1);}
   }
   if(json){try{payload(entry,'json',JSON.parse(json))}catch{}}
   else{if(pending)line(pending.replace(/\r$/,''));flush();}
   entry.finished=true;
  }catch(e){entry.observer_error=String(e?.name||'read error');}
  finally{try{reader?.releaseLock()}catch{}}
 }
 window.fetch=async function(input,init){
  let entry=null;
  try{
   const url=new URL(typeof input==='string'?input:input.url,location.href);
   const method=String(init?.method||input?.method||'GET').toUpperCase();
   if(url.pathname.replace(/\/$/,'').endsWith('/chat/completion')&&method==='POST'){
    let body={};try{body=JSON.parse(typeof init?.body==='string'?init.body:'{}')}catch{}
    entry={local_message_ids:(body.messages||[]).map(m=>m.local_message_id).filter(Boolean),
      at:Date.now()/1000,conversation_id:'',received_bytes:0,headers:[]};
    root.entries.push(entry);root.entries=root.entries.slice(-8);
   }
  }catch{}
  try{
   const response=await original.apply(this,arguments);
   if(entry){
    entry.http_status=response.status;
    try{consume(response.clone(),entry)}catch(e){entry.observer_error=String(e?.name||'clone error');}
   }
   return response;
  }catch(e){if(entry)entry.fetch_error=String(e?.name||'fetch error');throw e;}
 };
}'''

READ_JS = r'''mid=>{
 const entries=window.__dolaCompletionReceipt?.entries||[];
 return entries.filter(e=>mid&&e.local_message_ids.includes(mid)).slice(-1)[0]||null;
}'''


async def install(page):
    # Passive preparation may reload the document. Reinstall the observer in
    # each new document so a post-reload rejection cannot become an empty wait.
    await page.add_init_script('('+INSTALL_JS+')();')
    await page.evaluate(INSTALL_JS)


async def read(page,local_message_id):
    return await page.evaluate(READ_JS,local_message_id)


def result(receipt):
    """An explicit rejection differs from an unknown or interrupted transport."""
    if not receipt:return '',None
    cid=receipt.get('conversation_id') or ''
    if receipt.get('conflicting_ack'):return '',None
    if cid.isdecimal() and int(cid)>0:return cid,None
    error=receipt.get('error')
    if error:
        code=error.get('code');message=error.get('message') or ''
        return '',f'上游拒绝提交（code={code}）：{message or error.get("event") or "未提供说明"}'
    status=receipt.get('http_status')
    if status and int(status)>=400:
        return '',f'生成请求 HTTP {int(status)}，没有取得上游会话'
    return '',None


def can_rotate(receipt):
    """Retry only the observed explicit pre-acceptance rejection, never a lost stream."""
    if not receipt or receipt.get('conversation_id') or receipt.get('conflicting_ack'):return False
    return str((receipt.get('error') or {}).get('code'))=='710022002'
