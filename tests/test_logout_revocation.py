"""Use actual SQLite session storage and auth/logout functions in isolation."""
import ast
import asyncio
import importlib.util
import secrets
import sys
import time
from pathlib import Path
from types import SimpleNamespace

from fastapi import HTTPException
import pytest


def test_logout_revokes_cached_and_persisted_token_only(tmp_path, monkeypatch):
    root = Path(__file__).resolve().parents[1]
    monkeypatch.setitem(sys.modules, 'config', SimpleNamespace(POOL_DB_PATH=str(tmp_path/'users.db')))
    spec = importlib.util.spec_from_file_location('logout_user_store_test', root/'user_store.py')
    store = importlib.util.module_from_spec(spec);spec.loader.exec_module(store)
    one, other = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    session = dict(username='admin', role='owner', expires_at=time.time()+300)
    for token in [one, other]: store.save_session(token, **session)
    env = dict(time=time, user_store=store, user_get=store.get_user,
               ADMIN_SESSIONS={one:dict(session),other:dict(session)}, HTTPException=HTTPException,
               Header=lambda **kwargs: None)
    tree = ast.parse((root/'server.py').read_text(encoding='utf-8'))
    nodes = [n for n in tree.body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)) and n.name in ['_admin_auth','admin_logout']]
    for n in nodes: n.decorator_list=[]
    exec(compile(ast.Module(body=nodes,type_ignores=[]),str(root/'server.py'),'exec'),env)
    assert asyncio.run(env['admin_logout'](one)) == {'ok':True}
    assert store.load_session(one) is None and one not in env['ADMIN_SESSIONS']
    for sessions in [env['ADMIN_SESSIONS'], {}]:
        env['ADMIN_SESSIONS'] = sessions
        with pytest.raises(HTTPException) as caught: env['_admin_auth'](one)
        assert caught.value.status_code == 401
        env['_admin_auth'](other)
    assert store.load_session(other) is not None
