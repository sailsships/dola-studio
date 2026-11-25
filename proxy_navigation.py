"""Serial proxy selection with a five-minute availability deadline."""
import asyncio
import threading
import time

import proxy_store
import proxy_retry_budget

PROXY_WAIT_SECONDS = 300
RETRY_INTERVAL_SECONDS = 3
_PROBE_STOPPED = object()


class ProxyProbeInterrupted(Exception):
    """Thread-boundary representation of a cooperative probe stop."""


class DolaNavigationError(RuntimeError):
    """Transport failure before the Dola page became ready."""


async def wait_for_account_proxy(account, *, on_progress=None):
    from account_transport import redact_error
    started = proxy_retry_budget.now()
    deadline = started + PROXY_WAIT_SECONDS
    budget = {'deadline': deadline, 'cancel': threading.Event()}
    token = proxy_retry_budget.CURRENT.set(budget)
    last = {'ok': False, 'detail': '代理连接未确认'}
    rounds = 0
    original_id = None
    try:
        while proxy_retry_budget.now() < deadline:
            info = await await_proxy_thread(proxy_store.get_account_proxy, account)
            if rounds and (not info or info['id'] != original_id):
                return {'ok': False, 'detail': '代理绑定已删除、禁用或更改，已停止预检', 'rounds': rounds}
            if not rounds:
                original_id = info['id'] if info else None
            rounds += 1
            if on_progress:
                on_progress(f'正在筛选并预检可用节点（第 {rounds} 轮，已等待 {int(proxy_retry_budget.now()-started)} / 300 秒）')
            last = await await_proxy_thread(proxy_store.preflight_account_proxy, account, rotate_once=True)
            if last.get('ok'):
                proxy_retry_budget.check()
                last['rounds'] = rounds
                return last
            last['detail'] = redact_error(last.get('detail') or '代理连接未确认')[:700]
            if not info or info.get('mode') not in ('extract', 'dynamic') or not info.get('rotate_on_risk', 1):
                last['rounds'] = rounds
                return last
            if on_progress:
                on_progress('暂未找到可用日韩节点，将继续换节点：' + last['detail'])
            remaining = deadline - proxy_retry_budget.now()
            if remaining > 0:
                await asyncio.sleep(min(RETRY_INTERVAL_SECONDS, remaining))
    except ProxyProbeInterrupted:
        pass
    finally:
        proxy_retry_budget.CURRENT.reset(token)
    last.update(ok=False, timed_out=True, rounds=rounds,
                detail='连续 5 分钟未找到可用日韩节点；最后原因：' + redact_error(last.get('detail') or '节点连接或地区预检未通过')[:600])
    return last


async def run_with_proxy_recovery(account, operation, *, on_progress=None):
    def report(message):
        print(f'[{account}] {message}', flush=True)
        if on_progress:
            on_progress(message)

    checked = await wait_for_account_proxy(account, on_progress=report)
    if not checked.get('ok'):
        raise RuntimeError('代理预检失败：' + checked['detail'] + '；登录状态未确认')
    route = checked.get('proxy_url')
    for attempt in range(2):
        try:
            return await operation()
        except DolaNavigationError:
            if route:
                await await_proxy_thread(_discard, account, route)
            if attempt:
                raise RuntimeError('Dola 页面连接超时或中断，换 IP 重试后仍不可用；登录状态未确认') from None
            report('Dola 页面连接失败，正在弃用故障节点并重新筛选可用 IP')
            checked = await wait_for_account_proxy(account, on_progress=report)
            if not checked.get('ok'):
                raise RuntimeError('代理预检失败：' + checked['detail'] + '；登录状态未确认') from None
            route = checked.get('proxy_url')
            report('新节点预检通过，正在重新启动浏览器验证')


def _discard(account, route):
    import proxy_availability
    info = proxy_store.get_account_proxy(account)
    if info:
        proxy_availability.discard(route, proxy_id=info['id'],
            node_id=(proxy_store.get_session(account) or {}).get('node_id', 0),
            detail='浏览器访问 Dola 发生连接超时或中断')


async def await_proxy_thread(function, *args, **kwargs):
    """Finish account-state writes in a worker thread before cancellation cleanup."""
    def invoke():
        try:
            return function(*args, **kwargs)
        except proxy_retry_budget.ProbeStopped:
            # BaseException escapes transport catchers inside the probe, but
            # must cross asyncio.shield as an ordinary handled exception.
            return _PROBE_STOPPED
    task = asyncio.create_task(asyncio.to_thread(invoke))
    try:
        result = await asyncio.shield(task)
        if result is _PROBE_STOPPED:
            raise ProxyProbeInterrupted()
        return result
    except asyncio.CancelledError:
        budget = proxy_retry_budget.CURRENT.get()
        if budget:
            budget['cancel'].set()
        # Cancelling to_thread only cancels its Future; the OS thread keeps writing.
        # Drain it before deleting proxy bindings or reusing the account name.
        while not task.done():
            try:
                await asyncio.shield(task)
            except asyncio.CancelledError:
                continue
            except (Exception, proxy_retry_budget.ProbeStopped):
                break
        if task.done() and not task.cancelled():
            task.exception()
        raise
