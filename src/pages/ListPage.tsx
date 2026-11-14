import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Note, Tag } from "../lib/types";
import NoteCard from "../components/NoteCard";

type Props = {
  notes: Note[];
  tags: Tag[];
  query: string;
  onQuery: (q: string) => void;
  onOpen: (note: Note) => void;
  onTogglePin: (note: Note) => void;
  onNew: () => void;
  onAssignTag: (note: Note, tag: string | null) => void;
};

type DragState = {
  note: Note;
  x: number;
  y: number;
  overTag: string | null;
  moved: boolean;
};

// Nhấn giữ nửa giây mới nhấc note lên: cuộn trang bằng tay vẫn bình thường,
// chỉ khi giữ yên mới bắt đầu kéo. HTML5 drag-and-drop không dùng được
// trên cảm ứng nên kéo thả viết bằng Pointer Events, chạy cả chuột lẫn tay.
const LONG_PRESS_MS = 400;
const MOVE_PX = 12;

export default function ListPage({ notes, tags, query, onQuery, onOpen, onTogglePin, onNew, onAssignTag }: Props) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const dragRef = useRef<DragState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef({ x: 0, y: 0, note: null as Note | null });
  const cbRef = useRef({ onOpen, onAssignTag });
  cbRef.current = { onOpen, onAssignTag };
  dragRef.current = drag;

  // Một note có nhiều tag thì hiện ở mỗi nhóm của nó.
  const groups = [
    ...tags.map((t) => ({ name: t.name, notes: notes.filter((n) => n.tags.includes(t.name)) })),
    { name: "", notes: notes.filter((n) => n.tags.length === 0) },
  ];

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  // Nhóm tag nằm dưới điểm (x, y); "" là nhóm Chưa gắn tag, null là ngoài nhóm.
  const groupAt = (x: number, y: number): string | null => {
    const el = document.elementFromPoint(x, y)?.closest("[data-tag-group]");
    return el ? (el.getAttribute("data-tag-group") ?? "") : null;
  };

  const beginDrag = (note: Note, x: number, y: number) => {
    const d: DragState = { note, x, y, overTag: groupAt(x, y), moved: false };
    dragRef.current = d;
    setDrag(d);
  };

  const endDrag = () => {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!d) return;
    if (d.moved && d.overTag !== null) {
      cbRef.current.onAssignTag(d.note, d.overTag === "" ? null : d.overTag);
    } else if (!d.moved) {
      cbRef.current.onOpen(d.note);
    }
  };

  const onCardPointerDown = (note: Note, e: ReactPointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    startRef.current = { x: e.clientX, y: e.clientY, note };
    if (e.pointerType === "mouse") {
      beginDrag(note, e.clientX, e.clientY);
    } else {
      clearTimer();
      timerRef.current = setTimeout(() => beginDrag(note, e.clientX, e.clientY), LONG_PRESS_MS);
    }
  };

  useEffect(() => () => clearTimer(), []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (d) {
        const moved =
          d.moved ||
          Math.hypot(e.clientX - startRef.current.x, e.clientY - startRef.current.y) > MOVE_PX;
        const next: DragState = { ...d, x: e.clientX, y: e.clientY, overTag: groupAt(e.clientX, e.clientY), moved };
        dragRef.current = next;
        setDrag(next);
        return;
      }
      // Chưa nhấc lên mà tay đã trượt đi: đó là cuộn trang, hủy hẹn giờ.
      const s = startRef.current;
      if (s.note && Math.hypot(e.clientX - s.x, e.clientY - s.y) > MOVE_PX) {
        clearTimer();
        startRef.current = { x: 0, y: 0, note: null };
      }
    };
    const onUp = () => {
      clearTimer();
      startRef.current = { x: 0, y: 0, note: null };
      if (dragRef.current) endDrag();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  // Đang kéo thì chặn cuộn trang bằng tay; chưa kéo thì cuộn bình thường.
  useEffect(() => {
    if (!drag) return;
    const block = (e: TouchEvent) => e.preventDefault();
    window.addEventListener("touchmove", block, { passive: false });
    return () => window.removeEventListener("touchmove", block);
  }, [drag]);

  const toggleGroup = (name: string) =>
    setCollapsed((prev) => ({ ...prev, [name]: !prev[name] }));

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
        <>
          <p className="drag-hint">Nhấn giữ một ghi chú rồi kéo vào nhóm tag để gắn tag.</p>
          {groups.map((g) => (
            <section
              key={g.name || "none"}
              className={`tag-group${drag && drag.overTag === g.name ? " drop-target" : ""}`}
              data-tag-group={g.name}
            >
              <button
                type="button"
                className="group-header"
                aria-expanded={!collapsed[g.name]}
                onClick={() => toggleGroup(g.name)}
              >
                <span>{g.name === "" ? "Chưa gắn tag" : g.name}</span>
                <span>
                  {g.notes.length} ghi chú {collapsed[g.name] ? "▸" : "▾"}
                </span>
              </button>
              {!collapsed[g.name] &&
                (g.notes.length === 0 ? (
                  <p className="group-empty">
                    {g.name === ""
                      ? "Kéo ghi chú vào đây để gỡ hết tag."
                      : "Kéo ghi chú vào đây để gắn tag này."}
                  </p>
                ) : (
                  <div className="note-list">
                    {g.notes.map((n) => (
                      <NoteCard
                        key={`${g.name}-${n.id}`}
                        note={n}
                        onOpen={onOpen}
                        onTogglePin={onTogglePin}
                        onPointerDown={onCardPointerDown}
                        dragging={drag?.note.id === n.id}
                      />
                    ))}
                  </div>
                ))}
            </section>
          ))}
        </>
      )}
      {drag ? (
        <div className="drag-clone" style={{ left: drag.x + 12, top: drag.y - 20 }}>
          {drag.note.title.trim() || "Ghi chú mới"}
        </div>
      ) : null}
    </main>
  );
}
