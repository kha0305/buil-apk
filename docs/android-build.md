# Build APK Android trên máy Windows của kha

## Cần cài trước

- Node.js 22 (LTS)
- Java 21 (Temurin hoặc Oracle — workflow của EasyTier dùng Oracle 21, Tauri 2.12
  yêu cầu Java 17 trở lên; dùng 21 cho khớp workflow)
- Android Studio (kèm SDK + NDK). NDK bản **26.0.10792818** (theo workflow
  EasyTier đã chạy thật). SDK: `platforms;android-34`, `build-tools;34.0.0`.
- Biến môi trường: `ANDROID_HOME` trỏ tới thư mục SDK
  (vd `C:\Users\ASUS\AppData\Local\Android\Sdk`), `NDK_HOME` trỏ tới
  `%ANDROID_HOME%\ndk\26.0.10792818`.

## Các bước

```powershell
cd D:\duong-dan-toi\notes-app
npm ci
npm run build
npx tauri android init
npx tauri android build --apk
```

APK chưa ký nằm ở:

```
src-tauri\gen\android\app\build\outputs\apk\universal\release\app-universal-release.apk
```

Cài lên điện thoại: chép APK qua USB rồi bấm cài, hoặc `adb install <đường dẫn APK>`.

## Ký APK release (khi cần phát hành)

- Tạo keystore 1 lần (giữ file + mật khẩu, mất keystore là mất quyền cập nhật app):
  ```powershell
  keytool -genkeypair -v -keystore upload-keystore.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
  ```
- Tạo `src-tauri\gen\android\keystore.properties` theo mẫu của Blinko:
  ```
  storeFile=../../upload-keystore.jks
  storePassword=<mật khẩu keystore>
  keyAlias=upload
  keyPassword=<mật khẩu key>
  ```
  Không commit file này (đã có trong `.gitignore`).
- Chạy lại `npx tauri android build --apk` sẽ cho APK đã ký.

## Cách khác: GitHub Actions

Push repo lên GitHub, vào tab Actions → "Build APK Android" → Run workflow.
Xong tải artifact `ghi-chu-apk`. Chưa chạy thật — cần kha push repo rồi bấm chạy.
