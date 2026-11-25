/* ---- 代理管理 ---- */
function proxyProtocolOptions(sel){
  return ['http','https','socks4','socks5'].map(p=>
    `<option value="${p}" ${p===sel?'selected':''}>${p.toUpperCase()}</option>`).join('');
}
function proxyModeOptions(sel){
  return [['static','静态IP（一条记录 = 一个固定出口）'],
          ['extract','动态IP（出口由节点池提供，一个节点 = 一个出口 IP）']].map(([v,t])=>
    `<option value="${v}" ${v===sel?'selected':''}>${t}</option>`).join('');
}
// 动态IP 的取节点方式：提取链接 / 直接粘贴 / 隧道网关
function proxyKindOf(p){
  if(!p)return 'paste';
  if((p.mode||'static')==='dynamic')return 'tunnel';
  if(p.mode==='extract')return p.extract_url?'url':'paste';
  return 'paste';
}
function proxyKindRadios(sel){
  return [['url','提取链接（调接口拿一批节点）'],
          ['paste','直接粘贴节点（每行 host:port:user:pass，可批量）'],
          ['tunnel','隧道/旋转网关（每号一个 session，需要填网关地址）']].map(([v,t])=>
    `<label style="display:flex;align-items:center;gap:8px;font-weight:400;margin:4px 0">
       <input type="radio" name="f_pkind" value="${v}" ${v===sel?'checked':''} onchange="onProxyKindChange()"> ${t}</label>`).join('');
}
function onProxyModeChange(){
  const m=q('#f_pmode').value;
  const box=q('#dynBox');
  if(box)box.style.display=m==='extract'?'block':'none';
  onProxyKindChange();
}
function onProxyKindChange(){
  const m=q('#f_pmode').value;
  const r=q('input[name=f_pkind]:checked');
  const kind=m==='extract'?(r?r.value:'paste'):'';
  // 静态 / 隧道 要填网关地址；提取链接和粘贴节点的出口由节点决定，不显示 IP、端口
  const gw=q('#gwBox');
  if(gw)gw.style.display=(m!=='extract'||kind==='tunnel')?'block':'none';
  const ex=q('#extractBox');
  if(ex)ex.style.display=(m==='extract'&&kind==='url')?'block':'none';
  const pa=q('#pasteBox');
  if(pa)pa.style.display=(m==='extract'&&kind==='paste')?'block':'none';
  const tu=q('#tunnelBox');
  if(tu)tu.style.display=(m==='extract'&&kind==='tunnel')?'block':'none';
}
let proxyProbeCache={};
let shownProxyIds=[];
// Both views use the backend's inventory_state; pending candidates are not usable IPs.
function nodeInventorySummary(nodes){
  const counts={total:nodes.length,assigned:0,available:0,pending:0,discarded:0};
  for(const n of nodes)counts[n.inventory_state in counts?n.inventory_state:'pending']++;
  return counts;
}
function proxyInventoryCell(p){
  if(p.mode!=='extract')return '—';
  if(!p.enabled)return '<span class="tiny">已停用</span>';
  const s=p.node_inventory;
  if(!s)return '<span class="tiny">统计加载中</span>';
  return '<div style="white-space:nowrap;text-align:right;font-variant-numeric:tabular-nums" title="已通过日韩出口核验，分配前仍会检查连接">可分配 <b>'+s.available+'</b></div>'+
    '<div class="tiny" style="white-space:nowrap;text-align:right" title="未分配候选，尚未检测或需要重新检测；不代表可用 IP">待检测 '+s.pending+'</div>';
}
function nodeInventoryStatus(n){
  if(n.region_rejected)return '<span class="badge b-red">非日韩，已剔除</span>';
  if(n.inventory_state==='discarded')return '<span class="badge b-red" title="'+esc(n.discarded_reason||'连接不可用')+'">'+(n.expired?'已过期':'已弃用')+'</span>';
  if(n.inventory_state==='assigned')return n.country_verified?'<span class="badge b-green">已分配 · 已核验</span>':'<span class="tiny">已分配 · 待复检</span>';
  return n.inventory_state==='available'?'<span class="badge b-green">可分配</span>':'<span class="tiny">待检测</span>';
}
function proxyInventoryRemark(p){
  if(!p.auto_replenish)return p.remark?noTr(p.remark):'<span class="tiny">—</span>';
  const prefix=String(p.remark||'').split('A1Proxy 自动补充：')[0].trim();
  const country=p.auto_country_code==='JP'?'日本':p.auto_country_code==='KR'?'韩国':'日韩';
  return noTr((prefix?prefix+' ':'')+'自动补充：优先'+country+'；仅分配日韩出口；每批最多 '+(p.auto_batch_size||10)+' 条，最短间隔 '+(p.auto_min_interval||60)+' 秒；分配前预检。');
}
async function loadProxies(){
  const r=await api('/api/admin/proxies');
  proxyCache=r.proxies||[];
  const dp=q('#defaultProxyShow');if(dp)dp.textContent=r.default_proxy?'（'+r.default_proxy+'）':'（未设置）';
  const shown=proxyCache.filter(p=>searchHit('proxies',p.name,p.host,p.port,p.username,p.protocol,p.remark,
    proxyProbeCache[p.id],p.mode==='extract'?'节点池':p.is_dynamic?'隧道 动态':'静态'));
  selPrune('proxies',shown.map(p=>p.id));
  shownProxyIds=shown.map(p=>p.id);
  setHTML('#proxiesTable',table(
    [selAllBox('proxies'),'名称','类型','协议','地址','端口','用户名','未分配节点','绑定账号','出口IP','备注','操作'],
    shown.map(p=>[
      selBox('proxies',p.id,false),
      noTr(p.name),
      p.mode==='extract'?(p.auto_replenish?'<span class="badge b-blue">自动补充</span>':p.extract_url?'<span class="badge b-blue">提取链接</span>'
                                        :'<span class="badge b-blue">粘贴节点</span>')
        :p.is_dynamic?'<span class="badge b-blue">隧道</span>':'<span class="tiny">静态</span>',
      esc(p.protocol),
      p.host?esc(p.host):'<span class="tiny">（节点池）</span>',
      p.port?p.port:'<span class="tiny">—</span>',
      p.username?noTr(p.username):'<span class="tiny">—</span>',
      proxyInventoryCell(p),
      '<span title="绑定到此代理池的账号总数，不等于当前有效节点数">'+(p.account_count||0)+'</span>',
      (p.region_rejected?'<span class="badge b-red">非日韩，已剔除</span>':proxyProbeCache[p.id]?esc(proxyProbeCache[p.id]):'<span class="tiny">—</span>')+
        ` <button class="btn" onclick="probeProxy('${p.id}',this)">探测</button>`,
      proxyInventoryRemark(p),
      `<button class="btn" style="margin-right:6px" onclick="openEditProxy('${p.id}')">编辑</button>
       ${p.mode==='extract'?`<button class="btn" style="margin-right:6px" onclick="showNodes('${p.id}')">节点池</button>`:''}
       ${p.is_dynamic||p.mode==='extract'?`<button class="btn" style="margin-right:6px" onclick="rotateProxy('${p.id}')">换IP</button>`:''}
       <button class="btn btn-danger" onclick="delProxy('${p.id}')">删除</button>`
    ])
  )+searchEmpty('proxies',shown.length));
  selUpdate('proxies');
}
async function showNodes(id){
  let r;
  try{ r=await api('/api/admin/proxies/'+encodeURIComponent(id)+'/nodes'); }
  catch(e){ return alert(dialogText`${e.message}`); }
  const p=proxyCache.find(x=>x.id===id);
  const stats=nodeInventorySummary(r.nodes||[]);
  const rows=(r.nodes||[]).map(n=>[
    n.id,
    esc(n.host+':'+n.port),
    n.username?noTr(n.username):'<span class="tiny">—</span>',
    nodeInventoryStatus(n),
    (n.assigned_accounts||[]).map(esc).join('、')||'<span class="tiny">未分配</span>',
    n.discarded_at?fmt(n.discarded_at):n.last_ok_at?fmt(n.last_ok_at):'—',
    esc(n.last_exit_ip||'')||'<span class="tiny">—</span>',
    n.fail_count||0,
    esc(n.country_code||'—')
  ]);
  showDlg('<h2>节点池 — '+noTr(p?p.name:id)+'</h2>'+
    '<div class="tiny nodes-inventory-summary" style="margin-bottom:8px">共 '+stats.total+' · 已分配 '+stats.assigned+' · 可分配 '+stats.available+' · 待检测 '+stats.pending+' · 已弃用 '+stats.discarded+'</div>'+
    '<div class="tiny" style="margin-bottom:8px">可分配、待检测只统计未分配节点，与代理列表一致；已分配不包含弃用节点。会话过期或连接失败后弃用，日韩地区核验超过 5 分钟需复检。</div>'+
    '<div class="nodes-table-scroll" role="region" aria-label="节点列表" tabindex="0">'+table(['#','地址','用户名','状态','分配账号','检测时间','出口IP','失败次数','国家'],rows)+'</div>'+
    '<div class="row nodes-actions">'+(p&&p.extract_url?'<button class="btn" onclick="refreshNodes(\''+id+'\')">补一批节点（提取）</button>':'')+
    '<button class="btn" onclick="hide(\'dlg\');batchProbeIps(\'proxies\',[\''+id+'\'])">探测全部节点</button>'+
    '<button class="btn" onclick="pasteNodes(\''+id+'\')">粘贴补节点</button>'+
    '<button class="btn" onclick="pruneNodes(\''+id+'\')">清理废节点</button>'+
    '<button class="btn" onclick="hide(\'dlg\')">关闭</button></div>','nodes');
}
function pasteNodes(id){
  const p=proxyCache.find(x=>x.id===id);
  showDlg('<h2>粘贴节点 — '+noTr(p?p.name:id)+'</h2>'+
    '<div class="tiny" style="margin-bottom:6px">一行一个 <code>host:port:user:pass</code>，可批量粘贴'+
    '（也认 <code>user:pass@host:port</code>、<code>host:port</code>）；已存在的节点会自动跳过。</div>'+
    '<textarea id="f_pnodes2" rows="8" spellcheck="false" style="width:100%;padding:8px 12px;border:1px solid var(--line);border-radius:8px;font-size:12px;font-family:monospace"></textarea>'+
    '<div class="row"><button class="btn" onclick="hide(\'dlg\')">取消</button>'+
    '<button class="btn btn-p" onclick="submitPasteNodes(\''+id+'\')">加入节点池</button></div>');
}
async function submitPasteNodes(id){
  const text=q('#f_pnodes2').value.trim();
  if(!text)return alert('请粘贴节点');
  try{
    const r=await api('/api/admin/proxies/'+encodeURIComponent(id)+'/nodes',{method:'POST',body:{text}});
    alert(`已加入 ${r.added} 个节点（解析到 ${r.parsed} 行）`);
  }catch(e){return alert(dialogText`${e.message}`);}
  showNodes(id);loadProxies();
}
async function refreshNodes(id){
  try{
    const r=await api('/api/admin/proxies/'+encodeURIComponent(id)+'/refresh-nodes',{method:'POST'});
    alert(r.ok?('提取成功，新增 '+r.added+' 个节点'):('提取失败：'+(r.error||'未知错误')));
  }catch(e){return alert(dialogText`${e.message}`);}
  showNodes(id);loadProxies();
}
async function pruneNodes(id){
  try{
    const r=await api('/api/admin/proxies/'+encodeURIComponent(id)+'/prune-nodes',{method:'POST'});
    alert('已清理 '+r.removed+' 个节点');
  }catch(e){return alert(dialogText`${e.message}`);}
  showNodes(id);loadProxies();
}
async function probeProxy(id,btn){
  const proxy=proxyCache.find(p=>p.id===id);
  if(proxy&&proxy.mode==='extract')return batchProbeIps('proxies',[id]);
  const old=btn.textContent;btn.disabled=true;btn.textContent='探测中…';
  try{
    const r=await api('/api/admin/proxies/'+encodeURIComponent(id)+'/probe',{method:'POST'});
    if(!r.ok){proxyProbeCache[id]=r.removed?'非日韩，已剔除':r.discarded?'连接不可用，已弃用':r.error||'探测失败';alert((r.removed?'已剔除：':r.discarded?'已弃用：':'探测失败：')+(r.error||'未知错误'));}
    else proxyProbeCache[id]=r.ip+(r.country?`（${r.country}${r.isp?' / '+r.isp:''}）`:'');
  }catch(e){alert(dialogText`${e.message}`);}
  btn.disabled=false;btn.textContent=old;loadProxies();
}
async function rotateProxy(id){
  const p=proxyCache.find(x=>x.id===id);
  if(!await confirm(dialogText`给绑定在「${p?p.name:id}」上的所有号换出口 IP？`))return;
  try{
    const r=await api('/api/admin/proxies/'+encodeURIComponent(id)+'/rotate',{method:'POST'});
    alert(`已换 IP：${r.rotated.length} 个\n跳过：${r.skipped.length} 个${r.skipped.length?'（未到最小换IP间隔）':''}`);
  }catch(e){return alert(dialogText`${e.message}`);}
  loadProxies();loadAccounts();
}
async function rotateIp(name){
  try{await api('/api/admin/accounts/'+encodeURIComponent(name)+'/rotate-ip',{method:'POST'});}
  catch(e){return alert(dialogText`${e.message}`);}
  loadAccounts();
}
async function probeIp(name){
  try{
    const r=await api('/api/admin/accounts/'+encodeURIComponent(name)+'/probe-ip',{method:'POST'});
    if(!r.ok){await loadAccounts();return alert((r.removed?'已剔除：':r.discarded?'已弃用：':'探测失败：')+(r.error||'未知错误'));}
    alert(dialogText`${name}\n出口 IP：${r.ip}\n归属：${r.country||'—'} ${r.region||''}\nISP：${r.isp||'—'}`);
  }catch(e){return alert(dialogText`${e.message}`);}
  loadAccounts();
}
async function toggleProxyPassword(id,hasSaved,button){
  const input=q('#f_ppass'),epoch=dialogEpoch;
  if(!input||button.disabled)return;
  if(input.type==='text'){
    input.type='password';button.textContent='显示';button.setAttribute('aria-pressed','false');return;
  }
  if(id&&hasSaved&&input.dataset.loaded!=='1'&&input.dataset.dirty!=='1'){
    button.disabled=true;button.textContent='读取中…';
    try{
      const result=await api('/api/admin/proxies/'+encodeURIComponent(id)+'/password',{method:'POST'});
      if(epoch!==dialogEpoch||!input.isConnected)return;
      // A typed replacement wins over a late saved-password response.
      if(input.dataset.dirty!=='1'){input.value=result.password||'';input.dataset.loaded='1';}
    }catch(e){
      if(epoch===dialogEpoch)alert('读取密码失败：'+e.message);
      return;
    }finally{
      button.disabled=false;button.textContent='显示';
    }
  }
  if(epoch!==dialogEpoch||!input.isConnected)return;
  input.type='text';button.textContent='隐藏';button.setAttribute('aria-pressed','true');
}

