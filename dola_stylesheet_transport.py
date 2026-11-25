"""Load immutable Dola CSS/JS through the account's proxy when Chromium asset downloads stall."""
import asyncio
import base64,hashlib,json,os,re,tempfile,time,threading
from pathlib import Path
from functools import lru_cache,partial
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlsplit
import requests

CSS_HOST='sf-flow-web-cdn.ciciai.com'
CSS_PREFIX='/obj/ocean-flow-web-sg/dola_web/static/css/'
CSS_PATTERN='https://'+CSS_HOST+CSS_PREFIX+'**'
JS_PREFIX='/obj/ocean-flow-web-sg/dola_web/static/js/'
ASSET_PATTERN=re.compile(r'^https://sf-flow-web-cdn\.ciciai\.com/obj/ocean-flow-web-sg/dola_web/static/(?:css/[^?#]+\.css|js/[^?#]+\.[a-f0-9]{8,}\.js)$')
MAX_BYTES=24*1024*1024
DROP_REQUEST={'host','content-length','connection','accept-encoding','cookie','authorization','proxy-authorization'}
DROP_RESPONSE={'content-encoding','content-length','transfer-encoding','connection','set-cookie','proxy-authenticate'}

def stylesheet_url(url):
    p=urlsplit(url)
    return bool(ASSET_PATTERN.fullmatch(url))

DOWNLOAD_SECONDS=50
_SESSION_LOCAL=threading.local()


def asset_client(proxy):
    # One session per worker thread; retain the proxy tunnel/TLS connection
    # between the hundreds of public chunk requests from the same route.
    previous=getattr(_SESSION_LOCAL,'pair',None)
    if previous is None or previous[0]!=proxy:
        if previous is not None:previous[1].close()
        session=requests.Session();session.trust_env=False
        _SESSION_LOCAL.pair=(proxy,session)
    else:session=previous[1]
    # Public CDN requests never inherit account or CDN cookies.
    session.cookies.clear()
    return session


def priority_asset(url):
    path=urlsplit(url).path
    if '/async/' not in path:return True
    return bool(re.search(r'(?:input|submit|mode-select|video|chat-view|business-layout)',path,re.I))

class AssetDownloadCancelled(RuntimeError):pass


def check_download(deadline,cancel):
    if cancel is not None and cancel.is_set():raise AssetDownloadCancelled('Static asset load cancelled')
    if time.monotonic()>=deadline:raise requests.Timeout('Static asset total download deadline exceeded')


def _fetch_stylesheet_once(url,headers,proxy,*,deadline=None,cancel=None,on_progress=None):
    if not proxy or not stylesheet_url(url):raise ValueError('Invalid stylesheet route')
    deadline=deadline or time.monotonic()+DOWNLOAD_SECONDS
    check_download(deadline,cancel)
    client=asset_client(proxy)
    headers={k:v for k,v in headers.items() if k.lower() not in DROP_REQUEST}
    with client.get(url,headers=headers,proxies={'http':proxy,'https':proxy},
                    timeout=(max(.05,min(8,deadline-time.monotonic())),max(.05,min(6,deadline-time.monotonic()))),allow_redirects=False,stream=True) as response:
        if 300<=response.status_code<400:raise RuntimeError('Static asset redirected')
        body=bytearray()
        def chunks():
            # read1 returns currently available bytes instead of waiting for
            # a full 16 KiB. That lets the wall-clock deadline stop a server
            # that trickles data just before each socket read timeout.
            if hasattr(response.raw,'read1'):
                while True:
                    check_download(deadline,cancel)
                    chunk=response.raw.read1(16384,decode_content=True)
                    if not chunk:break
                    yield chunk
            else:
                yield from response.iter_content(16384)
        for chunk in chunks():
            check_download(deadline,cancel)
            body.extend(chunk)
            if on_progress and chunk:on_progress(len(chunk))
            if len(body)>MAX_BYTES:raise RuntimeError('Static asset exceeded size limit')
        check_download(deadline,cancel)
        return response.status_code,{k:v for k,v in response.headers.items() if k.lower() not in DROP_RESPONSE},bytes(body)

