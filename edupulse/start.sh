#!/usr/bin/env bash
# EduPulse 一键启动（Linux / macOS）
# 用法：bash start.sh
set -e
cd "$(dirname "$0")"

echo "=== EduPulse 启动中 ... ==="

# ---- 后端 ----
if [ ! -d venv ]; then
  echo "[后端] 创建虚拟环境并安装依赖 ..."
  python3 -m venv venv
  ./venv/bin/pip install -r backend/requirements.txt
fi
if [ ! -f backend/edupulse.db ]; then
  echo "[后端] 初始化数据库与演示数据 ..."
  cd backend && ../venv/bin/python seed.py && cd ..
fi

echo "[后端] 启动 Flask，监听 4103 ..."
(cd backend && ../venv/bin/python app.py) &

# ---- 前端 ----
if [ ! -d frontend/node_modules ]; then
  echo "[前端] 安装依赖（首次较慢）..."
  (cd frontend && npm install)
fi
echo "[前端] 启动 Vite，访问 http://localhost:5173 ..."
(cd frontend && npm run dev) &

echo "浏览器访问 http://localhost:5173"
echo "账号：admin/admin123（管理员） demo/demo123（学员）"
wait