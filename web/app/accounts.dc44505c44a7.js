/* ---- 账号管理 ---- */
let selAccounts=new Set();
let allAccountNames=[];
// 账号列表分页：1200 个号一次性渲染 + 每 10 秒重刷会把面板拖死，所以分页渲染
const ACC_PAGE_SIZE=30;
let accPage=1;
let filteredAccounts=[];
let filteredNames=[];
let allAccounts=[];
let accountSnapshot=null,accountLoad=null,accountReadSequence=0;
const pendingAccountDeletes=new Map();
function hideAccountsImmediately(names){
  for(const name of names){
    if(!pendingAccountDeletes.has(name))pendingAccountDeletes.set(name,{state:'requesting',afterSequence:accountReadSequence,
      oldErrorAt:accountSnapshot?.a.delete_errors?.[name]?.at||0});
    selAccounts.delete(name);
  }
  renderAccounts();updateSelButtons();
}
function restoreAccountAfterDeleteFailure(name){
  pendingAccountDeletes.delete(name);
  if(accountSnapshot)accountSnapshot.a.deleting_accounts=(accountSnapshot.a.deleting_accounts||[]).filter(n=>n!==name);
  renderAccounts();updateSelButtons();
}
function reconcileAccountDeletes(a,j,sequence){
  const deleting=new Set(a.deleting_accounts||[]);
  for(const [name,pending] of pendingAccountDeletes){
    if(pending.state==='requesting'||sequence<=pending.afterSequence)continue;
    const failure=a.delete_errors?.[name];
    if(!deleting.has(name)&&failure&&failure.at!==pending.oldErrorAt){
      pendingAccountDeletes.delete(name);toast(dialogText`${name} 删除失败，已恢复显示：${failure.error}`);continue;
    }
    if(deleting.has(name))continue;
    const exists=(a.accounts||[]).some(x=>x.name===name)||!!j.jobs?.[name];
    if(!exists)pendingAccountDeletes.delete(name);
    else if(Array.isArray(a.deleting_accounts)){
      pendingAccountDeletes.delete(name);toast(dialogText`${name} 后台删除未完成，已恢复显示，请重试`);
    }
  }
}
function visibleAccountDeleteSnapshot(a,jobs){
  const hidden=new Set([...(a.deleting_accounts||[]),...pendingAccountDeletes.keys()]);
  return {a:{...a,accounts:a.accounts.filter(x=>!hidden.has(x.name))},
    jobs:Object.fromEntries(Object.entries(jobs||{}).filter(([name])=>!hidden.has(name)))};
}
function refreshAccountDeletionState(){
  const current=accountLoad;
  (async()=>{if(current)await current.catch(()=>{});await loadAccounts();})().catch(()=>{});
}
async function deleteAccountInBackground(name,path){
  if(!pendingAccountDeletes.has(name))hideAccountsImmediately([name]);
  try{
    const result=await api(path,{method:'DELETE'}),pending=pendingAccountDeletes.get(name);
    if(pending){pending.state='accepted';pending.afterSequence=accountReadSequence;}
    return result;
  }catch(e){restoreAccountAfterDeleteFailure(name);throw e;}
  finally{refreshAccountDeletionState();}
}
let proxyCache=[];
/** 模型显示名：dola 的 2.0 在网页上叫 Seedance 2.0 Fast，老记录里存的 seedance-2.0 也按新名显示 */
function pubModel(m){return m==='seedance-2.0'?'seedance-2.0-fast':(m||'-');}
let srcFilterVal='all';
/* ---- 各页搜索：空格分隔的每个词都要命中（不区分大小写）。自动刷新时保留搜索词。
   账号 / 代理 / 密钥在前端过滤（列表本来就是全量）；任务 / 视频交给服务端查整个历史。 */
const SEARCH={accounts:'',proxies:'',tasks:'',videos:'',keys:''};
const SEARCH_RELOAD={accounts:()=>{accPage=1;renderAccounts();return Promise.resolve();},proxies:()=>loadProxies(),
  tasks:()=>loadTasks(),videos:()=>loadVideos(),keys:()=>loadKeys()};
const searchTimers={};
function setSearch(kind,v){
  SEARCH[kind]=String(v||'').trim();
  if(kind==='tasks'){taskPage=1;taskLoadEpoch++;SEL.tasks.clear();selUpdate('tasks');}
  clearTimeout(searchTimers[kind]);
  if(kind==='accounts'){accPage=1;renderAccounts();return;}
  searchTimers[kind]=setTimeout(()=>SEARCH_RELOAD[kind]().catch(()=>{}),300);
}
function searchHit(kind,...fields){
  const terms=SEARCH[kind].toLowerCase().split(/\s+/).filter(Boolean);
  if(!terms.length)return true;
  const hay=fields.map(f=>f==null?'':String(f)).join('\n').toLowerCase();
  return terms.every(t=>hay.includes(t));
}
function searchQS(kind){return SEARCH[kind]?'&q='+encodeURIComponent(SEARCH[kind]):'';}
function searchEmpty(kind,n){return SEARCH[kind]&&!n?'<div class="hint" style="margin:10px 0">没有匹配「'+noTr(SEARCH[kind])+'」的结果</div>':'';}
let groupFilterVal='all';   // all / valid / 满额 / 半额 / 冷却 / 生成中 / 风控 / 待激活 / 异常

const GROUP_STYLE={'满额':'b-green','半额':'b-blue','冷却':'b-orange','生成中':'b-blue',
                   '登录处理中':'b-blue','加号中':'b-blue','加号失败':'b-red','风控':'b-red','待激活':'b-gray','异常':'b-red'};
