# ===================================================
#  在桌面创建「写作后台」快捷方式
#
#  用法（在项目根目录）：
#     powershell -ExecutionPolicy Bypass -File tools\安装快捷方式.ps1
# ===================================================

$ErrorActionPreference = 'Stop'

# tools\ 的上一级就是项目根
$tools   = $PSScriptRoot
$root    = Split-Path -Parent $tools
$desktop = [Environment]::GetFolderPath('Desktop')

$vbs  = Join-Path $tools '启动后台.vbs'
$icon = Join-Path $tools 'icon.ico'
$lnk  = Join-Path $desktop '写作后台.lnk'

if (-not (Test-Path $vbs)) {
    Write-Host "找不到 tools\启动后台.vbs" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $icon)) {
    Write-Host "找不到 tools\icon.ico（图标会退化成默认样式，不影响使用）" -ForegroundColor Yellow
    $icon = "$env:WINDIR\system32\shell32.dll"
}

$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut($lnk)

# 用 wscript 启动 vbs —— 这样不会闪出命令行窗口
$sc.TargetPath       = "$env:WINDIR\system32\wscript.exe"
$sc.Arguments        = '"' + $vbs + '"'
$sc.WorkingDirectory = $root
$sc.IconLocation     = "$icon,0"
$sc.Description      = '米饭多加水の小窝 · 写作后台（发文章、传图片、发布）'
$sc.Save()

if (Test-Path $lnk) {
    Write-Host ""
    Write-Host "  桌面快捷方式已创建" -ForegroundColor Green
    Write-Host "    $lnk"
    Write-Host ""
    Write-Host "  双击它就能打开写作后台。"
    Write-Host ""
} else {
    Write-Host "创建失败" -ForegroundColor Red
    exit 1
}
