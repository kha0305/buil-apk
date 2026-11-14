import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { Note } from "../lib/types";
import { toast } from "../lib/toast";
import { cancelNativeReminder } from "../lib/reminderNotify";
import ConfirmDialog from "../components/ConfirmDialog";
import { deleteNoteForever, emptyTrash, listTrash, restoreNote } from "../services/notesApi";

type Props = {
  onClose: () => void;
  onChanged: () => void;
};

type ViewMode = "list" | "grid";
type ConfirmState =
  | { type: "one"; note: Note }
  | { type: "selected" }
  | { type: "empty" }
  | null;

// Thùng rác giữ note 30 ngày (chỉ hiển thị hạn, chưa tự xóa).
const RETENTION_DAYS = 30;
const DAY_MS = 86_400_000;
const DELETE_ANIM_MS = 350;
const ACCENT = "#b3261e";

// Bảng màu cuối (thứ tự cầu vồng). types.ts chưa cập nhật thứ tự này
// nên dùng hex trực tiếp tại đây, không sửa types.ts.
const COLOUR_HEX: Record<string, string> = {
  red: "#f9c8c8",
  orange: "#fbdcb8",
  peach: "#fbd3ae",
  yellow: "#fdf0b8",
  green: "#cbf0c8",
  sage: "#dce6c8",
  mint: "#cbf0e6",
  sky: "#bfe0f2",
  blue: "#c9dcf8",
  purple: "#e0cdf8",
  lavender: "#e6dcf7",
  pink: "#fbdfea",
  brown: "#e8dac8",
  grey: "#e6e6e6",
  white: "#fffdf7",
};

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const titleOf = (n: Note) => n.title.trim() || "Ghi chú mới";

const daysAgo = (deletedAt: number | null) =>
  deletedAt == null ? 0 : Math.max(0, Math.floor((Date.now() - deletedAt) / DAY_MS));
const daysLeft = (deletedAt: number | null) =>
  Math.max(0, RETENTION_DAYS - daysAgo(deletedAt));

const svgProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const undoIcon = (
  <svg {...svgProps} aria-hidden="true">
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
  </svg>
);

const trashIcon = (
  <svg {...svgProps} aria-hidden="true">
    <path d="M4 7h16" />
    <path d="M9 7V4h6v3" />
    <path d="M6 7l1 13h10l1-13" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
  </svg>
);

const gridIcon = (
  <svg {...svgProps} aria-hidden="true">
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="7" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
    <rect x="13" y="13" width="7" height="7" rx="1.5" />
  </svg>
);

const listIcon = (
  <svg {...svgProps} aria-hidden="true">
    <path d="M4 6h16" />
    <path d="M4 12h16" />
    <path d="M4 18h16" />
  </svg>
);

// Thẻ thùng rác: nền là màu gốc của note, bo 22, bóng mềm.
const cardStyle = (n: Note, deleting: boolean): CSSProperties => ({
  background: COLOUR_HEX[n.colour] ?? "#fffdf7",
  borderRadius: 22,
  boxShadow: "0 2px 10px rgba(43, 38, 32, 0.12)",
  padding: 14,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  transition: "opacity 350ms ease, transform 350ms ease",
  ...(deleting ? { opacity: 0, transform: "scale(0.85)" } : null),
});

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 700,
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
  overflowWrap: "break-word",
};

