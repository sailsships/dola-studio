# Dola Studio 定制版归属

本定制版新增与独立重写部分统一署名 Dola Studio，适用 CUSTOM_LICENSE.md。

本版本包含第三方及衍生代码，其原始许可与归属继续保留，详见 THIRD_PARTY_NOTICES.md 与 LICENSE。产品界面署名不改变第三方代码的作者归属。

自研内容包括控制台模块拆分、StudioHttp 请求协调、StudioRefresh 读取调度、studio_views 状态投影、自定义创作配置及使用说明。本次新增韩文视频时长识别、模型控件定位、工作入口兼容和参数菜单过渡状态处理。

版本统一为 1.0.1。新 Cookie 导出标识使用 `dola-studio-cookies-v1`，部署模板使用 `dola-studio`，账号数据库配置使用 `DOLA_ACCOUNT_DB_PATH`；仍支持读取历史 Cookie 包装和原账号数据库环境变量。现有生产目录与服务未在本次源码命名整理中迁移。

本轮自研修改还包括：注销时撤销当前服务端会话、自动重登结束后冷却，以及按实际附件生成续提文本；这些修改不改变第三方原始许可。
