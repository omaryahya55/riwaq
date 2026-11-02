# رواق: يحدّث رابط التحميل الثابت (فرع dl) بآخر نسخة من التطبيق.
# الرابط ما يتغير أبداً، فالرقم المسجّل في go.aftvnews.com يبقى صالح مع كل تحديث:
#   https://raw.githubusercontent.com/omaryahya55/riwaq/dl/riwaq.apk
# الاستخدام (بعد ما تبني الـ APK):  .\tools\publish-dl.ps1 -Apk dist\riwaq-0.2.1.apk
param([Parameter(Mandatory = $true)][string]$Apk)

$ErrorActionPreference = "Stop"
if (-not (Test-Path $Apk)) { throw "ما لقينا الملف: $Apk" }
$Apk = (Resolve-Path $Apk).Path
$repo = (git -C $PSScriptRoot remote get-url origin).Trim()
$tmp = Join-Path $env:TEMP "riwaq-dl-$([guid]::NewGuid().ToString('N').Substring(0,8))"

git clone -q --branch dl --single-branch $repo $tmp
Copy-Item $Apk (Join-Path $tmp "riwaq.apk") -Force
Push-Location $tmp
git add riwaq.apk
if (git status --porcelain) {
  git commit -q -m "تحديث ملف التحميل الثابت: $([IO.Path]::GetFileName($Apk))"
  git push -q origin dl
  Write-Host "✓ انحدّث: https://raw.githubusercontent.com/omaryahya55/riwaq/dl/riwaq.apk" -ForegroundColor Green
} else {
  Write-Host "الملف نفسه، ما تغيّر شي." -ForegroundColor Yellow
}
Pop-Location
Remove-Item $tmp -Recurse -Force
