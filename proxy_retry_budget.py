"""Cooperative deadline shared by one account's serial proxy probes."""
import contextvars
import time

now = time.monotonic

CURRENT = contextvars.ContextVar('proxy_retry_budget', default=None)


class ProbeStopped(BaseException):
    """Escape broad transport-error handlers without retiring a healthy route."""


def check():
    budget = CURRENT.get()
    if budget and (budget['cancel'].is_set() or now() >= budget['deadline']):
        raise ProbeStopped()


def request_timeout(connect, read):
    check()
    budget = CURRENT.get()
    if not budget:
        return (connect, read)
    from urllib3.util import Timeout
    return Timeout(total=max(.001, budget['deadline'] - now()),
                   connect=connect, read=read)
