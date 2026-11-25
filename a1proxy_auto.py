"""On-demand A1Proxy inventory from an explicitly configured session template.

The provider assigns an exit when the generated credential is first used. No
management token, purchase request or periodic extraction job is necessary.
"""
import re
import time


BATCH_SIZE = 50
MIN_INTERVAL = 60


def configured(info: dict) -> bool:
    host = str(info.get("host") or "").lower().rstrip(".")
    template = info.get("session_template") or ""
    return bool(
        info.get("mode") == "extract"
        and info.get("enabled")
        and not info.get("extract_url")
        and (host == "a1proxy.com" or host.endswith(".a1proxy.com"))
        and info.get("username") and info.get("password")
        and re.search(r"(?:^|-)region-(?:JP|KR)(?:-|$)",info.get("username") or "",re.I)
        and re.fullmatch(r"\{user\}-session-\{session\}-sessionTime-(?:[1-9]|[1-9][0-9]|1[01][0-9]|120)", template)
    )


def selector_region(username):
    match = re.search(r'(?:^|-)region-(JP|KR)(?:-|$)', username or '', re.I)
    return match.group(1).upper() if match else ''


def preferred_region(info, conn, now=None):
    """After two distinct wrong-country KR exits, use JP for five minutes."""
    requested = selector_region(info.get('username'))
    if requested != 'KR':
        return requested
    now = time.time() if now is None else now
    rows = conn.execute("""SELECT e.node_id,e.rejected,n.username
        FROM proxy_region_events e JOIN proxy_nodes n ON n.id=e.node_id
        WHERE e.proxy_id=? AND e.checked_at>=? ORDER BY e.id DESC""",
        (info['id'], now - 300)).fetchall()
    recent = []; seen = set()
    for row in rows:
        if selector_region(row['username']) != 'KR' or row['node_id'] in seen:
            continue
        seen.add(row['node_id']); recent.append(bool(row['rejected']))
        if len(recent) == 2:
            break
    return 'JP' if recent == [True, True] else requested


def replenish(proxy_id: str) -> dict:
    """Atomically replenish credentials, retaining all discarded sessions.

    Re-read configuration under SQLite's write lock: concurrent requests and
    stale callers cannot exceed the batch/interval limits. Generated nodes are
    unbound and must pass the normal connection check before allocation.
    """
    import proxy_store as store

    conn = store._connect()
    try:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT * FROM proxies WHERE id=?", (proxy_id,)).fetchone()
        info = dict(row) if row else {}
        if not configured(info):
            return {"ok": False, "added": 0, "error": "A1Proxy 自动会话未配置"}
        now = time.time()
        interval = max(MIN_INTERVAL, int(info.get("extract_interval") or 0))
        if now - float(info.get("extract_last_at") or 0) < interval:
            return {"ok": True, "added": 0, "throttled": True, "source": "a1proxy-session"}
        store._retire_expired_nodes(conn, proxy_id)
        remaining = store._remaining_node_counts(conn).get(proxy_id, 0)
        region = preferred_region(info, conn, now)
        requested = selector_region(info['username'])
        eligible = remaining
        if region != requested:
            # Pending KR credentials cannot block fresh JP fallback inventory.
            claimed = {r['node_id'] for r in conn.execute('SELECT node_id FROM proxy_sessions WHERE node_id>0')}
            eligible = 0
            import proxy_region, proxy_availability
            for row in conn.execute('SELECT * FROM proxy_nodes WHERE proxy_id=? AND dead=0', (proxy_id,)):
                node = dict(row); url = store._url_from_node(node)
                if row['id'] in claimed or store._node_expired(node, now):
                    continue
                if selector_region(row['username']) != region:
                    continue
                if proxy_region.get_state(url, conn).get('rejected') or proxy_availability.state(url, conn):
                    continue
                eligible += 1
        count = max(0, min(BATCH_SIZE - eligible, 2 * BATCH_SIZE - remaining))
        base_user = re.sub(r'(?<=-region-)(?:KR|JP)(?=-|$)', region, info['username'], flags=re.I)
        ttl = int(info["session_template"].rsplit("-", 1)[1]) * 60
        added = 0
        for _ in range(count):
            username = store.render_session_username(
                info["session_template"], base_user, store._new_session_id()
            )
            if conn.execute(
                "SELECT 1 FROM proxy_nodes WHERE proxy_id=? AND username=?", (proxy_id, username)
            ).fetchone():
                continue  # Never resurrect an old/discarded provider session.
            conn.execute(
                """INSERT INTO proxy_nodes
                   (proxy_id,protocol,host,port,username,password,exit_hint,
                    created_at,expires_at,dead,fail_count,expiry_mode,ttl_seconds,first_used_at)
                   VALUES (?,?,?,?,?,?,?,?,0,0,0,'first_use',?,0)""",
                (proxy_id, info["protocol"], info["host"], info["port"], username,
                 info["password"], username, now, ttl),
            )
            added += 1
        conn.execute(
            "UPDATE proxies SET extract_last_at=?,extract_last_count=?,extract_last_error='' WHERE id=?",
            (now, added, proxy_id),
        )
        conn.commit()
        return {"ok": True, "added": added, "total_lines": added, "source": "a1proxy-session", "requested_country": region}
    except Exception:
        conn.rollback()
        # Do not return a credential, a URL, or a raw SQLite exception.
        return {"ok": False, "added": 0, "error": "A1Proxy 自动补充失败，请检查池配置和数据库状态"}
    finally:
        conn.close()
