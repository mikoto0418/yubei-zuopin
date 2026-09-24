@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   MindCare 一键启动 (后端 4101 托管前端)
echo ============================================

echo [1/5] 准备 Python 虚拟环境...
if not exist "backend\.venv\Scripts\python.exe" (
  echo       创建 backend\.venv ...
  cd backend && python -m venv .venv && cd ..
) else echo       已存在，跳过

echo [2/5] 安装后端依赖...
cd backend
call .venv\Scripts\python.exe -m pip install --upgrade pip --quiet
call .venv\Scripts\python.exe -m pip install -r requirements.txt --quiet
if errorlevel 1 (echo 后端依赖安装失败 & pause & exit /b 1)
cd ..

echo [3/5] 安装前端依赖...
if not exist "frontend\node_modules" (cd frontend && call npm install && cd ..) else echo       已存在，跳过

echo [4/5] 构建前端到 dist...
cd frontend && call npm run build
if errorlevel 1 (echo 前端构建失败 & pause & exit /b 1)
cd ..

echo [5/5] 启动后端（首次启动自动初始化数据库与演示数据）...
echo --------------------------------------------
echo    访问地址： http://localhost:4101
echo    Admin： admin / admin123
echo    演示：xiaolan / xiaolan123
echo    按 Ctrl+C 停止
echo --------------------------------------------
cd backend && call .venv\Scripts\python.exe app.py
endlocal
