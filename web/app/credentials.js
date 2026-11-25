/* ---- 登录密码：用户管理页已去掉（只有一个管理员在用），改密码放在「设置」里 ---- */
async function openPassword(){
  let me='';
  try{me=(await api('/api/admin/users')).current_username||'';}
  catch(e){if(e.message!=='unauthorized')alert(dialogText`${e.message}`);return;}
  showDlg(`<h2>修改登录密码</h2>
    <p class="hint">当前账号：<span translate="no">${esc(me)}</span>。保存后本浏览器保持登录，其它地方的登录会失效。</p>
    <label for="f_pw1">新密码</label><input id="f_pw1" type="password" autocomplete="new-password" placeholder="至少 6 位">
    <label for="f_pw2">再输一遍</label><input id="f_pw2" type="password" autocomplete="new-password">
    <div class="row"><button class="btn" onclick="hide('dlg')">取消</button>
      <button class="btn btn-p" onclick="submitPassword('${esc(me)}')">保存</button></div>`);
}
async function submitPassword(me){
  const a=q('#f_pw1').value,b=q('#f_pw2').value;
  if(a.length<6)return alert('密码至少 6 位');
  if(a!==b)return alert('两次输入的密码不一样');
  try{await api('/api/admin/users/'+encodeURIComponent(me),{method:'PATCH',body:{password:a}});}
  catch(e){if(e.message!=='unauthorized')alert(dialogText`${e.message}`);return;}
  hide('dlg');alert('密码已修改');
}

