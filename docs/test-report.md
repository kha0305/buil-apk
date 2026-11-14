# Kết quả test thật trên VM — 14/11/2026

## Đã chạy và đậu

### 1. Frontend build — ĐẬU

Lệnh: `npm install` (26 packages, 28s) rồi `npm run build`.

```
> ghi-chu@0.1.0 build
> tsc && vite build
vite v8.3.8 building client environment for production...
✓ 25 modules transformed.
dist/index.html                   0.53 kB
dist/assets/index-PtxcC4bB.css    2.41 kB
dist/assets/index-Sc3sqLvJ.js   226.92 kB
✓ built in 313ms
```

Kiểm thêm: `dist/index.html` dùng đường dẫn tương đối (`./assets/...`,
`./vite.svg`) — đúng `base: './'`, không còn nguy cơ màn hình trắng;
bundle có 0 lần `localhost:1420`.

### 2. Lõi Rust (CRUD + SQLite) — ĐẬU 9/9 trong crate Tauri thật

Lệnh: `cargo test --manifest-path src-tauri/Cargo.toml`

```
running 9 tests
test notes::tests::new_note_deserializes_from_camel_case_json ... ok
test notes::tests::serde_note_round_trip_uses_camel_case ... ok
test notes::tests::search_vietnamese_case_insensitive ... ok
test notes::tests::missing_note_returns_not_found_error ... ok
test notes::tests::sql_injection_attempt_is_stored_literally ... ok
test notes::tests::toggle_pin_keeps_updated_at_and_flips_pinned ... ok
test notes::tests::crud_flow ... ok
test notes::tests::wal_mode_and_data_persist_across_reopen ... ok
test notes::tests::sort_pinned_first_then_updated_at_desc ... ok
test result: ok. 9 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```

Muốn chạy được lệnh này trên VM đã phải cài `libwebkit2gtk-4.1-dev`
(`webkit2gtk-4.1` 2.52.6, `libsoup-3.0` 3.4.4) — vướng 2 lỗi, đã xử lý:

- `apt-get update` chạy ~12 phút mới xong (mirror chậm, thư mục lists 408MB),
  rồi báo `held broken packages`: gốc là `libzstd1` bản `...hatch1` của VM
  xung đột với `libzstd-dev` stock — đã downgrade riêng `libzstd1` về
  `1.5.5+dfsg2-2build1.1` (dry-run xác nhận chỉ đổi 1 gói, không gỡ gì).
- Lệnh cài ban đầu đòi cả `libappindicator3-dev` lẫn
  `libayatana-appindicator3-dev` — 2 gói này xung đột nhau, đã bỏ ayatana,
  chỉ giữ `libappindicator3-dev`.

Chính lần test tạm trước đó (copy nguyên văn `db.rs`/`notes.rs` sang crate tạm
`/tmp/core-check`) đã bắt được 1 lỗi thật: sau khi sửa `update_note` về dùng
`params!`, file thiếu `Ok(Note {` nên không biên dịch. Đã sửa và chạy lại
đủ 9/9 trong crate thật. (Lỗi này chứng tỏ không được tin code chưa chạy test.)

### 3. Build desktop Tauri thật — ĐẬU (binary + .deb + .rpm; AppImage lỗi riêng)

Lệnh: `npx tauri build` (lần đầu biên dịch release 9m 53s).

- Binary release: `src-tauri/target/release/ghi-chu` — build xong.
- Đã bundle được: `Ghi chú_0.1.0_amd64.deb` (2,79 MiB),
  `Ghi chú-0.1.0-1.x86_64.rpm`.
- Lỗi duy nhất: bước AppImage văng
  `failed to bundle project: invalid name "ghi-chú": contains invalid character`
  — tên AppImage lấy từ `productName: "Ghi chú"` có dấu, AppImage không chấp
  nhận ký tự này. Đã thử 2 cách:
  - Khóa `bundle.targets` trong `tauri.conf.json` thành
    `["deb", "rpm", "nsis", "msi", "dmg"]`: **không có tác dụng** với CLI
    2.12.4 — chạy lại vẫn văng đúng lỗi AppImage (đã trả targets về `"all"`
    như template mặc định, khỏi để config gây hiểu lầm).
  - Chạy `npx tauri build --bundles deb`: **đậu, exit 0**, ra đúng file
    `Ghi chú_0.1.0_amd64.deb` (2,79 MiB).
- Kết luận: app build sạch; chỉ riêng bước AppImage trên Linux kẹt vì dấu
  trong productName. Cách làm khi cần: thêm cờ `--bundles deb` (hoặc đổi
  productName thành "Ghi Chu" không dấu nếu cần AppImage). Không ảnh hưởng
  APK Android — Android dùng identifier `com.kha.ghichu`, không dùng
  productName làm tên file.

