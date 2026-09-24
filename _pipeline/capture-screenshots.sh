#!/usr/bin/env bash
# 十套系统截图采集：起后端 → 浏览器登录 → 截主界面 → 存 docs/screenshot-*.png
# 依赖：后端已构建前端产物（dist / 静态直出）
# 用法：bash _pipeline/capture-screenshots.sh [项目名...]
set -u
cd "$(dirname "$0")/.."

OUT="_screenshots"
mkdir -p "$OUT"

ALL="mindcare scholarboard edupulse hivemarket examprep kitchenflow citylens interviewgo scriptforge logitrack"
TARGETS="${*:-$ALL}"

port_of() { case $1 in mindcare) echo 4101;; scholarboard) echo 4102;; edupulse) echo 4103;; hivemarket) echo 4104;; examprep) echo 4105;; kitchenflow) echo 4201;; citylens) echo 4202;; interviewgo) echo 4203;; scriptforge) echo 4204;; logitrack) echo 4205;; esac; }

start_backend() {
  local p=$1
  case $p in
    mindcare)  (cd "$p/backend" && ./.venv/Scripts/python.exe app.py >/tmp/sc_$p.log 2>&1 &) 2>/dev/null || true ;;
    edupulse)  (cd "$p/backend" && ../venv/Scripts/python.exe app.py >/tmp/sc_$p.log 2>&1 &) 2>/dev/null || true ;;
    *)         (cd "$p/backend" && npm start >/tmp/sc_$p.log 2>&1 &) 2>/dev/null || true ;;
  esac
}

kill_port() {
  local port=$1 pid
  pid=$(netstat -ano 2>/dev/null | grep ":$port " | grep LISTENING | awk '{print $5}' | head -1)
  [ -n "$pid" ] && taskkill //F //PID "$pid" >/dev/null 2>&1
  return 0
}

echo "截图输出目录：$OUT"
echo
for p in $TARGETS; do
  [ -d "$p" ] || { echo "跳过 $p"; continue; }
  PORT=$(port_of "$p")
  kill_port "$PORT"; sleep 1
  echo "▶ $p (端口 $PORT) —— 启动后端..."
  start_backend "$p"
  sleep 6
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/" 2>/dev/null || echo 000)
  if [ "$CODE" = "200" ]; then
    echo "  ✅ 可访问，浏览器截图目标：http://localhost:$PORT/"
    echo "     账号：admin / admin123"
  else
    echo "  ⚠️ 首页返回 $CODE，检查 /tmp/sc_$p.log"
  fi
  # 注意：截图本身由 Claude Browser / Playwright 工具执行，此脚本只负责把服务拉起来
  echo "  （服务保持运行，截图完成后由调用方统一 kill）"
  echo
done

echo "══════════════════════════════════════════"
echo "  服务已就绪。请在浏览器工具中逐套截图，存为："
echo "  $OUT/<项目名>-main.png"
echo "══════════════════════════════════════════"
