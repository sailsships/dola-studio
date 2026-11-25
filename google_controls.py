"""Resolve Google's animated forms without assuming that HTML IDs are unique."""
import asyncio
from functools import wraps
from patchright.async_api import Error as PatchrightError
from playwright.async_api import Error as PlaywrightError
BrowserError = (PatchrightError, PlaywrightError)
SCAN_ERRORS = (TimeoutError, *BrowserError)


def scan_timeout(seconds, fallback):
    """A stalled browser RPC must not consume the entire login deadline."""
    def decorate(fn):
        @wraps(fn)
        async def bounded(*args, **kwargs):
            try:
                async with asyncio.timeout(seconds):
                    return await fn(*args, **kwargs)
            except SCAN_ERRORS:
                return fallback()
        return bounded
    return decorate


async def dispose(element):
    try:
        await asyncio.wait_for(element.dispose(), timeout=0.25)
    except SCAN_ERRORS:
        pass


ACTIVE_JS = '''e => {
  if (!e.isConnected || e.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
  const r=e.getBoundingClientRect(), s=getComputedStyle(e);
  return r.width>0 && r.height>0 && s.visibility!=='hidden' && s.display!=='none'
    && !e.matches(':disabled, [aria-disabled="true"]')
    && !e.closest('[aria-disabled="true"]')
    && !e.querySelector('button:disabled,button[aria-disabled="true"]');
}'''


@scan_timeout(3, list)
async def visible_controls(page, selector):
    """Return stable element handles, excluding hidden/inert transition panels."""
    result = []
    try:
        elements = await page.locator(selector).element_handles()
    except BrowserError:
        return result
    for element in elements:
        try:
            if await element.evaluate(ACTIVE_JS):
                result.append(element)
            else:
                await dispose(element)
        except BrowserError:
            await dispose(element)
    return result


async def unique_input(page, selector):
    elements = await visible_controls(page, selector)
    writable = []
    for element in elements:
        if await element.evaluate('e => !e.readOnly'):
            writable.append(element)
        else:
            await dispose(element)
    if len(writable) == 1:
        return writable[0]
    # Multiple active inputs mean the transition has not settled. Do not
    # guess from DOM order or send credentials to a different form.
    for element in writable:
        await dispose(element)
    return None


@scan_timeout(6, lambda: False)
async def submit_field(page, input_selector, submit_selector, value):
    """Fill one active input and click one active submit in its own form.

    Input/submit references survive insertions before them. Recheck the exact
    input after fill: if hydration replaced it, wait for the next scan instead
    of accidentally submitting the new, empty form.
    """
    field = None
    submit = None
    try:
        field = await unique_input(page, input_selector)
        if field is None:
            return False
        await field.fill(value, timeout=3000)
        candidate = await field.evaluate_handle('''(e, args) => {
          const active = ACTIVE;
          if (!active(e) || e.value !== args.value) return null;
          const scopes=[e.closest('form'),e.closest('main,[role="main"]'),document];
          for (const scope of [...new Set(scopes.filter(Boolean))]) {
            const all=Array.from(scope.querySelectorAll(args.selector));
            if (!all.length) continue;
            const matches=all.filter(active);
            // Do not leave a form that has a pending/disabled submit.
            return matches.length===1 ? matches[0] : null;
          }
          return null;
        }'''.replace('ACTIVE', ACTIVE_JS), {'selector': submit_selector, 'value': value})
        submit = candidate.as_element()
        if submit is None:
            await dispose(candidate)
            return False
        # Atomic state check + DOM click, matching the existing submission
        # behavior while avoiding strict mode and animation hit-test errors.
        return await submit.evaluate('''(button, field) => {
          const active=ACTIVE;
          if (!active(button) || !active(field)) return false;
          button.click(); return true;
        }'''.replace('ACTIVE', ACTIVE_JS), field)
    except BrowserError:
        # Navigation/detachment during hydration is a normal rescan condition.
        return False
    finally:
        if submit is not None:
            await dispose(submit)
        if field is not None:
            await dispose(field)


@scan_timeout(6, lambda: False)
async def click_visible(element, *, timeout=5000):
    """A stable reference with checked DOM-click fallback for transition layers."""
    try:
        if not await element.evaluate(ACTIVE_JS):
            return False
        try:
            await element.click(timeout=timeout, no_wait_after=True)
            return True
        except BrowserError:
            return await element.evaluate('''e => {
              const active=ACTIVE;
              if (!active(e)) return false;
              e.click();return true;
            }'''.replace('ACTIVE', ACTIVE_JS))
    except BrowserError:
        return False


@scan_timeout(3, lambda: False)
async def click_named_control(page, pattern, *, selector=None):
    """Resolve and click consent in one RPC, without waiting for navigation.

    A DOM click is already used for Google's field submits. Here it also avoids
    a sequence of reads on handles from a panel replaced during navigation.
    """
    return await page.evaluate('''args => {
      const active=ACTIVE;
      const re=new RegExp(args.pattern, 'i');
      let matches=Array.from(document.querySelectorAll(args.selector)).filter(e=>{
        if (!active(e)) return false;
        return [e.innerText,e.value,e.getAttribute('aria-label'),
          e.getAttribute('data-identifier'),e.getAttribute('data-email')].some(s=>s && re.test(s.trim()));
      });
      matches=matches.filter(e=>!matches.some(other=>other!==e && e.contains(other)));
      if (matches.length!==1) return false;
      matches[0].click();return true;
    }'''.replace('ACTIVE', ACTIVE_JS), {
        'pattern': pattern,
        'selector': selector or 'button,[role="button"],input[type="submit"],input[type="button"]',
    })
