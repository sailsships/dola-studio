# 请求与响应模型源码索引

源码核对基线：`ca41dcb26376b0e1a0db35341c2881cdb124447a`。本附录由静态 AST 提取；不启动服务、不读取运行配置或数据库。

[返回完整项目解说](../PROJECT-GUIDE.zh-CN.md)。源码行号对应生成时的文件；后续修改后应重新生成。

下表保留 `server.py` 中 Pydantic 模型的字段注解与默认表达式。处理器还可能接受额外兼容字段并执行跨字段校验，不能只凭模型字段判断支持组合。

## VideoGenRequest

源码：[server.py:423](../../server.py#L423)。

| 字段 | 类型 | 默认值或校验 |
| --- | --- | --- |
| `model` | `str` | `'seedance-2.0-fast'` |
| `prompt` | `str` | `Field(..., min_length=1)` |
| `size` | `str \| None` | `None` |
| `ratio` | `str \| None` | `None` |
| `execution_mode` | `Literal['chat', 'work', 'force15', 'auto'] \| None` | `None` |
| `video_count` | `Literal[1, 2]` | `1` |
| `duration` | `int \| None` | `Field(None, ge=4, le=30)` |
| `seconds` | `int \| None` | `Field(None, ge=4, le=30)` |
| `duration_seconds` | `int \| None` | `Field(None, ge=4, le=30)` |
| `resolution` | `str \| None` | `None` |
| `reference_images` | `list[str]` | `Field(default_factory=list)` |
| `reference_audio` | `list[str]` | `Field(default_factory=list)` |
| `reference_source` | `Literal['unspecified', 'ai_generated'] \| None` | `None` |
| `image_url` | `Any` | `None` |
| `image` | `Any` | `None` |
| `input_image` | `Any` | `None` |
| `input_images` | `Any` | `None` |

## TestGenRequest

源码：[server.py:449](../../server.py#L449)。

| 字段 | 类型 | 默认值或校验 |
| --- | --- | --- |
| `prompt` | `str` | `Field(..., min_length=1)` |
| `model` | `str` | `'seedance-2.0-fast'` |
| `duration` | `int` | `Field(15, ge=4, le=30)` |
| `ratio` | `str \| None` | `None` |
| `execution_mode` | `Literal['chat', 'work', 'force15', 'auto']` | `'force15'` |
| `video_count` | `Literal[1, 2]` | `1` |
| `force` | `bool` | `False` |
| `reference_images` | `list[str]` | `Field(default_factory=list)` |
| `reference_audio` | `list[str]` | `Field(default_factory=list)` |

## TaskResponse

源码：[server.py:463](../../server.py#L463)。

| 字段 | 类型 | 默认值或校验 |
| --- | --- | --- |
| `id` | `str` | `必填` |
| `status` | `str` | `必填` |
| `model` | `str \| None` | `None` |
| `prompt` | `str \| None` | `None` |
| `video_url` | `str \| None` | `None` |
| `videos` | `list[dict] \| None` | `None` |
| `error` | `str \| None` | `None` |
| `progress` | `dict \| None` | `None` |
| `video_url_hd` | `str \| None` | `None` |
| `resolution` | `str \| None` | `None` |
| `upscale_note` | `str \| None` | `None` |

## UpdateRequest

源码：[server.py:2170](../../server.py#L2170)。

| 字段 | 类型 | 默认值或校验 |
| --- | --- | --- |
| `version` | `str` | `必填` |

## UpscaleSettingsPatch

源码：[server.py:2358](../../server.py#L2358)。

| 字段 | 类型 | 默认值或校验 |
| --- | --- | --- |
| `enabled` | `bool \| None` | `None` |
| `provider` | `str \| None` | `None` |
| `target` | `str \| None` | `None` |
| `fal_key` | `str \| None` | `None` |
| `fal_preset` | `str \| None` | `None` |
| `open_endpoint` | `str \| None` | `None` |
| `open_token` | `str \| None` | `None` |
| `delivery` | `str \| None` | `None` |
| `auto` | `str \| None` | `None` |
| `custom_name` | `str \| None` | `None` |
| `custom_submit_url` | `str \| None` | `None` |
| `custom_headers` | `str \| None` | `None` |
| `custom_body` | `str \| None` | `None` |
| `custom_target_map` | `str \| None` | `None` |
| `custom_id_path` | `str \| None` | `None` |
| `custom_poll_url` | `str \| None` | `None` |
| `custom_status_path` | `str \| None` | `None` |
| `custom_success` | `str \| None` | `None` |
| `custom_failed` | `str \| None` | `None` |
| `custom_result_path` | `str \| None` | `None` |
| `custom_error_path` | `str \| None` | `None` |
| `custom_code_path` | `str \| None` | `None` |
| `custom_code_ok` | `str \| None` | `None` |

## UpscaleRequest

源码：[server.py:2384](../../server.py#L2384)。

| 字段 | 类型 | 默认值或校验 |
| --- | --- | --- |
| `provider` | `str \| None` | `None` |
| `force` | `bool` | `False` |

## Work15Patch

源码：[server.py:2411](../../server.py#L2411)。

| 字段 | 类型 | 默认值或校验 |
| --- | --- | --- |
| `enabled` | `bool` | `必填` |
| `concurrency` | `int \| None` | `Field(None, ge=1, strict=True)` |

## WindowConcurrencyPatch

源码：[server.py:2435](../../server.py#L2435)。

| 字段 | 类型 | 默认值或校验 |
| --- | --- | --- |
| `concurrency` | `int` | `Field(..., ge=1, strict=True)` |

## ResponderPatch

源码：[server.py:2467](../../server.py#L2467)。

| 字段 | 类型 | 默认值或校验 |
| --- | --- | --- |
| `enabled` | `bool \| None` | `None` |
| `base_url` | `str \| None` | `None` |
| `api_key` | `str \| None` | `None` |
| `model` | `str \| None` | `None` |

## ImageGenRequest

源码：[server.py:2622](../../server.py#L2622)。

| 字段 | 类型 | 默认值或校验 |
| --- | --- | --- |
| `model` | `str` | `'doubao-seedream-5.0-flash'` |
| `prompt` | `str` | `Field(..., min_length=1)` |
| `n` | `int \| None` | `Field(None, ge=1, le=4)` |
| `size` | `str \| None` | `None` |
| `ratio` | `str \| None` | `None` |
| `response_format` | `str` | `'url'` |
| `reference_images` | `list[str]` | `Field(default_factory=list)` |
| `image` | `Any` | `None` |
| `image_url` | `Any` | `None` |
| `images` | `Any` | `None` |

## AdminLogin

源码：[server.py:2888](../../server.py#L2888)。

| 字段 | 类型 | 默认值或校验 |
| --- | --- | --- |
| `username` | `str` | `必填` |
| `password` | `str` | `必填` |

## AdminUserCreate

源码：[server.py:2893](../../server.py#L2893)。

| 字段 | 类型 | 默认值或校验 |
| --- | --- | --- |
| `username` | `str` | `必填` |
| `password` | `str` | `必填` |
| `role` | `str` | `'admin'` |

## AdminUserUpdate

源码：[server.py:2899](../../server.py#L2899)。

| 字段 | 类型 | 默认值或校验 |
| --- | --- | --- |
| `username` | `str \| None` | `None` |
| `password` | `str \| None` | `None` |
| `enabled` | `bool \| None` | `None` |

## ProxyCreate

源码：[server.py:2905](../../server.py#L2905)。

| 字段 | 类型 | 默认值或校验 |
| --- | --- | --- |
| `name` | `str` | `必填` |
| `protocol` | `str` | `'http'` |
| `host` | `str` | `''` |
| `port` | `int` | `Field(0, ge=0, le=65535)` |
| `username` | `str` | `''` |
| `password` | `str` | `''` |
| `remark` | `str` | `''` |
| `mode` | `str` | `'static'` |
| `session_template` | `str` | `''` |
| `sticky_ttl` | `int` | `Field(0, ge=0)` |
| `rotate_on_risk` | `bool` | `True` |
| `rotate_min_interval` | `int` | `Field(0, ge=0)` |
| `extract_url` | `str` | `''` |
| `extract_interval` | `int` | `Field(0, ge=0)` |
| `nodes_text` | `str` | `''` |

## ProxyUpdate

源码：[server.py:2929](../../server.py#L2929)。

| 字段 | 类型 | 默认值或校验 |
| --- | --- | --- |
| `name` | `str \| None` | `None` |
| `protocol` | `str \| None` | `None` |
| `host` | `str \| None` | `None` |
| `port` | `int \| None` | `Field(None, ge=0, le=65535)` |
| `username` | `str \| None` | `None` |
| `password` | `str \| None` | `None` |
| `remark` | `str \| None` | `None` |
| `enabled` | `bool \| None` | `None` |
| `mode` | `str \| None` | `None` |
| `session_template` | `str \| None` | `None` |
| `sticky_ttl` | `int \| None` | `Field(None, ge=0)` |
| `rotate_on_risk` | `bool \| None` | `None` |
| `rotate_min_interval` | `int \| None` | `Field(None, ge=0)` |
| `extract_url` | `str \| None` | `None` |
| `extract_interval` | `int \| None` | `Field(None, ge=0)` |

## ProxyNodesIn

源码：[server.py:2947](../../server.py#L2947)。

| 字段 | 类型 | 默认值或校验 |
| --- | --- | --- |
| `text` | `str` | `''` |
| `ttl` | `int \| None` | `None` |

## AccountProxyBind

源码：[server.py:2954](../../server.py#L2954)。

| 字段 | 类型 | 默认值或校验 |
| --- | --- | --- |
| `proxy_id` | `str \| None` | `None` |

## StressRequest

源码：[server.py:2958](../../server.py#L2958)。

| 字段 | 类型 | 默认值或校验 |
| --- | --- | --- |
| `max_concurrency` | `int` | `Field(8, ge=1, le=12)` |
| `hold_seconds` | `float` | `Field(5.0, ge=3.0, le=15.0)` |

## AccountPatch

源码：[server.py:2963](../../server.py#L2963)。

| 字段 | 类型 | 默认值或校验 |
| --- | --- | --- |
| `scheduling` | `bool \| None` | `None` |
| `note` | `str \| None` | `None` |
| `email` | `str \| None` | `None` |

## RecoverBody

源码：[server.py:2969](../../server.py#L2969)。

| 字段 | 类型 | 默认值或校验 |
| --- | --- | --- |
| `kind` | `str` | `'risk'` |
| `names` | `list[str]` | `[]` |

## PreferBody

源码：[server.py:2976](../../server.py#L2976)。

| 字段 | 类型 | 默认值或校验 |
| --- | --- | --- |
| `preferred` | `bool` | `True` |

## WeightBody

源码：[server.py:2980](../../server.py#L2980)。

| 字段 | 类型 | 默认值或校验 |
| --- | --- | --- |
| `weight` | `int` | `Field(1, ge=1, le=100)` |

## BindProxiesBody

源码：[server.py:2984](../../server.py#L2984)。

| 字段 | 类型 | 默认值或校验 |
| --- | --- | --- |
| `proxies` | `list[str]` | `必填` |
| `force` | `bool` | `False` |
| `mode` | `str` | `'sticky'` |

## BatchAccountsBody

源码：[server.py:2990](../../server.py#L2990)。

| 字段 | 类型 | 默认值或校验 |
| --- | --- | --- |
| `names` | `list[str]` | `Field(default_factory=list)` |

## CookieExportBody

源码：[server.py:2995](../../server.py#L2995)。

| 字段 | 类型 | 默认值或校验 |
| --- | --- | --- |
| `names` | `list[str]` | `Field(min_length=1, max_length=500)` |

## BatchProxyBody

源码：[server.py:2999](../../server.py#L2999)。

| 字段 | 类型 | 默认值或校验 |
| --- | --- | --- |
| `names` | `list[str]` | `Field(default_factory=list)` |
| `proxy_id` | `str \| None` | `None` |

## ImportTextBody

源码：[server.py:3004](../../server.py#L3004)。

| 字段 | 类型 | 默认值或校验 |
| --- | --- | --- |
| `text` | `str` | `''` |
| `skip_verify` | `bool` | `False` |
| `site` | `str` | `'dola'` |
| `proxy_ids` | `list[str]` | `Field(default_factory=list, max_length=500)` |

## AccountAdd

源码：[server.py:3012](../../server.py#L3012)。

| 字段 | 类型 | 默认值或校验 |
| --- | --- | --- |
| `name` | `str` | `必填` |
| `email` | `str` | `''` |
| `password` | `str` | `''` |
| `totp` | `str` | `''` |
| `recovery_email` | `str` | `''` |
| `mail_api` | `str` | `''` |
| `cookies` | `str` | `''` |
| `cookie_skip_verify` | `bool` | `False` |
| `proxy_id` | `str \| None` | `None` |
| `login_method` | `Literal['google', 'apple']` | `'google'` |

## AppleLoginAnswer

源码：[server.py:3025](../../server.py#L3025)。

| 字段 | 类型 | 默认值或校验 |
| --- | --- | --- |
| `challenge_id` | `str` | `Field(..., min_length=1, max_length=64)` |
| `code` | `str` | `Field('', max_length=16)` |

## KeyCreate

源码：[server.py:3030](../../server.py#L3030)。

| 字段 | 类型 | 默认值或校验 |
| --- | --- | --- |
| `name` | `str` | `''` |
| `daily_limit` | `int` | `Field(0, ge=0, le=1000000)` |
| `concurrency_limit` | `int` | `Field(0, ge=0, le=1000)` |
| `allowed_durations` | `list[int]` | `Field(default_factory=lambda: list(SUPPORTED_DURATIONS))` |
| `expires_at` | `float \| None` | `Field(None, ge=0)` |

## KeyPatch

源码：[server.py:3038](../../server.py#L3038)。

| 字段 | 类型 | 默认值或校验 |
| --- | --- | --- |
| `name` | `str \| None` | `None` |
| `enabled` | `bool \| None` | `None` |
| `daily_limit` | `int \| None` | `Field(None, ge=0, le=1000000)` |
| `concurrency_limit` | `int \| None` | `Field(None, ge=0, le=1000)` |
| `allowed_durations` | `list[int] \| None` | `None` |
| `expires_at` | `float \| None` | `Field(None, ge=0)` |

## RenameAccount

源码：[server.py:3250](../../server.py#L3250)。

| 字段 | 类型 | 默认值或校验 |
| --- | --- | --- |
| `new_name` | `str` | `必填` |

## BatchIds

源码：[server.py:4073](../../server.py#L4073)。

| 字段 | 类型 | 默认值或校验 |
| --- | --- | --- |
| `ids` | `list[str]` | `[]` |

## BatchUsers

源码：[server.py:4279](../../server.py#L4279)。

| 字段 | 类型 | 默认值或校验 |
| --- | --- | --- |
| `usernames` | `list[str]` | `[]` |

## ConcurrencySettings

源码：[server.py:4663](../../server.py#L4663)。

| 字段 | 类型 | 默认值或校验 |
| --- | --- | --- |
| `max_concurrency` | `int` | `Field(..., ge=0, le=1000, strict=True)` |
