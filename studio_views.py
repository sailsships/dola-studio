"""Pure projections shared by management and public status endpoints."""
from collections import Counter
from pathlib import Path

ENGINE_COUNTERS=frozenset(('account_count','healthy_count','standby_count','checking_count','unsigned_count','cooldown_count','expired_count','open_accounts','inflight','jobs_today'))
STORAGE_COUNTERS=frozenset(('tasks','running','db_bytes'))

def safe_counters(values,allowed):
    return {key:value for key,value in values.items() if key in allowed and type(value) is int}

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
