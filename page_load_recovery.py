"""Observe initial page loading and recover idle blank documents before sending."""
import asyncio
import re
import time
from urllib.parse import urlsplit
from generation_errors import PreSubmissionParametersError

IDLE_SECONDS = 30
POLL_SECONDS = 2
SNAPSHOT_JS = """()=>({
    text:document.body?.innerText||'',
    hasBody:!!document.body,
    htmlLength:document.documentElement?.outerHTML.length||0,
    ready:document.readyState,
    editor:[...document.querySelectorAll('textarea,[contenteditable="true"]')]
        .some(e=>{const r=e.getBoundingClientRect();const s=getComputedStyle(e);
            return !e.disabled&&r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';})
})"""

class BlankPageError(PreSubmissionParametersError):
    """A blank document made no progress after one passive reload."""


def _name(url):
    return urlsplit(url).path.rsplit('/', 1)[-1][:100] or 'document'


async def install_page_load_monitor(context, page):
    state = {'last_progress':time.monotonic(), 'received_bytes':0,
             'document_status':None, 'pending':{}, 'errors':[]}
    page._dola_load_state = state
    def started(req):
        if req.resource_type not in ('document','script','stylesheet'):return
        state['pending'][id(req)] = _name(req.url)
        if req.resource_type=='document':
            state['document_status']=None
            state['last_progress']=time.monotonic()
    def completed(req, failed=False):
        if id(req) not in state['pending']:return
        name=state['pending'].pop(id(req))
        if failed:state['errors']=(state['errors']+[name])[-5:]
        else:state['last_progress']=time.monotonic()
    def response(res):
        if res.request.resource_type=='document':state['document_status']=res.status
    page.on('request',started)
    page.on('requestfinished',completed)
    page.on('requestfailed',lambda req:completed(req,True))
    page.on('response',response)
    # Bytes already received count as progress even while the HTML parser is
    # blocked before <body>. CDP is optional; DOM/resource events remain usable.
    session=None
    try:
        session=await asyncio.wait_for(context.new_cdp_session(page),3)
        tracked=set()
        def request(event):
            if event.get('type') in ('Document','Script','Stylesheet'):
                tracked.add(event['requestId'])
        def data(event):
            if event.get('requestId') not in tracked:return
            size=event.get('dataLength',0)
            if size>0:
                state['received_bytes']+=size
                state['last_progress']=time.monotonic()
        def ended(event):tracked.discard(event.get('requestId'))
        session.on('Network.requestWillBeSent',request)
        session.on('Network.dataReceived',data)
        session.on('Network.loadingFinished',ended)
        session.on('Network.loadingFailed',ended)
        await asyncio.wait_for(session.send('Network.enable'),3)
        page._dola_load_cdp=session
    except asyncio.CancelledError:
        if session:
            try:await session.detach()
            except Exception:pass
        raise
    except Exception:
        if session:
            try:await session.detach()
            except Exception:pass
    return state


def _stats(page):
    monitor=getattr(page,'_dola_load_state',{})
    transport=getattr(getattr(page,'context',None),'_dola_stylesheet_stats',{})
    return monitor,transport


def loading_detail(context):
    stats=getattr(context,'_dola_stylesheet_stats',{})
    pending=stats.get('pending',{})
    size=stats.get('received_bytes',0)
    if not pending and not size:return ''
    return f'；页面资源待加载 {len(pending)} 项，已接收 {size/1024/1024:.1f} MB'


def failure_detail(page):
    monitor,transport=_stats(page)
    names=list(monitor.get('pending',{}).values())
    names += [v.get('name','resource') for v in transport.get('pending',{}).values()]
    names=list(dict.fromkeys(names))[:3]
    errors=list(dict.fromkeys(monitor.get('errors',[])+transport.get('errors',[])))[-3:]
    parts=[]
    if monitor.get('document_status') is not None:parts.append('主文档 HTTP '+str(monitor['document_status']))
    if names:parts.append('未完成资源：'+', '.join(names))
    if errors:parts.append('失败资源：'+', '.join(errors))
    return '；'+'；'.join(parts) if parts else ''


async def wait_for_composer(page, seconds=180):
    started=time.monotonic();deadline=started+seconds;last_progress=started
    reloaded=False;previous=None;last_state=None;last_sample_ok=True
    while time.monotonic()<deadline:
        try:
            state=await asyncio.wait_for(page.evaluate(SNAPSHOT_JS),
                timeout=min(5,max(.01,deadline-time.monotonic())))
        except asyncio.CancelledError:raise
        except Exception as exc:
            # An individual evaluation can time out while a large script is
            # executing. Keep observing within the same bounded preparation.
            message=str(exc).lower()
            if not isinstance(exc,TimeoutError) and not any(x in message for x in (
                'timeout','execution context was destroyed','cannot find context with specified id')):raise
            last_sample_ok=False
            await asyncio.sleep(min(POLL_SECONDS,max(0,deadline-time.monotonic())))
            continue
        now=time.monotonic();last_sample_ok=True;last_state=state
        if state['editor']:return
        signature=(state.get('htmlLength'),state.get('hasBody'),state.get('ready'),state['text'][:300])
        if previous is not None and signature!=previous:last_progress=now
        previous=signature
        monitor,transport=_stats(page)
        last_progress=max(last_progress,monitor.get('last_progress',started),transport.get('last_progress',started))
        unavailable=bool(re.search(r'このページは一時的に利用できません|temporarily unavailable',state['text'],re.I))
        blank=not state['text'].strip()
        idle=now-last_progress>=IDLE_SECONDS
        if unavailable and reloaded:
            raise PreSubmissionParametersError('上游页面暂时不可用，刷新一次仍未恢复，未提交生成'+failure_detail(page))
        if (blank and idle or unavailable) and not reloaded:
            await page.reload(wait_until='commit',timeout=min(30000,max(1,int((deadline-now)*1000))))
            reloaded=True;last_progress=time.monotonic();previous=None
            continue
        if blank and idle and reloaded:
            raise BlankPageError('页面白屏且资源加载持续无进展，刷新一次后仍未恢复，未提交生成'+failure_detail(page))
        await asyncio.sleep(min(POLL_SECONDS,max(0,deadline-time.monotonic())))
    if last_sample_ok and last_state and not last_state['text'].strip():
        raise BlankPageError('页面加载已达等待上限，仍无正文或输入框，未提交生成'+failure_detail(page))
    raise PreSubmissionParametersError('输入框未及时加载，未提交生成'+failure_detail(page))
