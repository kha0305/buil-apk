//! Nhắc hẹn bằng AlarmManager trên Android (xem docs/notification-app-integration.md).
//!
//! Quyết định route: plugin thông báo chính thức của Tauri (`@tauri-apps/plugin-notification`)
//! có lịch + channel + âm thanh riêng, nhưng action của nó trả về cho JS qua `onAction` —
//! app đóng thì không có JS để chạy nút "Nhắc lại 15 phút"/"Đã xong" hay sửa DB, nên
//! không đáp ứng được spec v18. Vì vậy dùng receiver native: Rust gọi sang Kotlin
//! (`ReminderHelper`) qua JNI, báo thức + 3 nút bấm + sửa DB đều chạy khi app đã đóng.
//!
//! Trên máy không phải Android (kể cả lúc `cargo test`), các lệnh chỉ là no-op an toàn:
//! logic thuần (cắt chữ, giờ nhắc lại, file note chờ mở) nằm ngoài `#[cfg(android)]`
//! nên test được ở đây. Phần JNI chỉ biên dịch cho target Android — chưa kiểm chứng
//! bằng build thật, CI Android của kha sẽ kiểm chứng (xem mục "Chưa kiểm chứng").

use crate::db::DbState;
use serde::Serialize;
use std::path::Path;
use tauri::{AppHandle, Manager, State};

/// Kênh thông báo nhắc hẹn (phải khớp `ReminderHelper.CHANNEL_ID`).
/// Chỉ dùng để đối chiếu — phía Kotlin tự giữ cùng giá trị.
#[allow(dead_code)]
pub const CHANNEL_ID: &str = "nhac-hen";
/// File note chờ mở: receiver ghi lúc chuông kêu, Rust đọc + xóa khi app mở lên.
pub const PENDING_OPEN_FILE: &str = "pending_open_note.txt";

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotifyStatus {
    pub scheduled: bool,
    pub notifications_allowed: bool,
}

/// Dạng thu gọn: 1 dòng đầu + "…" (kể cả khi nội dung chỉ có 1 dòng).
/// Chỉ dùng ở nhánh Android + unit test (bản non-Android không gọi tới).
#[allow(dead_code)]
pub fn collapsed_text(content: &str) -> String {
    match content.lines().next() {
        Some(line) if !line.trim().is_empty() => format!("{}…", line.trim_end()),
        _ => String::new(),
    }
}

/// Dạng mở rộng: tối đa 10 dòng, dài hơn thì cắt và thêm "…" ở cuối.
/// Chỉ dùng ở nhánh Android + unit test (bản non-Android không gọi tới).
#[allow(dead_code)]
pub fn expanded_text(content: &str) -> String {
    const MAX_LINES: usize = 10;
    let lines: Vec<&str> = content.lines().collect();
    if lines.len() <= MAX_LINES {
        return content.to_string();
    }
    format!("{}\n…", lines[..MAX_LINES].join("\n"))
}

/// Giờ nhắc lại = giờ hiện tại + số phút (tràn số thì kẹp, không panic).
pub fn snooze_at(now_millis: i64, minutes: i64) -> i64 {
    now_millis.saturating_add(minutes.saturating_mul(60_000))
}

/// Đọc + xóa file note chờ mở trong thư mục dữ liệu của app.
pub fn take_pending_open_note_in(dir: &Path) -> Result<Option<i64>, String> {
    let file = dir.join(PENDING_OPEN_FILE);
    if !file.is_file() {
        return Ok(None);
    }
    let text = std::fs::read_to_string(&file).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&file);
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    trimmed
        .parse::<i64>()
        .map(Some)
        .map_err(|_| format!("{PENDING_OPEN_FILE} không phải số note hợp lệ"))
}

fn check_note(note_id: i64, remind_at: i64) -> Result<(), String> {
    if note_id <= 0 {
        return Err("note_id không hợp lệ".into());
    }
    if remind_at <= 0 {
        return Err("remind_at không hợp lệ".into());
    }
    Ok(())
}

#[tauri::command]
pub fn schedule_reminder_notification(
    app: AppHandle,
    note_id: i64,
    title: String,
    content: String,
    remind_at: i64,
) -> Result<NotifyStatus, String> {
    check_note(note_id, remind_at)?;
    #[cfg(target_os = "android")]
    {
        use tauri::Emitter;
        let status = android::schedule(
            note_id,
            &title,
            &collapsed_text(&content),
            &expanded_text(&content),
            remind_at,
        )?;
        if !status.notifications_allowed {
            let _ = app.emit("notify-permission-needed", ());
        }
        return Ok(status);
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        let _ = (&title, &content);
        Ok(NotifyStatus { scheduled: false, notifications_allowed: true })
    }
}

