@echo off
REM KitchenFlow 一键启动（Windows，端口 4201）
cd /d "%~dp0"
if not exist backend\node_modules (cd backend && call npm install)
if not exist frontend\node_modules (cd frontend && call npm install)
cd frontend && call npm run build && cd ..
cd backend && call npm run seed && call npm start
