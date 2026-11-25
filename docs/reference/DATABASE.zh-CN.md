# 数据表源码索引

源码核对基线：`c0bc8ac5cfe198f2b4630a7e4a29f75196178fa9`。本附录由静态 AST 提取；不启动服务、不读取运行配置或数据库。

[返回完整项目解说](../PROJECT-GUIDE.zh-CN.md)。源码行号对应生成时的文件；后续修改后应重新生成。

仅列出静态 SQL 字符串中的建表名。实际部署的字段、迁移历史、索引与内容应以该实例 SQLite schema 为准。本生成器没有连接任何数据库。

| 表 | 建表源码 |
| --- | --- |
| `account_proxy` | [proxy_store.py:108](../../proxy_store.py#L108) |
| `accounts_meta` | [browser_pool.py:404](../../browser_pool.py#L404) |
| `admin_sessions` | [user_store.py:37](../../user_store.py#L37) |
| `admin_users` | [user_store.py:23](../../user_store.py#L23) |
| `api_keys` | [store.py:135](../../store.py#L135) |
| `app_settings` | [store.py:39](../../store.py#L39) |
| `proxies` | [proxy_store.py:92](../../proxy_store.py#L92) |
| `proxy_nodes` | [proxy_store.py:131](../../proxy_store.py#L131) |
| `proxy_region_events` | [proxy_region.py:15](../../proxy_region.py#L15) |
| `proxy_region_state` | [proxy_region.py:11](../../proxy_region.py#L11) |
| `proxy_sessions` | [proxy_store.py:116](../../proxy_store.py#L116) |
| `proxy_unusable_routes` | [proxy_availability.py:10](../../proxy_availability.py#L10) |
| `tasks` | [store.py:43](../../store.py#L43) |
| `usage` | [browser_pool.py:400](../../browser_pool.py#L400)<br>[pool.py:97](../../pool.py#L97) |
