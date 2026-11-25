# API 路由源码索引

源码核对基线：`ca41dcb26376b0e1a0db35341c2881cdb124447a`。本附录由静态 AST 提取；不启动服务、不读取运行配置或数据库。

[返回完整项目解说](../PROJECT-GUIDE.zh-CN.md)。源码行号对应生成时的文件；后续修改后应重新生成。

共 **101 个方法与路径组合**，包括四组动态注册的 Ark 兼容路由。

鉴权列静态识别直接调用、owner 校验及视频别名的已知委托，不能替代运行时验证。业务 API 的匿名开发分支、任务归属、静态媒体访问和角色限制见主文。

| 方法 | 路径 | 处理器 | 鉴权入口 | 源码 |
| --- | --- | --- | --- | --- |
| POST | `/v1/videos/generations` | `create_video` | 业务 API：Bearer（无有效密钥配置时匿名） | [server.py:1758](../../server.py#L1758) |
| POST | `/v1/videos` | `create_video_vinted_alias` | 委托 create_video：与视频创建相同业务鉴权 | [server.py:1837](../../server.py#L1837) |
| GET | `/v/{name}` | `video_short_link` | 无直接鉴权调用；公开健康/模型、登录入口或媒体短链 | [server.py:2101](../../server.py#L2101) |
| HEAD | `/v/{name}` | `video_short_link` | 无直接鉴权调用；公开健康/模型、登录入口或媒体短链 | [server.py:2101](../../server.py#L2101) |
| GET | `/api/admin/update` | `admin_update_status` | 管理会话：X-Admin-Key | [server.py:2175](../../server.py#L2175) |
| POST | `/api/admin/update/check` | `admin_update_check` | 管理会话：X-Admin-Key | [server.py:2181](../../server.py#L2181) |
| POST | `/api/admin/update` | `admin_update_start` | 管理会话且 owner：X-Admin-Key | [server.py:2187](../../server.py#L2187) |
| POST | `/api/admin/update/cancel` | `admin_update_cancel` | 管理会话且 owner：X-Admin-Key | [server.py:2201](../../server.py#L2201) |
| GET | `/api/admin/settings/upscale` | `admin_upscale_settings` | 管理会话：X-Admin-Key | [server.py:2390](../../server.py#L2390) |
| PATCH | `/api/admin/settings/upscale` | `admin_upscale_settings_save` | 管理会话：X-Admin-Key | [server.py:2396](../../server.py#L2396) |
| GET | `/api/admin/settings/work-15s` | `admin_work_15s_settings` | 管理会话：X-Admin-Key | [server.py:2417](../../server.py#L2417) |
| PATCH | `/api/admin/settings/work-15s` | `admin_work_15s_save` | 管理会话：X-Admin-Key | [server.py:2423](../../server.py#L2423) |
| GET | `/api/admin/settings/window-concurrency` | `admin_window_concurrency` | 管理会话：X-Admin-Key | [server.py:2454](../../server.py#L2454) |
| PATCH | `/api/admin/settings/window-concurrency` | `admin_save_window_concurrency` | 管理会话：X-Admin-Key | [server.py:2460](../../server.py#L2460) |
| GET | `/api/admin/settings/responder` | `admin_responder_settings` | 管理会话：X-Admin-Key | [server.py:2483](../../server.py#L2483) |
| PATCH | `/api/admin/settings/responder` | `admin_responder_settings_save` | 管理会话：X-Admin-Key | [server.py:2489](../../server.py#L2489) |
| POST | `/api/admin/settings/responder/models` | `admin_responder_models` | 管理会话：X-Admin-Key | [server.py:2516](../../server.py#L2516) |
| POST | `/api/admin/settings/responder/test` | `admin_responder_test` | 管理会话：X-Admin-Key | [server.py:2526](../../server.py#L2526) |
| POST | `/api/admin/tasks/{task_id}/upscale` | `admin_task_upscale` | 管理会话：X-Admin-Key | [server.py:2540](../../server.py#L2540) |
| GET | `/v1/videos/{task_id}` | `get_video` | 业务 API：Bearer（无有效密钥配置时匿名） | [server.py:2578](../../server.py#L2578) |
| GET | `/v1/videos/{task_id}/content` | `get_video_content` | 业务 API：Bearer（无有效密钥配置时匿名） | [server.py:2596](../../server.py#L2596) |
| POST | `/v1/images/generations` | `create_image` | 业务 API：Bearer（无有效密钥配置时匿名） | [server.py:2692](../../server.py#L2692) |
| POST | `/v1/images/edits` | `edit_image` | 业务 API：Bearer（无有效密钥配置时匿名） | [server.py:2703](../../server.py#L2703) |
| GET | `/v1/models` | `list_models` | 无直接鉴权调用；公开健康/模型、登录入口或媒体短链 | [server.py:2718](../../server.py#L2718) |
| GET | `/health` | `health` | 无直接鉴权调用；公开健康/模型、登录入口或媒体短链 | [server.py:2873](../../server.py#L2873) |
| POST | `/api/admin/login` | `admin_login` | 无直接鉴权调用；公开健康/模型、登录入口或媒体短链 | [server.py:3048](../../server.py#L3048) |
| POST | `/api/admin/logout` | `admin_logout` | 管理会话：X-Admin-Key | [server.py:3069](../../server.py#L3069) |
| GET | `/api/admin/accounts` | `admin_accounts` | 管理会话：X-Admin-Key | [server.py:3077](../../server.py#L3077) |
| GET | `/api/admin/stress` | `admin_stress_status` | 管理会话：X-Admin-Key | [server.py:3150](../../server.py#L3150) |
| POST | `/api/admin/stress` | `admin_stress_start` | 管理会话：X-Admin-Key | [server.py:3160](../../server.py#L3160) |
| PATCH | `/api/admin/accounts/{name}` | `admin_account_patch` | 管理会话：X-Admin-Key | [server.py:3189](../../server.py#L3189) |
| GET | `/api/admin/accounts/{name}/note-detail` | `admin_account_note_detail` | 管理会话：X-Admin-Key | [server.py:3210](../../server.py#L3210) |
| POST | `/api/admin/accounts/{name}/recover` | `admin_account_recover` | 管理会话：X-Admin-Key | [server.py:3227](../../server.py#L3227) |
| POST | `/api/admin/accounts/{name}/probe-hello` | `admin_account_probe_hello` | 管理会话：X-Admin-Key | [server.py:3240](../../server.py#L3240) |
| POST | `/api/admin/accounts/{name}/rename` | `admin_account_rename` | 管理会话：X-Admin-Key | [server.py:3255](../../server.py#L3255) |
| DELETE | `/api/admin/accounts/{name}` | `admin_account_delete` | 管理会话：X-Admin-Key | [server.py:3271](../../server.py#L3271) |
| POST | `/api/admin/accounts/{name}/verify` | `admin_account_verify` | 管理会话：X-Admin-Key | [server.py:3277](../../server.py#L3277) |
| POST | `/api/admin/accounts/batch-recover` | `admin_batch_recover` | 管理会话：X-Admin-Key | [server.py:3505](../../server.py#L3505) |
| POST | `/api/admin/accounts/batch-probe-hello` | `admin_batch_probe_hello` | 管理会话：X-Admin-Key | [server.py:3541](../../server.py#L3541) |
| POST | `/api/admin/accounts/batch-verify` | `admin_batch_verify` | 管理会话：X-Admin-Key | [server.py:3571](../../server.py#L3571) |
| GET | `/api/admin/batch/{job_id}` | `admin_batch_status` | 管理会话：X-Admin-Key | [server.py:3600](../../server.py#L3600) |
| POST | `/api/admin/accounts/batch-proxy` | `admin_batch_proxy` | 管理会话：X-Admin-Key | [server.py:3609](../../server.py#L3609) |
| POST | `/api/admin/accounts/reset-quotas` | `admin_reset_quotas` | 管理会话：X-Admin-Key | [server.py:3638](../../server.py#L3638) |
| POST | `/api/admin/accounts/{name}/test-generate` | `admin_test_generate` | 管理会话：X-Admin-Key | [server.py:3646](../../server.py#L3646) |
| POST | `/api/admin/tasks/{task_id}/recover` | `admin_work_task_recover` | 管理会话：X-Admin-Key | [server.py:3821](../../server.py#L3821) |
| GET | `/api/admin/test-gen/{task_id}` | `admin_test_gen_status` | 管理会话：X-Admin-Key | [server.py:3840](../../server.py#L3840) |
| POST | `/api/admin/accounts/{name}/proxy` | `admin_account_proxy_set` | 管理会话：X-Admin-Key | [server.py:3855](../../server.py#L3855) |
| GET | `/api/admin/route` | `admin_route` | 管理会话：X-Admin-Key | [server.py:3868](../../server.py#L3868) |
| POST | `/api/admin/accounts/{name}/prefer` | `admin_account_prefer` | 管理会话：X-Admin-Key | [server.py:3874](../../server.py#L3874) |
| POST | `/api/admin/accounts/{name}/weight` | `admin_account_weight` | 管理会话：X-Admin-Key | [server.py:3884](../../server.py#L3884) |
| POST | `/api/admin/accounts/rebalance-proxies` | `admin_rebalance_proxies` | 管理会话：X-Admin-Key | [server.py:3894](../../server.py#L3894) |
| POST | `/api/admin/accounts/bind-proxies` | `admin_bind_proxies` | 管理会话：X-Admin-Key | [server.py:3904](../../server.py#L3904) |
| POST | `/api/admin/accounts/export-cookies` | `admin_export_cookies` | 管理会话：X-Admin-Key | [server.py:3915](../../server.py#L3915) |
| POST | `/api/admin/accounts/import-cookies` | `admin_import_cookies` | 管理会话：X-Admin-Key | [server.py:3938](../../server.py#L3938) |
| POST | `/api/admin/accounts/import-accounts` | `admin_import_accounts` | 管理会话：X-Admin-Key | [server.py:3959](../../server.py#L3959) |
| GET | `/api/admin/proxies` | `admin_proxies` | 管理会话：X-Admin-Key | [server.py:4011](../../server.py#L4011) |
| POST | `/api/admin/proxies` | `admin_proxy_create` | 管理会话：X-Admin-Key | [server.py:4017](../../server.py#L4017) |
| PATCH | `/api/admin/proxies/{proxy_id}` | `admin_proxy_update` | 管理会话：X-Admin-Key | [server.py:4039](../../server.py#L4039) |
| POST | `/api/admin/proxies/{proxy_id}/password` | `admin_proxy_password` | 管理会话：X-Admin-Key | [server.py:4053](../../server.py#L4053) |
| DELETE | `/api/admin/proxies/{proxy_id}` | `admin_proxy_delete` | 管理会话：X-Admin-Key | [server.py:4066](../../server.py#L4066) |
| POST | `/api/admin/proxies/delete-batch` | `admin_proxy_delete_batch` | 管理会话：X-Admin-Key | [server.py:4078](../../server.py#L4078) |
| POST | `/api/admin/proxies/{proxy_id}/probe` | `admin_proxy_probe` | 管理会话：X-Admin-Key | [server.py:4123](../../server.py#L4123) |
| POST | `/api/admin/proxies/{proxy_id}/nodes/{node_id}/probe` | `admin_proxy_node_probe` | 管理会话：X-Admin-Key | [server.py:4137](../../server.py#L4137) |
| GET | `/api/admin/proxies/{proxy_id}/nodes` | `admin_proxy_nodes` | 管理会话：X-Admin-Key | [server.py:4147](../../server.py#L4147) |
| POST | `/api/admin/proxies/{proxy_id}/nodes` | `admin_proxy_add_nodes` | 管理会话：X-Admin-Key | [server.py:4162](../../server.py#L4162) |
| POST | `/api/admin/proxies/{proxy_id}/refresh-nodes` | `admin_proxy_refresh_nodes` | 管理会话：X-Admin-Key | [server.py:4174](../../server.py#L4174) |
| POST | `/api/admin/proxies/{proxy_id}/prune-nodes` | `admin_proxy_prune_nodes` | 管理会话：X-Admin-Key | [server.py:4183](../../server.py#L4183) |
| POST | `/api/admin/accounts/{name}/rotate-ip` | `admin_account_rotate_ip` | 管理会话：X-Admin-Key | [server.py:4191](../../server.py#L4191) |
| POST | `/api/admin/accounts/{name}/probe-ip` | `admin_account_probe_ip` | 管理会话：X-Admin-Key | [server.py:4205](../../server.py#L4205) |
| POST | `/api/admin/proxies/{proxy_id}/rotate` | `admin_proxy_rotate_all` | 管理会话：X-Admin-Key | [server.py:4225](../../server.py#L4225) |
| GET | `/api/admin/users` | `admin_users` | 管理会话：X-Admin-Key | [server.py:4233](../../server.py#L4233) |
| POST | `/api/admin/users` | `admin_user_create` | 管理会话：X-Admin-Key | [server.py:4243](../../server.py#L4243) |
| PATCH | `/api/admin/users/{username}` | `admin_user_update` | 管理会话：X-Admin-Key | [server.py:4256](../../server.py#L4256) |
| POST | `/api/admin/users/delete-batch` | `admin_user_delete_batch` | 管理会话：X-Admin-Key | [server.py:4284](../../server.py#L4284) |
| DELETE | `/api/admin/users/{username}` | `admin_user_delete` | 管理会话：X-Admin-Key | [server.py:4305](../../server.py#L4305) |
| POST | `/api/admin/accounts` | `admin_account_add` | 管理会话：X-Admin-Key | [server.py:4453](../../server.py#L4453) |
| GET | `/api/admin/jobs` | `admin_jobs` | 管理会话：X-Admin-Key | [server.py:4512](../../server.py#L4512) |
| POST | `/api/admin/jobs/{name}/apple-answer` | `admin_apple_answer` | 管理会话：X-Admin-Key | [server.py:4518](../../server.py#L4518) |
| POST | `/api/admin/jobs/{name}/apple-cancel` | `admin_apple_cancel` | 管理会话：X-Admin-Key | [server.py:4533](../../server.py#L4533) |
| POST | `/api/admin/jobs/{name}/retry` | `admin_add_job_retry` | 管理会话：X-Admin-Key | [server.py:4563](../../server.py#L4563) |
| DELETE | `/api/admin/jobs/{name}` | `admin_add_job_delete` | 管理会话：X-Admin-Key | [server.py:4579](../../server.py#L4579) |
| GET | `/api/admin/settings/concurrency` | `admin_get_concurrency` | 管理会话：X-Admin-Key | [server.py:4677](../../server.py#L4677) |
| PATCH | `/api/admin/settings/concurrency` | `admin_set_concurrency` | 管理会话：X-Admin-Key | [server.py:4683](../../server.py#L4683) |
| GET | `/api/admin/tasks` | `admin_tasks` | 管理会话：X-Admin-Key | [server.py:4694](../../server.py#L4694) |
| GET | `/api/admin/videos` | `admin_videos` | 管理会话：X-Admin-Key | [server.py:4725](../../server.py#L4725) |
| DELETE | `/api/admin/videos/{task_id}` | `admin_video_delete` | 管理会话：X-Admin-Key | [server.py:4787](../../server.py#L4787) |
| POST | `/api/admin/tasks/delete-batch` | `admin_task_delete_batch` | 管理会话：X-Admin-Key | [server.py:4798](../../server.py#L4798) |
| GET | `/api/admin/stats` | `admin_stats` | 管理会话：X-Admin-Key | [server.py:4815](../../server.py#L4815) |
| GET | `/api/admin/keys` | `admin_keys` | 管理会话：X-Admin-Key | [server.py:4831](../../server.py#L4831) |
| POST | `/api/admin/keys` | `admin_key_create` | 管理会话：X-Admin-Key | [server.py:4853](../../server.py#L4853) |
| PATCH | `/api/admin/keys/{key}` | `admin_key_patch` | 管理会话：X-Admin-Key | [server.py:4866](../../server.py#L4866) |
| POST | `/api/admin/keys/delete-batch` | `admin_key_delete_batch` | 管理会话：X-Admin-Key | [server.py:4889](../../server.py#L4889) |
| DELETE | `/api/admin/keys/{key}` | `admin_key_delete` | 管理会话：X-Admin-Key | [server.py:4903](../../server.py#L4903) |
| POST | `/v1/video/contents/generations/tasks` | `ark_create_task` | 业务 API：Bearer（无有效密钥配置时匿名） | [server.py:2745](../../server.py#L2745) |
| GET | `/v1/video/contents/generations/tasks/{task_id}` | `ark_get_task` | 业务 API：Bearer（无有效密钥配置时匿名） | [server.py:2831](../../server.py#L2831) |
| POST | `/api/v3/contents/generations/tasks` | `ark_create_task` | 业务 API：Bearer（无有效密钥配置时匿名） | [server.py:2745](../../server.py#L2745) |
| GET | `/api/v3/contents/generations/tasks/{task_id}` | `ark_get_task` | 业务 API：Bearer（无有效密钥配置时匿名） | [server.py:2831](../../server.py#L2831) |
| POST | `/v1/contents/generations/tasks` | `ark_create_task` | 业务 API：Bearer（无有效密钥配置时匿名） | [server.py:2745](../../server.py#L2745) |
| GET | `/v1/contents/generations/tasks/{task_id}` | `ark_get_task` | 业务 API：Bearer（无有效密钥配置时匿名） | [server.py:2831](../../server.py#L2831) |
| POST | `/seedance/v3/contents/generations/tasks` | `ark_create_task` | 业务 API：Bearer（无有效密钥配置时匿名） | [server.py:2745](../../server.py#L2745) |
| GET | `/seedance/v3/contents/generations/tasks/{task_id}` | `ark_get_task` | 业务 API：Bearer（无有效密钥配置时匿名） | [server.py:2831](../../server.py#L2831) |

静态挂载另有 `/videos`、`/thumbs`、`/`；FastAPI 默认文档路由也不在装饰器清单中。运行环境若另加反向代理规则，以实际可达面为准。
