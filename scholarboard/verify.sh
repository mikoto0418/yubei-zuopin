#!/usr/bin/env bash
# ScholarBoard 验证：后端测试 → 前端构建 → 接口冒烟。全部通过才算交付合格。
set -e
cd "$(dirname "$0")"
PASS=0; FAIL=0
step() { echo; printf '\033[1;36m>>> %s\033[0m\n' "$1"; }

step '1/3 后端核心链路测试'
RES=$(cd backend && npm test 2>&1 | grep -E '^ℹ (pass|fail)' | tr '\n' ' ')
echo "  $RES"
if echo "$RES" | grep -qE 'fail 0'; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); echo '❌ 后端测试失败'; fi

step '2/3 前端构建'
if (cd frontend && npm run build >/tmp/sb_build.log 2>&1); then
  echo "  ✅ 构建通过  $(grep -oE 'built in [0-9.]+s' /tmp/sb_build.log | tail -1)"
  PASS=$((PASS+1))
else
  FAIL=$((FAIL+1)); echo '❌ 前端构建失败'; tail -5 /tmp/sb_build.log
fi

step '3/3 接口冒烟'
(cd backend && npm start >/tmp/sb_verify.log 2>&1 &) 2>/dev/null || true
sleep 6
H=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:4102/api/auth/me 2>/dev/null || echo 000)
echo "GET /api/auth/me -> $H (期望 401)"
[ "$H" = "401" ] && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo '❌ 未授权拦截异常'; }
TOKEN=$(curl -s -X POST http://localhost:4102/api/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' 2>/dev/null | node -pe "try{JSON.parse(require('fs').readFileSync(0,'utf8')).data.token}catch{''}" 2>/dev/null)
if [ -n "$TOKEN" ]; then echo '  ✅ 管理员登录成功'; PASS=$((PASS+1)); else echo '  ❌ 管理员登录失败'; FAIL=$((FAIL+1)); fi

# 新增业务冒烟：用有演示数据的 alice 账号（admin 名下没有业务数据）
step '3b/3 新增业务接口冒烟'
UTOKEN=$(curl -s -X POST http://localhost:4102/api/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"123456"}' 2>/dev/null | node -pe "try{JSON.parse(require('fs').readFileSync(0,'utf8')).data.token}catch{''}" 2>/dev/null)
AUTH="Authorization: Bearer $UTOKEN"
chk() { # chk <名称> <url> <期望出现的字段>
  BODY=$(curl -s -H "$AUTH" "http://localhost:4102$2" 2>/dev/null)
  if echo "$BODY" | grep -q "$3"; then echo "  ✅ $1"; PASS=$((PASS+1)); else echo "  ❌ $1（未找到 $3）"; FAIL=$((FAIL+1)); fi
}
chk '项目分组（含关联计数）' '/api/projects?pageSize=3' 'note_count'
chk '标签云（含使用次数）'   '/api/tags'                 'count'
chk '活动流时间线'           '/api/activities?pageSize=3' 'summary'
chk '笔记列表（含项目名）'   '/api/notes?pageSize=3'      'total'
NID=$(curl -s -H "$AUTH" 'http://localhost:4102/api/notes?pageSize=1' 2>/dev/null | node -pe "try{JSON.parse(require('fs').readFileSync(0,'utf8')).data.notes[0].id}catch{''}" 2>/dev/null)
if [ -n "$NID" ]; then chk '笔记版本历史' "/api/notes/$NID/versions" 'max_versions'; fi
RID=$(curl -s -H "$AUTH" 'http://localhost:4102/api/resumes?pageSize=1' 2>/dev/null | node -pe "try{JSON.parse(require('fs').readFileSync(0,'utf8')).data.resumes[0].id}catch{''}" 2>/dev/null)
if [ -n "$RID" ]; then chk '简历结构化经历' "/api/resumes/$RID" 'experiences'; fi
PID=$(netstat -ano 2>/dev/null | grep ':4102 ' | grep LISTENING | awk '{print $5}' | head -1)
[ -n "$PID" ] && taskkill //F //PID "$PID" >/dev/null 2>&1 || true

echo; echo "========== 结果：通过 $PASS 项，失败 $FAIL 项 =========="
[ "$FAIL" = "0" ] && echo '✅ 全部通过' || { echo '❌ 存在失败项'; exit 1; }
