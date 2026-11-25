"""Generate documentation from tracked source without importing the application.

Run from any directory: python docs/reference/generate_source_reference.py
No application environment, database, credentials or network is accessed.
"""
from __future__ import annotations

import ast
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent


def cell(value: object) -> str:
    return str(value).replace("|", "\\|").replace("\n", " ").replace("\r", "")


def link(path: str, line: int) -> str:
    return f"[{path}:{line}](../../{path}#L{line})"


def literal(node: ast.AST | None, fallback=None):
    try:
        return ast.literal_eval(node) if node is not None else fallback
    except (ValueError, TypeError):
        return fallback


def expr(node: ast.AST | None) -> str:
    return ast.unparse(node) if node is not None else "未提供默认参数"


def tracked_python() -> list[str]:
    result = subprocess.run(
        ["git", "ls-files", "--", "*.py"], cwd=ROOT,
        capture_output=True, text=True, encoding="utf-8", check=True,
    )
    return [p for p in result.stdout.splitlines()
            if not p.startswith(("tests/", "docs/"))]


def auth_hint(fn: ast.AST) -> str:
    calls = {n.func.id for n in ast.walk(fn)
             if isinstance(n, ast.Call) and isinstance(n.func, ast.Name)}
    if "_require_owner" in calls:
        return "管理会话且 owner：X-Admin-Key"
    if "_admin_auth" in calls:
        return "管理会话：X-Admin-Key"
    if "_auth" in calls:
        return "业务 API：Bearer（无有效密钥配置时匿名）"
    if "create_video" in calls:
        return "委托 create_video：与视频创建相同业务鉴权"
    if getattr(fn, "name", "") in {"health", "list_models", "admin_login", "video_short_link"}:
        return "无直接鉴权调用；公开健康/模型、登录入口或媒体短链"
    return "处理器未直接调用鉴权函数；见主文边界说明"


