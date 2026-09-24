#!/usr/bin/env bash
# 十套系统统一验收：后端测试 + 前端构建 + 接口冒烟
# 用法：bash _pipeline/verify-all.sh [项目名...]   不带参数则全跑
set -u
cd "$(dirname "$0")/.."

ALL="mindcare scholarboard edupulse hivemarket examprep kitchenflow citylens interviewgo scriptforge logitrack"
TARGETS="${*:-$ALL}"

TOTAL_PASS=0; TOTAL_FAIL=0; SUMMARY=""

# 端口 / 前端类型 / 后端类型 对照
port_of()  { case $1 in mindcare) echo 4101;; scholarboard) echo 4102;; edupulse) echo 4103;; hivemarket) echo 4104;; examprep) echo 4105;; kitchenflow) echo 4201;; citylens) echo 4202;; interviewgo) echo 4203;; scriptforge) echo 4204;; logitrack) echo 4205;; esac; }
kind_of()  { case $1 in mindcare|edupulse) echo flask;; scholarboard|hivemarket|examprep|kitchenflow|citylens|interviewgo|scriptforge|logitrack) echo node;; esac; }
front_of() { case $1 in examprep) echo static;; *) echo vite;; esac; }

# 后端测试命令（Python 项目用各自 venv）
run_backend_test() {
  local p=$1
  case $p in
    # 注意：各项目 pytest.ini 里可能已带 addopts=-q，脚本再传 -q 会变成 -qq 把汇总行吞掉。
    # 统一用 -o addopts= 清空项目配置，再显式给 -q，保证 tail -1 一定能拿到 "N passed/failed"。
    mindcare)  (cd mindcare/backend  && PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 ./.venv/Scripts/python.exe -m pytest tests/ -o addopts= -q 2>&1 | tail -1) ;;
    edupulse)  (cd edupulse/backend  && ../venv/Scripts/python.exe -m pytest tests/ -o addopts= -q 2>&1 | tail -1) ;;
    *)         (cd "$p/backend"    && npm test 2>&1 | grep -E "^ℹ (pass|fail)" | tr '\n' ' ') ;;
  esac
}

for p in $TARGETS; do
  [ -d "$p" ] || { echo "跳过 $p（目录不存在）"; continue; }
  PORT=$(port_of "$p"); KIND=$(kind_of "$p"); FRONT=$(front_of "$p")
  BPASS=0; BFAIL=0; NOTES=""

  echo
  echo "══════════════════════════════════════════"
  echo "  $p   (端口 $PORT / $KIND / $FRONT)"
  echo "══════════════════════════════════════════"

  # ---- 1. 后端测试 ----
  echo "▶ 后端测试"
  RES=$(run_backend_test "$p")
  echo "  $RES"
  if echo "$RES" | grep -qE "fail 0|0 failed|passed"; then
    if echo "$RES" | grep -qE "fail [1-9]|[1-9] failed"; then BFAIL=$((BFAIL+1)); else BPASS=$((BPASS+1)); fi
  else
    BFAIL=$((BFAIL+1))
  fi

  # ---- 2. 前端构建 ----
  echo "▶ 前端构建"
  if [ "$FRONT" = "static" ]; then
    echo "  无构建步骤（静态直出）—— 跳过"
    BPASS=$((BPASS+1))
  else
    if (cd "$p/frontend" && timeout 300 npm run build >/tmp/vb_$p.log 2>&1); then
      echo "  ✅ 构建通过  $(grep -oE 'built in [0-9.]+s' /tmp/vb_$p.log | tail -1)"
      BPASS=$((BPASS+1))
    else
      echo "  ❌ 构建失败（见 /tmp/vb_$p.log 末尾）"
      tail -5 /tmp/vb_$p.log | sed 's/^/     /'
      BFAIL=$((BFAIL+1))
    fi
  fi

  # ---- 3. 接口冒烟 ----
  # 用各项目自己的启动命令（Node 项目的入口在 src/ 下，不能硬编码 server.js）
  echo "▶ 接口冒烟"
  case $KIND in
    flask)
      # 各 Flask 项目的 venv 位置不同，必须用各自解释器（系统 python 缺依赖）。
      # 用相对路径（相对 backend/），与后端测试的写法保持一致。
      case $p in
        mindcare) (cd "$p/backend" && ./.venv/Scripts/python.exe app.py >/tmp/vs_$p.log 2>&1 &) 2>/dev/null || true ;;
        edupulse) (cd "$p/backend" && ../venv/Scripts/python.exe app.py >/tmp/vs_$p.log 2>&1 &) 2>/dev/null || true ;;
        *)        (cd "$p/backend" && python app.py >/tmp/vs_$p.log 2>&1 &) 2>/dev/null || true ;;
      esac ;;
    node)  (cd "$p/backend" && npm start >/tmp/vs_$p.log 2>&1 &) 2>/dev/null || true ;;
  esac
  sleep 6
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/api/auth/me" 2>/dev/null || echo 000)
  if [ "$CODE" = "401" ]; then
    echo "  ✅ 未授权拦截正常 (401)"
    BPASS=$((BPASS+1))
  else
    echo "  ❌ /api/auth/me 期望 401，实际 $CODE"
    BFAIL=$((BFAIL+1))
  fi
  LOGIN=$(curl -s -X POST "http://localhost:$PORT/api/auth/login" -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}' 2>/dev/null | grep -c '"token"')
  if [ "$LOGIN" -ge 1 ]; then
    echo "  ✅ 管理员登录成功"
    BPASS=$((BPASS+1))
  else
    echo "  ❌ 管理员登录失败"
    BFAIL=$((BFAIL+1))
  fi

  # 停进程
  PID=$(netstat -ano 2>/dev/null | grep ":$PORT " | grep LISTENING | awk '{print $5}' | head -1)
  [ -n "$PID" ] && taskkill //F //PID "$PID" >/dev/null 2>&1

  echo "  ── 小计：通过 $BPASS / 失败 $BFAIL"
  TOTAL_PASS=$((TOTAL_PASS+BPASS)); TOTAL_FAIL=$((TOTAL_FAIL+BFAIL))
  SUMMARY="$SUMMARY\n  $p: 通过 $BPASS / 失败 $BFAIL"
done

echo
echo "══════════════════════════════════════════"
echo "  总结果：通过 $TOTAL_PASS 项，失败 $TOTAL_FAIL 项"
echo "══════════════════════════════════════════"
echo -e "$SUMMARY"
[ "$TOTAL_FAIL" = "0" ] && echo "✅ 十套全部验收通过" || { echo "❌ 存在失败项，需修复"; exit 1; }
