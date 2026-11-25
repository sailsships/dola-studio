"""Bound the pre-submission popup/login checks independently of browser RPCs."""
import asyncio
import time

from generation_errors import PreSubmissionParametersError


async def check_page_login(page, *, dismiss_popups, is_logged_out, progress=None,
                           seconds=20, operation_seconds=6):
    deadline=time.monotonic()+seconds
    async def bounded(label, operation):
        while True:
            remaining=deadline-time.monotonic()
            if remaining<=0:
                raise PreSubmissionParametersError('页面状态检查超时，浏览器未及时响应；尚未提交生成')
            if progress:progress(label)
            try:
                return await asyncio.wait_for(operation(),min(operation_seconds,remaining))
            except TimeoutError:
                if time.monotonic()>=deadline:
                    raise PreSubmissionParametersError('页面状态检查超时，浏览器未及时响应；尚未提交生成') from None
                if progress:progress('页面检查暂未响应，正在限时重查')
                await asyncio.sleep(min(.2,max(0,deadline-time.monotonic())))
    await bounded('检查页面遮挡与弹窗',lambda:dismiss_popups(page))
    return await bounded('检查页面登录入口',lambda:is_logged_out(page))