const GROUP_ACTIVE=['满额','半额','冷却','生成中'];
function loginDisplayAccount(a){
  if(a.login_in_progress||a.operation==='verifying'||pendingVerifications.has(a.name))return {...a,login_in_progress:true,group:'登录处理中',group_reason:a.operation_phase||'正在检查登录状态，等待最终结果'};
  const task=pendingGenerations.get(a.name);
  return task?{...a,busy:true,group:'生成中',group_reason:'',operation:'generating',operation_phase:task.phase}:a;
}
function loginDisplaySnapshot(data){
  const accounts=data.accounts.map(loginDisplayAccount),groups={};
  for(const a of accounts)groups[a.group]=(groups[a.group]||0)+1;
  const ready=accounts.filter(a=>GROUP_ACTIVE.includes(a.group));
  return {...data,accounts,groups,valid_count:ready.length,remaining_points:ready.reduce((n,a)=>n+(Number(a.remaining)||0),0)};
}
function addJobDisplaySnapshot(data,jobs){
  const accounts=[],known=new Set();
  const groups={...(data.groups||{})};
  let valid=data.valid_count||0,points=data.remaining_points||0;
  groups['加号中']=0;groups['加号失败']=0;
  for(const x of data.accounts){
    const job=(jobs||{})[x.name];
    const incomplete=!x.busy&&!x.email&&['','login'].includes(x.source||'')&&x.login_ok!==1;
    if(job&&job.kind==='add'&&(['running','cancelling'].includes(job.status)||(job.status==='failed'&&incomplete))){
      groups[x.group]=Math.max(0,(groups[x.group]||0)-1);
      if(GROUP_ACTIVE.includes(x.group)){valid=Math.max(0,valid-1);points=Math.max(0,points-(Number(x.remaining)||0));}
      continue;
    }
    accounts.push(x);known.add(x.name);
  }
  for(const [name,job] of Object.entries(jobs||{})){
    if(job.kind!=='add'||known.has(name)||!['running','cancelling','failed'].includes(job.status))continue;
    const group=job.status==='failed'?'加号失败':'加号中';
    accounts.push({name,email:job.email||'',source:job.source||'login',site:job.site||'dola',
      group,group_reason:job.stage||job.error||'',created_at:job.started_at||0,
      scheduling:false,remaining:0,add_job:job});
    known.add(name);groups[group]++;
  }
  const displayGroups={};
  for(const x of accounts)displayGroups[x.group]=(displayGroups[x.group]||0)+1;
  const ready=accounts.filter(x=>GROUP_ACTIVE.includes(x.group));
  return {...data,accounts,groups:displayGroups,all_count:accounts.length,
    valid_count:ready.length,remaining_points:ready.reduce((n,x)=>n+(Number(x.remaining)||0),0)};
}
function groupBadge(a){
  a=loginDisplayAccount(a);
  const g=a.group||'';
  if(!g)return '<span class="tiny">—</span>';
  return '<span class="badge '+(GROUP_STYLE[g]||'b-gray')+'" title="'+esc(a.group_reason||g)+'">'+esc(g)+'</span>'
    +(a.group_reason?'<div class="tiny">'+esc(a.group_reason)+'</div>':'');
}
function renderGroupBar(d,container,jump){
  const g=d.groups||{};
  const n=k=>g[k]||0;
  /* account-group-summary:15s-only */
  const go=(key)=>jump?("setGroupFilterGo('"+key+"')"):("setGroupFilter('"+key+"')");
  const btn=(key,label,count,extra)=>'<button class="gbtn'+(groupFilterVal===key?' on':'')+'"'
    +' onclick="'+go(key)+'" title="'+esc(extra||('筛选 '+label))+'">'
    +label+' <b class="n">'+count+'</b></button>';
  const sep='<span class="sep"></span>';
  setHTML(container||'#groupBar',
    btn('all','全部',d.all_count||0,'显示全部账号（含排队、加号中及加号失败）')+
    btn('valid','有效',d.valid_count||0,'正常组：满额+半额+冷却+生成中')+sep+
    btn('满额','满额',n('满额'),'剩余 4 点：按模型和时长所需额度派发')+
    btn('半额','半额',n('半额'),'剩余 2～3 点：按模型和时长所需额度派发')+
    btn('冷却','冷却',n('冷却'),'剩余 0/1 点：不派发，每日额度刷新后回满额')+
    btn('生成中','生成中',n('生成中'),'正在出片')+sep+
    btn('加号中','加号中',n('加号中'),'包含排队及正在登录的账号')+
    btn('加号失败','加号失败',n('加号失败'),'尚未完成添加，可重试或删除')+
    btn('登录处理中','登录处理中',n('登录处理中'),'验证及重新登录尚未结束，不计入风控')+
    btn('风控','风控',n('风控'),'发你好不回复或被登出：永久停留，需人工恢复')+
    btn('待激活','待激活',n('待激活'),'新号，尚未完成首次激活探测')+
    btn('异常','异常',n('异常'),'派发后 5 分钟无回执，到期自动恢复')+sep+
    (work15On()&&d.accounts?'<span class="gbtn points" title="2.0 的 15 秒（工作模式）：每号每 7 天 1 条，和每日点数分开">'
      +'15 秒可用 <b>'+workReadyCount(d.accounts)+'</b> 条</span>':''));
  moveGroupInd(q(container||'#groupBar'));
}
/** 出口显示名（HTML）：直连 / 绑定的代理名 + host:port（egress 本身已去掉代理凭据）。 */
function egressLabel(e,accs){
  if(!e||e==='direct')return '服务器直连（未配代理）';
  const names=[...new Set(accs.filter(x=>x.effective_egress===e&&x.proxy_name).map(x=>x.proxy_name))];
  const host=e.replace(/^[a-z0-9]+:\/\//i,'').replace(/#.*$/,'');
  return noTr((names.length?names.join(' / ')+' · ':'')+host);
}
/** 账号页提示：哪些出口正被上游限流（710022002）、哪些出口挂的号太多。 */
function renderEgressWarn(a){
  const box=q('#egressWarn');if(!box)return;
  const accs=a.accounts||[];
  const lines=(a.egress_throttle||[]).map(t=>
    '<div class="ew ew-red">出口 <b>'+egressLabel(t.egress,accs)+'</b> 被上游限流（710022002 访问频繁），'
    +t.accounts.length+' 个号暂停派发和探测，约 '+fmtDur(t.remaining)+' 后自动恢复'
    +(t.streak>1?'（连续第 '+t.streak+' 次，退避时间已加倍）':'')+'</div>');
  const warn=a.egress_share_warn||0;
  const shared=[];
  if(warn>0){
    const groups={};
    accs.forEach(x=>{if(!x.scheduling)return;const e=x.effective_egress||'direct';(groups[e]=groups[e]||[]).push(x.name);});
    Object.entries(groups).filter(([,l])=>l.length>warn).sort((x,y)=>y[1].length-x[1].length).forEach(([e,l])=>{
      shared.push({n:l.length,e});
    });
  }
  // 出口共用提醒可能有几十条：折叠成一行汇总，点开才看明细；红色的「正在被限流」照常全部显示
  if(shared.length){
    const total=shared.reduce((s,x)=>s+x.n,0);
    const open=egressWarnOpen();
    lines.push('<details class="ew ew-yellow" '+(open?'open':'')+' ontoggle="egressWarnToggle(this)">'
      +'<summary style="cursor:pointer">'+shared.length+' 个出口挂的号太多（共 '+total+' 个号，建议每个出口不超过 '+warn
      +' 个）。同一出口的号越多越容易被上游判「访问频繁」(710022002)，请给账号绑定更多不同 IP 的代理。'
      +'<span class="tiny">（点击'+(open?'收起':'展开明细')+'）</span></summary>'
      +'<div style="margin-top:6px;line-height:1.8">'
      +shared.map(x=>'· '+x.n+' 个号共用出口 <b>'+egressLabel(x.e,accs)+'</b>'
        +(x.e==='direct'?'（服务器直连，不在日本/韩国时必须配代理）':'')).join('<br>')
      +'</div></details>');
  }
  setHTML(box,lines.join(''));
}
function egressWarnOpen(){try{return localStorage.getItem('egressWarnOpen')==='1';}catch(e){return false;}}
function egressWarnToggle(el){
  try{localStorage.setItem('egressWarnOpen',el.open?'1':'0');}catch(e){}
  const hint=el.querySelector('summary .tiny');if(hint)hint.textContent='（点击'+(el.open?'收起':'展开明细')+'）';
}
function setGroupFilter(key){groupFilterVal=key;accPage=1;renderAccounts();}
function setGroupFilterGo(key){groupFilterVal=key;accPage=1;switchTab('accounts');}
function matchGroup(x){
  if(groupFilterVal==='all')return true;
  if(groupFilterVal==='valid')return GROUP_ACTIVE.indexOf(x.group)>=0;
  return x.group===groupFilterVal;
}

function srcBadge(x){
  if(x.source==='apple')return '<span class="badge b-green">Apple 登录</span>';
  if(x.source==='login')return '<span class="badge b-green" title="Google 账号登录">账号登录</span>';
  if(x.site==='doubao'){
    const kind={work:'工作号',personal:'个人号'}[x.doubao_account_type]||'待识别';
    const tier={member:'会员',free:'免费号'}[x.tier]||'';
    const wm=x.no_watermark==null?'':(x.no_watermark
      ?'<div class="tiny" title="豆包「AI 生成水印管理」已设为无水印">无水印 </div>'
      :'<div class="tiny" style="color:var(--red)" title="出片右下角会有「豆包AI生成」。DOUBAO_AUTO_NO_WATERMARK=1 时下次探测/出片会自动关；也可在豆包设置 → AI 生成水印管理 里手动关">未关水印</div>');
    return '<span class="badge b-blue" title="doubao.com 账号（Cookie 载入），接 doubao-seedance-* 模型">豆包</span>'
      +'<div class="tiny">'+kind+(kind==='工作号'?' · 仅工作模式':'')+'</div>'
      +(tier?'<div class="tiny">'+tier+'</div>':'')+wm;
  }
  if(x.source==='cookie')return '<span class="badge b-orange" title="Cookie 载入">Cookie 载入</span>';
  return '<span class="tiny">—</span>';
}
/** 同一个邮箱加了两遍：是同一个 Dola 用户，额度共用，留一个就够 */
function sameLoginNote(x){
  const twins=x.same_login||[];
  if(!twins.length)return '';
  return '<div class="tiny" style="color:var(--orange)" title="同一个邮箱登录了两遍，是同一个 Dola 账号：每日额度和 15 秒额度都是共用的，建议删掉其中一个">'
    +'同一账号：<span translate="no">'+esc(twins.join('、'))+'</span>'
    +(x.duplicate_of?'<br>重复项不参与自动调度，使用 <span translate="no">'+esc(x.duplicate_of)+'</span>':'')+'</div>';
}
/** 剩余额度列：dola 号按点数；豆包号不报剩余，只显示今天出了几条 */
function quotaCell(x,unit){
  if(x.site==='doubao')
    return '<span class="tiny">今日已出 </span><b>'+(x.used_today||0)+'</b><span class="tiny"> 条（豆包按上游额度）</span>';
  return `<b>${x.remaining}</b> / ${x.limit}`+(unit?'<span class="tiny">（点数/上限）</span>':'')+
    (x.credit_balance==null?'':`<div class="tiny">上游余额 ${x.credit_balance}${x.credit_balance<2?'（已用完）':''}</div>`)+
    workQuotaLine(x);
}
/** 2.0 的 15 秒（工作模式）额度：每号 7 天 1 条，和上面的每日点数分开。开关没开就不显示 */
function work15On(){return (TEST_GEN_DURATIONS['seedance-2.0-fast']||[]).includes(15);}
function workUsed(x){return (x.work_blocked_until||0)*1000>Date.now();}
function workQuotaLine(x){
  if(x.site==='doubao'||!work15On())return '';
  return workUsed(x)
    ?`<div class="tiny" title="${esc(x.work_block_reason||'')}">工作 15 秒：已用，${fmt(x.work_blocked_until)} 恢复</div>`
    :'<div class="tiny" title="每号每 7 天 1 条，从首次使用起算">工作 15 秒：可用 1 条</div>';
}
function workReadyCount(accounts){
  return (accounts||[]).filter(x=>x.site!=='doubao'&&x.scheduling&&!x.busy&&x.login_ok!==0
    &&!x.login_in_progress&&!['登录处理中','风控','待激活','异常'].includes(x.group)&&!workUsed(x)).length;
}
function loadAccounts(){
  if(accountLoad)return accountLoad;
  const sequence=++accountReadSequence;
  accountLoad=api('/api/admin/accounts').then(async a=>{
    const j=a.add_jobs?{jobs:a.add_jobs}:await api('/api/admin/jobs');
    reconcileAccountDeletes(a,j,sequence);
    // 30 秒要两个号各出 15 秒，测试生成只用一个号，不提供
    if(Array.isArray(a.v20_durations)&&a.v20_durations.length)TEST_GEN_DURATIONS['seedance-2.0-fast']=a.v20_durations.filter(d=>d!==30);
    accountSnapshot={a,j};renderAccounts();
  }).finally(()=>{accountLoad=null;});
  return accountLoad;
}
/* 账号排序：点表头切换，选择记在本机。没有邮箱或创建时间的号不管升降序都沉底。 */
const ACC_SORT_DEFAULT={key:'created',dir:'desc'};
const ACC_SORT_KEYS={name:x=>x.name||'',email:x=>x.email||'',created:x=>x.created_at||0};
let accSort=loadAccSort();
function loadAccSort(){
  try{
    const s=JSON.parse(localStorage.getItem('accSort')||'null');
    return s&&ACC_SORT_KEYS[s.key]&&(s.dir==='asc'||s.dir==='desc')?s:ACC_SORT_DEFAULT;
  }catch(e){return ACC_SORT_DEFAULT;}
}
function compareAccounts(x,y,sort){
  const pick=ACC_SORT_KEYS[sort.key],a=pick(x),b=pick(y);
  if(!a||!b)return a?-1:b?1:0;
  const order=typeof a==='number'?a-b:String(a).localeCompare(String(b),undefined,{numeric:true,sensitivity:'base'});
  return sort.dir==='asc'?order:-order;
}
function sortAccounts(key){
  accSort=accSort.key===key?{key,dir:accSort.dir==='asc'?'desc':'asc'}:{key,dir:key==='created'?'desc':'asc'};
  try{localStorage.setItem('accSort',JSON.stringify(accSort));}catch(e){}
  accPage=1;renderAccounts();
}
function accSortHead(key,label){
  const on=accSort.key===key,mark=on?(accSort.dir==='asc'?' ▲':' ▼'):'';
  return `<button type="button" class="sort-th${on?' on':''}" title="点击排序" onclick="sortAccounts('${key}')">${label}${mark}</button>`;
}
function renderAccounts(){
  if(!accountSnapshot)return;
  const {a:original,j}=accountSnapshot;
  const visible=visibleAccountDeleteSnapshot(original,j.jobs||{});
  const jobs=visible.jobs;
  const a=addJobDisplaySnapshot(loginDisplaySnapshot(visible.a),jobs);
  allAccountNames=a.accounts.map(x=>x.name);
  allAccounts=a.accounts.filter(x=>!x.add_job);
  const hint=q('#resetHint');
  if(hint&&a.next_reset_at)hint.textContent=`额度重置：${a.reset_tz} 每天 ${a.reset_hour}:00（下次 ${fmt(a.next_reset_at)}）`;
  renderGroupBar(a);
  renderEgressWarn(a);
  const sorted=[...a.accounts].sort((x,y)=>compareAccounts(x,y,accSort));
  filteredAccounts=sorted.filter(x=>
    (srcFilterVal==='all'||x.source===srcFilterVal)&&matchGroup(x)
    &&searchHit('accounts',x.name,x.email,x.note,x.proxy_name,x.effective_egress,x.exit_ip,x.group,
                x.group_reason,x.source==='cookie'?'Cookie 载入':x.source==='apple'?'Apple 登录':'账号登录',x.site==='doubao'?'豆包 doubao':'dola'));
  filteredNames=filteredAccounts.map(x=>x.name);
  // 被筛掉/已删除的账号不再保留勾选，避免「删除选中」误删看不见的号
  for(const n of [...selAccounts])if(!filteredNames.includes(n))selAccounts.delete(n);
  const accTotalPages=Math.max(1,Math.ceil(filteredAccounts.length/ACC_PAGE_SIZE));
  if(accPage>accTotalPages)accPage=accTotalPages;
  if(accPage<1)accPage=1;
  const rows=pageSlice().map(x=>{
    if(x.add_job)return pendingAddRow(x.name,x.add_job);
    const jb=jobs[x.name];
    const badge=accountRunBadge(x,jb);
    // 动态代理账号：显示当前出口 IP，并提供换IP/探测
    const ipInfo=x.proxy_mode||x.exit_ip
      ?`<div class="tiny">出口 ${x.exit_ip?esc(x.exit_ip):'未探测'}
         ${!x.proxy_region_rejected&&(x.proxy_mode==='dynamic'||x.proxy_mode==='extract')?`<a href="javascript:;" onclick="rotateIp('${x.name}')">换IP</a>`:''}
         <a href="javascript:;" onclick="probeIp('${x.name}')">探测</a></div>
         ${x.proxy_region_rejected?`<div class="tiny" style="color:var(--red)">${esc(x.proxy_region_detail||'非日韩，已剔除')} · 调度已暂停</div>`:''}`
      :'';
    const warn=accountJobNote(x,jb);
    return [
      `<input type="checkbox" data-name="${esc(x.name)}" ${selAccounts.has(x.name)?'checked':''} onchange="toggleSel('${x.name}',this.checked)">`,
      `<span class="account-id" translate="no">${esc(x.name)}</span>`,
      accLabel(x)+warn+sameLoginNote(x),
      groupBadge(x),
      badge+ipInfo,
      srcBadge(x),
      `<label class="sw"><input type="checkbox" ${x.scheduling?'checked':''} onchange="setSched('${x.name}',this.checked)"><i></i></label>`,
      quotaCell(x,false),
      fmt(x.last_used_at),
      fmt(x.created_at),
      noteCell(x),
      accountRowActions(x)
    ];
  });
  // Pending add records share the same snapshot, filtering, pagination and selection as pool rows.
  scheduleAddJobPoll(jobs,new Set(allAccountNames));
  setHTML('#accountsTable',table(
    ['<input type="checkbox" id="selAll" onchange="toggleAll(this.checked)" title="全选=当前筛选结果的全部账号（跨页保持）">',
     accSortHead('name','内部账号'),accSortHead('email','名称'),'组','运行','来源','调度','剩余额度','最近使用',accSortHead('created','创建时间'),'备注','操作'],rows,pageSlice().map(x=>x.name))
    +accPager(accTotalPages));
  updateSelButtons();
}

/** 还没进池的加号任务：进行中的显示进度；失败的一直保留到「重试」或「删除」（删除会清掉残留的 profile / 代理绑定 / 凭据）。 */
function pendingAddRow(n,j){
  const secs=Math.max(0,Math.round(Date.now()/1000-(j.started_at||Date.now()/1000)));
  const cancelling=j.status==='cancelling';
  const running=j.status==='running';
  const queued=running&&/^排队/.test(j.stage||'');
  const label=cancelling?'取消并删除中':queued?'排队中':running?'加号中 '+secs+'s':'加号失败';
  const state=`<span class="badge ${running||cancelling?'b-blue':'b-red'}">${label}</span>`
    +`<div class="tiny" title="${esc(j.error||j.stage||'')}">${esc((j.stage||j.error||'').slice(0,80))}</div>`;
  const source=srcBadge({source:j.source||'login'});
  const ops=(running&&j.source==='apple'?`<button class="btn btn-p" onclick="openAppleProgress('${esc(n)}')">${j.challenge?'处理登录验证':'查看登录进度'}</button>`:'')
    +(j.status==='failed'&&j.source==='login'?`<button class="btn" onclick="retryAddJob('${esc(n)}')">重试</button>`:'')
    +(j.status==='failed'&&j.source==='apple'?`<button class="btn" onclick="retryAppleLogin('${esc(n)}')">重新登录</button>`:'')
    +`<button class="btn btn-danger" ${cancelling?'disabled':''} onclick="deleteAddJob('${esc(n)}')">${cancelling?'取消删除中…':running?'取消并删除':'删除'}</button>`;
  const checkbox=`<input type="checkbox" data-name="${esc(n)}" ${selAccounts.has(n)?'checked':''} ${cancelling?'disabled':''} onchange="toggleSel('${esc(n)}',this.checked)">`;
  return [checkbox,`<span class="account-id" translate="no">${esc(n)}</span>`,accLabel(j),state,'',source,'','','',fmt(j.started_at),noteCell({name:n}),ops];
}

async function retryAddJob(name){
  try{await api('/api/admin/jobs/'+encodeURIComponent(name)+'/retry',{method:'POST'});toast(dialogText`已开始重试 ${name}`);refresh();}
  catch(e){if(e.message!=='unauthorized')alert(dialogText`${e.message}`);}
}
async function deleteAddJob(name){
  if(!await confirm(dialogText`取消并删除 ${name}？将停止排队或登录，并清理浏览器资料、代理绑定和保存的登录凭据。`))return;
  try{
    await deleteAccountInBackground(name,'/api/admin/jobs/'+encodeURIComponent(name));
    toast(dialogText`已从列表移除 ${name}，后台继续清理`);
  }catch(e){if(e.message!=='unauthorized')alert(dialogText`${e.message}`);refresh();}
}

let addJobPollTimer=null;
/** 有加号任务在跑时每 2 秒刷一次账号页（平时 10 秒），跑完立刻显示新号。 */
function scheduleAddJobPoll(jobs,inPool){
  const running=pendingAccountDeletes.size>0||(accountSnapshot?.a.deleting_accounts||[]).length>0
    ||Object.entries(jobs).some(([n,j])=>j.kind==='add'&&['running','cancelling'].includes(j.status));
  if(!running||addJobPollTimer)return;
  addJobPollTimer=setTimeout(()=>{addJobPollTimer=null;if(curTab==='accounts')loadAccounts().catch(()=>{});},2000);
}

/** 列表只显示入口，备注与辅助资料在鉴权后按需读取。 */
function noteCell(x){
  return `<button type="button" class="btn" data-note-account="${esc(x.name)}" onclick="editNote(this.dataset.noteAccount)">详情</button>`;
}
async function editNote(name){
  const heading=`<h2 id="noteDetailTitle">备注详情</h2><p class="detail-account" translate="no">${esc(name)}</p>`;
  const close='<button type="button" class="btn" onclick="hide(\'dlg\')">关闭</button>';
  const frame=body=>`<section id="noteDetail" role="dialog" aria-modal="true" aria-labelledby="noteDetailTitle">${heading}${body}</section>`;
  showDlg(frame(`<p role="status" class="hint" style="margin-top:14px">正在读取…</p><div class="row">${close}</div>`));
  q('#noteDetail button').focus();
  const epoch=dialogEpoch;
  try{
    const detail=await api('/api/admin/accounts/'+encodeURIComponent(name)+'/note-detail');
    if(epoch!==dialogEpoch)return;
    showDlg(frame(`<label for="noteDetailNote">备注</label>
      <textarea id="noteDetailNote" rows="4" translate="no" placeholder="暂无备注" ${detail.editable?'':'readonly'}></textarea>
      <label for="noteDetailRecovery">辅助邮箱</label>
      <input id="noteDetailRecovery" readonly translate="no" placeholder="未提供" autocomplete="off">
      <label for="noteDetailMailApi">收件 API</label>
      <textarea id="noteDetailMailApi" rows="3" readonly translate="no" spellcheck="false" placeholder="未提供"></textarea>
      <p id="noteDetailFeedback" class="hint" role="status"></p>
      <div class="row">${close}${detail.editable?'<button type="button" id="noteDetailSave" class="btn btn-p">保存备注</button>':''}</div>`));
    q('#noteDetailNote').value=detail.note||'';
    q('#noteDetailRecovery').value=detail.recovery_email||'';
    q('#noteDetailMailApi').value=detail.mail_api||'';
    const currentEpoch=dialogEpoch,button=q('#noteDetailSave');
    if(button)button.addEventListener('click',async()=>{
      const input=q('#noteDetailNote'),feedback=q('#noteDetailFeedback');
      button.disabled=true;input.disabled=true;feedback.textContent='正在保存…';
      try{
        await api('/api/admin/accounts/'+encodeURIComponent(name),{method:'PATCH',body:{note:input.value}});
        if(currentEpoch!==dialogEpoch)return;
        feedback.textContent='已保存';refresh();
      }catch(e){if(currentEpoch===dialogEpoch&&e.message!=='unauthorized')feedback.textContent='保存失败：'+e.message;}
      finally{if(currentEpoch===dialogEpoch){button.disabled=false;input.disabled=false;}}
    });
    q('#noteDetailNote').focus();
  }catch(e){
    if(epoch!==dialogEpoch||e.message==='unauthorized')return;
    showDlg(frame(`<p role="alert" style="margin-top:14px">读取失败：${esc(e.message)}</p><div class="row">${close}<button type="button" class="btn" id="noteDetailRetry">重试</button></div>`));
    q('#noteDetailRetry').addEventListener('click',()=>editNote(name));
    q('#noteDetailRetry').focus();
  }
}
document.addEventListener('keydown',e=>{
  const panel=q('#noteDetail');if(!panel||q('#dlg').style.display==='none')return;
  if(e.key==='Escape'){e.preventDefault();hide('dlg');return;}
  if(e.key!=='Tab')return;
  const items=[...panel.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled)')];
  if(!items.length)return;
  const i=items.indexOf(document.activeElement);
  if(e.shiftKey&&i<=0){e.preventDefault();items.at(-1).focus();}
  else if(!e.shiftKey&&(i<0||i===items.length-1)){e.preventDefault();items[0].focus();}
});

function toggleAll(on){
  selAccounts.clear();
  // 「全选」= 当前筛选结果的全部（不是全库，也不是当前页），跨页保持勾选状态
  if(on)filteredNames.forEach(n=>selAccounts.add(n));
  renderAccounts();
  updateSelButtons();
}

function pageSlice(){
  const start=(accPage-1)*ACC_PAGE_SIZE;
  return filteredAccounts.slice(start,start+ACC_PAGE_SIZE);
}
function accGo(p){accPage=Math.max(1,Math.floor(p)||1);renderAccounts();}
function selPage(){pageSlice().forEach(x=>selAccounts.add(x.name));renderAccounts();updateSelButtons();}
function clearSel(){selAccounts.clear();renderAccounts();updateSelButtons();}
function accPager(totalPages){
  const total=filteredAccounts.length;
  const start=total?(accPage-1)*ACC_PAGE_SIZE+1:0;
  const end=Math.min(accPage*ACC_PAGE_SIZE,total);
  const dis1=accPage<=1?' disabled':'';
  const dis2=accPage>=totalPages?' disabled':'';
  return '<div class="pager">'
    +'<span>共 '+total+' 个号 · 本页 '+(total?start+'-'+end:'0')+' · 第 '+accPage+'/'+totalPages+' 页</span>'
    +'<button class="btn"'+dis1+' onclick="accGo(1)">首页</button>'
    +'<button class="btn"'+dis1+' onclick="accGo('+(accPage-1)+')">上一页</button>'
    +'<button class="btn"'+dis2+' onclick="accGo('+(accPage+1)+')">下一页</button>'
    +'<button class="btn"'+dis2+' onclick="accGo('+totalPages+')">末页</button>'
    +'<button class="btn" onclick="selPage()">本页全选</button>'
    +'<button class="btn" onclick="clearSel()">清空选择</button>'
    +'</div>';
}

/** 手动发「你好」：被登出（登录标记不是 1）或没回复 → 该号进【风控】组。 */
async function probeHello(name){
  try{
    const r=await api('/api/admin/accounts/'+encodeURIComponent(name)+'/probe-hello',{method:'POST'});
    const p=r.probe||{};
    alert(dialogText`${name} 你好探测：${p.status==='unconfirmed'?'未确认（不判风控）':p.status==='skipped'?'已跳过':p.ok?'通过 ':'未通过 '}\n登录标记：${p.login_ok==null?'未确认':p.login_ok?'有效':'已被登出'}\n是否回复：${p.replied?'有回复':'无回复'}\n耗时：${p.elapsed||0}s${p.cached?'（缓存）':''}\n原因：${p.reason||'-'}\n回复：${(p.reply||'').slice(0,80)}`);
  }catch(e){return alert(dialogText`${e.message}`);}
  refresh();
}
async function recoverAccount(name,kind){
  if(!await confirm(dialogText`确定把 ${name} 从【${kind==='abnormal'?'异常':'风控'}】组恢复出来？\n${kind==='risk'?'（风控恢复后回到【待激活】，要再做一次「你好探测」确认登录）':''}`))return;
  try{
    const r=await api('/api/admin/accounts/'+encodeURIComponent(name)+'/recover',
      {method:'POST',body:{kind:kind}});
    alert(dialogText`${name} 已恢复，当前分组：${(r.account&&r.account.group)||'-'}`);
  }catch(e){return alert(dialogText`${e.message}`);}
  refresh();
}

const pendingVerifications=new Map();
let verificationRefreshTimer=null;
function updateVerificationRefresh(){
  if(pendingVerifications.size&&!verificationRefreshTimer){
    verificationRefreshTimer=setInterval(()=>{
      if(!document.hidden&&!loginShowing()&&curTab==='accounts')loadAccounts().catch(()=>{});
    },2000);
  }else if(!pendingVerifications.size&&verificationRefreshTimer){
    clearInterval(verificationRefreshTimer);verificationRefreshTimer=null;
  }
}
async function verify(name,btn){
  if(pendingVerifications.has(name))return;
  pendingVerifications.set(name,Date.now());
  btn.disabled=true;btn.textContent='验证中…';
  renderAccounts();updateVerificationRefresh();
  let result,error;
  try{
    result=await api('/api/admin/accounts/'+encodeURIComponent(name)+'/verify',{method:'POST'});
  }catch(e){error=e;}
  finally{
    pendingVerifications.delete(name);updateVerificationRefresh();
    const row=allAccounts.find(a=>a.name===name);
    if(row&&row.operation==='verifying'){row.busy=false;row.operation='';row.operation_phase='';}
    renderAccounts();refresh();
  }
  if(error){if(error.message!=='unauthorized')alert(dialogText`${error.message}`);return;}
  alert(dialogText`${name} 登录态：${result.ok?'有效（仅确认登录状态，不代表一定能出片）':('失效'+(result.reason?'\n原因：'+result.reason:''))}`);
}

let testGenPollTimer=null;
let testGenAttachments={images:[],audio:[]},testGenReading=0;
async function readTestGenFiles(input,kind){
  const files=[...input.files],epoch=dialogEpoch;
  input.value='';testGenReading++;q('#tg_btn').disabled=true;
  try{
    const current=testGenAttachments[kind],max=kind==='audio'?3:30;
    if(current.length+files.length>max)throw Error(kind==='audio'?'参考音频最多3个':'参考图片最多30张');
    const total=[...testGenAttachments.images,...testGenAttachments.audio,...files].reduce((n,f)=>n+f.size,0);
    if(total>60*1024*1024)throw Error('参考素材合计最多60 MiB');
    const added=[];
    for(const file of files){
      if(!file.size||file.size>20*1024*1024)throw Error('每个文件须大于0且不超过20 MiB');
      const pattern=kind==='audio'?/\.(mp3|wav|m4a|flac|ogg)$/i:/\.(png|jpe?g|webp)$/i;
      if(!pattern.test(file.name))throw Error(kind==='audio'?'支持 MP3/WAV/M4A/FLAC/OGG':'支持 JPG/PNG/WEBP');
      let data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('读取文件失败'));r.readAsDataURL(file);});
      if(kind==='audio'){
        const ext=file.name.split('.').at(-1).toLowerCase(),mime={mp3:'mpeg',wav:'wav',m4a:'mp4',flac:'flac',ogg:'ogg'}[ext];
        data='data:audio/'+mime+';base64,'+String(data).split(',')[1];
      }
      added.push({name:file.name,size:file.size,data});
    }
    if(epoch!==dialogEpoch)return;
    current.push(...added);renderTestGenFiles();q('#tg_status').textContent='素材已就绪，提交后将等待上游上传与解析';
  }catch(e){if(epoch===dialogEpoch)q('#tg_status').textContent=e.message;}
  finally{testGenReading--;if(epoch===dialogEpoch)q('#tg_btn').disabled=testGenReading>0;}
}
function removeTestGenFile(kind,index){testGenAttachments[kind].splice(index,1);renderTestGenFiles();}
function renderTestGenFiles(){
  const box=q('#tg_refs');if(!box)return;
  box.innerHTML=['images','audio'].flatMap(kind=>testGenAttachments[kind].map((f,i)=>
    `<div class="tg-attachment">${kind==='images'?`<img src="${esc(f.data)}" alt="参考图 ${i+1}">`:'<span class="tiny">音频</span>'}
    <span>${kind==='images'?'图片':'音频'}${i+1} · ${esc(f.name)} <small class="tiny">${(f.size/1048576).toFixed(2)} MiB</small></span>
    <button class="btn" type="button" aria-label="移除 ${esc(f.name)}" onclick="removeTestGenFile('${kind}',${i})">移除</button></div>`)).join('');
}
function stopTestGenPoll(){if(testGenPollTimer){clearInterval(testGenPollTimer);testGenPollTimer=null;}}
const TEST_GEN_DURATIONS={'seedance-2.0-fast':[5,10,15]};
/* Track accepted tasks independently of whichever dialog is currently open. */
const pendingGenerations=new Map();
async function syncGenerationViews(){
 const reads=[loadAccounts(),loadTasks()];if(curTab==='dash')reads.push(loadDash());
 await Promise.allSettled(reads);
}
async function submitTestGen(name,force){
 const status=q('#tg_status'),button=q('#tg_btn'),epoch=dialogEpoch;
 if(!status||!button)return;
 const active=()=>epoch===dialogEpoch&&q('#tg_status')===status;
 if(pendingGenerations.has(name)){status.textContent='该账号已有提交或生成任务，请等待完成。';return;}
 if(testGenReading){status.textContent='正在读取素材，请稍候';return;}
 const prompt=q('#tg_prompt').value.trim();
 if(!prompt){status.textContent='提示词必填';status.style.color='var(--red)';q('#tg_prompt').focus();return;}
 const account=allAccounts.find(a=>a.name===name)||{},mode=q('#tg_mode'),count=q('#tg_count');
 const workOnly=account.site==='doubao'&&account.doubao_account_type==='work';
 const body={prompt,model:q('#tg_model').value,duration:Number(q('#tg_duration').value),ratio:q('#tg_ratio').value,force:!!force,execution_mode:workOnly?'work':(mode?mode.value:'chat'),video_count:Number(count?count.value:1),reference_images:testGenAttachments.images.map(f=>f.data),reference_audio:testGenAttachments.audio.map(f=>f.data)};
 if(body.reference_audio.length&&!(body.execution_mode==='chat'&&body.model==='seedance-2.0-fast'&&body.duration===15)){status.textContent='音频仅支持聊天模式、Seedance 2.0 Fast、15 秒；请恢复设置或移除音频';return;}
 const record={name,id:'',epoch,phase:'正在提交生成任务',polling:false};
 pendingGenerations.set(name,record);button.disabled=true;status.textContent='正在提交生成任务…';renderAccounts();
 try{
  const r=await api('/api/admin/accounts/'+encodeURIComponent(name)+'/test-generate',{method:'POST',body});
  record.id=r.task_id;record.phase='准备 / 生成中';
  if(active()){status.textContent='已提交 '+r.task_id.slice(0,12)+'…，后台持续跟踪任务。';status.style.color='var(--accent)';}
  renderAccounts();pollTestGen(r.task_id,name);void syncGenerationViews();
 }catch(e){
  if(pendingGenerations.get(name)===record)pendingGenerations.delete(name);
  renderAccounts();void loadAccounts().catch(()=>{});
  if(!active())return;button.disabled=false;
  if(String(e.message).startsWith('TEST_GEN_WARN:')){
   const reasons=String(e.message).slice('TEST_GEN_WARN:'.length).split('\n').filter(Boolean);
   const confirmed=await confirm(dialogText`测试生成会用 ${name} 真实出片、消耗真实额度。这个号现在：\n\n${reasons.map(r=>'• '+r).join('\n')}\n\n仍然要测试吗？`);
   if(!active())return;if(confirmed)return submitTestGen(name,true);
   status.textContent='已取消：'+reasons.join('；');status.style.color='var(--sub)';return;
  }
  status.textContent=e.message;status.style.color='var(--red)';
 }
}
function generationDialogProgress(record,job){
 const box=q('#tg_status');if(record.epoch!==dialogEpoch||!box||q('#dlg').style.display==='none')return;
 const done=job.status==='done'||job.status==='failed';
 if(done){
  const result=job.result||{},videos=result.videos?.length?result.videos:result.video_url?[result]:[];
  if(videos.length&&!q('#tg_video')){
   const media=document.createElement('div');media.id='tg_video';
   for(const item of videos){const video=document.createElement('video');video.controls=true;video.src=item.video_url;video.style.cssText='max-width:100%;max-height:300px';media.append(video);}q('#dlgBox').append(media);
  }
  box.textContent=result.ok?'生成成功：'+(result.video_url||''):'生成失败：'+(job.error||result.error||'未知错误');
  box.style.color=result.ok?'var(--ok)':'var(--red)';q('#tg_btn').disabled=false;
 }else{box.textContent='准备 / 生成中（账号 '+record.name+'）· 每 2 秒同步状态，关闭窗口后继续跟踪。';box.style.color='var(--orange)';}
}
async function watchGeneration(record){
 if(record.polling||!record.id||pendingGenerations.get(record.name)!==record||loginShowing())return;
 record.polling=true;
 try{
  const job=await api('/api/admin/test-gen/'+encodeURIComponent(record.id));
  if(pendingGenerations.get(record.name)!==record)return;
  generationDialogProgress(record,job);
  if(['done','failed'].includes(job.status)){
   pendingGenerations.delete(record.name);await syncGenerationViews();renderAccounts();
  }
 }catch(e){
  // A server restart can lose the transient test-job map; the task list is durable.
  const task=TASK_MAP[record.id];
  if(task&&['completed','failed'].includes(task.status)){
   generationDialogProgress(record,{status:task.status==='completed'?'done':'failed',error:task.error,result:{ok:task.status==='completed',video_url:task.video_url}});
   pendingGenerations.delete(record.name);await syncGenerationViews();renderAccounts();
  }
 }finally{record.polling=false;}
}
function pollTestGen(taskId,name){
 const record=pendingGenerations.get(name)||{name,id:taskId,epoch:dialogEpoch,phase:'准备 / 生成中',polling:false};
 record.id=taskId;pendingGenerations.set(name,record);void watchGeneration(record);
}
let liveRefreshBusy=false,lastQuietRefresh=0;
async function liveRefreshTick(){
 if(liveRefreshBusy||document.hidden||loginShowing())return;
 liveRefreshBusy=true;
 try{
  const work=[...pendingGenerations.values()].filter(r=>r.id).map(watchGeneration);
  const frequent=['accounts','tasks','dash'].includes(curTab);
  if(autoRefresh&&(frequent||Date.now()-lastQuietRefresh>=10000)){lastQuietRefresh=Date.now();work.push(refresh({background:true}));}
  await Promise.allSettled(work);
 }finally{liveRefreshBusy=false;}
}


