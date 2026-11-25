# Dola Studio 部署命名整理

日期：2026-11-25。

部署模板中的产品标识已统一使用 Dola Studio，文件系统及 systemd 标识使用 `dola-studio`。模板内的工作目录、日志目录、健康检查状态文件、重启目标及服务依赖均同步更新。

模板文件：`deploy/dola-studio.service`、`deploy/dola-studio-health.service`、`deploy/dola-studio-health.timer`。补齐了此前部署手册引用但源码快照中缺失的 timer，仍为每两分钟执行一次健康检查。

本次没有安装这些模板到 `/etc/systemd/system/`，没有迁移生产运行目录，没有启用新看门狗，没有重启线上服务。当前站点继续使用原运行配置，避免仅因改名影响已有账号、代理或任务。

协议与测试文件中重复的来源注释改为指向根目录 `THIRD_PARTY_NOTICES.md`；中央说明保留第三方实际来源。Python 可执行 AST 与修改前一致，未把这些衍生代码声明为自研。原始根目录 LICENSE 保持不变，自研贡献仍使用 CUSTOM_LICENSE.md 中的 Dola Studio 署名。

1.0.1 的新 Cookie 导出标识为 `dola-studio-cookies-v1`，批量文件名为 `dola-studio-cookies.zip`。Cookie 字段结构保持不变，导入器仍可读取历史导出。账号数据库新配置键为 `DOLA_ACCOUNT_DB_PATH`，优先于原配置键；旧配置读取和默认数据库文件名保持兼容。

安装与更新脚本的默认目录、服务、备份目录和更新配置改为 `dola-studio` 命名，默认仓库为 `sailsships/dola-studio`。已有实例使用更新脚本前，应显式指定实际目录、服务与配置路径，不能把新的模板默认值当成生产服务已改名。尚未建立完整私有仓库 release 与更新验收流程。

部署手册已明确这是历史环境模板、尚未完成从零安装验收，并列明源码包中缺失的其他环境示例，避免被误认为可以直接部署的完整安装器。
