"""Loopback CONNECT adapter for explicitly selected authenticated proxy gateways.

Keeps the exact upstream URL/session, validates upstream TLS, and never falls
back to a direct connection. All account relays share one I/O thread.
"""
import asyncio
import base64
import os
import ssl
import threading
from urllib.parse import unquote, urlsplit

_LOCK = threading.Lock()
_LOOP = None
_RELAYS = {}
_HEAD_LIMIT = 65536
STATS = {'connects': 0, 'upstream_200': 0, 'errors': 0}


def needs_relay(url):
    parsed = urlsplit(url or '')
    hosts = {host.strip().lower() for host in os.getenv(
        'DOLA_BROWSER_PREAUTH_PROXY_HOSTS', '').split(',') if host.strip()}
    return (parsed.scheme in ('http', 'https') and bool(parsed.username)
            and parsed.hostname in hosts)


def local_http_proxy_for(url):
    global _LOOP
    with _LOCK:
        if url in _RELAYS:
            return 'http://127.0.0.1:' + str(_RELAYS[url].sockets[0].getsockname()[1])
        if _LOOP is None:
            _LOOP = asyncio.new_event_loop()
            ready = threading.Event()
            def run():
                asyncio.set_event_loop(_LOOP)
                _LOOP.call_soon(ready.set)
                _LOOP.run_forever()
            threading.Thread(target=run, name='http-auth-relay', daemon=True).start()
            if not ready.wait(5):
                raise RuntimeError('代理认证转发启动超时')
        server = asyncio.run_coroutine_threadsafe(_start(url), _LOOP).result(timeout=10)
        _RELAYS[url] = server
        return 'http://127.0.0.1:' + str(server.sockets[0].getsockname()[1])


async def _start(url):
    proxy = urlsplit(url)
    if proxy.scheme not in ('http', 'https') or not proxy.hostname:
        raise ValueError('Invalid HTTP proxy configuration')
    auth = base64.b64encode((unquote(proxy.username or '') + ':' +
                            unquote(proxy.password or '')).encode()).decode()

    async def handle(reader, writer):
        upstream_writer = None
        established = False
        tasks = []
        try:
            head = await asyncio.wait_for(reader.readuntil(b'\r\n\r\n'), 30)
            method, target, _ = head.split(b'\r\n', 1)[0].decode('ascii').split(' ', 2)
            if method != 'CONNECT' or not target.endswith(':443'):
                writer.write(b'HTTP/1.1 405 Method Not Allowed\r\nContent-Length: 0\r\n\r\n')
                await writer.drain()
                return
            STATS['connects'] += 1
            options = {'limit': _HEAD_LIMIT}
            if proxy.scheme == 'https':
                options.update(ssl=ssl.create_default_context(), server_hostname=proxy.hostname)
            upstream_reader, upstream_writer = await asyncio.wait_for(
                asyncio.open_connection(proxy.hostname,
                    proxy.port or (443 if proxy.scheme == 'https' else 80), **options), 20)
            upstream_writer.write((f'CONNECT {target} HTTP/1.1\r\nHost: {target}\r\n'
                f'Proxy-Authorization: Basic {auth}\r\nProxy-Connection: keep-alive\r\n\r\n').encode('ascii'))
            await upstream_writer.drain()
            response = await asyncio.wait_for(upstream_reader.readuntil(b'\r\n\r\n'), 30)
            if response.split(b'\r\n', 1)[0].split(b' ', 2)[1] != b'200':
                raise ConnectionError('Upstream proxy rejected CONNECT')
            STATS['upstream_200'] += 1
            writer.write(b'HTTP/1.1 200 Connection Established\r\n\r\n')
            await writer.drain()
            established = True
            async def pipe(source, destination):
                while True:
                    chunk = await asyncio.wait_for(source.read(65536), 120)
                    if not chunk:
                        return
                    destination.write(chunk)
                    await destination.drain()
            tasks = [asyncio.create_task(pipe(reader, upstream_writer)),
                     asyncio.create_task(pipe(upstream_reader, writer))]
            done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for task in pending:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
        except Exception:
            STATS['errors'] += 1
            if not established:
                try:
                    writer.write(b'HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n')
                    await writer.drain()
                except Exception:
                    pass
        finally:
            for task in tasks:
                if not task.done():task.cancel()
            for stream in (upstream_writer, writer):
                if stream is not None:
                    stream.close()
                    try:await asyncio.wait_for(stream.wait_closed(), 2)
                    except Exception:pass
    return await asyncio.start_server(handle, '127.0.0.1', 0, limit=_HEAD_LIMIT)
