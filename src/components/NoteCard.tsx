import type { Note } from "../lib/types";

type Props = {
  note: Note;
  onOpen: (note: Note) => void;
  onTogglePin: (note: Note) => void;
};

export default function NoteCard({ note, onOpen, onTogglePin }: Props) {
  const title = note.title.trim() || "Ghi chú mới";
  const preview = note.content.trim().slice(0, 80);
  return (
    <article className={`note-card colour-${note.colour}`} onClick={() => onOpen(note)}>
      <button
        className="pin-btn"
        aria-label={note.pinned ? "Bỏ ghim" : "Ghim"}
        onClick={(e) => {
          e.stopPropagation();
          onTogglePin(note);
        }}
      >
        {note.pinned ? "Đã ghim" : "Ghim"}
      </button>
      <h2>{title}</h2>
      {preview ? <p>{preview}</p> : null}
    </article>
  );
}
