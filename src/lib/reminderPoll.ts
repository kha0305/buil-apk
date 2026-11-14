// Kiểm tra nhắc hẹn khi app đang mở: mỗi 60 giây và mỗi khi danh sách
// note đổi. Note tới giờ thì báo cho App mở bảng nhắc, kêu một tiếng bíp,
// rồi gỡ nhắc hẹn để chỉ nhắc một lần duy nhất. Đồng thời kiểm tra note
// receiver native đã ghi lại lúc chuông kêu khi app đang đóng (mở từ
// thông báo) để mở thẳng note đó.
import { invoke } from "@tauri-apps/api/core";
import { beep } from "./beep";
import { listNotes, setReminder } from "../services/notesApi";
import type { Note } from "./types";

export type DueReminder = { note: Note; remindAt: number };

export type ReminderHandlers = {
  onDue: (due: DueReminder[]) => void;
  onOpenNote: (note: Note) => void;
};

const POLL_MS = 60_000;

// Id note đã hiện bảng nhắc trong phiên này (tránh nhắc lại nhiều lần).
const shown = new Set<number>();
let handlers: ReminderHandlers | null = null;
let timer: number | undefined;

async function checkDue(): Promise<void> {
  if (!handlers) return;
  let all: Note[];
  try {
    all = await listNotes();
  } catch {
    return;
  }
  const now = Date.now();
  const due: DueReminder[] = all
    .filter((n) => n.remindAt != null && n.remindAt <= now && !shown.has(n.id))
    .map((n) => ({ note: n, remindAt: n.remindAt as number }));
  if (due.length === 0) return;
  due.forEach((d) => shown.add(d.note.id));
  handlers.onDue(due);
  beep();
  for (const d of due) {
    try {
      await setReminder(d.note.id, null);
    } catch {
      // Gỡ nhắc hẹn lỗi thì thôi: `shown` đã chặn nhắc lại trong phiên này.
    }
  }
}

async function checkPendingOpen(): Promise<void> {
  if (!handlers) return;
  let id: number | null;
  try {
    id = await invoke<number | null>("take_pending_open_note");
  } catch {
    return;
  }
  if (id == null) return;
  let all: Note[];
  try {
    all = await listNotes();
  } catch {
    return;
  }
  const note = all.find((n) => n.id === id);
  if (note) handlers.onOpenNote(note);
}

export async function checkRemindersNow(): Promise<void> {
  await checkDue();
  await checkPendingOpen();
}

export function startReminderPoll(next: ReminderHandlers): () => void {
  handlers = next;
  void checkRemindersNow();
  timer = window.setInterval(() => void checkRemindersNow(), POLL_MS);
  return stopReminderPoll;
}

export function stopReminderPoll(): void {
  if (timer !== undefined) {
    window.clearInterval(timer);
    timer = undefined;
  }
  handlers = null;
}
