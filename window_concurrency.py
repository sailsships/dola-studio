"""Shared live browser quota; resizing retains existing holders and waiters."""
import asyncio
import config


class WindowSlots:
    def __init__(self, limit):
        self.limit = limit
        self.active = 0
        self.waiting = 0
        self.condition = asyncio.Condition()

    def locked(self):
        return self.active >= max(1, self.limit())

    async def acquire(self):
        async with self.condition:
            self.waiting += 1
            try:
                await self.condition.wait_for(lambda: not self.locked())
                self.active += 1
            finally:
                self.waiting -= 1

    async def release(self):
        async with self.condition:
            self.active -= 1
            self.condition.notify_all()

    async def notify_changed(self):
        async with self.condition:
            self.condition.notify_all()


slots = WindowSlots(lambda: config.WORK_15S_CONCURRENCY)
