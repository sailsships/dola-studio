/* Request coordination: identical reads share work; mutations are never retried. */
window.StudioHttp=(()=>{
 class ApiError extends Error{
  constructor(message,status,details){super(message);this.name='ApiError';this.status=status;this.details=details;}
 }
 const describe=value=>typeof value==='string'?value:Array.isArray(value)?value.map(item=>item?.msg||JSON.stringify(item)).join('；'):value?JSON.stringify(value):'';
 function create({credential,onUnauthorized,onActivity,normalize=value=>value,fetcher=(...args)=>fetch(...args)}){
  const inflight=new Map();let mutations=0;
  async function perform(path,options,method,headers){
   const mutation=!['GET','HEAD'].includes(method);
   if(mutation)onActivity?.(++mutations);
   try{
    const response=await fetcher(path,{method,headers,cache:'no-store',signal:options.signal,body:options.body==null?undefined:JSON.stringify(options.body)});
    if(response.status===401){if(!options.quiet401)onUnauthorized?.();throw new ApiError('unauthorized',401,null);}
    const raw=await response.text();let data={};
    try{data=raw?JSON.parse(raw):{};}catch{if(response.ok)throw new ApiError('服务器返回了非 JSON 响应',response.status,null);}
    if(!response.ok)throw new ApiError(normalize(describe(data.detail)||`${response.status} ${raw.slice(0,120)}`),response.status,data.detail);
    return data;
   }finally{if(mutation)onActivity?.(--mutations);}
  }
  function request(path,options={}){
   const method=String(options.method||'GET').toUpperCase(),headers=new Headers({'Content-Type':'application/json','X-Admin-Key':credential()});
   new Headers(options.headers||{}).forEach((value,name)=>headers.set(name,value));
   const share=method==='GET'&&!options.signal;
   const key=JSON.stringify([path,[...headers.entries()].sort(([a],[b])=>a.localeCompare(b)),!!options.quiet401]);
   if(share&&inflight.has(key))return inflight.get(key);
   const result=perform(path,options,method,headers);
   if(!share)return result;
   const shared=result.finally(()=>{if(inflight.get(key)===shared)inflight.delete(key);});inflight.set(key,shared);return shared;
  }
  return Object.freeze({request});
 }
 return Object.freeze({create,ApiError});
})();
