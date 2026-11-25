# Dola Studio 字体方案

这是现有控制台的字体替换，不改布局、颜色、账号或生成逻辑。

- 正文、导航、按钮、表单：Segoe UI Variable Text / Segoe UI；中文优先 Microsoft YaHei UI / Microsoft YaHei，macOS 使用 PingFang SC，其他环境系统 sans-serif。
- 代码、编号与等宽数值：Cascadia Mono / Consolas / SFMono-Regular / 系统 monospace。
- 不下载、不打包字体文件；不产生外部字体网络请求。
- 字重、字号、行高沿用现有界面，避免按钮宽高及表格密度突变。
- `web/shell.css` 与 `web/console.css` 共用 `--font` / `--mono` 变量；禁止重新添加散落的旧字体名称或失效 `@font-face`。

系统字体由设备提供，显示会随操作系统略有不同。系统字体不是本项目自研资产；本项目仅定义排版与回退策略。

自研版权行：`Copyright (c) 2026 Dola Studio`。原项目 MIT 版权行不属于自研部分，保留原文。
