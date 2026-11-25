"""Known login interstitials; never treat an unfinished confirmation as logout."""
import asyncio
import os
import re
from urllib.parse import urlsplit
from patchright.async_api import TimeoutError as BrowserTimeout
from playwright.async_api import TimeoutError as CloakTimeout
from google_controls import click_named_control, scan_timeout
from birth_confirmation import is_birth_question, submit_birthdate


class LoginConfirmationRequired(RuntimeError):
    pass


GOOGLE_ACCOUNT_HOSTS = frozenset(('accounts.google.com', 'accounts.google.co.kr',
                                  'accounts.google.co.jp'))


def is_google_account_url(url):
    """Known account hosts, including the observed regional cookie sync hop."""
    parsed = urlsplit(url)
    return parsed.scheme == 'https' and parsed.hostname in GOOGLE_ACCOUNT_HOSTS


def is_dola_url(url):
    parsed = urlsplit(url)
    return parsed.scheme == 'https' and parsed.hostname in ('www.dola.com', 'dola.com')


def google_confirmation_kind(url):
    parsed = urlsplit(url)
    if not is_google_account_url(url):
        return ''
    path = parsed.path.lower()
    if 'workspacetermsofservice' in path:
        return 'education'
    if any(segment in path for segment in ('/consent', '/oauth', '/signin/oauth')):
        return 'oauth'
    return ''


@scan_timeout(3, lambda: False)
async def google_error_visible(page):
    if not is_google_account_url(page.url):
        return False
    return await page.evaluate('''() => {
      const text=(document.body && document.body.innerText)||'';
      return /エラーが発生しました|Something went wrong|An error occurred|发生了错误|出了点问题|오류가 발생/.test(text)
        && /もう一度|Try again|try again|重试|再试|다시/.test(text);
    }''')


@scan_timeout(3, lambda: False)
async def retry_google_error(page):
    """The observed Google error uses Next, not a button named Retry.

    These labels are actionable only after exact Google origin + error text
    checks; a normal credentials/consent page must never enter this handler.
    """
    if not await google_error_visible(page):
        return False
    return await click_named_control(page,
        r'^(Try again|Retry|もう一度(?:試す|お試しください)?|再試行|やり直す|重试|再试|再试一次|重新尝试|다시 시도|재시도|다시|次へ|Next|下一步|다음)$')


async def handle_google_confirmation(page):
    kind = google_confirmation_kind(page.url)
    if not kind:
        return ''
    names = (r'^(I agree|Agree|Accept|I understand|Got it|理解しました|同意|同意する|接受|我知道了|알겠습니다|이해했습니다|동의|확인)$'
             if kind == 'education' else
             r'^(Continue|Allow|続行|許可|同意する|继续|同意|계속|허용|동의)$')
    # Google 的 speedbump 页面在不同语言/版本中可能是 button、role=button
    # 或 input[type=submit]；只依赖 get_by_role 会漏掉最后一种。
    if await click_named_control(page, names):
        return kind
    return ''


def is_age_confirmation(text):
    return bool(re.search(r'(?<!\d)18(?!\d)', text) and re.search(
        r'age|older|years?\s+old|年龄|年齡|年齢|歳|세\s*이상|나이', text, re.I))


async def require_no_dola_confirmation(page, *, confirm_adult=None):
    parsed = urlsplit(page.url)
    if parsed.scheme != 'https' or parsed.hostname not in ('www.dola.com', 'dola.com'):
        return
    from cookie_notice import dismiss_cookie_notice
    await dismiss_cookie_notice(page)
    # Only visible dialogs qualify; a reference prompt mentioning 18 is unrelated.
    dialogs = await page.locator('[role="dialog"], [aria-modal="true"], .semi-modal-content').all()
    # The observed OAuth callback renders age confirmation as a full page.
    if parsed.path.rstrip('/') == '/auth/callback':
        dialogs.append(page.locator('body'))
    for dialog in dialogs:
        if not await dialog.is_visible():
            continue
        text = await dialog.inner_text()
        if parsed.path.rstrip('/') == '/auth/callback' and is_birth_question(text):
            # The operator supplied the default date. A temporarily missing or
            # disabled control is a rescan condition, not a manual-input request.
            return await submit_birthdate(page, dialog)
        if is_age_confirmation(text):
            allowed = os.getenv('DOLA_CONFIRM_ADULT', '0') == '1' if confirm_adult is None else confirm_adult
            if allowed:
                for button in await dialog.get_by_role('button', name=re.compile(
                        r'^(OK|Confirm|Continue|確認|続行|はい|确认|继续|확인|계속)$', re.I)).all():
                    if await button.is_visible() and await button.is_enabled():
                        await button.click(timeout=5000)
                        # A full-page confirmation navigates instead of hiding <body>.
                        if parsed.path.rstrip('/') == '/auth/callback':
                            try:await button.wait_for(state='hidden',timeout=10000)
                            except Exception:
                                if urlsplit(page.url).path.rstrip('/') == '/auth/callback':raise
                        else:
                            await dialog.wait_for(state='hidden', timeout=10000)
                        return True
            raise LoginConfirmationRequired(
                'Dola 登录待确认：需要账号使用者确认已满 18 岁；请在“进入网页”完成确认后重新验证')


async def goto_dola(page, *, on_progress=None, recover_proxy=False,
                    navigation_timeout=60000, dom_ready_timeout=15000):
    """Separate document delivery from slow scripts; never infer bad IP from DOM lag."""
    def report(message):
        if on_progress:
            on_progress(message)
        else:
            print('[login] '+message, flush=True)

    for attempt in range(2):
        try:
            response = await page.goto('https://www.dola.com/chat',
                timeout=navigation_timeout, wait_until='commit')
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            transient = any(code in str(exc) for code in (
                'net::ERR_CONNECTION_CLOSED', 'net::ERR_CONNECTION_RESET',
                'net::ERR_TIMED_OUT', 'net::ERR_CONNECTION_TIMED_OUT',
                'net::ERR_PROXY_CONNECTION_FAILED', 'net::ERR_TUNNEL_CONNECTION_FAILED',
                'net::ERR_CONNECTION_REFUSED', 'net::ERR_SOCKS_CONNECTION_FAILED'))
            if transient and recover_proxy:
                from proxy_navigation import DolaNavigationError
                raise DolaNavigationError('Dola 页面网络连接失败，登录状态未确认') from exc
            load_timeout = isinstance(exc, (BrowserTimeout, CloakTimeout, TimeoutError))
            if not transient and not load_timeout:
                raise
            if attempt:
                if transient:
                    raise RuntimeError('Dola 页面连接超时或中断：原代理重试后仍未连接，尚未验证登录状态') from exc
                raise RuntimeError('Dola 主文档响应超时：原 IP 重试一次后仍未收到页面；登录状态未确认') from None
            report('尚未收到 Dola 主文档，正在使用原 IP 重试一次' if load_timeout
                   else '页面连接中断，正在使用原代理重试')
            await asyncio.sleep(1)
            continue
        try:
            await page.wait_for_load_state('domcontentloaded', timeout=dom_ready_timeout)
        except asyncio.CancelledError:
            raise
        except (BrowserTimeout, CloakTimeout, TimeoutError):
            # The document is committed. Keep the navigation alive and let the
            # downstream bounded scans decide if the login surface is usable.
            report('Dola 主文档已收到，页面脚本仍在加载，继续扫描登录控件')
        return response
