setInterval(tickLive,1000);
/* 启动：探测鉴权，401 才弹登录遮罩（ADMIN_KEY 留空时免登录） */
(async function boot(){
  await rememberPageVersion();
  try{ await api('/api/admin/accounts'); hide('loginMask'); shellEnter(); refresh(); checkUpdateBadge(); }
  catch(e){ /* 401 已在 api() 内触发 showLogin */ }
})();
timer=setInterval(liveRefreshTick,2000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void liveRefreshTick();});
setInterval(checkUpdateBadge,5*60*1000);
setInterval(checkPageVersion,60*1000);

window.addEventListener('online',()=>{if(!loginShowing()&&!document.hidden)void refresh({background:true});});
