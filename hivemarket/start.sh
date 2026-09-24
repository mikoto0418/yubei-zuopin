#!/usr/bin/env bash
# HiveMarket 一键启动（单端口生产模式）
# 流程：装依赖 → 生成 .env → 构建前端 → 初始化数据 → 启动后端（4104，托管前端产物）
set -e
cd "$(dirname "$0")"
step() { echo; printf '\033[1;36m>>> %s\033[0m\n' "$1"; }

step '1/5 安装后端依赖'
[ -d backend/node_modules ] || (cd backend && npm install)

step '2/5 安装前端依赖'
[ -d frontend/node_modules ] || (cd frontend && npm install)

step '3/5 生成环境变量（若缺失）'
if [ ! -f backend/.env ] && [ -f backend/.env.example ]; then
  cp backend/.env.example backend/.env
  echo "  已从 .env.example 复制 .env"
else
  echo "  已存在或无需生成，跳过"
fi

step '4/5 构建前端产物'
(cd frontend && npm run build)

step '5/5 启动后端（首次启动自动初始化数据库）'
echo "  访问地址： http://localhost:4104"
echo "  Admin： admin / admin123"
echo "  演示：zhangsan / lisi / wangwu（密码 123456）"
echo "  按 Ctrl+C 停止"
(cd backend && npm start)
