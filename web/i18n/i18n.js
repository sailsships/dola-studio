/* Source-language DOM localization: never rebuild a form or reload a page. */
(function () {
  'use strict';
  const LANGS = {zh: {label:'中文',html:'zh-CN'},en:{label:'English',html:'en'},ja:{label:'日本語',html:'ja'},ko:{label:'한국어',html:'ko'}};
  const KEY='dola_lang', ATTRS=['title','placeholder','alt','aria-label'], HAN=/[一-鿿]/, PH=/\{(\d+)\}/g;
  const texts=new WeakMap(), attrs=new WeakMap(), dictionaries=new Map();
  let lang='zh', dictionary=new Map(), patterns=[], fragments=null, cache=new Map(), request=0;
  const normalize=s=>String(s).replace(/\s+/g,' ').trim();
  const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  function preference(){
    let saved;try{saved=localStorage.getItem(KEY);}catch(_){}
    if(saved)return LANGS[saved]?saved:'zh';
    const browser=((navigator.languages||[])[0]||navigator.language||'').split('-')[0];
    return LANGS[browser]?browser:'zh';
  }
  function compile(data){
    dictionary=new Map();patterns=[];cache=new Map();const parts=[];
    Object.entries(data).forEach(([source,target])=>{
      if(!target)return;
      if(/\{\d+\}/.test(source)){
        const chunks=source.split(/\{\d+\}/),order=[...source.matchAll(/\{(\d+)\}/g)].map(m=>+m[1]);
        patterns.push({re:new RegExp('^'+chunks.map(escape).join('([\\s\\S]*?)')+'$'),order,target,weight:chunks.join('').length});
      }else{dictionary.set(source,target);if(HAN.test(source))parts.push(source);}
    });
    patterns.sort((a,b)=>b.weight-a.weight);
    fragments=parts.length?new RegExp(parts.sort((a,b)=>b.length-a.length).map(escape).join('|'),'g'):null;
  }
  function line(raw){
    const source=normalize(raw);if(lang==='zh'||!HAN.test(source))return null;
    if(cache.has(source))return cache.get(source);
    let result=dictionary.get(source);
    if(result==null)for(const p of patterns){
      const match=p.re.exec(source);if(!match)continue;
      const values={};p.order.forEach((index,i)=>{values[index]=match[i+1];});
      // Captured values are opaque data: never recursively translate names/errors/prompts.
      result=p.target.replace(PH,(_,i)=>values[i]??'');break;
    }
    if(result==null&&fragments){
      // Check SOURCE remnants, not output: Japanese intentionally contains Han characters.
      if(!HAN.test(source.replace(fragments,'')))result=source.replace(fragments,key=>dictionary.get(key));
    }
    if(cache.size>5000)cache.clear();cache.set(source,result??null);return result??null;
  }
  function translate(value){
    if(value==null)return value;const raw=String(value),exact=line(raw);
    if(exact!=null)return raw.match(/^\s*/)[0]+exact+raw.match(/\s*$/)[0];
    return raw.split('\n').map(part=>{const out=line(part);return out==null?part:part.match(/^\s*/)[0]+out+part.match(/\s*$/)[0];}).join('\n');
  }
  function message(msg){
    if(msg&&Array.isArray(msg.i18nParts)&&Array.isArray(msg.i18nValues)){
      const tpl=msg.i18nParts.reduce((out,part,i)=>out+part+(i<msg.i18nValues.length?'{'+i+'}':''),'');
      return translate(tpl).replace(PH,(_,i)=>String(msg.i18nValues[+i]));
    }return translate(msg==null?'':msg);
  }
  function skipped(el,attributes){return !el||!!el.closest('[translate="no"],.notranslate,script,style,code,pre,[contenteditable="true"]'+(attributes?'':',textarea'));}
  function doText(node){
    if(skipped(node.parentElement,false))return;
    const current=node.data,prev=texts.get(node),source=prev&&current===prev.out?prev.source:current,out=translate(source);
    texts.set(node,{source,out});if(current!==out)node.data=out;
  }
  function doAttrs(el){
    if(el.matches('option[data-account-name]')){const label=el.getAttribute('data-account-name')+' · '+translate(el.getAttribute('data-account-status'));if(el.textContent!==label)el.textContent=label;}
    if(skipped(el,true))return;let record=attrs.get(el);if(!record){record={};attrs.set(el,record);}
    for(const name of ATTRS){
      const current=el.getAttribute(name);if(current==null){delete record[name];continue;}
      const prev=record[name],source=prev&&current===prev.out?prev.source:current,out=translate(source);
      record[name]={source,out};if(current!==out)el.setAttribute(name,out);
    }
  }
  function walk(root){
    if(root.nodeType===3){doText(root);return;}if(root.nodeType!==1)return;
    doAttrs(root);const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT);let node;
    while((node=walker.nextNode())){if(node.nodeType===3)doText(node);else doAttrs(node);}
  }
  function switches(){
    document.querySelectorAll('select[data-i18n-switcher]').forEach(select=>{
      if(!select.dataset.i18nMounted){
        select.setAttribute('translate','no');
        select.replaceChildren(...Object.entries(LANGS).map(([value,conf])=>{const option=document.createElement('option');option.value=value;option.textContent=conf.label;return option;}));
        select.dataset.i18nMounted='true';select.addEventListener('change',()=>{void setLang(select.value);});
      }select.value=lang;
    });
  }
  async function setLang(next,persist=true){
    if(!LANGS[next])return false;const id=++request;
    document.documentElement.setAttribute('data-language-loading',next);
    try{
      let data={};
      if(next!=='zh'){
        if(!dictionaries.has(next)){
          const response=await fetch('i18n/'+next+'.json?v=1.0.1-four-languages',{cache:'no-cache'});
          if(!response.ok)throw new Error('Dictionary HTTP '+response.status);
          const loaded=await response.json();
          if(!loaded||Array.isArray(loaded)||typeof loaded!=='object'||!Object.keys(loaded).length||!Object.values(loaded).every(v=>typeof v==='string'))throw new Error('Invalid dictionary');
          dictionaries.set(next,loaded);
        }data=dictionaries.get(next);
      }
      if(id!==request)return false;
      compile(data);lang=next;document.documentElement.lang=LANGS[lang].html;document.documentElement.dataset.language=lang;
      if(document.body)walk(document.body);if(document.querySelector('title'))walk(document.querySelector('title'));switches();
      if(persist)try{localStorage.setItem(KEY,lang);}catch(_){}
      window.dispatchEvent(new CustomEvent('studio:languagechange',{detail:{language:lang}}));return true;
    }catch(error){
      if(id===request){switches();console.warn('[i18n] Language unchanged:',error.message);if(window.toast)window.toast('语言加载失败，请稍后重试');}return false;
    }finally{if(id===request){document.documentElement.removeAttribute('data-language-loading');document.documentElement.classList.remove('i18n-pending');}}
  }
  window.I18N=Object.freeze({get lang(){return lang;},languages:LANGS,setLang,t:translate,message,
    sourceText:node=>{const rec=texts.get(node);return rec&&node.data===rec.out?rec.source:node.data;}});
  function start(){
    switches();new MutationObserver(records=>{for(const r of records){if(r.type==='childList')r.addedNodes.forEach(walk);else if(r.type==='characterData')doText(r.target);else doAttrs(r.target);}})
      .observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:ATTRS});
    void setLang(preference(),false);
  }
  if(preference()!=='zh'){document.documentElement.classList.add('i18n-pending');setTimeout(()=>document.documentElement.classList.remove('i18n-pending'),3000);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