### 4. Version đã pin — ĐÃ XÁC MINH

- `tauri` 2.12.5 và `tauri-build` 2.7.4: `Cargo.lock` đã resolve đúng 2 số này.
  Phát hiện khi chạy thật: **không có `tauri-build` 2.12.x** (crates.io chốt
  2.x ở 2.7.4) — pin `=2.12.5` cho cả hai crate thì cargo báo lỗi resolve.
  Đã sửa `Cargo.toml` pin theo từng crate.
- `@tauri-apps/api` 2.12.4 + `@tauri-apps/cli` 2.12.4: đã cài thật, kiểm chứng
  trong `node_modules` và `package-lock.json`.
- `onBackButtonPress`: xác minh trực tiếp trong `@tauri-apps/api/app.d.ts`
  đã cài — export từ `@tauri-apps/api/app`, payload `{ canGoBack }`,
  có từ 2.9.0; `exit()` cần quyền `core:app:allow-exit` (đã có trong
  capabilities).
- Workflow GitHub Actions: YAML parse OK (`python yaml.safe_load`), job
  `build-android`. Chưa chạy thật trên GitHub Actions.

## Đã chạy và đậu — bản v2 tag (14/11/2026, thêm sau bản đầu)

### 5. Tag + nhóm tag — ĐẬU 15/15 (9 cũ + 6 mới)

Lệnh: `cargo test --manifest-path src-tauri/Cargo.toml` (chạy lại sau khi thêm
`src-tauri/src/tags.rs`, migration v2 `tags` + `note_tags`, `PRAGMA user_version = 2`).

6 test mới, tất cả đậu:
`set_tags_creates_tags_and_returns_them`,
`note_appears_under_two_tags` (tag Học đếm 2 note, tag Thi đếm 1),
`removing_all_tags_clears_note_tags_but_keeps_tag_names`,
`duplicate_names_collapse_case_insensitively` ("học"/"HỌC"/" Học " gộp thành một),
`set_tags_on_missing_note_errors`,
`migration_keeps_old_notes` (database cũ kiểu v1, chưa có bảng tags, mở bằng
`open_db` vẫn giữ đủ note, `user_version` lên 2).

9 test cũ vẫn đậu, không sửa test cũ.

### 6. Frontend build bản v2 — ĐẬU

Lệnh: `npm run build` (tsc + vite build, 308ms, 25 modules, js 231,20 kB,
css 3,70 kB). Chưa test được trên VM: kéo thả bằng tay trên điện thoại thật,
nút Back, safe-area, gõ Gboard tiếng Việt trong ô tag, hiệu năng danh sách dài.

## Chưa test được — cần máy Windows + điện thoại thật của kha

- Build Android (`tauri android init/build`), ký APK, cài APK lên máy thật.
- Tauri/IPC thật (invoke từ WebView), nút Back, bàn phím + gõ Gboard tiếng Việt,
  safe-area edge-to-edge, hiệu năng vuốt danh sách dài, chạy binary desktop
  (VM không có màn hình để mở WebView).
- Kéo thả tag bằng tay trên điện thoại thật (nhấn giữ 400ms mới nhấc note lên,
  thả vào nhóm tag để gắn, thả vào nhóm Chưa gắn tag để gỡ hết).
- Chạy workflow GitHub Actions thật (cần push repo lên GitHub).

Kế hoạch test tay trên điện thoại: xem `tests/android-manual.md`.

## Lưu trạng thái thu gọn nhóm tag (migration v3)
- Bảng `settings(key, value)` + 2 lệnh Rust `get_setting`/`set_setting`; nhóm nào
  đang thu gọn lưu dưới key `collapsed_groups` (JSON mảng tên nhóm).
- ListPage đọc lúc mở app, ghi ngay mỗi lần bấm thu gọn/mở nhóm — mở note rồi
  quay lại hay tắt app mở lại đều giữ nguyên. DB cũ tự nâng lên v3, note/tag còn nguyên.
- `cargo test`: 18 passed (15 cũ + 3 mới cho settings), `npm run build` đậu.

## Thùng rác + chọn nhiều note kéo một lượt (migration v4)
- Migration v4: thêm cột `deleted_at` vào bảng notes (null = còn dùng);
  `update_note`/`toggle_pin`/`get_note` bỏ qua note trong thùng rác;
  số lượng mỗi tag không tính note trong thùng rác.
