"""Submit the operator-configured date only in Dola's login callback form."""
import os
import re
import time
import weakref
from datetime import date
from urllib.parse import urlsplit

from google_controls import visible_controls, dispose, click_named_control, scan_timeout

DEFAULT_BIRTHDATE = '2000-06-09'
_submitted = weakref.WeakKeyDictionary()


def configured_birthdate():
    value = os.getenv('DOLA_DEFAULT_BIRTHDATE', DEFAULT_BIRTHDATE).strip().replace('.', '-').replace('/', '-')
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError:
        raise RuntimeError('DOLA_DEFAULT_BIRTHDATE 格式错误，应为 YYYY-MM-DD') from None


def is_birth_question(text):
    return bool(re.search(r'date\s+of\s+birth|birth\s*date|birthday|生年月日|出生日期|出生年月|生日|생년월일',text,re.I))


@scan_timeout(8, lambda: False)
async def submit_birthdate(page, dialog):
    parsed = urlsplit(page.url)
    if parsed.scheme != 'https' or parsed.hostname not in ('www.dola.com','dola.com') or parsed.path.rstrip('/') != '/auth/callback':
        return False
    if not await dialog.is_visible() or not is_birth_question(await dialog.inner_text()):
        return False
    if time.monotonic()-_submitted.get(page, -100)<5:
        return False
    birthdate = configured_birthdate()
    fields = await visible_controls(dialog,
        'input[type="date"],input[placeholder*="YYYY"],input[placeholder*="yyyy"],input[name*="birth" i]')
    if not fields:
        fields = await visible_controls(dialog,'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])')
    try:
        if len(fields)!=1:
            return False
        field=fields[0]
        if await field.evaluate('e=>e.readOnly'):
            return False
        await field.fill(birthdate,timeout=2500)
        # Text date pickers commit their parsed value on Enter or blur.
        if await field.get_attribute('type') != 'date':
            await field.press('Enter',timeout=1500,no_wait_after=True)
        await field.press('Tab',timeout=1500,no_wait_after=True)
        if not await field.evaluate('(e,date)=>e.isConnected && e.value===date',birthdate):
            return False
        if await click_named_control(page,r'^(Next|Continue|次へ|続行|下一步|继续|다음|계속)$',
                selector='button,[role="button"],input[type="submit"],div,span'):
            _submitted[page]=time.monotonic()
            print(f'[login] 已填写默认出生日期 {birthdate} 并提交，等待最终会话确认',flush=True)
            return True
        return False
    finally:
        for field in fields:
            await dispose(field)
