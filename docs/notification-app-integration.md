# Nhắc hẹn v18 — tích hợp app (tài liệu cho người áp dụng)

## 1. Quyết định route: native AlarmManager, không dùng plugin chính thức

Plugin thông báo chính thức của Tauri (`@tauri-apps/plugin-notification`)
có lịch hẹn + channel + âm thanh riêng, nhưng action của nó trả về cho JS
qua `onAction` — app đóng thì không có JS để chạy nút "Nhắc lại 15 phút" /
"Đã xong" hay sửa `remind_at` trong DB. Spec v18 bắt buộc 3 nút bấm phải
chạy được khi app đã đóng, nên dùng receiver native:

- Rust (`src-tauri/src/notify.rs`) gọi sang Kotlin qua JNI (`jni 0.21.1` +
  `ndk-context 0.1.1`, cả hai đã có sẵn trong `Cargo.lock` của Tauri 2.12.5
  nên ghim đúng version đó, không thêm version mới).
- Kotlin (`src-tauri/notification/ReminderHelper.kt`,
  `ReminderReceiver.kt`) đặt/hủy báo thức `AlarmManager`, dựng thông báo,
  xử lý 3 nút bấm và sửa thẳng `notes.db` khi app đóng.
- Thương hiệu `src-tauri/gen/` không sửa tay: script
  `scripts/patch-android-notification.py` chép mọi thứ vào đó sau
  `tauri android init` (cùng mẫu với `fix-android-icons.py` v15, không đụng
  tới bước icon).

## 2. Bản đồ file (nhóm Notification sở hữu)

| File | Vai trò |
| --- | --- |
| `src-tauri/src/notify.rs` | 3 lệnh theo contract + `take_pending_open_note`; cắt chữ thu gọn/mở rộng; cầu JNI (chỉ Android) |
| `src-tauri/notification/chuong-vua-nhe.wav` | Âm chuông (bản sao trong repo của file kha chọn) |
| `src-tauri/notification/ReminderHelper.kt` | Đặt/hủy báo thức, kênh, quyền, file note chờ mở |
| `src-tauri/notification/ReminderReceiver.kt` | Dựng thông báo + 3 nút bấm + sửa DB khi app đóng |
| `scripts/patch-android-notification.py` | Chép 3 file trên + sinh icon `ic_notepad` + vá manifest (idempotent) |
| `src/components/ReminderDialog.tsx` | Bảng nhắc khi app đang mở |
| `src/lib/reminderPoll.ts` | Poller 60 giây + kiểm tra note chờ mở từ thông báo |
| `src/styles.css` | Thêm class `.reminder-*` (dưới khối `.due-*`) |

Không đổi: `src/lib/reminderNotify.ts` (contract đã chốt), `src/pages/*`.

## 3. Đăng ký lệnh trong `src-tauri/src/lib.rs` (áp dụng tay)

Dòng `mod notify;` **đã thêm sẵn** (1 dòng duy nhất tôi sửa trong file
này — bắt buộc để module biên dịch và test chạy; xem §8). Còn lại 2 chỗ
dưới đây do parent áp dụng.

Thêm import (sau `use notes::{NewNote, Note};`):

```rust
use notify::{
    cancel_reminder_notification, schedule_reminder_notification, snooze_reminder_notification,
    take_pending_open_note,
};
```

Thêm 4 lệnh vào `generate_handler!` (sau `set_reminder,`):

```rust
            schedule_reminder_notification,
            cancel_reminder_notification,
            snooze_reminder_notification,
            take_pending_open_note,
```

`take_pending_open_note` là lệnh thứ 4 ngoài 3 lệnh contract: receiver ghi
note chờ mở ra file, app mở lên đọc qua lệnh này để mở thẳng note đó.
Không có nó thì bấm thông báo chỉ mở app về danh sách, không mở đúng note.

## 4. Bước workflow trong `.github/workflows/android-apk.yml`

Chèn ngay **sau** bước `Thay icon Android bằng icon app`, **trước** bước
`Giải mã keystore ký release`:

```yaml
      # Nhắc hẹn native v18 (AlarmManager): chép âm chuông + icon notepad
      # trắng + receiver vào dự án Android vừa init (sau bước thay icon,
      # trước khi ký/build). Chạy 2 lần cho kết quả y nhau (đã kiểm trên cây
      # giả lập). Pillow đã cài ở bước thay icon nên không cần cài lại.
      - name: Cài nhắc hẹn native (AlarmManager)
        run: python3 scripts/patch-android-notification.py
```

Bước icon v15 giữ nguyên, không đổi gì ở đó.

