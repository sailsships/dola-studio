"""Enter video mode through an actual entry, never its same-labelled exit chip."""
import asyncio
import re
import time
from urllib.parse import urlsplit
from generation_errors import PreSubmissionParametersError

VIDEO_LABEL=re.compile(r'^\s*(?:動画を作成|Create video|生成视频|制作视频|视频生成|동영상 만들기)\s*$',re.I)
ENTRY_SECONDS=90
CONTROLS_SECONDS=90
RETRY_CLICK_SECONDS=8
POLL_SECONDS=.5
ENTRY_IDLE_SECONDS=30
RELOAD_SECONDS=20

STATE_JS=r'''()=>{
 const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'};
 const roots=[...document.querySelectorAll('[data-testid="chat_input"]')].filter(visible);
 const params=roots.flatMap(e=>[...e.querySelectorAll('button[data-input-engine-actionbar-render-entry-key="video-generation-params-panel"]')]).filter(visible);
 const tokens=roots.flatMap(e=>[...e.querySelectorAll('[data-testid="skill_input_exit_button"][data-value="17"]')]).filter(visible);
 const hasDraft=roots.some(root=>[...root.querySelectorAll('textarea,[contenteditable="true"]')].some(e=>String(e.value??e.innerText??'').trim())||[...root.querySelectorAll('input[type="file"]')].some(e=>e.files?.length));
 const models=roots.flatMap(e=>[...e.querySelectorAll('button')]).filter(e=>visible(e)&&/Seedance/i.test(e.innerText||''));
 return {hasDraft,ready:params.length===1&&!params[0].disabled&&models.length>0,params:params.length,
         selected:tokens.length>0,models:models.length,
         summary:params.map(e=>e.innerText).join(' | ')};
}'''


async def _unique_visible(locator):
    locator=locator.filter(visible=True)
    count=await locator.count()
    if count>1:
        raise PreSubmissionParametersError('发现多个视频创作入口，无法唯一定位，未提交生成')
    if count==1 and await locator.is_enabled():return locator
    return None


async def find_entry(page):
    # The observed video skill id is 17; the exit chip has data-value="17"
    # instead of skill_bar_button_17 and is deliberately outside this selector.
    entry=await _unique_visible(page.locator('button[data-testid="skill_bar_button_17"]'))
    if entry is not None:return entry
    bar=page.locator('[data-testid="guidance-skill-bar"]')
    return await _unique_visible(bar.get_by_role('button',name=VIDEO_LABEL))


async def find_menu_option(page):
    for role in ('menuitem','option'):
        loc=await _unique_visible(page.get_by_role(role,name=VIDEO_LABEL))
        if loc is not None:return loc
    menu=page.locator('[role="menu"]:visible,[role="listbox"]:visible')
    return await _unique_visible(menu.get_by_text(VIDEO_LABEL))


async def ensure_video_mode(page,account,*,dismiss=None,progress=None):
    # Reload is preparation only. A completion seen during this call closes
    # the recovery path even if its response or acknowledgement is lost.
    submitted=False
    def observe(request):
        nonlocal submitted
        if request.method=='POST' and urlsplit(request.url).path.rstrip('/').endswith('/chat/completion'):
            submitted=True
    page.on('request',observe)
    scope=asyncio.timeout(ENTRY_SECONDS+CONTROLS_SECONDS+15)
    try:
        async with scope:
            return await _ensure_video_mode(page,account,dismiss=dismiss,progress=progress,
                                            has_submission=lambda:submitted)
    except TimeoutError:
        if not scope.expired():raise
        detail='已观察到提交，保留原会话，不重新发送' if submitted else '未提交生成'
        raise PreSubmissionParametersError('视频模式准备超过总等待上限；'+detail) from None
    finally:
        page.remove_listener('request',observe)


