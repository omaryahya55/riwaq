<#
  رواق: يرجّع التلفزيون مثل ما كان (أمر واحد).
    - يشغّل الواجهات الأصلية اللي طفّيناها
    - يرجّع شاشة التوقف الأصلية
    - (اختياري) -Uninstall يحذف تطبيق رواق

  الاستخدام:
    powershell -ExecutionPolicy Bypass -File tools\restore-tv.ps1 -Ip 192.168.1.50
#>
param(
  [Parameter(Mandatory = $true)][string]$Ip,
  [int]$Port = 5555,
  [switch]$Uninstall
)

# Continue مو Stop: في PowerShell 5.1 أي سطر يطلعه adb على stderr يوقف السكربت. نتحقق من النتائج بأنفسنا
$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Pkg = "app.riwaq.tv"
# نفس القائمة الثابتة في setup-tv.ps1: لو ضاعت النسخة الاحتياطية نشغّلهم كلهم (التشغيل آمن)
$StockHomes = @("com.google.android.apps.tv.launcherx", "com.google.android.tungsten.setupwraith", "com.google.android.tvlauncher", "com.mitv.tvhome")

function Say($msg) { Write-Host "• $msg" }

$adb = (Get-Command adb -ErrorAction SilentlyContinue).Source
if (-not $adb) { $adb = Join-Path $env:USERPROFILE "Android\Sdk\platform-tools\adb.exe" }
& $adb connect "$Ip`:$Port" | Out-Host
function Adb { & $adb -s "$Ip`:$Port" @args }

$backupFile = Join-Path $PSScriptRoot "backup-$($Ip.Replace('.','-')).json"
$backup = $null
if (Test-Path $backupFile) { $backup = Get-Content $backupFile -Raw | ConvertFrom-Json }

$toEnable = if ($backup -and $backup.disabled) { @($backup.disabled) } else { $StockHomes }
foreach ($p in $toEnable) {
  Say "نشغّل: $p"
  Adb shell pm enable --user 0 $p 2>&1 | Out-Null
}

if ($backup -and $backup.screensaver_components -and $backup.screensaver_components -ne "null") {
  Adb shell settings put secure screensaver_components $backup.screensaver_components | Out-Null
} else {
  Adb shell settings delete secure screensaver_components | Out-Null
}
Say "رجعت شاشة التوقف الأصلية"

if ($Uninstall) { Adb uninstall $Pkg | Out-Host; Say "انحذف تطبيق رواق" }
Adb shell input keyevent KEYCODE_HOME | Out-Null
Say "تم ✓ التلفزيون رجع مثل ما كان."
