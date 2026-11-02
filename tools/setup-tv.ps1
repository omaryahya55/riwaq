<#
  رواق: تركيب على التلفزيون من كمبيوتر ويندوز (نفس شبكة الواي فاي).

  وش يسوي (بالترتيب، ويوقف أول ما يصير خطأ):
    ١. يتصل بالتلفزيون عن طريق ADB (لازم "تصحيح USB" شغال في خيارات المطور)
    ٢. فحوص قبل أي تغيير: اكتمال إعداد الجهاز، وإصدار WebView
    ٣. يركّب تطبيق رواق (APK)، ويتأكد إن الصفحة انرسمت فعلاً
    ٤. يحفظ الإعدادات الأصلية في ملف نسخة احتياطية (عشان الرجوع)
    ٥. يخلي شاشة التوقف رواق
    ٦. يشغّل مفتاح أمان على الجهاز، ويطفي واجهة الشركة (من قائمة ثابتة بس)، ومعالج الإعداد بس لو احتجناه
    ٧. يتأكد إن زر البيت يفتح رواق، والصفحة شغالة، والشبكة ما تأثرت. إذا لا: يرجّع كل شي لحاله فوراً

  ما يحذف أي تطبيق، وما يطفي غير الواجهة الأصلية. الرجوع: tools\restore-tv.ps1 (أمر واحد).

  الاستخدام:
    powershell -ExecutionPolicy Bypass -File tools\setup-tv.ps1 -Ip 192.168.1.50
    (اختياري) -Apk path\to\riwaq.apk   -SkipHome (شاشة التوقف بس، بدون تبديل الواجهة)

  أجهزة Google TV الجديدة (التصحيح اللاسلكي): في التلفزيون افتح "التصحيح اللاسلكي" ثم "إقران جهاز برمز"،
  وبيطلع لك رقم منفذ ورمز من ٦ أرقام. وفي صفحة التصحيح اللاسلكي نفسها فيه منفذ ثاني للاتصال:
    ... -Ip 192.168.1.50 -Port <منفذ الاتصال> -PairPort <منفذ الإقران> -PairCode <الرمز>
#>
param(
  [Parameter(Mandatory = $true)][string]$Ip,
  [int]$Port = 5555,
  [int]$PairPort = 0,
  [string]$PairCode = "",
  [string]$Apk = "",
  [switch]$SkipHome
)

# العنوان لازم يكون رقم جهاز بس
if ($Ip -notmatch '^\d{1,3}(\.\d{1,3}){3}$') { Write-Host "✗ العنوان غلط: '$Ip'. اكتبه مثل 192.168.1.50" -ForegroundColor Red; exit 1 }

# Continue مو Stop: في PowerShell 5.1 أي سطر يطلعه adb على stderr يوقف السكربت. نتحقق من النتائج بأنفسنا
$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Pkg = "app.riwaq.tv"
$Dream = "$Pkg/.RiwaqDream"
# دور الواجهة الرئيسية في HomeAlias (صفحة "الرجوع للواجهة الأصلية" في التلفزيون تطفيه وتشغّله)
$HomeActivity = "$Pkg/.HomeAlias"

# الواجهات الأصلية اللي نعرفها. نطفي بس اللي موجود منها على الجهاز
$StockHomes = @(
  "com.google.android.apps.tv.launcherx",     # Google TV (منها Xiaomi TV Box S)
  "com.google.android.tvlauncher",            # Android TV القديم
  "com.mitv.tvhome"                           # واجهة شاومي PatchWall
)
# معالج إعداد Google TV: يرد على زر البيت لو انطفت الواجهة. ما نطفيه إلا لو احتجنا، وما نطفيه لو هو مالك شبكة الواي فاي
# (في تجارب منشورة، إطفاءه مسح كلمة الواي فاي المحفوظة في تلفزيونات TCL)
$SetupWizard = "com.google.android.tungsten.setupwraith"
$MinWebView = 87
$OkFlag = "/data/local/tmp/riwaq-ok"

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
if ($PairPort -gt 0 -and $PairCode) {
  Say "نقرن الكمبيوتر بالتلفزيون (التصحيح اللاسلكي) ..."
  $pair = (& $adb pair "$Ip`:$PairPort" $PairCode 2>&1 | Out-String)
  if ($pair -notmatch "Successfully paired") { Fail "الإقران ما نجح: $pair (تأكد من الرمز والمنفذ، والرمز يتغير كل مرة)" }
}
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