const IP_PROBE_JOBS={accounts:null,proxies:null};
function renderIpProbe(kind){
  const job=IP_PROBE_JOBS[kind],panel=q('#ipProbe_'+kind);
  if(!job||!panel)return;
  const done=job.results.length,ok=job.results.filter(r=>r.ok).length;
  const skipped=job.results.filter(r=>r.skipped).length,removed=job.results.filter(r=>r.removed).length,discarded=job.results.filter(r=>r.discarded).length;
  panel.innerHTML='<div><b>出口 IP 探测 '+done+' / '+job.ids.length+'</b> · 日韩 '+ok+' · 已剔除 '+removed+' · 已弃用 '+discarded+' · 未确认 '+(done-ok-skipped-removed-discarded)+' · 跳过 '+skipped
    +(job.running?' <button class="btn" onclick="stopIpProbe(\''+kind+'\')"'+(job.stop?' disabled':'')+'>'+(job.stop?'正在停止…':'停止后续探测')+'</button>':job.stop?' · 已停止':' · 已完成')
    +'</div><div class="tiny">仅保留日本、韩国；地区未知不直接剔除，连接复查失败后弃用，运行中的账号跳过。'+(kind==='proxies'?'节点池逐个探测；动态网关显示临时出口。':'非日韩节点的账号暂停调度。')+'</div>'
    +'<div class="ip-probe-results">'+job.results.map(r=>'<div class="tiny" style="margin:4px 0;color:var(--'+(r.ok?'ok':r.skipped?'sub':'red')+')">'+esc(r.label)+'：'+esc(r.ok?[r.ip,r.country,r.region,r.isp].filter(Boolean).join(' · '):r.error||'探测失败')+'</div>').join('')+'</div>';
}
function stopIpProbe(kind){const job=IP_PROBE_JOBS[kind];if(job){job.stop=true;renderIpProbe(kind);}}
async function batchProbeIps(kind,explicitIds){
  if(Object.values(IP_PROBE_JOBS).some(j=>j&&j.running))return;
  const selected=kind==='accounts'?[...selAccounts]:[...SEL.proxies];
  const ids=[...new Set(explicitIds|| (selected.length?selected:kind==='accounts'?filteredAccounts.map(a=>a.name):shownProxyIds))];
  if(!ids.length)return alert('没有可探测的项目，请先勾选或调整筛选条件');
  const tasks=[];
  const job={ids:tasks,results:[],running:true,stop:false,next:0};IP_PROBE_JOBS[kind]=job;
  ['accounts','proxies'].forEach(k=>{q('#btnProbeIps_'+k).disabled=true;});renderIpProbe(kind);
  try{
    for(const id of ids){
      if(job.stop)break;
      const proxy=kind==='proxies'?proxyCache.find(p=>p.id===id):null;
      const label=kind==='accounts'?id:proxy&&proxy.name||id;
      if(proxy&&proxy.mode==='extract'){
        try{
          const r=await api('/api/admin/proxies/'+encodeURIComponent(id)+'/nodes');
          const nodes=(r.nodes||[]).filter(n=>!n.dead&&!n.region_rejected);
          for(const n of nodes)tasks.push({id,node_id:n.id,label:label+' #'+n.id});
          if(!nodes.length){tasks.push({id,label,skip:'没有待探测的可用节点'});}
        }catch(e){tasks.push({id,label,skip:e.message});}
      }else tasks.push({id,label});
    }
  }catch(e){job.running=false;['accounts','proxies'].forEach(k=>{q('#btnProbeIps_'+k).disabled=false;});throw e;}
  renderIpProbe(kind);
  async function worker(){
    while(!job.stop&&job.next<tasks.length){
      const task=tasks[job.next++],{id,label}=task;
      let result;
      try{
        result=task.skip?{ok:false,skipped:true,error:task.skip}:await api('/api/admin/'+kind+'/'+encodeURIComponent(id)+(kind==='accounts'?'/probe-ip':task.node_id?'/nodes/'+task.node_id+'/probe':'/probe'),{method:'POST'});
      }catch(e){result={ok:false,error:e.message};}
      job.results.push({...result,label,proxy_id:id});
      if(kind==='proxies'){
        const rows=job.results.filter(r=>r.proxy_id===id);
        proxyProbeCache[id]=task.node_id?'日韩 '+rows.filter(r=>r.ok).length+' · 已剔除 '+rows.filter(r=>r.removed).length+' · 已弃用 '+rows.filter(r=>r.discarded).length:result.ok?[result.ip,result.country,result.isp].filter(Boolean).join(' · '):result.removed?'非日韩，已剔除':result.discarded?'连接不可用，已弃用':result.error||'探测失败';
      }
      renderIpProbe(kind);
      if(!job.stop&&job.next<tasks.length)await new Promise(resolve=>setTimeout(resolve,500));
    }
  }
  try{await Promise.all(Array.from({length:Math.min(3,tasks.length)},()=>worker()));}
  finally{
    job.running=false;renderIpProbe(kind);
    ['accounts','proxies'].forEach(k=>{q('#btnProbeIps_'+k).disabled=false;});
    try{await loadAccounts();if(kind==='proxies')await loadProxies();}catch(e){}
  }
}

