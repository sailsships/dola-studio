"""Connection-based retirement of dynamic routes; deadlines are advisory only."""
import proxy_retry_budget
import hashlib
import json
import time

def digest(url):return hashlib.sha256(str(url or '').encode()).hexdigest()

def init_schema(conn):
    conn.execute('''CREATE TABLE IF NOT EXISTS proxy_unusable_routes (
        route_hash TEXT PRIMARY KEY, proxy_id TEXT NOT NULL, node_id INTEGER NOT NULL DEFAULT 0,
        failed_at REAL NOT NULL, detail TEXT NOT NULL, accounts TEXT NOT NULL DEFAULT '[]')''')

def state(url,conn=None):
    import proxy_store
    owned=conn is None;conn=conn if conn is not None else proxy_store._connect()
    try:
        row=conn.execute('SELECT * FROM proxy_unusable_routes WHERE route_hash=?',(digest(url),)).fetchone()
        return dict(row) if row else {}
    finally:
        if owned:conn.close()

def check_connection(url, *, target='https://www.dola.com/favicon.ico', attempts=2):
    """Two transport failures retire a route. HTTP auth/risk responses from the site do not."""
    import requests
    if not url or url=='direct':return {'ok':False,'unusable':False,'detail':'未配置代理'}
    attempts=max(2,min(3,int(attempts)))
    details=[];transport_failures=0
    for _ in range(attempts):
        timeout = proxy_retry_budget.request_timeout(5, 8)
        try:
            with requests.Session() as client:
                client.trust_env=False
                response=client.get(target,proxies={'http':url,'https':url},
                                    timeout=timeout,allow_redirects=False,stream=True)
                with response:
                    if response.status_code in (407,502,503,504):
                        details.append('连接检查 HTTP '+str(response.status_code));transport_failures+=1
                    else:return {'ok':True,'unusable':False,'detail':'HTTP '+str(response.status_code)}
        except (requests.exceptions.ProxyError,requests.exceptions.ConnectionError,requests.exceptions.Timeout) as exc:
            transport_failures+=1;details.append(type(exc).__name__)
        except Exception as exc:
            # Missing optional drivers or programming/config errors cannot prove a dead exit.
            return {'ok':False,'unusable':False,'detail':'连接未确认：'+type(exc).__name__}
    proxy_retry_budget.check()
    return {'ok':False,'unusable':transport_failures==attempts,
            'detail':'连续 '+str(attempts)+' 次连接不可用：'+' / '.join(details)}

def discard(url, *, proxy_id, node_id=0, detail='连接不可用'):
    """Keep the failed route and its prior account owners in a permanent ledger."""
    import proxy_store
    info=proxy_store.get_proxy(proxy_id)
    if not info or info.get('mode') not in ('dynamic','extract'):return False
    conn=proxy_store._connect()
    try:
        conn.execute('BEGIN IMMEDIATE');key=digest(url)
        nodes=[dict(r) for r in conn.execute('SELECT * FROM proxy_nodes WHERE proxy_id=?',(proxy_id,))
               if digest(proxy_store._url_from_node(dict(r)))==key]
        ids=[n['id'] for n in nodes]
        owners=[]
        for r in conn.execute('SELECT * FROM proxy_sessions WHERE proxy_id=?',(proxy_id,)):
            if info['mode']=='extract':matches=r['node_id'] in ids
            else:
                user=proxy_store.render_session_username(info.get('session_template') or '',info.get('username') or '',r['session'])
                matches=digest(proxy_store._url_from_record(info,user))==key
            if matches:owners.append(r['account'])
        previous=state(url,conn)
        owners=sorted(set(owners+json.loads(previous.get('accounts') or '[]')))
        conn.execute('''INSERT INTO proxy_unusable_routes(route_hash,proxy_id,node_id,failed_at,detail,accounts)
            VALUES(?,?,?,?,?,?) ON CONFLICT(route_hash) DO UPDATE SET accounts=excluded.accounts''',
            (key,proxy_id,node_id or (ids[0] if ids else 0),time.time(),str(detail)[:250],json.dumps(owners)))
        for nid in ids:conn.execute('UPDATE proxy_nodes SET dead=1,fail_count=fail_count+CASE WHEN dead=0 THEN 1 ELSE 0 END WHERE id=?',(nid,))
        conn.commit();return True
    except Exception:
        conn.rollback();raise
    finally:conn.close()

def finish_probe(url,result,*,proxy_id,node_id=0):
    """A geolocation error alone never discards an otherwise reachable route."""
    import proxy_store
    result=dict(result)
    info=proxy_store.get_proxy(proxy_id)
    if result.get('ok') or result.get('removed') or not info or info.get('mode') not in ('dynamic','extract'):return result
    check=check_connection(url)
    result['connection_ok']=check['ok']
    if check.get('unusable'):
        discard(url,proxy_id=proxy_id,node_id=node_id,detail=check['detail'])
        result.update(discarded=True,unusable=True,error='连接不可用，已弃用：'+check['detail'])
    return result