function openRenameAccount(name){
  showDlg(`<h2>重命名账号：${noTr(name)}</h2>
    <p class="tiny" style="line-height:1.6">会一起搬走该账号的浏览器 profile、代理绑定、今日额度与登录凭据；账号正在出片时不能改名。</p>
    <label>新账号名</label>
    <input id="f_newName" value="${esc(name)}" style="width:100%;padding:8px 12px;border:1px solid var(--line);border-radius:8px;font-size:13px;margin-top:4px">
    <div class="row"><button class="btn" onclick="hide('dlg')">取消</button>
      <button class="btn btn-p" onclick="submitRenameAccount('${name}')">保存</button></div>`);
  const el=q('#f_newName');if(el){el.focus();el.select();}
}
async function submitRenameAccount(name){
  const newName=(q('#f_newName').value||'').trim();
  if(!newName)return alert('请填新账号名');
  if(newName===name)return hide('dlg');
  try{await api('/api/admin/accounts/'+encodeURIComponent(name)+'/rename',{method:'POST',body:{new_name:newName}});}
  catch(e){return alert(dialogText`${e.message}`);}
  hide('dlg');
  selAccounts.delete(name);
  refresh();
}

async function delAccount(name){
  if(!await confirm(dialogText`确定删除账号 ${name}？将同时删除其 profile。`))return;
  try{await deleteAccountInBackground(name,'/api/admin/accounts/'+encodeURIComponent(name));toast(dialogText`已从列表移除 ${name}，后台继续清理`);}
  catch(e){if(e.message!=='unauthorized')toast(dialogText`${name} 删除失败：${e.message}`);}
}

