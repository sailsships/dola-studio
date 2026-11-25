"""Dismiss the small Dola cookie notice through its own OK control."""
from urllib.parse import urlsplit
from google_controls import scan_timeout

FIND_OK = r'''()=>{
 const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&!e.disabled;};
 for(const b of document.querySelectorAll('button,[role="button"],input[type="button"],input[type="submit"]')){
  if(!visible(b)||!/^ok$/i.test((b.innerText||b.value||b.getAttribute('aria-label')||'').trim()))continue;
  for(let e=b.parentElement,n=0;e&&n<6&&e!==document.body;e=e.parentElement,n++){
   const r=e.getBoundingClientRect(),text=(e.innerText||'').trim();
   if(r.width>560||r.height>650||text.length>1600)break;
   if(visible(e)&&/cookie|クッキー|쿠키/i.test(text)&&/Dola/i.test(text)
      &&/service|サービス|提供|服务|服務|서비스/i.test(text))return b;
  }
 }
 return null;
}'''

@scan_timeout(3,lambda:False)
async def dismiss_cookie_notice(page):
    p=urlsplit(page.url)
    if p.scheme!='https' or p.hostname not in ('www.dola.com','dola.com'):return False
    handle=None
    try:
        handle=await page.evaluate_handle(FIND_OK)
        button=handle.as_element()
        if button is None:return False
        await button.click(timeout=1500)
        print('[login] 已点击 Cookie 提示的 OK，继续当前流程',flush=True)
        return True
    finally:
        if handle:
            try:await handle.dispose()
            except Exception:pass
