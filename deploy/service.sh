#!/bin/bash
# systemd 入口：输出落盘到日志文件，进程保持前台（由 systemd 守护）
set -u
LOG_DIR=/www/wwwlogs/python/dola-studio
mkdir -p "$LOG_DIR"
exec /www/wwwroot/dola-studio/run.sh >> "$LOG_DIR/access.log" 2>> "$LOG_DIR/error.log"