CACHE_SECONDS=7*24*3600
MAX_CACHE_FILES=1024
MAX_CACHE_BYTES=256*1024*1024

def cache_path(url):
    # Only content-hashed public CSS/JS is reusable between account contexts.
    p=urlsplit(url)
    if p.query or p.fragment or not re.search(r'\.[a-f0-9]{8,}\.(?:css|js)$',p.path):return None
    import config
    root=Path(config.POOL_DB_PATH).resolve().parent/'.stylesheet-cache'
    return root/(hashlib.sha256(url.encode()).hexdigest()+'.json')

@lru_cache(maxsize=256)
def asset_lock(url):return threading.Lock()

def read_cache(path):
    if path is None:return None
    try:
        if not 0<=time.time()-path.stat().st_mtime<CACHE_SECONDS:return None
        data=json.loads(path.read_text())
        if data['status']!=200 or len(data['body'])>MAX_BYTES*2:return None
        body=base64.b64decode(data['body'],validate=True)
        if len(body)>MAX_BYTES or hashlib.sha256(body).hexdigest()!=data['sha256']:return None
        return 200,data['headers'],body
    except (OSError,ValueError,KeyError,TypeError):return None

def write_cache(path,result):
    status,headers,body=result
    if path is None or status!=200:return
    mime=next((v.lower().split(';')[0].strip() for k,v in headers.items() if k.lower()=='content-type'),'')
    if mime not in ('text/css','text/javascript','application/javascript'):return
    cc=next((v.lower() for k,v in headers.items() if k.lower()=='cache-control'),'')
    if 'private' in cc or 'no-store' in cc:return
    temp=None
    try:
        path.parent.mkdir(mode=0o700,exist_ok=True)
        # Keep only public response headers useful for a static asset response.
        saved={k:v for k,v in headers.items() if k.lower() in ('content-type','access-control-allow-origin','cross-origin-resource-policy','vary')}
        fd,temp=tempfile.mkstemp(prefix='.css-',dir=path.parent)
        with os.fdopen(fd,'w') as f:
            json.dump({'status':200,'headers':saved,'sha256':hashlib.sha256(body).hexdigest(),'body':base64.b64encode(body).decode()},f)
        os.replace(temp,path);temp=None
        files=sorted(path.parent.glob('*.json'),key=lambda p:p.stat().st_mtime,reverse=True)
        size=0
        for i,p in enumerate(files):
            size+=p.stat().st_size
            if i>=MAX_CACHE_FILES or size>MAX_CACHE_BYTES:p.unlink(missing_ok=True)
    except OSError:pass
    finally:
        if temp:
            try:os.unlink(temp)
            except OSError:pass

def fetch_stylesheet(url,headers,proxy,*,cancel=None,on_progress=None,deadline=None):
    if not proxy or not stylesheet_url(url):raise ValueError('Invalid stylesheet route')
    deadline=deadline or time.monotonic()+DOWNLOAD_SECONDS
    lock=asset_lock(url);acquired=False
    try:
        while not acquired:
            check_download(deadline,cancel)
            acquired=lock.acquire(timeout=min(.2,max(.01,deadline-time.monotonic())))
        check_download(deadline,cancel)
        path=cache_path(url);cached=read_cache(path)
        if cached:return cached
        for attempt in range(3):
            check_download(deadline,cancel)
            try:
                result=_fetch_stylesheet_once(url,headers,proxy,deadline=deadline,
                    cancel=cancel,on_progress=on_progress)
                if result[0] in (408,429) or result[0]>=500:
                    raise requests.HTTPError('Static asset HTTP '+str(result[0]))
                if result[0]!=200:raise RuntimeError('Static asset HTTP '+str(result[0]))
                check_download(deadline,cancel)
                write_cache(path,result)
                return result
            except requests.RequestException as exc:
                print('[static-asset] '+urlsplit(url).path.rsplit('/',1)[-1]+
                      ' attempt '+str(attempt+1)+'/3 '+type(exc).__name__,flush=True)
                if attempt==2:raise
                check_download(deadline,cancel)
                pause=min(.5*(attempt+1),max(0,deadline-time.monotonic()))
                if cancel is not None:cancel.wait(pause)
                else:time.sleep(pause)
    finally:
        if acquired:lock.release()