function toggleSel(name,on){
  if(on)selAccounts.add(name);else selAccounts.delete(name);
  updateSelButtons();
}

let cookieExportRunning=false;
async function exportAccountCookies(name){
  if(cookieExportRunning)return;
  const names=name?[name]:[...selAccounts];
  if(!names.length)return alert('请先勾选账号');
  if(!await confirm(dialogText`导出 ${names.length} 个账号的 Cookie？文件包含登录凭据，请妥善保管。导出的是已保存快照，不代表当前登录有效；批量 ZIP 内含导出结果清单。`))return;
  cookieExportRunning=true;updateSelButtons();
  try{
    const r=await fetch('/api/admin/accounts/export-cookies',{
      method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Admin-Key':adminKey},
      body:JSON.stringify({names})
    });
    if(r.status===401){showLogin();return;}
    if(!r.ok){const data=await r.json().catch(()=>({}));throw new Error(data.detail||'Cookie 导出失败');}
    const blob=await r.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=names.length===1?names[0]+'.json':'dola-account-cookies.zip';
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    const failed=Number(r.headers.get('X-Failed-Accounts')||0);
    if(failed)alert(dialogText`已导出 ${r.headers.get('X-Exported-Accounts')} 个账号，${failed} 个未导出。请查看 ZIP 中的 _export/manifest.json。`);
  }catch(e){alert(dialogText`${e.message}`);}
  finally{cookieExportRunning=false;updateSelButtons();}
}

