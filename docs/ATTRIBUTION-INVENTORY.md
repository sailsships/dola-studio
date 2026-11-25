# 署名与来源清单

核对日期：2026-11-25。范围为本次交付源码快照；不包含虚拟环境中各依赖包完整的许可清单。

自研部分与产品品牌统一使用 **Dola Studio**。`CUSTOM_LICENSE.md` 中的中英文版权行均为 `Copyright (c) 2026 Dola Studio`；不再使用“定制版贡献者”或“custom-edition contributors”作为自研署名。

| 保留名称 | 出现位置 | 性质与处理 |
| --- | --- | --- |
| Roins-hub and contributors | 根目录 `LICENSE`；`THIRD_PARTY_NOTICES.md` | 基础项目 MIT 版权归属，保留原文。 |
| 基础项目原始来源 | `THIRD_PARTY_NOTICES.md` 中的[原始来源记录](https://github.com/sailsships/dola-studio/blob/7212e56e14c8b695e1c51e102ccf224a61ae1814/THIRD_PARTY_NOTICES.md) | 保留原仓库与兼容代码的准确来源，不改写为 Dola Studio 自研；当前安装和更新模板改为自有仓库，配置型自动更新默认关闭。 |
| 协议兼容与历史移植来源 | 根目录 `THIRD_PARTY_NOTICES.md` | 重复的注释来源集中到该文件，保持实际来源记录，不改写为自研作者。 |

部署模板中的产品目录、日志目录、服务名称现已统一使用 `dola-studio`，systemd 描述为 Dola Studio；模板文件为 `deploy/dola-studio.service`、`deploy/dola-studio-health.service`、`deploy/dola-studio-health.timer`。这些模板供独立部署使用，本轮未迁移当前生产站点的运行目录与服务。

## 字体替换

当前界面改用操作系统字体：Windows 优先 Segoe UI Variable Text / Segoe UI，中文回退 Microsoft YaHei UI / Microsoft YaHei；macOS 中文回退 PingFang SC。代码与等宽数据优先 Cascadia Mono / Consolas，其他平台使用系统等宽字体。没有把这些系统字体打包分发，也不把字体本身署名为 Dola Studio。

已移除 CSS 的全部 13 条 `@font-face` 规则、旧字体引用，以及此前分发的 IBM Plex、Public Sans、中文字体资源和对应字体许可文件。

更正上一轮结论：旧源码快照虽然缺少 Source 衍生中文字体二进制，线上服务器实际仍有相应字体，并在 CSS 中被引用。因此本轮先切换引用，再将线上字体和许可一同备份移除，而不是仅凭本地缺文件就删除声明。

`protocol/js/bdms-sdk.js`、`bdcaptcha.js`、`extensions/` 中还包含上游 SDK、验证码或扩展资源及标识。未将其作者改署 Dola Studio，也未将这些资源认定为自研。

1.0.1 使用 `dola-studio-cookies-v1` 导出格式和 `DOLA_ACCOUNT_DB_PATH` 配置键。Cookie 导入按内容读取，仍可读取历史导出；账号库仍支持原环境变量，新键优先，默认文件名保持 `pool_usage.db`。部署脚本与模板统一为 `dola-studio`，本轮未迁移既有服务器目录和服务。历史验收中备份路径的旧根目录已明确脱敏，完整记录保留在相应文档链接的历史提交中。

产品前端显示名称为 Dola Studio。第三方来源和版权说明保留于相应源码与许可文件，避免将不同来源的代码统一声明为自研。
