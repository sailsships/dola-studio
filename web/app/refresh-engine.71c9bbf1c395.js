/* Read-side scheduling only. This module never submits or retries mutations. */
window.StudioRefresh=(()=>{
 'use strict';
 function create({load,canRun=()=>true,onSettled=()=>{},now=Date.now,baseDelay=2000,maxDelay=30000}){
  if(typeof load!=='function')throw new TypeError('load must be a function');
  if(!(baseDelay>0&&maxDelay>=baseDelay))throw new RangeError('invalid backoff bounds');
  const resources=new Map();
  function entry(key){
   if(!resources.has(key))resources.set(key,{active:null,trailing:null,failures:0,retryAt:0,lastSuccess:0,loaded:false});
   return resources.get(key);
  }
  function status(key){
   const state=entry(key);
   return Object.freeze({running:!!state.active,queued:!!state.trailing,failures:state.failures,retryAt:state.retryAt,lastSuccess:state.lastSuccess,loaded:state.loaded});
  }
  function notify(key,ok,error){
   // A broken status indicator must not turn a successful data read into a failure.
   try{onSettled(key,{ok,error,status:status(key)});}catch{}
  }
  function start(key,options,state){
   const pending=Promise.resolve().then(()=>load(key,options));
   const active=pending.then(value=>{
    state.failures=0;state.retryAt=0;state.lastSuccess=now();state.loaded=true;
    return value;
   },error=>{
    state.failures++;
    state.retryAt=now()+Math.min(maxDelay,baseDelay*2**Math.min(state.failures-1,30));
    throw error;
   });
   state.active=active.then(value=>{
    state.active=null;notify(key,true);return value;
   },error=>{
    state.active=null;notify(key,false,error);throw error;
   });
   return state.active;
  }
  function request(key,options={}){
   const state=entry(key);
   // A manual click during an in-flight read queues exactly one *new* read,
   // shared by further clicks. It keeps the original resource, not the current tab.
   if(state.trailing)return state.trailing;
   if(state.active){
    if(!options.fresh)return state.active;
    const after=state.active.then(()=>{},()=>{});
    const trailing=after.then(()=>{
     if(state.trailing===trailing)state.trailing=null;
     return request(key,{...options,fresh:false});
    });
    state.trailing=trailing;
    return trailing;
   }
   if(!canRun(key,options))return Promise.resolve(undefined);
   if(options.background&&state.retryAt>now())return Promise.resolve(undefined);
   return start(key,options,state);
  }
  return Object.freeze({request,status});
 }
 return Object.freeze({create});
})();
