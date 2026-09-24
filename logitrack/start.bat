@echo off
REM LogiTrack 一键启动（Windows）：装依赖 → 构建前端 → 初始化数据 → 启动后端（端口 4205）
cd /d "%~dp0"
if not exist backend\node_modules (cd backend && call npm install)
if not exist frontend\node_modules (cd frontend && call npm install)
cd frontend && call npm run build && cd ..
cd backend && call npm run seed && call npm start
