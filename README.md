# App Ghi chú — Tauri Mobile 2.12 + React + SQLite

App ghi chú offline, không tài khoản, không server, không scrape myDTU.
Mục đích: test AI làm app tới đâu (nhất là UI / độ mượt).

## Tính năng

- Danh sách: tìm kiếm (tiếng Việt không phân biệt hoa/thường), ghim lên trước,
  nút + tạo ghi chú mới.
- Editor: tiêu đề + nội dung bằng `<textarea>` uncontrolled, chọn màu,
  ghim/bỏ ghim, xóa, tự lưu sau khi ngừng gõ 800ms (không lưu khi đang gõ
  Telex/VNI — có guard composition).
- Nút Back Android: ở editor thì về danh sách, ở danh sách thì thoát app
  (dùng `onBackButtonPress()` của `@tauri-apps/api/app`, có từ Tauri 2.9.0).

## Cấu trúc (chuẩn chung theo skill `code-bug-short`)

```
src/
  lib/types.ts          # Note, NewNote, COLOURS
  services/notesApi.ts  # API gọi Rust qua invoke, một file một nhóm API
  components/NoteCard.tsx
  pages/ListPage.tsx
  pages/EditorPage.tsx
  App.tsx               # điều hướng 2 màn + xử lý nút Back
  styles.css            # màu giấy ấm, safe-area, 100dvh
src-tauri/
  src/lib.rs            # chỉ chứa #[tauri::command] mỏng + setup mở DB
  src/db.rs             # DbState, open_db, migration, helper lock/get_note/exec_one
  src/notes.rs          # lõi CRUD + 9 test
  capabilities/default.json   # chỉ core:default + core:app:allow-exit
tests/                  # ghi chú test (test Rust nằm trong src-tauri/src/notes.rs)
docs/
  android-build.md      # build APK trên máy Windows của kha
  reused-workflows.md   # đã tận dụng repo nào, chỗ nào, chỗ nào không dùng được
  test-report.md        # kết quả test thật trên VM + phần chưa test được
```

## Phiên bản đã pin

- Tauri Rust `2.12.5` (GitHub Releases tag `tauri-v2.12.5`, 21/10/2026).
  Lưu ý: `tauri-build` KHÔNG có bản 2.12.x — crates.io chốt 2.x ở `2.7.4`,
  pin theo từng crate, đừng ép `tauri-build = 2.12.5`.
- `@tauri-apps/api` `2.12.4`, `@tauri-apps/cli` `2.12.4` (npm latest 2.x).
- React 19.1, Vite 8, TypeScript 6, rusqlite 0.41 (bundled SQLite).

## Chạy test trên VM

```sh
npm install
npm run build          # tsc + vite build
cargo test --manifest-path src-tauri/Cargo.toml   # cần webkit2gtk-4.1-dev (Linux)
```

Xem kết quả thật trong `docs/test-report.md`.

## Build APK (máy Windows của kha)

Xem `docs/android-build.md`. Tóm tắt: Android Studio + SDK/NDK, Java 21,
Node 22, rồi `npm ci && npm run build && npx tauri android init && npx tauri android build --apk`.
Hoặc dùng workflow `.github/workflows/android-apk.yml` trên GitHub Actions.
