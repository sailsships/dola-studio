"""Account-owned browser identity, verified region settings and guarded proxy routing."""
import asyncio
import contextlib
import contextvars
import threading
import fcntl
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import time
from urllib.parse import urlsplit

REGIONS = {'JP': ('ja-JP', 'Asia/Tokyo'), 'KR': ('ko-KR', 'Asia/Seoul')}
IDENTITY_FILE = '.browser-environment.json'
PROFILE_SUBDIR = '.environment-browser'
FIXTURE_URL = 'https://environment-check.invalid/'
ENVIRONMENT_PROGRESS = contextvars.ContextVar('environment_progress', default=None)


class EnvironmentMismatch(RuntimeError):
    pass


class EgressBusy(EnvironmentMismatch):
    pass


def account_root(account):
    if not re.fullmatch(r'[A-Za-z0-9_\-\u4e00-\u9fff]+', str(account)):
        raise EnvironmentMismatch('账号名称不适合独立浏览器目录')
    root = Path('accounts').resolve()
    target = root / account
    if target.is_symlink() or target.resolve().parent != root:
        raise EnvironmentMismatch('账号目录不在独立环境根目录内')
    return target


def managed(account):
    return (account_root(account) / IDENTITY_FILE).is_file()


def _atomic_json(path, value):
    temporary = path.with_name(path.name + '.' + secrets.token_hex(6) + '.tmp')
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            json.dump(value, stream, ensure_ascii=False, indent=2)
            stream.flush()
            os.fsync(stream.fileno())
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def identity(account):
    """A random, unique seed belongs to the account, never to the task's temp dir."""
    root = account_root(account)
    root.mkdir(parents=True, exist_ok=True)
    lock = root.parent / '.browser-environment.lock'
    with lock.open('a+b') as handle:
        os.chmod(lock, 0o600)
        fcntl.flock(handle, fcntl.LOCK_EX)
        path = root / IDENTITY_FILE
        if path.exists():
            data = json.loads(path.read_text(encoding='utf-8'))
            if data.get('account') != account or not isinstance(data.get('seed'), int) or not 10000 <= data['seed'] <= 99999:
                raise EnvironmentMismatch('账号环境标识损坏，已停止启动')
            return data
        used = set()
        for p in root.parent.glob('*/' + IDENTITY_FILE):
            used.add(json.loads(p.read_text(encoding='utf-8'))['seed'])
        candidates = set(range(10000, 100000)) - used
        if not candidates:
            raise EnvironmentMismatch('账号独立环境种子已用尽')
        seed = secrets.choice(tuple(candidates))
        data = {'version': 1, 'account': account, 'seed': seed, 'created_at': time.time()}
        _atomic_json(path, data)
        return data


def region_settings(country):
    code = str(country or '').upper()
    if code not in REGIONS:
        raise EnvironmentMismatch('实际出口国家未确认为日本或韩国，禁止使用默认地区启动')
    locale, timezone = REGIONS[code]
    return {'country_code': code, 'locale': locale, 'timezone': timezone}


async def account_settings(account):
    import proxy_region
    import proxy_store
    from account_transport import account_proxy_url
    raw = account_proxy_url(account, begin_usage=False)
    if not raw:
        raise EnvironmentMismatch('账号没有可用代理，禁止直连启动')
    state = proxy_region.get_state(raw)
    if state.get('rejected'):
        raise EnvironmentMismatch('当前节点地区预检不通过，禁止启动')
    if time.time() - float(state.get('checked_at') or 0) > 300 or state.get('country_code') not in REGIONS or not state.get('exit_ip'):
        from proxy_navigation import await_proxy_thread
        result = await await_proxy_thread(proxy_store.probe_account_exit_ip, account)
        if not result.get('ok'):
            raise EnvironmentMismatch('代理实际地区未确认，禁止猜测语言或时区')
        if account_proxy_url(account, begin_usage=False) != raw:
            raise EnvironmentMismatch('地区预检时代理绑定改变，请重新预检')
        state = proxy_region.get_state(raw)
    if state.get('rejected'):
        raise EnvironmentMismatch('当前节点地区预检不通过，禁止启动')
    settings = {**identity(account), **region_settings(state.get('country_code')),
                'exit_ip': state.get('exit_ip'), 'region_checked_at': state.get('checked_at'),
                'route_hash': proxy_region.route_hash(raw)}
    return settings


