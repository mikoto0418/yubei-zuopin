@echo off
REM ExamPrep 一键启动（Windows）
chcp 65001 >nul
cd /d "%~dp0backend"
if not exist node_modules (
  echo [setup] 首次运行，正在安装依赖...
  call npm install
)
echo [start] 启动 ExamPrep 服务（端口 4105）...
call npm start