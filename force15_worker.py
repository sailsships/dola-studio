"""Native Fast 15s flow: fresh chat, optional audio context, one bounded followup."""
import asyncio,json,re,shutil,tempfile,time
from pathlib import Path
from urllib.parse import urlsplit

import config
import completion_receipt
from page_state_check import check_page_login
import followup_confirmation
from desktop_promo import dismiss_desktop_promo
from generation_trace import checkpoint,CURRENT
from send_confirmation import click_send_and_confirm
import proxy_store
from proxy_navigation import await_proxy_thread,wait_for_account_proxy
from force15_preparation import prepare_browser,short_reason,BlankPageError
from composer_input import ComposerInputError,fill_verified_composer,verify_composer
from browser import cookie_value
from browser_feedback import emit
from generation_errors import PreSubmissionParametersError,PreSubmissionUploadError,UpstreamReplyError
from video_worker import POLL_JS
from video_worker_agent import _copied_session,_launch_cloak,_work_slot,_WorkSession
from video_worker_ui import dismiss_popups,is_logged_out,enter_video_mode,_select_video_model,attach_reference_images
from video_worker_ui import find_captcha_frame,solve_slider
from browser_video_params import select_video_parameters,PARAMS_TRIGGER
from patchright.async_api import async_playwright

MODE='force15'
CREATION_DECLARATION=(
    '声明：图片由人工智能豆包生成，人物形象为基于参考图片进行视觉特征参考后生成的虚构数字人物，并非对现实人物真实行为、真实经历或现实场景的还原。\n\n'
    '参考图片仅用于辅助生成角色的整体视觉特征，包括面部轮廓、发型、服装风格、构图及视觉气质等。生成结果中的人物、动作、表情、场景、时间、事件及行为均属于AI创作内容，不应被理解为参考图片中的真实人物实际参与、实施或经历了视频中的任何行为。'
)
def request_error(model,duration,video_count=1):
    if str(model).lower().replace('_','-') not in ('seedance-2.0-fast','seedance-2.0','seedance-v2.0'):
        return '强开模式仅支持 Dola Seedance 2.0 Fast'
    if int(duration or 0)!=15 or int(video_count or 0)!=1:
        return '强开模式固定生成一条 15 秒视频'
    return ''

def followup_text(prompt,ratio,has_audio=False,*,has_images=False):
    # Describe only material actually uploaded; never invent image provenance.
    audio='沿用本会话已经解析的参考音频，' if has_audio else ''
    images='及本会话已上传参考图片' if has_images else ''
    return (f'确认，请按本会话原提示词{images}直接生成一条15秒、{ratio or "16:9"}的Seedance 2.0 Fast视频，'
            f'{audio}仅使用当前免费额度，不购买、不升级。请实际生成视频，不要只回复文案。'
            '若当前账号不支持，请直接说明并停止。\n\n原提示词：'+prompt)

def next_action(poll,followed):
    if poll.get('videos'):return 'deliver'
    latest=poll.get('latestAssistant') or {}
    if any(t.get('status')==5 for t in latest.get('tools',[])):return 'failed'
    if poll.get('anyVideoGen') or poll.get('anyTool'):return 'wait'
    if not latest.get('finished'):return 'wait'
    if followed:return 'stopped'
    if latest.get('clarifying') or re.search(r'Dola\s*Plus|サブスク登録者|升级.{0,10}会员',latest.get('text',''),re.I):return 'followup'
    return 'stopped'

def attachment_records(value):
    result=[]
    def walk(node):
        if isinstance(node,dict):
            if isinstance(node.get('attachments'),list):
                for item in node['attachments']:
                    info=item.get('file') or item.get('image') or {}
                    info=info.get('file_info') or info
                    result.append(dict(name=info.get('name') or info.get('file_name') or '',
                        uri=info.get('uri') or info.get('key') or '',upload=item.get('upload_status'),
                        parse=item.get('parse_state'),review=item.get('review_state')))
            for child in node.values():walk(child)
        elif isinstance(node,list):
            for child in node:walk(child)
    walk(value);return result

def audio_ready(records,names):
    return all(any(r['name']==name and all(str(r.get(k))=='1' for k in ('upload','parse','review'))
                   for r in records) for name in names)

def _composer_failure(reason, *, followup=False):
    if followup:
        return UpstreamReplyError('续提未发送',
            reason+'；首条请求已发送，保留原会话，未换号或重复提交',
            generation_started=True,allow_account_retry=False)
    return PreSubmissionParametersError(reason+'；首条请求未发送')