def strict_proxy(proxy):
    """Remove upload/direct bypasses from the browser's account-bound transport."""
    if not proxy:
        raise EnvironmentMismatch('独立环境禁止无代理启动')
    if isinstance(proxy, dict):
        proxy = {k: v for k, v in proxy.items() if k != 'bypass'}
        if not proxy.get('server'):
            raise EnvironmentMismatch('代理地址缺失')
    return proxy


def launch_arguments(settings, proxy):
    server = proxy.get('server') if isinstance(proxy, dict) else proxy
    host = urlsplit(server).hostname
    if not host:
        raise EnvironmentMismatch('代理主机无效')
    # Only the gateway itself may need bootstrap resolution. Target hostnames
    # must be handed to the HTTP/SOCKS proxy instead of the local DNS resolver.
    excludes = ['localhost', '127.0.0.1']
    try:
        ipaddress.ip_address(host)
    except ValueError:
        excludes.append(host)
    rules = 'MAP * ~NOTFOUND, ' + ', '.join('EXCLUDE ' + h for h in excludes)
    return [f"--fingerprint={settings['seed']}", '--host-resolver-rules=' + rules,
            '--dns-over-https-mode=off', '--disable-quic',
            '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
            '--proxy-bypass-list=<-loopback>',
            '--disable-background-networking', '--no-first-run', '--no-default-browser-check']


SNAPSHOT_JS = """async()=>({ua:navigator.userAgent,platform:navigator.platform,
 language:navigator.language,languages:[...navigator.languages],
 timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,
 hints:navigator.userAgentData?await navigator.userAgentData.getHighEntropyValues(['fullVersionList','platformVersion']):null})"""


def validate_snapshot(snapshot, product, settings):
    engine = re.search(r'(?:Chrome|Chromium)/(\d+)', product)
    ua = re.search(r'(?:Chrome|Chromium)/(\d+)', snapshot.get('ua', ''))
    if not engine or not ua or engine[1] != ua[1]:
        raise EnvironmentMismatch('浏览器 UA 主版本与实际引擎不一致，已停止任务')
    hints = snapshot.get('hints') or {}
    versions = [b['version'].split('.')[0] for b in hints.get('fullVersionList', [])
                if b.get('brand') in ('Chromium', 'Google Chrome', 'Microsoft Edge')]
    if not versions or any(v != engine[1] for v in versions):
        raise EnvironmentMismatch('浏览器 Client Hints 版本与实际引擎不一致，已停止任务')
    if snapshot.get('language') != settings['locale'] or (snapshot.get('languages') or [None])[0] != settings['locale']:
        raise EnvironmentMismatch('浏览器语言与实际出口国家不一致，已停止任务')
    if snapshot.get('timezone') != settings['timezone']:
        raise EnvironmentMismatch('浏览器时区与实际出口国家不一致，已停止任务')
    return {'passed': True, 'engine_major': int(engine[1]), 'locale': snapshot['language'],
            'timezone': snapshot['timezone'], 'country_code': settings['country_code']}


async def verify_context(context, settings):
    """Inspect native browser values on a local intercepted HTTPS fixture."""
    page = await context.new_page()
    cdp = None
    try:
        async def fixture(route):
            await route.fulfill(status=200, content_type='text/html', body='<meta charset="utf-8"><title>Environment check</title>')
        await page.route(FIXTURE_URL, fixture)
        await page.goto(FIXTURE_URL, timeout=10000)
        cdp = await context.new_cdp_session(page)
        product = (await cdp.send('Browser.getVersion'))['product']
        snapshot = await page.evaluate(SNAPSHOT_JS)
        result = validate_snapshot(snapshot, product, settings)
        context._account_environment = {**result, 'account': settings.get('account'),
                                        'seed': settings['seed'], 'checked_at': time.time()}
        return result
    finally:
        if cdp:
            with contextlib.suppress(Exception):
                await cdp.detach()
        await page.close()


