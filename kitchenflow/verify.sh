#!/usr/bin/env bash
# KitchenFlow 验证：后端测试 → 前端构建 → 接口冒烟。全部通过才算交付合格。
set -e
cd "$(dirname "$0")"
PASS=0; FAIL=0
step() { echo; printf '\033[1;36m>>> %s\033[0m\n' "$1"; }

step '1/3 后端核心链路测试'
if (cd backend && npm test); then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); echo '❌ 后端测试失败'; fi

step '2/3 前端构建'
if (cd frontend && npm run build); then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); echo '❌ 前端构建失败'; fi

step '3/3 接口冒烟'
(cd backend && node server.js &) ; sleep 4
H=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:4201/api/auth/me || echo 000)
echo "GET /api/auth/me -> $H (期望 401)"
[ "$H" = "401" ] && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo '❌ 冒烟失败'; }
PID=$(netstat -ano 2>/dev/null | grep ':4201 ' | grep LISTENING | awk '{print $5}' | head -1)
[ -n "$PID" ] && taskkill //F //PID "$PID" >/dev/null 2>&1 || true

echo; echo "========== 结果：通过 $PASS 项，失败 $FAIL 项 =========="
[ "$FAIL" = "0" ] && echo '✅ 全部通过' || { echo '❌ 存在失败项'; exit 1; }
