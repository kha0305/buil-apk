import { useEffect, useState } from "react";
import type { Note } from "../lib/types";
import { deleteNoteForever, emptyTrash, listTrash, restoreNote } from "../services/notesApi";

type Props = {
  onClose: () => void;
  onChanged: () => void;
};

// Note trong thùng rác giữ 30 ngày (hiện tại chỉ hiển thị hạn, chưa tự xóa).
const RETENTION_DAYS = 30;
const DAY_MS = 86_400_000;

// Số ngày còn lại trước khi hết hạn 30 ngày.
const daysLeft = (deletedAt: number | null) => {
  if (deletedAt == null) return RETENTION_DAYS;
  return Math.max(0, RETENTION_DAYS - Math.floor((Date.now() - deletedAt) / DAY_MS));
};

const dateStr = (deletedAt: number | null) =>
  deletedAt == null ? "" : new Date(deletedAt).toLocaleDateString("vi-VN");

export default function TrashPage({ onClose, onChanged }: Props) {
  const [trash, setTrash] = useState<Note[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    listTrash()
      .then(setTrash)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  const restore = async (note: Note) => {
    try {
      await restoreNote(note.id);
      setTrash((prev) => prev.filter((n) => n.id !== note.id));
      onChanged();
    } catch (e) {
      fail(e);
    }
  };

  const removeForever = async (note: Note) => {
    if (!window.confirm("Xóa hẳn ghi chú này? Không khôi phục được nữa.")) return;
    try {
      await deleteNoteForever(note.id);
      setTrash((prev) => prev.filter((n) => n.id !== note.id));
    } catch (e) {
      fail(e);
    }
  };

  const clearAll = async () => {
    if (trash.length === 0) return;
    if (!window.confirm(`Xóa hẳn ${trash.length} ghi chú trong thùng rác? Không khôi phục được nữa.`)) return;
    try {
      await emptyTrash();
      setTrash([]);
    } catch (e) {
      fail(e);
    }
  };

  return (
    <main className="page">
      <header className="toolbar">
        <button onClick={onClose} aria-label="Quay lại danh sách">
          Quay lại
        </button>
        <h1>Thùng rác</h1>
        <button className="danger" onClick={() => void clearAll()} disabled={trash.length === 0}>
          Dọn sạch
        </button>
      </header>
      {error ? <p className="error">{error}</p> : null}
      {trash.length === 0 ? (
        <p className="empty">Thùng rác trống.</p>
      ) : (
        <div className="trash-list">
          {trash.map((n) => (
            <article key={n.id} className={`trash-item colour-${n.colour}`}>
              <div className="trash-text">
                <h2>{n.title.trim() || "Ghi chú mới"}</h2>
                <p className="trash-meta">
                  Xóa ngày {dateStr(n.deletedAt)} · còn {daysLeft(n.deletedAt)} ngày
                </p>
              </div>
              <div className="trash-actions">
                <button onClick={() => void restore(n)}>Khôi phục</button>
                <button className="danger" onClick={() => void removeForever(n)}>
                  Xóa hẳn
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