async def _fill_send(page,text,*,followup=False,progress=None):
    button=page.locator('[data-testid="chat_input_send_button"]:visible,#flow-end-msg-send:visible')
    # Recovery only happens before a click. Never retry an ambiguous send.
    for repair in range(2):
        try:
            editor=await fill_verified_composer(page,text)
        except ComposerInputError as exc:
            raise _composer_failure(str(exc),followup=followup) from None
        deadline=time.monotonic()+90
        while time.monotonic()<deadline:
            if await button.count()==1 and await button.is_enabled() and await button.get_attribute('aria-disabled')!='true':break
            await asyncio.sleep(.5)
        else:
            raise _composer_failure('发送按钮尚未就绪',followup=followup)
        try:
            await verify_composer(editor,text)
        except ComposerInputError as exc:
            if not repair:continue
            raise _composer_failure(str(exc),followup=followup) from None
        # Re-read readiness because the controlled editor may have rerendered.
        if await button.count()!=1 or not await button.is_enabled() or await button.get_attribute('aria-disabled')=='true':
            if not repair:continue
            raise _composer_failure('发送按钮重新加载后仍未就绪',followup=followup)
        trace=CURRENT.get()
        return await click_send_and_confirm(page,button,editor,text,progress=progress,
                                            record=trace.record if trace else None)


async def _wait_composer(page,seconds=180):
    from page_load_recovery import wait_for_composer
    return await wait_for_composer(page,seconds=seconds)


CHAIN_JS=r'''async cid=>{
 const r=await fetch('/im/chain/single?aid=495671&device_platform=web&version_code=20800',{
 method:'POST',credentials:'include',headers:{'Content-Type':'application/json','agw-js-conv':'str'},
 body:JSON.stringify({cmd:3100,uplink_body:{pull_singe_chain_uplink_body:{conversation_id:cid,
 anchor_index:Number.MAX_SAFE_INTEGER,conversation_type:3,direction:1,limit:30,ext:{},filter:{index_list:[]}}},
 sequence_id:crypto.randomUUID(),channel:2,version:'1'})});
 if(!r.ok)throw new Error('音频解析查询 HTTP '+r.status);return await r.json();}'''

class NativeSubmissionRejected(UpstreamReplyError):
    def __init__(self,reply,receipt):
        self.receipt=receipt
        super().__init__('提交被拒绝',reply,generation_started=False,allow_account_retry=False)


async def generate_force15_video(account,prompt,ratio=None,*,on_conversation_id=None,on_poll=None,
                                 reference_image_paths=None,reference_audio_paths=None,**kwargs):
    for attempt in range(2):
        try:
            return await _generate_force15_once(account,prompt,ratio,
                on_conversation_id=on_conversation_id,on_poll=on_poll,
                reference_image_paths=reference_image_paths,reference_audio_paths=reference_audio_paths,**kwargs)
        except NativeSubmissionRejected as exc:
            if attempt or not completion_receipt.can_rotate(exc.receipt):raise
            # The prior browser has closed in _generate_force15_once.finally.
            # A known rejected request has no server conversation to duplicate.
            from account_transport import http_proxy
            from proxy_navigation import _discard
            route=http_proxy(account)
            if not route:raise
            emit(on_poll,note=exc.reply,progress='强开15s：上游明确拒绝且未建立会话，弃用节点并换 IP 重试一次')
            trace=CURRENT.get()
            if trace:trace.record('submission_proxy_retry',attempt=2,code=710022002,prior_conversation_id=None)
            await await_proxy_thread(_discard,account,route)


