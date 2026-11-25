"""Confirm a native send click and observe dispatch without resending ambiguity."""
import asyncio
import time
import uuid
from urllib.parse import urlsplit

from composer_input import verify_composer
from desktop_promo import dismiss_desktop_promo

INSTALL_JS = r'''key=>{
 const state={clicks:0,target:null};
 const handler=e=>{
  const button=e.composedPath().find(n=>n?.matches?.('[data-testid="chat_input_send_button"],#flow-end-msg-send'));
  if(button){state.clicks++;state.target=button.getAttribute('data-testid')||button.id;}
 };
 document.addEventListener('click',handler,true);
 window[key]={state,handler};
}'''
READ_JS = r'''key=>window[key]?.state||null'''
CLEAN_JS = r'''key=>{const s=window[key];if(s)document.removeEventListener('click',s.handler,true);delete window[key];}'''
READY_JS = r'''e=>{
 const r=e.getBoundingClientRect(),s=getComputedStyle(e);
 const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
 return {ready:r.width>0&&r.height>0&&!e.disabled&&e.getAttribute('aria-disabled')!=='true'
   &&s.pointerEvents!=='none'&&!!hit&&(e===hit||e.contains(hit)),
   x:r.x,y:r.y,w:r.width,h:r.height};
}'''


async def click_send_and_confirm(page,button,editor,text,*,progress=None,record=None,seconds=90):
    """Retry only a click that never reached the send element, never a delivered click."""
    key='__dolaSend_'+uuid.uuid4().hex
    dispatched=asyncio.Event()
    def report(kind,**fields):
        if record:record(kind,**fields)
    def note(value):
        if progress:progress(value)
    def observe(req):
        if req.method=='POST' and urlsplit(req.url).path.rstrip('/').endswith('/chat/completion'):
            dispatched.set()
    page.context.on('request',observe)
    await page.evaluate(INSTALL_JS,key)
    deadline=time.monotonic()+seconds
    try:
        for attempt in range(2):
            # A filled composer can change the button's position. Wait for its
            # current box and hit target to settle, including after rerenders.
            stable=None;stable_at=None
            while time.monotonic()<deadline:
                if dispatched.is_set():return 'request_observed'
                if await dismiss_desktop_promo(page):report('desktop_promotion_closed',phase='before_send')
                if await button.count()==1:
                    state=await button.evaluate(READY_JS)
                    box=tuple(round(state[k],1) for k in ('x','y','w','h'))
                    if state['ready']:
                        if box!=stable:stable=box;stable_at=time.monotonic()
                        elif time.monotonic()-stable_at>=.6:break
                    else:stable=stable_at=None
                await asyncio.sleep(.2)
            else:raise TimeoutError('发送按钮位置或可点击状态未稳定，未确认发送')
            await verify_composer(editor,text)
            click_error=None
            try:await button.click(timeout=min(20000,max(1,int((deadline-time.monotonic())*1000))))
            except Exception as exc:click_error=exc
            await asyncio.sleep(.3)
            state=await page.evaluate(READ_JS,key)
            report('send_click_checked',attempt=attempt+1,click_received=bool(state and state['clicks']),
                   request_observed=dispatched.is_set(),click_error_type=type(click_error).__name__ if click_error else None)
            if dispatched.is_set():
                note('已观察到原生生成请求，等待上游会话确认')
                return 'request_observed'
            if not state or state['clicks']:
                # Missing instrumentation is ambiguous too. Do not repair a
                # draft or click again once the page received a send intent.
                note('已点击发送，等待原生请求确认，不重复点击')
                break
            if click_error:raise click_error
            if attempt==0:
                await verify_composer(editor,text)
                note('发送点击未命中按钮，保留完整输入并重新定位一次')
            else:raise TimeoutError('两次定位点击均未确认命中发送按钮，提交状态待核对')
        while not dispatched.is_set() and time.monotonic()<deadline:
            if await dismiss_desktop_promo(page):report('desktop_promotion_closed',phase='await_dispatch')
            try:await asyncio.wait_for(dispatched.wait(),min(1,max(.01,deadline-time.monotonic())))
            except TimeoutError:pass
        if not dispatched.is_set():
            report('send_dispatch_unconfirmed',click_received=bool(state and state['clicks']))
            raise TimeoutError('发送已点击，但未观察到原生生成请求；提交状态待核对，不重复发送') from None
        note('已观察到原生生成请求，等待上游会话确认')
        return 'request_observed'
    finally:
        page.context.remove_listener('request',observe)
        try:await page.evaluate(CLEAN_JS,key)
        except Exception:pass
