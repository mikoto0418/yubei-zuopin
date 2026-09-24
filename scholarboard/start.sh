#!/usr/bin/env bash
# ScholarBoard 一键启动（单端口生产模式）
# 流程：装依赖 → 构建前端 → 初始化数据 → 启动后端（托管前端产物，端口 4102）
set -e
cd "$(dirname "$0")"

step() { echo; printf '\033[1;36m>>> %s\033[0m\n' "$1"; }

step '1/3 安装依赖'
[ -d backend/node_modules ] || (cd backend && npm install)
[ -d frontend/node_modules ] || (cd frontend && npm install)

step '2/3 构建前端产物'
(cd frontend && npm run build)

step '3/3 初始化数据并启动后端（端口 4102）'
(cd backend && npm run seed && npm start)