## 5. Tích hợp `src/App.tsx` (áp dụng tay — thay đoạn cũ, không sửa gì khác)

### 5.1. Import: bỏ `beep`, thêm 4 dòng

Cũ:

```tsx
import { beep } from "./lib/beep";
```

Mới (đặt cạnh các import `lib`/`components` hiện có):

```tsx
import { listen } from "@tauri-apps/api/event";
import ReminderDialog from "./components/ReminderDialog";
import ToastHost from "./components/ToastHost";
import { checkRemindersNow, startReminderPoll, type DueReminder } from "./lib/reminderPoll";
import { toast } from "./lib/toast";
```

### 5.2. State: `due` đổi kiểu, bỏ `shownRef`

Cũ:

```tsx
  // Note tới giờ nhắc hẹn, đang chờ người dùng bấm mở hoặc đóng bảng.
  const [due, setDue] = useState<Note[]>([]);
  // Id note đã hiện bảng nhắc trong phiên này (tránh nhắc lại nhiều lần).
  const shownRef = useRef<Set<number>>(new Set());
```

Mới:

```tsx
  // Note tới giờ nhắc hẹn, đang chờ người dùng bấm mở hoặc đóng bảng.
  const [due, setDue] = useState<DueReminder[]>([]);
```

### 5.3. Xóa toàn bộ logic nhắc hẹn cũ

Xóa từ dòng comment `// Nhắc hẹn: CHỈ nhắc khi app đang mở.` tới hết
`useEffect(() => { void checkDue(); }, [notes, checkDue]);` — gồm
`checkDue` (useCallback) và cả 2 `useEffect` đi kèm. Logic này đã dời vào
`src/lib/reminderPoll.ts`.

### 5.4. Thêm 3 effect mới — đặt ngay sau `const openNote = ...`

```tsx
  // Nhắc hẹn trong app (v18): poller kiểm mỗi 60 giây + khi danh sách đổi,
  // mở bảng nhắc cho note tới giờ; note từ thông báo native thì mở thẳng.
  useEffect(() => {
    if (!isTauri()) return;
    const stop = startReminderPoll({
      onDue: (items) =>
        setDue((prev) => [
          ...prev,
          ...items.filter((d) => !prev.some((p) => p.note.id === d.note.id)),
        ]),
      onOpenNote: (note) => openNote(note),
    });
    return stop;
  }, []);

  useEffect(() => {
    void checkRemindersNow();
  }, [notes]);

  // Chưa cấp quyền thông báo (Android 13+): nhắc hẹn chỉ hiện khi app mở.
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    listen("notify-permission-needed", () => {
      toast("Để nhận nhắc hẹn cả khi app đóng, hãy cho phép gửi thông báo");
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => undefined);
    return () => unlisten?.();
  }, []);
```

### 5.5. `openDue` đổi sang nhận `DueReminder`

Cũ:

```tsx
  // Mở note từ bảng nhắc: lấy bản mới nhất trong danh sách (nhắc hẹn đã bị
  // gỡ sau khi hiện bảng nên bản trong bảng nhắc là bản cũ).
  const openDue = (note: Note) => {
    setDue((prev) => prev.filter((d) => d.id !== note.id));
    exitSelectMode();
    setView({ name: "editor", note: notes.find((n) => n.id === note.id) ?? note });
  };
```

Mới:

```tsx
  // Mở note từ bảng nhắc: lấy bản mới nhất trong danh sách (nhắc hẹn đã bị
  // gỡ sau khi hiện bảng nên bản trong bảng nhắc là bản cũ).
  const openDue = (item: DueReminder) => {
    setDue((prev) => prev.filter((d) => d.note.id !== item.note.id));
    exitSelectMode();
    setView({ name: "editor", note: notes.find((n) => n.id === item.note.id) ?? item.note });
  };
```

### 5.6. JSX: gắn `ToastHost`, thay khối bảng nhắc cũ

Cũ (đầu fragment):

```tsx
      {error ? <p className="error">{error}</p> : null}
```

Mới (thêm 1 dòng — cần để toast quyền hiện; nếu nhóm Home đã gắn
`ToastHost` ở chỗ khác thì bỏ dòng này):

```tsx
      <ToastHost />
      {error ? <p className="error">{error}</p> : null}
```

Cũ (cuối fragment):

```tsx
      {due.length > 0 ? (
        <div className="due-overlay">
          <div className="due-card">
            <h2>Đến giờ nhắc hẹn</h2>
            {due.map((n) => (
              <button key={n.id} className="due-item" onClick={() => openDue(n)}>
                {n.title.trim() || "Ghi chú mới"}
              </button>
            ))}
            <button onClick={() => setDue([])}>Đóng</button>
          </div>
        </div>
      ) : null}
```

