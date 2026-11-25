# Read scheduling architecture

StudioRefresh owns per-resource read coordination; StudioHttp owns HTTP parsing
and GET coalescing. Neither layer retries writes or resubmits video generations.

request(key): join the active read, or start a new one.
request(key, {fresh:true}): if a read is active, queue one additional read of
that same key. Concurrent manual clicks share the queued refresh.
request(key, {background:true}): apply failure backoff (2s, 4s, 8s, 16s, 30s cap).
status(key): immutable, payload-free scheduling metadata for that resource.

The console adapter blocks reads on the login screen and background reads while
offline or hidden. A queued read rechecks eligibility when it is dispatched.
Only the selected tab may update the visible freshness stamp. Failed prefetches
remain eligible for later passes; they are not marked successfully loaded.

New scripts use content-addressed filenames. Deployment publishes those files
before atomically switching index.html. Existing tabs retain compatible scripts;
the deployment does not restart the backend or change task/account data.

Test: node tests/studio/refresh-engine.test.mjs
Limit: service polling for an already accepted generation is a separate flow;
it is intentionally not throttled by this list-refresh scheduler.
