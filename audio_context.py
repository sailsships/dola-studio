"""Prepare audio context through the existing authenticated upload protocol, never video ability."""
import time
from pathlib import Path
import config
from account_transport import http_proxy
from generation_errors import PreSubmissionUploadError

def prepare_audio_context(account,state_file,paths):
    from pure_api_gen import _dola
    from pure_signer import install
    install();dola=_dola();session=None
    try:
        session,ctx,headers=dola.setup_session(region=config.PURE_API_REGION,pc_version=config.PURE_API_PC_VERSION,
            proxy=http_proxy(account) or '',login_pure=True,login_state_file=str(state_file))
        uploaded=[dola.upload_audio(session,ctx,headers,Path(path),resource_type=1) for path in paths]
        def guard(payload):
            if (payload.get('chat_ability') or {}).get('ability_type')==17:
                raise PreSubmissionUploadError('音频准备步骤禁止触发视频生成')
        result=dola.submit_chat_completion(session,ctx,headers,images=[],audios=uploaded,
            prompt='请记住本条上传的参考音频，作为后续同一会话视频的声音与节奏参考。仅解析音频，暂不生成视频。\n'+
                   '\n'.join(f'参考音频{i}（音频{i}）：{item.name}' for i,item in enumerate(uploaded,1)),
            duration=15,model='seedance_v2.0',ratio=None,timeout_sec=120,video_ability=False,payload_hook=guard)
        cid=str(result.conversation_id or '')
        if not cid.isdigit() or result.error:raise PreSubmissionUploadError('音频参考消息未被确认，未提交视频生成')
        names=[item.name for item in uploaded];deadline=time.monotonic()+120
        while time.monotonic()<deadline:
            chain=dola.fetch_single_chain(session,ctx,cid)
            states=dola.extract_attachment_statuses(chain)
            if all(any(s.get('name')==name and all(str(s.get(k))=='1' for k in ('upload_status','parse_state','review_state'))
                       for s in states) for name in names):
                return dict(conversation_id=cid,names=names,count=len(names),parsed=True)
            time.sleep(3)
        raise PreSubmissionUploadError('参考音频未全部解析及审核通过，未提交视频生成')
    except PreSubmissionUploadError:raise
    except Exception as exc:
        raise PreSubmissionUploadError('参考音频上传或解析失败（'+type(exc).__name__+'），未提交视频生成') from exc
    finally:
        if session:session.close()