async def _generate_force15_once(account,prompt,ratio=None,*,on_conversation_id=None,on_poll=None,
                                  reference_image_paths=None,reference_audio_paths=None,**kwargs):
    images=reference_image_paths or [];audios=reference_audio_paths or []
    context=None
    submitted=False;conversation_id='';phase='audio' if audios else 'initial';sent=set();guard_error=''
    initial_message_id=None;followup_state=None;captcha_retry_allowed=False;captcha_attempts=0
    request_records=[];response_tasks=set();audio_records=[]
    current_stage='等待浏览器名额'
    send_attempted=False
    def progress(text):
        nonlocal current_stage
        current_stage=text
        emit(on_poll,progress='强开15s：'+text)
    async with _work_slot(on_poll):
      profile=tempfile.mkdtemp(prefix='dola-force15-')
      try:
        context,page,prepared_profile,preparation_blocker=await prepare_browser(
            account,progress=progress,copy_session=_copied_session,launch_browser=_launch_cloak,
            playwright_factory=async_playwright,wait_composer=_wait_composer,
            bridge_path=Path(__file__).with_name('force15_bridge.js'))
        shutil.rmtree(profile,ignore_errors=True)
        profile=prepared_profile
        await completion_receipt.install(page)
        await checkpoint('browser_ready',page,context)
        async def guard(route):
            nonlocal submitted,guard_error,initial_message_id,captcha_retry_allowed
            req=route.request;path=urlsplit(req.url).path
            if 'logout' in path.lower():await route.abort();return
            if not path.endswith('/chat/completion') or req.method!='POST':await route.continue_();return
            try:
                body=json.loads(req.post_data or '{}');ability=body.get('chat_ability') or {}
                params=ability.get('ability_param') or {};params=json.loads(params) if isinstance(params,str) else params
                cid=str((body.get('client_meta') or {}).get('conversation_id') or '')
                mid=((body.get('messages') or [{}])[0]).get('local_message_id')
                captcha_retry=phase=='initial' and captcha_retry_allowed and mid and mid==initial_message_id
                if phase in sent and not captcha_retry:raise ValueError('同一阶段重复提交已阻止')
                if phase=='initial':
                    if cid!=(conversation_id or ''):raise ValueError('视频请求会话不一致')
                    if ability.get('ability_type')!=17 or params.get('model')!='seedance_v2.0' or int(params.get('duration') or 0)!=15:
                        raise ValueError('上游模型或时长不符，已阻止提交')
                    if ratio and params.get('ratio')!=ratio:raise ValueError('上游画幅不符，已阻止提交')
                    submitted=True
                    initial_message_id=initial_message_id or mid
                    captcha_retry_allowed=False
                elif ability.get('ability_type')==17:raise ValueError('参考音频或续提必须为普通会话消息')
                elif phase=='followup' and cid!=conversation_id:raise ValueError('续提未使用原会话')
                elif phase=='audio' and cid:raise ValueError('参考音频未使用全新会话')
                if phase=='followup' and followup_state is not None:
                    if not mid:raise ValueError('续提缺少消息标识，已阻止提交')
                    followup_state['local_message_id']=str(mid)
                    followup_confirmation.save(account,conversation_id,followup_state)
                sent.add(phase);request_records.append(dict(phase=phase,ability_type=ability.get('ability_type'),
                    duration=params.get('duration'),model=params.get('model')))
                await route.continue_()
            except Exception as exc:guard_error=str(exc);await route.abort()
        route_pattern=re.compile(r'chat/completion|logout',re.I)
        await context.route(route_pattern,guard)
        await context.unroute(route_pattern,preparation_blocker)
        async def capture(response):
            if not urlsplit(response.url).path.endswith('/chat/completion'):return
            try:
                raw=await response.text()
                for line in raw.splitlines():
                    if line.startswith('data: '):
                        try:audio_records.extend(attachment_records(json.loads(line[6:])))
                        except ValueError:pass
            except Exception:pass
        def on_response(response):
            if urlsplit(response.url).path.endswith('/chat/completion'):
                t=asyncio.create_task(capture(response));response_tasks.add(t);t.add_done_callback(response_tasks.discard)
        page.on('response',on_response)
        logged_out=await check_page_login(page,dismiss_popups=dismiss_popups,
            is_logged_out=is_logged_out,progress=progress)
        if logged_out:raise PreSubmissionParametersError('账号未登录，未提交生成')
        if urlsplit(page.url).path.rstrip('/')!='/chat':raise PreSubmissionParametersError('未进入空白新会话，未提交生成')
        async def conversation():
            nonlocal captcha_retry_allowed,captcha_attempts
            for index in range(150):
                if await dismiss_desktop_promo(page):
                    trace=CURRENT.get()
                    if trace:trace.record('desktop_promotion_closed',phase='await_conversation')
                if guard_error:raise PreSubmissionParametersError(guard_error)
                receipt=await completion_receipt.read(page,initial_message_id)
                cid,rejection=completion_receipt.result(receipt)
                trace=CURRENT.get()
                if cid:
                    if trace:trace.record('conversation_ack_confirmed',conversation_id=cid,receipt=receipt)
                    progress('已从本条请求的上游回执确认会话，开始只读查询')
                    return cid
                tail=urlsplit(page.url).path.rstrip('/').split('/')[-1]
                if tail.isdigit():
                    if trace:trace.record('conversation_url_confirmed',conversation_id=tail)
                    return tail
                if rejection:
                    if trace:trace.record('submission_rejected',receipt=receipt)
                    emit(on_poll,note=rejection)
                    await checkpoint('submission_rejected',page)
                    raise NativeSubmissionRejected(rejection,receipt)
                if index%10==0:
                    if trace:trace.record('conversation_confirmation_wait',receipt=receipt,waited_seconds=index*2)
                    progress(f'请求已发出，等待上游会话回执（已等 {index*2} 秒，不重复提交）')
                frame=find_captcha_frame(page)
                if frame and captcha_attempts<2:
                    captcha_attempts+=1
                    # Only the existing message may be resent by the page after verification.
                    captcha_retry_allowed=True
                    if not await asyncio.wait_for(solve_slider(page,frame,captcha_attempts,account),45):
                        captcha_retry_allowed=False
                await asyncio.sleep(2)
            raise TimeoutError('已等待上游会话回执 300 秒，仍未取得数字会话；提交状态待核对，不重复发送')
        if audios:
            from audio_context import prepare_audio_context
            progress('上传参考音频，等待解析与审核')
            state_file=Path(profile)/'audio-session.private.json'
            original=Path('accounts')/account/'cookie_state.json'
            state=json.loads(original.read_text()) if original.exists() else {}
            current=await context.cookies('https://www.dola.com')
            state.update(cookies_list=current,cookies={c['name']:c for c in current})
            state.pop('cookie_header',None)
            state_file.write_text(json.dumps(state));state_file.chmod(0o600)
            prepared=await await_proxy_thread(prepare_audio_context,account,state_file,audios)
            state_file.unlink(missing_ok=True)
            conversation_id=prepared['conversation_id']
            await page.goto('https://www.dola.com/chat/'+conversation_id,wait_until='commit',timeout=60000)
            await _wait_composer(page)
            progress('音频解析通过，准备在同一会话引用')
        phase='initial'
        progress('等待视频创作入口并进入视频模式')
        # Shared entry logic handles the home skill bar and an existing
        # audio conversation's mode menu without clicking a selected exit chip.
        await enter_video_mode(page,account,progress=progress)
        await checkpoint('video_mode_ready',page)
        progress('选择 Fast 模型并确认视频参数')
        await _select_video_model(page,account,'seedance_v2.0')
        await select_video_parameters(page,15,ratio or '16:9')
        await checkpoint('parameters_confirmed',page)
        if images:
            progress(f'上传 {len(images)} 张参考图')
            await attach_reference_images(page,images)
            if not audios:
                tail=urlsplit(page.url).path.rstrip('/').split('/')[-1]
                if tail.isdigit():conversation_id=tail
        if audios:prompt='参考本会话刚才已解析的音频1'+('等音频' if len(audios)>1 else '')+'，将其声音与节奏用于本次视频。\n'+prompt
        progress('已确认 Fast、15秒及参考素材，准备点击发送')
        send_attempted=True
        await checkpoint('before_initial_send',page)
        await _fill_send(page,prompt,progress=progress)
        await checkpoint('after_initial_click',page)
        conversation_id=await conversation()
        deadline=time.time()+max(300,config.WORK_15S_TIMEOUT)
        if on_conversation_id:on_conversation_id(account,conversation_id,deadline)
        ck=await context.cookies('https://www.dola.com')
        args=dict(conversationId=conversation_id,msToken=cookie_value(ck,'msToken'),fp=cookie_value(ck,'s_v_web_id'))
        followed=False;settled=None;initial_observed=False;last_reply=None;last_followup_receipt=None
        observed_deadline=time.monotonic()+180
        poll_failure_since=None;poll_failures=0
        while time.time()<deadline:
            if guard_error:raise UpstreamReplyError('提交失败',guard_error,generation_started=submitted,allow_account_retry=False)
            try:
                poll=await asyncio.wait_for(page.evaluate(POLL_JS,args),timeout=45)
                if poll.get('ok') is False:raise RuntimeError(f"只读查询 HTTP {poll.get('status','unknown')}")
            except asyncio.CancelledError:raise
            except Exception as exc:
                poll_failure_since=poll_failure_since or time.monotonic();poll_failures+=1
                if time.monotonic()-poll_failure_since>=180:raise TimeoutError('原会话只读查询连续失败 180 秒；保留会话，不重新生成') from exc
                progress(f'原会话查询暂时失败，正在只读重试（第 {poll_failures} 次，不重复生成）')
                trace=CURRENT.get()
                if trace:trace.record('read_only_poll_retry',attempt=poll_failures,error=short_reason(exc))
                await asyncio.sleep(5);continue
            poll_failure_since=None;poll_failures=0
            initial_observed=initial_observed or any(prompt[:120] in t for t in poll.get('texts',[]))
            if not initial_observed:
                if time.monotonic()>observed_deadline:raise TimeoutError('强开15s请求未在原会话确认，提交状态待核对')
                progress('等待原会话保存首条消息，不重复提交')
                await asyncio.sleep(3);continue
            if followup_state and not poll.get('videos'):
                receipt=await completion_receipt.read(page,followup_state.get('local_message_id'))
                if receipt!=last_followup_receipt:
                    last_followup_receipt=receipt
                    trace=CURRENT.get()
                    if trace:trace.record('followup_receipt',receipt=receipt)
                status,detail=followup_confirmation.assess(poll,followup_state,receipt)
                if status!=followup_state['status']:
                    followup_state.update(status=status,detail=detail)
                    if status=='confirmed':followup_state.update(user_message_id=detail,confirmed_at=time.time())
                    followup_confirmation.save(account,conversation_id,followup_state)
                    trace=CURRENT.get()
                    if trace:trace.record('followup_confirmation',status=status,detail=detail)
                if status=='rejected':
                    raise UpstreamReplyError('续提被拒绝',detail,generation_started=True,allow_account_retry=False)
                elapsed=time.time()-followup_state['sent_at']
                if status!='confirmed':
                    progress(f'续提已发出，等待上游保存消息（已等 {int(elapsed)} / 180 秒，不重复发送）')
                    if elapsed>=followup_confirmation.CONFIRM_SECONDS:
                        raise TimeoutError(followup_confirmation.unresolved_detail())
                    await asyncio.sleep(3);continue
                if not followup_confirmation.has_new_reply(poll,followup_state):
                    waited=time.time()-followup_state.get('confirmed_at',followup_state['sent_at'])
                    progress(f'续提消息已保存，等待新回复（已等 {int(waited)} / 180 秒）')
                    if waited>=followup_confirmation.CONFIRM_SECONDS:
                        raise TimeoutError('续提消息已保存，但上游尚无新回复；保留原会话，只读取回')
                    await asyncio.sleep(3);continue
            latest=poll.get('latestAssistant') or {}
            reply=(latest.get('id'),latest.get('text'))
            if latest.get('finished') and reply[1] and reply!=last_reply:
                last_reply=reply
                emit(on_poll,note=latest['text'])
                trace=CURRENT.get()
                if trace:trace.record('upstream_reply',text=latest['text'],message_id=latest.get('id'),
                    clarifying=bool(latest.get('clarifying')),video_present=bool(poll.get('videos')),
                    video_tool_running=bool(poll.get('anyVideoGen')))
                await checkpoint('upstream_reply',page)
            action=next_action(poll,followed)
            if action=='deliver':
                session=_WorkSession(account,page,on_poll,ratio=ratio,duration=15,model='seedance-2.0-fast')
                vm=next((m for m in poll.get('videoModels',[]) if m),'')
                if not vm:raise UpstreamReplyError('取回失败','已出片但缺少视频元数据',generation_started=True,allow_account_retry=False)
                result=await session.deliver(vm,conversation_id)
                result.update(execution_mode=MODE,reference_image_count=len(images),reference_audio_count=len(audios),
                              force15_requests=request_records,force15_followup_count=int(followed))
                if result.get('duration_error') or (result.get('video_duration') and abs(result['video_duration']-15)>.6):
                    result['validation_error']=result.get('duration_error') or '上游成片时长不等于15秒'
                return result
            if action in ('failed','stopped'):
                latest=poll.get('latestAssistant') or {}
                raise UpstreamReplyError('上游未生成',latest.get('text') or '上游明确结束，未返回视频',
                                         generation_started=submitted,allow_account_retry=False)
            if action=='followup':
                settled=settled or time.monotonic()
                if time.monotonic()-settled>=15:
                    if await page.locator(PARAMS_TRIGGER+':visible').count():
                        raise UpstreamReplyError('续提停止','输入框仍在视频模式，未重复提交生成',generation_started=True,allow_account_retry=False)
                    progress('首轮回复结束且尚未受理，原会话续提一次')
                    phase='followup';followed=True
                    continuation=followup_text(prompt,ratio,bool(audios),has_images=bool(images))
                    followup_state=followup_confirmation.new_state(poll.get('latestAssistant') or {},continuation)
                    followup_confirmation.save(account,conversation_id,followup_state)
                    await checkpoint('before_original_conversation_followup',page)
                    await _fill_send(page,continuation,followup=True,progress=progress)
                    await checkpoint('after_original_conversation_followup',page)
            progress('上游视频工具运行中，等待原会话结果' if poll.get('anyVideoGen') else '查询原会话回复和视频状态（不重复提交）')
            await asyncio.sleep(8)
        raise TimeoutError('强开15s原会话等待超时；保留会话，只读取回')
      except asyncio.CancelledError:raise
      except (PreSubmissionParametersError,PreSubmissionUploadError,UpstreamReplyError):raise
      except Exception as exc:
        reason=short_reason(exc)
        if submitted or send_attempted:
            raise TimeoutError(f'强开15s在“{current_stage}”中断：{reason}；已点击或提交状态待核对，保留原会话，不换号重提') from exc
        raise PreSubmissionParametersError(f'强开15s在“{current_stage}”准备失败：{reason}；首条请求未发送') from exc
      finally:
        if context and 'page' in locals():await checkpoint('final_browser_state',page)
        for t in response_tasks:t.cancel()
        if response_tasks:await asyncio.gather(*response_tasks,return_exceptions=True)
        if context:
            try:await asyncio.wait_for(context.close(),15)
            except Exception:pass
        shutil.rmtree(profile,ignore_errors=True)


