"""Use the shared immutable asset transport and retain bounded login evidence."""
import asyncio,json,time
from pathlib import Path
from urllib.parse import urlsplit

async def install_login_assets(context,account):
    from account_transport import http_proxy
    from dola_stylesheet_transport import install_stylesheet_transport
    root=Path('accounts')/account/'login_diagnostics'/str(time.time_ns())
    root.mkdir(parents=True,exist_ok=True,mode=0o700)
    context._login_evidence_root=root
    context._login_resource_failures=[]
    def failed(request):
        if request.resource_type not in ('script','stylesheet'):return
        p=urlsplit(request.url)
        context._login_resource_failures.append({'host':p.hostname,'path':p.path,'reason':str(request.failure)[:100]})
        context._login_resource_failures=context._login_resource_failures[-12:]
    context.on('requestfailed',failed)
    await install_stylesheet_transport(context,http_proxy(account))

async def checkpoint_login(context,stage):
    try:
        root=getattr(context,'_login_evidence_root',None)
        if not root:return
        out={'at':time.time(),'stage':stage,'pages':[],
             'resource_failures':getattr(context,'_login_resource_failures',[])}
        stats=getattr(context,'_dola_stylesheet_stats',{})
        out['assets']={k:stats.get(k) for k in ('requested','loaded','failed','errors','received_bytes')}
        for i,page in enumerate(list(context.pages)[:3]):
            if page.is_closed():continue
            p=urlsplit(page.url);item={'host':p.hostname,'path':p.path}
            try:
                item['surface']=await asyncio.wait_for(page.evaluate('''()=>({ready:document.readyState,
                    bodyTextLength:(document.body?.innerText||'').length,
                    inputs:[...document.querySelectorAll('input')].map(e=>({type:e.type,name:e.name,id:e.id})),
                    buttons:[...document.querySelectorAll('button,[role=button]')].filter(e=>e.getBoundingClientRect().width>0).length})'''),3)
                await page.screenshot(path=str(root/(stage+'-'+str(i)+'.jpg')),type='jpeg',quality=75,timeout=3000)
            except Exception as exc:item['inspection_error']=type(exc).__name__
            out['pages'].append(item)
        (root/(stage+'.json')).write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
        print('[login-assets] '+stage+' loaded='+str(stats.get('loaded',0))+' failed='+str(stats.get('failed',0)),flush=True)
    except Exception:pass
