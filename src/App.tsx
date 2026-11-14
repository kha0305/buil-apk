import { useCallback, useEffect, useRef, useState } from "react";
import { exit, onBackButtonPress } from "@tauri-apps/api/app";
import type { Note, Tag } from "./lib/types";
import {
  createNote,
  isTauri,
  listNotes,
  listTags,
  searchNotes,
  setNoteTags,
  togglePin,
} from "./services/notesApi";
import ListPage from "./pages/ListPage";
import EditorPage from "./pages/EditorPage";
import "./styles.css";

type View = { name: "list" } | { name: "editor"; note: Note };

export default function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>({ name: "list" });
  const [error, setError] = useState("");
  const viewRef = useRef(view);
  viewRef.current = view;

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
      if (viewRef.current.name === "editor") {
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

  const newNote = async () => {
    try {
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

  // Kéo note vào nhóm tag: tag là tên nhóm, null là nhóm Chưa gắn tag (gỡ hết).
  const assignTag = async (note: Note, tag: string | null) => {
    try {
      const next = tag === null ? [] : Array.from(new Set([...note.tags, tag]));
      if (tag !== null && next.length === note.tags.length) return;
      const saved = await setNoteTags(note.id, next);
      onSaved(saved);
      setTags(await listTags());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
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
          onAssignTag={(n, t) => void assignTag(n, t)}
        />
      ) : (
        <EditorPage
          note={view.note}
          onClose={() => setView({ name: "list" })}
          onSaved={onSaved}
        />
      )}
    </>
  );
}
