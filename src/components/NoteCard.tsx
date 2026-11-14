import type { PointerEvent } from "react";
import type { Note } from "../lib/types";

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
          Ghim
        </button>
      ) : null}
      <h2>{title}</h2>
      {preview ? <p>{preview}</p> : null}
    </article>
  );
}
