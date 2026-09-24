@echo off
chcp 65001 >nul
REM ============================================
REM EduPulse 一键启动脚本（Windows）
REM 依次：安装后端依赖 -> 初始化数据 -> 启动后端(4103)
REM        安装前端依赖 -> 启动前端(5173)
REM 使用说明：双击本文件，或用 cmd 运行 start.bat
REM 访问 http://localhost:5173
REM ============================================
echo.
echo === EduPulse 启动中 ... ===
echo.

REM ---- 1. 后端 ----
if not exist ..\venv\Scripts\python.exe (
  echo [后端] 未找到虚拟环境，正在创建 ...
  cd backend
  python -m venv ..\venv
  ..\venv\Scripts\python.exe -m pip install -r requirements.txt
  cd ..
)
if not exist backend\edupulse.db (
  echo [后端] 首次运行，初始化数据库与演示数据 ...
  cd backend
  ..\venv\Scripts\python.exe seed.py
  cd ..
)

echo [后端] 启动 Flask，监听端口 4103 ...
start "EduPulse-Backend-4103" cmd /k "cd /d %~dp0backend && ..\venv\Scripts\python.exe app.py"

timeout /t 2 /nobreak >nul

REM ---- 2. 前端 ----
if not exist frontend\node_modules (
  echo [前端] 安装依赖（首次较慢）...
  cd frontend
  call npm install
  cd ..
)
echo [前端] 启动 Vite，访问 http://localhost:5173 ...
start "EduPulse-Frontend-5173" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo 后端已挂起在 4103，前端已挂起在 5173。
echo 请在浏览器打开 http://localhost:5173 使用系统。
echo 账号：admin/admin123（管理员） demo/demo123（学员）
echo.
pause