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

## Icon Android không nhận icon mới (v15)
- Nguyên nhân: `tauri android init` chỉ copy template, file mipmap trong
  template là icon xoáy Tauri mặc định — đã kiểm chứng từ mã nguồn
  tauri-cli 2.12.4: không bước nào của init/build đọc
  `src-tauri/icons/icon.png` để thay chúng. Vì vậy mọi APK từ v10 tới v14
  đều mang icon mặc định dù icon.png trên repo đã là icon mới (kiểm tra
  hash khớp) — không phải do launcher cache.
- Cách sửa: script `scripts/fix-android-icons.py` (ghi đè 15 file mipmap trong `gen/android/.../res` từ `icon.png`, theo đúng kích thước và cách cắt góc của `tauri icon`), chạy trong workflow ngay sau bước `tauri android init`, trước khi Gradle build.

## Menu — thanh điều hướng dưới cùng (v16, mẫu 4)
- Kha chọn mẫu 4 trong 4 mẫu menu (22:48 14/11): thanh cố định đáy màn
  hình, 4 mục Ghi chú / Quản lý tag / Thùng rác / Sao lưu; mục đang mở in
  đậm + gạch đỏ. Mẫu dropdown ☰ đã code trước đó bị bỏ (không giao).
- Thanh hiện ở các màn chính (danh sách, tag, thùng rác, sao lưu), không
  hiện ở màn sửa note. Vùng thùng rác khi kéo note dời lên trên thanh
  dưới; nội dung cuối trang chừa 76px để không bị thanh che.
- `npm run build` đậu. Chưa kiểm trên máy thật: cảm giác bấm tab, độ cao
  thanh trên máy kha (safe-area), vùng thùng rác khi kéo có vừa tầm tay
  không.
- Icon cho thanh dưới: lúc đầu chỉ có chữ (tỉ vẽ sẵn bằng tay), kha hỏi
  "sao ko làm dạng icon" (22:49) nên đổi sang icon SVG + chữ nhỏ: ghi
  chú = tờ giấy, tag = thẻ tag, thùng rác = thùng rác, sao lưu = mây
  tải lên; mục đang mở vẫn đỏ + gạch đỏ.
- Icon nổi: kha chọn "4 icon nổi khỏi thanh" (22:51) — mỗi icon nằm trong
  vòng tròn kem 44px nhô lên trên mép thanh, có bóng đổ; mục đang mở thì
  vòng tròn đỏ, icon trắng. Nội dung cuối trang và vùng thùng rác dời lên
  104px để không bị icon nổi che.

## Menu kiểu M3E (v17)
- Kha tự vẽ trên M3E Canvas (23:30 14/11) và chốt mẫu này: thanh dưới 5
  mục, nút + là nút tròn đỏ lớn nổi giữa thanh, mục đang mở có viên thuốc
  nền nhạt sau icon (không còn vòng tròn nổi từng icon như v16). Nút +
  dời từ đầu danh sách xuống giữa thanh. Màu vẫn theo theme của app (kem
  + đỏ), không đổi sang theme nâu Amber mặc định của M3E Canvas.
- `npm run build` đậu. Chưa kiểm trên máy thật: nút + có vừa tay không,
  viên thuốc có rõ không, nhãn "Tag" có rõ là Quản lý tag không.