async def launch_environment(account, profile, *, extension_paths=None, headless=False):
    import config
    from account_transport import http_proxy
    from account_transport import account_proxy_url
    from proxy_region import route_hash
    from browser import cloak_proxy_settings
    from cloakbrowser import launch_persistent_context_async
    settings, lease = await select_environment(account)
    context = None
    try:
        proxy = strict_proxy(cloak_proxy_settings(http_proxy(account)))
        if route_hash(account_proxy_url(account, begin_usage=False)) != settings['route_hash']:
            raise EnvironmentMismatch('浏览器启动前代理绑定改变，请重新预检')
        context = await launch_persistent_context_async(
            str(profile), headless=bool(headless), proxy=proxy,
            args=launch_arguments(settings, proxy), locale=settings['locale'], timezone=settings['timezone'],
            geoip=False, humanize=config.CLOAK_HUMANIZE, extension_paths=extension_paths or None,
            license_key=config.CLOAK_LICENSE_KEY or None)
        context.on('close', lambda *_: lease.close())
        await verify_context(context, settings)
        _atomic_json(account_root(account) / '.environment-check.json', context._account_environment)
        close = context.close
        async def close_and_release(*args, **kwargs):
            await close(*args, **kwargs)
            lease.close()
        context.close = close_and_release
        print(f"[environment] {account} {settings['country_code']} {settings['locale']} {settings['timezone']} UA/engine matched", flush=True)
        return context
    except BaseException:
        if context:
            # Keep exclusion if closure fails and the browser might still live.
            # Its close event (or worker process exit) will release the lease.
            await context.close()
        else:
            lease.close()
        raise


def egress_in_use(exit_ip):
    """Non-mutating advisory check; acquire_egress remains the atomic authority."""
    try:
        canonical = str(ipaddress.ip_address(exit_ip))
    except (ValueError, TypeError):
        return False
    path = Path('accounts/.browser-egress-locks') / (hashlib.sha256(canonical.encode()).hexdigest() + '.lock')
    try:
        with path.open('rb') as handle:
            try:
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
                return False
            except BlockingIOError:
                return True
    except FileNotFoundError:
        return False


async def select_environment(account, *, timeout=300, retry_interval=3):
    """On a busy exit, select and preflight another node before launching.

    Healthy nodes owned by another browser are never retired or modified.
    The proxy budget is shared with selector threads and drained on cancellation.
    """
    import proxy_store
    import proxy_retry_budget
    from proxy_navigation import await_proxy_thread, ProxyProbeInterrupted
    from account_transport import redact_error
    parent = proxy_retry_budget.CURRENT.get()
    deadline = min(proxy_retry_budget.now() + timeout, parent['deadline'] if parent else float('inf'))
    budget = {'deadline': deadline, 'cancel': parent['cancel'] if parent else threading.Event()}
    token = proxy_retry_budget.CURRENT.set(budget)
    last = '未找到空闲且预检通过的日韩出口'
    rounds = 0
    def report(message):
        callback = ENVIRONMENT_PROGRESS.get()
        if callback:
            callback(message)
        print('[environment] '+account+' '+message, flush=True)
    try:
        original = await await_proxy_thread(proxy_store.get_account_proxy, account)
        while proxy_retry_budget.now() < deadline:
            current = await await_proxy_thread(proxy_store.get_account_proxy, account)
            if not current or not original or current['id'] != original['id']:
                raise EnvironmentMismatch('代理绑定已改变，停止自动选择出口')
            try:
                settings = await account_settings(account)
            except EnvironmentMismatch:
                raise
            except RuntimeError as exc:
                last = redact_error(exc)[:200]
                checked = await await_proxy_thread(proxy_store.preflight_account_proxy, account, rotate_once=True)
                if not checked.get('ok'):
                    last = redact_error(checked.get('detail') or last)[:200]
                    report('继续预检日韩节点：'+last)
                    await asyncio.sleep(min(retry_interval,max(0,deadline-proxy_retry_budget.now())))
                continue
            try:
                lease = await acquire_egress(account, settings.get('exit_ip'), timeout=0)
                if rounds:
                    report('已找到空闲日韩出口，继续准备浏览器')
                return settings, lease
            except EgressBusy:
                rounds += 1
                last = '实际出口被其他浏览器占用'
                report(f'出口正忙，自动更换并预检其他节点（第 {rounds} 轮，剩余 {max(0,int(deadline-proxy_retry_budget.now()))} 秒）')
            if current.get('mode') in ('extract','dynamic') and current.get('rotate_on_risk',1):
                try:
                    rotated = await await_proxy_thread(proxy_store.rotate_account_session, account,
                        reason='实际出口正忙，选择其他空闲出口', force=True)
                except RuntimeError as exc:
                    last = redact_error(exc)[:200]
                    rotated = None
                if rotated:
                    checked = await await_proxy_thread(proxy_store.preflight_account_proxy, account, rotate_once=True)
                    if checked.get('ok'):
                        continue
                    last = redact_error(checked.get('detail') or '新节点预检未通过')[:200]
            await asyncio.sleep(min(retry_interval,max(0,deadline-proxy_retry_budget.now())))
    except ProxyProbeInterrupted:
        pass
    finally:
        proxy_retry_budget.CURRENT.reset(token)
    raise EnvironmentMismatch(f'连续 {int(timeout)} 秒未找到空闲且可用的日韩出口：{last}；首条请求未发送')