- 5 lệnh Rust mới: `trash_note` (ghi mốc xóa), `restore_note`,
  `delete_forever` (note_tags tự xóa theo CASCADE), `list_trash` (mới xóa
  nhất trước), `empty_trash`. Note trong thùng rác giữ 30 ngày (chỉ hiển
  thị hạn, chưa tự xóa hết hạn).
- Kéo thả: đang kéo thì vùng thùng rác hiện cố định ở đáy màn hình, thả vào
  thì xóa, thả vào nhóm tag thì gắn tag như cũ. Nút Xóa trong editor cũng
  cho note vào thùng rác. Trang Thùng rác riêng: Khôi phục / Xóa hẳn từng
  note, Dọn sạch, hiện ngày xóa và số ngày còn lại.
- Chọn nhiều: nút Chọn ở đầu danh sách, bấm thẻ để chọn/bỏ chọn, đầu trang
  hiện "Đã chọn N", Hủy hoặc nút Back thoát chế độ chọn. Nhấn giữ một note
  đã chọn rồi kéo thì kéo cả N note (bản sao bay theo tay ghi "N ghi chú"),
  thả vào nhóm tag hoặc thùng rác áp dụng cho cả N note; gắn tag/trash
  chạy lần lượt từng note, note nào lỗi thì báo và dừng ở đó.
- `cargo test`: 23 passed (18 cũ + 5 mới: 4 thùng rác + 1 số lượng tag),
  `npm run build` đậu.

## Quản lý tag (không cần migration mới)
- 2 lệnh Rust mới trong tags.rs: `rename_tag` (đổi tên; trùng tên khác — không
  phân biệt hoa thường — thì gộp: chuyển hết note sang tag đó rồi xóa tag cũ,
  trong 1 transaction) và `delete_tag` (xóa tag + note_tags theo CASCADE, note
  vẫn còn). Helper `get_tag` lấy 1 tag kèm số note (note trong thùng rác không
  tính), lỗi "Tag not found" nếu không có.
- Trang Quản lý tag riêng (TagsPage.tsx, theo mẫu TrashPage): đổi tên inline
  (Lưu/Hủy, Enter lưu, Esc hủy), xóa có confirm ghi rõ số ghi chú bị gỡ tag;
  xong thì tải lại cả notes lẫn tags. Nút "Quản lý tag" ở đầu màn hình danh sách.
- `cargo test`: 29 passed (23 cũ + 6 mới cho rename/delete), `npm run build` đậu.

## Nhắc hẹn + sao lưu + xếp thứ tự nhóm (migration v5)
- Nhắc hẹn (migration v5): thêm cột `remind_at` vào bảng notes; lệnh
  `set_reminder` đặt/gỡ (null = gỡ). Editor có ô `datetime-local` + nút
  Đặt/Đổi/Gỡ nhắc hẹn, giờ nhập là giờ địa phương (helper `lib/dates.ts`,
  không dùng toISOString). App kiểm mỗi 60 giây và mỗi khi danh sách note
  đổi: note tới giờ thì hiện bảng nhắc, kêu một tiếng bíp bằng WebAudio
  (`lib/beep.ts`, không thêm file âm thanh), gỡ nhắc hẹn để chỉ nhắc 1 lần.
  CHỈ nhắc khi app đang mở — tắt app rồi tới giờ thì không nhắc.
- Sao lưu (không dùng plugin): lệnh `export_backup` trả JSON
  {version: 1, notes (kể cả thùng rác, kèm tags/deleted_at/remind_at),
  tags, settings}; `import_backup` kiểm tra dạng và version rồi thay thế
  toàn bộ dữ liệu trong 1 transaction (giữ nguyên id cũ), trả số note đã
  nhập. Trang Sao lưu riêng: nút Chia sẻ dùng `navigator.share` (hủy chia
  sẻ thì im lặng), không hỗ trợ share thì hiện JSON + nút Sao chép; nhập
  bằng ô dán JSON, có confirm thay thế toàn bộ trước khi nhập.
- Xếp thứ tự nhóm: thứ tự lưu trong settings key `tag_order` (JSON mảng tên
  tag), không thêm migration. Kéo tiêu đề nhóm (nhấn giữ ~400ms, tái dùng
  kéo thả bằng pointer events) thì hiện vạch chèn giữa các nhóm, thả ra lưu
  thứ tự ngay. Bấm thường vào tiêu đề vẫn thu gọn/mở nhóm, kéo note vẫn như
  cũ. Tag chưa có trong danh sách xếp cuối theo tên; nhóm "Chưa gắn tag"
  luôn cuối; tag đổi tên sẽ rơi xuống cuối (thứ tự lưu theo tên cũ).
- `cargo test`: 33 passed (29 cũ + 4 mới: 2 nhắc hẹn + 2 sao lưu),
  `npm run build` đậu.
