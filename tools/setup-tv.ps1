<#
  رواق: تركيب على التلفزيون من كمبيوتر ويندوز (نفس شبكة الواي فاي).

  وش يسوي (بالترتيب، ويوقف أول ما يصير خطأ):
    ١. يتصل بالتلفزيون عن طريق ADB (لازم "تصحيح USB" شغال في خيارات المطور)
    ٢. يركّب تطبيق رواق (APK)
    ٣. يحفظ الإعدادات الأصلية في ملف نسخة احتياطية (عشان الرجوع)
    ٤. يخلي شاشة التوقف رواق
    ٥. يطفي واجهة الشركة (من قائمة ثابتة بس) ويخلي رواق هي الواجهة الرئيسية
    ٦. يتأكد إن زر البيت يفتح رواق. إذا لا: يرجّع كل شي لحاله فوراً

  ما يحذف أي تطبيق، وما يطفي غير الواجهة الأصلية. الرجوع: tools\restore-tv.ps1 (أمر واحد).

  الاستخدام:
    powershell -ExecutionPolicy Bypass -File tools\setup-tv.ps1 -Ip 192.168.1.50
    (اختياري) -Apk path\to\riwaq.apk   -SkipHome (شاشة التوقف بس، بدون تبديل الواجهة)
#>
param(
  [Parameter(Mandatory = $true)][string]$Ip,
  [int]$Port = 5555,
  [string]$Apk = "",
  [switch]$SkipHome
)

# Continue مو Stop: في PowerShell 5.1 أي سطر يطلعه adb على stderr يوقف السكربت. نتحقق من النتائج بأنفسنا
$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Pkg = "app.riwaq.tv"
$Dream = "$Pkg/.RiwaqDream"
$HomeActivity = "$Pkg/.MainActivity"

# الواجهات الأصلية اللي نعرفها. نطفي بس اللي موجود منها على الجهاز
$StockHomes = @(
  "com.google.android.apps.tv.launcherx",     # Google TV (منها Xiaomi TV Box S)
  "com.google.android.tungsten.setupwraith",  # بديل Google TV لما تنطفي الواجهة
  "com.google.android.tvlauncher",            # Android TV القديم
  "com.mitv.tvhome"                           # واجهة شاومي PatchWall
)

function Say($msg) { Write-Host "• $msg" }
function Fail($msg) { Write-Host "✗ $msg" -ForegroundColor Red; exit 1 }

# ===== أداة ADB =====
$adb = (Get-Command adb -ErrorAction SilentlyContinue).Source
if (-not $adb) {
  $local = Join-Path $env:USERPROFILE "Android\Sdk\platform-tools\adb.exe"
  if (Test-Path $local) { $adb = $local } else { Fail "ما لقينا adb. شوف docs/SETUP.md (خطوة تحميل الأدوات)." }
}
function Adb { & $adb -s "$Ip`:$Port" @args }

# ===== ١. الاتصال =====
Say "نتصل بالتلفزيون $Ip ..."
& $adb connect "$Ip`:$Port" | Out-Host
Say "إذا طلع على التلفزيون سؤال (السماح بتصحيح USB؟): اختر دائماً من هذا الكمبيوتر، واضغط سماح."
$ok = $false
for ($i = 0; $i -lt 30; $i++) {
  $state = (& $adb -s "$Ip`:$Port" get-state 2>$null)
  if ($state -eq "device") { $ok = $true; break }
  Start-Sleep -Seconds 2
}
if (-not $ok) { Fail "التلفزيون ما رد. تأكد إن تصحيح USB شغال، وإن الكمبيوتر والتلفزيون على نفس الشبكة." }
$model = (Adb shell getprop ro.product.model).Trim()
$sdk = [int](Adb shell getprop ro.build.version.sdk).Trim()
Say "متصل: $model (أندرويد API $sdk)"

