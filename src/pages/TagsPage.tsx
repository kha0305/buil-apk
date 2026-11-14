import { useEffect, useState } from "react";
import type { Tag } from "../lib/types";
import { deleteTag, listTags, renameTag } from "../services/notesApi";

type Props = {
  onClose: () => void;
  onChanged: () => void;
};

export default function TagsPage({ onClose, onChanged }: Props) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState("");

  const reload = () => {
    listTags()
      .then(setTags)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  useEffect(reload, []);

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  const startRename = (tag: Tag) => {
    setEditingId(tag.id);
    setEditName(tag.name);
    setError("");
  };

  const saveRename = async (tag: Tag) => {
    if (!editName.trim()) {
      setError("Tên tag không được để trống.");
      return;
    }
    try {
      await renameTag(tag.id, editName);
      setEditingId(null);
      reload();
      onChanged();
    } catch (e) {
      fail(e);
    }
  };

  const remove = async (tag: Tag) => {
    const notePart =
      tag.count === 0
        ? "Tag này chưa gắn ghi chú nào."
        : `Tag sẽ bị gỡ khỏi ${tag.count} ghi chú (ghi chú vẫn còn).`;
    if (!window.confirm(`Xóa tag "${tag.name}"? ${notePart}`)) return;
    try {
      await deleteTag(tag.id);
      reload();
      onChanged();
    } catch (e) {
      fail(e);
    }
  };

  return (
    <main className="page">
      <header className="toolbar">
        <button onClick={onClose} aria-label="Quay lại danh sách">
          Quay lại
        </button>
        <h1>Quản lý tag</h1>
      </header>
      {error ? <p className="error">{error}</p> : null}
      {tags.length === 0 ? (
        <p className="empty">Chưa có tag nào.</p>
      ) : (
        <div className="tag-list">
          {tags.map((t) => (
            <article key={t.id} className="tag-item">
              {editingId === t.id ? (
                <>
                  <input
                    className="tag-rename-input"
                    value={editName}
                    onChange={(e) => setEditName(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing) void saveRename(t);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    autoFocus
                  />
                  <div className="tag-actions">
                    <button onClick={() => void saveRename(t)}>Lưu</button>
                    <button onClick={() => setEditingId(null)}>Hủy</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="tag-text">
                    <h2>{t.name}</h2>
                    <p className="tag-meta">
                      {t.count === 0 ? "Chưa gắn ghi chú nào" : `${t.count} ghi chú`}
                    </p>
                  </div>
                  <div className="tag-actions">
                    <button onClick={() => startRename(t)}>Đổi tên</button>
                    <button className="danger" onClick={() => void remove(t)}>
                      Xóa
                    </button>
                  </div>
                </>
              )}
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
