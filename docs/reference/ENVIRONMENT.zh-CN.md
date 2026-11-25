# 环境变量源码索引

源码核对基线：`ca41dcb26376b0e1a0db35341c2881cdb124447a`。本附录由静态 AST 提取；不启动服务、不读取运行配置或数据库。

[返回完整项目解说](../PROJECT-GUIDE.zh-CN.md)。源码行号对应生成时的文件；后续修改后应重新生成。

共 **161 个静态名称**。仅提取生产 Python 源码中直接出现的 `os.getenv` / `os.environ.get`；动态名称、Shell/JS 变量和直接下标读取不保证完整覆盖。

表内是读取时的**默认参数表达式**，不是最终生效配置：外层类型转换、上下限、平台探测、数据库保存值和运行期设置可能继续修改它。未提供默认参数通常返回 `None`；不同读取点可能有不同默认值。路径相对服务进程工作目录。绝未读取当前机器的环境值。

| 环境变量 | 默认参数表达式及读取点 |
| --- | --- |
| `CLOAKBROWSER_CACHE_DIR` | `''` — [config.py:139](../../config.py#L139) |
| `CLOAKBROWSER_LICENSE_KEY` | `''` — [config.py:138](../../config.py#L138) |
| `DOLA_30S_CAP_GRACE_SECONDS` | `'600'` — [config.py:516](../../config.py#L516) |
| `DOLA_30S_MODE` | `''` — [config.py:182](../../config.py#L182) |
| `DOLA_30S_TIMEOUT_MAX` | `'7200'` — [config.py:488](../../config.py#L488) |
| `DOLA_ABNORMAL_COOLDOWN_SEC` | `'1800'` — [config.py:433](../../config.py#L433) |
| `DOLA_ACCOUNT_DB_PATH` | `os.getenv(_LEGACY_ACCOUNT_DB_ENV, 'pool_usage.db')` — [config.py:95](../../config.py#L95) |
| `DOLA_ADMIN_KEY` | `''` — [config.py:119](../../config.py#L119) |
| `DOLA_ALLOW_30S_PAIR` | `'0'` — [config.py:173](../../config.py#L173) |
| `DOLA_API_KEYS` | `''` — [config.py:33](../../config.py#L33) |
| `DOLA_BROWSER_PREAUTH_PROXY_HOSTS` | `''` — [http_auth_relay.py:22](../../http_auth_relay.py#L22) |
| `DOLA_CDP_URL` | `DEFAULT_CDP_URL` — [protocol/dola_pure_api.py:4570](../../protocol/dola_pure_api.py#L4570) |
| `DOLA_CLOAK_GEOIP` | `'0'` — [config.py:137](../../config.py#L137) |
| `DOLA_CLOAK_HEADLESS` | `'0'` — [config.py:135](../../config.py#L135) |
| `DOLA_CLOAK_HUMANIZE` | `'0'` — [config.py:136](../../config.py#L136) |
| `DOLA_CLOAK_RETRY` | `'1'` — [config.py:144](../../config.py#L144) |
| `DOLA_CONFIRM_ADULT` | `'0'` — [login_steps.py:106](../../login_steps.py#L106) |
| `DOLA_COOKIE_PROFILE_SUBDIR` | `'cloak-profile'` — [config.py:134](../../config.py#L134) |
| `DOLA_COOKIE_RUNTIME` | `'pure'` — [config.py:131](../../config.py#L131) |
| `DOLA_CORS_ORIGINS` | `'*'` — [server.py:110](../../server.py#L110) |
| `DOLA_CRED_KEY` | `未提供默认参数` — [cred_store.py:13](../../cred_store.py#L13) |
| `DOLA_DAILY_LIMIT` | `'4'` — [config.py:192](../../config.py#L192) |
| `DOLA_DB_PATH` | `'tasks.db'` — [config.py:68](../../config.py#L68)<br>`'tasks.db'` — [config.py:89](../../config.py#L89) |
| `DOLA_DEFAULT_BIRTHDATE` | `DEFAULT_BIRTHDATE` — [birth_confirmation.py:16](../../birth_confirmation.py#L16) |
| `DOLA_DEFAULT_REFERENCE_SOURCE` | `'ai_generated'` — [config.py:60](../../config.py#L60) |
| `DOLA_DEPLOY_MODE` | `''` — [config.py:72](../../config.py#L72) |
| `DOLA_DOWNLOAD_DIR` | `'downloads'` — [config.py:106](../../config.py#L106) |
| `DOLA_DOWNLOAD_MAX_BYTES` | `str(20 * 1024 * 1024 * 1024)` — [config.py:363](../../config.py#L363) |
| `DOLA_DURATION_COSTS` | `''` — [config.py:245](../../config.py#L245) |
| `DOLA_DYNAMIC_ROTATE_MIN_INTERVAL` | `'60'` — [proxy_store.py:60](../../proxy_store.py#L60) |
| `DOLA_DYNAMIC_STICKY_TTL` | `'0'` — [proxy_store.py:65](../../proxy_store.py#L65) |
| `DOLA_EDGE_FINGERPRINT` | `'1'` — [config.py:127](../../config.py#L127) |
| `DOLA_EGRESS_AUTO_ROTATE_GAP` | `'120'` — [config.py:410](../../config.py#L410) |
| `DOLA_EGRESS_PRECHECK` | `'1'` — [config.py:408](../../config.py#L408) |
| `DOLA_EGRESS_SHARE_WARN` | `'3'` — [config.py:429](../../config.py#L429) |
| `DOLA_EGRESS_THROTTLE_MAX_SECONDS` | `'900'` — [config.py:419](../../config.py#L419) |
| `DOLA_EGRESS_THROTTLE_MAX_WAIT_SECONDS` | `'600'` — [config.py:427](../../config.py#L427) |
| `DOLA_EGRESS_THROTTLE_MIN_ACCOUNTS` | `'1' if COOKIE_RUNTIME == 'cloak' else '2'` — [config.py:415](../../config.py#L415) |
| `DOLA_EGRESS_THROTTLE_RESET_SECONDS` | `'1800'` — [config.py:421](../../config.py#L421) |
| `DOLA_EGRESS_THROTTLE_ROTATE` | `'0' if COOKIE_RUNTIME == 'cloak' else '1'` — [config.py:423](../../config.py#L423) |
| `DOLA_EGRESS_THROTTLE_SECONDS` | `'120'` — [config.py:411](../../config.py#L411) |
| `DOLA_EGRESS_THROTTLE_WINDOW_SECONDS` | `'600'` — [config.py:418](../../config.py#L418) |
| `DOLA_ENV_FILE` | `未提供默认参数` — [config.py:13](../../config.py#L13) |
| `DOLA_ETA_DEFAULT_SECONDS` | `'420'` — [config.py:366](../../config.py#L366) |
| `DOLA_EXTENSION_DIR` | `'extensions/dola30'` — [config.py:123](../../config.py#L123) |
| `DOLA_EXTENSION_ENABLED` | `'1'` — [config.py:124](../../config.py#L124) |
| `DOLA_EXTRACT_NODE_TTL` | `'300'` — [proxy_store.py:52](../../proxy_store.py#L52) |
| `DOLA_EXTRACT_TIMEOUT` | `'30'` — [proxy_store.py:56](../../proxy_store.py#L56) |
| `DOLA_FAIL_SCORE_CAP` | `'0'` — [config.py:395](../../config.py#L395) |
| `DOLA_FAL_KEY` | `''` — [upscale.py:40](../../upscale.py#L40) |
| `DOLA_FAL_UPSCALE_MODEL` | `'fal-ai/bytedance-upscaler/upscale/video'` — [upscale.py:23](../../upscale.py#L23) |
| `DOLA_GENERATION_FAILURE_RETRIES` | `'2'` — [config.py:53](../../config.py#L53) |
| `DOLA_HEADLESS` | `'1'` — [config.py:113](../../config.py#L113) |
| `DOLA_HELLO_PROBE_CACHE_SECONDS` | `'300'` — [config.py:444](../../config.py#L444) |
| `DOLA_HELLO_PROBE_CONCURRENCY` | `'1'` — [server.py:187](../../server.py#L187) |
| `DOLA_HELLO_PROBE_INTERVAL` | `'3'` — [server.py:189](../../server.py#L189) |
| `DOLA_HELLO_PROBE_PROMPT` | `'你好'` — [config.py:441](../../config.py#L441) |
| `DOLA_HELLO_PROBE_RETRY_WAIT` | `'4.0'` — [server.py:191](../../server.py#L191) |
| `DOLA_HELLO_PROBE_SUBMIT_GAP_SECONDS` | `'15'` — [config.py:449](../../config.py#L449) |
| `DOLA_HELLO_PROBE_TIMEOUT` | `'60'` — [config.py:446](../../config.py#L446) |
| `DOLA_HIGH_BITRATE_ATTEMPTS` | `'3'` — [config.py:82](../../config.py#L82) |
| `DOLA_IMAGE_TIMEOUT` | `'240'` — [config.py:521](../../config.py#L521) |
| `DOLA_ISOLATE_SHARED_EGRESS` | `'1' if COOKIE_RUNTIME == 'cloak' else '0'` — [config.py:390](../../config.py#L390) |
| `DOLA_LIMIT_RESET_HOUR` | `'0'` — [config.py:164](../../config.py#L164) |
| `DOLA_LIMIT_RESET_TZ` | `'UTC'` — [config.py:153](../../config.py#L153) |
| `DOLA_LOGIN_CONCURRENCY` | `''` — [login_concurrency.py:20](../../login_concurrency.py#L20) |
| `DOLA_LOGIN_READY_TIMEOUT` | `'90'` — [login_readiness.py:13](../../login_readiness.py#L13) |
| `DOLA_LOGIN_STATE_FILE` | `str(DEFAULT_9555_LOGIN_SESSION_FILE)` — [protocol/dola_pure_api.py:4572](../../protocol/dola_pure_api.py#L4572) |
| `DOLA_MAX_CONCURRENCY` | `'0'` — [config.py:38](../../config.py#L38) |
| `DOLA_MAX_OPEN_ACCOUNTS` | `'0'` — [config.py:464](../../config.py#L464) |
| `DOLA_MAX_PENDING_TASKS` | `'100'` — [config.py:41](../../config.py#L41) |
| `DOLA_MAX_PROMPT_CHARS` | `'20000'` — [config.py:359](../../config.py#L359) |
| `DOLA_MAX_QUEUE_WAIT_SECONDS` | `'1800'` — [config.py:368](../../config.py#L368) |
| `DOLA_MIN_SUBMIT_INTERVAL_SECONDS` | `'15' if COOKIE_RUNTIME == 'cloak' else '0'` — [config.py:452](../../config.py#L452) |
| `DOLA_NATIVE_DURATION_MAX` | `'0'` — [config.py:325](../../config.py#L325) |
| `DOLA_NODE` | `未提供默认参数` — [pure_signer.py:73](../../pure_signer.py#L73) |
| `DOLA_NO_ACK_SECONDS` | `'300'` — [config.py:437](../../config.py#L437) |
| `DOLA_PAIR_MIN_SEGMENT_SECONDS` | `'13'` — [config.py:189](../../config.py#L189) |
| `DOLA_PAIR_SEGMENT_SECONDS` | `'30'` — [config.py:187](../../config.py#L187) |
| `DOLA_PORT` | `'8000'` — [config.py:30](../../config.py#L30) |
| `DOLA_PORTRAIT_RETRIES` | `'3'` — [config.py:57](../../config.py#L57) |
| `DOLA_PREPARE_TIMEOUT` | `'180'` — [config.py:46](../../config.py#L46) |
| `DOLA_PROBE_INTERVAL_SECONDS` | `'120'` — [config.py:461](../../config.py#L461) |
| `DOLA_PROXY` | `'http://127.0.0.1:7890'` — [config.py:110](../../config.py#L110)<br>`未提供默认参数` — [protocol/dola_pure_api.py:808](../../protocol/dola_pure_api.py#L808)<br>`''` — [protocol/dola_pure_api.py:3982](../../protocol/dola_pure_api.py#L3982)<br>`''` — [protocol/dola_pure_api.py:4118](../../protocol/dola_pure_api.py#L4118)<br>`''` — [protocol/dola_pure_api.py:4284](../../protocol/dola_pure_api.py#L4284) |
| `DOLA_PUBLIC_BASE` | `f'http://127.0.0.1:{PORT}'` — [config.py:116](../../config.py#L116) |
| `DOLA_PURE_API` | `'1'` — [config.py:473](../../config.py#L473) |
| `DOLA_PURE_PC_VERSION` | `'3.33.11'` — [config.py:476](../../config.py#L476) |
| `DOLA_PURE_POLL_INTERVAL` | `'30'` — [config.py:517](../../config.py#L517) |
| `DOLA_PURE_REGION` | `'JP'` — [config.py:475](../../config.py#L475) |
| `DOLA_PURE_REMOVE_WATERMARK` | `'0'` — [config.py:480](../../config.py#L480) |
| `DOLA_PURE_TIMEOUT` | `'900'` — [config.py:482](../../config.py#L482) |
| `DOLA_PURE_TIMEOUT_MAX` | `'3600'` — [config.py:486](../../config.py#L486) |
| `DOLA_RECOVER_INTERVAL_SECONDS` | `'120'` — [config.py:502](../../config.py#L502) |
| `DOLA_RECOVER_TIMEOUT_SECONDS` | `'10800'` — [config.py:500](../../config.py#L500) |
| `DOLA_REFERENCE_DOWNLOAD_TIMEOUT` | `'60'` — [config.py:342](../../config.py#L342) |
| `DOLA_REFERENCE_FILE_DIR` | `'refs'` — [config.py:345](../../config.py#L345) |
| `DOLA_REFERENCE_IMAGE_MAX_BYTES` | `str(20 * 1024 * 1024)` — [config.py:341](../../config.py#L341) |
| `DOLA_REFERENCE_IMAGE_MAX_COUNT` | `'30'` — [config.py:343](../../config.py#L343) |
| `DOLA_REFERENCE_THUMB_COUNT` | `'1'` — [config.py:351](../../config.py#L351) |
| `DOLA_REFERENCE_THUMB_MAX_PX` | `'160'` — [config.py:352](../../config.py#L352) |
| `DOLA_REFERENCE_THUMB_QUALITY` | `'80'` — [config.py:353](../../config.py#L353) |
| `DOLA_REFERENCE_TOTAL_MAX_BYTES` | `str(60 * 1024 * 1024)` — [config.py:356](../../config.py#L356) |
| `DOLA_REFERENCE_UPLOAD_DIRECT_FALLBACK` | `'1'` — [config.py:379](../../config.py#L379) |
| `DOLA_REFERENCE_VIDEO_TIMEOUT` | `'900'` — [config.py:375](../../config.py#L375) |
| `DOLA_RESUME_POLL_SECONDS` | `'60'` — [config.py:496](../../config.py#L496) |
| `DOLA_SIGNER_PROCESSES` | `''` — [pure_signer.py:38](../../pure_signer.py#L38) |
| `DOLA_SIGN_FALLBACK_CONCURRENCY` | `'2'` — [pure_signer.py:42](../../pure_signer.py#L42) |
| `DOLA_SIGN_MAX_CONSECUTIVE_TIMEOUTS` | `'3'` — [pure_signer.py:40](../../pure_signer.py#L40) |
| `DOLA_SIGN_RECYCLE_AFTER` | `'500'` — [pure_signer.py:30](../../pure_signer.py#L30) |
| `DOLA_SIGN_TIMEOUT` | `'15'` — [pure_signer.py:28](../../pure_signer.py#L28) |
| `DOLA_STALE_TASK_SECONDS` | `'600'` — [config.py:370](../../config.py#L370) |
| `DOLA_STALL_REPLY_SECONDS` | `'180'` — [config.py:86](../../config.py#L86) |
| `DOLA_TASK_DEADLINE` | `'600'` — [config.py:48](../../config.py#L48) |
| `DOLA_TASK_RETENTION_DAYS` | `'14'` — [config.py:361](../../config.py#L361) |
| `DOLA_THREAD_POOL_MAX` | `'0'` — [config.py:468](../../config.py#L468) |
| `DOLA_THROTTLE_ACCOUNT_COOLDOWN_MAX_SECONDS` | `'28800'` — [config.py:510](../../config.py#L510) |
| `DOLA_THROTTLE_ACCOUNT_COOLDOWN_SECONDS` | `'1800'` — [config.py:506](../../config.py#L506) |
| `DOLA_THROTTLE_ACCOUNT_STREAK_RESET_SECONDS` | `'86400'` — [config.py:512](../../config.py#L512) |
| `DOLA_THUMB_DIR` | `'thumbs'` — [config.py:350](../../config.py#L350) |
| `DOLA_TRANSIENT_COOLDOWN_SEC` | `'600'` — [config.py:400](../../config.py#L400) |
| `DOLA_UPDATE_AGENT_TIMEOUT` | `'600'` — [config.py:71](../../config.py#L71) |
| `DOLA_UPDATE_CHECK_TTL` | `'600'` — [config.py:69](../../config.py#L69) |
| `DOLA_UPDATE_DIR` | `''` — [config.py:67](../../config.py#L67) |
| `DOLA_UPDATE_IDLE_TIMEOUT` | `'1800'` — [config.py:70](../../config.py#L70) |
| `DOLA_UPDATE_REPO` | `''` — [config.py:66](../../config.py#L66) |
| `DOLA_UPLOAD_PROXY_BYPASS` | `'*.bytevcloudapi.com,*.vodupload.com'` — [config.py:384](../../config.py#L384) |
| `DOLA_UPLOAD_RETRIES` | `'3'` — [config.py:63](../../config.py#L63) |
| `DOLA_UPSCALE_AUTO` | `'off'` — [upscale.py:50](../../upscale.py#L50) |
| `DOLA_UPSCALE_CONCURRENCY` | `'2'` — [config.py:76](../../config.py#L76) |
| `DOLA_UPSCALE_DELIVERY` | `'download'` — [upscale.py:47](../../upscale.py#L47) |
| `DOLA_UPSCALE_OPEN_TOKEN` | `''` — [upscale.py:45](../../upscale.py#L45) |
| `DOLA_UPSCALE_OPEN_URL` | `''` — [upscale.py:44](../../upscale.py#L44) |
| `DOLA_UPSCALE_POLL_SECONDS` | `'8'` — [config.py:78](../../config.py#L78) |
| `DOLA_UPSCALE_PROVIDER` | `'fal'` — [upscale.py:38](../../upscale.py#L38) |
| `DOLA_UPSCALE_TIMEOUT` | `'1800'` — [config.py:77](../../config.py#L77) |
| `DOLA_V20_DURATIONS` | `'5,10'` — [config.py:289](../../config.py#L289) |
| `DOLA_V20_START_POINTS` | `'2'` — [config.py:286](../../config.py#L286) |
| `DOLA_V20_WAIT_SECONDS` | `'600'` — [config.py:458](../../config.py#L458) |
| `DOLA_VERIFY_CHAT_PROBE` | `'1'` — [config.py:148](../../config.py#L148) |
| `DOLA_VERIFY_CHAT_PROMPT` | `'你好'` — [config.py:149](../../config.py#L149) |
| `DOLA_VERIFY_CHAT_WINDOW` | `'30'` — [config.py:150](../../config.py#L150) |
| `DOLA_VIDEO_DELIVERY` | `'download'` — [config.py:103](../../config.py#L103) |
| `DOLA_VIDEO_MAX_ATTEMPTS` | `'0'` — [config.py:50](../../config.py#L50) |
| `DOLA_VIDEO_REQUIRED_POINTS` | `'2'` — [config.py:167](../../config.py#L167) |
| `DOLA_VIDEO_TIMEOUT` | `'300'` — [config.py:44](../../config.py#L44) |
| `DOLA_WAIT_FACTOR` | `'1.5'` — [config.py:492](../../config.py#L492) |
| `DOLA_WAIT_HARD_MAX` | `'21600'` — [config.py:494](../../config.py#L494) |
| `DOLA_WAIT_MARGIN_SECONDS` | `'1800'` — [config.py:493](../../config.py#L493) |
| `DOLA_WATCHDOG_INTERVAL_SECONDS` | `'60'` — [config.py:372](../../config.py#L372) |
| `DOLA_WORK_15S` | `'0'` — [config.py:311](../../config.py#L311) |
| `DOLA_WORK_15S_CONCURRENCY` | `'2'` — [config.py:297](../../config.py#L297) |
| `DOLA_WORK_15S_TIMEOUT` | `'1500'` — [config.py:296](../../config.py#L296) |
| `DOLA_WORK_RETRY_SECONDS` | `'1800'` — [config.py:300](../../config.py#L300) |
| `DOUBAO_ALLOW_PAID` | `'1'` — [config.py:526](../../config.py#L526) |
| `DOUBAO_AUTO_NO_WATERMARK` | `'1'` — [config.py:533](../../config.py#L533) |
| `DOUBAO_DAILY_LIMIT` | `'999'` — [config.py:529](../../config.py#L529) |
| `DOUBAO_POLL_INTERVAL` | `'10'` — [config.py:535](../../config.py#L535) |
| `DOUBAO_SIGNER_PROCESSES` | `'2'` — [pure_signer.py:517](../../pure_signer.py#L517) |
| `HTTPS_PROXY` | `未提供默认参数` — [protocol/dola_pure_api.py:808](../../protocol/dola_pure_api.py#L808) |
| `HTTP_PROXY` | `未提供默认参数` — [protocol/dola_pure_api.py:808](../../protocol/dola_pure_api.py#L808) |
| `STUDIO_TRACE_DIR` | `未提供默认参数` — [generation_trace.py:15](../../generation_trace.py#L15) |
