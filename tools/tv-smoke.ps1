<#
  رواق: فحص سريع على تلفزيون أو محاكي مركّب عليه رواق. يضغط أزرار الريموت ويتأكد إن الواجهة شغالة بدون أخطاء.
  ما يغيّر إعدادات الجهاز. الصور تنحفظ في المجلد اللي تحدده بـ -Out.

  التشغيل: powershell -ExecutionPolicy Bypass -File tools\tv-smoke.ps1 -Ip 127.0.0.1 -Port 5555 -Out shots
#>
param(
  [Parameter(Mandatory = $true)][string]$Ip,
  [int]$Port = 5555,
  [string]$Out = ""
)

$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
function Say($msg) { Write-Host "• $msg" }
function Fail($msg) { Write-Host "✗ $msg" -ForegroundColor Red; $script:bad++ }
$bad = 0

$adb = (Get-Command adb -ErrorAction SilentlyContinue).Source
if (-not $adb) { $adb = Join-Path $env:USERPROFILE "Android\Sdk\platform-tools\adb.exe" }
& $adb connect "$Ip`:$Port" | Out-Null
function Adb { & $adb -s "$Ip`:$Port" @args }
if ((& $adb -s "$Ip`:$Port" get-state 2>$null) -ne "device") { Fail "ما قدرنا نتصل بالجهاز."; exit 1 }

function Keys([string[]]$k) { foreach ($x in $k) { Adb shell input keyevent $x | Out-Null; Start-Sleep -Milliseconds 700 } }
function Shot($name) {
  if (-not $Out) { return }
  New-Item -ItemType Directory -Force $Out | Out-Null
  $remote = "/data/local/tmp/riwaq-smoke.png"
  Adb shell screencap -p $remote | Out-Null
  Adb pull $remote (Join-Path $Out "$name.png") 2>$null | Out-Null
  Adb shell rm -f $remote | Out-Null
}
function Dump() { return (Adb shell uiautomator dump /dev/tty 2>$null | Out-String) }

Adb logcat -c | Out-Null
Say "نفتح الواجهة"
Adb shell am start -n app.riwaq.tv/.MainActivity | Out-Null
Start-Sleep -Seconds 8
$top = (Adb shell dumpsys activity activities 2>$null | Select-String "ResumedActivity" | Out-String)
if ($top -notmatch "app\.riwaq\.tv") { Fail "رواق مو ظاهر في الشاشة" } else { Say "الواجهة ظاهرة ✓" }
# معالج الإعداد مفتوح (لسا ما انختارت مدينة مثلاً): نقفله عشان الأزرار توصل للواجهة
if ($top -match "SetupActivity") { Say "معالج الإعداد مفتوح، نقفله للفحص"; Keys @("KEYCODE_BACK"); Start-Sleep -Seconds 2 }
Shot "1-home"

Say "يومك: السهم تحت"
Keys @("KEYCODE_DPAD_DOWN", "KEYCODE_DPAD_DOWN")
Shot "2-day"
Keys @("KEYCODE_DPAD_UP")

Say "القرآن: الشيخ، ثم السورة"
Keys @("KEYCODE_DPAD_UP", "KEYCODE_DPAD_RIGHT", "KEYCODE_DPAD_RIGHT", "KEYCODE_DPAD_RIGHT", "KEYCODE_DPAD_RIGHT", "KEYCODE_DPAD_RIGHT", "KEYCODE_DPAD_CENTER")
Shot "3-quran"
Keys @("KEYCODE_DPAD_DOWN", "KEYCODE_DPAD_DOWN", "KEYCODE_DPAD_DOWN", "KEYCODE_DPAD_LEFT")
Shot "4-surahs"
Keys @("KEYCODE_DPAD_CENTER")
Start-Sleep -Seconds 12
Shot "5-player"
$svc = (Adb shell dumpsys activity services app.riwaq.tv 2>$null | Out-String)
if ($svc -notmatch "TilawaService") { Fail "خدمة التلاوة ما اشتغلت" } else { Say "خدمة التلاوة شغالة ✓" }
$audio = (Adb shell dumpsys audio 2>$null | Out-String)
if ($audio -match "state:started") { Say "فيه صوت يشتغل ✓" } else { Say "ما قدرنا نتأكد من الصوت من النظام (طبيعي في المحاكي بدون صوت)" }

Say "إيقاف التلاوة"
Keys @("KEYCODE_DPAD_RIGHT", "KEYCODE_DPAD_RIGHT", "KEYCODE_DPAD_CENTER")
Start-Sleep -Seconds 2
Keys @("KEYCODE_BACK", "KEYCODE_BACK")
Shot "6-after"

$errors = (Adb logcat -d 2>$null | Select-String -Pattern "FATAL EXCEPTION|RiwaqJsError|Uncaught" | Out-String)
if ($errors.Trim()) { Fail "أخطاء في السجل:`n$errors" } else { Say "ما فيه أخطاء في السجل ✓" }
if ($bad) { Write-Host "✗ فيه $bad مشكلة" -ForegroundColor Red; exit 1 }
Say "تم ✓"