Mới:

```tsx
      {due.length > 0 ? (
        <ReminderDialog items={due} onOpen={openDue} onClose={() => setDue([])} />
      ) : null}
```

## 6. Quyền — xin ở đâu, từ chối thì sao

- **Điểm xin quyền duy nhất:** `ReminderHelper.requestPermissionIfNeeded`,
  gọi từ `ReminderHelper.schedule()` tức là từ lệnh Rust
  `schedule_reminder_notification` — tức là lúc người dùng đặt nhắc hẹn
  đầu tiên. Chỉ hỏi 1 lần (cờ `notification_permission_asked` trong
  SharedPreferences); Android 12 trở xuống không có quyền này nên bỏ qua.
- **Từ chối:** báo thức vẫn đặt (chuông vẫn kêu đúng giờ nếu mở app),
  thông báo native sẽ bị Android 13+ chặn lặng lẽ, bảng nhắc trong app
  (`reminderPoll` + `ReminderDialog`) vẫn hiện khi app mở. Rust bắn event
  `notify-permission-needed` về WebView để `App.tsx` (mục 5.4) hiện toast
  ngắn. Không hỏi lại ở các lần đặt nhắc sau.
- **Báo thức chính xác (Android 12+):** `SCHEDULE_EXACT_ALARM` khai trong
  manifest; nếu máy chưa cấp (`canScheduleExactAlarms() == false`) thì
  dùng `setAndAllowWhileIdle` (báo thức thường — có thể trễ khi máy đang
  ngủ sâu). App không tự mở trang Cài đặt xin quyền này; người dùng bật
  trong Cài đặt app → Quyền → Báo thức và nhắc nhở.

## 7. Hành vi đã chốt (để đối chiếu khi test)

- Thông báo: 1 icon duy nhất `ic_notepad` (trắng, vẽ bằng PIL từ đầu —
  không tái tô màu icon app vì icon app vàng/đỏ, không ra silhouette
  trắng); **không** large icon; **không** đường kẻ trên dãy nút bấm
  (không dùng custom view). Tiêu đề = tiêu đề note (trống → "Ghi chú mới").
  Thu gọn: 1 dòng nội dung + "…". Mở rộng: `BigTextStyle`, tối đa 10 dòng,
  dài hơn thì cắt + "…" (cắt ở Rust, `notify.rs`, có test).
- Âm thanh: `chuong_vua_nhe.wav` gắn vào kênh `nhac-hen` lúc tạo kênh
  (kênh tạo 1 lần — đổi file âm sau này thì máy đã cài app cũ vẫn nghe âm
  cũ, phải gỡ app cài lại mới đổi).
- 3 nút bấm (chỉ hiện khi mở rộng, tối đa 3 — theo hành vi mặc định của
  Android): "Mở ghi chú" (mở app tới note, gỡ thông báo),
  "Nhắc lại 15 phút" (dời `remind_at` trong DB + đặt lại báo thức +15 phút),
  "Đã xong" (hủy báo thức + thông báo, gỡ `remind_at` để không nhắc lại).
  Bấm vào thân thông báo cũng mở app tới note đó.
- Vuốt bỏ thông báo: chỉ xóa file note chờ mở (không gỡ `remind_at`) nên
  mở app lên bảng nhắc trong app vẫn hiện — đúng ý "chưa xử lý thì nhắc lại".
- Mở app từ thông báo: receiver ghi id note vào `pending_open_note.txt`
  trong `filesDir`; `reminderPoll` gọi `take_pending_open_note` mỗi lần
  kiểm (60 giây + khi danh sách đổi) để mở thẳng note.
- Luồng gọi nhắc hẹn từ editor (không đổi): `setReminder` (ghi DB) rồi
  `scheduleNativeReminder` (đặt báo thức). Gỡ nhắc / cho vào thùng rác /
  xóa hẳn thì gọi `cancelNativeReminder` (đã có trong `reminderNotify.ts`).

## 8. Đã kiểm chứng trên VM (15/11/2026)

- Patch script trên cây Android giả lập (`/tmp/notify-sim`, manifest mẫu
  + `res` trống): chạy 3 lần, md5 toàn bộ cây `gen` sau lần 2 == lần 3
  (idempotent); wav chép đúng md5 nguồn `834ca38d...`; marker quyền và
  receiver mỗi cái đúng 1 lần; 5 icon `ic_notepad` đúng cỡ (24/36/48/72/96),
  mọi pixel nổi đều trắng tinh (0 pixel sai); thiếu file nguồn thì exit 1
  kèm thông báo rõ; đổi identifier thì package Kotlin + thư mục java đổi theo.
  Hai lỗi bắt được khi kiểm: tên file âm nguồn có gạch ngang trong khi tên
  resource phải gạch dưới; file Kotlin bắt đầu bằng comment nên script cũ
  tìm dòng package sai — cả hai đã sửa trong script.
