#!/usr/bin/env bash
# LogiTrack 验证：后端测试 → 前端构建 → 接口冒烟。全部通过才算交付合格。
set -e
cd "$(dirname "$0")"
PASS=0; FAIL=0
step() { echo; printf '\033[1;36m>>> %s\033[0m\n' "$1"; }

step '1/3 后端核心链路测试'
if (cd backend && npm test); then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); echo '❌ 后端测试失败'; fi

step '2/3 前端构建'
if (cd frontend && npm run build); then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); echo '❌ 前端构建失败'; fi

step '3/3 接口冒烟（401 拦截 + 登录 + 时间轴 + AI 落库）'
(cd backend && node server.js > /dev/null 2>&1 &) ; sleep 5
BASE=http://localhost:4205

H=$(curl -s -o /dev/null -w '%{http_code}' $BASE/api/auth/me || echo 000)
echo "GET /api/auth/me -> $H (期望 401)"
[ "$H" = "401" ] && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo '❌ 未登录拦截失败'; }

TOKEN=$(curl -s -X POST $BASE/api/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).data.token)}catch{console.log('')}})")
if [ -n "$TOKEN" ]; then
  echo "管理员登录 -> OK"; PASS=$((PASS+1))
else
  echo "❌ 管理员登录失败"; FAIL=$((FAIL+1))
fi

TL=$(curl -s -o /dev/null -w '%{http_code}' $BASE/api/waybills/1/timeline -H "Authorization: Bearer $TOKEN")
echo "GET /api/waybills/1/timeline -> $TL (期望 200)"
[ "$TL" = "200" ] && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo '❌ 时间轴接口失败'; }

PERSIST=$(curl -s -X POST $BASE/api/ai/eta -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"waybill_id":1}' \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).data.persisted)}catch{console.log('false')}})")
echo "POST /api/ai/eta persisted -> $PERSIST (期望 true)"
[ "$PERSIST" = "true" ] && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo '❌ AI 结果未落库'; }

PID=$(netstat -ano 2>/dev/null | grep ':4205 ' | grep LISTENING | awk '{print $5}' | head -1)
[ -n "$PID" ] && taskkill //F //PID "$PID" >/dev/null 2>&1 || true

echo; echo "========== 结果：通过 $PASS 项，失败 $FAIL 项 =========="
[ "$FAIL" = "0" ] && echo '✅ 全部通过' || { echo '❌ 存在失败项'; exit 1; }
