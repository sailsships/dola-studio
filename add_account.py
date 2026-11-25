"""自动添加账号：Google OAuth 自动登录（邮箱----密码----TOTP 密钥），存 profile。

用法：python add_account.py <账号名> "email----password----totp_secret"

只登录存 profile，不发送任何视频请求。失败抛 RuntimeError（供面板 jobs 捕获）。
Google 页有反自动化检测，用 headful 提高成功率；失败会截图 dbg_add_account.png。
"""
import asyncio
import base64
import hashlib
import hmac
import json
import re
import struct
import sys
import time
from pathlib import Path
from urllib.parse import urlsplit

from patchright.async_api import async_playwright
from login_observation import install_login_assets,checkpoint_login
from cookie_notice import dismiss_cookie_notice

from browser import LAUNCH_ARGS, proxy_kwargs_for
from login_steps import (goto_dola, handle_google_confirmation,
                         require_no_dola_confirmation, is_google_account_url, is_dola_url,
                         google_error_visible, retry_google_error, google_confirmation_kind)
import proxy_store
from google_controls import submit_field, click_named_control, visible_controls, dispose, scan_timeout, ACTIVE_JS


def totp(secret: str, period: int = 30, digits: int = 6) -> str:
    """标准 TOTP（RFC 6238），Google Authenticator 兼容。"""
    secret = secret.replace(" ", "").upper()
    key = base64.b32decode(secret + "=" * ((8 - len(secret) % 8) % 8))
    counter = int(time.time() // period)
    h = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    o = h[19] & 15
    code = (struct.unpack(">I", h[o:o + 4])[0] & 0x7fffffff) % (10 ** digits)
    return str(code).zfill(digits)


async def google_login(g, email: str, password: str, secret: str, *,
                       timeout=300, scan_interval=0.5):
    """Scan promptly, with a real deadline independent of DOM/RPC count."""
    started=time.monotonic()
    deadline=started+timeout
    next_progress=started+15
    submitted={}
    error_since=None
    error_retry_at=None
    while time.monotonic()<deadline:
        if g.is_closed():
            print('[google] 登录弹窗已关闭，等待 Dola 会话确认', flush=True)
            return
        if is_dola_url(g.url):
            print('[google] 已返回 Dola，继续确认 sessionid', flush=True)
            return
        await asyncio.sleep(min(scan_interval,max(0,deadline-time.monotonic())))
        if g.is_closed() or is_dola_url(g.url):
            continue
        parsed=urlsplit(g.url)
        now=time.monotonic()
        if now>=next_progress:
            print(f'[google] 持续扫描登录/授权页面（已等待 {int(now-started)} 秒）',flush=True)
            next_progress=now+15
        if not is_google_account_url(g.url) or parsed.hostname!='accounts.google.com':
            continue
        # A failed browser RPC is bounded separately; it cannot stop all later scans.
        try:
            async with asyncio.timeout(max(0.01,min(10,deadline-time.monotonic()))):
                # Error pages can be a brief transition. Require a stable
                # error, then allow one explicit retry within the same deadline.
                if await google_error_visible(g):
                    now=time.monotonic()
                    if error_since is None:
                        error_since=now
                    if now-error_since<2 or (error_retry_at is not None and now-error_retry_at<10):
                        continue
                    if error_retry_at is None:
                        if await retry_google_error(g):
                            error_retry_at=time.monotonic()
                            submitted.clear()
                            print('[google] 错误页已点击“重试”一次，继续扫描登录/授权页面',flush=True)
                            continue
                        # A retry button may still be hydrating or disabled.
                        if now-error_since<10:
                            continue
                    try:await g.screenshot(path='dbg_google_error.png',timeout=3000)
                    except Exception:pass
                    detail='已点击页面重试一次，仍未恢复' if error_retry_at is not None else '未找到可点击的重试按钮'
                    raise RuntimeError('Google 页面提示“发生错误，请重试”（'+detail+'），授权未完成；尚未建立 Dola 登录会话')
                error_since=None
                confirmation_key=('confirmation',google_confirmation_kind(g.url) or parsed.path)
                # A slow proxy can need tens of seconds to navigate after a delivered
                # click. Keep scanning without resubmitting the same form every 3-12s.
                if now-submitted.get(confirmation_key,-100)<60:
                    continue
                confirmation=await handle_google_confirmation(g)
                if confirmation:
                    submitted[confirmation_key]=time.monotonic()
                    print('[google] '+('已点击首次条款确认，等待跳转' if confirmation=='education' else '已点击 OAuth 继续授权，等待回跳'),flush=True)
                    continue
                if 'accountchooser' in parsed.path:
                    if now-submitted.get(('chooser',parsed.path),-100)>=60:
                        # Match a visible account control, never a hidden old panel.
                        if await click_named_control(g, '^'+re.escape(email)+'$',
                                selector='[data-identifier],[data-email],button,[role="link"],[role="button"]'):
                            submitted[('chooser',parsed.path)]=time.monotonic()
                            print('[google] 选择账号页 → 点账号',flush=True)
                            continue
                fields=[]
                if '/identifier' in parsed.path:
                    fields.append(('#identifierId','#identifierNext',email,'邮箱'))
                elif '/challenge/pwd' in parsed.path:
                    fields.append(('input[name="Passwd"]','#passwordNext',password,'密码'))
                elif '/challenge/' not in parsed.path and '/oauth' not in parsed.path and '/speedbump/' not in parsed.path:
                    fields=[('#identifierId','#identifierNext',email,'邮箱'),
                            ('input[name="Passwd"]','#passwordNext',password,'密码')]
                if secret and '/challenge/' in parsed.path and '/challenge/pwd' not in parsed.path:
                    fields.append(('input[type="tel"]','#totpNext',totp(secret),'2FA'))
                elif not secret and '/challenge/' in parsed.path and '/challenge/pwd' not in parsed.path:
                    tel=await visible_controls(g,'input[type="tel"]')
                    for control in tel:await dispose(control)
                    if tel:
                        raise RuntimeError('Google 要求两步验证，但未提供 TOTP 密钥')
                for field,button,value,label in fields:
                    key=(field,parsed.path)
                    # Continue scanning at 0.5s, but give an accepted credential
                    # submit time to navigate instead of repeatedly restarting it.
                    if time.monotonic()-submitted.get(key,-100)<60:
                        continue
                    if await submit_field(g,field,button,value):
                        submitted[key]=time.monotonic()
                        print(f'[google] {label}页 → 提交',flush=True)
                        break
                else:
                    # Keep the existing known submit ID fallback for other consent variants.
                    if '/oauth' in parsed.path and await click_named_control(g,'.*',selector='#submit_button'):
                        submitted[confirmation_key]=time.monotonic()
                        print('[google] OAuth 授权确认已完成',flush=True)
        except TimeoutError:
            print('[google] 单次页面操作超时，重新扫描当前页面',flush=True)
    if not g.is_closed():
        try:await g.screenshot(path='dbg_google2.png',timeout=5000)
        except Exception:pass
        raise RuntimeError(f'Google 登录/授权等待超时（已持续扫描 {timeout} 秒，尚未确认返回 Dola，截图 dbg_google2.png）')


@scan_timeout(3, lambda: None)
async def _first_visible_text_control(page, pattern):
    """Resolve one active control atomically; prefer modal controls across frames."""
    selector = ('button,[role="button"],[role="link"],a,input[type="button"],'
                'input[type="submit"],[tabindex],[onclick],[data-provider]')
    for modal_only in (True, False):
        for frame in page.frames:
            handle = None
            try:
                handle = await frame.evaluate_handle(r"""args => {
                  const active=ACTIVE;
                  const modal='[role="dialog"],[aria-modal="true"],.semi-modal-content';
                  const re=new RegExp(args.pattern,'i');
                  let matches=[...document.querySelectorAll(args.selector)].filter(e=>{
                    if (!active(e)) return false;
                    if (args.modalOnly && !e.closest(modal)) return false;
                    const labels=[e.innerText,e.value,e.getAttribute('aria-label'),
                      e.getAttribute('title'),e.getAttribute('data-provider')];
                    for(const child of e.querySelectorAll('img[alt],svg[aria-label],svg title')){
                      labels.push(child.getAttribute('alt'),child.getAttribute('aria-label'),
                        child.tagName.toLowerCase()==='title'?child.textContent:'');
                    }
                    return labels.some(x=>x && re.test(x.replace(/\s+/g,' ').trim()));
                  });
                  // Nested role wrappers and their button are one control.
                  matches=matches.filter(e=>!matches.some(x=>x!==e && e.contains(x)));
                  return matches.length===1?matches[0]:null;
                }""".replace('ACTIVE', ACTIVE_JS), dict(
                    selector=selector, pattern=pattern.pattern, modalOnly=modal_only))
                control = handle.as_element()
                if control is not None:
                    return control
            except Exception:
                pass  # A replaced frame is a rescan condition.
            if handle is not None:
                await dispose(handle)
    return None


@scan_timeout(3, lambda: None)
async def _login_modal_visible(page):
    """None means an unreadable DOM, never permission to click again."""
    for frame in page.frames:
        visible = await frame.evaluate("""() => {
          const selectors='[role="dialog"],[aria-modal="true"],.semi-modal-content';
          return [...document.querySelectorAll(selectors)].some(e=>{
            const r=e.getBoundingClientRect(),s=getComputedStyle(e);
            return r.width>0 && r.height>0 && s.display!=='none'
              && s.visibility!=='hidden' && !e.closest('[hidden],[aria-hidden="true"]');
          });
        }""")
        if visible:
            return True
    return False


async def _open_google_login(page, context, *, entry_timeout=90,
                             google_timeout=60, scan_interval=1,
                             entry_retry_interval=8, max_entry_clicks=3):
    """Confirm the modal before waiting for providers; bound entry retries."""
    google_re = re.compile(r"Google", re.I)
    login_re = re.compile(r"^(?:ログイン|로그인|log\s*in|sign\s*in|登录|登入)$", re.I)
    started = time.monotonic()
    entry_deadline = started + entry_timeout
    provider_deadline = None
    deadline = entry_deadline
    next_progress = started + 15
    clicks = 0
    last_click = None
    modal_confirmed = False
    while time.monotonic() < deadline:
        await dismiss_cookie_notice(page)
        for tab in list(context.pages):
            if not tab.is_closed() and urlsplit(tab.url).hostname == 'accounts.google.com':
                return
        google = await _first_visible_text_control(page, google_re)
        if google is not None:
            try:
                await google.click(timeout=5000)
                return
            except Exception:
                pass  # Hydration replaced the control; rescan the live DOM.
            finally:
                await dispose(google)
        else:
            modal = await _login_modal_visible(page)
            now = time.monotonic()
            if modal is True:
                modal_confirmed = True
                if provider_deadline is None:
                    provider_deadline = now + google_timeout
                    deadline = provider_deadline
                    print('[login] 已确认登录弹窗打开，持续扫描 Google 选项', flush=True)
            elif modal is False and clicks < max_entry_clicks and (
                    last_click is None or now-last_click >= entry_retry_interval):
                # A resolved click is not evidence of an opened modal. Only
                # retry the visible entry after the DOM confirms no dialog.
                login = await _first_visible_text_control(page, login_re)
                if login is not None and time.monotonic() < deadline:
                    clicks += 1
                    last_click = time.monotonic()
                    try:
                        await login.click(timeout=3000)
                    except Exception:
                        print('[login] 登录入口点击未完成，等待页面稳定后重新扫描', flush=True)
                    else:
                        print(f'[login] 已点击登录入口（{clicks}/{max_entry_clicks}），正在确认弹窗是否打开', flush=True)
                    finally:
                        await dispose(login)
                elif login is not None:
                    await dispose(login)
        now = time.monotonic()
        if now >= next_progress:
            stage = 'Google 选项' if modal_confirmed else '登录入口及弹窗打开状态'
            print(f'[login] 持续扫描 {stage}（已等待 {int(now-started)} 秒）', flush=True)
            next_progress = now + 15
        remaining = deadline - now
        if remaining > 0:
            await page.wait_for_timeout(min(scan_interval, remaining) * 1000)
    try:
        await page.screenshot(path="dbg_add_account.png", timeout=5000)
    except Exception:
        pass
    elapsed = int(time.monotonic()-started)
    if modal_confirmed:
        detail = f'登录弹窗已打开，但 Google 选项等待超时（持续扫描 {elapsed} 秒）'
    elif clicks:
        detail = f'登录入口已尝试点击 {clicks} 次，但未确认弹窗打开（持续扫描 {elapsed} 秒）'
    else:
        detail = f'登录入口等待超时（持续扫描 {elapsed} 秒）'
    raise RuntimeError('Dola '+detail+'；尚未进入 Google 登录')


async def add_account_flow(account: str, email: str, password: str, secret: str,
                           force_login: bool = False) -> bool:
    from proxy_navigation import run_with_proxy_recovery
    return await run_with_proxy_recovery(account, lambda: _add_account_flow_once(
        account, email, password, secret, force_login=force_login))


async def _add_account_flow_once(account: str, email: str, password: str, secret: str,
                                force_login: bool = False) -> bool:
    profile_dir = Path("accounts") / account
    profile_dir.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as p:
        from account_environment import identity, launch_managed_account
        identity(account)
        context = await launch_managed_account(p, account, headless=False)
        try:
            await install_login_assets(context,account)
            if force_login:
                # 强制重新登录：先清掉旧的 dola 会话 cookie，避免“已有登录态”跳过
                await context.clear_cookies()
            page = context.pages[0] if context.pages else await context.new_page()
            await goto_dola(page, recover_proxy=True)
            await page.wait_for_timeout(4000)
            await require_no_dola_confirmation(page)

            cookies = await context.cookies("https://www.dola.com")
            if not force_login and any(c["name"] == "sessionid" and c["value"] for c in cookies):
                print(f"[{account}] 已有登录态，无需登录", flush=True)
                return True

            # 点登录入口 -> Google 选项。兼容 native button、role=button、链接和 iframe，
            # 并在登录入口直接跳 OAuth 时不再错误等待一个已经不存在的 Google 按钮。
            await checkpoint_login(context,'landing')
            await _open_google_login(page, context)
            await checkpoint_login(context,'google_entry')

            # Google 页可能在 popup 或当前 tab，持续扫描最多 60s。
            g = None
            callback_seen = False
            deadline = time.monotonic() + 60
            while time.monotonic() < deadline:
                # An already-signed-in Google session can return directly to
                # Dola without leaving an observable Google tab.
                callback_seen = any(not pg.is_closed() and is_dola_url(pg.url)
                    and urlsplit(pg.url).path.rstrip('/') == '/auth/callback'
                    for pg in context.pages)
                if callback_seen:
                    print('[login] 已直接返回 Dola 授权回跳页，继续处理确认与会话',flush=True)
                    break
                if urlsplit(page.url).hostname == 'accounts.google.com':
                    g = page
                    break
                g = next(
                    (pg for pg in context.pages if not pg.is_closed() and urlsplit(pg.url).hostname == 'accounts.google.com'),
                    None,
                )
                if g is not None:
                    break
                await page.wait_for_timeout(1000)
            if g is None and not callback_seen:
                await page.screenshot(path="dbg_add_account.png")
                raise RuntimeError(
                    "未跳转到 Google 登录页（截图 dbg_add_account.png）"
                )

            if g is not None:
                await google_login(g, email, password, secret)

            # 等 dola 写入 sessionid（OAuth 回跳后）
            for _ in range(60):
                await page.wait_for_timeout(3000)
                for tab in list(context.pages):
                    if not tab.is_closed():
                        # A transient Google hop or delayed consent can occur
                        # while the main Dola tab is still showing its modal.
                        # Keep handling the popup, rather than only watching
                        # the original tab for a cookie that cannot yet exist.
                        if is_google_account_url(tab.url):
                            await handle_google_confirmation(tab)
                        await require_no_dola_confirmation(tab)
                cookies = await context.cookies("https://www.dola.com")
                if any(c["name"] == "sessionid" and c["value"] for c in cookies):
                    print(f"[{account}] ✓ 登录成功，sessionid 已写入，profile 保存到 {profile_dir}", flush=True)
                    await page.wait_for_timeout(3000)
                    for tab in list(context.pages):
                        if not tab.is_closed():
                            await require_no_dola_confirmation(tab)
                    return True
            await page.screenshot(path="dbg_add_account.png")
            states = []
            for i, tab in enumerate(list(context.pages)):
                if tab.is_closed():
                    continue
                parsed = urlsplit(tab.url)
                states.append({'host': parsed.hostname, 'path': parsed.path})
                try:
                    await tab.screenshot(path=str(profile_dir / f'login_failure_tab_{i}.png'), timeout=5000)
                except Exception:
                    pass
            (profile_dir / 'login_failure_pages.json').write_text(json.dumps(states), encoding='utf-8')
            pending_google = any(s['host'] in ('accounts.google.com', 'accounts.google.co.kr', 'accounts.google.co.jp') for s in states)
            detail = 'Google 授权仍未结束' if pending_google else 'Dola 回跳后未写入登录会话'
            raise RuntimeError('3 分钟内未拿到 sessionid：' + detail + '（各标签页截图保存在账号目录）')
        finally:
            await checkpoint_login(context,'final')
            await context.close()


async def main():
    account = sys.argv[1]
    email, password, secret = sys.argv[2].split("----")
    await add_account_flow(account, email, password, secret)
    print(f"[{account}] 加号完成，跑 verify_login.py {account} 可复核")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as e:
        print(f"✗ {e}")
        sys.exit(1)

