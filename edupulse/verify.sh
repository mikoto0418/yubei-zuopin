#!/usr/bin/env bash
# EduPulse 验证：后端测试 → 前端构建 → 接口冒烟。全部通过才算交付合格。
set -e
cd "$(dirname "$0")"
PASS=0; FAIL=0
step() { echo; printf '\033[1;36m>>> %s\033[0m\n' "$1"; }

# 后端解释器：Windows 在 venv/Scripts/，Linux/macOS 在 venv/bin/
PY="venv/Scripts/python.exe"
[ -f "$PY" ] || PY="venv/bin/python"

step '1/3 后端核心链路测试'
# edupulse 的 pytest.ini 自带 addopts=-q，用 -o addopts= 清空后再显式给 -q，保证汇总行不被吞
if (cd backend && "../$PY" -m pytest tests/ -o addopts= -q 2>&1 | tail -3); then
  PASS=$((PASS+1))
else
  FAIL=$((FAIL+1)); echo '❌ 后端测试失败'
fi

step '2/3 前端构建'
if (cd frontend && npm run build >/tmp/ep_build.log 2>&1); then
  echo "  ✅ 构建通过  $(grep -oE 'built in [0-9.]+s' /tmp/ep_build.log | tail -1)"
  PASS=$((PASS+1))
else
  FAIL=$((FAIL+1)); echo '❌ 前端构建失败'; tail -5 /tmp/ep_build.log
fi

step '3/3 接口冒烟'
(cd backend && "../$PY" app.py >/tmp/ep_verify.log 2>&1 &) 2>/dev/null || true
sleep 6
H=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:4103/api/auth/me 2>/dev/null || echo 000)
echo "GET /api/auth/me -> $H (期望 401)"
[ "$H" = "401" ] && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo '❌ 未授权拦截异常'; }
LOGIN=$(curl -s -X POST http://localhost:4103/api/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' 2>/dev/null | grep -c '"token"')
if [ "$LOGIN" -ge 1 ]; then echo '  ✅ 管理员登录成功'; PASS=$((PASS+1)); else echo '  ❌ 管理员登录失败'; FAIL=$((FAIL+1)); fi
PID=$(netstat -ano 2>/dev/null | grep ':4103 ' | grep LISTENING | awk '{print $5}' | head -1)
[ -n "$PID" ] && taskkill //F //PID "$PID" >/dev/null 2>&1 || true

echo; echo "========== 结果：通过 $PASS 项，失败 $FAIL 项 =========="
[ "$FAIL" = "0" ] && echo '✅ 全部通过' || { echo '❌ 存在失败项'; exit 1; }