// 勾选状态 -> 工具条按钮：删除选中 / 一键验证 / 更改代理
function updateSelButtons(){
  const n=selAccounts.size;
  const pendingSelected=filteredAccounts.some(x=>x.add_job&&selAccounts.has(x.name));
  const del=q('#btnDelSel');
  if(del){del.disabled=n===0;del.textContent=n?`删除选中（${n}）`:'删除选中';}
  const verifyBtn=q('#btnVerifySel');
  if(verifyBtn){verifyBtn.disabled=n===0||pendingSelected;verifyBtn.textContent=n?`一键验证（${n}）`:'一键验证';}
  const proxyBtn=q('#btnProxySel');
  if(proxyBtn){proxyBtn.disabled=n===0||pendingSelected;proxyBtn.textContent=n?`更改代理（${n}）`:'更改代理';}
  const exportBtn=q('#btnExportCookies');
  if(exportBtn){exportBtn.disabled=n===0||pendingSelected||cookieExportRunning;exportBtn.textContent=cookieExportRunning?'正在导出…':(n?`导出选中 Cookie（${n}）`:'导出选中 Cookie');}
  const selAll=q('#selAll');
  if(selAll){
    const scope=filteredNames.length;
    selAll.checked=n>0&&n===scope;
    selAll.indeterminate=n>0&&n<scope;
  }
}

let batchPollTimer=null;
function stopBatchPoll(){if(batchPollTimer){clearInterval(batchPollTimer);batchPollTimer=null;}}

async function batchVerifySelected(){
  const list=[...selAccounts];
  if(!list.length)return alert('请先勾选账号');
  if(!await confirm(`对选中的 ${list.length} 个账号逐个验证登录态？\n验证会真实打开账号会话，耗时较长（每号约 10-40 秒）。`))return;
  let r;
  try{r=await api('/api/admin/accounts/batch-verify',{method:'POST',body:{names:list}});}
  catch(e){return alert(dialogText`${e.message}`);}
  stopBatchPoll();
  showDlg(`<h2>批量验证（${list.length} 个账号）</h2>
    <div id="batchProg" class="tiny" style="margin:8px 0;white-space:pre-wrap"></div>
    <div id="batchOut" class="tiny log-pane"></div>
    <div class="row"><button class="btn" onclick="hide('dlg');stopBatchPoll();refresh()">关闭</button></div>`);
  pollBatch(r.job_id);
  batchPollTimer=setInterval(()=>pollBatch(r.job_id),2000);
}

async function pollBatch(jobId){
  let j;
  try{j=await api('/api/admin/batch/'+jobId);}catch(e){stopBatchPoll();return;}
  const prog=q('#batchProg'),out=q('#batchOut');
  if(!prog||!out)return;
  const pct=j.total?Math.round((j.done/j.total)*100):0;
  prog.textContent=`进度 ${j.done}/${j.total}（${pct}%）  有效 ${j.ok_count||0}  失效 ${j.failed_count||0}`
    +(j.current?`\n当前：${j.current}`:'')+(j.status==='completed'?'\n已完成 ':'');
  out.textContent=(j.results||[]).slice().reverse()
    .map(x=>`${x.ok===true?'':(x.ok===false?'':'–')} ${x.name}  ${x.message||''}`).join('\n');
  if(j.status!=='running'){stopBatchPoll();refresh();}
}

/** 顶部「你好探测」：勾选了就探勾选的，没勾选就探当前筛选出来的号（受分组按钮影响）。 */
async function batchProbeHello(){
  const sel=[...selAccounts];
  const list=sel.length?sel:allAccounts.filter(x=>matchGroup(x)&&(srcFilterVal==='all'||x.source===srcFilterVal)).map(x=>x.name);
  if(!list.length)return alert('没有要探测的账号：先勾选，或用分组按钮筛出一批');
  if(!await confirm(`对 ${list.length} 个账号各发一句「你好」探测风控？\n`
    +`· Cloak 使用账号独立浏览器与绑定代理；被登出才判风控，超时未确认不判风控\n`
    +`· 网络或上游限流（710022002）导致没探成 → 只记「未完成」，不会锁号\n`
    +`· 浏览器探测串行执行，账号忙或出口限流时跳过；普通 API 探测按服务器并发设置执行`))return;
  let r;
  try{r=await api('/api/admin/accounts/batch-probe-hello',{method:'POST',body:{names:list}});}
  catch(e){return alert(dialogText`${e.message}`);}
  stopProbePoll();
  showDlg(`<h2>批量你好探测（${list.length} 个账号）</h2>
    <div id="probeProg" class="tiny" style="margin:8px 0;white-space:pre-wrap"></div>
    <div id="probeOut" class="tiny log-pane"></div>
    <div class="row"><button class="btn" onclick="hide('dlg');stopProbePoll();refresh()">关闭</button></div>`);
  pollProbeBatch(r.job_id);
  probePollTimer=setInterval(()=>pollProbeBatch(r.job_id),2000);
}

let probePollTimer=null;
function stopProbePoll(){if(probePollTimer){clearInterval(probePollTimer);probePollTimer=null;}}

async function pollProbeBatch(jobId){
  let j;
  try{j=await api('/api/admin/batch/'+jobId);}catch(e){stopProbePoll();return;}
  const prog=q('#probeProg'),out=q('#probeOut');
  if(!prog||!out)return;
  const pct=j.total?Math.round((j.done/j.total)*100):0;
  prog.textContent=`进度 ${j.done}/${j.total}（${pct}%）  通过 ${j.ok_count||0}  未通过(进风控) ${j.failed_count||0}  未完成 ${j.skipped_count||0}`
    +(j.current?`\n当前：${j.current}`:'')+(j.status==='completed'?'\n已完成 ':'');
  out.textContent=(j.results||[]).slice().reverse()
    .map(x=>`${x.ok===true?'':(x.ok===false?'':'–')} ${x.name}  [${x.group||'-'}]  ${x.message||''}`
      +(x.reply?`  回复：${x.reply}`:''))
    .join('\n');
  if(j.status!=='running'){stopProbePoll();refresh();}
}

/** 批量恢复：把选中的（或当前筛出来的）风控/异常号放回流程。 */
async function batchRecover(){
  const sel=[...selAccounts];
  const list=sel.length?sel:allAccounts.filter(x=>matchGroup(x)&&(srcFilterVal==='all'||x.source===srcFilterVal)
      &&(x.group==='风控'||x.group==='异常')).map(x=>x.name);
  if(!list.length)return alert('没有要恢复的账号：先勾选，或切到【风控】/【异常】分组再点');
  if(!await confirm(`把 ${list.length} 个账号从【风控】/【异常】组恢复出来？\n`
    +`· 风控号恢复后登录态会被清空，回到【待激活】\n`
    +`· 想确认能不能用，恢复后接着点一次「你好探测」`))return;
  let r;
  try{r=await api('/api/admin/accounts/batch-recover',{method:'POST',body:{kind:'risk',names:list}});}
  catch(e){return alert(dialogText`${e.message}`);}
  stopProbePoll();
  showDlg(`<h2>批量恢复（${list.length} 个账号）</h2>
    <div id="probeProg" class="tiny" style="margin:8px 0;white-space:pre-wrap"></div>
    <div id="probeOut" class="tiny log-pane"></div>
    <div class="row"><button class="btn" onclick="hide('dlg');stopProbePoll();refresh()">关闭</button></div>`);
  pollProbeBatch(r.job_id);
  probePollTimer=setInterval(()=>pollProbeBatch(r.job_id),1500);
}

async function openBatchProxy(){
  const list=[...selAccounts];
  if(!list.length)return alert('请先勾选账号');
  try{const r=await api('/api/admin/proxies');proxyCache=r.proxies||[];}catch(e){return alert(dialogText`${e.message}`);}
  const opts='<option value="">默认代理（DOLA_PROXY）</option>'+proxyCache.map(p=>
    `<option translate="no" value="${esc(p.id)}">${esc(p.name)}（${esc(p.protocol)}://${esc(p.host)}:${p.port}）</option>`).join('');
  showDlg(`<h2>批量更改代理（${list.length} 个账号）</h2>
    <p class="tiny">把勾选的账号统一绑定到指定代理；选“默认代理”则解除绑定、回落到环境变量默认代理。验证/出片/下载都按账号代理走。</p>
    <select id="f_bproxy" style="width:100%;padding:8px 12px;border:1px solid var(--line);border-radius:8px;font-size:13px">${opts}</select>
    <div class="tiny" style="margin-top:8px;max-height:150px;overflow:auto">${list.map(noTr).join('、')}</div>
    <div class="row"><button class="btn" onclick="hide('dlg')">取消</button>
      <button class="btn btn-p" onclick="submitBatchProxy()">应用</button></div>`);
}

