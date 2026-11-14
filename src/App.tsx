import { useCallback, useEffect, useRef, useState } from "react";
import { exit, onBackButtonPress } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import type { Note, Tag } from "./lib/types";
import { toast } from "./lib/toast";
import {
  checkRemindersNow,
  startReminderPoll,
  type DueReminder,
} from "./lib/reminderPoll";
import ReminderDialog from "./components/ReminderDialog";
import {
  createNote,
  isTauri,
  listNotes,
  listTags,
  reorderNotes,
  searchNotes,
  setNoteTags,
  togglePin,
  trashNote,
} from "./services/notesApi";
import ListPage from "./pages/ListPage";
import EditorPage from "./pages/EditorPage";
import TrashPage from "./pages/TrashPage";
import BackupPage from "./pages/BackupPage";
import BottomNav, { type NavView } from "./components/BottomNav";
import ToastHost from "./components/ToastHost";
import "./styles.css";

type View = { name: "list" } | { name: "editor"; note: Note } | { name: "trash" } | { name: "backup" };

export default function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>({ name: "list" });
  // Bộ đếm: tăng mỗi lần bấm tab Ghi chú khi đang ở trang chính, để
  // ListPage bỏ lọc (về "Tất cả").
  const [homeReset, setHomeReset] = useState(0);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(new Set());
  // Id note đang hiện trên màn hình chính (đã lọc chip + tìm kiếm):
  // ListPage báo lên để tính "Chọn tất cả".
  const [visibleIds, setVisibleIds] = useState<number[]>([]);
  // Note đang cho vào thùng rác: mờ + co lại ~350ms rồi mới xóa thật.
  const [deletingIds, setDeletingIds] = useState<ReadonlySet<number>>(new Set());
  // Note tới giờ nhắc hẹn, đang chờ người dùng bấm mở hoặc đóng bảng.
  const [due, setDue] = useState<DueReminder[]>([]);
  const viewRef = useRef(view);
  viewRef.current = view;
  // Nút Back chạy từ listener đăng ký một lần nên đọc chế độ chọn qua ref.
  const selectModeRef = useRef(false);
  selectModeRef.current = selectMode;
  const visibleKeyRef = useRef("");

  // Phản hồi lỗi duy nhất là toast đỏ (không còn banner lỗi, không alert).
  const fail = (e: unknown) => toast(e instanceof Error ? e.message : String(e), "error");

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

  // Chọn/bỏ chọn một loạt id (nút chọn theo nhóm ở đầu mỗi nhóm tag).
  const toggleSelectMany = useCallback((ids: number[], select: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => {
        if (select) next.add(id);
        else next.delete(id);
      });
      return next;
    });
  }, []);

  // ListPage báo tập note đang hiện; chỉ cập nhật khi tập đó đổi hẳn
  // (tránh render lặp: ListPage gọi mỗi lần tập hiện đổi).
  const handleVisibleChange = useCallback((ids: number[]) => {
    const key = ids.join(",");
    if (key === visibleKeyRef.current) return;
    visibleKeyRef.current = key;
    setVisibleIds(ids);
  }, []);

  // "Chọn tất cả" chỉ chọn note đang hiện (đã lọc chip + tìm kiếm);
  // bấm lần nữa thành "Bỏ chọn hết" (bỏ chọn tất cả, kể cả note đã chọn
  // trước đó ngoài vùng hiện).
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const toggleSelectAll = useCallback(() => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds((prev) => new Set([...prev, ...visibleIds]));
  }, [allSelected, visibleIds]);

  const reload = useCallback(async (q: string) => {
    try {
      setNotes(q.trim() ? await searchNotes(q) : await listNotes());
      setTags(await listTags());
    } catch (e) {
      fail(e);
    }
  }, []);

