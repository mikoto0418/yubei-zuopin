#!/usr/bin/env bash
# MindCare 一键启动（单端口生产模式）
# 流程：建 venv → 装依赖 → 构建前端 → 初始化数据 → 启动后端（4101，托管前端产物）
set -e
cd "$(dirname "$0")"
step() { echo; printf '\033[1;36m>>> %s\033[0m\n' "$1"; }

step '1/4 准备 Python 虚拟环境'
cd backend
if [ ! -d .venv ]; then
  echo "  创建 backend/.venv ..."
  python -m venv .venv 2>/dev/null || python3 -m venv .venv
fi
# Windows(Git Bash) 用 Scripts/，Linux/macOS 用 bin/
if [ -f .venv/Scripts/python.exe ]; then PY=".venv/Scripts/python.exe"; else PY=".venv/bin/python"; fi
"$PY" -m pip install --upgrade pip --quiet
"$PY" -m pip install -r requirements.txt --quiet
cd ..

step '2/4 安装前端依赖'
[ -d frontend/node_modules ] || (cd frontend && npm install)

step '3/4 构建前端产物'
(cd frontend && npm run build)

step '4/4 初始化数据并启动后端（端口 4101）'
echo "  访问地址： http://localhost:4101"
echo "  Admin： admin / admin123"
echo "  演示：xiaolan / xiaolan123"
echo "  按 Ctrl+C 停止"
(cd backend && if [ -f .venv/Scripts/python.exe ]; then .venv/Scripts/python.exe app.py; else .venv/bin/python app.py; fi)
