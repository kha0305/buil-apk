# Lam 1 lan: tao keystore ky release + cap nhat code v3 + push len GitHub.
# Chay: powershell -ExecutionPolicy Bypass -File .\tao-keystore-va-push.ps1
# Can: keytool (theo Java 21), git, file notes-app-v3-release.zip trong Downloads.
# File nay viet khong dau de PowerShell 5.1 doc khong bi loi font.

$ErrorActionPreference = "Stop"
$projectDir = "D:\tool\app-android\buil-apk"
$zipPath = "$env:USERPROFILE\Downloads\notes-app-v3-release.zip"

# 1. Nhap 2 mat khau (khong hien ra man hinh). Hai mat khau co the giong nhau.
$storePassSec = Read-Host "Nhap mat khau kho keystore" -AsSecureString
$keyPassSec = Read-Host "Nhap mat khau khoa (Enter = dung giong mat khau kho)" -AsSecureString
$storePass = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($storePassSec))
$keyPass = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($keyPassSec))
if (-not $keyPass) { $keyPass = $storePass }

# 2. Tim keytool (theo Java 21).
$keytool = (Get-Command keytool -ErrorAction SilentlyContinue | Select-Object -First 1).Source
if (-not $keytool) {
  $keytool = Get-ChildItem "C:\Program Files\Eclipse Adoptium\jdk-21*\bin\keytool.exe" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $keytool) {
  $keytool = Get-ChildItem "C:\Program Files\Android\openjdk\jdk-21*\bin\keytool.exe" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $keytool) {
  $keytool = Get-ChildItem "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $keytool) { throw "Khong tim thay keytool. Hay chac Java 21 da cai roi chay lai." }

# 3. Tao keystore (de file cu neu co thi hoi truoc).
$keystore = Join-Path $projectDir "ghi-chu-release.keystore"
if (Test-Path $keystore) {
  $ans = Read-Host "Da co file ghi-chu-release.keystore, ghi de va tao moi? (y/n)"
  if ($ans -ne "y") { throw "Da dung, giu keystore cu." }
  Remove-Item $keystore -Force
}
& $keytool -genkeypair -v -keystore $keystore -alias ghi-chu -keyalg RSA -keysize 2048 -validity 10000 -storepass $storePass -keypass $keyPass -dname "CN=Cao Nguyen Bao Kha, O=Ghi chu"

# 4. Ma base64 + sao luu keystore ra ngoai repo.
certutil -encode $keystore (Join-Path $projectDir "ghi-chu-release.b64") | Out-Null
Copy-Item $keystore "$env:USERPROFILE\Documents\ghi-chu-release.keystore" -Force
Write-Host "Da sao luu keystore vao Documents. Giu file nay can than, mat la khong cap nhat app duoc nua."

# 5. Giai nen code v3 de len project roi push.
Set-Location $projectDir
Expand-Archive -Path $zipPath -DestinationPath . -Force
git add -A
git commit -m "Doi sang ban release ky bang keystore co dinh"
git push

Write-Host ""
Write-Host "XONG PHAN TU DONG. Con 1 buoc tay: them 4 secrets tren GitHub (repo buil-apk > Settings > Secrets and variables > Actions):"
Write-Host "  ANDROID_KEYSTORE_BASE64 = noi dung file ghi-chu-release.b64 trong thu muc project"
Write-Host "  ANDROID_KEYSTORE_PASSWORD = mat khau kho vua nhap"
Write-Host "  ANDROID_KEY_ALIAS = ghi-chu"
Write-Host "  ANDROID_KEY_PASSWORD = mat khau khoa vua nhap"
Write-Host "Them xong secrets thi workflow tu chay lai (hoac bam Run workflow). Sau do go app debug cu tren dien thoai roi cai file ghi-chu-0.1.0-release.apk moi."