// Gỡ màn chờ inline trong index.html sau lần render đầu — kể cả khi danh
  // sách trống hay tải lỗi, màn chờ không được kẹt lại. Effect chạy 1 lần
  // lúc mount, sau khi giao diện đã render xong.
  useEffect(() => {
    document.getElementById("loading")?.remove();
  }, []);

  useEffect(() => {
    if (!isTauri()) {
      toast(
        "Mở app qua Tauri mới có dữ liệu (mở bằng trình duyệt thường sẽ không gọi được lệnh Rust).",
        "error",
      );
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

  const openBackup = () => {
    exitSelectMode();
    setView({ name: "backup" });
  };

  // Bấm mục trên thanh dưới: về danh sách (thoát chế độ chọn nếu đang
  // chọn) hoặc mở màn thùng rác / sao lưu. Đang ở trang chính mà bấm lại
  // tab Ghi chú thì làm mới danh sách (ghi chú + tag).
  const goNav = (target: NavView) => {
    if (target === "list") {
      if (viewRef.current.name === "list") {
        setHomeReset((c) => c + 1);
        void reload(query);
        return;
      }
      exitSelectMode();
      setView({ name: "list" });
    } else if (target === "trash") {
      openTrash();
    } else {
      openBackup();
    }
  };

  const newNote = async () => {
    try {
      exitSelectMode();
      const created = await createNote({ title: "", content: "", colour: "white", pinned: false });
      setNotes((prev) => [created, ...prev]);
      setView({ name: "editor", note: created });
    } catch (e) {
      fail(e);
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
      fail(e);
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
      fail(e);
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
        fail(e);
        return;
      }
    }
    await reloadTags();
  };

  // Cho một hoặc nhiều note vào thùng rác; về danh sách sau khi xong.
  // Trả về số note đã xóa được (đường editor đã tự toast nên hàm này
  // không toast; đường danh sách toast ở trashWithEffect).
  const trashNotes = async (picked: Note[]): Promise<number> => {
    let done = 0;
    for (const note of picked) {
      try {
        await trashNote(note.id);
        setNotes((prev) => prev.filter((n) => n.id !== note.id));
        done += 1;
      } catch (e) {
        fail(e);
        return done;
      }
    }
    await reloadTags();
    exitSelectMode();
    setView({ name: "list" });
    return done;
  };

  // Cho vào thùng rác kèm hiệu ứng mờ + co lại: đánh dấu note đang xóa,
  // chờ ~350ms cho hiệu ứng chạy xong rồi mới xóa thật, xong thì toast
  // báo số note đã xóa.
  const trashWithEffect = (picked: Note[]) => {
    if (picked.length === 0) return;
    setDeletingIds(new Set(picked.map((n) => n.id)));
    window.setTimeout(() => {
      void trashNotes(picked).then((done) => {
        if (done > 0) toast(`Đã cho ${done} ghi chú vào thùng rác.`);
        setDeletingIds((prev) => {
          if (prev.size === 0) return prev;
          const next = new Set(prev);
          picked.forEach((n) => next.delete(n.id));
          return next;
        });
      });
    }, 350);
  };

  // Kéo xếp lại thứ tự note trong một nhóm: ghi thứ tự mới xuống DB rồi
  // tải lại tag (noteIds mới) để danh sách hiện đúng thứ tự.
  const reorder = async (tagId: number, orderedIds: number[]) => {
    try {
      await reorderNotes(tagId, orderedIds);
      await reloadTags();
    } catch (e) {
      fail(e);
    }
  };

  // Nhắc hẹn trong app (v18): poller kiểm mỗi 60 giây + khi danh sách đổi,
  // mở bảng nhắc cho note tới giờ; note từ thông báo native thì mở thẳng.
  useEffect(() => {
    if (!isTauri()) return;
    const stop = startReminderPoll({
      onDue: (items) =>
        setDue((prev) => [
          ...prev,
          ...items.filter((d) => !prev.some((p) => p.note.id === d.note.id)),
        ]),
      onOpenNote: (note) => openNote(note),
    });
    return stop;
  }, []);

  useEffect(() => {
    void checkRemindersNow();
  }, [notes]);

  // Chưa cấp quyền thông báo (Android 13+): nhắc hẹn chỉ hiện khi app mở.
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    listen("notify-permission-needed", () => {
      toast("Để nhận nhắc hẹn cả khi app đóng, hãy cho phép gửi thông báo");
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => undefined);
    return () => unlisten?.();
  }, []);

  // Mở note từ bảng nhắc: lấy bản mới nhất trong danh sách (nhắc hẹn đã bị
  // gỡ sau khi hiện bảng nên bản trong bảng nhắc là bản cũ).
  const openDue = (item: DueReminder) => {
    setDue((prev) => prev.filter((d) => d.note.id !== item.note.id));
    exitSelectMode();
    setView({ name: "editor", note: notes.find((n) => n.id === item.note.id) ?? item.note });
  };

  return (
    <>
      <ToastHost />
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
          onOpenTrash={() => goNav("trash")}
          onAssignTags={(ns, t) => void assignTags(ns, t)}
          onTrashNotes={(ns) => trashWithEffect(ns)}
          onReorder={(id, ids) => void reorder(id, ids)}
          onTagsChanged={() => void reload(query)}
          onRefresh={() => reload(query)}
          homeReset={homeReset}
          onVisibleChange={handleVisibleChange}
          onToggleSelectMany={toggleSelectMany}
          deletingIds={deletingIds}
          selectMode={selectMode}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onEnterSelectMode={() => setSelectMode(true)}
          allSelected={allSelected}
          onToggleSelectAll={toggleSelectAll}
        />
      ) : view.name === "trash" ? (
        <TrashPage
          onClose={() => setView({ name: "list" })}
          onChanged={() => void reload(query)}
        />
      ) : view.name === "backup" ? (
        <BackupPage onChanged={() => void reload(query)} />
      ) : (
        <EditorPage
          note={view.note}
          onClose={() => setView({ name: "list" })}
          onSaved={onSaved}
          onTagsChanged={() => void reloadTags()}
          onTrash={(n) => void trashNotes([n])}
        />
      )}
      {view.name === "list" || view.name === "backup" ? (
        <BottomNav
          view={view.name}
          onSelect={goNav}
          onNew={() => void newNote()}
          selectMode={selectMode}
          allSelected={allSelected}
          onToggleSelectAll={toggleSelectAll}
          onCancelSelect={exitSelectMode}
          onTrashSelected={() =>
            trashWithEffect(notes.filter((n) => selectedIds.has(n.id)))
          }
        />
      ) : null}
      {due.length > 0 ? (
        <ReminderDialog items={due} onOpen={openDue} onClose={() => setDue([])} />
      ) : null}
    </>
  );
}
