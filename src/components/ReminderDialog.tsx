// Bảng nhắc hẹn tới giờ (chỉ khi app đang mở): chuông đỏ + danh sách note
// tới giờ, bấm một dòng thì mở đúng note đó. Bấm nền mờ hoặc nút Đóng thì tắt.
// Icon chuông dùng lại đúng path trong TagIcon (bell), không dùng emoji.
// Hiện/ẩn chỉ dùng transform + opacity (không animate width/height/top/left):
// lúc hiện chạy keyframe pop-in 250ms, lúc ẩn chạy transition 250ms rồi mới gỡ.
import { useEffect, useRef, useState } from "react";
import type { DueReminder } from "../lib/reminderPoll";

export interface ReminderDialogProps {
  items: DueReminder[];
  onOpen: (item: DueReminder) => void;
  onClose: () => void;
}

const pad = (n: number) => String(n).padStart(2, "0");
const CLOSE_MS = 250;

function formatRemindTime(remindAt: number): string {
  const d = new Date(remindAt);
  return `Nhắc lúc ${pad(d.getHours())}:${pad(d.getMinutes())} ngày ${d.getDate()}/${d.getMonth() + 1}`;
}

export default function ReminderDialog({ items, onOpen, onClose }: ReminderDialogProps) {
  const [closing, setClosing] = useState(false);
  const timerRef = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  // Chạy hiệu ứng ẩn 250ms rồi mới gọi callback để App gỡ bảng.
  const dismiss = (after: () => void) => {
    if (closing) return;
    setClosing(true);
    timerRef.current = window.setTimeout(after, CLOSE_MS);
  };

  if (items.length === 0) return null;
  return (
    <div className={`due-overlay${closing ? " due-closing" : ""}`} onClick={() => dismiss(onClose)}>
      <div
        className={`due-card reminder-card${closing ? " reminder-closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="reminder-head">
          <span className="reminder-bell" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 9.5a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6z" />
              <path d="M10 19.5a2 2 0 0 0 4 0" />
            </svg>
          </span>
          <h2>Nhắc hẹn</h2>
        </div>
        <p className="reminder-sub">{items.length} ghi chú tới giờ nhắc.</p>
        {items.map((item) => (
          <button
            key={item.note.id}
            className="reminder-row"
            onClick={() => dismiss(() => onOpen(item))}
          >
            <span className={`reminder-dot colour-${item.note.colour}`} aria-hidden="true" />
            <span className="reminder-text">
              <span className="reminder-title">{item.note.title.trim() || "Ghi chú mới"}</span>
              <span className="reminder-time">{formatRemindTime(item.remindAt)}</span>
            </span>
            <span className="reminder-chevron" aria-hidden="true">
              ›
            </span>
          </button>
        ))}
        <button className="btn-primary" onClick={() => dismiss(onClose)}>
          Đóng
        </button>
      </div>
    </div>
  );
}
