"""Pure projections shared by management and public status endpoints."""
from collections import Counter
from pathlib import Path

ENGINE_COUNTERS=frozenset(('account_count','healthy_count','standby_count','checking_count','unsigned_count','cooldown_count','expired_count','open_accounts','inflight','jobs_today'))
STORAGE_COUNTERS=frozenset(('tasks','running','db_bytes'))

def safe_counters(values,allowed):
    return {key:value for key,value in values.items() if key in allowed and type(value) is int}

def account_video_quota(account, *, chat_cost, chat_start, now):
    """Project daily points and weekly work quota into Fast 15s counts.

    Counts describe quota only; login, proxy and busy status remain separate.
    This does not create usage counters or change either reset schedule.
    """
    if account.get('site') == 'doubao':
        return {}
    remaining = max(0, int(account.get('remaining') or 0))
    balance = account.get('credit_balance')
    if balance is not None:
        remaining = min(remaining, max(0, int(balance)))
    cost, start = max(1, int(chat_cost)), max(1, int(chat_start))
    blocked = account.get('rate_limited') or account.get('quota_blocked')
    chat = 0 if blocked or remaining < start else 1 + (remaining - start) // cost
    work = int(float(account.get('work_blocked_until') or 0) <= now)
    return {'chat_15s_remaining': chat, 'work_15s_remaining': work}


def account_mode_capacity(accounts):
    """Sum mode counts for idle, verified accounts with scheduling enabled."""
    available = chat = work = 0
    for account in accounts:
        if (not account.get('scheduling') or account.get('busy')
                or account.get('login_ok') != 1 or account.get('login_in_progress')
                or account.get('risk_control') or account.get('duplicate_of')
                or account.get('group') in ('风控', '异常', '待激活', '登录处理中')):
            continue
        if account.get('site') == 'doubao':
            available += int(not account.get('rate_limited') and not account.get('quota_blocked')
                             and int(account.get('remaining') or 0) > 0)
            continue
        daily = max(0, int(account.get('chat_15s_remaining') or 0))
        weekly = max(0, int(account.get('work_15s_remaining') or 0))
        chat += daily
        work += weekly
        available += int(daily > 0 or weekly > 0)
    return {'available_accounts': available, 'chat_15s_available': chat, 'work_15s_available': work}


def download_bytes(directory):
    total=0
    try:
        entries=Path(directory).iterdir()
        for entry in entries:
            try:
                if entry.is_file():total+=entry.stat().st_size
            except OSError:
                continue
    except OSError:
        pass
    return total

def public_health(*,version,engine,storage,downloads,retention,progress,pending,workers,login,add_jobs,eta,available,max_pending):
    metrics=safe_counters(storage,STORAGE_COUNTERS)
    metrics.update(downloads_bytes=download_bytes(downloads),retention_days=retention)
    running=progress['running']
    return {'ok':True,'version':version,'pool':safe_counters(engine,ENGINE_COUNTERS),'storage':metrics,
            'queue':{'queued':pending-running,'running':running,'add_jobs_running':add_jobs,'workers':workers,'login':login,
                     'typical_seconds':progress['typical_seconds'],'eta_text':eta(progress['typical_seconds'])},
            'available':available,'pending_tasks':pending,'max_pending_tasks':max_pending}

def account_summary(accounts,jobs,*,deleted,group_order,active_groups,incomplete):
    visible_jobs={name:job for name,job in (jobs or {}).items() if name not in deleted}
    visible=[]
    for account in accounts:
        name=account['name']
        if name in deleted:continue
        job=visible_jobs.get(name,{})
        adding=job.get('kind')=='add' and (job.get('status') in ('running','cancelling') or job.get('status')=='failed' and incomplete(account))
        if not adding:visible.append(account)
    totals=Counter(account.get('group') for account in visible)
    groups={group:totals[group] for group in group_order}
    known={account['name'] for account in visible}
    pending=[job for name,job in visible_jobs.items() if name not in known and job.get('kind')=='add' and job.get('status') in ('running','cancelling','failed')]
    groups['加号中']=sum(job['status'] in ('running','cancelling') for job in pending)
    groups['加号失败']=sum(job['status']=='failed' for job in pending)
    return {'groups':groups,'group_order':list(group_order),'all_count':len(visible)+len(pending),
            'valid_count':sum(groups[group] for group in active_groups),
            'remaining_points':sum(int(account.get('remaining') or 0) for account in visible if account.get('group') in active_groups)}
