"""Fail closed on actual exit geography, independent of provider labels."""
import time

import proxy_store
import proxy_region

CACHE_SECONDS = 300


def check_route(url, *, proxy_id, node_id=0, force=False):
    state=proxy_region.get_state(url)
    if state.get('rejected'):
        return {'ok':False,'removed':True,'country_code':state.get('country_code'),
                'error':'该节点已因非日韩出口被弃用'}
    if not force and state.get('country_code') in proxy_region.ALLOWED_COUNTRIES and 0<=time.time()-float(state.get('checked_at') or 0)<CACHE_SECONDS:
        return {'ok':True,'country_code':state['country_code'],'ip':state.get('exit_ip'),'cached':True}
    result=proxy_region.apply_result(url,proxy_store.probe_exit_ip(url,timeout=8),
                                     proxy_id=proxy_id,node_id=node_id)
    if not result.get('ok'):
        result['error']='出口非日韩，已弃用' if result.get('removed') else '出口地区未确认，暂不分配'
    return result


def require_route(url, *, proxy_id, node_id=0):
    result=check_route(url,proxy_id=proxy_id,node_id=node_id)
    if not result.get('ok'):
        raise RuntimeError(result['error'])
    return result
