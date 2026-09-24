@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   HiveMarket 一键启动 (后端 4104 托管前端)
echo ============================================

echo [1/5] 安装后端依赖...
if not exist "backend\node_modules" (cd backend && call npm install && cd ..) else echo       已存在，跳过

echo [2/5] 安装前端依赖...
if not exist "frontend\node_modules" (cd frontend && call npm install && cd ..) else echo       已存在，跳过

echo [3/5] 生成环境变量（若缺失）...
if not exist "backend\.env" (copy "backend\.env.example" "backend\.env" >nul && echo       已从 .env.example 复制 .env)

echo [4/5] 构建前端到 dist...
cd frontend && call npm run build
if errorlevel 1 (echo 前端构建失败 & pause & exit /b 1)
cd ..

echo [5/5] 启动后端（首次启动自动初始化数据库）...
echo --------------------------------------------
echo    访问地址： http://localhost:4104
echo    Admin： admin / admin123
echo    演示：zhangsan / lisi / wangwu（密码 123456）
echo    按 Ctrl+C 停止
echo --------------------------------------------
cd backend && call npm start
endlocal