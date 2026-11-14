import type { PointerEvent } from "react";
import type { Note } from "../lib/types";

type Props = {
  note: Note;
  onOpen: (note: Note) => void;
  onTogglePin: (note: Note) => void;
  onPointerDown?: (note: Note, e: PointerEvent) => void;
  dragging?: boolean;
};

export default function NoteCard({ note, onOpen, onTogglePin, onPointerDown, dragging }: Props) {
  const title = note.title.trim() || "Ghi chú mới";
  const preview = note.content.trim().slice(0, 80);
  return (
    <article
      className={`note-card colour-${note.colour}${dragging ? " dragging" : ""}`}
      onClick={() => onOpen(note)}
      onPointerDown={(e) => onPointerDown?.(note, e)}
    >
      <button
        className="pin-btn"
        aria-label={note.pinned ? "Bỏ ghim" : "Ghim"}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onTogglePin(note);
        }}
      >
        {note.pinned ? "Đã ghim" : "Ghim"}
      </button>
      <h2>{title}</h2>
      {preview ? <p>{preview}</p> : null}
      {note.tags.length > 0 ? (
        <div className="tag-chips">
          {note.tags.map((t) => (
            <span key={t} className="tag-chip">
              {t}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}
