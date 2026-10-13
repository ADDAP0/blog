# ===================================================
#  写作后台：开机自启 开关
#
#  为什么需要它：
#    PWA（装进系统的那个应用）从开始菜单启动时，后台服务必须已经在跑，
#    否则页面打不开 —— 网页没有办法自己启动本地程序。
#
#  用法：
#    开启： powershell -ExecutionPolicy Bypass -File tools\设置开机自启.ps1
#    关闭： powershell -ExecutionPolicy Bypass -File tools\设置开机自启.ps1 -Remove
#    查看： powershell -ExecutionPolicy Bypass -File tools\设置开机自启.ps1 -Status
# ===================================================

param(
    [switch]$Remove,
    [switch]$Status
)

$ErrorActionPreference = 'Stop'

$tools   = $PSScriptRoot
$root    = Split-Path -Parent $tools
$startup = [Environment]::GetFolderPath('Startup')
$lnk     = Join-Path $startup '写作后台服务.lnk'

# ---------- 查看状态 ----------
if ($Status) {
    Write-Host ""
    if (Test-Path $lnk) {
        Write-Host "  开机自启：已开启" -ForegroundColor Green
        Write-Host "    $lnk"
    } else {
        Write-Host "  开机自启：未开启" -ForegroundColor Yellow
    }
    Write-Host ""
    exit 0
}

# ---------- 关闭 ----------
if ($Remove) {
    if (Test-Path $lnk) {
        Remove-Item $lnk -Force
        Write-Host ""
        Write-Host "  已关闭开机自启" -ForegroundColor Green
        Write-Host ""
    } else {
        Write-Host ""
        Write-Host "  本来就没开启" -ForegroundColor Yellow
        Write-Host ""
    }
    exit 0
}

# ---------- 开启 ----------
$vbs = Join-Path $tools '启动后台.vbs'
if (-not (Test-Path $vbs)) {
    Write-Host "找不到 tools\启动后台.vbs" -ForegroundColor Red
    exit 1
}

$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut($lnk)
$sc.TargetPath       = "$env:WINDIR\system32\wscript.exe"
$sc.Arguments        = '"' + $vbs + '"'
$sc.WorkingDirectory = $root
if (Test-Path (Join-Path $tools 'icon.ico')) {
    $sc.IconLocation = (Join-Path $tools 'icon.ico') + ',0'
}
$sc.Description      = '开机时在后台启动写作后台服务'
$sc.Save()

Write-Host ""
Write-Host "  已开启开机自启" -ForegroundColor Green
Write-Host "    $lnk"
Write-Host ""
Write-Host "  下次开机后服务会自动在后台跑起来，"
Write-Host "  从开始菜单点「写作后台」就能直接用。"
Write-Host ""
Write-Host "  不想开机自启了就运行：" -ForegroundColor DarkGray
Write-Host "    powershell -ExecutionPolicy Bypass -File tools\设置开机自启.ps1 -Remove" -ForegroundColor DarkGray
Write-Host ""