#[tauri::command]
pub fn cancel_reminder_notification(app: AppHandle, note_id: i64) -> Result<(), String> {
    if note_id <= 0 {
        return Err("note_id không hợp lệ".into());
    }
    #[cfg(target_os = "android")]
    {
        let _ = app;
        android::cancel(note_id)
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Ok(())
    }
}

/// Nhắc lại: đọc tiêu đề/nội dung từ DB (TS chỉ gửi id + số phút), dời
/// `remind_at` trong DB rồi đặt lại báo thức native với giờ mới.
#[tauri::command]
pub fn snooze_reminder_notification(
    app: AppHandle,
    state: State<DbState>,
    note_id: i64,
    minutes: i64,
) -> Result<NotifyStatus, String> {
    if note_id <= 0 {
        return Err("note_id không hợp lệ".into());
    }
    if minutes <= 0 {
        return Err("minutes phải lớn hơn 0".into());
    }
    let new_time = snooze_at(crate::db::now_millis(), minutes);
    let note = {
        let conn = crate::db::lock(&state)?;
        crate::db::get_note(&conn, note_id)?
    };
    crate::notes::set_reminder(&state, note_id, Some(new_time))?;
    schedule_reminder_notification(app, note_id, note.title, note.content, new_time)
}

/// Note receiver đã ghi lại lúc chuông kêu (mở từ thông báo khi app đang đóng).
#[tauri::command]
pub fn take_pending_open_note(app: AppHandle) -> Result<Option<i64>, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    take_pending_open_note_in(&dir)
}

#[cfg(target_os = "android")]
mod android {
    use super::NotifyStatus;
    use jni::objects::{JObject, JValue, JValueOwned};
    use jni::JNIEnv;
    use jni::JavaVM;

    /// Lớp Kotlin (package này phải khớp identifier trong tauri.conf.json).
    const HELPER_CLASS: &str = "com/kha/ghichu/ReminderHelper";
    const SCHEDULE_SIG: &str =
        "(Landroid/content/Context;JLjava/lang/String;Ljava/lang/String;Ljava/lang/String;J)Z";
    const ALLOWED_SIG: &str = "(Landroid/content/Context;)Z";
    const CANCEL_SIG: &str = "(Landroid/content/Context;J)V";

    fn with_env<T>(f: impl FnOnce(&mut JNIEnv) -> Result<T, String>) -> Result<T, String> {
        let ctx = ndk_context::android_context();
        let vm = unsafe { JavaVM::from_raw(ctx.vm().cast()) }.map_err(|e| e.to_string())?;
        let mut env = vm.attach_current_thread().map_err(|e| e.to_string())?;
        f(&mut env)
    }