# ===== ٢. فحوص قبل أي تغيير =====
if ($sdk -lt 26) { Fail "رواق يحتاج أندرويد ٨ وفوق، وهذا الجهاز API $sdk. ما تغيّر شي." }
if (-not $SkipHome) {
  $prov = (Adb shell settings get global device_provisioned | Out-String).Trim()
  $done = (Adb shell settings get secure user_setup_complete | Out-String).Trim()
  if ($prov -ne "1" -or $done -ne "1") { Fail "إعداد التلفزيون الأول ما اكتمل (device_provisioned=$prov, user_setup_complete=$done). كمله وارجع. ما تغيّر شي." }
}
$wv = (Adb shell dumpsys webviewupdate | Select-String -Pattern "Current WebView package" | Select-Object -First 1 | Out-String)
if ($wv -match ",\s*(\d+)\.") {
  if ([int]$Matches[1] -lt $MinWebView) { Fail "نسخة Android System WebView هنا $($Matches[1])، ورواق يحتاج $MinWebView وفوق. حدّثها من المتجر وارجع. ما تغيّر شي." }
  Say "WebView: $($Matches[1])"
} else { Write-Host "! ما قدرنا نقرا نسخة WebView. التطبيق نفسه يفحصها ويطلع شاشة واضحة لو قديمة." -ForegroundColor Yellow }

# الصفحة قالت إنها جاهزة (سطر RiwaqReady من Riwaq.ready): فتح النشاط لحاله ما يثبت إن الصفحة انرسمت
function WaitReady([int]$seconds) {
  for ($i = 0; $i -lt $seconds; $i++) {
    if ((Adb logcat -d -s RiwaqReady:I | Out-String) -match "RiwaqReady") { return $true }
    Start-Sleep -Seconds 1
  }
  return $false
}
function WifiUp { return ((Adb shell cmd wifi status 2>&1 | Out-String) -match "(?i)Wifi is connected|connected to") }

# ===== ٢. التركيب =====
if (-not $Apk) {
  # أحدث نسخة كاملة (full: فيها الضغطة المطوّلة وأزرار الريموت) في dist: riwaq-full-<الإصدار>.apk
  $latest = Get-ChildItem (Join-Path $PSScriptRoot "..\dist") -Filter "riwaq-full-*.apk" -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^riwaq-full-(\d+)\.(\d+)\.(\d+)\.apk$' } |
    Sort-Object { [version]($_.BaseName -replace '^riwaq-full-', '') } -Descending | Select-Object -First 1
  $Apk = if ($latest) { $latest.FullName } else { "" }
  if (-not $Apk -or -not (Test-Path $Apk)) { $Apk = Join-Path $PSScriptRoot "..\android\app\build\outputs\apk\full\release\app-full-release.apk" }
  if (-not (Test-Path $Apk)) { $Apk = Join-Path $PSScriptRoot "..\android\app\build\outputs\apk\full\debug\app-full-debug.apk" }
}
if (-not (Test-Path $Apk)) { Fail "ما لقينا ملف التطبيق (APK). حمّله من صفحة الإصدارات وحط مساره بعد -Apk" }
Say "نركّب التطبيق ..."
# adb يطلع أكثر من سطر: نحوله لنص واحد قبل الفحص
$out = (Adb install -r "$Apk" 2>&1 | Out-String)
if ($out -match "INSTALL_FAILED_UPDATE_INCOMPATIBLE") {
  # نسخة تجريبية قديمة بتوقيع مختلف: نشيلها ونركّب الجديدة (الإعدادات تنمسح، تختارها من الجوال مرة ثانية)
  # الحذف يمسح إعدادات البيت (المدينة، التطبيقات، الرمز…): ما نسويه إلا بموافقة صريحة
  Say "فيه نسخة قديمة من رواق بتوقيع مختلف، وما ينفع نحدّثها فوقها. حذفها يمسح إعداداتك (المدينة وترتيب التطبيقات والرمز)."
  if ((Read-Host "أحذفها وأركّب الجديدة؟ اكتب y للموافقة، أو أي شي ثاني للإلغاء") -ne "y") { Fail "ألغينا التركيب وما تغيّر شي في التلفزيون." }
  Say "نشيلها ونركّب النسخة الجديدة (بتختار إعداداتك من الجوال مرة ثانية) ..."
  # لو واجهة الشركة مطفية من تركيب سابق: نشغلها قبل الحذف، عشان لو فشل التركيب ما يبقى التلفزيون بدون واجهة
  foreach ($p in ($StockHomes + $SetupWizard)) { Adb shell pm enable --user 0 $p 2>&1 | Out-Null }
  Adb uninstall $Pkg | Out-Null
  $out = (Adb install "$Apk" 2>&1 | Out-String)
}
if ($out -notmatch "Success") { Fail "التركيب ما نجح: $out" }

