/* Appearance is independent of account, task and form state. Runs in <head> to avoid a white flash. */
(function(){
  'use strict';
  const KEY='dola_studio_theme',root=document.documentElement;
  let theme='light';try{if(localStorage.getItem(KEY)==='dark')theme='dark';}catch(_){}
  root.dataset.theme=theme;root.style.colorScheme=theme;
  function setTheme(next){
    theme=next==='dark'?'dark':'light';root.dataset.theme=theme;root.style.colorScheme=theme;
    try{localStorage.setItem(KEY,theme);}catch(_){}update();
    window.dispatchEvent(new CustomEvent('studio:themechange',{detail:{theme}}));
  }
  function update(){
    document.querySelectorAll('[data-theme-toggle]').forEach(button=>{
      button.setAttribute('aria-pressed',String(theme==='dark'));
      const title=theme==='dark'?'切换到白天模式':'切换到黑夜模式';
      button.setAttribute('aria-label',title);button.title=title;
    });
  }
  function start(){
    document.querySelectorAll('[data-theme-toggle]').forEach(button=>button.addEventListener('click',()=>setTheme(theme==='dark'?'light':'dark')));
    update();
  }
  window.StudioPreferences=Object.freeze({setTheme,get theme(){return theme;}});
  window.addEventListener('storage',e=>{if(e.key===KEY)setTheme(e.newValue);});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
