"""Bounded OAuth slots shared by add, import and credential refresh jobs."""
import os
from pathlib import Path

from concurrency import AdjustableConcurrency


def default_limit(meminfo=None):
    """Retain serial operation on small or already memory constrained hosts."""
    try:
        text = Path('/proc/meminfo').read_text() if meminfo is None else meminfo
        values = {line.split(':', 1)[0]: int(line.split()[1])
                  for line in text.splitlines() if line.startswith(('MemTotal:', 'MemAvailable:'))}
        return 2 if values['MemTotal'] >= 3 * 1024 * 1024 and values['MemAvailable'] >= 1536 * 1024 else 1
    except (OSError, ValueError, KeyError, IndexError):
        return 1


def configured_limit():
    raw = os.getenv('DOLA_LOGIN_CONCURRENCY', '').strip()
    if not raw:
        return default_limit()
    try:
        value = int(raw)
    except ValueError as exc:
        raise ValueError('DOLA_LOGIN_CONCURRENCY must be an integer from 1 to 4') from exc
    if not 1 <= value <= 4:
        raise ValueError('DOLA_LOGIN_CONCURRENCY must be an integer from 1 to 4')
    return value


class LoginSlots(AdjustableConcurrency):
    def locked(self):
        return self.active >= self.limit

    def snapshot(self):
        return {'limit': self.limit, 'active': self.active, 'waiting': self.waiting}


slots = LoginSlots(configured_limit())
