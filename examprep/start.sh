#!/usr/bin/env bash
# ExamPrep 一键启动（Linux/Mac）
set -e
cd "$(dirname "$0")/backend"
[ -d node_modules ] || { echo "[setup] 首次运行，正在安装依赖..."; npm install; }
echo "[start] 启动 ExamPrep 服务（端口 4105）..."
npm start