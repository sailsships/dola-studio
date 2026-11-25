"""Close Dola's desktop promotion by its own upper-right close control."""
FIND_CLOSE_JS = r'''()=>{
 const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
 const desktop=/desktop|デスクトップ|桌面|데스크톱|데스크탑/i;
 const features=/all\s+(?:the\s+)?features|すべての機能|所有功能|全部功能|모든\s*기능/i;
 const seeds=[...document.querySelectorAll('h1,h2,h3,p,span,div')].filter(e=>{
  if(e.children.length>3)return false;
  const t=(e.textContent||'').trim();return t.length<300&&desktop.test(t)&&features.test(t)&&visible(e);
 });
 for(const seed of seeds){
  let root=seed;
  for(let depth=0;root&&depth<9;depth++,root=root.parentElement){
   if(root===document.body||root===document.documentElement)break;
   const r=root.getBoundingClientRect(),text=root.innerText||'';
   if(r.width<250||r.height<150||text.length>4000||!desktop.test(text)||!features.test(text))continue;
   const controls=[...root.querySelectorAll('button,[role="button"],[aria-label*="close" i],[data-testid*="close" i],svg')];
   for(const raw of controls){
    let e=raw.matches('svg')?raw.closest('button,[role="button"]')||raw.parentElement:raw;
    if(!e||!root.contains(e)||!visible(e))continue;
    let b=e.getBoundingClientRect();
    if(b.width>72||b.height>72||b.width<10||b.height<10)continue;
    const x=b.x+b.width/2,y=b.y+b.height/2;
    if(x<r.right-Math.min(110,r.width*.3)||y>r.top+Math.min(100,r.height*.3)||y<r.top||x>r.right)continue;
    const label=(e.getAttribute('aria-label')||e.getAttribute('title')||e.innerText||'').trim();
    if(/download|ダウンロード|入手|下载|설치/i.test(label))continue;
    if(label&&!/^(?:x|×|✕|close|dismiss|关闭|關閉|閉じる|닫기)$/i.test(label))continue;
    if(!label&&!e.querySelector('svg')&&!/close/i.test(e.getAttribute('data-testid')||''))continue;
    const hit=document.elementFromPoint(x,y);
    if(hit&&(e===hit||e.contains(hit)))return e;
   }
  }
 }
 return null;
}'''


async def dismiss_desktop_promo(page):
    """Return true only after a matching promotion close control becomes hidden."""
    handle=None
    try:
        handle=await page.evaluate_handle(FIND_CLOSE_JS)
        button=handle.as_element()
        if button is None:return False
        await button.click(timeout=1500)
        await button.wait_for_element_state('hidden',timeout=1500)
        return True
    except Exception:
        # Navigation or a disappearing ad must not break generation polling.
        return False
    finally:
        if handle:
            try:await handle.dispose()
            except Exception:pass
