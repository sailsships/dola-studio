"""Read complete editor contents independently of folding, clipping and CSS layout."""
import asyncio
import re
import time
import unicodedata

from patchright.async_api import Error as BrowserError

EDITOR_SELECTOR = 'textarea:visible,[contenteditable="true"]:visible'
INPUT_WAIT_SECONDS = 30
VERIFY_WAIT_SECONDS = 3
POLL_SECONDS = .2
READ_TEXT_JS = r"""e=>{
 if(e.tagName==='TEXTAREA')return e.value;
 const blocks=new Set(['DIV','P','LI','UL','OL','BLOCKQUOTE','PRE','H1','H2','H3']);
 function read(root){
  let out='';
  for(const node of root.childNodes){
   if(node.nodeType===3){out+=node.nodeValue;continue}
   if(node.nodeType!==1)continue;
   if(['SCRIPT','STYLE','TEMPLATE'].includes(node.tagName))continue;
   // Attachment chips and fold/expand controls are not editable prompt text.
   if(node.getAttribute('contenteditable')==='false'||node.getAttribute('role')==='button')continue;
   if(node.tagName==='BR'){out+='\n';continue}
   if(blocks.has(node.tagName)){
    if(out&&!out.endsWith('\n'))out+='\n';
    out+=read(node);
    if(node.nextSibling&&!out.endsWith('\n'))out+='\n';
   }else out+=read(node);
  }
  return out;
 }
 // Text nodes include CSS-hidden folded portions and exclude CSS ellipsis.
 return read(e);
}"""


class ComposerInputError(RuntimeError):
    pass


def normalise_editor_text(text):
    text=unicodedata.normalize('NFC',text).replace('\r\n','\n').replace('\r','\n')
    text=text.replace('\u00a0',' ').replace('\u202f',' ')
    # Preserve punctuation, emoji joiners, internal spaces and actual line breaks.
    text=text.replace('\u200b','').replace('\ufeff','')
    return re.sub(r'\n{2,}', '\n\n', text).strip()


def _transient(exc):
    return any(x in str(exc).lower() for x in ('timeout','detached','not attached','strict mode violation'))


async def _matches(editor,text):
    if await editor.count()!=1:return False
    return normalise_editor_text(await editor.evaluate(READ_TEXT_JS,timeout=2000))==normalise_editor_text(text)


async def verify_composer(editor,text,*,wait_seconds=VERIFY_WAIT_SECONDS):
    deadline=time.monotonic()+wait_seconds
    stable_since=None
    while time.monotonic()<deadline:
        try:matched=await _matches(editor,text)
        except BrowserError as exc:
            if not _transient(exc):raise
            matched=False
        if matched:
            stable_since=stable_since or time.monotonic()
            if time.monotonic()-stable_since>=.4:return
        else:stable_since=None
        await asyncio.sleep(POLL_SECONDS)
    count=await editor.count()
    reason='找不到唯一的可见输入框' if count!=1 else '输入框完整内容与请求不一致'
    raise ComposerInputError(reason)


async def fill_verified_composer(page,text):
    editor=page.locator(EDITOR_SELECTOR)
    deadline=time.monotonic()+INPUT_WAIT_SECONDS
    fills=0
    while time.monotonic()<deadline:
        try:
            if await editor.count()!=1 or not await editor.is_editable():
                await asyncio.sleep(POLL_SECONDS);continue
            # Do not overwrite a complete folded draft merely to make it visible.
            if not await _matches(editor,text):
                if fills>=3:break
                await editor.fill(text,timeout=3000)
                fills+=1
            await verify_composer(editor,text,wait_seconds=min(VERIFY_WAIT_SECONDS,max(.01,deadline-time.monotonic())))
            return editor
        except ComposerInputError:
            continue
        except BrowserError as exc:
            if not _transient(exc):raise
            await asyncio.sleep(POLL_SECONDS)
    count=await editor.count()
    reason='输入框尚未就绪或存在多个候选' if count!=1 else '等待并恢复输入后，输入框完整内容仍与请求不一致'
    raise ComposerInputError(reason)
