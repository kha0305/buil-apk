// Cầu nối tới plugin thông báo native (Android AlarmManager).
// Gọi sau set_reminder / gỡ nhắc hẹn / cho note vào thùng rác / xóa hẳn.
// Nếu command chưa đăng ký (hoặc không phải Android), bỏ qua im lặng —
// nhắc hẹn trong app vẫn hoạt động bình thường.
// Nhóm Notification sẽ làm phần Rust + plugin native cho các command này;
// tên command và tham số (camelCase ở đây) đã chốt, không đổi.
import { invoke } from "@tauri-apps/api/core";

async function safeInvoke(
  cmd: string,
  args: Record<string, unknown>,
): Promise<void> {
  try {
    await invoke(cmd, args);
  } catch {
    // Chưa có plugin — bỏ qua, không làm vỡ luồng chính.
  }
}

export async function scheduleNativeReminder(
  noteId: number,
  title: string,
  content: string,
  remindAt: number,
): Promise<void> {
  await safeInvoke("schedule_reminder_notification", {
    noteId,
    title,
    content,
    remindAt,
  });
}

export async function cancelNativeReminder(noteId: number): Promise<void> {
  await safeInvoke("cancel_reminder_notification", { noteId });
}

export async function snoozeNativeReminder(
  noteId: number,
  minutes: number,
): Promise<void> {
  await safeInvoke("snooze_reminder_notification", { noteId, minutes });
}
