/* Shared product copy. Apply to system messages, never to prompts or account data. */
(function(){
  'use strict';
  const name='Dola Studio';
  function text(value){return String(value??'').replace(/\bdola[-_]pool(?:[-_]updater)?\b/gi,name);}
  function markup(html){
    const template=document.createElement('template');template.innerHTML=html;
    const nodes=document.createTreeWalker(template.content,NodeFilter.SHOW_TEXT);
    while(nodes.nextNode())nodes.currentNode.nodeValue=text(nodes.currentNode.nodeValue);
    return template.innerHTML;
  }
  window.StudioBrand=Object.freeze({name,text,markup});
})();
