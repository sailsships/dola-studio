/* ---- 仪表盘 ---- */
async function legacyLoadDash(){
  const st=await api('/api/admin/stats');
  const sr=st.success_rate==null?'—':(st.success_rate*100).toFixed(0)+'%';
  q('#capacityAvailable').textContent=st.available_accounts;
  q('#capacityTotal').textContent=st.total_accounts;
  q('#capacityChat').textContent=quotaCount(st.chat_15s_available)+' 条';
  q('#capacityWork').textContent=quotaCount(st.work_15s_available)+' 条';
  q('#capacityMeter').style.width=(st.total_accounts?st.available_accounts/st.total_accounts*100:0)+'%';
  setHTML('#statCards',`
    <div class="stat s1"><div class="v">${st.today_completed}</div><div class="l">今日出片</div></div>
    <div class="stat s2"><div class="v">${st.today_failed}</div><div class="l">今日失败</div></div>
    <div class="stat s3"><div class="v">${sr}</div><div class="l">成功率</div></div>
    <div class="stat s4"><div class="v">${st.available_accounts}/${st.total_accounts}</div><div class="l">可用账号 / 全部账号</div></div>`);
  const counts={};st.per_account.forEach(a=>{const status=accountState(a).label;counts[status]=(counts[status]||0)+1;});
  setHTML('#poolGroups',Object.entries(counts).map(([g,n])=>`<span class="summary-group">${esc(g)}<b>${n}</b></span>`).join(''));
  const max=Math.max(1,...st.per_day.map(d=>d.completed+d.failed));
  setHTML('#chart',st.per_day.map(d=>`<div class="col"><span class="chart-value">${d.completed+d.failed}</span><div class="bars"><div class="bar" style="height:${Math.round(d.completed/max*75)}px;background:var(--accent)" title="${esc(d.day)} 完成 ${d.completed}"></div><div class="bar" style="height:${Math.round(d.failed/max*75)}px;background:#74747e" title="${esc(d.day)} 失败 ${d.failed}"></div></div><div class="lbl">${esc(d.day)}</div></div>`).join(''));
  setHTML('#perAccount',table(['账号','状态','剩余条数'],st.per_account.slice(0,4).map(a=>[`<span class="account-id" title="${esc(a.name)}">${esc(a.name)}</span>`,groupBadge(a),quotaCell(a)])));

}

function accLabel(x){return x.email?`<div translate="no">${esc(x.email)}</div>`:'<span class="tiny">未录入邮箱</span>';}
/** 运行态（与分组正交的瞬时信息）：出片中 / 加号任务 / 动态代理出口 IP。
    风控、冷却、待激活、异常这些「状态」已经由分组列表达，不在这里重复；
    「限流」「失败(待全池重置)」两个概念已于 2.1.0 P3 删除。 */
function statusBadge(a){
  if(pendingVerifications.has(a.name)){
    const seconds=Math.max(0,Math.floor((Date.now()-pendingVerifications.get(a.name))/1000));
    const stage=a.operation==='verifying'?(a.operation_phase||'正在检查登录状态'):'等待服务器开始验证';
    return '<span class="badge b-blue live" data-kind="verify" data-t0="'+pendingVerifications.get(a.name)/1000+'">验证中 · '+seconds+' 秒</span><div class="tiny">'+esc(stage)+'</div>';
  }
  if(a.busy){
    const labels={verifying:'验证中',probing:'探测中',generating:'准备 / 生成中',recovering:'恢复查询中',occupied:'账号占用中'};
    return '<span class="badge b-blue">'+esc(a.operation_phase||labels[a.operation]||'账号占用中')+'</span>';
  }
  if(a.login_ok===0)return '<span class="badge b-red">登录失效</span>';
  return '<span class="tiny">—</span>';
}
function addJobRecovered(account,job){
  return !!(job&&job.kind==='add'&&job.status==='failed'
    &&account.login_ok===1&&Number(job.finished_at)>0
    &&Number(account.login_checked_at)>Number(job.finished_at));
}
function accountRunBadge(account,job){
  if(pendingVerifications.has(account.name)||account.busy)return statusBadge(account);
  if(job&&job.kind==='add'&&job.status==='running')return '<span class="badge b-blue">加号中</span>';
  if(job&&job.kind==='add'&&job.status==='failed'&&!addJobRecovered(account,job))
    return '<span class="badge b-red">加号失败</span>';
  return statusBadge(account);
}
function accountJobNote(account,job){
  if(!job||job.status!=='failed')return '';
  const recovered=addJobRecovered(account,job);
  return '<details class="tiny"><summary>'+(recovered?'历史加号失败（之后验证已通过）':'查看加号失败原因')
    +'</summary>'+noTr(job.error||'未记录原因')+'</details>';
}

function table(heads,rows,rowKeys=[]){
  const numeric=heads.map((_,i)=>{const cells=rows.map(r=>r[i]).filter(c=>c!==''&&c!=null&&c!=='-'&&c!=='—');
    return cells.length>0&&cells.every(c=>typeof c==='number'||/^-?\d[\d,]*(\.\d+)?(\s*(%|MB|GB|KB|秒|s))?$/.test(String(c).trim()));});
  const cls=i=>numeric[i]?' class="num"':'';
  return `<table><thead><tr>${heads.map((h,i)=>`<th${cls(i)}>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.length?rows.map((r,index)=>`<tr${rowKeys[index]!=null?' data-row-key="'+esc(rowKeys[index])+'"':''}>${r.map((c,i)=>`<td${cls(i)}>${c}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${heads.length}" class="empty">暂无数据</td></tr>`}</tbody></table>`;
}

async function setSched(name,on){
  try{await api('/api/admin/accounts/'+name,{method:'PATCH',body:{scheduling:on}});}catch(e){alert(dialogText`${e.message}`);}refresh();
}