async def acquire_egress(account, exit_ip, *, timeout=60):
    """Actual public-IP exclusion, across worker processes as well as tasks."""
    try:
        canonical = str(ipaddress.ip_address(exit_ip))
    except (ValueError, TypeError):
        raise EnvironmentMismatch('节点实际出口 IP 未确认，禁止并发使用未知出口') from None
    directory = account_root(account).parent / '.browser-egress-locks'
    directory.mkdir(mode=0o700, exist_ok=True)
    path = directory / (hashlib.sha256(canonical.encode()).hexdigest() + '.lock')
    handle = path.open('a+b')
    os.chmod(path, 0o600)
    deadline = time.monotonic() + timeout
    try:
        while True:
            try:
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
                return handle
            except BlockingIOError:
                if time.monotonic() >= deadline:
                    raise EgressBusy('实际出口暂被其他浏览器使用')
                await asyncio.sleep(min(.2, max(0, deadline - time.monotonic())))
    except BaseException:
        handle.close()
        raise


def dola_cookie(cookie):
    host = cookie.get('domain', '').lstrip('.').lower()
    return host == 'dola.com' or host.endswith('.dola.com')


async def launch_managed_account(p, account, *, headless=False, use_extension=False):
    """Keep the original profile intact; import its Dola cookies once into Cloak."""
    import config
    from browser import launch_account_context
    root = account_root(account)
    profile = root / PROFILE_SUBDIR
    if profile.is_symlink():
        raise EnvironmentMismatch('账号浏览器目录不能是符号链接')
    profile.mkdir(parents=True, exist_ok=True)
    marker = profile / '.legacy-imported'
    snapshot_path = profile / '.session-cookies.json'
    snapshot = json.loads(snapshot_path.read_text()) if snapshot_path.exists() else []
    if not marker.exists() and (root / 'Default' / 'Cookies').is_file():
        legacy = await launch_account_context(p, account, headless=True, _environment_bypass=True)
        try:
            snapshot = [c for c in await legacy.cookies() if dola_cookie(c)]
            _atomic_json(snapshot_path, snapshot)
        finally:
            await legacy.close()
    extensions = []
    if use_extension:
        if not config.EXTENSION_ENABLED or not Path(config.EXTENSION_DIR).exists():
            raise EnvironmentMismatch('账号需要的扩展不可用')
        extensions = [str(Path(config.EXTENSION_DIR).resolve())]
    context = await launch_environment(account, profile, extension_paths=extensions, headless=headless)
    try:
        live = {(c['name'], c['domain'], c['path']) for c in await context.cookies()}
        restored = [c for c in snapshot if dola_cookie(c) and (c['name'], c['domain'], c['path']) not in live
                    and (not marker.exists() or c.get('expires', -1) == -1)]
        if restored:
            await context.add_cookies(restored)
        if not marker.exists():
            _atomic_json(marker, {'at': time.time(), 'original_profile_preserved': True})
    except BaseException:
        await context.close()
        raise
    close = context.close
    closed = False
    async def close_with_snapshot(*args, **kwargs):
        nonlocal closed
        if closed:
            return
        closed = True
        try:
            _atomic_json(snapshot_path, [c for c in await context.cookies() if dola_cookie(c)])
        finally:
            try:
                await close(*args, **kwargs)
            except BaseException:
                closed = False
                raise
    context.close = close_with_snapshot
    return context
