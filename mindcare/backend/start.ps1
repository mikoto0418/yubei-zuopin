# MindCare 后端一键安装并启动（Windows PowerShell）
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# 1) 创建并激活虚拟环境
if (-not (Test-Path ".venv")) {
    Write-Host "[1/3] 创建虚拟环境..." -ForegroundColor Cyan
    python -m venv .venv
}

# 2) 安装依赖（含测试依赖）
Write-Host "[2/3] 安装依赖..." -ForegroundColor Cyan
& ".venv\Scripts\python.exe" -m pip install --upgrade pip --quiet
& ".venv\Scripts\python.exe" -m pip install -r requirements-dev.txt

# 3) 启动（自动建库 + seed）
Write-Host "[3/3] 启动后端 http://localhost:4101 ..." -ForegroundColor Cyan
& ".venv\Scripts\python.exe" app.py