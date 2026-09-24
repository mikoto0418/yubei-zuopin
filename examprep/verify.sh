#!/usr/bin/env bash
# ExamPrep 验证：后端测试 → 静态资源可达 → 接口冒烟。前端无构建步骤，改为校验 vendor 与入口文件。
set -e
cd "$(dirname "$0")"
PASS=0; FAIL=0
step() { echo; printf '\033[1;36m>>> %s\033[0m\n' "$1"; }

step '1/3 后端核心链路测试'
RES=$(cd backend && npm test 2>&1 | grep -E '^ℹ (pass|fail)' | tr '\n' ' ' || true)
echo "  $RES"
if echo "$RES" | grep -qE 'fail 0'; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); echo '❌ 后端测试失败'; fi

step '2/3 前端静态资源完整性（无构建步骤）'
MISSING=0
for f in frontend/index.html frontend/css/apple-tokens.css frontend/css/style.css frontend/js/app.js \
         frontend/vendor/shoelace/shoelace.js frontend/vendor/shoelace/shoelace.css \
         frontend/vendor/shoelace/themes/light.css frontend/vendor/shoelace/themes/dark.css \
         frontend/vendor/open-props/normalize.min.css frontend/vendor/chartjs/chart.umd.min.js; do
  [ -f "$f" ] || { echo "  ❌ 缺失 $f"; MISSING=$((MISSING+1)); }
done
# 首页引用的本地资源必须全部可达（防止漏引 / 路径写错）
if [ "$MISSING" = "0" ]; then
  REF=$(grep -oE '(src|href)="[^"]+"' frontend/index.html | sed -E 's/.*="([^"]+)"/\1/' \
        | grep -vE '^(https?:)?//|^data:|^#|^mailto:' | sort -u || true)
  N=0
  for a in $REF; do
    [ -f "frontend/$a" ] || { echo "  ❌ 首页引用但不存在：$a"; MISSING=$((MISSING+1)); }
    N=$((N+1))
  done
  echo "  ✅ 入口与本地 vendor 资源齐备（首页引用 $N 个本地资源）"
fi
if [ "$MISSING" = "0" ]; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); fi

step '3/3 接口冒烟'
(cd backend && npm start >/tmp/eprep_verify.log 2>&1 &) 2>/dev/null || true
sleep 6
H=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:4105/api/auth/me 2>/dev/null || echo 000)
echo "GET /api/auth/me -> $H (期望 401)"
[ "$H" = "401" ] && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo '❌ 未授权拦截异常'; }
LOGIN=$(curl -s -X POST http://localhost:4105/api/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' 2>/dev/null | grep -c '"token"' || true)
if [ "$LOGIN" -ge 1 ]; then echo '  ✅ 管理员登录成功'; PASS=$((PASS+1)); else echo '  ❌ 管理员登录失败'; FAIL=$((FAIL+1)); fi

# 新业务接口冒烟：时间块日历 / 模考趋势 / 错题本 / 资料库 / 提醒（需带 token）
# 注意：后端 JSON 是多行格式（json spaces: 2），token 需跨行提取
TOKEN=$(curl -s -X POST http://localhost:4105/api/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"demo","password":"demo123"}' 2>/dev/null | tr -d '\n' | sed -E 's/.*"token"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')
if [ -z "$TOKEN" ]; then echo '  ❌ 未能取得 demo token'; FAIL=$((FAIL+1)); else
  C=0
  C=$(curl -s "http://localhost:4105/api/blocks/calendar?date=$(date +%F)&days=1" -H "Authorization: Bearer $TOKEN" 2>/dev/null | grep -c '"days"' || true)
  [ "$C" -ge 1 ] && { echo '  ✅ /api/blocks/calendar'; PASS=$((PASS+1)); } || { echo '  ❌ /api/blocks/calendar 异常'; FAIL=$((FAIL+1)); }
  for EP in exams/trend wrong/summary materials/summary reminders/summary; do
    N=0
    N=$(curl -s "http://localhost:4105/api/$EP" -H "Authorization: Bearer $TOKEN" 2>/dev/null | grep -c '"ok": true' || true)
    [ "$N" -ge 1 ] && { echo "  ✅ /api/$EP"; PASS=$((PASS+1)); } || { echo "  ❌ /api/$EP 异常"; FAIL=$((FAIL+1)); }
  done
fi
ROOT=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:4105/ 2>/dev/null || echo 000)
echo "GET / -> $ROOT (期望 200，前端由后端托管)"
[ "$ROOT" = "200" ] && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo '❌ 首页不可达'; }
PID=$(netstat -ano 2>/dev/null | grep ':4105 ' | grep LISTENING | awk '{print $5}' | head -1)
[ -n "$PID" ] && taskkill //F //PID "$PID" >/dev/null 2>&1 || true

echo; echo "========== 结果：通过 $PASS 项，失败 $FAIL 项 =========="
[ "$FAIL" = "0" ] && echo '✅ 全部通过' || { echo '❌ 存在失败项'; exit 1; }
