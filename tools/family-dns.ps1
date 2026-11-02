<#
  رواق: حماية العائلة بـDNS (اختياري، من الكمبيوتر). يخلي التلفزيون يستخدم خدمة تحجب المواقع غير اللائقة.
  ترتيب للشبكة مو حماية كاملة، ويأثر على كل التطبيقات. والتطبيق نفسه ما يقدر يغيّرها بدون صلاحية نظام، فهي بسكربت بس.

  التشغيل:  powershell -ExecutionPolicy Bypass -File tools\family-dns.ps1 -Ip 192.168.1.50
  الرجوع:   نفس الأمر مع -Off (و tools\restore-tv.ps1 يرجّعها كمان)
  (اختياري) -Hostname <خدمة DoT ثانية>

  يفحص الاتصال بعد التغيير، ولو انقطع النت يرجّع الإعداد القديم لحاله. وما يكمل لو الخدمة ما ترد.
#>
param(
  [Parameter(Mandatory = $true)][string]$Ip,
  [int]$Port = 5555,
  [string]$Hostname = "family.cloudflare-dns.com",
  [switch]$Off
)

$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
function Say($msg) { Write-Host "• $msg" }
function Fail($msg) { Write-Host "✗ $msg" -ForegroundColor Red; exit 1 }
if ($Ip -notmatch '^\d{1,3}(\.\d{1,3}){3}$') { Fail "العنوان غلط: '$Ip'. اكتبه مثل 192.168.1.50" }
if ($Hostname -notmatch '^[a-z0-9.-]+\.[a-z]{2,}$') { Fail "اسم الخدمة غلط: $Hostname" }

$adb = (Get-Command adb -ErrorAction SilentlyContinue).Source
if (-not $adb) { $adb = Join-Path $env:USERPROFILE "Android\Sdk\platform-tools\adb.exe" }
& $adb connect "$Ip`:$Port" | Out-Null
function Adb { & $adb -s "$Ip`:$Port" @args }
if ((& $adb -s "$Ip`:$Port" get-state 2>$null) -ne "device") { Fail "ما قدرنا نتصل بالتلفزيون. وما تغيّر شي." }

$backupFile = Join-Path $PSScriptRoot "backup-dns-$($Ip.Replace('.','-')).json"
# النظام نفسه يقول هل الشبكة وصلت النت فعلاً (ويفحص DNS الخاص). أدق من ping اللي تمنعه شبكات كثيرة
function Online { return ((Adb shell dumpsys connectivity 2>$null | Out-String) -match "&VALIDATED") }

if ($Off) {
  if (Test-Path $backupFile) {
    $b = Get-Content $backupFile -Raw | ConvertFrom-Json
    if ($b.mode -and $b.mode -ne "null") { Adb shell settings put global private_dns_mode $b.mode | Out-Null } else { Adb shell settings delete global private_dns_mode | Out-Null }
    if ($b.host -and $b.host -ne "null") { Adb shell settings put global private_dns_specifier $b.host | Out-Null } else { Adb shell settings delete global private_dns_specifier | Out-Null }
    Remove-Item $backupFile
  } else {
    Adb shell settings delete global private_dns_mode | Out-Null
    Adb shell settings delete global private_dns_specifier | Out-Null
  }
  Say "تم ✓ رجع DNS مثل ما كان."
  exit 0
}

if (-not (Online)) { Fail "التلفزيون ما عنده نت الحين، فما نقدر نتأكد من شي. وما تغيّر شي." }
if (-not (Test-Path $backupFile)) {
  [ordered]@{ mode = (Adb shell settings get global private_dns_mode | Out-String).Trim(); host = (Adb shell settings get global private_dns_specifier | Out-String).Trim() } |
    ConvertTo-Json | Out-File -Encoding utf8 $backupFile
}
Say "نشغّل $Hostname ..."
Adb shell settings put global private_dns_specifier $Hostname | Out-Null
Adb shell settings put global private_dns_mode hostname | Out-Null
$ok = $false
for ($i = 0; $i -lt 5; $i++) { Start-Sleep -Seconds 8; if (Online) { $ok = $true; break } }
if (-not $ok) {
  $b = Get-Content $backupFile -Raw | ConvertFrom-Json
  if ($b.mode -and $b.mode -ne "null") { Adb shell settings put global private_dns_mode $b.mode | Out-Null } else { Adb shell settings delete global private_dns_mode | Out-Null }
  if ($b.host -and $b.host -ne "null") { Adb shell settings put global private_dns_specifier $b.host | Out-Null } else { Adb shell settings delete global private_dns_specifier | Out-Null }
  Remove-Item $backupFile
  Fail "النت انقطع مع هذي الخدمة، فرجّعنا الإعداد القديم."
}
Say "تم ✓ الحماية شغالة، والنت سليم. الرجوع: نفس الأمر مع -Off"
