"""Wait for a meaningful login surface without treating a blank app as logout."""
import asyncio
import os
import time


class LoginPageNotReady(RuntimeError):
    pass


def readiness_timeout():
    try:
        value = float(os.getenv('DOLA_LOGIN_READY_TIMEOUT', '90'))
    except ValueError:
        value = 90
    return max(30, min(180, value))


async def wait_for_login_surface(snapshot, *, logged_out, report, timeout=None):
    limit = readiness_timeout() if timeout is None else timeout
    started = time.monotonic()
    deadline = started + limit
    next_report = started + 15
    while time.monotonic() < deadline:
        state = None
        try:
            async with asyncio.timeout(min(5, deadline - time.monotonic())):
                state = await snapshot()
        except TimeoutError:
            # An unresponsive render process must not make the scan unbounded.
            pass
        if state is not None and (
            state['hits'] or state['modal'] or state['region'] or logged_out()
            or state['has_sid'] and state['has_chat']
        ):
            return state
        now = time.monotonic()
        if now >= next_report:
            report(f'Dola 页面仍在加载，持续扫描登录状态（已等待 {int(now - started)} 秒）')
            next_report = now + 15
        await asyncio.sleep(min(0.5, max(0, deadline - time.monotonic())))
    raise LoginPageNotReady(
        f'Dola 页面加载等待超时（已持续扫描 {int(limit)} 秒）；登录状态未确认，未将账号标记为失效'
    )
