import type { PointerEvent } from "react";
import type { Note } from "../lib/types";

// Icon đinh ghim (cùng hình với PinIcon ở EditorPage, thu nhỏ 16px,
// tô đặc màu đỏ chủ đạo để dễ thấy trên thẻ).
function PinIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 4h6l1 7 3 3v2H5v-2l3-3 1-7z" />
      <path d="M12 16v5" />
    </svg>
  );
}

type Props = {
  note: Note;
  onOpen: (note: Note) => void;
  onTogglePin: (note: Note) => void;
  onPointerDown?: (note: Note, e: PointerEvent) => void;
  // Đang bị kéo: ô biến thành khe thả (viền đứt nét đỏ), chỉ giữ chỗ trong lưới.
  dragging?: boolean;
  // Đang cho vào thùng rác: mờ dần + co lại rồi mới biến khỏi danh sách.
  deleting?: boolean;
  // Chế độ chọn nhiều: thẻ hiện ô tick thay cho chip ghim.
  selectMode?: boolean;
  selected?: boolean;
};

export default function NoteCard({
  note,
  onOpen,
  onTogglePin,
  onPointerDown,
  dragging,
  deleting,
  selectMode,
  selected,
}: Props) {
  if (dragging) {
    return (
      <article
        className="note-card drop-slot"
        data-note-id={note.id}
        aria-hidden="true"
      />
    );
  }
  const title = note.title.trim() || "Ghi chú mới";
  const preview = note.content.trim();
  return (
    <article
      className={`note-card colour-${note.colour}${deleting ? " deleting" : ""}`}
      data-note-id={note.id}
      onClick={() => onOpen(note)}
      onPointerDown={(e) => onPointerDown?.(note, e)}
    >
      {selectMode ? (
        <span className={`tick${selected ? " on" : ""}`} aria-hidden="true">
          {selected ? "✓" : ""}
        </span>
      ) : note.pinned ? (
        <button
          type="button"
          className="pin-chip"
          aria-label="Bỏ ghim"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin(note);
          }}
        >
          <PinIcon />
        </button>
      ) : null}
      <h2>{title}</h2>
      {preview ? <p>{preview}</p> : null}
    </article>
  );
}
