"""Recover passive browser preparation without replaying a generation request."""
import asyncio
import re
import shutil
import tempfile
import time
from pathlib import Path

from patchright.async_api import Error as BrowserError, TimeoutError as BrowserTimeout
from playwright.async_api import Error as CloakError, TimeoutError as CloakTimeout
from generation_errors import PreSubmissionParametersError
from account_transport import redact_error
from dola_stylesheet_transport import install_stylesheet_transport
from page_load_recovery import BlankPageError,install_page_load_monitor,loading_detail
from proxy_navigation import await_proxy_thread, wait_for_account_proxy, _discard

PREPARATION_ATTEMPTS = 3
BROWSER_PREPARE_SECONDS = 300
HEARTBEAT_SECONDS = 5


def short_reason(exc):
    message=redact_error(str(exc)).strip().splitlines()
    message=message[0] if message else type(exc).__name__
    message=re.sub(r'https?://\S+','<URL>',message)
    return type(exc).__name__+': '+message[:240]


def retryable(exc):
    if isinstance(exc,BlankPageError):return True
    if isinstance(exc,PreSubmissionParametersError):
        return any(text in str(exc) for text in ('输入框未及时加载','上游页面暂时不可用'))
    if isinstance(exc,(BrowserTimeout,CloakTimeout,TimeoutError)):return True
    return isinstance(exc,(BrowserError,CloakError)) and any(word in str(exc) for word in (
        'net::ERR_','Target page, context or browser has been closed',
        'Target closed','Browser closed','browser has disconnected'))


async def close_context(context):
    if context is None:return True
    try:
        await asyncio.wait_for(context.close(),15)
        return True
    except Exception:
        # Do not start another browser if its predecessor may still be running.
        return False


async def prepare_browser(account, *, progress, copy_session, launch_browser,
                          playwright_factory, wait_composer, bridge_path):
    phase='代理预检';context=None;profile=None;route=None
    async def blocked(route):
        await route.abort()

    checked=await wait_for_account_proxy(account,on_progress=progress)
    if not checked.get('ok'):
        raise PreSubmissionParametersError('代理预检失败：'+redact_error(checked.get('detail') or '连接未确认')[:700]+'；首条请求未发送')
    route=checked.get('proxy_url')
    deadline=time.monotonic()+BROWSER_PREPARE_SECONDS

    async def step(label,action,seconds):
        nonlocal phase
        phase=label
        remaining=deadline-time.monotonic()
        if remaining<=0:raise TimeoutError('准备阶段累计等待已满 300 秒')
        progress(f'{label}（本步最多 {int(min(seconds,remaining))} 秒）')
        from account_environment import ENVIRONMENT_PROGRESS
        token=ENVIRONMENT_PROGRESS.set(progress)
        try:
            task=asyncio.create_task(action())
        finally:
            ENVIRONMENT_PROGRESS.reset(token)
        started=time.monotonic()
        try:
            while True:
                left=min(seconds-(time.monotonic()-started),deadline-time.monotonic())
                if left<=0:raise TimeoutError(f'{label}等待超时')
                done,_=await asyncio.wait({task},timeout=min(HEARTBEAT_SECONDS,left))
                if task in done:return await task
                progress(f'{label}（已等待 {int(time.monotonic()-started)} 秒，正在继续）'+(loading_detail(context) if context else ''))
        finally:
            if not task.done():task.cancel()
            await asyncio.gather(task,return_exceptions=True)

    for attempt in range(1,PREPARATION_ATTEMPTS+1):
        profile=tempfile.mkdtemp(prefix='dola-force15-')
        try:
            async def copy():
                async with playwright_factory() as p:return await copy_session(p,account)
            cookies=await step('读取账号登录态',copy,BROWSER_PREPARE_SECONDS)
            # Assign inside the task so cancellation after a successful launch
            # still leaves its context available for cleanup.
            async def launch():
                nonlocal context
                context=await launch_browser(account,profile)
            await step('启动独立浏览器',launch,BROWSER_PREPARE_SECONDS)
            # A collision may have selected a new route during cookie reading or launch.
            # Static resources must follow the same route as the resulting browser.
            from account_transport import account_proxy_url
            route=account_proxy_url(account,begin_usage=False)
            async def initialise():
                await context.route(re.compile(r'chat/completion|logout',re.I),blocked)
                await install_stylesheet_transport(context,route,completion_open_timeout=True)
                await context.add_cookies(cookies)
                await context.add_init_script(Path(bridge_path).read_text(encoding='utf-8'))
                page=context.pages[0] if context.pages else await context.new_page()
                await install_page_load_monitor(context,page)
                return page
            page=await step('恢复登录态与安装提交拦截',initialise,30)
            await step('加载 Dola 空白会话',lambda:page.goto('https://www.dola.com/chat/',wait_until='commit',timeout=90000),90)
            await step('等待输入框加载',lambda:wait_composer(page),180)
            progress('浏览器准备完成，尚未提交生成')
            return context,page,profile,blocked
        except BaseException as exc:
            context_for_diagnostics=context
            closed=await close_context(context)
            context=None
            if closed:shutil.rmtree(profile,ignore_errors=True)
            if isinstance(exc,asyncio.CancelledError):raise
            if not isinstance(exc,Exception):raise
            reason=short_reason(exc)
            stats=getattr(context_for_diagnostics,'_dola_stylesheet_stats',{})
            if stats:
                print('[preparation] '+account+' '+phase+' static_assets='+str(stats),flush=True)
                if stats.get('failed'):
                    reason+='；静态资源加载失败：'+'；'.join(stats.get('errors',[]))

            if not closed:
                raise PreSubmissionParametersError(f'{phase}失败：{reason}；旧浏览器未确认关闭，已停止重试；首条请求未发送') from exc
            if not retryable(exc) or attempt>=PREPARATION_ATTEMPTS or time.monotonic()>=deadline:
                raise PreSubmissionParametersError(f'{phase}失败（准备尝试 {attempt}/{PREPARATION_ATTEMPTS}）：{reason}；首条请求未发送') from exc
            progress(f'{phase}暂时失败：{reason}；旧浏览器已清理，自动恢复 {attempt}/{PREPARATION_ATTEMPTS-1}')
            if isinstance(exc,BlankPageError) or any(code in str(exc) for code in ('ERR_PROXY_CONNECTION_FAILED','ERR_TUNNEL_CONNECTION_FAILED','ERR_CONNECTION_RESET','ERR_CONNECTION_CLOSED','ERR_TIMED_OUT')):
                if route:await await_proxy_thread(_discard,account,route)
                phase='重新筛选可用代理'
                progress('连接故障节点已弃用，重新预检可用日韩节点')
                checked=await wait_for_account_proxy(account,on_progress=progress)
                if not checked.get('ok'):
                    raise PreSubmissionParametersError('代理重新预检失败：'+redact_error(checked.get('detail') or '连接未确认')[:700]+'；首条请求未发送')
                route=checked.get('proxy_url')
            await asyncio.sleep(1)