# صف أكمل المشاهدة (لو الجهاز ما يقبل: يطلب الإذن من الواجهة بعدين). وبدون هذا زر الرجوع في الفحص ممكن يرفض السؤال
Adb shell pm grant $Pkg android.permission.READ_TV_LISTINGS 2>&1 | Out-Null
Say "نفتح رواق ونتأكد إن الصفحة تشتغل قبل ما نبدّل أي شي ..."
Adb logcat -c 2>&1 | Out-Null
Adb shell am start -n "$Pkg/.MainActivity" 2>&1 | Out-Null
if (-not (WaitReady 25)) { Fail "صفحة رواق ما انرسمت خلال ٢٥ ثانية، فما بدّلنا شي في التلفزيون. أرسل لنا موديل جهازك: $model" }
Adb shell input keyevent KEYCODE_BACK | Out-Null

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
$installed = @(Adb shell pm list packages) -replace "package:", "" | ForEach-Object { $_.Trim() }
$toDisable = $StockHomes | Where-Object { $installed -contains $_ }
$disabledNow = @()
$wifiBefore = WifiUp

function SaveJournal {
  $backup.disabled = @($backup.disabled) + $disabledNow | Select-Object -Unique
  $backup | ConvertTo-Json | Out-File -Encoding utf8 $backupFile
}
function Disable($p) {
  Say "نطفي: $p"
  $r = (Adb shell pm disable-user --user 0 $p 2>&1 | Out-String)
  if ($r -match "disabled") { $script:disabledNow += $p; SaveJournal } else { Write-Host "! ما انطفى $p : $r" -ForegroundColor Yellow }
}
function TopActivity {
  return "$((Adb shell dumpsys activity activities) | Select-String -Pattern 'mResumedActivity|topResumedActivity' | Select-Object -First 1)"
}

# مفتاح أمان على الجهاز نفسه: لو انقطع الاتصال في نص التبديل، بعد ٥ دقايق يرجّع واجهة الشركة لحاله.
# يموت لو انعاد تشغيل الجهاز، وقتها سكربت الرجوع والسجل (ملف النسخة الاحتياطية) هم الطريق
Adb shell rm -f $OkFlag 2>&1 | Out-Null
$enableAll = (($toDisable + $SetupWizard) | ForEach-Object { "pm enable --user 0 $_" }) -join "; "
Adb shell "nohup sh -c 'sleep 300; [ -f $OkFlag ] || { $enableAll; }' >/dev/null 2>&1 &" 2>&1 | Out-Null

foreach ($p in $toDisable) { Disable $p }
Adb shell pm enable $HomeActivity 2>&1 | Out-Null   # لو كان مطفي من صفحة الرجوع
if ($sdk -ge 29) { Adb shell cmd package set-home-activity --user 0 $HomeActivity 2>&1 | Out-Null }

