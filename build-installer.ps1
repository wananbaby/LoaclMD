# LocalMD 安装包构建脚本
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "LocalMD Installer Builder" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# 检查是否以管理员权限运行
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "需要管理员权限来创建符号链接。正在请求提升权限..." -ForegroundColor Yellow
    Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

Write-Host "以管理员权限运行中..." -ForegroundColor Green
Write-Host ""

# 设置工作目录
Set-Location "d:\git\LocalMD"

# 设置环境变量跳过代码签名
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"

# 清理之前的构建
if (Test-Path "dist") {
    Write-Host "清理旧的构建文件..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force dist
}

# 运行构建
Write-Host "开始构建安装包..." -ForegroundColor Yellow
npm run build

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host "构建成功！" -ForegroundColor Green
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host ""
    
    # 显示生成的文件
    $installers = Get-ChildItem -Path "dist" -Filter "*.exe" -Recurse
    if ($installers) {
        Write-Host "安装包位置：" -ForegroundColor Cyan
        foreach ($installer in $installers) {
            Write-Host "  $($installer.FullName)" -ForegroundColor White
        }
    }
} else {
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Red
    Write-Host "构建失败，请查看上面的错误信息" -ForegroundColor Red
    Write-Host "==========================================" -ForegroundColor Red
}

Write-Host ""
Write-Host "按任意键退出..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