async function submitBatchProxy(){
  const list=[...selAccounts];
  const proxyId=q('#f_bproxy').value||null;
  let r;
  try{r=await api('/api/admin/accounts/batch-proxy',{method:'POST',body:{names:list,proxy_id:proxyId}});}
  catch(e){return alert(dialogText`${e.message}`);}
  hide('dlg');refresh();
  const failed=(r.failed||[]);
  alert(`已更新 ${r.updated.length} 个账号的代理`
    +(failed.length?`\n未改动 ${failed.length} 个：\n`+failed.map(f=>`${f.name}：${f.error}`).join('\n'):''));
}

async function resetAllQuotas(){
  if(!await confirm('立即重置全池额度？\n所有因「每日上限 / 积分不足 / 失败」被挡的账号会恢复调度与积分缓存。\n（不等同于风控冷却，风控账号仍需重新登录）'))return;
  try{const r=await api('/api/admin/accounts/reset-quotas',{method:'POST'});alert(`已重置 ${r.reset} 个账号的额度`);}
  catch(e){alert(dialogText`${e.message}`);}
  refresh();
}

async function deleteSelectedAccounts(){
  const list=[...selAccounts];
  if(!list.length)return;
  if(!await confirm(`确定删除选中的 ${list.length} 个账号？排队或加号中的任务会先取消，再清理浏览器资料和登录凭据。`))return;
  hideAccountsImmediately(list);
  let ok=0;
  for(const name of list){
    try{await deleteAccountInBackground(name,'/api/admin/accounts/'+encodeURIComponent(name));ok++;}
    catch(e){if(e.message!=='unauthorized')toast(dialogText`${name} 删除失败，已恢复显示：${e.message}`);}
  }
  if(ok)toast(`已从列表移除 ${ok} 个账号，后台继续清理`);
}

async function openSetAccountProxy(name,currentId){
  try{const r=await api('/api/admin/proxies');proxyCache=r.proxies||[];}catch(e){return alert(dialogText`${e.message}`);}
  const opts='<option value="">默认代理（DOLA_PROXY）</option>'+proxyCache.map(p=>
    `<option translate="no" value="${esc(p.id)}" ${p.id===currentId?'selected':''}>${esc(p.name)}</option>`).join('');
  showDlg(`<h2>设置账号代理：${noTr(name)}</h2>
    <p class="tiny">选择该账号验证/出片时使用的代理；留空则使用环境变量默认代理。</p>
    <select id="f_proxy" style="width:100%;padding:8px 12px;border:1px solid var(--line);border-radius:8px;font-size:13px">${opts}</select>
    <div class="row"><button class="btn" onclick="hide('dlg')">取消</button>
      <button class="btn btn-p" onclick="submitSetAccountProxy('${name}')">保存</button></div>`);
}
async function submitSetAccountProxy(name){
  const body={proxy_id:q('#f_proxy').value||null};
  try{await api('/api/admin/accounts/'+encodeURIComponent(name)+'/proxy',{method:'POST',body});}catch(e){return alert(dialogText`${e.message}`);}
  hide('dlg');refresh();
}