function proxyDialog(p){
  const isEdit=!!p;
  const oldPw=p&&p.has_password?'（原密码已保存，留空保持不变）':'';
  // 隧道型（旧的 dynamic）在面板上归到「动态IP + 隧道」这一档
  const mode=p?((p.mode==='dynamic')?'extract':(p.mode||'static')):'static';
  const kind=proxyKindOf(p);
  // 提取链接 / 粘贴节点 两种动态方式不需要网关地址，直接把 IP、端口那一行收起来
  const showGw=(mode!=='extract'||kind==='tunnel');
  showDlg(`<h2>${isEdit?'编辑代理':'添加代理'}</h2>${isEdit?'':proxyAddTabs('std')}
    <label>名称</label><input id="f_pname" value="${p?esc(p.name):''}" placeholder="例如：日本主代理">
    <label>协议</label><select id="f_pprotocol" style="width:100%;padding:8px 12px;border:1px solid var(--line);border-radius:8px;font-size:13px">${proxyProtocolOptions(p?p.protocol:'http')}</select>
    <label>出口类型</label><select id="f_pmode" onchange="onProxyModeChange()" style="width:100%;padding:8px 12px;border:1px solid var(--line);border-radius:8px;font-size:13px">${proxyModeOptions(mode)}</select>
    <div id="dynBox" style="display:${mode==='extract'?'block':'none'};border:1px solid var(--line);border-radius:8px;padding:10px;margin:8px 0">
      <div class="tiny" style="margin-bottom:6px">动态IP：不用填 IP、端口，出口由节点池里的节点决定（<b>一个节点只给一个号用</b>）。</div>
      ${proxyKindRadios(kind)}
      <div id="extractBox" style="display:${mode==='extract'&&kind==='url'?'block':'none'};margin-top:8px">
        <label>提取链接</label><input id="f_pexturl" value="${p?esc(p.extract_url||''):''}" placeholder="https://api.provider.com/...GetIpByGenerateLink?id=xxx">
        <label>提取限流间隔（秒）</label><input id="f_pextint" type="number" value="${p?p.extract_interval:'60'}" placeholder="60 = 距上次提取不足该秒数就不再调">
        <div class="tiny">服务端按这个链接拿一批可直接使用的节点分给各个号。注意：这类接口通常<b>按调用次数计费</b>，间隔不要设太小；池子里还有可用节点时不会去调。</div>
      </div>
      <div id="pasteBox" style="display:${mode==='extract'&&kind==='paste'?'block':'none'};margin-top:8px">
        <label>节点列表${isEdit?'（追加到节点池，可留空）':''}</label>
        <textarea id="f_pnodes" rows="6" spellcheck="false" style="width:100%;padding:8px 12px;border:1px solid var(--line);border-radius:8px;font-size:12px;font-family:monospace" placeholder="gate1.ipweb.cc:7778:100378695217-qRhvVmkl:f761d19a7fdb8498f69e43de6bd1de31&#10;gate1.ipweb.cc:7778:100378695217-rF4EnjPm:c021f9128d837d95409f3d5c6f9522c2"></textarea>
        <div class="tiny">一行一个 <code>host:port:user:pass</code>，可批量粘贴（也认 <code>user:pass@host:port</code>、<code>host:port</code>）。平台不按本地时间拦截动态节点，连接复查失败后自动弃用。</div>
      </div>
      <div id="tunnelBox" style="display:${mode==='extract'&&kind==='tunnel'?'block':'none'};margin-top:8px">
        <div class="tiny" style="margin-bottom:6px">隧道/旋转网关：服务端把 <b>{session}</b> 拼进用户名，每个号一个独立 session（= 独立出口 IP），互不干扰。</div>
        <label>用户名模板</label><input id="f_ptpl" value="${p?esc(p.session_template||''):''}" placeholder="{user}-{session}（默认）">
        <div style="display:flex;gap:10px">
          <div style="flex:1"><label>本地到期拦截</label><input id="f_pttl" type="hidden" value="0"><div class="tiny">已关闭，连接失败后弃用</div></div>
          <div style="flex:1"><label>最小换IP间隔（秒）</label><input id="f_pminint" type="number" value="${p?p.rotate_min_interval:'60'}" placeholder="防刷IP"></div>
        </div>
        <label style="display:flex;align-items:center;gap:8px;margin-top:6px"><input type="checkbox" id="f_prisk" ${!p||p.rotate_on_risk?'checked':''}> 被风控时自动换出口 IP</label>
      </div>
    </div>
    <div id="gwBox" style="display:${showGw?'block':'none'}">
      <div style="display:flex;gap:10px"><div style="flex:2"><label>地址</label><input id="f_phost" value="${p?esc(p.host):''}" placeholder="IP 或域名"></div>
        <div style="flex:1"><label>端口</label><input id="f_pport" type="number" value="${p&&p.port?p.port:'3128'}"></div></div>
      <label>用户名（可选）</label><input id="f_puser" value="${p?esc(p.username||''):''}">
      <label for="f_ppass">密码（可选）</label><div class="proxy-password"><input id="f_ppass" type="password" autocomplete="new-password" data-dirty="0" data-loaded="0" oninput="this.dataset.dirty='1'" placeholder="${oldPw}"><button type="button" class="btn" id="proxyPasswordToggle" aria-controls="f_ppass" aria-pressed="false" onclick="toggleProxyPassword('${p?p.id:''}',${!!(p&&p.has_password)},this)">显示</button></div>
    </div>
    <label>备注</label><input id="f_premark" value="${p?esc(p.remark||''):''}">
    <div class="row"><button class="btn" onclick="hide('dlg')">取消</button>
      <button class="btn btn-p" onclick="submitProxy('${p?p.id:''}')">${isEdit?'保存':'添加'}</button></div>`);
}
function openAddProxy(){proxyDialog(null);}
function proxyAddTabs(on){
  return `<div class="ptabs">
    <button class="ptab ${on==='std'?'on':''}" onclick="proxyDialog(null)">＋ 标准添加</button>
    <button class="ptab ${on==='quick'?'on':''}" onclick="quickProxyDialog()"> 快捷添加</button>
  </div>`;
}
/** 快捷添加：一行一个代理，三种建法——
    static：每行一条「静态IP」代理（一个固定出口）；
    pool  ：所有行合成一个「动态IP · 节点池」代理（一个节点分给一个号；不同协议各建一个池）；
    tunnel：每行一个「隧道/旋转网关」代理（服务端给每个号拼一个独立 session = 独立出口 IP）。 */
