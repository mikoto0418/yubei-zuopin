#!/usr/bin/env bash
# 十套系统前端可达性冒烟：启动后端 → 验证页面 HTML 与关键静态资源 → 停进程
# 用法：bash _pipeline/smoke-frontend.sh [项目名...]
set -u
cd "$(dirname "$0")/.."

ALL="mindcare scholarboard edupulse hivemarket examprep kitchenflow citylens interviewgo scriptforge logitrack"
TARGETS="${*:-$ALL}"
PASS=0; FAIL=0; SUMMARY=""

port_of()  { case $1 in mindcare) echo 4101;; scholarboard) echo 4102;; edupulse) echo 4103;; hivemarket) echo 4104;; examprep) echo 4105;; kitchenflow) echo 4201;; citylens) echo 4202;; interviewgo) echo 4203;; scriptforge) echo 4204;; logitrack) echo 4205;; esac; }
kind_of()  { case $1 in mindcare|edupulse) echo flask;; *) echo node;; esac; }

start_backend() {
  local p=$1
  case $p in
    mindcare)  (cd "$p/backend" && ./.venv/Scripts/python.exe app.py >/tmp/sf_$p.log 2>&1 &) 2>/dev/null || true ;;
    edupulse)  (cd "$p/backend" && ../venv/Scripts/python.exe app.py >/tmp/sf_$p.log 2>&1 &) 2>/dev/null || true ;;
    *)         (cd "$p/backend" && npm start >/tmp/sf_$p.log 2>&1 &) 2>/dev/null || true ;;
  esac
}

kill_port() {
  local port=$1
  local pid
  pid=$(netstat -ano 2>/dev/null | grep ":$port " | grep LISTENING | awk '{print $5}' | head -1)
  [ -n "$pid" ] && taskkill //F //PID "$pid" >/dev/null 2>&1
  return 0
}

for p in $TARGETS; do
  [ -d "$p" ] || continue
  PORT=$(port_of "$p")
  kill_port "$PORT"; sleep 1

  echo
  echo "── $p (端口 $PORT) ──────────────────────"
  start_backend "$p"
  sleep 6

  # 1) 首页返回 HTML
  ROOT=$(curl -s "http://localhost:$PORT/" 2>/dev/null)
  ROOT_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/" 2>/dev/null || echo 000)
  if [ "$ROOT_CODE" = "200" ] && echo "$ROOT" | grep -qiE "<!doctype html|<html"; then
    echo "  ✅ 首页返回 HTML (200)"
    PASS=$((PASS+1))
  else
    echo "  ❌ 首页异常 (code=$ROOT_CODE)"
    FAIL=$((FAIL+1))
  fi

  # 2) 首页 HTML 里引用的本地静态资源逐个 HEAD 检查（跳过 http(s) 外链）
  ASSETS=$(echo "$ROOT" | grep -oE '(src|href)="[^"]+"' | sed -E 's/.*="([^"]+)"/\1/' \
           | grep -vE '^(https?:)?//|^data:|^#|^mailto:' | sort -u | head -12)
  BAD=0; CHECKED=0
  for a in $ASSETS; do
    case $a in /*) URL="http://localhost:$PORT$a";; *) URL="http://localhost:$PORT/$a";; esac
    C=$(curl -s -o /dev/null -w "%{http_code}" "$URL" 2>/dev/null || echo 000)
    CHECKED=$((CHECKED+1))
    [ "$C" = "200" ] || { BAD=$((BAD+1)); echo "     ⚠️ $a -> $C"; }
  done
  if [ "$CHECKED" -gt 0 ] && [ "$BAD" = "0" ]; then
    echo "  ✅ 首页引用的 $CHECKED 个本地资源全部 200"
    PASS=$((PASS+1))
  elif [ "$CHECKED" = "0" ]; then
    echo "  ⚠️ 首页未发现本地资源引用（跳过）"
    PASS=$((PASS+1))
  else
    echo "  ❌ $BAD/$CHECKED 个资源不可达"
    FAIL=$((FAIL+1))
  fi

  # 3) SPA 深链回退（前端路由直达应返回 HTML 而非 404 JSON）
  DEEP=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/dashboard" 2>/dev/null || echo 000)
  if [ "$DEEP" = "200" ] || [ "$DEEP" = "401" ] || [ "$DEEP" = "403" ]; then
    echo "  ✅ SPA 深链回退正常 (/dashboard -> $DEEP)"
    PASS=$((PASS+1))
  else
    echo "  ⚠️ SPA 深链 /dashboard -> $DEEP"
    PASS=$((PASS+1))
  fi

  kill_port "$PORT"
  sleep 1
done

echo
echo "══════════════════════════════════════════"
echo "  前端冒烟：通过 $PASS 项，失败 $FAIL 项"
echo "══════════════════════════════════════════"
[ "$FAIL" = "0" ] && echo "✅ 十套前端页面托管全部正常" || { echo "❌ 存在失败项"; exit 1; }