## Thêm 5 màu, mặc định trắng (23:50 14/11)
- Kha hỏi còn màu nào không, tỉ đưa 5 màu pastel ứng cử viên, kha chốt
  "thêm đi, mặc định cho trắng": COLOURS thêm peach (#fbd3ae), lavender
  (#e6dcf7), sky (#bfe0f2), sage (#c4d6a4), white (#fffdf7) — tổng 15 màu.
  Chấm trắng có viền #e6dcc8 để nhìn thấy trên nền kem. Note mới tạo
  mặc định màu trắng (App.tsx newNote, trước là vàng).
- `npm run build` đậu. Chưa kiểm trên máy thật: 15 chấm màu có vừa 2 hàng
  không, ô trắng có phân biệt được với nền trang không.

## Giao diện mới v18 (15/11/2026)

### Đã chạy và đậu
- `npm run build` (tsc + vite): đậu, 37 modules, JS ~285 kB.
- `cargo test`: **53 passed / 0 failed, 0 warning** (33 cũ + 7 notify
  mới + 12 backend v18 mới + 1 test sao lưu mới). Lệnh Rust `rename_tag`
  giờ 4 tham số, `reorder_notes` có 3 test riêng (bền sau mở lại DB,
  không đụng nhóm khác, idempotent), `rename_tag` có test trùng tên
  ("Tên tag này đã có rồi.") và chuẩn hóa hex → tên id.
- `mergeReorder` + `clampToTier` (xếp note trong nhóm): 10 case logic
  chạy bằng Node đều đậu (kéo lên/xuống, thả đúng chỗ = không đổi, đang
  tìm kiếm thì note ẩn giữ đúng vị trí, kẹp tầng ghim 2 chiều).
- Script patch thông báo (`scripts/patch-android-notification.py`) đã
  kiểm trên cây Android giả lập: chạy 3 lần cho kết quả y nhau, âm chép
  đúng md5, 5 icon `ic_notepad` đúng cỡ, thiếu file nguồn thì báo lỗi rõ.
- Workflow GitHub Actions: YAML parse đậu; bước thông báo mới nằm ngay
  sau bước thay icon, trước bước ký.

### Đã làm (tóm tắt)
- Backend: migration v6 (tag thêm `icon`/`colour`, bảng `note_order`
  giữ thứ tự note riêng từng nhóm; tag id 0 là dòng sentinel cho nhóm
  "Chưa gắn tag"). `rename_tag` báo lỗi khi trùng tên (bỏ gộp im lặng
  v14), `delete_tag` đã xóa, `list_tags` chỉ trả tag còn note kèm
  `noteIds` theo thứ tự hiển thị, `reorder_notes` ghi thứ tự theo nhóm.
  Màu tag chuẩn hóa về tên id khi ghi (hex cũng chấp nhận).
- Trang chính: chip lọc (Tất cả/tag/Chưa gắn tag), tagbox nhuộm nhạt
  theo màu tag, đầu nhóm 1 hàng (pill tên + "N note", không chevron),
  chấm màu khi thu gọn (xếp theo bảng màu), đổi tên tag inline (nhấn giữ
  pill hoặc bút ✎, lưu tên+icon+màu 1 lần), kéo xếp note trong nhóm
  (helper "slots" giữ chỗ note ẩn), menu chọn (Chọn tất cả theo note
  đang hiện, chọn theo nhóm qua nút "N note", xóa cả đám không xác nhận),
  thanh dưới 3 mục + FAB nằm gọn trong thanh, hiệu ứng xóa mờ+co 350ms,
  màn chờ loading thật (nền kem + icon sổ vàng + vòng xoay).
- Editor: 1 giao diện chung cho tạo/sửa, 2 thẻ riêng (tiêu đề trắng +
  nội dung mang màu note), menu 5 mục + 3 sheet (Màu/Tag/Nhắc hẹn với
  4 chip nhanh), nút Tạo/Lưu, Bỏ (nháp trống về im lặng, có nội dung thì
  hỏi) vs Thùng rác (sửa note).
- Thùng rác: xem danh sách/lưới, menu riêng (Chọn/Dọn sạch → Khôi phục
  nhanh/Hủy/Xóa hẳn), toast "Chạm thẻ để chọn." khi vào chế độ chọn,
  ra im lặng, xác nhận bằng dialog nổi. Sao lưu: bản mẫu JSON sẵn trong
  ô nhập, kiểm tra JSON, dialog xác nhận ghi rõ số note. Nhập sao lưu
  giờ giữ lại icon/màu tag + thứ tự note (bản v14 làm mất cả hai).
- Thông báo nhắc hẹn: native AlarmManager qua JNI (plugin chính thức
  không đáp ứng vì action của nó cần JS đang chạy). Khi app đóng vẫn
  nổ: 1 icon sổ trắng duy nhất, tiêu đề = tiêu đề note, thu gọn 1 dòng
  + "…", mở rộng tối đa 10 dòng, âm chuông vừa nhẹ, 3 nút (Mở ghi chú /
  Nhắc lại 15 phút / Đã xong). Khi app mở thì bảng nhắc trong app
  (poller 60 giây). Thông báo + âm + icon + nút đều có case test tay
  (case 30–36).
- Màn hình chờ: `#loading` inline trong index.html (nền kem + icon sổ
  vàng SVG + vòng xoay đỏ), `backgroundColor "#f7f1e5"` trong
  tauri.conf.json, React gỡ sau lần render đầu.
- Test tay: `tests/android-manual.md` giờ có 66 case, đánh số lại duy
  nhất (trước đó 4 nhóm append trùng 30–33/30–41/30–36). Case 23/25
  đánh dấu bỏ ở v18, case 28 viết lại theo nav mới.
- Animation: chỉ opacity + transform, 200–350ms, không animate
  width/height/top/left; thu gọn/mở nhóm chỉ fade nội dung; xóa nhiều
  note cùng lúc thì bỏ bóng đổ cho nhẹ.

### Quyết khác spec (đã ghi, cần kha chốt nếu muốn đổi)
- `.tile` giữ `touch-action: pan-y` thay vì `none` (spec) — với `none`,
  gần hết trang là thẻ note nên không cuộn được từ thẻ; kéo thả vẫn
  chạy vì JS chặn cuộn sau khi nhấc note lên (nhấn giữ 400ms).
- "Chọn tất cả" tính theo chip lọc + tìm kiếm, không tính nhóm thu gọn
  (đọc đúng parenthetical trong spec: "note đang hiện (đã lọc chip +
  tìm kiếm)"). Nếu muốn nhóm thu gọn cũng bị loại thì đổi 1 dòng ở App.
- Màu tag từng lưu 2 dạng (editor lưu hex, home lưu tên id) — backend
  giờ chuẩn hóa về tên id khi ghi; hiển thị chịu cả hai dạng.
- `collapsed_groups` giờ lưu id tag (số) thay cho tên — giá trị cũ bị
  bỏ qua 1 lần, các nhóm mở lại hết sau nâng cấp; tag đổi tên sẽ rơi
  cuối danh sách nhóm (thứ tự lưu theo tên cũ, như hành vi v14).
- Báo thức nhắc hẹn mất khi reboot máy (chưa làm `BOOT_COMPLETED`) —
  giới hạn đã biết, không chặn v18.

### Chưa kiểm được — cần máy thật của kha (case 30–66)
- **Icon app:** App-info phải hiện icon sổ vàng + bút đỏ (bản sửa v15,
  vẫn chưa kiểm chứng trên máy thật lần nào). Pipeline icon không đổi
  trong v18 (workflow vẫn chạy `fix-android-icons.py` ngay sau init).
- Thông báo native khi app đóng (âm, tiêu đề + đoạn nội dung, 1 icon,
  thu gọn/mở rộng, 3 nút, nhắc lại 15 phút, bấm mở đúng note, từ chối
  quyền) — case 30–36. Âm chuông theo kênh nên test âm phải làm trên
  máy chưa từng cài app (hoặc gỡ cài lại). Receiver tìm `notes.db` ở
  `filesDir/notes.db` (dự phòng `getDatabasePath`); nếu case 34/35 fail
  thì xem logcat tag `ReminderReceiver`.
- Cảm giác kéo-thả xếp thứ tự, hiệu ứng xóa, các flow chọn nhiều, sheet
  trượt lên, màn chờ loading có hiện đúng không, toast/dialog trên máy —
  case 37–66.
- Build APK trên GitHub Actions là lần kiểm đầu tiên của khối JNI
  (chỉ biên dịch cho target Android, VM không kiểm được).
