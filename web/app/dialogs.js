
/* 应用内弹窗，替换浏览器原生 alert / confirm / prompt（原生框顶着域名、样式和面板不一致）。
   i18n.js 在它之后加载，会再包一层负责翻译，所以这里拿到的已经是当前语言的文案。
   alert 不阻塞；confirm / prompt 返回 Promise —— 调用处必须 await，否则 Promise 恒为真。 */
(function(){
  if(typeof document==='undefined'||typeof document.createElement!=='function')return;
  const queue=[];let busy=false,current=null;
  const RISKY=/删除|清空|移除|重置|注销|停止|丢弃|覆盖/;
  function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;}
  function open(kind,msg,def){return new Promise(resolve=>{queue.push({kind,msg:String(msg==null?'':msg),source:msg,def,resolve});next();});}
  function next(){
    // 兜底：开着的弹窗被别的代码从页面上移除了，不能让队列永远卡住
    if(busy&&current&&!document.body.contains(current))busy=false;
    if(busy||!queue.length||!document.body)return;
    const it=queue.shift();busy=true;
    const prev=document.activeElement;
    const risky=it.kind==='confirm'&&RISKY.test(it.msg);
    const wrap=el('div','nd');
    const box=el('div','nd-box'+(risky?' nd-risky':''));
    box.setAttribute('role',it.kind==='alert'?'alertdialog':'dialog');
    box.setAttribute('aria-modal','true');box.setAttribute('aria-labelledby','ndTitle');box.setAttribute('aria-describedby','ndMsg');
    const title=el('h3','nd-title',it.kind==='alert'?'提示':it.kind==='prompt'?'请输入':risky?'请再次确认':'请确认');
    title.id='ndTitle';
    const body=el('p','nd-msg',window.I18N?I18N.message(it.source):it.msg);body.id='ndMsg';body.setAttribute('translate','no');
    box.append(title,body);
    let input=null;
    if(it.kind==='prompt'){input=el('textarea','nd-input');input.rows=3;input.value=it.def==null?'':String(it.def);
      input.setAttribute('aria-labelledby','ndMsg');input.setAttribute('translate','no');box.append(input);}
    const refreshMessage=()=>{body.textContent=window.I18N?I18N.message(it.source):it.msg;};
    window.addEventListener('studio:languagechange',refreshMessage);
    const row=el('div','nd-actions');
    let cancel=null;
    cancel=el('button','dialog-close');cancel.type='button';cancel.setAttribute('aria-label','关闭窗口');cancel.title='关闭';cancel.innerHTML=ConsoleSync.icon;box.prepend(cancel);
    const okLabel=it.kind==='alert'?'知道了':risky&&/删除/.test(it.msg)?'删除':'确定';
    const ok=el('button','btn '+(risky?'btn-risky':'btn-p'),okLabel);ok.type='button';
    row.append(ok);box.append(row);wrap.append(box);document.body.append(wrap);current=wrap;
    requestAnimationFrame(()=>wrap.classList.add('nd-in'));
    function done(value){
      document.removeEventListener('keydown',onKey,true);window.removeEventListener('studio:languagechange',refreshMessage);wrap.remove();busy=false;
      try{if(prev&&prev.focus&&document.contains(prev))prev.focus();}catch(e){}
      it.resolve(value);next();
    }
    const yes=()=>done(it.kind==='prompt'?input.value:it.kind==='confirm'?true:undefined);
    const no=()=>done(it.kind==='prompt'?null:it.kind==='confirm'?false:undefined);
    function onKey(e){
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();no();return;}
      if(e.key==='Enter'&&e.target===input&&!e.shiftKey){e.preventDefault();yes();return;}
      if(e.key==='Tab'){const f=[input,cancel,ok].filter(Boolean);const i=f.indexOf(document.activeElement);
        e.preventDefault();f[(i+(e.shiftKey?-1:1)+f.length)%f.length].focus();}
    }
    document.addEventListener('keydown',onKey,true);
    ok.addEventListener('click',yes);if(cancel)cancel.addEventListener('click',no);
    wrap.addEventListener('mousedown',e=>{if(e.target===wrap&&it.kind!=='prompt')no();});
    // Destructive confirmations focus the dismiss control; Enter cannot confirm accidentally.
    (input||(risky?cancel:ok)).focus();if(input)input.select();
  }
  window.alert=msg=>{open('alert',msg);};
  window.confirm=msg=>open('confirm',msg);
  window.prompt=(msg,def)=>open('prompt',msg,def);
  /* 轻提示：复制成功这类不需要确认的结果，2 秒后自动消失 */
  let toastTimer=0;
  window.toast=msg=>{
    let text=String(msg==null?'':msg);
    if(msg&&Array.isArray(msg.i18nParts)&&window.I18N){
      const tpl=msg.i18nParts.reduce((o,p,i)=>o+p+(i<msg.i18nValues.length?'{'+i+'}':''),'');
      text=I18N.t(tpl).replace(/\{(\d+)\}/g,(_,i)=>String(msg.i18nValues[+i]));
    }else if(window.I18N)text=I18N.t(text);
    let t=document.getElementById('ndToast');
    if(!t){t=el('div','nd-toast');t.id='ndToast';t.setAttribute('role','status');t.setAttribute('translate','no');document.body.append(t);}
    t.textContent=text;t.classList.add('nd-in');
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('nd-in'),2000);
  };
  document.addEventListener('DOMContentLoaded',next);
})();
