# 环境变量源码索引

源码核对基线：`7212e56e14c8b695e1c51e102ccf224a61ae1814`。本附录由静态 AST 提取；不启动服务、不读取运行配置或数据库。

[返回完整项目解说](../PROJECT-GUIDE.zh-CN.md)。源码行号对应生成时的文件；后续修改后应重新生成。

共 **161 个静态名称**。仅提取生产 Python 源码中直接出现的 `os.getenv` / `os.environ.get`；动态名称、Shell/JS 变量和直接下标读取不保证完整覆盖。

表内是读取时的**默认参数表达式**，不是最终生效配置：外层类型转换、上下限、平台探测、数据库保存值和运行期设置可能继续修改它。未提供默认参数通常返回 `None`；不同读取点可能有不同默认值。路径相对服务进程工作目录。绝未读取当前机器的环境值。

| 环境变量 | 默认参数表达式及读取点 |
| --- | --- |
| `CLOAKBROWSER_CACHE_DIR` | `''` — [config.py:135](../../config.py#L135) |
| `CLOAKBROWSER_LICENSE_KEY` | `''` — [config.py:134](../../config.py#L134) |
| `DOLA_30S_CAP_GRACE_SECONDS` | `'600'` — [config.py:512](../../config.py#L512) |
| `DOLA_30S_MODE` | `''` — [config.py:178](../../config.py#L178) |
| `DOLA_30S_TIMEOUT_MAX` | `'7200'` — [config.py:484](../../config.py#L484) |
| `DOLA_ABNORMAL_COOLDOWN_SEC` | `'1800'` — [config.py:429](../../config.py#L429) |
| `DOLA_ADMIN_KEY` | `''` — [config.py:115](../../config.py#L115) |
| `DOLA_ALLOW_30S_PAIR` | `'0'` — [config.py:169](../../config.py#L169) |
| `DOLA_API_KEYS` | `''` — [config.py:33](../../config.py#L33) |
| `DOLA_BROWSER_PREAUTH_PROXY_HOSTS` | `''` — [http_auth_relay.py:22](../../http_auth_relay.py#L22) |
| `DOLA_CDP_URL` | `DEFAULT_CDP_URL` — [protocol/dola_pure_api.py:4570](../../protocol/dola_pure_api.py#L4570) |
| `DOLA_CLOAK_GEOIP` | `'0'` — [config.py:133](../../config.py#L133) |
| `DOLA_CLOAK_HEADLESS` | `'0'` — [config.py:131](../../config.py#L131) |
| `DOLA_CLOAK_HUMANIZE` | `'0'` — [config.py:132](../../config.py#L132) |
| `DOLA_CLOAK_RETRY` | `'1'` — [config.py:140](../../config.py#L140) |
| `DOLA_CONFIRM_ADULT` | `'0'` — [login_steps.py:106](../../login_steps.py#L106) |
| `DOLA_COOKIE_PROFILE_SUBDIR` | `'cloak-profile'` — [config.py:130](../../config.py#L130) |
| `DOLA_COOKIE_RUNTIME` | `'pure'` — [config.py:127](../../config.py#L127) |
| `DOLA_CORS_ORIGINS` | `'*'` — [server.py:110](../../server.py#L110) |
| `DOLA_CRED_KEY` | `未提供默认参数` — [cred_store.py:13](../../cred_store.py#L13) |
| `DOLA_DAILY_LIMIT` | `'4'` — [config.py:188](../../config.py#L188) |
| `DOLA_DB_PATH` | `'tasks.db'` — [config.py:68](../../config.py#L68)<br>`'tasks.db'` — [config.py:89](../../config.py#L89) |
| `DOLA_DEFAULT_BIRTHDATE` | `DEFAULT_BIRTHDATE` — [birth_confirmation.py:16](../../birth_confirmation.py#L16) |
| `DOLA_DEFAULT_REFERENCE_SOURCE` | `'ai_generated'` — [config.py:60](../../config.py#L60) |
| `DOLA_DEPLOY_MODE` | `''` — [config.py:72](../../config.py#L72) |
| `DOLA_DOWNLOAD_DIR` | `'downloads'` — [config.py:102](../../config.py#L102) |
| `DOLA_DOWNLOAD_MAX_BYTES` | `str(20 * 1024 * 1024 * 1024)` — [config.py:359](../../config.py#L359) |
| `DOLA_DURATION_COSTS` | `''` — [config.py:241](../../config.py#L241) |
| `DOLA_DYNAMIC_ROTATE_MIN_INTERVAL` | `'60'` — [proxy_store.py:60](../../proxy_store.py#L60) |
| `DOLA_DYNAMIC_STICKY_TTL` | `'0'` — [proxy_store.py:65](../../proxy_store.py#L65) |
| `DOLA_EDGE_FINGERPRINT` | `'1'` — [config.py:123](../../config.py#L123) |
| `DOLA_EGRESS_AUTO_ROTATE_GAP` | `'120'` — [config.py:406](../../config.py#L406) |
| `DOLA_EGRESS_PRECHECK` | `'1'` — [config.py:404](../../config.py#L404) |
| `DOLA_EGRESS_SHARE_WARN` | `'3'` — [config.py:425](../../config.py#L425) |
| `DOLA_EGRESS_THROTTLE_MAX_SECONDS` | `'900'` — [config.py:415](../../config.py#L415) |
| `DOLA_EGRESS_THROTTLE_MAX_WAIT_SECONDS` | `'600'` — [config.py:423](../../config.py#L423) |
| `DOLA_EGRESS_THROTTLE_MIN_ACCOUNTS` | `'1' if COOKIE_RUNTIME == 'cloak' else '2'` — [config.py:411](../../config.py#L411) |
| `DOLA_EGRESS_THROTTLE_RESET_SECONDS` | `'1800'` — [config.py:417](../../config.py#L417) |
| `DOLA_EGRESS_THROTTLE_ROTATE` | `'0' if COOKIE_RUNTIME == 'cloak' else '1'` — [config.py:419](../../config.py#L419) |
| `DOLA_EGRESS_THROTTLE_SECONDS` | `'120'` — [config.py:407](../../config.py#L407) |
| `DOLA_EGRESS_THROTTLE_WINDOW_SECONDS` | `'600'` — [config.py:414](../../config.py#L414) |
| `DOLA_ENV_FILE` | `未提供默认参数` — [config.py:13](../../config.py#L13) |
| `DOLA_ETA_DEFAULT_SECONDS` | `'420'` — [config.py:362](../../config.py#L362) |
| `DOLA_EXTENSION_DIR` | `'extensions/dola30'` — [config.py:119](../../config.py#L119) |
| `DOLA_EXTENSION_ENABLED` | `'1'` — [config.py:120](../../config.py#L120) |
| `DOLA_EXTRACT_NODE_TTL` | `'300'` — [proxy_store.py:52](../../proxy_store.py#L52) |
| `DOLA_EXTRACT_TIMEOUT` | `'30'` — [proxy_store.py:56](../../proxy_store.py#L56) |
| `DOLA_FAIL_SCORE_CAP` | `'0'` — [config.py:391](../../config.py#L391) |
| `DOLA_FAL_KEY` | `''` — [upscale.py:40](../../upscale.py#L40) |
| `DOLA_FAL_UPSCALE_MODEL` | `'fal-ai/bytedance-upscaler/upscale/video'` — [upscale.py:23](../../upscale.py#L23) |
| `DOLA_GENERATION_FAILURE_RETRIES` | `'2'` — [config.py:53](../../config.py#L53) |
| `DOLA_HEADLESS` | `'1'` — [config.py:109](../../config.py#L109) |
| `DOLA_HELLO_PROBE_CACHE_SECONDS` | `'300'` — [config.py:440](../../config.py#L440) |
| `DOLA_HELLO_PROBE_CONCURRENCY` | `'1'` — [server.py:187](../../server.py#L187) |
| `DOLA_HELLO_PROBE_INTERVAL` | `'3'` — [server.py:189](../../server.py#L189) |
| `DOLA_HELLO_PROBE_PROMPT` | `'你好'` — [config.py:437](../../config.py#L437) |
| `DOLA_HELLO_PROBE_RETRY_WAIT` | `'4.0'` — [server.py:191](../../server.py#L191) |
| `DOLA_HELLO_PROBE_SUBMIT_GAP_SECONDS` | `'15'` — [config.py:445](../../config.py#L445) |
| `DOLA_HELLO_PROBE_TIMEOUT` | `'60'` — [config.py:442](../../config.py#L442) |
| `DOLA_HIGH_BITRATE_ATTEMPTS` | `'3'` — [config.py:82](../../config.py#L82) |
| `DOLA_IMAGE_TIMEOUT` | `'240'` — [config.py:517](../../config.py#L517) |
| `DOLA_ISOLATE_SHARED_EGRESS` | `'1' if COOKIE_RUNTIME == 'cloak' else '0'` — [config.py:386](../../config.py#L386) |
| `DOLA_LIMIT_RESET_HOUR` | `'0'` — [config.py:160](../../config.py#L160) |
| `DOLA_LIMIT_RESET_TZ` | `'UTC'` — [config.py:149](../../config.py#L149) |
| `DOLA_LOGIN_CONCURRENCY` | `''` — [login_concurrency.py:20](../../login_concurrency.py#L20) |
| `DOLA_LOGIN_READY_TIMEOUT` | `'90'` — [login_readiness.py:13](../../login_readiness.py#L13) |
| `DOLA_LOGIN_STATE_FILE` | `str(DEFAULT_9555_LOGIN_SESSION_FILE)` — [protocol/dola_pure_api.py:4572](../../protocol/dola_pure_api.py#L4572) |
| `DOLA_MAX_CONCURRENCY` | `'0'` — [config.py:38](../../config.py#L38) |
| `DOLA_MAX_OPEN_ACCOUNTS` | `'0'` — [config.py:460](../../config.py#L460) |
| `DOLA_MAX_PENDING_TASKS` | `'100'` — [config.py:41](../../config.py#L41) |
| `DOLA_MAX_PROMPT_CHARS` | `'20000'` — [config.py:355](../../config.py#L355) |
| `DOLA_MAX_QUEUE_WAIT_SECONDS` | `'1800'` — [config.py:364](../../config.py#L364) |
| `DOLA_MIN_SUBMIT_INTERVAL_SECONDS` | `'15' if COOKIE_RUNTIME == 'cloak' else '0'` — [config.py:448](../../config.py#L448) |
| `DOLA_NATIVE_DURATION_MAX` | `'0'` — [config.py:321](../../config.py#L321) |
| `DOLA_NODE` | `未提供默认参数` — [pure_signer.py:73](../../pure_signer.py#L73) |
| `DOLA_NO_ACK_SECONDS` | `'300'` — [config.py:433](../../config.py#L433) |
| `DOLA_PAIR_MIN_SEGMENT_SECONDS` | `'13'` — [config.py:185](../../config.py#L185) |
| `DOLA_PAIR_SEGMENT_SECONDS` | `'30'` — [config.py:183](../../config.py#L183) |
| `DOLA_POOL_DB_PATH` | `'pool_usage.db'` — [config.py:92](../../config.py#L92) |
| `DOLA_PORT` | `'8000'` — [config.py:30](../../config.py#L30) |
| `DOLA_PORTRAIT_RETRIES` | `'3'` — [config.py:57](../../config.py#L57) |
| `DOLA_PREPARE_TIMEOUT` | `'180'` — [config.py:46](../../config.py#L46) |
| `DOLA_PROBE_INTERVAL_SECONDS` | `'120'` — [config.py:457](../../config.py#L457) |
| `DOLA_PROXY` | `'http://127.0.0.1:7890'` — [config.py:106](../../config.py#L106)<br>`未提供默认参数` — [protocol/dola_pure_api.py:808](../../protocol/dola_pure_api.py#L808)<br>`''` — [protocol/dola_pure_api.py:3982](../../protocol/dola_pure_api.py#L3982)<br>`''` — [protocol/dola_pure_api.py:4118](../../protocol/dola_pure_api.py#L4118)<br>`''` — [protocol/dola_pure_api.py:4284](../../protocol/dola_pure_api.py#L4284) |
| `DOLA_PUBLIC_BASE` | `f'http://127.0.0.1:{PORT}'` — [config.py:112](../../config.py#L112) |
| `DOLA_PURE_API` | `'1'` — [config.py:469](../../config.py#L469) |
| `DOLA_PURE_PC_VERSION` | `'3.33.11'` — [config.py:472](../../config.py#L472) |
| `DOLA_PURE_POLL_INTERVAL` | `'30'` — [config.py:513](../../config.py#L513) |
| `DOLA_PURE_REGION` | `'JP'` — [config.py:471](../../config.py#L471) |
| `DOLA_PURE_REMOVE_WATERMARK` | `'0'` — [config.py:476](../../config.py#L476) |
| `DOLA_PURE_TIMEOUT` | `'900'` — [config.py:478](../../config.py#L478) |
| `DOLA_PURE_TIMEOUT_MAX` | `'3600'` — [config.py:482](../../config.py#L482) |
| `DOLA_RECOVER_INTERVAL_SECONDS` | `'120'` — [config.py:498](../../config.py#L498) |
| `DOLA_RECOVER_TIMEOUT_SECONDS` | `'10800'` — [config.py:496](../../config.py#L496) |
| `DOLA_REFERENCE_DOWNLOAD_TIMEOUT` | `'60'` — [config.py:338](../../config.py#L338) |
| `DOLA_REFERENCE_FILE_DIR` | `'refs'` — [config.py:341](../../config.py#L341) |
| `DOLA_REFERENCE_IMAGE_MAX_BYTES` | `str(20 * 1024 * 1024)` — [config.py:337](../../config.py#L337) |
| `DOLA_REFERENCE_IMAGE_MAX_COUNT` | `'30'` — [config.py:339](../../config.py#L339) |
| `DOLA_REFERENCE_THUMB_COUNT` | `'1'` — [config.py:347](../../config.py#L347) |
| `DOLA_REFERENCE_THUMB_MAX_PX` | `'160'` — [config.py:348](../../config.py#L348) |
| `DOLA_REFERENCE_THUMB_QUALITY` | `'80'` — [config.py:349](../../config.py#L349) |
| `DOLA_REFERENCE_TOTAL_MAX_BYTES` | `str(60 * 1024 * 1024)` — [config.py:352](../../config.py#L352) |
| `DOLA_REFERENCE_UPLOAD_DIRECT_FALLBACK` | `'1'` — [config.py:375](../../config.py#L375) |
| `DOLA_REFERENCE_VIDEO_TIMEOUT` | `'900'` — [config.py:371](../../config.py#L371) |
| `DOLA_RESUME_POLL_SECONDS` | `'60'` — [config.py:492](../../config.py#L492) |
| `DOLA_SIGNER_PROCESSES` | `''` — [pure_signer.py:38](../../pure_signer.py#L38) |
| `DOLA_SIGN_FALLBACK_CONCURRENCY` | `'2'` — [pure_signer.py:42](../../pure_signer.py#L42) |
| `DOLA_SIGN_MAX_CONSECUTIVE_TIMEOUTS` | `'3'` — [pure_signer.py:40](../../pure_signer.py#L40) |
| `DOLA_SIGN_RECYCLE_AFTER` | `'500'` — [pure_signer.py:30](../../pure_signer.py#L30) |
| `DOLA_SIGN_TIMEOUT` | `'15'` — [pure_signer.py:28](../../pure_signer.py#L28) |
| `DOLA_STALE_TASK_SECONDS` | `'600'` — [config.py:366](../../config.py#L366) |
| `DOLA_STALL_REPLY_SECONDS` | `'180'` — [config.py:86](../../config.py#L86) |
| `DOLA_TASK_DEADLINE` | `'600'` — [config.py:48](../../config.py#L48) |
| `DOLA_TASK_RETENTION_DAYS` | `'14'` — [config.py:357](../../config.py#L357) |
| `DOLA_THREAD_POOL_MAX` | `'0'` — [config.py:464](../../config.py#L464) |
| `DOLA_THROTTLE_ACCOUNT_COOLDOWN_MAX_SECONDS` | `'28800'` — [config.py:506](../../config.py#L506) |
| `DOLA_THROTTLE_ACCOUNT_COOLDOWN_SECONDS` | `'1800'` — [config.py:502](../../config.py#L502) |
| `DOLA_THROTTLE_ACCOUNT_STREAK_RESET_SECONDS` | `'86400'` — [config.py:508](../../config.py#L508) |
| `DOLA_THUMB_DIR` | `'thumbs'` — [config.py:346](../../config.py#L346) |
| `DOLA_TRANSIENT_COOLDOWN_SEC` | `'600'` — [config.py:396](../../config.py#L396) |
| `DOLA_UPDATE_AGENT_TIMEOUT` | `'600'` — [config.py:71](../../config.py#L71) |
| `DOLA_UPDATE_CHECK_TTL` | `'600'` — [config.py:69](../../config.py#L69) |
| `DOLA_UPDATE_DIR` | `''` — [config.py:67](../../config.py#L67) |
| `DOLA_UPDATE_IDLE_TIMEOUT` | `'1800'` — [config.py:70](../../config.py#L70) |
| `DOLA_UPDATE_REPO` | `''` — [config.py:66](../../config.py#L66) |
| `DOLA_UPLOAD_PROXY_BYPASS` | `'*.bytevcloudapi.com,*.vodupload.com'` — [config.py:380](../../config.py#L380) |
| `DOLA_UPLOAD_RETRIES` | `'3'` — [config.py:63](../../config.py#L63) |
| `DOLA_UPSCALE_AUTO` | `'off'` — [upscale.py:50](../../upscale.py#L50) |
| `DOLA_UPSCALE_CONCURRENCY` | `'2'` — [config.py:76](../../config.py#L76) |
| `DOLA_UPSCALE_DELIVERY` | `'download'` — [upscale.py:47](../../upscale.py#L47) |
| `DOLA_UPSCALE_OPEN_TOKEN` | `''` — [upscale.py:45](../../upscale.py#L45) |
| `DOLA_UPSCALE_OPEN_URL` | `''` — [upscale.py:44](../../upscale.py#L44) |
| `DOLA_UPSCALE_POLL_SECONDS` | `'8'` — [config.py:78](../../config.py#L78) |
| `DOLA_UPSCALE_PROVIDER` | `'fal'` — [upscale.py:38](../../upscale.py#L38) |
| `DOLA_UPSCALE_TIMEOUT` | `'1800'` — [config.py:77](../../config.py#L77) |
| `DOLA_V20_DURATIONS` | `'5,10'` — [config.py:285](../../config.py#L285) |
| `DOLA_V20_START_POINTS` | `'2'` — [config.py:282](../../config.py#L282) |
| `DOLA_V20_WAIT_SECONDS` | `'600'` — [config.py:454](../../config.py#L454) |
| `DOLA_VERIFY_CHAT_PROBE` | `'1'` — [config.py:144](../../config.py#L144) |
| `DOLA_VERIFY_CHAT_PROMPT` | `'你好'` — [config.py:145](../../config.py#L145) |
| `DOLA_VERIFY_CHAT_WINDOW` | `'30'` — [config.py:146](../../config.py#L146) |
| `DOLA_VIDEO_DELIVERY` | `'download'` — [config.py:99](../../config.py#L99) |
| `DOLA_VIDEO_MAX_ATTEMPTS` | `'0'` — [config.py:50](../../config.py#L50) |
| `DOLA_VIDEO_REQUIRED_POINTS` | `'2'` — [config.py:163](../../config.py#L163) |
| `DOLA_VIDEO_TIMEOUT` | `'300'` — [config.py:44](../../config.py#L44) |
| `DOLA_WAIT_FACTOR` | `'1.5'` — [config.py:488](../../config.py#L488) |
| `DOLA_WAIT_HARD_MAX` | `'21600'` — [config.py:490](../../config.py#L490) |
| `DOLA_WAIT_MARGIN_SECONDS` | `'1800'` — [config.py:489](../../config.py#L489) |
| `DOLA_WATCHDOG_INTERVAL_SECONDS` | `'60'` — [config.py:368](../../config.py#L368) |
| `DOLA_WORK_15S` | `'0'` — [config.py:307](../../config.py#L307) |
| `DOLA_WORK_15S_CONCURRENCY` | `'2'` — [config.py:293](../../config.py#L293) |
| `DOLA_WORK_15S_TIMEOUT` | `'1500'` — [config.py:292](../../config.py#L292) |
| `DOLA_WORK_RETRY_SECONDS` | `'1800'` — [config.py:296](../../config.py#L296) |
| `DOUBAO_ALLOW_PAID` | `'1'` — [config.py:522](../../config.py#L522) |
| `DOUBAO_AUTO_NO_WATERMARK` | `'1'` — [config.py:529](../../config.py#L529) |
| `DOUBAO_DAILY_LIMIT` | `'999'` — [config.py:525](../../config.py#L525) |
| `DOUBAO_POLL_INTERVAL` | `'10'` — [config.py:531](../../config.py#L531) |
| `DOUBAO_SIGNER_PROCESSES` | `'2'` — [pure_signer.py:517](../../pure_signer.py#L517) |
| `HTTPS_PROXY` | `未提供默认参数` — [protocol/dola_pure_api.py:808](../../protocol/dola_pure_api.py#L808) |
| `HTTP_PROXY` | `未提供默认参数` — [protocol/dola_pure_api.py:808](../../protocol/dola_pure_api.py#L808) |
| `STUDIO_TRACE_DIR` | `未提供默认参数` — [generation_trace.py:15](../../generation_trace.py#L15) |
