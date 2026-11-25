"""Mode counts follow existing daily points, weekly locks and Fast 15s costs."""
import ast
import asyncio
import json
from pathlib import Path
import shutil
import subprocess
import sys
import types

import pytest

from studio_views import account_video_quota


def quota(**account):
    return account_video_quota(account, chat_cost=4, chat_start=2, now=1000)


def test_daily_and_weekly_exhaustion_are_independent():
    assert quota(remaining=4, work_blocked_until=1001) == {
        'chat_15s_remaining': 1, 'work_15s_remaining': 0}
    assert quota(remaining=0) == {'chat_15s_remaining': 0, 'work_15s_remaining': 1}
    # A daily reset replenishes points without resetting the weekly lock.
    assert quota(remaining=4, work_blocked_until=1001)['work_15s_remaining'] == 0
    assert quota(remaining=0, work_blocked_until=1000)['work_15s_remaining'] == 1


@pytest.mark.parametrize('remaining,count', [(0, 0), (1, 0), (2, 1), (4, 1), (5, 1), (6, 2)])
def test_chat_count_respects_dispatch_threshold_and_accounting(remaining, count):
    assert quota(remaining=remaining)['chat_15s_remaining'] == count


@pytest.mark.parametrize('extra', [
    {'rate_limited': True}, {'quota_blocked': True}, {'credit_balance': 0},
])
def test_daily_limits_do_not_consume_work_quota(extra):
    assert quota(remaining=4, **extra) == {'chat_15s_remaining': 0, 'work_15s_remaining': 1}


def test_custom_costs_and_account_status_do_not_fake_quota_changes():
    row = {'remaining': 8, 'busy': True, 'login_ok': 0, 'scheduling': False}
    assert account_video_quota(row, chat_cost=2, chat_start=2, now=1000) == {
        'chat_15s_remaining': 4, 'work_15s_remaining': 1}
    assert account_video_quota(row, chat_cost=8, chat_start=8, now=1000)['chat_15s_remaining'] == 1
    assert quota(site='doubao', remaining=4) == {}


def test_account_endpoint_projects_counts_and_loaded_frontend_renders_them(monkeypatch):
    """Exercise the real handler and the script actually referenced by index.html.

    Only pool/proxy I/O is stubbed; no browser account or network request is used.
    """
    root = Path(__file__).resolve().parents[1]
    handler = next(node for node in ast.parse((root / 'server.py').read_text(encoding='utf-8')).body
                   if isinstance(node, ast.AsyncFunctionDef) and node.name == 'admin_accounts')
    handler.decorator_list = []
    handler.args.defaults = [ast.Constant(value=None)]
    ast.fix_missing_locations(handler)
    rows = [
        {'name': 'full', 'site': 'dola', 'remaining': 4, 'limit': 4},
        {'name': 'daily-used', 'site': 'dola', 'remaining': 0, 'limit': 4},
        {'name': 'weekly-used', 'site': 'dola', 'remaining': 4, 'limit': 4,
         'work_blocked_until': 1001, 'work_block_reason': '<upstream>'},
        {'name': 'doubao', 'site': 'doubao', 'used_today': 2},
    ]
    monkeypatch.setitem(sys.modules, 'browser_pool', types.SimpleNamespace(
        duration_cost=lambda *args: 4, start_need=lambda *args: 2))
    monkeypatch.setitem(sys.modules, 'proxy_region', types.SimpleNamespace(account_state=lambda _: {}))
    calls = []
    namespace = {
        '_admin_auth': calls.append, 'account_video_quota': account_video_quota,
        'time': types.SimpleNamespace(time=lambda: 1000),
        'pool': types.SimpleNamespace(list_accounts=lambda **kw: rows,
                                     engine_snapshot=lambda: {}, next_quota_reset_at=lambda: 2000),
        'store': types.SimpleNamespace(busy_account_ids=lambda: set()),
        'proxy_store': types.SimpleNamespace(sessions_snapshot=lambda: {}),
        'get_account_proxy': lambda _: None,
        'config': types.SimpleNamespace(V20_DURATIONS=[5, 10], LIMIT_RESET_TZ='UTC',
                                       LIMIT_RESET_HOUR=0, EGRESS_SHARE_WARN=5),
        'JOBS': {}, 'DELETING_ACCOUNTS': set(), 'ACCOUNT_DELETE_ERRORS': {},
        '_group_summary': lambda *args: {},
    }
    namespace['pool'].egress_throttle_snapshot = lambda: []
    exec(compile(ast.Module(body=[handler], type_ignores=[]), '<admin_accounts>', 'exec'), namespace)
    response = asyncio.run(namespace['admin_accounts']('synthetic-admin'))
    assert calls == ['synthetic-admin']
    assert [(a.get('work_15s_remaining'), a.get('chat_15s_remaining')) for a in rows] == [
        (1, 1), (1, 0), (0, 1), (None, None)]
    assert response['next_reset_at'] == 2000
    node = shutil.which('node')
    if not node:
        pytest.skip('Node required for frontend verification')
    manifest = json.loads((root / 'web/app/manifest.json').read_text(encoding='utf-8'))
    active = next(path for path in manifest['order'] if path.startswith('app/accounts.'))
    assert active in (root / 'web/index.html').read_text(encoding='utf-8')
    source = (root / 'web' / active).read_text(encoding='utf-8')
    functions = source[source.index('function quotaCell('):source.index('function workReadyCount(')]
    script = """
const assert=require('node:assert/strict');
const TEST_GEN_DURATIONS={'seedance-2.0-fast':[5,10]};
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const fmt=()=> '2026-12-03 08:00';
Date.now=()=>1000000;
""" + functions + '\nconst rows=' + json.dumps(rows) + ";\n" + """
const full=quotaCell(rows[0]);
assert(full.includes('工作15s：剩余1条')&&full.includes('聊天15s：剩余1条'));
assert(full.indexOf('工作15s')<full.indexOf('聊天15s'));
assert(full.includes('每天北京时间08:00')&&full.includes('每7天'));
assert(!full.includes('<b>4</b> / 4'));
assert(quotaCell(rows[1]).includes('聊天15s：剩余0条'));
const weekly=quotaCell(rows[2]);
assert(weekly.includes('工作15s：剩余0条')&&weekly.includes('聊天15s：剩余1条'));
assert(weekly.includes('2026-12-03 08:00 恢复'));
assert(weekly.includes('&lt;upstream>')&&!weekly.includes('<upstream>'));
assert(quotaCell(rows[3]).includes('今日已出')&&!quotaCell(rows[3]).includes('聊天15s'));
assert(quotaCell({remaining:4,limit:4}).includes('聊天15s：剩余—条'));
"""
    subprocess.run([node], input=script, text=True, encoding='utf-8',
                   capture_output=True, check=True, timeout=15)