    /// Activity hiện tại (JObject không Copy nên mỗi lần gọi tạo lại từ con trỏ thô).
    fn activity_object() -> JObject<'static> {
        unsafe { JObject::from_raw(ndk_context::android_context().context() as jni::sys::jobject) }
    }

    fn call_static<'a>(
        env: &mut JNIEnv<'a>,
        name: &str,
        sig: &str,
        extra: &[JValue],
    ) -> Result<JValueOwned<'a>, String> {
        let cls = env.find_class(HELPER_CLASS).map_err(|e| e.to_string())?;
        let activity = activity_object();
        let mut args = vec![JValue::Object(&activity)];
        args.extend_from_slice(extra);
        env.call_static_method(&cls, name, sig, &args).map_err(|e| e.to_string())
    }

    fn call_bool(
        env: &mut JNIEnv,
        name: &str,
        sig: &str,
        extra: &[JValue],
    ) -> Result<bool, String> {
        call_static(env, name, sig, extra).and_then(|v| v.z().map_err(|e| e.to_string()))
    }

    pub fn schedule(
        note_id: i64,
        title: &str,
        collapsed: &str,
        expanded: &str,
        remind_at: i64,
    ) -> Result<NotifyStatus, String> {
        with_env(|env| {
            let title = env.new_string(title).map_err(|e| e.to_string())?;
            let collapsed = env.new_string(collapsed).map_err(|e| e.to_string())?;
            let expanded = env.new_string(expanded).map_err(|e| e.to_string())?;
            let scheduled = call_bool(
                env,
                "schedule",
                SCHEDULE_SIG,
                &[
                    JValue::Long(note_id),
                    JValue::Object(&title),
                    JValue::Object(&collapsed),
                    JValue::Object(&expanded),
                    JValue::Long(remind_at),
                ],
            )?;
            let allowed = call_bool(env, "notificationsAllowed", ALLOWED_SIG, &[])?;
            Ok(NotifyStatus { scheduled, notifications_allowed: allowed })
        })
    }

    pub fn cancel(note_id: i64) -> Result<(), String> {
        with_env(|env| {
            call_static(env, "cancel", CANCEL_SIG, &[JValue::Long(note_id)]).map(|_| ())
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_db;
    use crate::notes::{create_note, NewNote};
    use std::sync::Mutex;
    use tempfile::TempDir;

    #[test]
    fn collapsed_takes_first_line_and_adds_ellipsis() {
        assert_eq!(collapsed_text("Dòng một\nDòng hai"), "Dòng một…");
        assert_eq!(collapsed_text("Chỉ một dòng"), "Chỉ một dòng…");
        assert_eq!(collapsed_text("  Dòng có khoảng trắng  \nSau"), "  Dòng có khoảng trắng…");
        assert_eq!(collapsed_text(""), "");
        assert_eq!(collapsed_text("\n\n"), "");
    }

    #[test]
    fn expanded_keeps_up_to_ten_lines_then_cuts() {
        let ten = (1..=10).map(|i| format!("dòng {i}")).collect::<Vec<_>>().join("\n");
        assert_eq!(expanded_text(&ten), ten);
        let twelve = (1..=12).map(|i| format!("dòng {i}")).collect::<Vec<_>>().join("\n");
        let cut = expanded_text(&twelve);
        assert!(cut.ends_with("\n…"), "bị cắt phải kết thúc bằng …: {cut}");
        assert_eq!(cut.lines().count(), 11, "10 dòng nội dung + 1 dòng …");
        assert!(cut.contains("dòng 10") && !cut.contains("dòng 11"), "cut = {cut}");
        assert_eq!(expanded_text(""), "");
    }

    #[test]
    fn snooze_adds_minutes_and_saturates_on_overflow() {
        assert_eq!(snooze_at(1_000, 15), 1_000 + 900_000);
        assert_eq!(snooze_at(1_000, 0), 1_000);
        assert_eq!(snooze_at(i64::MAX, 15), i64::MAX);
    }

    #[test]
    fn pending_open_note_file_round_trip() {
        let dir = TempDir::new().unwrap();
        assert_eq!(take_pending_open_note_in(dir.path()).unwrap(), None);
        std::fs::write(dir.path().join(PENDING_OPEN_FILE), "42").unwrap();
        assert_eq!(take_pending_open_note_in(dir.path()).unwrap(), Some(42));
        assert!(!dir.path().join(PENDING_OPEN_FILE).exists(), "đọc xong phải xóa file");
        assert_eq!(take_pending_open_note_in(dir.path()).unwrap(), None);
    }

    #[test]
    fn pending_open_note_file_with_garbage_errors_and_cleans_up() {
        let dir = TempDir::new().unwrap();
        std::fs::write(dir.path().join(PENDING_OPEN_FILE), "khong-phai-so").unwrap();
        assert!(take_pending_open_note_in(dir.path()).is_err());
        assert!(!dir.path().join(PENDING_OPEN_FILE).exists(), "file rác phải bị xóa");
    }

    // Chỉ kiểm tra phần DB của snooze (phần đặt báo thức native cần Android).
    #[test]
    fn snooze_db_part_sets_remind_at() {
        let dir = TempDir::new().unwrap();
        let state = DbState { db: Mutex::new(open_db(dir.path()).unwrap()) };
        let note = create_note(
            &state,
            NewNote { title: "Mua sữa".into(), content: "2 lít".into(), colour: "white".into(), pinned: false },
        )
        .unwrap();
        let before = crate::db::now_millis();
        let new_time = snooze_at(before, 15);
        let saved = crate::notes::set_reminder(&state, note.id, Some(new_time)).unwrap();
        assert_eq!(saved.remind_at, Some(new_time));
        assert!(new_time >= before + 15 * 60_000);
        assert_eq!(saved.title, "Mua sữa");
    }

    #[test]
    fn check_note_rejects_bad_ids_and_times() {
        assert!(check_note(0, 1).is_err());
        assert!(check_note(-1, 1).is_err());
        assert!(check_note(1, 0).is_err());
        assert!(check_note(1, -5).is_err());
        assert!(check_note(1, 1).is_ok());
    }
}
