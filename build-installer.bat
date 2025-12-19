@echo off
echo ==========================================
echo LocalMD Installer Builder
echo ==========================================
echo.
echo 正在构建 Windows 安装包...
echo.

REM 设置环境变量以跳过代码签名
set CSC_IDENTITY_AUTO_DISCOVERY=false

REM 清理之前的构建
if exist dist rmdir /s /q dist

REM 运行构建
call npm run build

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ==========================================
    echo 构建成功！
    echo 安装包位置: dist\LocalMD Setup *.exe
    echo ==========================================
) else (
    echo.
    echo ==========================================
    echo 构建失败，请查看错误信息
    echo ==========================================
)

pause