def generate() -> None:
    revision = subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=ROOT,
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    sources = {p: (ROOT / p).read_text(encoding="utf-8-sig") for p in tracked_python()}
    trees = {p: ast.parse(source, filename=p) for p, source in sources.items()}
    server = trees["server.py"]
    functions = {n.name: n for n in server.body
                 if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))}
    preamble = (
        f"源码核对基线：`{revision}`。本附录由静态 AST 提取；不启动服务、不读取运行配置或数据库。\n\n"
        "[返回完整项目解说](../PROJECT-GUIDE.zh-CN.md)。"
        "源码行号对应生成时的文件；后续修改后应重新生成。\n\n"
    )
    routes = []
    for fn in functions.values():
        for dec in fn.decorator_list:
            if not (isinstance(dec, ast.Call) and isinstance(dec.func, ast.Attribute)
                    and isinstance(dec.func.value, ast.Name) and dec.func.value.id == "app"):
                continue
            if dec.func.attr not in {"get", "post", "patch", "delete", "put", "head", "api_route"}:
                continue
            path = literal(dec.args[0]) if dec.args else None
            if not isinstance(path, str):
                continue
            methods = [dec.func.attr.upper()]
            if dec.func.attr == "api_route":
                methods = next((literal(k.value, []) for k in dec.keywords if k.arg == "methods"), [])
            for method in methods:
                routes.append((method, path, fn.name, auth_hint(fn), fn.lineno))
    ark_paths = []
    for n in server.body:
        if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "ARK_TASK_PATHS" for t in n.targets):
            ark_paths = literal(n.value, [])
    for path in ark_paths:
        for method, suffix, handler in (("POST", "", "ark_create_task"), ("GET", "/{task_id}", "ark_get_task")):
            fn = functions[handler]
            routes.append((method, path + suffix, handler, auth_hint(fn), fn.lineno))
    route_doc = ["# API 路由源码索引\n\n", preamble,
                 f"共 **{len(routes)} 个方法与路径组合**，包括四组动态注册的 Ark 兼容路由。\n\n",
                 "鉴权列静态识别直接调用、owner 校验及视频别名的已知委托，不能替代运行时验证。业务 API 的匿名开发分支、任务归属、静态媒体访问和角色限制见主文。\n\n",
                 "| 方法 | 路径 | 处理器 | 鉴权入口 | 源码 |\n| --- | --- | --- | --- | --- |\n"]
    for method, path, handler, auth, line in routes:
        route_doc.append(f"| {method} | `{cell(path)}` | `{handler}` | {auth} | {link('server.py', line)} |\n")
    route_doc.append("\n静态挂载另有 `/videos`、`/thumbs`、`/`；FastAPI 默认文档路由也不在装饰器清单中。运行环境若另加反向代理规则，以实际可达面为准。\n")
    (OUT / "API-ROUTES.zh-CN.md").write_text("".join(route_doc), encoding="utf-8")

    envs: dict[str, list[tuple[str, int, str]]] = {}
    for path, tree in trees.items():
        for n in ast.walk(tree):
            if not (isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and n.args):
                continue
            function = ast.unparse(n.func)
            if function not in {"os.getenv", "os.environ.get"}:
                continue
            key = literal(n.args[0])
            if not isinstance(key, str):
                continue
            envs.setdefault(key, []).append((path, n.lineno, expr(n.args[1] if len(n.args) > 1 else None)))
    env_doc = ["# 环境变量源码索引\n\n", preamble,
               f"共 **{len(envs)} 个静态名称**。仅提取生产 Python 源码中直接出现的 `os.getenv` / `os.environ.get`；"
               "动态名称、Shell/JS 变量和直接下标读取不保证完整覆盖。\n\n",
               "表内是读取时的**默认参数表达式**，不是最终生效配置：外层类型转换、上下限、平台探测、数据库保存值和运行期设置可能继续修改它。"
               "未提供默认参数通常返回 `None`；不同读取点可能有不同默认值。"
               "路径相对服务进程工作目录。绝未读取当前机器的环境值。\n\n",
               "| 环境变量 | 默认参数表达式及读取点 |\n| --- | --- |\n"]
    for key, uses in sorted(envs.items()):
        entries = [f"`{cell(default)}` — {link(path, line)}" for path, line, default in sorted(set(uses))]
        env_doc.append(f"| `{key}` | {'<br>'.join(entries)} |\n")
    (OUT / "ENVIRONMENT.zh-CN.md").write_text("".join(env_doc), encoding="utf-8")

    model_doc = ["# 请求与响应模型源码索引\n\n", preamble,
                 "下表保留 `server.py` 中 Pydantic 模型的字段注解与默认表达式。"
                 "处理器还可能接受额外兼容字段并执行跨字段校验，不能只凭模型字段判断支持组合。\n\n"]
    count = 0
    for node in server.body:
        if not isinstance(node, ast.ClassDef) or not any(ast.unparse(b) == "BaseModel" for b in node.bases):
            continue
        count += 1
        model_doc.extend([f"## {node.name}\n\n", f"源码：{link('server.py', node.lineno)}。\n\n",
                          "| 字段 | 类型 | 默认值或校验 |\n| --- | --- | --- |\n"])
        for field in node.body:
            if isinstance(field, ast.AnnAssign) and isinstance(field.target, ast.Name):
                model_doc.append(f"| `{field.target.id}` | `{cell(expr(field.annotation))}` | `{cell(expr(field.value)) if field.value else '必填'}` |\n")
        model_doc.append("\n")
    (OUT / "DATA-MODELS.zh-CN.md").write_text("".join(model_doc).rstrip() + "\n", encoding="utf-8")

    tables: dict[str, set[tuple[str, int]]] = {}
    for path, tree in trees.items():
        for n in ast.walk(tree):
            if isinstance(n, ast.Constant) and isinstance(n.value, str):
                for match in re.finditer(r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[\"`\[]?(\w+)", n.value, re.I):
                    tables.setdefault(match.group(1), set()).add((path, n.lineno))
    db_doc = ["# 数据表源码索引\n\n", preamble,
              "仅列出静态 SQL 字符串中的建表名。实际部署的字段、迁移历史、索引与内容应以该实例 SQLite schema 为准。"
              "本生成器没有连接任何数据库。\n\n",
              "| 表 | 建表源码 |\n| --- | --- |\n"]
    for table, uses in sorted(tables.items()):
        db_doc.append(f"| `{table}` | {'<br>'.join(link(p, line) for p, line in sorted(uses))} |\n")
    (OUT / "DATABASE.zh-CN.md").write_text("".join(db_doc), encoding="utf-8")
    print(f"Generated {len(routes)} route combinations, {len(envs)} environment names, {count} models, {len(tables)} table names.")


if __name__ == "__main__":
    generate()
