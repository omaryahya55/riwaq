# رواق: يحدّث رابط التحميل الثابت (فرع dl) بآخر نسخة من التطبيق.
# الرابط ما يتغير أبداً، فالرقم المسجّل في go.aftvnews.com يبقى صالح مع كل تحديث:
#   https://raw.githubusercontent.com/omaryahya55/riwaq/dl/riwaq.apk       النسخة الخفيفة (lite)
#   https://raw.githubusercontent.com/omaryahya55/riwaq/dl/riwaq-full.apk  النسخة الكاملة (full)
# lite = بدون خدمة إمكانية الوصول: تتركّب من Downloader بدون ما تحظرها Play Protect.
# full = فيها الضغطة المطوّلة وأزرار الريموت: تتركّب بـ ADB (أو بعد إيقاف Play Protect).
# الاستخدام (بعد ما تبني النسختين):
#   .\tools\publish-dl.ps1 -Apk dist\riwaq-0.2.2.apk -Full dist\riwaq-full-0.2.2.apk
param([Parameter(Mandatory = $true)][string]$Apk, [string]$Full = "")

$ErrorActionPreference = "Stop"
if (-not (Test-Path $Apk)) { throw "ما لقينا الملف: $Apk" }
$Apk = (Resolve-Path $Apk).Path
$repo = (git -C $PSScriptRoot remote get-url origin).Trim()
$tmp = Join-Path $env:TEMP "riwaq-dl-$([guid]::NewGuid().ToString('N').Substring(0,8))"

git clone -q --branch dl --single-branch $repo $tmp
Copy-Item $Apk (Join-Path $tmp "riwaq.apk") -Force
if ($Full) { Copy-Item (Resolve-Path $Full).Path (Join-Path $tmp "riwaq-full.apk") -Force }
Push-Location $tmp
git add -A
if (git status --porcelain) {
  git commit -q -m "تحديث ملفات التحميل الثابتة: $([IO.Path]::GetFileName($Apk))"
  git push -q origin dl
  Write-Host "✓ انحدّث: https://raw.githubusercontent.com/omaryahya55/riwaq/dl/riwaq.apk" -ForegroundColor Green
} else {
  Write-Host "الملفات نفسها، ما تغيّر شي." -ForegroundColor Yellow
}
Pop-Location
Remove-Item $tmp -Recurse -Force