# ===== ٢. التركيب =====
if (-not $Apk) {
  $Apk = Join-Path $PSScriptRoot "..\android\app\build\outputs\apk\release\app-release.apk"
  if (-not (Test-Path $Apk)) { $Apk = Join-Path $PSScriptRoot "..\android\app\build\outputs\apk\debug\app-debug.apk" }
}
if (-not (Test-Path $Apk)) { Fail "ما لقينا ملف التطبيق (APK). حمّله من صفحة الإصدارات وحط مساره بعد -Apk" }
Say "نركّب التطبيق ..."
$out = Adb install -r "$Apk" 2>&1
if ($out -notmatch "Success") { Fail "التركيب ما نجح: $out" }

# ===== ٣. نسخة احتياطية =====
$backupFile = Join-Path $PSScriptRoot "backup-$($Ip.Replace('.','-')).json"
if (-not (Test-Path $backupFile)) {
  $backup = [ordered]@{
    model = $model
    screensaver_components = (Adb shell settings get secure screensaver_components).Trim()
    screensaver_enabled = (Adb shell settings get secure screensaver_enabled).Trim()
    disabled = @()
  }
  $backup | ConvertTo-Json | Out-File -Encoding utf8 $backupFile
  Say "حفظنا الإعدادات الأصلية في $backupFile"
} else {
  $backup = Get-Content $backupFile -Raw | ConvertFrom-Json
  Say "فيه نسخة احتياطية من قبل، نستخدمها ($backupFile)"
}

# ===== ٤. شاشة التوقف =====
Say "نخلي شاشة التوقف رواق ..."
Adb shell settings put secure screensaver_components $Dream | Out-Null
Adb shell settings put secure screensaver_enabled 1 | Out-Null
$check = (Adb shell settings get secure screensaver_components).Trim()
if ($check -ne $Dream) { Write-Host "! ما قدرنا نغير شاشة التوقف على هذا الجهاز ($check)" -ForegroundColor Yellow }

if ($SkipHome) { Say "خلصنا (شاشة التوقف بس). الرجوع: tools\restore-tv.ps1 -Ip $Ip"; exit 0 }

# ===== ٥. الواجهة الرئيسية =====
$installed = (Adb shell pm list packages) -replace "package:", "" | ForEach-Object { $_.Trim() }
$toDisable = $StockHomes | Where-Object { $installed -contains $_ }
$disabledNow = @()
foreach ($p in $toDisable) {
  Say "نطفي الواجهة الأصلية: $p"
  $r = Adb shell pm disable-user --user 0 $p 2>&1
  if ($r -match "disabled") { $disabledNow += $p } else { Write-Host "! ما انطفى $p : $r" -ForegroundColor Yellow }
}
$backup.disabled = @($backup.disabled) + $disabledNow | Select-Object -Unique
$backup | ConvertTo-Json | Out-File -Encoding utf8 $backupFile
if ($sdk -ge 29) { Adb shell cmd package set-home-activity --user 0 $HomeActivity 2>&1 | Out-Null }

# ===== ٦. نتأكد =====
Adb shell input keyevent KEYCODE_HOME | Out-Null
Start-Sleep -Seconds 3
$top = (Adb shell dumpsys activity activities) | Select-String -Pattern "mResumedActivity|topResumedActivity" | Select-Object -First 1
if ("$top" -notmatch [regex]::Escape($Pkg)) {
  Write-Host "✗ زر البيت ما فتح رواق. نرجّع الواجهة الأصلية الحين ..." -ForegroundColor Red
  foreach ($p in $disabledNow) { Adb shell pm enable --user 0 $p | Out-Null }
  Fail "رجعنا كل شي. ($top) أرسل هذا السطر لنا عشان نضيف جهازك."
}
Say "تم ✓ رواق الحين الواجهة الرئيسية وشاشة التوقف."
Say "الرجوع لأي وقت: powershell -ExecutionPolicy Bypass -File tools\restore-tv.ps1 -Ip $Ip"
