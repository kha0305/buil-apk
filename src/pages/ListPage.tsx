import { Fragment, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Note, Tag } from "../lib/types";
import { getSetting, setSetting } from "../services/notesApi";
import NoteCard from "../components/NoteCard";

type Props = {
  notes: Note[];
  tags: Tag[];
  query: string;
  onQuery: (q: string) => void;
  onOpen: (note: Note) => void;
  onTogglePin: (note: Note) => void;
  onNew: () => void;
  onAssignTags: (notes: Note[], tag: string | null) => void;
  onTrashNotes: (notes: Note[]) => void;
  onOpenTrash: () => void;
  onOpenTags: () => void;
  onOpenBackup: () => void;
  selectMode: boolean;
  selectedIds: ReadonlySet<number>;
  onToggleSelect: (note: Note) => void;
  onEnterSelectMode: () => void;
  onExitSelectMode: () => void;
};

// `notes` là tập note đang kéo: 1 note khi kéo đơn, N note khi kéo nhiều
// trong chế độ chọn. `overTrash` = con trỏ đang ở trên vùng thùng rác.
type DragState = {
  notes: Note[];
  x: number;
  y: number;
  overTag: string | null;
  overTrash: boolean;
  moved: boolean;
};

// Nhóm đang bị kéo theo tiêu đề: `insertIndex` là chỗ sẽ thả trong danh
// sách tên tag đã bỏ nhóm đang kéo (không tính nhóm "Chưa gắn tag").
type GroupDrag = {
  name: string;
  x: number;
  y: number;
  moved: boolean;
  insertIndex: number;
};

// Nhấn giữ nửa giây mới nhấc note lên: cuộn trang bằng tay vẫn bình thường,
// chỉ khi giữ yên mới bắt đầu kéo. HTML5 drag-and-drop không dùng được
// trên cảm ứng nên kéo thả viết bằng Pointer Events, chạy cả chuột lẫn tay.
const LONG_PRESS_MS = 400;
const MOVE_PX = 12;

