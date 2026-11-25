import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';
globalThis.window=globalThis;
vm.runInThisContext(fs.readFileSync(new URL('../../web/app/refresh-engine.71c9bbf1c395.js',import.meta.url),'utf8'));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
let clock=1000,allowed=true,calls=[],pending=[],events=[];
const engine=StudioRefresh.create({
 now:()=>clock,
 canRun:()=>allowed,
 onSettled:(key,event)=>events.push({key,...event}),
 load:(key,options)=>{const work=deferred();calls.push({key,options});pending.push(work);return work.promise;}
});
const flush=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
// Concurrent readers share one operation; resources remain independent.
let a=engine.request('accounts'),b=engine.request('accounts');assert.equal(a,b);await flush();assert.equal(calls.length,1);
let c=engine.request('tasks');await flush();assert.equal(calls.length,2);pending[0].resolve('account-result');pending[1].resolve('task-result');assert.equal(await a,'account-result');assert.equal(await c,'task-result');assert.equal(engine.status('accounts').loaded,true);
// Manual refresh queues one new read; automatic joins cannot absorb it.
a=engine.request('accounts');await flush();b=engine.request('accounts',{fresh:true});c=engine.request('accounts',{fresh:true});assert.equal(b,c);assert.equal(engine.status('accounts').queued,true);assert.equal(calls.length,3);
pending[2].resolve('old');assert.equal(await a,'old');await flush();assert.equal(calls.length,4);assert.equal(calls.at(-1).key,'accounts');const joining=engine.request('accounts',{background:true});pending[3].resolve('fresh');assert.equal(await b,'fresh');assert.equal(await joining,'fresh');assert.equal(calls.length,4);assert.equal(engine.status('accounts').queued,false);
// Failure backs off automatic reads, not interactive reads; no automatic retries.
a=engine.request('failing');await flush();pending[4].reject(new Error('offline'));await assert.rejects(a,/offline/);assert.equal(engine.status('failing').retryAt,3000);await engine.request('failing',{background:true});assert.equal(calls.length,5);
a=engine.request('failing');await flush();assert.equal(calls.length,6);pending[5].reject(new Error('again'));await assert.rejects(a,/again/);assert.equal(engine.status('failing').retryAt,5000);
clock=5000;a=engine.request('failing',{background:true});await flush();pending[6].resolve('recovered');await a;assert.equal(engine.status('failing').failures,0);assert.equal(engine.status('failing').retryAt,0);
// Logout/offline between the original read and a queued manual read prevents dispatch.
a=engine.request('logout');await flush();b=engine.request('logout',{fresh:true});allowed=false;pending[7].resolve();await a;await b;assert.equal(calls.length,8);assert.equal(engine.status('logout').queued,false);allowed=true;
// A queued manual read still runs after the original fails.
a=engine.request('rejection');await flush();b=engine.request('rejection',{fresh:true});pending[8].reject(new Error('first-failed'));await assert.rejects(a,/first-failed/);await flush();assert.equal(calls.length,10);pending[9].resolve('second-ok');assert.equal(await b,'second-ok');
// Backoff is capped, snapshots immutable, synchronous loader failures release locks.
const broken=StudioRefresh.create({now:()=>clock,load:()=>{throw new Error('sync');},onSettled:()=>{throw new Error('indicator');}});
for(let i=0;i<9;i++)await assert.rejects(broken.request('x'),/sync/);
assert.equal(broken.status('x').retryAt,clock+30000);assert.equal(broken.status('x').running,false);assert.ok(Object.isFrozen(broken.status('x')));
assert.throws(()=>StudioRefresh.create({load:()=>{},baseDelay:0}),RangeError);
assert.equal(events.filter(e=>e.key==='failing'&&!e.ok).length,2);
console.log(JSON.stringify({passed:true,cases:12,writeOrProviderRequests:0}));
