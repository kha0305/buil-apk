import type { Note } from "../lib/types";
import NoteCard from "../components/NoteCard";

type Props = {
  notes: Note[];
  query: string;
  onQuery: (q: string) => void;
  onOpen: (note: Note) => void;
  onTogglePin: (note: Note) => void;
  onNew: () => void;
};

export default function ListPage({ notes, query, onQuery, onOpen, onTogglePin, onNew }: Props) {
  return (
    <main className="page list-page">
      <header className="toolbar">
        <h1>Ghi chú</h1>
        <button className="add-btn" onClick={onNew} aria-label="Thêm ghi chú">
          +
        </button>
      </header>
      <input
        className="search"
        type="search"
        placeholder="Tìm ghi chú..."
        value={query}
        onChange={(e) => onQuery(e.currentTarget.value)}
      />
      {notes.length === 0 ? (
        <p className="empty">Chưa có ghi chú nào. Bấm + để tạo ghi chú đầu tiên.</p>
      ) : (
        <div className="note-list">
          {notes.map((n) => (
            <NoteCard key={n.id} note={n} onOpen={onOpen} onTogglePin={onTogglePin} />
          ))}
        </div>
      )}
    </main>
  );
}
