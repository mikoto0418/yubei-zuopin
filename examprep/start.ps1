# ExamPrep 一键启动（PowerShell / 跨平台）
# 用法：./start.ps1   或   bash start.sh
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Join-Path $Root 'backend')

if (-not (Test-Path 'node_modules')) {
  Write-Host '[setup] 首次运行，正在安装依赖...' -ForegroundColor Green
  npm install
}

Write-Host '[start] 启动 ExamPrep 服务（端口 4105）...' -ForegroundColor Green
npm start