async def fetch_force15_conversation_video(account,conversation_id,*,on_poll=None,ratio=None):
    """Read-only recovery. The completion route is always blocked, including followups."""
    if not str(conversation_id).isdigit():raise ValueError('invalid conversation id')
    context=None
    async with _work_slot(on_poll):
      profile=tempfile.mkdtemp(prefix='dola-force15-read-')
      try:
        async with async_playwright() as p:cookies=await _copied_session(p,account)
        context=await _launch_cloak(account,profile);await context.add_cookies(cookies)
        await context.route(re.compile(r'chat/completion|logout',re.I),lambda route:route.abort())
        page=context.pages[0] if context.pages else await context.new_page()
        await page.goto('https://www.dola.com/chat/'+str(conversation_id),wait_until='domcontentloaded',timeout=60000)
        ck=await context.cookies('https://www.dola.com')
        args=dict(conversationId=str(conversation_id),msToken=cookie_value(ck,'msToken'),fp=cookie_value(ck,'s_v_web_id'))
        poll=await asyncio.wait_for(page.evaluate(POLL_JS,args),timeout=45)
        if poll.get('videos'):
            vm=next((v for v in poll.get('videoModels',[]) if v),'')
            if not vm:return {'final':False}
            session=_WorkSession(account,page,on_poll,ratio=ratio,duration=15,model='seedance-2.0-fast')
            result=await session.deliver(vm,str(conversation_id));result['execution_mode']=MODE
            if result.get('duration_error'):result['validation_error']=result['duration_error']
            return result
        state=followup_confirmation.load(account,conversation_id)
        if state:
            status,detail=followup_confirmation.assess(poll,state)
            if status=='rejected':return {'final':True,'detail':detail}
            if status!='confirmed':
                if time.time()-state['sent_at']>=followup_confirmation.CONFIRM_SECONDS:
                    return {'final':True,'detail':followup_confirmation.unresolved_detail()}
                return {'final':False}
            if not followup_confirmation.has_new_reply(poll,state):return {'final':False}
        if next_action(poll,True) in ('failed','stopped'):
            return {'final':True,'detail':(poll.get('latestAssistant') or {}).get('text') or '上游已结束且没有视频'}
        return {'final':False}
      finally:
        if context:
            try:await asyncio.wait_for(context.close(),15)
            except Exception:pass
        shutil.rmtree(profile,ignore_errors=True)
