# =========================================================
# ScholarBoard 一键启动脚本（单端口生产模式）
# 流程：装依赖 → 构建前端 → 初始化数据 → 启动后端（托管前端产物）
# 地址：http://localhost:4102
# =========================================================
$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$Backend = Join-Path $Root 'backend'
$Frontend = Join-Path $Root 'frontend'

function Step($msg) { Write-Host "`n>>> [$msg]" -ForegroundColor Cyan }

Step '1/4 安装后端依赖'
if (-not (Test-Path (Join-Path $Backend 'node_modules'))) {
  Push-Location $Backend
  npm install
  if ($LASTEXITCODE -ne 0) { Write-Host '后端依赖安装失败' -ForegroundColor Red; exit 1 }
  Pop-Location
} else { Write-Host '（已存在 node_modules，跳过）' }

Step '2/4 安装前端依赖'
if (-not (Test-Path (Join-Path $Frontend 'node_modules'))) {
  Push-Location $Frontend
  npm install
  if ($LASTEXITCODE -ne 0) { Write-Host '前端依赖安装失败' -ForegroundColor Red; exit 1 }
  Pop-Location
} else { Write-Host '（已存在 node_modules，跳过）' }

Step '3/4 构建前端产物'
Push-Location $Frontend
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host '前端构建失败' -ForegroundColor Red; exit 1 }
Pop-Location

Step '4/4 初始化数据并启动后端（端口 4102）'
Push-Location $Backend
npm run seed
npm start