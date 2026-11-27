import os from 'node:os';import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),audit=process.env.UI_TEST_OUTPUT||fs.mkdtempSync(path.join(os.tmpdir(),'studio-ui-')),web=path.join(root,'web');fs.mkdirSync(audit,{recursive:true});
const account={name:'代理(默认)',email:'qa@example.test',note:'工作模式',login_ok:1,group:'满额',remaining:1,chat_15s_remaining:1,work_15s_remaining:1,scheduling:true,source:'cookie',site:'dola',busy:false};
const task={id:'qa-local-only',account:account.name,prompt:'工作模式',status:'completed',duration:15,model:'seedance-2.0-fast',execution_mode:'chat',created_at:1700000000};
const data={
 '/api/admin/accounts':{accounts:[account],add_jobs:{},reset_tz:'UTC',reset_hour:0,next_reset_at:2000000000},
 '/api/admin/jobs':{jobs:{}},'/api/admin/proxies':{proxies:[]},'/api/admin/keys':{keys:[],env_keys:0,supported_durations:[5,10,15]},
 '/api/admin/videos':{videos:[],total:0},'/api/admin/tasks':{tasks:[task],total:1,now:Date.now()/1000},
 '/api/admin/stats':{available_accounts:1,total_accounts:1,chat_15s_available:1,work_15s_available:1,today_completed:1,today_failed:0,success_rate:1,per_account:[account],per_day:[{day:'11-27',completed:1,failed:0}]},
 '/api/admin/update':{version:'1.0.1',current:'1.0.1',latest:'1.0.1',can_update:false},
 '/api/admin/settings/upscale':{enabled:false},'/api/admin/settings/concurrency':{max_concurrency:2,active:0,waiting:0},
 '/api/admin/settings/window-concurrency':{concurrency:2,active:0,waiting:0},'/health':{ok:true,version:'1.0.1'}
};
let writes=[],unknown=[];
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost'),name=url.pathname;
 if(!['GET','HEAD'].includes(req.method)){writes.push(name);res.writeHead(409);res.end('{}');return;}
 if(name.startsWith('/api/')||name==='/health'){if(!data[name])unknown.push(name);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data[name]||{}));return;}
 const file=path.resolve(web,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(web+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
 const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'}[path.extname(file)]||'text/plain';res.setHeader('Content-Type',mime+'; charset=utf-8');res.end(fs.readFileSync(file));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
if(process.env.INSPECT_SERVER==='1'){console.log(origin);await new Promise(()=>{});}
const browser=await chromium.launch();const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN'});const page=await context.newPage();const errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(origin,{waitUntil:'networkidle'});await page.locator('#studioAccount option[value="代理(默认)"]').waitFor({state:'attached'});await page.locator('#recentLanes .lane-prompt').waitFor();
 await page.locator('#autoCk').uncheck();await page.locator('#studioPrompt').fill('聊天模式 — Do NOT translate 私人提示词');await page.locator('#studioAccount').selectOption(account.name);await page.locator('[data-studio-mode="work"]').click();
 await page.evaluate(()=>window.preservedPrompt=document.getElementById('studioPrompt'));
 const language=page.locator('.workspace-preferences select');
 for(const lang of ['en','ja','ko','zh','ja','en','zh']){
  await language.selectOption(lang);await page.waitForFunction(lang=>I18N.lang===lang&&!document.documentElement.hasAttribute('data-language-loading'),lang);
  assert.equal(await page.locator('#studioPrompt').inputValue(),'聊天模式 — Do NOT translate 私人提示词');assert.equal(await page.locator('#studioAccount').inputValue(),account.name);
  assert(await page.evaluate(()=>window.preservedPrompt===document.getElementById('studioPrompt')));assert.equal(await page.locator('[data-studio-mode="work"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('.lane-prompt').first().innerText(),task.prompt);assert((await page.locator('#studioAccount option:checked').innerText()).startsWith(account.name));
  assert.equal(await page.locator('#tab-dash h1').innerText(),lang==='zh'?'创作工作台':JSON.parse(fs.readFileSync(path.join(web,'i18n',lang+'.json'),'utf8'))['创作工作台']);
 }
 checks.push('four-language-round-trip-without-reload','form-values-and-DOM-identity-preserved','mode-and-selection-preserved','opaque-prompts-and-names');
 await page.evaluate(async()=>{await Promise.all([I18N.setLang('ja'),I18N.setLang('ko'),I18N.setLang('en')]);});assert.equal(await page.evaluate(()=>I18N.lang),'en');checks.push('rapid-language-request-order');
 for(const lang of ['zh','en','ja','ko']){
  await language.selectOption(lang);await page.waitForFunction(l=>I18N.lang===l,lang);
  for(const theme of ['light','dark']){
   if(await page.evaluate(()=>StudioPreferences.theme)!==theme)await page.locator('[data-theme-toggle]').click();
   for(const tab of ['dash','accounts','tasks','videos','proxies','keys','api']){await page.locator(`[data-tab="${tab}"]`).click();await page.locator('#tab-'+tab).waitFor({state:'visible'});}
   await page.locator('[data-tab="dash"]').click();await page.evaluate(()=>openTestGen('代理(默认)'));await page.locator('#tg_prompt').waitFor();
   assert.equal(await page.locator('#tg_prompt').inputValue(),'古风玄幻夜景，山崖之巅，月色如银盘，漫天繁星。少年斜躺在青草地上，嘴里叼着一根青草，轻轻咀嚼，神色淡然。他抬起白皙手掌挡在眼前，目光透过指缝望向空中巨大银月，氛围静谧悠远，柔和清冷月光，氛围感拉满，构图稳定，人物面部一致，运镜缓慢推拉，写实漫剧质感，光影统一，细节细腻，无闪烁');
   await page.locator('#tg_prompt').fill('风控账号 工作模式');await page.evaluate(()=>I18N.setLang(I18N.lang==='zh'?'en':'zh'));assert.equal(await page.locator('#tg_prompt').inputValue(),'风控账号 工作模式');await page.evaluate(l=>I18N.setLang(l),lang);
   assert.equal(await page.locator('#dlgBox .dialog-close').count(),1);await page.locator('#dlgBox .dialog-close').click();
   await page.screenshot({path:path.join(audit,`local-${lang}-${theme}.png`),fullPage:true});
  }
 }
 checks.push('eight-language-theme-combinations-all-tabs-and-generation-dialogs');
 // The actual confirmation entry point must keep destructive styling/focus and opaque values in every language.
 for(const lang of ['zh','en','ja','ko']){
  await page.evaluate(l=>I18N.setLang(l),lang);await page.evaluate(()=>{window.cancelResult=delAccount('风控账号');});await page.locator('.nd-risky').waitFor();
  assert((await page.locator('.nd-msg').innerText()).includes('风控账号'));assert(await page.locator('.nd .dialog-close').evaluate(el=>el===document.activeElement));
  await page.keyboard.press('Escape');await page.locator('.nd').waitFor({state:'detached'});
 }
 checks.push('real-delete-entrypoint-cancel-only-no-mutation','destructive-focus-and-escape-in-four-languages');
 await page.evaluate(()=>{StudioPreferences.setTheme('dark');return I18N.setLang('ko');});await page.reload({waitUntil:'networkidle'});assert.equal(await page.evaluate(()=>I18N.lang),'ko');assert.equal(await page.evaluate(()=>StudioPreferences.theme),'dark');checks.push('preferences-persist-after-reload');
 const raceContext=await browser.newContext({locale:'zh-CN'}),race=await raceContext.newPage();
 await race.route('**/i18n/ja.json*',async route=>{await new Promise(r=>setTimeout(r,250));await route.continue();});
 await race.goto(origin,{waitUntil:'networkidle'});
 await race.evaluate(()=>Promise.all([I18N.setLang('ja'),I18N.setLang('ko')]));
 assert.equal(await race.evaluate(()=>I18N.lang),'ko');await raceContext.close();checks.push('out-of-order-dictionary-fetch-keeps-last-choice');
 for(const [label,width] of [['desktop',1440],['tablet',768],['mobile',390],['small-mobile',360]]){
  await page.setViewportSize({width,height:1000});await page.screenshot({path:path.join(audit,`layout-${label}.png`),fullPage:true});
  const fit=await page.locator('.workspace-preferences').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&document.body.scrollWidth<=innerWidth;});assert(fit,label+' header/page overflow');
 }
 checks.push('four-viewport-header-layout');assert.equal(writes.length,0,JSON.stringify(writes));assert.equal(errors.length,0,JSON.stringify(errors));
 // A clean context tests a failed dictionary load (without using cached dictionaries from above).
 const failed=await context.newPage();await failed.route('**/i18n/ja.json*',r=>r.fulfill({status:503,body:'{}'}));await failed.goto(origin,{waitUntil:'networkidle'});
 const previous=await failed.evaluate(()=>I18N.lang);assert.equal(await failed.evaluate(()=>I18N.setLang('ja')),false);assert.equal(await failed.evaluate(()=>I18N.lang),previous);assert.equal(await failed.locator('.workspace-preferences select').inputValue(),previous);await failed.close();checks.push('dictionary-failure-keeps-current-language-and-selector');
 fs.writeFileSync(path.join(audit,'local-results.json'),JSON.stringify({passed:true,checks,errors,writes,unknown},null,2));console.log(JSON.stringify({passed:true,checks,unknown}));
}finally{await browser.close();server.close();}
