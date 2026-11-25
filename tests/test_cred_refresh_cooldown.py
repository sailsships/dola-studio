"""Run the actual refresh function with a controlled clock and a slow OAuth flow."""
import ast
import asyncio
from contextlib import asynccontextmanager
from pathlib import Path
from types import SimpleNamespace

import pytest


@pytest.mark.parametrize('failed', [True, False])
def test_slow_login_waits_a_full_cooldown_after_completion(failed):
    source = Path(__file__).resolve().parents[1] / 'server.py'
    tree = ast.parse(source.read_text(encoding='utf-8'))
    fn = next(n for n in tree.body if isinstance(n, ast.AsyncFunctionDef) and n.name == '_cred_try_refresh_once')
    clock = [1000.0]
    calls = []
    @asynccontextmanager
    async def held(*args):
        yield
    class Slot:
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
    pool = SimpleNamespace(accounts={'account': True}, _phases={},
        list_accounts=lambda: [{'name': 'account', 'login_ok': False, 'source': 'login'}],
        login_recovery=held, _use_account=held, set_email=lambda *a: None,
        set_login_status=lambda *a: None)
    async def flow(*args, **kwargs):
        calls.append(clock[0])
        clock[0] += 300
        if failed: raise TimeoutError('OAuth did not finish')
    env = dict(time=SimpleNamespace(time=lambda: clock[0]), pool=pool,
        cred_store=SimpleNamespace(all_names=lambda: ['account'], load=lambda n: {'email': 'test', 'password': 'test'}),
        JOBS={}, DELETING_ACCOUNTS=set(), LAST_CRED_REFRESH={},
        ADD_ACCOUNT_SEM=Slot(), ADD_SEM_HOLDER={'what': ''}, add_account_flow=flow)
    exec(compile(ast.Module(body=[fn], type_ignores=[]), str(source), 'exec'), env)
    async def scenario():
        await env['_cred_try_refresh_once']()
        clock[0] += 60
        await env['_cred_try_refresh_once']()
        assert calls == [1000.0], 'a long login must not immediately trigger another attempt'
        assert env['ADD_SEM_HOLDER']['what'] == ''
        clock[0] += 120
        await env['_cred_try_refresh_once']()
        assert calls == [1000.0, 1480.0]
    asyncio.run(scenario())
