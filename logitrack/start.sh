#!/usr/bin/env bash
# LogiTrack 一键启动（单端口生产模式）：装依赖 → 构建前端 → 初始化数据 → 启动后端
set -e
cd "$(dirname "$0")"
step() { echo; printf '\033[1;36m>>> %s\033[0m\n' "$1"; }

step '1/4 安装后端依赖'
[ -d backend/node_modules ] || (cd backend && npm install)

step '2/4 安装前端依赖'
[ -d frontend/node_modules ] || (cd frontend && npm install)

step '3/4 构建前端产物'
(cd frontend && npm run build)

step '4/4 初始化数据并启动（端口 4205）'
(cd backend && npm run seed && npm start)