const contentStyle: CSSProperties = {
  margin: "4px 0 0",
  color: "#6b6156",
  fontSize: 14,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

const metaStyle: CSSProperties = { margin: "8px 0 0", color: "#6b6156", fontSize: 13 };

// Ô tick tròn khi chọn nhiều: viền nhạt, đã chọn thì nền đỏ + dấu tick trắng.
const tickStyle = (on: boolean): CSSProperties => ({
  flexShrink: 0,
  width: 28,
  height: 28,
  borderRadius: "50%",
  border: "2px solid #d8cfba",
  background: on ? ACCENT : "#fffdf7",
  color: "#fffdf7",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 16,
  lineHeight: 1,
  padding: 0,
});

const outlineBtn = (red: boolean): CSSProperties => ({
  background: "#fffdf7",
  border: `1.5px solid ${red ? ACCENT : "#2b2620"}`,
  color: red ? ACCENT : "#2b2620",
  borderRadius: 999,
  padding: "6px 12px",
  fontWeight: 600,
});

// Nút tròn 34px ở đáy ô lưới.
const iconBtn = (red: boolean): CSSProperties => ({
  width: 34,
  height: 34,
  borderRadius: "50%",
  padding: 0,
  background: "#fffdf7",
  border: `1.5px solid ${red ? ACCENT : "#2b2620"}`,
  color: red ? ACCENT : "#2b2620",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
});

function TrashCard({
  note,
  view,
  selecting,
  selected,
  deleting,
  onToggle,
  onRestore,
  onDelete,
}: {
  note: Note;
  view: ViewMode;
  selecting: boolean;
  selected: boolean;
  deleting: boolean;
  onToggle: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const ago = daysAgo(note.deletedAt);
  const left = daysLeft(note.deletedAt);
  const meta = (
    <p style={metaStyle}>
      {ago === 0 ? "Đã xóa hôm nay" : `Đã xóa ${ago} ngày trước`}
      {" · còn "}
      <span style={left <= 7 ? { color: ACCENT, fontWeight: 700 } : undefined}>
        {left} ngày
      </span>
    </p>
  );
  const tick = selecting ? <span style={tickStyle(selected)}>{selected ? "✓" : ""}</span> : null;
  return (
    <article
      style={cardStyle(note, deleting)}
      onClick={selecting ? onToggle : undefined}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <h2 style={{ ...titleStyle, flex: 1, minWidth: 0 }}>{titleOf(note)}</h2>
        {tick}
      </div>
      {view === "grid" ? (
        <>
          {/* Bọc tiêu đề + nội dung để line-clamp không vỡ, nút ghim đáy ô. */}
          <div>
            <p style={contentStyle}>{note.content}</p>
            {meta}
          </div>
          {!selecting ? (
            <div style={{ marginTop: "auto", display: "flex", gap: 16, paddingTop: 10 }}>
              <button type="button" style={iconBtn(false)} disabled={deleting} onClick={onRestore} aria-label="Khôi phục">
                {undoIcon}
              </button>
              <button type="button" style={iconBtn(true)} disabled={deleting} onClick={onDelete} aria-label="Xóa hẳn">
                {trashIcon}
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <p style={contentStyle}>{note.content}</p>
          {meta}
          {!selecting ? (
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button type="button" style={outlineBtn(false)} disabled={deleting} onClick={onRestore}>
                Khôi phục
              </button>
              <button type="button" style={outlineBtn(true)} disabled={deleting} onClick={onDelete}>
                Xóa hẳn
              </button>
            </div>
          ) : null}
        </>
      )}
    </article>
  );
}

export default function TrashPage({ onClose, onChanged }: Props) {
  const [trash, setTrash] = useState<Note[]>([]);
  const [view, setView] = useState<ViewMode>("list");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [deleting, setDeleting] = useState<ReadonlySet<number>>(new Set());

  useEffect(() => {
    listTrash()
      .then(setTrash)
      .catch((e) => toast(errMsg(e), "error"));
  }, []);

  // Thoát chế độ chọn: im lặng, không toast.
  const exitSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const enterSelecting = () => {
    setSelecting(true);
    setSelected(new Set());
    toast("Chạm thẻ để chọn.");
  };

  const toggleSelect = (note: Note) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(note.id)) next.delete(note.id);
      else next.add(note.id);
      return next;
    });

  const handleBack = () => {
    if (selecting) exitSelecting();
    else onClose();
  };

  const restoreOne = async (note: Note) => {
    try {
      await restoreNote(note.id);
      setTrash((prev) => prev.filter((n) => n.id !== note.id));
      onChanged();
    } catch (e) {
      toast(errMsg(e), "error");
    }
  };

  // Khôi phục nhanh: một chạm, không xác nhận.
  const quickRestore = async () => {
    const picked = trash.filter((n) => selected.has(n.id));
    for (const note of picked) {
      try {
        await restoreNote(note.id);
      } catch (e) {
        toast(errMsg(e), "error");
        return;
      }
    }
    setTrash((prev) => prev.filter((n) => !selected.has(n.id)));
    exitSelecting();
    onChanged();
  };

  // Xóa hẳn: mờ + thu nhỏ ~350ms rồi mới gọi backend, gỡ luôn nhắc hẹn.
  const deleteForever = async (notes: Note[]) => {
    const ids = new Set(notes.map((n) => n.id));
    setDeleting(ids);
    await new Promise((r) => setTimeout(r, DELETE_ANIM_MS));
    try {
      for (const note of notes) {
        await deleteNoteForever(note.id);
        await cancelNativeReminder(note.id);
      }
      setTrash((prev) => prev.filter((n) => !ids.has(n.id)));
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setDeleting(new Set());
    }
  };

  const emptyAll = async () => {
    const ids = new Set(trash.map((n) => n.id));
    setDeleting(ids);
    await new Promise((r) => setTimeout(r, DELETE_ANIM_MS));
    try {
      await emptyTrash();
      for (const note of trash) await cancelNativeReminder(note.id);
      setTrash([]);
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setDeleting(new Set());
    }
  };

  const runConfirm = async () => {
    if (confirm?.type === "one") {
      const note = confirm.note;
      setConfirm(null);
      await deleteForever([note]);
    } else if (confirm?.type === "selected") {
      const picked = trash.filter((n) => selected.has(n.id));
      setConfirm(null);
      await deleteForever(picked);
      exitSelecting();
    } else if (confirm?.type === "empty") {
      setConfirm(null);
      await emptyAll();
    }
  };

  const dialog: { title: string; body: ReactNode; confirmLabel: string } | null =
    confirm == null
      ? null
      : confirm.type === "one"
        ? {
            title: "Xóa hẳn ghi chú?",
            body: (
              <>
                Ghi chú <strong>{titleOf(confirm.note)}</strong> sẽ bị{" "}
                <strong style={{ color: ACCENT }}>xóa vĩnh viễn</strong> và không khôi phục được.
              </>
            ),
            confirmLabel: "Xóa hẳn",
          }
        : confirm.type === "selected"
          ? {
              title: `Xóa hẳn ${selected.size} ghi chú?`,
              body: (
                <>
                  <strong>{selected.size} ghi chú</strong> đã chọn sẽ bị{" "}
                  <strong style={{ color: ACCENT }}>xóa vĩnh viễn</strong> và không khôi phục được.
                </>
              ),
              confirmLabel: "Xóa hẳn",
            }
          : {
              title: "Dọn sạch thùng rác?",
              body: (
                <>
                  <strong>{trash.length} ghi chú</strong> trong thùng rác sẽ bị{" "}
                  <strong style={{ color: ACCENT }}>xóa vĩnh viễn</strong> và không khôi phục được.
                </>
              ),
              confirmLabel: "Dọn sạch",
            };

  const menuBtn: CSSProperties = {
    flex: 1,
    border: 0,
    background: "transparent",
    fontWeight: 600,
    padding: "10px 4px",
  };

  return (
    <main className="page">
      <header className="toolbar">
        <button
          type="button"
          onClick={handleBack}
          aria-label={selecting ? "Thoát chế độ chọn" : "Quay lại danh sách"}
        >
          ‹
        </button>
        <h1>{selecting ? `Đã chọn ${selected.size}` : "Thùng rác"}</h1>
        <button
          type="button"
          onClick={() => setView(view === "list" ? "grid" : "list")}
          aria-label={view === "list" ? "Xem dạng lưới" : "Xem dạng danh sách"}
        >
          {view === "list" ? gridIcon : listIcon}
        </button>
      </header>
      {trash.length === 0 ? (
        <div style={{ textAlign: "center", marginTop: 48, color: "#6b6156" }}>
          <svg
            width="72"
            height="72"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#6b6156"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 7h16" />
            <path d="M9 7V4h6v3" />
            <path d="M6 7l1 13h10l1-13" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
          </svg>
          <p style={{ fontSize: 17, fontWeight: 700, color: "#2b2620", margin: "12px 0 4px" }}>
            Thùng rác trống
          </p>
          <p style={{ margin: 0, fontSize: 14 }}>Ghi chú đã xóa sẽ ở đây trong 30 ngày.</p>
        </div>
      ) : view === "list" ? (
        <div className="trash-list">
          {trash.map((n) => (
            <TrashCard
              key={n.id}
              note={n}
              view="list"
              selecting={selecting}
              selected={selected.has(n.id)}
              deleting={deleting.has(n.id)}
              onToggle={() => toggleSelect(n)}
              onRestore={() => void restoreOne(n)}
              onDelete={() => setConfirm({ type: "one", note: n })}
            />
          ))}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
          {trash.map((n) => (
            <TrashCard
              key={n.id}
              note={n}
              view="grid"
              selecting={selecting}
              selected={selected.has(n.id)}
              deleting={deleting.has(n.id)}
              onToggle={() => toggleSelect(n)}
              onRestore={() => void restoreOne(n)}
              onDelete={() => setConfirm({ type: "one", note: n })}
            />
          ))}
        </div>
      )}
      {/* Menu riêng của thùng rác (không có Ghi chú / Sao lưu, không có nút +):
          App.tsx cần ẩn BottomNav chung khi ở màn này, xem báo cáo v18. */}
      <nav
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 60,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-around",
          minHeight: 76,
          background: "#fffdf7",
          borderTop: "1px solid #e6dcc8",
          padding: "8px 16px calc(env(safe-area-inset-bottom, 0px) + 8px)",
        }}
        aria-label="Thao tác thùng rác"
      >
        {selecting ? (
          <>
            <button
              type="button"
              style={{ ...menuBtn, opacity: selected.size === 0 ? 0.45 : 1 }}
              disabled={selected.size === 0}
              onClick={() => void quickRestore()}
            >
              Khôi phục nhanh
            </button>
            <button
              type="button"
              style={{
                width: 56,
                height: 56,
                flex: "none",
                margin: "-28px auto 0",
                borderRadius: "50%",
                background: "#efe6cf",
                border: "1px solid #e6dcc8",
                color: "#2b2620",
                fontSize: 22,
                lineHeight: 1,
                padding: 0,
                boxShadow: "0 6px 16px rgba(43, 38, 32, 0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              onClick={exitSelecting}
              aria-label="Hủy chọn"
            >
              ✕
            </button>
            <button
              type="button"
              style={{ ...menuBtn, color: ACCENT, opacity: selected.size === 0 ? 0.45 : 1 }}
              disabled={selected.size === 0}
              onClick={() => setConfirm({ type: "selected" })}
            >
              Xóa hẳn
            </button>
          </>
        ) : (
          <>
            <button type="button" style={menuBtn} onClick={enterSelecting}>
              Chọn
            </button>
            <button
              type="button"
              style={{ ...menuBtn, color: ACCENT }}
              disabled={trash.length === 0}
              onClick={() => setConfirm({ type: "empty" })}
            >
              Dọn sạch
            </button>
          </>
        )}
      </nav>
      {dialog ? (
        <ConfirmDialog
          open
          title={dialog.title}
          body={dialog.body}
          confirmLabel={dialog.confirmLabel}
          danger
          onConfirm={() => void runConfirm()}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
    </main>
  );
}