# معالج الإعداد: نضغط البيت ونشوف مين رد. لو هو، نطفيه بس لو مو مالك شبكة الواي فاي
Adb shell input keyevent KEYCODE_HOME | Out-Null
Start-Sleep -Seconds 3
if ((TopActivity) -match [regex]::Escape($SetupWizard)) {
  $wifiDump = (Adb shell dumpsys wifi 2>&1 | Out-String)
  if ($wifiDump -match "(creatorName|lastUpdateName)=$([regex]::Escape($SetupWizard))") {
    foreach ($p in $disabledNow) { Adb shell pm enable --user 0 $p 2>&1 | Out-Null }
    Adb shell "touch $OkFlag" 2>&1 | Out-Null
    Fail "معالج الإعداد هو اللي حفظ شبكة الواي فاي في هذا الجهاز، وإطفاءه ممكن يمسحها. رجّعنا كل شي. جرّب النسخة بدون تبديل: زِد -SkipHome، وأرسل لنا الموديل: $model"
  }
  Disable $SetupWizard
  if ($sdk -ge 29) { Adb shell cmd package set-home-activity --user 0 $HomeActivity 2>&1 | Out-Null }
}

# ===== ٧. نتأكد =====
Adb logcat -c 2>&1 | Out-Null
Adb shell am force-stop $Pkg 2>&1 | Out-Null
Adb shell input keyevent KEYCODE_HOME | Out-Null
$ready = WaitReady 20
$top = TopActivity
$wifiOk = (-not $wifiBefore) -or (WifiUp)
if (($top -notmatch [regex]::Escape($Pkg)) -or (-not $ready) -or (-not $wifiOk)) {
  $why = if ($top -notmatch [regex]::Escape($Pkg)) { "زر البيت ما فتح رواق" } elseif (-not $ready) { "صفحة رواق ما انرسمت" } else { "الواي فاي انقطع" }
  Write-Host "✗ $why. نرجّع الواجهة الأصلية الحين ..." -ForegroundColor Red
  foreach ($p in $disabledNow) { Adb shell pm enable --user 0 $p | Out-Null }
  Adb shell "touch $OkFlag" 2>&1 | Out-Null
  Fail "رجعنا كل شي ($why). الموديل: $model. أرسله لنا عشان نضيف جهازك."
}
Adb shell "touch $OkFlag" 2>&1 | Out-Null

# بعد الفحص: force-stop يشيل خدمة إمكانية الوصول من قائمة النظام
# ===== ٥ب. ضغطة البيت المطوّلة =====
# خدمة "إمكانية الوصول" في رواق: تستقبل زر البيت بس. الضغطة العادية ترجع لأندرويد، والمطوّلة تفتح لوحة التلفزيون
$a11y = "$Pkg/$Pkg.HomeKeyService"
$hasKeys = ((Adb shell dumpsys package $Pkg 2>&1 | Out-String) -match "HomeKeyService")
if ($hasKeys) {
  $cur = (Adb shell settings get secure enabled_accessibility_services | Out-String).Trim()
  if ($cur -notmatch [regex]::Escape($a11y)) {
    $new = if (-not $cur -or $cur -eq "null") { $a11y } else { "$cur`:$a11y" }
    Adb shell settings put secure enabled_accessibility_services "$new" | Out-Null
    Adb shell settings put secure accessibility_enabled 1 | Out-Null
  }
  $cur = (Adb shell settings get secure enabled_accessibility_services | Out-String).Trim()
  if ($cur -match [regex]::Escape($a11y)) { Say "ضغطة البيت المطوّلة تفتح لوحة التلفزيون في رواق" }
  else { Write-Host "! ما قدرنا نشغّل ضغطة البيت المطوّلة على هذا الجهاز. تقدر تفتح اللوحة من (التحكم) فوق في الواجهة" -ForegroundColor Yellow }
}

Say "تم ✓ رواق الحين الواجهة الرئيسية وشاشة التوقف."
Say "باقي تختار مدينتك: في رواق السهم فوق ← التحكم ← إعدادات رواق، وصوّر الباركود بجوالك."
Say "مهم: أعد تشغيل التلفزيون مرة وحدة وتأكد إن زر البيت والواي فاي شغالين. بعض الأجهزة ما يبان فيها الخلل إلا بعد إعادة التشغيل."
Say "الرجوع لأي وقت: powershell -ExecutionPolicy Bypass -File tools\restore-tv.ps1 -Ip $Ip"
