"""Account health and display counts must stay independent of upstream accounting."""
import ast
import asyncio
import json
from pathlib import Path
import shutil
import subprocess
import sys
import types

import pytest

from studio_views import account_mode_capacity, account_video_quota


def test_weekly_capacity_survives_daily_exhaustion_and_skips_unavailable_accounts():
    rows = [dict(name='work-only', site='dola', scheduling=True, login_ok=1,
                 group='冷却', remaining=0, chat_15s_remaining=0, work_15s_remaining=1),
            dict(name='chat-only', site='dola', scheduling=True, login_ok=1,
                 chat_15s_remaining=1, work_15s_remaining=0)]
    for extra in ({'busy': True}, {'scheduling': False}, {'login_ok': 0},
                  {'login_in_progress': True}, {'risk_control': True},
                  {'duplicate_of': 'original'}, {'group': '异常'}):
        rows.append({**rows[1], **extra})
    rows.append(dict(site='doubao', scheduling=True, login_ok=1, remaining=999))
    assert account_mode_capacity(rows) == {
        'available_accounts': 3, 'chat_15s_available': 1, 'work_15s_available': 1}


def test_real_stats_handler_includes_mode_counts_without_mutating_quota(monkeypatch):
    root = Path(__file__).resolve().parents[1]
    fn = next(n for n in ast.parse((root / 'server.py').read_text(encoding='utf-8')).body
              if isinstance(n, ast.AsyncFunctionDef) and n.name == 'admin_stats')
    fn.decorator_list = []
    fn.args.defaults = [ast.Constant(None)]
    ast.fix_missing_locations(fn)
    rows = [dict(name='daily-used', site='dola', scheduling=True, login_ok=1,
                 group='冷却', remaining=0, cooling=True)]
    calls = []
    monkeypatch.setitem(sys.modules, 'browser_pool', types.SimpleNamespace(
        duration_cost=lambda *args: 4, start_need=lambda *args: 2))
    namespace = dict(_admin_auth=calls.append,
                     pool=types.SimpleNamespace(list_accounts=lambda **kw: rows),
                     store=types.SimpleNamespace(stats=lambda: {'per_account_total': {}},
                                                 busy_account_ids=lambda: set()),
                     account_video_quota=account_video_quota,
                     account_mode_capacity=account_mode_capacity,
                     time=types.SimpleNamespace(time=lambda: 1000), JOBS={},
                     _group_summary=lambda *args: {})
    exec(compile(ast.Module(body=[fn], type_ignores=[]), '<admin_stats>', 'exec'), namespace)
    result = asyncio.run(namespace['admin_stats']('test-admin'))
    assert calls == ['test-admin']
    assert result['available_accounts'] == result['work_15s_available'] == 1
    assert result['chat_15s_available'] == rows[0]['remaining'] == 0
    assert result['per_account'][0]['work_15s_remaining'] == 1


def test_loaded_account_ui_filters_health_and_keeps_optimistic_updates():
    node = shutil.which('node')
    if not node:
        pytest.skip('Node required for frontend verification')
    root = Path(__file__).resolve().parents[1]
    manifest = json.loads((root / 'web/app/manifest.json').read_text())
    active = next(n for n in manifest['order'] if n.startswith('app/accounts.'))
    source = (root / 'web' / active).read_text(encoding='utf-8')
    functions = source[source.index("let groupFilterVal='all'"):source.index('/** 出口显示名')]
    matching = source[source.index('function matchGroup('):source.index('function srcBadge(')]
    script = r'''
const assert=require('node:assert/strict');
const pendingVerifications=new Map(),pendingGenerations=new Map();
const TEST_GEN_DURATIONS={};
let html='';
const setHTML=(_,value)=>{html=value;},q=()=>null,moveGroupInd=()=>{};
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const workReadyCount=()=>0;
''' + functions + matching + r'''
const healthy=(name,group,remaining)=>({name,group,remaining,login_ok:1,email:name+'@example.test',group_reason:`剩余 ${remaining} 点`});
const rows=[healthy('full','满额',4),healthy('half','半额',2),healthy('daily-used','冷却',0),
 {...healthy('busy','生成中',4),busy:true},
 {name:'risk',group:'风控',login_ok:0,risk_control:true},
 {name:'expired',group:'风控',login_ok:0},
 {name:'new',group:'待激活',login_ok:null},
 {name:'verify',group:'风控',login_ok:0,login_in_progress:true,operation:'verifying'}];
const original=JSON.stringify(rows);
let snap=addJobDisplaySnapshot(loginDisplaySnapshot({accounts:rows}),{});
assert.equal(snap.groups['正常'],3);
assert.equal(snap.valid_count,4);
assert.equal(snap.groups['登录失效'],1);
assert.equal(snap.groups['登录处理中'],1);
assert.equal(Object.values(snap.groups).reduce((a,b)=>a+b),snap.all_count);
for(const row of rows.slice(0,3))assert(!/满额|半额|冷却|积分|点数|剩余\s*\d+\s*点/.test(groupBadge(row)));
groupFilterVal='正常';assert.equal(rows.filter(matchGroup).length,3);
groupFilterVal='valid';assert.equal(rows.filter(matchGroup).length,4);
groupFilterVal='登录失效';assert.deepEqual(rows.filter(matchGroup).map(a=>a.name),['expired']);
pendingVerifications.set('full',Date.now());
assert.equal(accountState(rows[0]).label,'登录处理中');pendingVerifications.clear();
pendingGenerations.set('half',{phase:'已提交，等待出片'});
assert.equal(accountState(rows[1]).label,'生成中');pendingGenerations.clear();
const failed={kind:'add',status:'failed',email:'failed@example.test',error:'登录失败'};
snap=addJobDisplaySnapshot(loginDisplaySnapshot({accounts:rows}),{failed});
assert.equal(snap.groups['加号失败'],1);assert.equal(snap.all_count,rows.length+1);
renderGroupBar(snap);
assert(!/满额|半额|冷却|积分|点数|剩余\s*\d+\s*点/.test(html));
assert(html.includes("setGroupFilter('正常')"));
assert.equal(JSON.stringify(rows),original);
'''
    subprocess.run([node], input=script, text=True, encoding='utf-8',
                   capture_output=True, check=True, timeout=15)
