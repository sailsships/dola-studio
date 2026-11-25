"""Bounded reference audio intake using the existing public-URL validation."""
import asyncio,base64,json,math,shutil,subprocess,tempfile,uuid
from pathlib import Path
from urllib.parse import urljoin
import aiohttp
import config
import media

MAX_COUNT=3
MAX_BYTES=20*1024*1024
MAX_SECONDS=90
MIMES={'audio/mpeg':'.mp3','audio/mp3':'.mp3','audio/wav':'.wav','audio/x-wav':'.wav',
       'audio/mp4':'.m4a','audio/x-m4a':'.m4a','audio/flac':'.flac','audio/ogg':'.ogg'}

def probe(path):
    try:
        result=subprocess.run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(path)],
                              capture_output=True,timeout=15,check=True)
        info=json.loads(result.stdout);streams=info.get('streams') or []
        duration=float((info.get('format') or {}).get('duration') or 0)
        if not any(s.get('codec_type')=='audio' for s in streams):raise ValueError('无音轨')
        if any(s.get('codec_type')=='video' and not s.get('disposition',{}).get('attached_pic') for s in streams):raise ValueError('包含视频')
        if not math.isfinite(duration) or not 0<duration<=MAX_SECONDS:raise ValueError('时长不符')
        return duration
    except Exception as exc:raise ValueError('参考音频无效或超过90秒；支持 MP3/WAV/M4A/FLAC/OGG') from exc

def decode(raw):
    header,payload=raw.split(',',1)
    mime=header[5:].split(';')[0].lower()
    if mime not in MIMES or ';base64' not in header:raise ValueError('参考音频格式不支持')
    if len(payload)>((MAX_BYTES+2)//3)*4:raise ValueError('参考音频每个最多20 MiB')
    try:data=base64.b64decode(payload,validate=True)
    except Exception as exc:raise ValueError('参考音频 base64 无效') from exc
    if not data or len(data)>MAX_BYTES:raise ValueError('参考音频每个最多20 MiB')
    return data,MIMES[mime]

async def validate(urls):
    if len(urls)>MAX_COUNT:raise ValueError('参考音频最多3个')
    out=[]
    for raw in urls:
        if not isinstance(raw,str):raise ValueError('参考音频 URL 无效')
        if raw.startswith('data:audio/'):decode(raw);url=raw
        else:url=await media._validate_url_async(raw)
        if url not in out:out.append(url)
    return out

def materialize(urls):
    root=Path(config.REFERENCE_FILE_DIR);root.mkdir(parents=True,exist_ok=True)
    out=[];created=[]
    try:
        for raw in urls:
            if not raw.startswith('data:audio/'):out.append(raw);continue
            data,suffix=decode(raw);path=root/('audio_'+uuid.uuid4().hex+suffix)
            created.append(path);path.write_bytes(data);probe(path);out.append(str(path))
        return out
    except BaseException:
        for p in created:p.unlink(missing_ok=True)
        raise

async def download(urls,task_id):
    urls=await validate(urls)
    if not urls:return None,[]
    root=Path(tempfile.mkdtemp(prefix='dola_audio_'));paths=[];total=0
    try:
        async with aiohttp.ClientSession() as session:
            for index,url in enumerate(urls):
                if media.is_local_reference(url):path=Path(url)
                elif url.startswith('data:audio/'):
                    data,suffix=decode(url);path=root/(f'audio_{index}'+suffix);path.write_bytes(data)
                else:
                    current=url
                    for _ in range(5):
                        current=await media._validate_url_async(current)
                        async with session.get(current,allow_redirects=False,proxy=config.PROXY or None,
                            timeout=aiohttp.ClientTimeout(total=config.REFERENCE_DOWNLOAD_TIMEOUT)) as response:
                            if 300<=response.status<400 and response.headers.get('Location'):
                                current=urljoin(current,response.headers['Location']);continue
                            if response.status!=200:raise ValueError(f'参考音频下载 HTTP {response.status}')
                            length=response.headers.get('Content-Length')
                            if length and int(length)>MAX_BYTES:raise ValueError('参考音频每个最多20 MiB')
                            chunks=[];size=0
                            async for chunk in response.content.iter_chunked(65536):
                                size+=len(chunk)
                                if size>MAX_BYTES:raise ValueError('参考音频每个最多20 MiB')
                                chunks.append(chunk)
                            suffix=MIMES.get(response.headers.get('Content-Type','').split(';')[0]) or Path(current.split('?')[0]).suffix.lower()
                            if suffix not in set(MIMES.values()):suffix='.mp3'
                            path=root/(f'audio_{index}'+suffix);path.write_bytes(b''.join(chunks));break
                    else:raise ValueError('参考音频重定向次数超限')
                if path.stat().st_size>MAX_BYTES:raise ValueError('参考音频每个最多20 MiB')
                total+=path.stat().st_size
                if total>config.REFERENCE_TOTAL_MAX_BYTES:raise ValueError('参考素材总量超过限制')
                await asyncio.to_thread(probe,path);paths.append(str(path))
        return root,paths
    except BaseException:shutil.rmtree(root,ignore_errors=True);raise

def audio_urls(raw):
    """Recognize audio fields and typed content blocks, without harvesting unrelated URLs."""
    result=[]
    def add(value):
        if isinstance(value,str) and value.strip():result.append(value.strip())
        elif isinstance(value,list):
            for child in value:add(child)
        elif isinstance(value,dict):
            if isinstance(value.get('data'),str):
                fmt=value.get('format','mp3');mime={'mp3':'mpeg','m4a':'mp4','wav':'wav','flac':'flac','ogg':'ogg'}.get(fmt)
                if mime:result.append('data:audio/'+mime+';base64,'+value['data'])
            else:add(value.get('url'))
    def walk(node):
        if isinstance(node,list):
            for child in node:walk(child)
        elif isinstance(node,dict):
            for key,value in node.items():
                if key in ('reference_audio','reference_audios','audio','audio_url','audio_urls','input_audio'):add(value)
                elif isinstance(value,(list,dict)):walk(value)
    walk(raw);return list(dict.fromkeys(result))
