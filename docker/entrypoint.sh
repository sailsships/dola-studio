#!/bin/sh
# 容器启动：把要持久化的东西指到 /data，再起服务。
# 任务库 / 成片 / 参考图 / 缩略图由 Dockerfile 环境变量指到 /data，账号库在下方解析；
# 账号目录（代码里写死 accounts/）和凭据加密文件（cred.key / creds.json 在代码目录旁）用软链接过去
# （目标文件还不存在也没关系：程序第一次写的时候会顺着链接写进 /data）。
set -e
# Resolve the renamed setting before applying the container default, so an
# explicitly configured legacy database is not shadowed by an image ENV default.
DOLA_ACCOUNT_DB_PATH="$(python -c '
import os
legacy_key = "_".join(("DOLA", "POOL", "DB", "PATH"))
print(os.getenv("DOLA_ACCOUNT_DB_PATH", os.getenv(legacy_key, "/data/pool_usage.db")))
')"
export DOLA_ACCOUNT_DB_PATH
mkdir -p /data/accounts /data/downloads /data/refs /data/thumbs
ln -sfn /data/accounts /app/accounts
ln -sfn /data/cred.key /app/cred.key
ln -sfn /data/creds.json /app/creds.json
cd /app
# 严格隔离镜像（Dockerfile.cloak）里有 Xvfb：先起虚拟显示器，CloakBrowser 有头运行要用；官方镜像没有，跳过
if command -v Xvfb >/dev/null 2>&1; then
  export DISPLAY="${DISPLAY:-:99}"
  Xvfb "$DISPLAY" -screen 0 1280x1024x24 -ac >/tmp/xvfb.log 2>&1 &
  sleep 1
fi
exec python -m uvicorn server:app --host 0.0.0.0 --port "${PORT:-8000}"
