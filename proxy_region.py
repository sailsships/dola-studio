"""Persist probe decisions by exact proxy route; never infer location from a label."""
import hashlib
import ipaddress
import re
import time

ALLOWED_COUNTRIES = frozenset(('JP', 'KR'))


def init_schema(conn):
    conn.execute('''CREATE TABLE IF NOT EXISTS proxy_region_state (
        route_hash TEXT PRIMARY KEY, proxy_id TEXT NOT NULL, node_id INTEGER DEFAULT 0,
        country_code TEXT DEFAULT '', exit_ip TEXT DEFAULT '', checked_at REAL NOT NULL,
        rejected INTEGER NOT NULL DEFAULT 0, detail TEXT DEFAULT '')''')
    conn.execute('''CREATE TABLE IF NOT EXISTS proxy_region_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT, route_hash TEXT NOT NULL,
        proxy_id TEXT NOT NULL, node_id INTEGER DEFAULT 0, country_code TEXT DEFAULT '',
        exit_ip TEXT DEFAULT '', checked_at REAL NOT NULL,
        rejected INTEGER NOT NULL, detail TEXT DEFAULT '')''')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_proxy_region_node ON proxy_region_state(node_id)')


def route_hash(url):
    return hashlib.sha256(str(url or '').encode()).hexdigest()


def get_state(url, conn=None):
    import proxy_store
    owned = conn is None
    conn = conn if conn is not None else proxy_store._connect()
    try:
        row = conn.execute('SELECT * FROM proxy_region_state WHERE route_hash=?',
                           (route_hash(url),)).fetchone()
        return dict(row) if row else {}
    finally:
        if owned:conn.close()


def assert_allowed(url, conn=None):
    state = get_state(url, conn)
    if state.get('rejected'):
        raise RuntimeError('代理出口非日韩，已剔除：' + (state.get('country_code') or '未知') +
                           '；原账号绑定保留，请在代理管理中处理')


def apply_result(url, result, *, proxy_id, node_id=0):
    """Only a successful, valid IP + ISO country response can reject a route.

    A subsequent timeout or an allowed IP never silently revives a rejected
    sticky route; the removal remains in effect across probes and restarts.
    """
    import proxy_store
    result = dict(result)
    code = str(result.get('country_code') or '').strip().upper()
    valid = bool(re.fullmatch('[A-Z]{2}', code)) and code not in ('XX','ZZ','UN','EU','AP')
    try:ipaddress.ip_address(result.get('ip') or '')
    except ValueError:valid = False
    if not result.get('ok') or not valid:
        result.update(ok=False, region_status='unknown', removed=False)
        result['error'] = result.get('error') or '地区未确认，未剔除；请重新探测'
        return result
    rejected = code not in ALLOWED_COUNTRIES
    reason = '非日韩，已剔除（' + code + '）' if rejected else ''
    stamp = time.time()
    digest = route_hash(url)
    conn = proxy_store._connect()
    try:
        conn.execute('BEGIN IMMEDIATE')
        previous = get_state(url, conn)
        blocked = rejected or bool(previous.get('rejected'))
        if blocked and not reason:
            reason = '该节点此前已因非日韩被剔除，未自动恢复'
        conn.execute('''INSERT INTO proxy_region_state
            (route_hash,proxy_id,node_id,country_code,exit_ip,checked_at,rejected,detail)
            VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(route_hash) DO UPDATE SET
            proxy_id=excluded.proxy_id,node_id=excluded.node_id,
            country_code=excluded.country_code,exit_ip=excluded.exit_ip,
            checked_at=excluded.checked_at,rejected=excluded.rejected,detail=excluded.detail''',
            (digest,proxy_id,node_id,code,result['ip'],stamp,int(blocked),reason))
        conn.execute('''INSERT INTO proxy_region_events
            (route_hash,proxy_id,node_id,country_code,exit_ip,checked_at,rejected,detail)
            VALUES (?,?,?,?,?,?,?,?)''',
            (digest,proxy_id,node_id,code,result['ip'],stamp,int(blocked),reason))
        if node_id:
            conn.execute('''UPDATE proxy_nodes SET dead=CASE WHEN ? THEN 1 ELSE dead END,
                last_exit_ip=?,last_ok_at=? WHERE id=? AND proxy_id=?''',
                (int(blocked),result['ip'],stamp,node_id,proxy_id))
        affected = []
        if blocked:
            # Pause scheduling without changing login status or deleting account bindings.
            for row in conn.execute('''SELECT ap.account,p.*,s.session,s.node_id
                    FROM account_proxy ap JOIN proxies p ON p.id=ap.proxy_id
                    LEFT JOIN proxy_sessions s ON s.account=ap.account''').fetchall():
                route = dict(row)
                if route.get('mode') == 'extract':
                    n = conn.execute('SELECT * FROM proxy_nodes WHERE id=?',
                                     (route.get('node_id') or 0,)).fetchone()
                    current = proxy_store._url_from_node(dict(n)) if n else ''
                elif route.get('mode') == 'dynamic':
                    user = proxy_store.render_session_username(route.get('session_template') or '',
                                    route.get('username') or '',route.get('session') or '')
                    current = proxy_store._url_from_record(route,user)
                else:current = proxy_store._url_from_record(route)
                if route_hash(current) == digest:
                    affected.append(route['account'])
            has_meta = conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='accounts_meta'").fetchone()
            if affected and has_meta:
                conn.executemany('UPDATE accounts_meta SET scheduling=0 WHERE name=?',
                                 [(name,) for name in affected])
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    result.update(ok=not blocked, country_code=code,
                  region_status='rejected' if blocked else 'allowed',
                  removed=bool(blocked), checked_at=stamp, paused_accounts=affected)
    if blocked:result['error'] = reason
    return result


def node_fields(node, conn=None):
    import proxy_store
    state = get_state(proxy_store._url_from_node(node), conn)
    return {key:state.get(key, default) for key,default in (
        ('country_code',''),('checked_at',0),('rejected',False),('detail',''))}


def account_state(account):
    import proxy_store
    info = proxy_store.get_account_proxy(account)
    if not info:return {}
    session = proxy_store.get_session(account) or {}
    if info.get('mode') == 'extract':
        node = proxy_store._node_by_id(session.get('node_id'))
        if not node or node.get('proxy_id') != info['id']:return {}
        url = proxy_store._url_from_node(node)
    elif info.get('mode') == 'dynamic':
        if session.get('proxy_id') != info['id']:return {}
        user = proxy_store.render_session_username(info.get('session_template') or '',
                    info.get('username') or '', session['session'])
        url = proxy_store._url_from_record(info,user)
    else:url = proxy_store._url_from_record(info)
    state = get_state(url)
    return {k:state.get(k) for k in ('country_code','exit_ip','checked_at','rejected','detail')}
