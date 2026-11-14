import { useCallback, useEffect, useRef, useState } from "react";
import { exit, onBackButtonPress } from "@tauri-apps/api/app";
import type { Note, Tag } from "./lib/types";
import { beep } from "./lib/beep";
import {
  createNote,
  isTauri,
  listNotes,
  listTags,
  searchNotes,
  setNoteTags,
  setReminder,
  togglePin,
  trashNote,
} from "./services/notesApi";
import ListPage from "./pages/ListPage";
import EditorPage from "./pages/EditorPage";
import TrashPage from "./pages/TrashPage";
import TagsPage from "./pages/TagsPage";
import BackupPage from "./pages/BackupPage";
import "./styles.css";

type View = { name: "list" } | { name: "editor"; note: Note } | { name: "trash" } | { name: "tags" } | { name: "backup" };

export default function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>({ name: "list" });
  const [error, setError] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(new Set());
  // Note tới giờ nhắc hẹn, đang chờ người dùng bấm mở hoặc đóng bảng.
  const [due, setDue] = useState<Note[]>([]);
  // Id note đã hiện bảng nhắc trong phiên này (tránh nhắc lại nhiều lần).
  const shownRef = useRef<Set<number>>(new Set());
  const viewRef = useRef(view);
  viewRef.current = view;
  // Nút Back chạy từ listener đăng ký một lần nên đọc chế độ chọn qua ref.
  const selectModeRef = useRef(false);
  selectModeRef.current = selectMode;

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelect = useCallback((note: Note) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(note.id)) next.delete(note.id);
      else next.add(note.id);
      return next;
    });
  }, []);

  const reload = useCallback(async (q: string) => {
    try {
      setNotes(q.trim() ? await searchNotes(q) : await listNotes());
      setTags(await listTags());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    if (!isTauri()) {
      setError("Mở app qua Tauri mới có dữ liệu (mở bằng trình duyệt thường sẽ không gọi được lệnh Rust).");
      return;
    }
    void reload("");
  }, [reload]);

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    let unregister: (() => void) | undefined;
    onBackButtonPress(({ canGoBack }) => {
      if (viewRef.current.name === "list" && selectModeRef.current) {
        exitSelectMode();
      } else if (viewRef.current.name !== "list") {
        setView({ name: "list" });
      } else if (!canGoBack) {
        void exit(0);
      }
    })
      .then((listener) => {
        if (!cancelled) unregister = () => listener.unregister();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      unregister?.();
    };
  }, []);

  const openNote = (note: Note) => setView({ name: "editor", note });

  const openTrash = () => {
    exitSelectMode();
    setView({ name: "trash" });
  };

  const openTags = () => {
    exitSelectMode();
    setView({ name: "tags" });
  };

  const openBackup = () => {
    exitSelectMode();
    setView({ name: "backup" });
  };

  const newNote = async () => {
    try {
      exitSelectMode();
      const created = await createNote({ title: "", content: "", colour: "yellow", pinned: false });
      setNotes((prev) => [created, ...prev]);
      setView({ name: "editor", note: created });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const flipPin = async (note: Note) => {
    try {
      const saved = await togglePin(note.id);
      setNotes((prev) => prev.map((n) => (n.id === saved.id ? saved : n)));
      if (viewRef.current.name === "editor" && viewRef.current.note.id === saved.id) {
        setView({ name: "editor", note: saved });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onSaved = (saved: Note) => {
    setNotes((prev) => prev.map((n) => (n.id === saved.id ? saved : n)));
    if (viewRef.current.name === "editor") setView({ name: "editor", note: saved });
  };

  // Nhóm tag trên danh sách vẽ từ state `tags`, còn `onSaved` ở editor chỉ
  // cập nhật `notes` nên tag mới tạo không hiện nhóm cho tới khi mở lại app.
  // Editor gọi riêng hàm này mỗi lần thêm/gỡ tag xong (autosave gõ chữ thì
  // không gọi, đỡ đọc DB thừa mỗi 800ms).
  const reloadTags = useCallback(async () => {
    try {
      setTags(await listTags());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // Kéo note vào nhóm tag: tag là tên nhóm, null là nhóm Chưa gắn tag (gỡ hết).
  // Kéo nhiều note: gắn lần lượt từng note, note nào lỗi thì báo và dừng ở
  // đó, các note trước vẫn giữ kết quả đã gắn.
  const assignTags = async (picked: Note[], tag: string | null) => {
    for (const note of picked) {
      const next = tag === null ? [] : Array.from(new Set([...note.tags, tag]));
      if (tag !== null && next.length === note.tags.length) continue;
      try {
        onSaved(await setNoteTags(note.id, next));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return;
      }
    }
    await reloadTags();
  };

  // Cho một hoặc nhiều note vào thùng rác; về danh sách sau khi xong.
  const trashNotes = async (picked: Note[]) => {
    for (const note of picked) {
      try {
        await trashNote(note.id);
        setNotes((prev) => prev.filter((n) => n.id !== note.id));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return;
      }
    }
    await reloadTags();
    exitSelectMode();
    setView({ name: "list" });
  };

  // Nhắc hẹn: CHỈ nhắc khi app đang mở. Đọc thẳng DB mỗi lần kiểm (kể cả
  // khi đang tìm kiếm, danh sách trên màn hình có thể thiếu note cần nhắc):
  // note nào tới giờ mà chưa hiện trong phiên này thì hiện bảng nhắc, kêu
  // một tiếng, rồi gỡ nhắc hẹn để chỉ nhắc một lần duy nhất.
  const checkDue = useCallback(async () => {
    let all: Note[];
    try {
      all = await listNotes();
    } catch {
      return;
    }
    const now = Date.now();
    const dueNotes = all.filter(
      (n) => n.remindAt != null && n.remindAt <= now && !shownRef.current.has(n.id),
    );
    if (dueNotes.length === 0) return;
    dueNotes.forEach((n) => shownRef.current.add(n.id));
    setDue((prev) => [...prev, ...dueNotes.filter((n) => !prev.some((p) => p.id === n.id))]);
    beep();
    for (const n of dueNotes) {
      try {
        const saved = await setReminder(n.id, null);
        setNotes((prev) => prev.map((x) => (x.id === saved.id ? saved : x)));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
  }, []);

  // Kiểm tra mỗi 60 giây, và mỗi khi danh sách note đổi (kể cả lúc mở app
  // tải xong) để nhắc hẹn không bị muộn quá một phút.
  useEffect(() => {
    if (!isTauri()) return;
    void checkDue();
    const timer = setInterval(() => void checkDue(), 60_000);
    return () => clearInterval(timer);
  }, [checkDue]);

  useEffect(() => {
    void checkDue();
  }, [notes, checkDue]);

  // Mở note từ bảng nhắc: lấy bản mới nhất trong danh sách (nhắc hẹn đã bị
  // gỡ sau khi hiện bảng nên bản trong bảng nhắc là bản cũ).
  const openDue = (note: Note) => {
    setDue((prev) => prev.filter((d) => d.id !== note.id));
    exitSelectMode();
    setView({ name: "editor", note: notes.find((n) => n.id === note.id) ?? note });
  };

  return (
    <>
      {error ? <p className="error">{error}</p> : null}
      {view.name === "list" ? (
        <ListPage
          notes={notes}
          tags={tags}
          query={query}
          onQuery={(q) => {
            setQuery(q);
            void reload(q);
          }}
          onOpen={openNote}
          onTogglePin={(n) => void flipPin(n)}
          onNew={() => void newNote()}
          onAssignTags={(ns, t) => void assignTags(ns, t)}
          onTrashNotes={(ns) => void trashNotes(ns)}
          onOpenTrash={openTrash}
          onOpenTags={openTags}
          onOpenBackup={openBackup}
          selectMode={selectMode}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onEnterSelectMode={() => setSelectMode(true)}
          onExitSelectMode={exitSelectMode}
        />
      ) : view.name === "trash" ? (
        <TrashPage
          onClose={() => setView({ name: "list" })}
          onChanged={() => void reload(query)}
        />
      ) : view.name === "tags" ? (
        <TagsPage
          onClose={() => setView({ name: "list" })}
          onChanged={() => void reload(query)}
        />
      ) : view.name === "backup" ? (
        <BackupPage
          onClose={() => setView({ name: "list" })}
          onChanged={() => void reload(query)}
        />
      ) : (
        <EditorPage
          note={view.note}
          onClose={() => setView({ name: "list" })}
          onSaved={onSaved}
          onTagsChanged={() => void reloadTags()}
          onTrash={(n) => void trashNotes([n])}
        />
      )}
      {due.length > 0 ? (
        <div className="due-overlay">
          <div className="due-card">
            <h2>Đến giờ nhắc hẹn</h2>
            {due.map((n) => (
              <button key={n.id} className="due-item" onClick={() => openDue(n)}>
                {n.title.trim() || "Ghi chú mới"}
              </button>
            ))}
            <button onClick={() => setDue([])}>Đóng</button>
          </div>
        </div>
      ) : null}
    </>
  );
}
