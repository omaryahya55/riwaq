<#
  رواق: يرجّع التلفزيون مثل ما كان (أمر واحد).
    - يشغّل الواجهات الأصلية اللي طفّيناها
    - يرجّع شاشة التوقف الأصلية
    - يوقف رواق كواجهة رئيسية (التطبيق يبقى، وترجعه من صفحة "الرجوع للواجهة الأصلية" أو بسكربت التركيب)
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
function Fail($msg) { Write-Host "✗ $msg" -ForegroundColor Red; exit 1 }

# العنوان لازم يكون رقم جهاز بس (مثلاً لو انكتب -Uninstall لاصق فيه بدون مسافة)
if ($Ip -notmatch '^\d{1,3}(\.\d{1,3}){3}$') { Fail "العنوان غلط: '$Ip'. اكتبه مثل 192.168.1.50 وحط مسافة قبل -Uninstall" }

& $adb connect "$Ip`:$Port" | Out-Host
function Adb { & $adb -s "$Ip`:$Port" @args }

# نتأكد إن التلفزيون متصل قبل أي شي (وإلا ما نكتب "تم" وهو ما تغيّر شي)
$ok = $false
for ($i = 0; $i -lt 10; $i++) {
  if ((& $adb -s "$Ip`:$Port" get-state 2>$null) -eq "device") { $ok = $true; break }
  Start-Sleep -Seconds 2
}
if (-not $ok) { Fail "ما قدرنا نتصل بالتلفزيون. شغّل (تصحيح USB) من خيارات المطوّر، وتأكد إن الكمبيوتر والتلفزيون على نفس الشبكة. وما تغيّر شي في التلفزيون." }

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

# نطفي خدمة ضغطة البيت المطوّلة، ونخلي أي خدمة ثانية كانت شغالة زي ما هي
$a11y = "$Pkg/$Pkg.HomeKeyService"
$cur = (Adb shell settings get secure enabled_accessibility_services | Out-String).Trim()
if ($cur -match [regex]::Escape($a11y)) {
  $rest = ($cur -split ":" | Where-Object { $_ -and $_ -ne $a11y }) -join ":"
  if ($rest) { Adb shell settings put secure enabled_accessibility_services "$rest" | Out-Null } else { Adb shell settings delete secure enabled_accessibility_services | Out-Null }
  Say "طفّينا ضغطة البيت المطوّلة"
}

# رواق يوقف كواجهة رئيسية (التطبيق يبقى): بدون هذا زر البيت يرجع يفتح رواق حتى بعد ما تشتغل واجهة الشركة
Adb shell pm disable "$Pkg/.HomeAlias" 2>&1 | Out-Null
Adb shell cmd role remove-role-holder --user 0 android.app.role.HOME $Pkg 2>&1 | Out-Null
Say "رواق ما عاد الواجهة الرئيسية"

if ($Uninstall) { Adb uninstall $Pkg | Out-Host; Say "انحذف تطبيق رواق" }
Adb shell input keyevent KEYCODE_HOME | Out-Null
Say "تم ✓ التلفزيون رجع مثل ما كان."
