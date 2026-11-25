/* Reconcile server snapshots without replacing interactive rows or unchanged cells. */
window.ConsoleSync=(()=>{
 'use strict';
 const snapshots=new WeakMap(),attributes=new WeakMap(),roots=new WeakMap();
 const icon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
 const source=n=>n.nodeType===1?n.outerHTML:n.nodeValue;
 const key=n=>n.nodeType===1&&n.hasAttribute('data-row-key')?n.tagName+':'+n.getAttribute('data-row-key'):null;
 const compatible=(a,b)=>a&&a.nodeType===b.nodeType&&(a.nodeType!==1||a.tagName===b.tagName);
 function remember(node){snapshots.set(node,source(node));if(node.nodeType===1)attributes.set(node,new Map([...node.attributes].map(a=>[a.name,a.value])));for(const child of node.childNodes)remember(child);return node;}
 function patch(old,next){
  const signature=source(next);
  if(snapshots.get(old)===signature)return;
  if(old.nodeType!==1){if(old.nodeValue!==next.nodeValue)old.nodeValue=next.nodeValue;snapshots.set(old,signature);return;}
  const was=attributes.get(old);
  // "open" and popup positioning belong to the person using the screen.
  const userAttribute=name=>(old.tagName==='DETAILS'&&name==='open')||(old.matches('.row-tools')&&name==='style');
  for(const attr of [...old.attributes]){
   if(!next.hasAttribute(attr.name)&&!userAttribute(attr.name)&&(!was||was.has(attr.name)))old.removeAttribute(attr.name);
  }
  for(const attr of next.attributes){if(!userAttribute(attr.name)&&old.getAttribute(attr.name)!==attr.value)old.setAttribute(attr.name,attr.value);}
  if(old.matches('input[type=checkbox],input[type=radio]')&&(!was||was.has('checked')!==next.hasAttribute('checked')))old.checked=next.hasAttribute('checked');
  children(old,next);
  snapshots.set(old,signature);attributes.set(old,new Map([...next.attributes].map(a=>[a.name,a.value])));
 }
 function children(old,next){
  const original=[...old.childNodes],keyed=new Map(original.filter(key).map(n=>[key(n),n])),used=new Set();
  let index=0;
  for(const desired of next.childNodes){
   const id=key(desired);let node=id?keyed.get(id):old.childNodes[index];
   if(!id&&(!compatible(node,desired)||key(node)||used.has(node)||node.nodeType===1&&node.hasAttribute('data-ui-persist')))node=original.find(n=>!used.has(n)&&!key(n)&&compatible(n,desired)&&!(n.nodeType===1&&n.hasAttribute('data-ui-persist')));
   if(!node||!compatible(node,desired))node=remember(desired.cloneNode(true));else patch(node,desired);
   used.add(node);if(old.childNodes[index]!==node)old.insertBefore(node,old.childNodes[index]||null);index++;
  }
  for(const node of [...old.childNodes])if(!used.has(node)&&!(node.nodeType===1&&node.hasAttribute('data-ui-persist')))node.remove();
 }
 function html(target,markup){
  const root=typeof target==='string'?document.querySelector(target):target;if(!root)return false;
  markup=String(markup);if(roots.get(root)===markup)return false;
  const template=document.createElement('template');template.innerHTML=markup;
  children(root,template.content);roots.set(root,markup);return true;
 }
 function closeControl(button){button.className='dialog-close';button.type='button';button.setAttribute('aria-label','关闭窗口');button.setAttribute('title','关闭');button.innerHTML=icon;return button;}
 function prepareDialog(box,fallback){
  if(!box)return;
  let close=box.querySelector('.dialog-close');
  if(!close){
   close=[...box.querySelectorAll('button')].find(b=>['取消','关闭','关闭窗口，后台继续'].includes(b.textContent.trim())&&/(hide\(|closeVideo\(|closeUpdate\()/ .test(b.getAttribute('onclick')||''));
   if(!close){close=document.createElement('button');close.addEventListener('click',fallback);box.prepend(close);}
  }
  closeControl(close);
  for(const row of box.querySelectorAll('.row'))row.classList.toggle('close-only',row.children.length===1&&row.firstElementChild===close);
  box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');
  const heading=box.querySelector('h2,h3');if(heading)box.setAttribute('aria-label',heading.textContent.trim());
 }
 return Object.freeze({html,closeControl,prepareDialog,icon});
})();
function setHTML(target,markup){return window.ConsoleSync.html(target,markup);}