async def _ensure_video_mode(page,account,*,dismiss=None,progress=None,has_submission):
    started=time.monotonic();entry_deadline=started+ENTRY_SECONDS
    controls_deadline=None;last_click=None;clicks=0;menu_opened=False;next_report=0
    last_state={};last_click_error=None
    reloaded=False;idle_since=started;previous_signature=None
    def report(text):
        if progress:progress(text)
    if dismiss:await dismiss(page)
    while True:
        now=time.monotonic()
        deadline=controls_deadline if controls_deadline is not None else entry_deadline
        if now>=deadline:break
        try:
            state=await asyncio.wait_for(page.evaluate(STATE_JS),min(5,max(.01,deadline-now)))
        except asyncio.CancelledError:raise
        except Exception as exc:
            if type(exc).__name__!='TimeoutError' and not isinstance(exc,TimeoutError):raise
            await asyncio.sleep(min(POLL_SECONDS,max(0,deadline-time.monotonic())));continue
        last_state=state
        if state.get('params',0)>1:
            raise PreSubmissionParametersError('视频参数入口不唯一，未提交生成')
        if state.get('ready'):
            report('视频模式及参数入口已确认')
            return
        now=time.monotonic()
        signature=(state.get('selected'),state.get('params'),state.get('models'),state.get('hasDraft'))
        if signature!=previous_signature:
            idle_since=now;previous_signature=signature
        monitor=getattr(page,'_dola_load_state',{})
        transport=getattr(page.context,'_dola_stylesheet_stats',{})
        last_progress=max(idle_since,monitor.get('last_progress',started),transport.get('last_progress',started))
        # Do not discard drafts, selected modes, or an already dispatched send.
        # One passive reload can recover a failed entry/config load while the
        # existing absolute deadline continues to run.
        if (not reloaded and not clicks and not has_submission()
                and not state.get('selected') and not state.get('params')
                and not state.get('hasDraft',True) and now-last_progress>=ENTRY_IDLE_SECONDS):
            reloaded=True
            report('视频入口加载无进展，刷新当前页面一次恢复（尚未提交生成）')
            try:
                await page.reload(wait_until='commit',timeout=max(1,int(min(RELOAD_SECONDS,entry_deadline-now)*1000)))
            except asyncio.CancelledError:raise
            except Exception as exc:
                if not isinstance(exc,TimeoutError) and type(exc).__name__!='TimeoutError':raise
            idle_since=time.monotonic();previous_signature=None;menu_opened=False;next_report=0
            if dismiss and time.monotonic()<entry_deadline:
                try:await asyncio.wait_for(dismiss(page),min(5,max(.01,entry_deadline-time.monotonic())))
                except TimeoutError:pass
            continue
        if (state.get('selected') or state.get('params')==1) and controls_deadline is None:
            controls_deadline=now+CONTROLS_SECONDS
        if now>=next_report:
            if controls_deadline is not None:
                report(f'视频模式已选择，等待模型与参数加载（已等待 {int(now-(controls_deadline-CONTROLS_SECONDS))} 秒）')
            else:report(f'等待可操作的视频创作入口（已等待 {int(now-started)} 秒）')
            next_report=now+5
        # A selected skill can have a long render gap before its controls.
        # Never click its "動画を作成" chip: that element exits the skill.
        if not state.get('selected') and not state.get('params'):
            can_click=clicks<2 and (last_click is None or now-last_click>=RETRY_CLICK_SECONDS)
            if can_click:
                entry=await find_entry(page)
                if entry is None:
                    option=await find_menu_option(page)
                    if option is not None:entry=option
                    elif not menu_opened:
                        trigger=await _unique_visible(page.locator('button[data-testid="chat_input_action_mode"]'))
                        if trigger is not None:
                            try:
                                await trigger.click(timeout=4000)
                                menu_opened=True
                            except Exception as exc:
                                if type(exc).__name__!='TimeoutError':raise
                                menu_opened=True
                if entry is not None:
                    # Keep the exact scoped locator for the click. React can
                    # replace it with an exit chip between observation/click;
                    # this locator cannot accidentally match that replacement.
                    clicks+=1;last_click=time.monotonic();last_click_error=None
                    if controls_deadline is None:controls_deadline=last_click+CONTROLS_SECONDS
                    report('已定位视频创建入口，等待切换完成')
                    try:await entry.click(timeout=5000)
                    except Exception as exc:
                        if type(exc).__name__!='TimeoutError':raise
                        last_click_error=type(exc).__name__
                    next_report=0
        await asyncio.sleep(min(POLL_SECONDS,max(0,(controls_deadline or entry_deadline)-time.monotonic())))
    if controls_deadline is not None:
        detail='视频模式已选择' if last_state.get('selected') else '已点击视频创建入口'
        suffix='；入口点击超时' if last_click_error else ''
        raise PreSubmissionParametersError(detail+'，但视频参数控件在等待期限内未就绪'+suffix+'；未提交生成')
    raise PreSubmissionParametersError('视频创作入口在等待期限内未加载，未提交生成')
