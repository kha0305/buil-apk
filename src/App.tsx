import { useCallback, useEffect, useRef, useState } from "react";
import { exit, onBackButtonPress } from "@tauri-apps/api/app";
import type { Note } from "./lib/types";
import { createNote, isTauri, listNotes, searchNotes, togglePin } from "./services/notesApi";
import ListPage from "./pages/ListPage";
import EditorPage from "./pages/EditorPage";
import "./styles.css";

type View = { name: "list" } | { name: "editor"; note: Note };

export default function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>({ name: "list" });
  const [error, setError] = useState("");
  const viewRef = useRef(view);
  viewRef.current = view;

  const reload = useCallback(async (q: string) => {
    try {
      setNotes(q.trim() ? await searchNotes(q) : await listNotes());
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

  return (
    <>
      {error ? <p className="error">{error}</p> : null}
      {view.name === "list" ? (
        <ListPage
          notes={notes}
          query={query}
          onQuery={(q) => {
            setQuery(q);
            void reload(q);
          }}
          onOpen={openNote}
          onTogglePin={(n) => void flipPin(n)}
          onNew={() => void newNote()}
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
