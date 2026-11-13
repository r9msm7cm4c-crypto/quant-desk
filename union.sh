#!/usr/bin/env bash
# quant-desk 双端统一入口
#
#   主站  tsp/  →  FastAPI + React 全功能工作台（策略扫描 / 回测 / 因子 / 监控 / AI 助手 / 开放接口）
#   轻量  ./    →  单文件离线 PWA（无需后端，可装到桌面/手机）
#
# 用法:
#   ./union.sh start          构建（首次）+ 启动主站，PWA 同源挂在 /pwa/
#   ./union.sh build          只构建主站前端并把 PWA 打进 dist/pwa
#   ./union.sh dev            开发模式（后端 3018 + vite 3011 热更新）
#   ./union.sh stop           停止 start 拉起的进程
#
# 环境变量:
#   PORT=3018   HOST=0.0.0.0   DATA_DIR=（默认 tsp/data）

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TSP="$ROOT/tsp"
DIST="$TSP/frontend/dist"
PIDFILE="$ROOT/.union.pid"
PORT="${PORT:-3018}"
HOST="${HOST:-0.0.0.0}"

log() { printf '\033[36m[union]\033[0m %s\n' "$*"; }
die() { printf '\033[31m[union] %s\033[0m\n' "$*" >&2; exit 1; }

need() { command -v "$1" >/dev/null 2>&1 || die "缺少依赖：$1（$2）"; }

# ---- PWA 同步：主站同源挂 /pwa ----
sync_pwa() {
  [ -f "$ROOT/index.html" ] || return 0
  mkdir -p "$DIST/pwa"
  cp "$ROOT/index.html" "$ROOT/sw.js" "$ROOT/manifest.webmanifest" "$DIST/pwa/"
  if [ -d "$ROOT/icons" ]; then
    mkdir -p "$DIST/pwa/icons"
    cp "$ROOT"/icons/*.png "$DIST/pwa/icons/" 2>/dev/null || true
  fi
  log "PWA 已同步到 /pwa（$(du -sh "$DIST/pwa" | cut -f1)）"
}

build() {
  need pnpm "npm i -g pnpm"
  [ -f "$TSP/backend/pyproject.toml" ] || die "缺少 tsp/backend，请先完整拉取仓库"
  if [ ! -d "$TSP/frontend/node_modules" ]; then
    log "安装前端依赖…"
    (cd "$TSP/frontend" && pnpm install --frozen-lockfile 2>/dev/null || pnpm install)
  fi
  log "构建前端…"
  (cd "$TSP/frontend" && pnpm build)
  sync_pwa
  log "构建完成 → $DIST"
}

start() {
  need uv "curl -LsSf https://astral.sh/uv/install.sh | sh"
  if [ ! -x "$TSP/backend/.venv/bin/uvicorn" ]; then
    log "安装后端依赖（首次较慢）…"
    (cd "$TSP/backend" && uv venv --python 3.11 && \
      UV_DEFAULT_INDEX="${UV_DEFAULT_INDEX:-https://pypi.tuna.tsinghua.edu.cn/simple}" uv pip install -e .)
  fi
  if [ ! -f "$DIST/index.html" ]; then
    build
  else
    sync_pwa
  fi
  [ -f "$PIDFILE" ] && kill "$(cat "$PIDFILE")" 2>/dev/null && sleep 1 || true
  log "启动主站 http://localhost:$PORT  ·  离线版 http://localhost:$PORT/pwa/"
  cd "$TSP/backend"
  export DATA_DIR="${DATA_DIR:-$TSP/data}"
  export HOST PORT
  nohup "$TSP/backend/.venv/bin/uvicorn" app.main:app --host "$HOST" --port "$PORT" >"$ROOT/.union.log" 2>&1 &
  echo $! >"$PIDFILE"
  sleep 4
  if kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    log "已启动（PID $(cat "$PIDFILE")），日志：.union.log"
  else
    tail -30 "$ROOT/.union.log" || true
    die "启动失败，见上方日志"
  fi
}

dev() {
  need uv "https://astral.sh/uv/install.sh"
  need pnpm "npm i -g pnpm"
  cd "$TSP"
  [ -f .env ] || cp .env.example .env
  log "开发模式：后端 $PORT，前端 3011（Ctrl-C 退出）"
  exec ./dev.sh
}

stop() {
  if [ -f "$PIDFILE" ]; then
    kill "$(cat "$PIDFILE")" 2>/dev/null || true
    rm -f "$PIDFILE"
    log "已停止"
  else
    log "没有运行中的实例"
  fi
}

case "${1:-start}" in
  build) build ;;
  start) start ;;
  dev) dev ;;
  stop) stop ;;
  *) die "未知命令：$1（可用：start / build / dev / stop）" ;;
esac