async def install_stylesheet_transport(context,proxy,*,completion_open_timeout=False):
    if not proxy:raise ValueError('Static asset transport requires account proxy')
    slots=asyncio.Semaphore(6)
    priority_slots=asyncio.Semaphore(2)
    priority_pool=ThreadPoolExecutor(max_workers=2,thread_name_prefix="dola-assets-critical")
    loop=asyncio.get_running_loop()
    stats={'requested':0,'loaded':0,'failed':0,'errors':[],
           'pending':{},'received_bytes':0,'last_progress':time.monotonic()}
    context._dola_stylesheet_stats=stats
    cancellations=set();active_tasks=set()
    def closed(*args):
        for event in tuple(cancellations):event.set()
        for task in tuple(active_tasks):task.cancel()
        priority_pool.shutdown(wait=False,cancel_futures=True)
    context.on('close',closed)
    async def relay(route):
        req=route.request
        if req.method!='GET' or not stylesheet_url(req.url):
            await route.continue_();return
        name=urlsplit(req.url).path.rsplit('/',1)[-1]
        key=id(route);cancel=threading.Event();cancellations.add(cancel)
        task=asyncio.current_task();active_tasks.add(task)
        stats['requested']+=1
        stats['pending'][key]={'name':name,'started':time.monotonic(),'bytes':0}
        def received(size):
            def update():
                if cancel.is_set():return
                stats['received_bytes']+=size
                stats['last_progress']=time.monotonic()
                if key in stats['pending']:stats['pending'][key]['bytes']+=size
            try:loop.call_soon_threadsafe(update)
            except RuntimeError:pass
        async def fetch():
            headers=await asyncio.wait_for(req.all_headers(),5)
            # The download budget starts after obtaining a slot. Hundreds of
            # small chunks may legitimately wait; queueing is not CDN failure.
            async with (priority_slots if priority_asset(req.url) else slots):
                action=partial(fetch_stylesheet,req.url,headers,proxy,
                    cancel=cancel,on_progress=received,
                    deadline=time.monotonic()+DOWNLOAD_SECONDS)
                pending=(loop.run_in_executor(priority_pool,action) if priority_asset(req.url)
                         else asyncio.to_thread(action))
                return await asyncio.wait_for(pending,DOWNLOAD_SECONDS+2)
        try:
            status,response_headers,body=await fetch()
            if cancel.is_set():raise AssetDownloadCancelled('Browser context closed')
            if completion_open_timeout and status==200 and urlsplit(req.url).path.endswith('.js'):
                from completion_timeout import extend_completion_open_timeout
                body,count=extend_completion_open_timeout(body)
                if count:
                    stats['completion_open_timeout_ms']=60000
                    stats['completion_timeout_patches']=stats.get('completion_timeout_patches',0)+count
                    stats.setdefault('completion_timeout_assets',[]).append(name)
                    # Validators and integrity digests refer to the original bytes.
                    response_headers={k:v for k,v in response_headers.items()
                        if k.lower() not in ('etag','content-md5','digest','content-digest','content-length')}
            await route.fulfill(status=status,headers=response_headers,body=body)
            counted=stats['pending'].get(key,{}).get('bytes',0)
            stats['received_bytes']+=max(0,len(body)-counted)
            stats['loaded']+=1;stats['last_progress']=time.monotonic()
        except asyncio.CancelledError:raise
        except AssetDownloadCancelled:
            try:await route.abort()
            except Exception:pass
        except Exception as exc:
            stats['failed']+=1
            stats['errors']=(stats['errors']+[name+': '+type(exc).__name__])[-4:]
            print('[static-asset] failed '+stats['errors'][-1],flush=True)
            try:await route.abort()
            except Exception:pass
        finally:
            cancel.set();cancellations.discard(cancel);active_tasks.discard(task);stats['pending'].pop(key,None)
    await context.route(ASSET_PATTERN,relay)
