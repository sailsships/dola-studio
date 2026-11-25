"""Extend only the Dola SDK's initial connection heartbeat deadline."""
import re

OPEN_TIMEOUT_MS = 60000
_INITIAL = re.compile(rb'\bopenHeartbeatTimeoutInterval:(?:15e3|15000)(?=,)')


def extend_completion_open_timeout(body):
    # These markers identify the SDK containing the native stream and retry
    # scheduler. Keep immutable cached originals; transform only served copies.
    if not all(marker in body for marker in (
        b'_startFetch()', b'getHeartbeatTimeoutConfigSnapshot()',
        b'scheduleHeartbeatDeadlineTimer()', b'heartbeatTimeoutConfig:')):
        return body, 0
    return _INITIAL.subn(b'openHeartbeatTimeoutInterval:60000', body)
