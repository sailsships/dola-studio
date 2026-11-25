"""Opt-in, one-task generation evidence; never changes request handling."""
import asyncio
import contextvars
import hashlib
import json
import os
import re
import tempfile
import time
from pathlib import Path
from urllib.parse import urlsplit
from account_transport import redact_error

CURRENT=contextvars.ContextVar('generation_trace',default=None)
TRACE_ROOT=Path(os.environ.get('STUDIO_TRACE_DIR') or (Path(__file__).resolve().parent / 'work/generation-traces'))


def clean(value,depth=0):
    if depth>10:return '<depth limit>'
    if isinstance(value,dict):
        return {str(k):clean(v,depth+1) for k,v in list(value.items())[:150]
                if not re.search(r'cookie|token|authorization|password|secret|signature|credential',str(k),re.I)}
    if isinstance(value,list):return [clean(v,depth+1) for v in value[:100]]
    if isinstance(value,str):
        text=redact_error(value)
        return re.sub(r'https?://[^\s<>"\x27]+','<URL>',text)[:16000]
    if value is None or isinstance(value,(int,float,bool)):return value
    return type(value).__name__


class Trace:
    def __init__(self,task_id,account):
        self.root=TRACE_ROOT/task_id;self.root.mkdir(mode=0o700,parents=True,exist_ok=False)
        self.data={'task_id':task_id,'account':account,'started_at':time.time(),
                   'events':[],'screenshots':[],'completion_requests':0}
        self.tasks=set();self.context=None;self.page=None;self.closed=False;self.sequence=0
        self.save()
    def save(self):
        if self.closed:return
        tmp=self.root/'trace.tmp';tmp.write_text(json.dumps(self.data,ensure_ascii=False,indent=2));tmp.chmod(0o600);tmp.replace(self.root/'trace.json')
    def record(self,kind,**fields):
        try:
            self.sequence+=1
            self.data['events'].append({'sequence':self.sequence,'at':time.time(),'kind':kind,**clean(fields)})
            self.data['events']=self.data['events'][-800:];self.save()
        except Exception:pass
    async def shot(self,stage,page=None):
        page=page or self.page
        if page is None or self.closed:return
        try:
            label=re.sub(r'[^a-zA-Z0-9_-]','_',stage)[:65]
            name=f'{len(self.data["screenshots"])+1:02d}-{label}.jpg'
            await asyncio.wait_for(page.screenshot(path=str(self.root/name),type='jpeg',quality=70,timeout=6000),7)
            text=await asyncio.wait_for(page.evaluate("()=>document.body?.innerText||''"),3)
            self.data['screenshots'].append({'at':time.time(),'stage':stage,'file':name,'text':clean(text[-16000:])})
            self.record('screenshot',stage=stage,file=name)
        except Exception as exc:self.record('screenshot_unavailable',stage=stage,error_type=type(exc).__name__)
    def spawn(self,coro):
        t=asyncio.create_task(coro);self.tasks.add(t);t.add_done_callback(self.tasks.discard)
    def attach(self,context,page):
        if self.context is context:return
        self.context=context;self.page=page
        def request(req):
            if urlsplit(req.url).path.endswith('/chat/completion') and req.method=='POST':
                try:
                    body=json.loads(req.post_data or '{}');ability=body.get('chat_ability') or {};params=ability.get('ability_param') or {}
                    if isinstance(params,str):params=json.loads(params)
                    messages=body.get('messages') or []
                    self.data['completion_requests']+=1
                    self.record('completion_request_observed',ability_type=ability.get('ability_type'),
                        parameters={k:params.get(k) for k in ('model','duration','ratio')},
                        local_message_ids=[m.get('local_message_id') for m in messages],
                        conversation_id=(body.get('client_meta') or {}).get('conversation_id'),
                        body_sha256=hashlib.sha256((req.post_data or '').encode()).hexdigest())
                except Exception as exc:self.record('request_observation_error',error_type=type(exc).__name__)
        async def response(res):
            self.record('completion_http_response',status=res.status)
            try:
                raw=(await asyncio.wait_for(res.body(),180)).decode('utf-8',errors='replace')
                events=[]
                for line in raw.splitlines():
                    if not line.startswith('data:'):continue
                    data=line[5:].strip()
                    try:events.append(clean(json.loads(data)))
                    except ValueError:pass
                self.record('completion_stream_finished',status=res.status,events=events[-50:])
            except Exception as exc:self.record('completion_stream_unavailable',error_type=type(exc).__name__)
        def on_response(res):
            if urlsplit(res.url).path.endswith('/chat/completion'):self.spawn(response(res))
        def failed(req):
            if urlsplit(req.url).path.endswith('/chat/completion'):
                self.record('completion_request_failed',failure=req.failure)
        context.on('request',request);context.on('response',on_response);context.on('requestfailed',failed)
        page.on('framenavigated',lambda frame:self.record('main_frame_navigation',path=urlsplit(frame.url).path) if frame==page.main_frame else None)
    async def finish(self,row):
        if self.closed:return
        self.record('task_finished',task={k:row.get(k) for k in ('id','status','error','account','conversation_id','created_at','started_at','finished_at','upstream_note','recover_state','video_duration','video_width','video_height')},has_video_url=bool(row.get('video_url')))
        for task in tuple(self.tasks):task.cancel()
        if self.tasks:await asyncio.gather(*self.tasks,return_exceptions=True)
        self.data['finished_at']=time.time();self.save();self.closed=True


def begin(task_id,account):
    CURRENT.set(None)
    trace=None
    try:
        if not re.fullmatch(r'test_[a-f0-9]{32}',task_id) or not re.fullmatch(r'[a-zA-Z0-9_-]+',account):return None
        ticket=TRACE_ROOT/('arm-'+account+'.json')
        # Rename claims this one-use request, so a second concurrent task
        # cannot consume the same instrumentation ticket.
        claimed=TRACE_ROOT/('claimed-'+task_id+'.json')
        ticket.replace(claimed)
        try:settings=json.loads(claimed.read_text())
        finally:claimed.unlink(missing_ok=True)
        if time.time()>settings.get('expires_at',0):return None
        trace=Trace(task_id,account)
    except FileNotFoundError:pass
    except Exception:pass
    CURRENT.set(trace)
    return trace


async def checkpoint(stage,page,context=None):
    trace=CURRENT.get()
    if trace:
        try:
            if context is not None:trace.attach(context,page)
            await trace.shot(stage,page)
        except asyncio.CancelledError:raise
        except Exception:pass


def progress(text):
    trace=CURRENT.get()
    if trace:trace.record('progress',text=text)