/** 「怎么获取 Cookie？」折叠说明（完整版见仓库 COOKIE.md）。 */
function cookieHowto(){
  return `<details style="margin-top:8px;font-size:12px;color:var(--sub)">
    <summary style="cursor:pointer;color:var(--text)">怎么获取 Cookie？</summary>
    <div style="line-height:1.7;margin-top:6px">
      <b>方法 1：Cookie-Editor 插件（推荐）</b><br>
      ① Chrome/Edge 应用商店安装 <b>Cookie-Editor</b>；② 打开 dola.com 登录，进到聊天页面；
      ③ 点插件图标 → <b>Export</b> → <b>Header String</b>（自动复制）；④ 粘贴到上面的框里，<b>一个账号一行</b>，点【开始导入】。<br>
      <b>方法 2：不装插件</b><br>
      F12 → Network → F5 刷新 → 点第一条请求 → Request Headers 里的 <code>cookie:</code> → 右键 Copy value。
      不要用控制台 <code>document.cookie</code>，它取不到 sessionid。<br>
      <b>注意</b>：内容里必须有 <code>sessionid=</code>；多个号请用浏览器多用户（或导完一个关一个无痕窗口）分别登录；
      导出后<b>不要点退出登录</b>（Cookie 会当场作废），直接关窗口。导入后绑定代理 → 点「你好探测」激活。
    </div></details>`;
}
let addProxyLoading=false,addProxyError=false;
let addProxyChoices=[],singleAddProxy='',batchAddProxyIds=[];
async function loadAddProxyChoices(){
  const r=await api('/api/admin/proxies');
  addProxyChoices=(r.proxies||[]).filter(p=>p.enabled);
}
async function finishAddProxyChoices(epoch){
  try{await loadAddProxyChoices();if(epoch!==dialogEpoch)return;addProxyError=false;}
  catch(e){if(epoch!==dialogEpoch)return;addProxyError=true;}
  if(epoch!==dialogEpoch)return;
  addProxyLoading=false;updateAddProxySection();
}
function updateAddProxySection(){
  const slot=q('#dlg [data-add-proxy]');if(!slot)return;
  slot.innerHTML=addProxyPickerContent(slot.dataset.addProxy==='multiple',slot.dataset.requireProxy==='true');
  q('#dlg .row .btn-p').disabled=addProxyLoading||addProxyError;
}
function retryAddProxyChoices(){
  addProxyLoading=true;addProxyError=false;updateAddProxySection();
  finishAddProxyChoices(dialogEpoch);
}
function addProxyPicker(multiple,required=false){
  return `<div data-add-proxy="${multiple?'multiple':'single'}" data-require-proxy="${required}">${addProxyPickerContent(multiple,required)}</div>`;
}
function addProxyPickerContent(multiple,required=false){
  if(addProxyLoading)return '<div class="hint" role="status">正在加载代理列表…</div>';
  if(addProxyError)return '<div class="hint">代理列表加载失败，请重试</div><button class="btn" onclick="retryAddProxyChoices()">重新加载代理</button>';
  if(multiple)return `<label style="margin-top:12px">添加时绑定代理（可多选）</label>
    <div style="max-height:150px;overflow:auto;margin:6px 0">${addProxyChoices.map(p=>
      `<label style="display:flex;align-items:center;gap:8px;margin:6px 0"><input type="checkbox" class="add-proxy-choice" style="width:auto;margin:0" value="${esc(p.id)}" ${batchAddProxyIds.includes(p.id)?'checked':''} onchange="batchAddProxyIds=Array.from(document.querySelectorAll('.add-proxy-choice:checked')).map(x=>x.value)">${noTr(p.name)}</label>`).join('')||'<span class="tiny">暂无已启用代理，请先到代理管理添加</span>'}</div>
    <div class="hint">按代理列表顺序轮流分配给新账号；不选则使用默认代理。登录或在线验证前完成绑定。</div>`;
  return `<label style="margin-top:12px">添加时绑定代理</label>
    <select id="f_addProxy" style="width:100%;padding:8px 12px;margin:6px 0" onchange="singleAddProxy=this.value">
      <option value="">${required?'请选择账号代理':'默认代理（DOLA_PROXY）'}</option>${addProxyChoices.map(p=>
        `<option translate="no" value="${esc(p.id)}" ${singleAddProxy===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}
    </select><div class="hint">${required?'登录前绑定选定代理；未选择时不会发起登录。':'登录或在线验证前完成绑定；未选择时使用默认代理。'}</div>`;
}
let batchAddMode='text';
let batchCookieFiles=[];
function batchAddModeSwitch(){
  return `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
    <button class="btn ${batchAddMode==='text'?'btn-p':''}" onclick="setBatchAddMode('text')">文本批量添加</button>
    <button class="btn ${batchAddMode==='cookie'?'btn-p':''}" onclick="setBatchAddMode('cookie')">Cookie JSON 文件</button>
    <button class="btn ${batchAddMode==='cookieHeader'?'btn-p':''}" onclick="setBatchAddMode('cookieHeader')">Cookie 头文本</button>
  </div>`;
}
async function openBatchAdd(){
  addProxyLoading=true;addProxyError=false;
  batchAddMode='text';batchAddProxyIds=[];renderBatchAddForm();
  await finishAddProxyChoices(dialogEpoch);
}
function setBatchAddMode(mode){batchAddMode=mode;renderBatchAddForm();if(addProxyLoading)finishAddProxyChoices(dialogEpoch);}
function renderBatchAddForm(){
  const sw=batchAddModeSwitch();
  if(batchAddMode==='cookie'){
    showDlg(`<h2>批量添加账号（Cookie JSON）</h2>${sw}
      <input id="f_cookieFiles" type="file" accept=".json,application/json" multiple style="margin-bottom:10px" onchange="previewCookieBatchFiles()">
      <div class="hint" style="margin-bottom:8px">选择一个或多个 Cookie 导出 JSON（每个文件对应一个 dola 账号，如 ck76.json）。
      账号名默认取文件名；文件需为扩展导出格式（含 cookies 数组）。导入会排队逐个写入 profile。</div>
      <label style="display:flex;align-items:flex-start;gap:6px;color:var(--sub);margin:8px 0">
        <input type="checkbox" id="f_cookieSkip" style="margin-top:2px;width:auto" checked>
        <span>跳过在线验证（先导入，之后可在账号列表点“验证”复核）</span>
      </label>
      <div id="batchCookieInfo" class="tiny" style="margin:6px 0;white-space:pre-wrap"></div>
      ${addProxyPicker(true)}
      <div id="batchResult" class="tiny" style="margin-top:8px;white-space:pre-wrap;max-height:150px;overflow:auto"></div>
      <div class="row"><button class="btn" onclick="hide('dlg')">取消</button><button class="btn btn-p" ${addProxyLoading||addProxyError?'disabled':''} onclick="submitBatchCookieAdd()">开始批量导入</button></div>`);
    return;
  }
  if(batchAddMode==='cookieHeader'){
    showDlg(`<h2>批量添加账号（Cookie 头文本 / Cookie JSON）</h2>${sw}
      <label>Cookie 头文本或 Cookie JSON（一行一个账号）</label>
      <textarea id="f_cookieHeader" rows="10" style="width:100%;padding:8px 12px;border:1px solid var(--line);border-radius:8px;font-size:12px;font-family:ui-monospace,Consolas,monospace;margin-top:4px" placeholder="passport_csrf_token=aaa; sessionid=sid-one; sid_guard=g1
passport_csrf_token=bbb; sessionid=sid-two"></textarea>
      <div class="hint" style="margin-top:6px">每行一个 Cookie 头，或粘贴浏览器扩展导出的 Cookie JSON 数组（一个数组一个账号，可多段连续粘贴）；自动跳过注释/空行/邮箱行，按 sessionid 去重并自动命名 accN。<br>含 localStorage/sessionStorage/indexedDB 的完整会话请改用「Cookie JSON 文件」模式。</div>
      <label style="display:flex;align-items:center;gap:8px;margin-top:8px">站点
        <select id="f_cookieSite" style="width:auto;padding:4px 8px;border:1px solid var(--line);border-radius:6px">
          <option value="dola" selected>dola.com</option>
          <option value="doubao">豆包 doubao.com</option>
        </select>
        <span class="tiny">只对「Cookie 头」格式生效；Cookie JSON 自带域名，会自动识别</span>
      </label>
      ${cookieHowto()}
      <label style="display:flex;align-items:flex-start;gap:6px;color:var(--sub);margin:8px 0">
        <input type="checkbox" id="f_cookieHeaderSkip" style="margin-top:2px;width:auto" checked>
        <span>跳过在线验证（先导入、保留 profile，之后在列表点“验证”复核）</span>
      </label>
      ${addProxyPicker(true)}
      <div id="batchResult" class="tiny" style="margin-top:8px;white-space:pre-wrap;max-height:150px;overflow:auto"></div>
      <div class="row"><button class="btn" onclick="hide('dlg')">取消</button><button class="btn btn-p" ${addProxyLoading||addProxyError?'disabled':''} onclick="submitBatchCookieHeader()">开始导入</button></div>`);
    return;
  }
  showDlg(`<h2>批量添加账号</h2>${sw}
    <label>账号列表（支持多种格式，见下方提示）</label>
    <textarea id="f_batch" rows="10" style="width:100%;padding:8px 12px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:ui-monospace,Consolas,monospace" placeholder="acc1 user1@xx.com pass123 TOTPKEY
acc2 user2@xx.com pass456

支持格式：
1) 每行一个：账号名 邮箱 密码 [TOTP]
2) 一行内用 | 分隔账号：acc1 a@b.com 123 | acc2 c@d.com 456
3) 字段用 | 分隔：acc1|a@b.com|123|TOTPKEY
4) 邮箱|密码 / 邮箱---密码（自动命名 accN，可选 TOTP）
5) 邮箱----密码----辅助邮箱----收件API地址（Google 登录，自动命名）
账号名可省略（自动 accN），TOTP 可省略"></textarea>
    <div class="hint" style="margin-top:6px">支持四段格式：邮箱----密码----辅助邮箱----收件API地址，每行一个。辅助邮箱和收件 API 会保存到备注详情。账号会排队逐个登录。</div>
    ${addProxyPicker(true)}
      <div id="batchResult" class="tiny" style="margin-top:8px;white-space:pre-wrap;max-height:150px;overflow:auto"></div>
    <div class="row"><button class="btn" onclick="hide('dlg')">取消</button><button class="btn btn-p" ${addProxyLoading||addProxyError?'disabled':''} onclick="submitBatchAdd()">开始批量添加</button></div>`);
}
function fileBaseName(fileName){
  const name=(fileName||'').replace(/\.json$/i,'').trim();
  const safe=name.replace(/[^A-Za-z0-9_-]/g,'_').replace(/^_+|_+$/g,'');
  if(!safe)return '';
  return safe.length>32?safe.slice(0,32):safe;
}
async function previewCookieBatchFiles(){
  const input=q('#f_cookieFiles');
  const info=q('#batchCookieInfo');const out=q('#batchResult');
  batchCookieFiles=[];out.textContent='';
  const files=Array.from(input.files||[]);
  if(!files.length)return info.textContent='';
  const lines=[];let i=0;
  for(const file of files){
    try{
      const text=await file.text();
      const data=JSON.parse(text);
      const cookies=Array.isArray(data)?data:(data&&Array.isArray(data.cookies)?data.cookies:null);
      if(!cookies||!cookies.length)throw new Error('没有 cookies 数组');
      const base=fileBaseName(file.name)||('ck'+(++i));
      batchCookieFiles.push({name:base,cookies:cookies.length,file:file.name,raw:JSON.stringify(data)});
      lines.push('· '+base+'  <- '+file.name+'（'+cookies.length+' 条 cookie）');
    }catch(e){
      lines.push(' '+file.name+' 解析失败：'+(e.message||e));
    }
  }
  info.textContent=lines.join('\n')||'未选择可导入的文件';
}
async function submitBatchCookieAdd(){
  if(addProxyLoading||addProxyError)return;
  const btn=q('#dlg .row .btn-p');const res=q('#batchResult');const info=q('#batchCookieInfo');
  if(!batchCookieFiles.length)return alert('请先选择 Cookie JSON 文件');
  const skip=q('#f_cookieSkip').checked;
  const proxies=[...batchAddProxyIds];let proxyIndex=0;
  btn.disabled=true;res.textContent='';
  let existing=[];
  try{const r=await api('/api/admin/accounts');existing=r.accounts||[];}catch(e){}
  const taken=new Set(existing.map(x=>x.name));
  const lines=[];let submitted=0;
  for(const item of batchCookieFiles){
    if(taken.has(item.name)){
      lines.push(' '+item.name+'：账号名已存在，跳过（可先删除或重命名文件）');
      continue;
    }
    taken.add(item.name);
    try{
      await api('/api/admin/accounts',{method:'POST',body:{name:item.name,email:'',password:'',totp:'',cookies:item.raw,cookie_skip_verify:skip,proxy_id:proxies.length?proxies[proxyIndex++%proxies.length]:null}});
      lines.push(' '+item.name+' 已提交导入');
      submitted++;
    }catch(e){
      lines.push(' '+item.name+'：'+e.message);
    }
    res.textContent=lines.join('\n');
    await new Promise(r=>setTimeout(r,500));
  }
  btn.disabled=false;
  lines.push(submitted?('完成：提交 '+submitted+' 个账号'):'未提交任何账号');
  res.textContent=lines.join('\n');
  info.textContent='';
  batchCookieFiles=[];
  if(submitted)refresh();
}

async function submitBatchCookieHeader(){
  if(addProxyLoading||addProxyError)return;
  const btn=q('#dlg .row .btn-p');const res=q('#batchResult');
  const text=q('#f_cookieHeader').value.trim();
  if(!text)return alert('请粘贴 Cookie 头文本或 Cookie JSON（一个账号一份）');
  btn.disabled=true;res.textContent='导入中…';
  try{
    const r=await api('/api/admin/accounts/import-cookies',{method:'POST',body:{
      text, skip_verify:q('#f_cookieHeaderSkip').checked,
      site:(q('#f_cookieSite')||{}).value||'dola',proxy_ids:[...batchAddProxyIds]
    }});
    const lines=[];
    if(r.created&&r.created.length)lines.push(' 已创建：'+r.created.join('、'));
    if(r.updated&&r.updated.length)lines.push('↻ 已存在(sessionid 重复)：'+r.updated.join('、'));
    if(r.errors&&r.errors.length)lines.push(' 失败：\n'+r.errors.join('\n'));
    res.textContent=lines.join('\n')||'未导入任何账号';
    if(r.created&&r.created.length)refresh();
  }catch(e){res.textContent='导入失败：'+(e.message||e);}
  btn.disabled=false;
}

function buildRecord(f){
  if(!f || f.length<2)return null;
  const isEmail=s=>/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s||'');
  if(f.length===4 && isEmail(f[0])){
    let validUrl=false;
    try{const u=new URL(f[3]);validUrl=['http:','https:'].includes(u.protocol)&&!!u.hostname&&!/\s/.test(f[3]);}catch(e){}
    if(!f[1]||!isEmail(f[2])||!validUrl)return null;
    return {name:null,email:f[0],password:f[1],totp:'',recovery_email:f[2],mail_api:f[3],login_method:'google'};
  }
  // 只有 邮箱 密码 两字段（无账号名、无 TOTP）→ 自动命名 accN
  if(f.length===2 && f[0].includes('@')){
    return {name:null,email:f[0],password:f[1],totp:''};
  }
  if(f.length<3)return null;
  let name,email,password,totp='';
  if(f.length>=4 || /^acc\d+$/i.test(f[0]) || !f[0].includes('@')){
    name=f[0];email=f[1];password=f[2];totp=f[3]||'';
  }else{
    email=f[0];password=f[1];totp=f[2]||'';
  }
  return {name:name||null,email,password,totp};
}

/** 自动命名：从已有 accN（含加号中 / 加号失败的记录）的最大编号往后取，跳过已被占用的名字。
 *  以前用「账号总数 + 1」，号名不连续时（acc13、acc150…）会撞上已有的号，那几条被静默跳过。 */
function takenAccNames(){
  const taken=new Set((typeof allAccountNames!=='undefined'&&allAccountNames)||[]);
  try{(allAccounts||[]).forEach(a=>taken.add(a.name||a));}catch(e){}
  try{Object.keys((accountSnapshot&&accountSnapshot.j&&accountSnapshot.j.jobs)||{}).forEach(n=>taken.add(n));}catch(e){}
  return taken;
}
function nextFreeAccName(taken){
  let n=0;
  taken.forEach(x=>{const m=/^acc(\d+)$/i.exec(String(x));if(m)n=Math.max(n,Number(m[1]));});
  do{n++;}while(taken.has('acc'+n));
  return 'acc'+n;
}
function parseBatchInput(text){
  const out=[],taken=takenAccNames();
  const pushRec=f=>{
    const rec=buildRecord(f);
    if(rec){if(!rec.name)rec.name=nextFreeAccName(taken);taken.add(rec.name);out.push(rec);}
  };
  for(const row of String(text||'').replace(/^\uFEFF/,'').split(/\r?\n/)){
    const line=row.trim();
    if(!line||line.startsWith('#'))continue;
    // Four-field exports are line-based: preserve punctuation in password/API query.
    const at=line.indexOf('----');
    if(at>=0 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(line.slice(0,at).trim())){
      const fields=[];let rest=line;
      for(let i=0;i<3;i++){const j=rest.indexOf('----');if(j<0)break;fields.push(rest.slice(0,j).trim());rest=rest.slice(j+4);}
      if(fields.length===3){fields.push(rest.trim());pushRec(fields);continue;}
    }
    // Legacy formats keep their original separators and input order.
    const normalized=row.replace(/[，；｜]/g,c=>({'，':',','；':';','｜':'|'}[c]));
    for(const block of normalized.split(/[;,]/).map(s=>s.trim()).filter(Boolean)){
      if(block.includes('---')){pushRec(block.split(/---+/).map(s=>s.trim()));continue;}
      const parts=block.split('|').map(s=>s.trim()).filter(Boolean);
      if(parts.length===1){
        pushRec(parts[0].split(/\s+/).filter(Boolean));
      }else if(parts.length===2){
        if(!parts[0].includes(' ')&&!parts[1].includes(' '))pushRec(parts);
        else for(const part of parts)pushRec(part.split(/\s+/).filter(Boolean));
      }else if(parts.length<=4){
        pushRec(parts);
      }else{
        for(const part of parts)pushRec(part.split(/\s+/).filter(Boolean));
      }
    }
  }
  return out;
}

async function submitBatchAdd(){
  if(addProxyLoading||addProxyError)return;
  const accounts=parseBatchInput(q('#f_batch').value);
  const proxies=[...batchAddProxyIds];
  if(!accounts.length)return alert('未解析到任何账号，请检查格式；支持 邮箱----密码----辅助邮箱----收件API地址');
  const btn=q('#dlg .row .btn-p');const res=q('#batchResult');
  btn.disabled=true;res.textContent='';
  const lines=[];
  const normEmail=e=>String(e||'').trim().toLowerCase();
  // 先拉取现有账号与进行中的加号任务，按邮箱剔除重复项
  let existing=[],jobs={};
  try{
    const [a,j]=await Promise.all([api('/api/admin/accounts'),api('/api/admin/jobs')]);
    existing=a.accounts||[];jobs=j.jobs||{};
  }catch(e){}
  const owner=new Map();
  existing.forEach(x=>{if(x.email&&!owner.has(normEmail(x.email)))owner.set(normEmail(x.email),x.name);});
  Object.entries(jobs).forEach(([name,job])=>{
    if(job.kind==='add'&&job.status==='running'&&job.email&&!owner.has(normEmail(job.email)))
      owner.set(normEmail(job.email),name+'（添加中）');
  });
  const nameTaken=new Set(existing.map(x=>x.name));
  const seen=new Map();
  const todo=[];const dups=[];
  accounts.forEach((a,idx)=>{
    const em=normEmail(a.email);
    let why='';
    if(nameTaken.has(a.name))why='账号名 '+a.name+' 已存在';
    else if(owner.has(em))why='邮箱重复（已存在 '+owner.get(em)+'）';
    else if(seen.has(em))why='本批内重复（第 '+(seen.get(em)+1)+' 条）';
    if(why){
      dups.push('跳过 '+a.name+' '+a.email+'：'+why);
      return;
    }
    seen.set(em,idx);
    nameTaken.add(a.name);
    todo.push(a);
  });
  if(dups.length){
    lines.push('检测到 '+dups.length+' 条重复账号，已剔除：');
    lines.push(...dups);
    res.textContent=lines.join('\n');
  }
  for(let i=0;i<todo.length;i++){
    const a={...todo[i],proxy_id:proxies.length?proxies[i%proxies.length]:null};
    try{
      await api('/api/admin/accounts',{method:'POST',body:a});
      lines.push(' '+a.name+' '+a.email+' 已提交');
    }catch(e){
      lines.push(' '+a.name+' '+a.email+': '+e.message);
    }
    res.textContent=lines.join('\n');
    await new Promise(r=>setTimeout(r,800));
  }
  btn.disabled=false;
  if(!todo.length)lines.push('未提交任何新账号');
  else lines.push('完成：新提交 '+todo.length+' 条');
  res.textContent=lines.join('\n');
  refresh();
}

let addMode='google';
function nextAccName(){
  try{return nextFreeAccName(takenAccNames());}catch(e){return 'acc1';}
}
function addModeSwitch(){
  return `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
    <button class="btn ${addMode==='google'?'btn-p':''}" onclick="setAddMode('google')">Google 登录</button>
    <button class="btn ${addMode==='apple'?'btn-p':''}" onclick="setAddMode('apple')">Apple 登录</button>
    <button class="btn ${addMode==='cookie'?'btn-p':''}" onclick="setAddMode('cookie')">Cookie 导入</button>
  </div>`;
}
function setAddMode(m){addMode=m;renderAddAccountForm();if(addProxyLoading)finishAddProxyChoices(dialogEpoch);}
async function openAddAccount(){
  addProxyLoading=true;addProxyError=false;
  addMode='google';singleAddProxy='';renderAddAccountForm();
  await finishAddProxyChoices(dialogEpoch);
}
function renderAddAccountForm(){
  const def=nextAccName();
  const sw=addModeSwitch();
  if(addMode==='cookie'){
    showDlg(`<h2>添加账号</h2>${sw}
      <label>账号名</label><input id="f_name" value="${def}">
      ${addProxyPicker(false)}
      <label>Cookie JSON</label>
      <textarea id="f_cookies" rows="13" style="width:100%;padding:8px 12px;border:1px solid var(--line);border-radius:8px;font-size:12px;font-family:ui-monospace,Consolas,monospace;margin-top:4px" placeholder='{"format":"...","cookies":[{"name":"sessionid",...}]}'></textarea>
      <div class="hint" style="margin-top:6px">粘贴 Cookie-Editor / EditThisCookie 等扩展导出的完整 JSON。</div>
      <label style="margin-top:10px;display:flex;align-items:flex-start;gap:6px;color:var(--sub)">
        <input type="checkbox" id="f_skip" style="margin-top:2px;width:auto">
        <span>跳过在线验证：服务器没有 JP/KR 代理时 dola 会地区限制；勾选后可先导入账号，配好代理后在账号列表点“验证”。</span>
      </label>
      <div class="row"><button class="btn" onclick="hide('dlg')">取消</button><button class="btn btn-p" ${addProxyLoading||addProxyError?'disabled':''} onclick="submitAddCookie()">导入账号</button></div>`);
    return;
  }
  if(addMode==='apple'){
    showDlg(`<h2>添加账号</h2>${sw}
      <label>账号名</label><input id="f_name" value="${def}">
      ${addProxyPicker(false,true)}
      <label>Apple 账号</label><input id="f_email" autocomplete="off" placeholder="电子邮件或电话号码">
      <label>密码</label><input id="f_pass" type="password" autocomplete="new-password">
      <p class="hint">请先选择账号代理。登录使用 Apple 官方授权页；若出现双重验证，请在面板输入受信任设备收到的六位验证码。</p>
      <p class="hint">密码和验证码仅用于本次登录，不保存。登录完成后保存账号的独立浏览器登录态。</p>
      <div class="row"><button class="btn" onclick="hide('dlg')">取消</button><button class="btn btn-p" ${addProxyLoading||addProxyError?'disabled':''} onclick="submitAddApple()">开始 Apple 登录</button></div>`);
    return;
  }
  showDlg(`<h2>添加账号</h2>${sw}
    <label>账号名</label><input id="f_name" value="${def}">
      ${addProxyPicker(false)}
    <label>Google 邮箱</label><input id="f_email" placeholder="xxx@yy.asia">
    <label>密码</label><input id="f_pass" type="password">
    <label>TOTP 密钥</label><input id="f_totp" placeholder="2FA secret">
    <div class="row"><button class="btn" onclick="hide('dlg')">取消</button><button class="btn btn-p" ${addProxyLoading||addProxyError?'disabled':''} onclick="submitAddAccount()">开始登录</button></div>`);
}
async function submitAddAccount(){
  if(addProxyLoading||addProxyError)return;
  const body={name:q('#f_name').value.trim(),email:q('#f_email').value.trim(),password:q('#f_pass').value,totp:q('#f_totp').value.trim(),proxy_id:singleAddProxy||null};
  if(!body.name||!body.email||!body.password)return alert('请填写账号名/邮箱/密码');
  try{await api('/api/admin/accounts',{method:'POST',body});}catch(e){return alert(dialogText`${e.message}`);}
  hide('dlg');refresh();
}
async function submitAddCookie(){
  if(addProxyLoading||addProxyError)return;
  const body={name:q('#f_name').value.trim(),email:'',password:'',totp:'',cookies:q('#f_cookies').value.trim(),cookie_skip_verify:q('#f_skip').checked,proxy_id:singleAddProxy||null};
  if(!body.name)return alert('请填写账号名');
  if(!body.cookies)return alert('请粘贴 Cookie JSON');
  try{JSON.parse(body.cookies);}catch(e){return alert('Cookie JSON 解析失败：'+e.message);}
  try{await api('/api/admin/accounts',{method:'POST',body});}catch(e){return alert(dialogText`${e.message}`);}
  hide('dlg');refresh();
}

let appleProgressTimer=null,appleProgressName='',appleChallengeId='';
function stopAppleProgress(){clearTimeout(appleProgressTimer);appleProgressTimer=null;appleProgressName='';appleChallengeId='';}
async function submitAddApple(){
  if(addProxyLoading||addProxyError)return;
  const body={name:q('#f_name').value.trim(),email:q('#f_email').value.trim(),password:q('#f_pass').value,login_method:'apple',proxy_id:singleAddProxy||null};
  if(!body.name||!body.email||!body.password)return alert('请填写账号名/Apple 账号/密码');
  if(!body.proxy_id)return alert('请选择 Apple 账号使用的代理');
  const button=q('#dlg .btn-p:last-child'),epoch=dialogEpoch;if(button)button.disabled=true;
  try{await api('/api/admin/accounts',{method:'POST',body});}
  catch(e){body.password='';if(epoch!==dialogEpoch)return;if(button)button.disabled=false;q('#f_pass').value='';return alert(dialogText`${e.message}`);}
  body.password='';if(epoch!==dialogEpoch){refresh();return;}q('#f_pass').value='';
  openAppleProgress(body.name);refresh();
}
async function retryAppleLogin(name){
  let job;try{job=(await api('/api/admin/jobs')).jobs[name];}catch(e){return alert(dialogText`${e.message}`);}
  addMode='apple';singleAddProxy='';addProxyLoading=true;addProxyError=false;renderAddAccountForm();
  q('#f_name').value=name;q('#f_email').value=job?.email||'';
  await finishAddProxyChoices(dialogEpoch);
}
function openAppleProgress(name){
  showDlg(`<h2>Apple 登录</h2><p translate="no">${esc(name)}</p>
    <p id="appleStage" role="status">正在读取登录进度…</p>
    <div id="appleCodeBox" hidden><label>六位验证码</label><input id="appleCode" type="password" inputmode="numeric" autocomplete="one-time-code" maxlength="6">
      <button class="btn btn-p" onclick="submitAppleAnswer()">提交验证码</button></div>
    <button id="appleContinue" class="btn btn-p" hidden onclick="submitAppleAnswer()">确认继续授权</button>
    <p id="appleFeedback" role="alert" class="hint"></p>
    <div class="row"><button class="btn" onclick="hide('dlg')">关闭窗口，后台继续</button><button id="appleCancel" class="btn btn-danger" onclick="cancelAppleLogin()">取消登录</button></div>`);
  appleProgressName=name;pollAppleProgress(dialogEpoch);
}
async function pollAppleProgress(epoch){
  const name=appleProgressName;
  if(!name||epoch!==dialogEpoch)return;
  try{
    const job=(await api('/api/admin/jobs')).jobs[name];
    if(epoch!==dialogEpoch||name!==appleProgressName)return;
    const running=job?.status==='running';
    q('#appleStage').textContent=running?(job.stage||'等待 Apple 登录'):job?.status==='success'?'Apple 登录成功，账号已加入号池':job?.error||'登录任务已结束';
    const challenge=running?job.challenge:null;
    if(appleChallengeId!==(challenge?.id||''))q('#appleCode').value='';
    appleChallengeId=challenge?.id||'';
    q('#appleCodeBox').hidden=challenge?.kind!=='code';q('#appleContinue').hidden=challenge?.kind!=='continue';
    q('#appleCancel').hidden=!running;
    if(!running){q('#appleFeedback').textContent='';stopAppleProgress();refresh();return;}
  }catch(e){if(epoch!==dialogEpoch)return;q('#appleFeedback').textContent=e.message;}
  if(epoch===dialogEpoch&&appleProgressName)appleProgressTimer=setTimeout(()=>pollAppleProgress(epoch),2000);
}
async function submitAppleAnswer(){
  if(!appleProgressName||!appleChallengeId)return;
  const name=appleProgressName,epoch=dialogEpoch,id=appleChallengeId;
  const code=q('#appleCodeBox').hidden?'':q('#appleCode').value.trim();
  if(!q('#appleCodeBox').hidden&&!/^\d{6}$/.test(code))return alert('请输入 Apple 的六位验证码');
  q('#appleCode').value='';q('#appleFeedback').textContent='正在提交…';
  try{
    await api('/api/admin/jobs/'+encodeURIComponent(name)+'/apple-answer',{method:'POST',body:{challenge_id:id,code}});
    if(epoch===dialogEpoch){appleChallengeId='';q('#appleCodeBox').hidden=true;q('#appleContinue').hidden=true;q('#appleFeedback').textContent='已提交，正在等待 Apple 返回结果';}
  }catch(e){if(epoch===dialogEpoch)q('#appleFeedback').textContent=e.message;}
}
async function cancelAppleLogin(){
  const name=appleProgressName,epoch=dialogEpoch;if(!name)return;
  const button=q('#appleCancel');button.disabled=true;
  try{await api('/api/admin/jobs/'+encodeURIComponent(name)+'/apple-cancel',{method:'POST'});if(epoch===dialogEpoch){clearTimeout(appleProgressTimer);pollAppleProgress(epoch);}refresh();}
  catch(e){if(epoch===dialogEpoch){button.disabled=false;q('#appleFeedback').textContent=e.message;}}
}