export default function ListPage({ notes, tags, query, onQuery, onOpen, onTogglePin, onNew, onAssignTags, onTrashNotes, onOpenTrash, onOpenTags, onOpenBackup, selectMode, selectedIds, onToggleSelect, onEnterSelectMode, onExitSelectMode }: Props) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [groupDrag, setGroupDrag] = useState<GroupDrag | null>(null);
  // Thứ tự nhóm đã lưu (tên tag theo thứ tự kéo thả); tag chưa có trong
  // danh sách thì xếp cuối theo tên.
  const [tagOrder, setTagOrder] = useState<string[]>([]);
  const dragRef = useRef<DragState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef({ x: 0, y: 0, note: null as Note | null });
  const cbRef = useRef({ onOpen, onAssignTags, onTrashNotes });
  cbRef.current = { onOpen, onAssignTags, onTrashNotes };
  // endDrag chạy từ listener đăng ký một lần nên đọc chế độ chọn qua ref,
  // không đọc state trực tiếp (closure cũ sẽ thấy giá trị cũ).
  const modeRef = useRef({ selectMode, selectedIds });
  modeRef.current = { selectMode, selectedIds };
  dragRef.current = drag;
  // Kéo nhóm dùng chung listener pointermove/pointerup nên cũng đọc nhóm
  // qua ref, không đọc trực tiếp (closure đăng ký một lần sẽ thấy nhóm cũ).
  const groupDragRef = useRef<GroupDrag | null>(null);
  const groupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const groupStartRef = useRef({ x: 0, y: 0, name: null as string | null });
  const groupDragViaTimerRef = useRef(false);
  const suppressHeaderClickRef = useRef(false);
  const groupsRef = useRef<{ name: string; notes: Note[] }[]>([]);
  groupDragRef.current = groupDrag;

  // Nhóm xếp theo thứ tự đã lưu; tag chưa có trong danh sách thì xếp cuối
  // theo tên; nhóm "Chưa gắn tag" ("") luôn cuối cùng, không xếp thứ tự.
  const sortedTags = [...tags].sort((a, b) => {
    const ai = tagOrder.indexOf(a.name);
    const bi = tagOrder.indexOf(b.name);
    if (ai === -1 && bi === -1) return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  // Một note có nhiều tag thì hiện ở mỗi nhóm của nó.
  const groups = [
    ...sortedTags.map((t) => ({ name: t.name, notes: notes.filter((n) => n.tags.includes(t.name)) })),
    { name: "", notes: notes.filter((n) => n.tags.length === 0) },
  ];
  groupsRef.current = groups;

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  // Nhóm tag nằm dưới điểm (x, y); "" là nhóm Chưa gắn tag, null là ngoài nhóm.
  const groupAt = (x: number, y: number): string | null => {
    const el = document.elementFromPoint(x, y)?.closest("[data-tag-group]");
    return el ? (el.getAttribute("data-tag-group") ?? "") : null;
  };

  // Con trỏ/chạm có đang ở trên vùng thùng rác (chỉ hiện khi đang kéo).
  const trashAt = (x: number, y: number): boolean =>
    document.elementFromPoint(x, y)?.closest("[data-trash-zone]") != null;

  const beginDrag = (note: Note, x: number, y: number) => {
    // Chế độ chọn mà note đã chọn thì kéo cả tập đã chọn (giữ thứ tự danh
    // sách); còn lại kéo đúng 1 note như cũ.
    const picked =
      modeRef.current.selectMode && modeRef.current.selectedIds.has(note.id)
        ? notes.filter((n) => modeRef.current.selectedIds.has(n.id))
        : [note];
    const d: DragState = { notes: picked, x, y, overTag: groupAt(x, y), overTrash: false, moved: false };
    dragRef.current = d;
    setDrag(d);
  };

  const endDrag = () => {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!d) return;
    if (d.moved && d.overTrash) {
      cbRef.current.onTrashNotes(d.notes);
    } else if (d.moved && d.overTag !== null) {
      cbRef.current.onAssignTags(d.notes, d.overTag === "" ? null : d.overTag);
    } else if (!d.moved && !modeRef.current.selectMode) {
      // Chế độ chọn: cú bấm không kéo thì để click trên thẻ xử lý chọn/bỏ
      // chọn, không mở editor (tránh chọn 2 lần).
      cbRef.current.onOpen(d.notes[0]);
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

  const clearGroupTimer = () => {
    if (groupTimerRef.current) clearTimeout(groupTimerRef.current);
    groupTimerRef.current = null;
  };

  // Chỗ sẽ thả nhóm đang kéo, tính theo điểm (x, y): nửa trên của một nhóm
  // thì chèn trước nó, nửa dưới thì chèn sau nó. Trả chỉ số trong danh sách
  // tên tag đã bỏ nhóm đang kéo (không tính nhóm "Chưa gắn tag").
  const insertIndexAt = (x: number, y: number, draggedName: string): number => {
    const names = groupsRef.current.map((g) => g.name).filter((n) => n !== "");
    const draggedPos = names.indexOf(draggedName);
    const el = document.elementFromPoint(x, y)?.closest("[data-tag-group]");
    if (!el) {
      const first = document.querySelector("[data-tag-group]") as HTMLElement | null;
      if (first && y < first.getBoundingClientRect().top) return 0;
      return names.length;
    }
    const name = el.getAttribute("data-tag-group") ?? "";
    // Thả vào nhóm "Chưa gắn tag" (luôn cuối) thì nhóm về cuối cùng.
    if (name === "") return names.length;
    const idx = names.indexOf(name);
    if (idx === -1) return names.length;
    const rect = (el as HTMLElement).getBoundingClientRect();
    const pos = y < rect.top + rect.height / 2 ? idx : idx + 1;
    return pos > draggedPos ? pos - 1 : pos;
  };

  const beginGroupDrag = (name: string, x: number, y: number, viaTimer: boolean) => {
    const idx = groupsRef.current.map((g) => g.name).filter((n) => n !== "").indexOf(name);
    const d: GroupDrag = { name, x, y, moved: false, insertIndex: idx < 0 ? 0 : idx };
    groupDragRef.current = d;
    groupDragViaTimerRef.current = viaTimer;
    setGroupDrag(d);
  };

  const endGroupDrag = () => {
    const d = groupDragRef.current;
    groupDragRef.current = null;
    setGroupDrag(null);
    if (!d) return;
    if (d.moved) {
      // Lưu thứ tự mới xuống DB ngay để tắt app mở lại vẫn giữ.
      const order = groupsRef.current
        .map((g) => g.name)
        .filter((n) => n !== "" && n !== d.name);
      order.splice(Math.min(d.insertIndex, order.length), 0, d.name);
      setTagOrder(order);
      void setSetting("tag_order", JSON.stringify(order)).catch(() => undefined);
    }
    // Click sẽ nổ ngay sau pointerup nếu không kéo (chuột) hoặc nhấn giữ
    // rồi thả mà không kéo (cảm ứng): chặn click đó để bấm không bị đổi
    // trạng thái nhóm hai lần. Bấm thường (không kéo) thì để click thu
    // gọn/mở nhóm như cũ.
    if (d.moved || groupDragViaTimerRef.current) suppressHeaderClickRef.current = true;
  };

  // Nhóm "Chưa gắn tag" luôn cuối cùng nên không kéo được, chỉ bấm thu gọn.
  const onGroupPointerDown = (name: string, e: ReactPointerEvent) => {
    if (!name) return;
    suppressHeaderClickRef.current = false;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    groupStartRef.current = { x: e.clientX, y: e.clientY, name };
    if (e.pointerType === "mouse") {
      beginGroupDrag(name, e.clientX, e.clientY, false);
    } else {
      clearGroupTimer();
      groupTimerRef.current = setTimeout(
        () => beginGroupDrag(name, e.clientX, e.clientY, true),
        LONG_PRESS_MS,
      );
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
        const next: DragState = {
          ...d,
          x: e.clientX,
          y: e.clientY,
          overTag: groupAt(e.clientX, e.clientY),
          overTrash: trashAt(e.clientX, e.clientY),
          moved,
        };
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
      const gd = groupDragRef.current;
      if (gd) {
        const moved =
          gd.moved ||
          Math.hypot(e.clientX - groupStartRef.current.x, e.clientY - groupStartRef.current.y) > MOVE_PX;
        const next: GroupDrag = {
          ...gd,
          x: e.clientX,
          y: e.clientY,
          moved,
          insertIndex: moved ? insertIndexAt(e.clientX, e.clientY, gd.name) : gd.insertIndex,
        };
        groupDragRef.current = next;
        setGroupDrag(next);
        return;
      }
      const gs = groupStartRef.current;
      if (gs.name && Math.hypot(e.clientX - gs.x, e.clientY - gs.y) > MOVE_PX) {
        clearGroupTimer();
        groupStartRef.current = { x: 0, y: 0, name: null };
      }
    };
    const onUp = () => {
      clearTimer();
      clearGroupTimer();
      startRef.current = { x: 0, y: 0, note: null };
      if (dragRef.current) endDrag();
      if (groupDragRef.current) endGroupDrag();
      groupStartRef.current = { x: 0, y: 0, name: null };
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

  // Đang kéo (note hay nhóm) thì chặn cuộn trang bằng tay; chưa kéo thì
  // cuộn bình thường.
  useEffect(() => {
    if (!drag && !groupDrag) return;
    const block = (e: TouchEvent) => e.preventDefault();
    window.addEventListener("touchmove", block, { passive: false });
    return () => window.removeEventListener("touchmove", block);
  }, [drag, groupDrag]);

  const toggleGroup = (name: string) => {
    const next = { ...collapsed };
    if (next[name]) delete next[name];
    else next[name] = true;
    setCollapsed(next);
    // Ghi xuống DB ngay để tắt app mở lại vẫn giữ trạng thái nhóm.
    void setSetting("collapsed_groups", JSON.stringify(Object.keys(next))).catch(() => undefined);
  };

  // Nhóm nào đang thu gọn được lưu trong DB (ListPage unmount mỗi lần mở
  // editor nên state trong bộ nhớ không giữ được qua lần mở note).
  // Thứ tự nhóm cũng vậy: đọc tag_order cùng lúc.
  useEffect(() => {
    getSetting("collapsed_groups")
      .then((v) => {
        if (!v) return;
        try {
          const names = JSON.parse(v) as string[];
          setCollapsed(Object.fromEntries(names.map((n) => [n, true])));
        } catch {
          // Giá trị cũ hỏng thì bỏ qua, mặc định mở hết nhóm.
        }
      })
      .catch(() => undefined);
    getSetting("tag_order")
      .then((v) => {
        if (!v) return;
        try {
          const names = JSON.parse(v) as string[];
          setTagOrder(names.filter((n) => typeof n === "string"));
        } catch {
          // Giá trị cũ hỏng thì bỏ qua, nhóm xếp theo tên như cũ.
        }
      })
      .catch(() => undefined);
  }, []);

  return (
    <main className="page list-page">
      {selectMode ? (
        <header className="toolbar">
          <h1>Đã chọn {selectedIds.size}</h1>
          <button onClick={onExitSelectMode}>Hủy</button>
        </header>
      ) : (
        <header className="toolbar">
          <h1>Ghi chú</h1>
          <button onClick={onEnterSelectMode}>Chọn</button>
          <button onClick={onOpenTags}>Quản lý tag</button>
          <button onClick={onOpenTrash}>Thùng rác</button>
          <button onClick={onOpenBackup}>Sao lưu</button>
          <button className="add-btn" onClick={onNew} aria-label="Thêm ghi chú">
            +
          </button>
        </header>
      )}
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
          <p className="drag-hint">
            {selectMode
              ? "Bấm thẻ để chọn, nhấn giữ một thẻ đã chọn để kéo cả nhóm đi."
              : "Nhấn giữ một ghi chú rồi kéo vào nhóm tag để gắn tag, hoặc kéo xuống thùng rác để xóa. Nhấn giữ tiêu đề nhóm để kéo đổi thứ tự nhóm."}
          </p>
          {groups.map((g) => {
            // Vạch chèn tính theo danh sách đã bỏ nhóm đang kéo ra: nhóm
            // nào đứng sau nhóm đang kéo thì chỉ số lùi xuống 1; nhóm "Chưa
            // gắn tag" là cuối cùng nên khe của nó là sau tất cả các tag.
            const draggedIdx = groupDrag
              ? sortedTags.findIndex((t) => t.name === groupDrag.name)
              : -1;
            const j =
              g.name === "" ? sortedTags.length : sortedTags.findIndex((t) => t.name === g.name);
            const slot = j - (draggedIdx >= 0 && j > draggedIdx ? 1 : 0);
            return (
              <Fragment key={g.name || "none"}>
                {groupDrag?.moved && groupDrag.insertIndex === slot ? (
                  <div className="insert-line" />
                ) : null}
                <section
                  key={g.name || "none"}
                  className={`tag-group${drag && drag.overTag === g.name ? " drop-target" : ""}${groupDrag?.name === g.name ? " group-dragging" : ""}`}
                  data-tag-group={g.name}
                >
                <button
                  type="button"
                  className="group-header"
                  aria-expanded={!collapsed[g.name]}
                  onPointerDown={(e) => onGroupPointerDown(g.name, e)}
                  onClick={() => {
                    if (suppressHeaderClickRef.current) {
                      suppressHeaderClickRef.current = false;
                      return;
                    }
                    toggleGroup(g.name);
                  }}
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
                        onOpen={(note) => {
                          if (selectMode) onToggleSelect(note);
                          else onOpen(note);
                        }}
                        onTogglePin={onTogglePin}
                        onPointerDown={onCardPointerDown}
                        dragging={drag?.notes.some((d) => d.id === n.id)}
                        selectMode={selectMode}
                        selected={selectedIds.has(n.id)}
                      />
                    ))}
                  </div>
                ))}
              </section>
              </Fragment>
            );
          })}
        </>
      )}
      {drag ? (
        <div
          className={`trash-zone${drag.overTrash ? " drop-target" : ""}`}
          data-trash-zone
        >
          Thùng rác — thả vào đây để xóa
        </div>
      ) : null}
      {drag ? (
        <div className="drag-clone" style={{ left: drag.x + 12, top: drag.y - 20 }}>
          {drag.notes.length > 1
            ? `${drag.notes.length} ghi chú`
            : drag.notes[0].title.trim() || "Ghi chú mới"}
        </div>
      ) : null}
      {groupDrag && groupDrag.moved ? (
        <div className="drag-clone" style={{ left: groupDrag.x + 12, top: groupDrag.y - 20 }}>
          Nhóm {groupDrag.name}
        </div>
      ) : null}
    </main>
  );
}
