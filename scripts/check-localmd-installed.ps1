# 检测系统是否还存在 LocalMD 程序
# 用法: powershell -ExecutionPolicy Bypass -File scripts\check-localmd-installed.ps1

$found = $false
$report = @()

# 1. 已安装应用（卸载列表）
$uninstallKeys = @(
    "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*"
)
foreach ($path in $uninstallKeys) {
    Get-ItemProperty $path -ErrorAction SilentlyContinue | Where-Object {
        $_.DisplayName -match "LocalMD" -or $_.DisplayName -match "localmd"
    } | ForEach-Object {
        $report += "[Installed] $($_.DisplayName) | $($_.InstallLocation)"
        $found = $true
    }
}

# 2. 常见安装目录是否存在 LocalMD.exe
$possiblePaths = @(
    "$env:ProgramFiles\LocalMD\LocalMD.exe",
    "${env:ProgramFiles(x86)}\LocalMD\LocalMD.exe",
    "$env:LOCALAPPDATA\Programs\LocalMD\LocalMD.exe",
    "$env:APPDATA\LocalMD\LocalMD.exe",
    "$env:USERPROFILE\AppData\Local\Programs\LocalMD\LocalMD.exe"
)
foreach ($p in $possiblePaths) {
    if (Test-Path $p) {
        $report += "[Exe] $p"
        $found = $true
    }
}

# 3. 注册表文件关联
$regPaths = @(
    "HKCU:\Software\Classes",
    "HKLM:\SOFTWARE\Classes"
)
foreach ($root in $regPaths) {
    if (Test-Path $root) {
        Get-ChildItem $root -ErrorAction SilentlyContinue | Where-Object { $_.PSChildName -like "LocalMD*" -or $_.PSChildName -match "com\.localmd" } | ForEach-Object {
            $report += "[Registry] $($_.PSPath)"
            $found = $true
        }
    }
}

# 4. .md 打开方式中是否包含 LocalMD
$openWithPaths = @(
    "HKCU:\Software\Classes\.md\OpenWithProgids",
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.md\OpenWithList"
)
foreach ($p in $openWithPaths) {
    if (Test-Path $p) {
        try {
            $props = Get-ItemProperty $p -ErrorAction SilentlyContinue
            $props.PSObject.Properties | Where-Object { $_.Name -notmatch "^(PSPath|PSParentPath|PSChildName|PSDrive|PSProvider)$" } | ForEach-Object {
                if ($_.Name -match "LocalMD|localmd|com\.localmd" -or ($_.Value -and $_.Value.ToString() -match "LocalMD|localmd")) {
                    $report += "[.md OpenWith] $p -> $($_.Name)"
                    $found = $true
                }
            }
        } catch {}
    }
}

# 5. 桌面与开始菜单快捷方式
$shortcutPaths = @(
    "$env:USERPROFILE\Desktop\LocalMD*.lnk",
    "$env:ProgramData\Microsoft\Windows\Start Menu\Programs\LocalMD*.lnk",
    "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\LocalMD*.lnk"
)
foreach ($pattern in $shortcutPaths) {
    Get-Item $pattern -ErrorAction SilentlyContinue | ForEach-Object {
            $report += "[Shortcut] $($_.FullName)"
        $found = $true
    }
}

# 6. 当前是否在运行
Get-Process -Name "LocalMD" -ErrorAction SilentlyContinue | ForEach-Object {
    $report += "[Running] PID: $($_.Id) $($_.Path)"
    $found = $true
}

# output
if ($found) {
    Write-Host "Found LocalMD related items:`n"
    $report | ForEach-Object { Write-Host $_ }
    Write-Host "`nTo clean context menu run: scripts\remove-context-menu.ps1"
} else {
    Write-Host "No LocalMD app or registry/shortcuts found."
}
