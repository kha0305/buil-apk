# Đã tận dụng repo nào — kết quả thử thật 14/11/2026

## 1. Template chính thức `create-tauri-app` — DÙNG ĐƯỢC, đã scaffold thật

- Lệnh đã chạy thật trên VM:
  `npm create tauri-app@latest notes-scaffold -- --manager npm --template react-ts --identifier com.kha.ghichu --tauri-version 2 --yes`
  (create-tauri-app 4.7.5). Scaffold tạo đủ cây project: `package.json`,
  `vite.config.ts`, `src-tauri/Cargo.toml`, `tauri.conf.json`, capabilities, icons.
- Scaffold báo thiếu Rust trong PATH (shell không login) và thiếu
  webkit2gtk/rsvg2 trên Linux — không phải lỗi scaffold, bỏ qua được.
- Đã sửa sau scaffold (theo skill + nghiên cứu bug P0):
  pin Tauri, thêm `base: './'` (scaffold thiếu → màn hình trắng bản release),
  gỡ plugin-opener + hàm `greet`, đổi tên "Ghi chú", capabilities chỉ
  `core:default` + `core:app:allow-exit`, sửa `.expect()` trong `run()`.

## 2. EasyTier `.github/workflows/mobile.yml` (166 dòng) — LẤY MẪU WORKFLOW

Đọc thật qua GitHub MCP `get_file_contents` (EasyTier/EasyTier). Đã lấy:

- `android-actions/setup-android@v3` với `cmdline-tools-version: 11076708`,
  `build-tools;34.0.0`, `ndk;26.0.10792818`, `platforms;android-34`.
- Java 21, cài 4 target Rust Android, `Swatinem/rust-cache@v2`.
- `tauri android build --apk`, APK ở
  `src-tauri/gen/android/app/build/outputs/apk/*/release/*.apk`.
- Không dùng được: action nội bộ `./.github/actions/prepare-build` (riêng của
  EasyTier), job `pre_job` lọc đường dẫn + skip-duplicate (không cần cho
  project nhỏ), `--split-per-abi` (notes-app chỉ cần 1 APK universal).

## 3. Blinko `.github/workflows/app-release.yml` (612 dòng) — LẤY MẪU KÝ APK

Đọc thật qua GitHub MCP `get_file_contents` (blinkospace/blinko). Đã lấy:

- Cách ký release: giải mã keystore từ secret thành
  `~/.android/upload-keystore.jks` + file `keystore.properties`.
- Công thức versionCode = `major * 1_000_000 + minor * 1_000 + patch`.
- Kiểm tra APK bằng `aapt dump badging`, đổi tên APK theo version.
- Không dùng được: `cargo install tauri-cli --version "^2.0.0-alpha"` (đã cũ),
  Java 17 (Tauri 2.12 dùng Java 21 cho khớp EasyTier), Bun 1.2.8 (notes-app
  dùng npm), trigger theo tag + release (notes-app mới chỉ cần build APK
  theo `workflow_dispatch`/push main).

## 4. `kha0305/buil-apk` `.github/workflows/build-apk.yml` (88 dòng) — CHỈ THAM KHẢO CẤU TRÚC

Đọc thật qua GitHub MCP `get_file_contents`. Workflow build APK cho Nhật ký xe
(Capacitor): Node 22, Java 21 (temurin), `npm install`, `npx cap add android`,
`npx cap sync android`, giải mã `debug.keystore.b64`, `./gradlew assembleDebug`,
APK debug ở `android/app/build/outputs/apk/debug/app-debug.apk`.

Không copy nguyên vì đây là Capacitor, không phải Tauri: không có Rust/NDK/
`tauri android build`, dùng `cap add/sync` thay cho `tauri android init`,
APK debug thay vì release universal. Chỉ tham khảo được cấu trúc chung
(Node 22, Java 21, checkout, upload artifact) và cách ký debug.