const QP_HINT={
  static:'每行建成一条<b>静态IP</b>代理（一个固定出口）。已存在的（同地址 + 端口 + 用户名）自动跳过。',
  pool:'所有行合成<b>一个动态IP节点池</b>：一个节点分给一个号，号多了就从池里继续分；用完/失效的节点可在「节点池」里补充、清理。'
      +'不同协议的行各建一个池。适合一次买的一批 <code>host:port:user:pass</code>。',
  tunnel:'每行是一个<b>隧道/旋转网关</b>：服务端把 <b>{session}</b> 拼进用户名，每个号一个独立 session（= 独立出口 IP）。'
      +'适合「一个网关地址 + 账号密码」、靠用户名切换出口的服务商。已存在的自动跳过。'
};
function quickProxyDialog(){
  showDlg(`<h2>添加代理</h2>${proxyAddTabs('quick')}
    <label>出口类型</label>
    <select id="f_qpmode" onchange="onQuickProxyModeChange()" style="width:100%;padding:8px 12px;border:1px solid var(--line);border-radius:8px;font-size:13px">
      <option value="static">静态IP（每行一条代理，一个固定出口）</option>
      <option value="pool">动态IP · 节点池（所有行合成一个池，一个节点分给一个号）</option>
      <option value="tunnel">动态IP · 隧道/旋转网关（每行一个网关，每号一个独立 session）</option>
    </select>
    <label>代理列表</label>
    <textarea id="f_qplist" rows="8" spellcheck="false" style="width:100%;padding:8px 12px;border:1px solid var(--line);border-radius:8px;font-size:12px;font-family:ui-monospace,Consolas,monospace;margin-top:4px"
      placeholder="每行输入一个代理，支持以下格式：&#10;socks5://user:pass@192.168.1.1:1080&#10;http://192.168.1.1:8080&#10;https://user:pass@代理主机:443&#10;192.168.1.1:8080:user:pass&#10;user:pass@192.168.1.1:8080"></textarea>
    <div class="tiny" style="margin-top:6px">没写协议的行按下面的「默认协议」处理。<span id="f_qphint">${QP_HINT.static}</span></div>
    <div style="display:flex;gap:10px">
      <div style="flex:1"><label>名称前缀</label><input id="f_qpprefix" value="代理" placeholder="生成的名称：前缀-地址:端口"></div>
      <div style="flex:1"><label>默认协议</label><select id="f_qpproto" style="width:100%;padding:8px 12px;border:1px solid var(--line);border-radius:8px;font-size:13px">${proxyProtocolOptions('http')}</select></div>
    </div>
    <div id="f_qptunnel" style="display:none">
      <label>用户名模板（隧道网关用）</label>
      <input id="f_qptpl" placeholder="{user}-{session}（默认，按服务商要求改，如 {user}-session-{session}）">
      <div style="display:flex;gap:10px">
        <div style="flex:1"><label>本地到期拦截</label><input id="f_qpttl" type="hidden" value="0"><div class="tiny">已关闭，连接失败后弃用</div></div>
        <div style="flex:1"><label>最小换IP间隔（秒）</label><input id="f_qpminint" type="number" value="60"></div>
      </div>
      <label style="display:flex;align-items:center;gap:8px;margin-top:6px;font-weight:400">
        <input type="checkbox" id="f_qprisk" checked> 被风控时自动换出口 IP</label>
    </div>
    <div id="f_qpres" class="qp-res" style="margin-top:8px"></div>
    <div class="row"><button class="btn" id="f_qpcancel" onclick="hide('dlg')">取消</button>
      <button class="btn btn-p" id="f_qpgo" onclick="submitQuickProxies()">批量添加</button></div>`);
}
function onQuickProxyModeChange(){
  const m=q('#f_qpmode').value;
  q('#f_qphint').innerHTML=QP_HINT[m];
  q('#f_qptunnel').style.display=m==='tunnel'?'block':'none';
}
/** 解析一行代理 → {protocol, host, port, username, password}；不认识返回 null。 */
function parseProxyLine(line, defProto){
  line=line.trim();
  if(!line||line.startsWith('#'))return null;
  const fix=v=>{try{return decodeURIComponent(v);}catch(e){return v;}};
  const proto=x=>{x=(x||defProto||'http').toLowerCase();return x==='socks5h'?'socks5':x;};
  // scheme://[user:pass@]host:port[/]  或  [user:pass@]host:port
  let m=line.match(/^(?:([a-z0-9]+):\/\/)?(?:([^:@\s]+):([^@\s]*)@)?([^:@\s\/]+):(\d{1,5})\/?$/i);
  if(m)return {protocol:proto(m[1]),host:m[4],port:Number(m[5]),username:fix(m[2]||''),password:fix(m[3]||'')};
  // host:port:user:pass（密码里允许再有冒号）
  m=line.match(/^(?:([a-z0-9]+):\/\/)?([^:@\s\/]+):(\d{1,5}):([^:\s]+):(\S+)$/i);
  if(m)return {protocol:proto(m[1]),host:m[2],port:Number(m[3]),username:m[4],password:m[5]};
  return null;
}
async function submitQuickProxies(){
  const mode=q('#f_qpmode').value;
  const text=q('#f_qplist').value;
  const defProto=q('#f_qpproto').value;
  const prefix=(q('#f_qpprefix').value.trim()||'代理');
  const out=q('#f_qpres');
  const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(x=>x&&!x.startsWith('#'));
  if(!lines.length)return alert('请粘贴代理，一行一个');
  try{const r=await api('/api/admin/proxies');proxyCache=r.proxies||[];}catch(e){return alert(dialogText`${e.message}`);}
  const keyOf=x=>`${String(x.host).toLowerCase()}:${x.port}:${x.username||''}`;
  // 节点池不按单条去重（同一个网关地址的不同账号就是不同节点）
  const existing=new Set(mode==='pool'?[]:proxyCache.filter(x=>x.mode!=='extract').map(keyOf));
  const names=new Set(proxyCache.map(x=>x.name));
  const uniqueName=base=>{let name=base,n=2;while(names.has(name))name=`${base}-${n++}`;names.add(name);return name;};
  const items=[],log=[];
  lines.forEach((line,i)=>{
    const p=parseProxyLine(line,defProto);
    if(!p){log.push(` 第 ${i+1} 行格式不对：${line.slice(0,60)}`);return;}
    if(!(p.port>0&&p.port<=65535)){log.push(` 第 ${i+1} 行端口不对：${line.slice(0,60)}`);return;}
    if(!['http','https','socks4','socks5'].includes(p.protocol)){log.push(` 第 ${i+1} 行协议不支持（${p.protocol}）`);return;}
    const k=keyOf(p);
    if(existing.has(k)){log.push(`– 第 ${i+1} 行已存在，跳过：${p.host}:${p.port}`);return;}
    existing.add(k);
    items.push(p);
  });
  const go=q('#f_qpgo'),cancel=q('#f_qpcancel');
  go.disabled=true;cancel.disabled=true;
  const render=()=>{out.textContent=log.join('\n');out.scrollTop=out.scrollHeight;};
  render();
  let ok=0,made=0;
  if(mode==='pool'){
    // 按协议分组，每组建一个节点池代理；节点行统一成 host:port[:user:pass]
    const groups={};
    items.forEach(p=>{(groups[p.protocol]=groups[p.protocol]||[]).push(p);});
    for(const [proto,ps] of Object.entries(groups)){
      const name=uniqueName(`${prefix}-节点池-${proto}`);
      const nodes=ps.map(p=>p.username?`${p.host}:${p.port}:${p.username}:${p.password}`:`${p.host}:${p.port}`).join('\n');
      const label=`${name}（${proto}，${ps.length} 个节点）`;
      try{
        const r=await api('/api/admin/proxies',{method:'POST',body:{name,protocol:proto,mode:'extract',
          nodes_text:nodes,remark:'快捷添加·节点池'}});
        ok+=ps.length;made++;
        log.push(` ${label} 已添加`);render();
      }catch(e){log.push(` ${label} 添加失败：${e.message}`);render();}
    }
    log.push(`—— 完成：建了 ${made} 个节点池，共 ${ok} 个节点（${lines.length} 行）。到「账号管理」给号选这个代理，每个号会分到池里不同的节点`);
  }else{
    const tunnel=mode==='tunnel';
    for(const p of items){
      const name=uniqueName(`${prefix}-${tunnel?'网关-':''}${p.host}:${p.port}`);
      const label=`${name}（${p.protocol}）`;
      const body={name,protocol:p.protocol,host:p.host,port:p.port,username:p.username,password:p.password,
        remark:tunnel?'快捷添加·隧道网关':'快捷添加',mode:tunnel?'dynamic':'static'};
      if(tunnel){
        body.session_template=q('#f_qptpl').value.trim();
        body.sticky_ttl=Number(q('#f_qpttl').value||0);
        body.rotate_min_interval=Number(q('#f_qpminint').value||0);
        body.rotate_on_risk=q('#f_qprisk').checked;
      }
      let created=null;
      try{
        const r=await api('/api/admin/proxies',{method:'POST',body});
        created=r.created||{};ok++;
      }catch(e){log.push(` ${label} 添加失败：${e.message}`);render();continue;}
      log.push(` ${label} 已添加`);render();
    }
    log.push(`—— 完成：新增 ${ok} 个${tunnel?'隧道网关':''}，共 ${lines.length} 行`);
  }
  render();
  go.disabled=false;cancel.disabled=false;ConsoleSync.closeControl(cancel);
  go.textContent='继续添加';go.onclick=()=>{q('#f_qplist').value='';go.textContent='批量添加';go.onclick=submitQuickProxies;};
  loadProxies();
}
function openEditProxy(id){const p=proxyCache.find(x=>x.id===id);if(p)proxyDialog(p);}
async function submitProxy(id){
  const mode=q('#f_pmode').value;
  const kr=q('input[name=f_pkind]:checked');
  const kind=mode==='extract'?(kr?kr.value:'paste'):'';
  const nodes=q('#f_pnodes')?q('#f_pnodes').value.trim():'';
  const body={name:q('#f_pname').value.trim(),protocol:q('#f_pprotocol').value,
    remark:q('#f_premark').value.trim()};
  if(!body.name)return alert('请填写名称');
  if(mode==='static'||kind==='tunnel'){
    body.mode=mode==='static'?'static':'dynamic';
    body.host=q('#f_phost').value.trim();
    body.port=Number(q('#f_pport').value||0);
    body.username=q('#f_puser').value;
    if(!body.host||!body.port)return alert('请填写地址和端口');
  }else{
    // 提取链接 / 粘贴节点：出口由节点池决定，不需要网关地址
    body.mode='extract';
  }
  if(body.mode==='dynamic'){
    body.session_template=q('#f_ptpl').value.trim();
    body.sticky_ttl=Number(q('#f_pttl').value||0);
    body.rotate_min_interval=Number(q('#f_pminint').value||0);
    body.rotate_on_risk=q('#f_prisk').checked;
  }
  if(body.mode==='extract'){
    body.extract_url=kind==='url'?q('#f_pexturl').value.trim():'';
    body.extract_interval=kind==='url'?Number(q('#f_pextint').value||0):0;
    if(kind==='url'&&!body.extract_url)return alert('请填提取链接');
    if(kind==='paste'){
      if(!id&&!nodes)return alert('请粘贴节点，一行一个 host:port:user:pass');
      if(nodes&&!id)body.nodes_text=nodes;
    }
  }
  const pw=q('#f_ppass')?q('#f_ppass').value:'';
  if(!id){body.password=pw;}
  else if(pw&&q('#f_ppass').dataset.dirty==='1'){body.password=pw;}
  try{
    if(id){
      await api('/api/admin/proxies/'+encodeURIComponent(id),{method:'PATCH',body});
      if(nodes){
        const r=await api('/api/admin/proxies/'+encodeURIComponent(id)+'/nodes',
          {method:'POST',body:{text:nodes}});
        alert(`已追加 ${r.added} 个节点（解析到 ${r.parsed} 行）`);
      }
    }else await api('/api/admin/proxies',{method:'POST',body});
  }catch(e){return alert(dialogText`${e.message}`);}
  hide('dlg');loadProxies();
}
async function delProxy(id){
  const p=proxyCache.find(x=>x.id===id);
  if(!await confirm(dialogText`删除代理「${p?p.name:id}」？已绑定该代理的账号会改回默认代理。`))return;
  try{await api('/api/admin/proxies/'+encodeURIComponent(id),{method:'DELETE'});}catch(e){return alert(dialogText`${e.message}`);}
  loadProxies();
}

