"""Message-level confirmation for a continuation in an existing conversation."""
import json
import re
import time
import uuid
from pathlib import Path

CONFIRM_SECONDS = 180


def normalized(value):
    return re.sub(r'\s+', '', str(value or ''))


def new_state(assistant, text):
    return {'status': 'pending', 'sent_at': time.time(),
            'before_assistant_id': str(assistant.get('id') or ''),
            'before_index': str(assistant.get('index') or ''),
            'text_prefix': normalized(text)[:400], 'local_message_id': None}


def _path(account, conversation_id):
    if not re.fullmatch(r'[a-zA-Z0-9_-]+', str(account)) or not str(conversation_id).isdigit():
        raise ValueError('invalid followup identity')
    return Path('accounts') / account / 'force15-followups' / (str(conversation_id) + '.json')


def save(account, conversation_id, state):
    path = _path(account, conversation_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.parent.chmod(0o700)
    temp = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    try:
        temp.write_text(json.dumps(state, ensure_ascii=False), encoding='utf-8')
        temp.chmod(0o600)
        temp.replace(path)
    finally:
        temp.unlink(missing_ok=True)


def load(account, conversation_id):
    try:
        return json.loads(_path(account, conversation_id).read_text(encoding='utf-8'))
    except FileNotFoundError:
        return None


def assess(poll, state, receipt=None):
    """A dispatch or an existing conversation ID never proves message acceptance."""
    try:
        before = int(state.get('before_index') or -1)
    except (ValueError, TypeError):
        before = -1
    for msg in poll.get('userMessages') or []:
        try:
            newer = before >= 0 and int(msg.get('index') or -1) > before
        except (ValueError, TypeError):
            newer = False
        mid = state.get('local_message_id')
        matching_id = bool(mid and str(msg.get('localMessageId') or '') == str(mid))
        prefix = state.get('text_prefix') or ''
        matching_text = bool(newer and prefix and normalized(msg.get('text')).startswith(prefix))
        if matching_id or matching_text:
            return 'confirmed', str(msg.get('id') or '')
    # Once a saved user message was seen, a later missing page cannot undo it.
    if state.get('status') == 'confirmed':
        return 'confirmed', state.get('user_message_id') or ''
    receipt = receipt or {}
    if receipt.get('conflicting_ack'):
        return 'pending', ''
    if receipt.get('error'):
        error = receipt['error']
        return 'rejected', f'续提被上游拒绝（code={error.get("code")}）：{error.get("message") or error.get("event") or "未提供说明"}'
    status = receipt.get('http_status')
    if status and int(status) >= 400:
        return 'rejected', f'续提请求 HTTP {int(status)}，未确认保存续提消息'
    if state.get('status') == 'rejected':
        return 'rejected', state.get('detail') or '上游拒绝续提'
    return 'pending', ''


def has_new_reply(poll, state):
    assistant = poll.get('latestAssistant') or {}
    if not assistant.get('id') or str(assistant['id']) == state.get('before_assistant_id'):
        return False
    try:
        return int(assistant.get('index') or -1) > int(state.get('before_index') or -1)
    except (ValueError, TypeError):
        return False


def unresolved_detail():
    return '续提请求已发出，但未确认上游保存续提消息；保留原会话，未重复提交。首轮旧回复不代表续提结果'
