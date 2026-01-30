# 卸载后清理右键「用 LocalMD 打开」残留
# 用法: 在 PowerShell 中执行
#   cd d:\git\LocalMD
#   powershell -ExecutionPolicy Bypass -File scripts\remove-context-menu.ps1

$removed = $false

# 删除 HKCU\Software\Classes 下以 LocalMD 开头的项
Get-ChildItem "HKCU:\Software\Classes" -ErrorAction SilentlyContinue | Where-Object { $_.PSChildName -like "LocalMD*" } | ForEach-Object {
    Remove-Item $_.PSPath -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "Removed: $($_.PSPath)"
    $removed = $true
}

# 删除 .md 的 OpenWithProgids 里与 LocalMD 相关的值
$mdProgids = "HKCU:\Software\Classes\.md\OpenWithProgids"
if (Test-Path $mdProgids) {
    Get-ItemProperty $mdProgids -ErrorAction SilentlyContinue | Get-Member -MemberType NoteProperty | Where-Object { $_.Name -notin @("PSPath","PSParentPath","PSChildName","PSDrive","PSProvider") } | ForEach-Object {
        $name = $_.Name
        if ($name -match "LocalMD|localmd|com\.localmd") {
            Remove-ItemProperty -Path $mdProgids -Name $name -Force -ErrorAction SilentlyContinue
            Write-Host "Removed .md progid: $name"
            $removed = $true
        }
    }
}

# 删除 .markdown 的 OpenWithProgids 里与 LocalMD 相关的值
$mdownProgids = "HKCU:\Software\Classes\.markdown\OpenWithProgids"
if (Test-Path $mdownProgids) {
    Get-ItemProperty $mdownProgids -ErrorAction SilentlyContinue | Get-Member -MemberType NoteProperty | Where-Object { $_.Name -notin @("PSPath","PSParentPath","PSChildName","PSDrive","PSProvider") } | ForEach-Object {
        $name = $_.Name
        if ($name -match "LocalMD|localmd|com\.localmd") {
            Remove-ItemProperty -Path $mdownProgids -Name $name -Force -ErrorAction SilentlyContinue
            Write-Host "Removed .markdown progid: $name"
            $removed = $true
        }
    }
}

# 删除 FileExts\.md 下可能残留的 LocalMD
$fileExtsMd = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.md"
if (Test-Path $fileExtsMd) {
    Get-ChildItem $fileExtsMd -ErrorAction SilentlyContinue | ForEach-Object {
        $p = $_.PSPath
        $name = $_.PSChildName
        if ($name -match "LocalMD|localmd") {
            Remove-Item $p -Recurse -Force -ErrorAction SilentlyContinue
            Write-Host "Removed FileExts: $name"
            $removed = $true
        }
    }
}

# OpenWithList: 键名为 a,b,c 等，值为程序名，需按值判断后删除
$openWithListPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.md\OpenWithList"
if (Test-Path $openWithListPath) {
    $props = Get-ItemProperty $openWithListPath -ErrorAction SilentlyContinue
    $toRemove = @()
    $props.PSObject.Properties | Where-Object { $_.Name -notmatch "^(PSPath|PSParentPath|PSChildName|PSDrive|PSProvider)$" } | ForEach-Object {
        $val = $props.($_.Name)
        if ($val -and $val.ToString() -match "LocalMD|localmd") {
            $toRemove += $_.Name
        }
    }
    foreach ($n in $toRemove) {
        Remove-ItemProperty -Path $openWithListPath -Name $n -Force -ErrorAction SilentlyContinue
        Write-Host "Removed OpenWithList: $n"
        $removed = $true
    }
    # 从 MRUList 中移除已删的字母
    if ($toRemove.Count -gt 0 -and $props.MRUList) {
        $mru = $props.MRUList
        foreach ($n in $toRemove) { $mru = $mru -replace [regex]::Escape($n), "" }
        if ($mru -ne $props.MRUList) {
            Set-ItemProperty -Path $openWithListPath -Name "MRUList" -Value $mru -Force -ErrorAction SilentlyContinue
        }
    }
}

if ($removed) {
    Write-Host "`nDone. Close and reopen Explorer, or log off/restart, then LocalMD should disappear from right-click menu."
} else {
    Write-Host "No LocalMD registry items found. If still in menu, search ""LocalMD"" in regedit and delete manually."
}
