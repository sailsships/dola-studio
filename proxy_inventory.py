"""Read-only node accounting shared by the pool list and node detail."""
import time


def snapshot(conn, nodes, *, now=None):
    import proxy_store as store
    import proxy_region
    from proxy_country_gate import CACHE_SECONDS

    now = time.time() if now is None else now
    owners = {}
    for row in conn.execute('SELECT account,node_id FROM proxy_sessions WHERE node_id>0'):
        owners.setdefault(row['node_id'], []).append(row['account'])
    regions = {row['route_hash']: dict(row) for row in conn.execute('SELECT * FROM proxy_region_state')}
    failures = {row['route_hash']: dict(row) for row in conn.execute('SELECT * FROM proxy_unusable_routes')}
    stats, fields = {}, {}
    for raw in nodes:
        node = dict(raw)
        summary = stats.setdefault(node['proxy_id'], dict(total=0, assigned=0, available=0, pending=0, discarded=0))
        summary['total'] += 1
        digest = proxy_region.route_hash(store._url_from_node(node))
        region, failure = regions.get(digest, {}), failures.get(digest, {})
        expired = store._node_expired(node, now)
        discarded = bool(node.get('dead') or expired or region.get('rejected') or failure)
        verified = bool(not discarded and region.get('country_code') in proxy_region.ALLOWED_COUNTRIES
                        and 0 <= now - float(region.get('checked_at') or 0) < CACHE_SECONDS)
        accounts = sorted(owners.get(node['id'], []))
        state = 'discarded' if discarded else 'assigned' if accounts else 'available' if verified else 'pending'
        summary[state] += 1
        fields[node['id']] = dict(
            inventory_state=state, assigned_accounts=accounts, country_verified=verified,
            expired=expired, dead=int(discarded), country_code=region.get('country_code', ''),
            region_checked_at=region.get('checked_at', 0), region_rejected=bool(region.get('rejected')),
            region_detail=region.get('detail', ''),
            discarded_reason='会话已过期' if expired else failure.get('detail', ''),
            discarded_at=failure.get('failed_at', 0),
        )
    return stats, fields