- `cargo test --manifest-path src-tauri/Cargo.toml`: **52 passed, 0 failed**
  (chạy lại 3 lần đều 52/52), trong đó 7 test mới trong `notify.rs` (cắt
  chữ thu gọn/mở rộng, giờ nhắc lại, file note chờ mở, phần DB của snooze,
  kiểm tra đầu vào). `npm run build` đậu (tsc + vite).
- Animation `ReminderDialog` (theo dặn của kha): hiện bằng keyframe pop-in
  250ms, ẩn bằng transition 250ms (`CLOSE_MS = 250` — khớp mới gọi
  callback để App gỡ bảng), chỉ dùng opacity + `translateY(6px)`; đã bỏ
  `scale` để giảm nguy cơ giật; không animate width/height/top/left.
  Thời lượng nằm trong khoảng 200–350ms kha chốt.
- Chữ ký JNI đối chiếu với source thật của `jni 0.21.1` và `ndk-context
  0.1.1` (tải từ crates.io về `/tmp`, đã đọc): `JavaVM::from_raw`,
  `attach_current_thread() -> Result<AttachGuard>`, `call_static_method`
  cần `&mut JNIEnv`, `JObject::from_raw(jobject)`, `AndroidContext::vm() /
  context()`.
- **Một lần fail thoáng qua (đã tự hết, cần biết):** ở lần chạy `cargo
  test` đầu tiên sau khi VM restart, test
  `backup::tests::export_import_round_trip_restores_everything` fail 1 lần
  (`backup.rs:129`, `export_backup` sau import báo "Tag not found"). Chạy
  lại 3 lần sau đó đều đậu, không sửa code nào. Nghi nhất là lúc đó một
  agent khác đang sửa dở `tags.rs`/`db.rs` v18 ngay lúc cargo biên dịch,
  hoặc artifact dở sau restart. Nếu nó tái hiện: nguyên nhân là
  `import_backup` làm `DELETE FROM tags` (xóa cả dòng sentinel id 0) rồi
  `list_tags` gọi `get_tag(0)` — xem `db.rs: ensure_untagged_tag`
  (hàm tạo lại sentinel đã có nhưng import không gọi). Thuộc về nhóm
  Backup/Tags, không phải file của nhóm Notification.
- **Độ lệch duy nhất so với lệnh "không sửa lib.rs":** tôi đã thêm 1 dòng
  `mod notify;` vào `src-tauri/src/lib.rs`. Không có dòng này thì
  `notify.rs` không nằm trong crate, không biên dịch và không test được —
  mâu thuẫn với yêu cầu "cargo test phải đậu với module đã có nhưng chưa
  đăng ký". Việc đăng ký lệnh (`use notify::{...}` + `generate_handler!`,
  mục 3) vẫn do parent làm.

## 9. Chưa kiểm chứng được trên VM — CI Android / máy thật phải kiểm

- **Khối JNI trong `notify.rs` không biên dịch trên VM** (chỉ biên dịch
  cho target Android); build APK trên GitHub Actions là lần kiểm đầu tiên.
  Nếu build lỗi ở khối này, xem log `cargo` cho target
  `aarch64-linux-android` rồi sửa đúng chữ ký JNI, đừng sửa bằng cách đoán.
- **Giả định đường dẫn DB:** receiver tìm `notes.db` ở
  `filesDir/notes.db` (được coi là cùng thư mục `app_data_dir()` của Rust),
  dự phòng `getDatabasePath("notes.db")`. Nếu trên máy thật "Đã xong" /
  "Nhắc lại" không đổi được DB (case 34/35 fail), xem logcat tag
  `ReminderReceiver` để biết nó tìm thấy file DB ở đâu rồi sửa
  `findDbFile`.
- **Báo thức mất khi khởi động lại máy** (Android xóa hết báo thức khi
  reboot — v18 chưa làm receiver `BOOT_COMPLETED`): sau reboot, tới giờ hẹn
  sẽ không có thông báo; mở app lên thì bảng nhắc trong app vẫn hiện vì
  `remind_at` còn trong DB. Ghi nhận là giới hạn đã biết, không phải bug.
- **Âm chuông theo kênh:** kênh tạo lần đầu thì âm theo kênh đó; test âm
  phải làm trên máy chưa từng cài app (hoặc gỡ app cài lại) mới chắc.
