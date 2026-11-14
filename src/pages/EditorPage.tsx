import { useEffect, useRef, useState } from "react";
import { COLOURS, type NewNote, type Note } from "../lib/types";
import { deleteNote, setNoteTags, togglePin, updateNote } from "../services/notesApi";

type Props = {
  note: Note;
  onClose: () => void;
  onSaved: (note: Note) => void;
};

// Ô nhập dùng <textarea> uncontrolled + guard composition: đang gõ Telex/VNI
// thì không autosave, không ghi đè value, chỉ lưu sau khi composition kết thúc.
export default function EditorPage({ note, onClose, onSaved }: Props) {
  const titleRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const composingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [colour, setColour] = useState(note.colour);
  const [tags, setTags] = useState<string[]>(note.tags);
  const [tagInput, setTagInput] = useState("");
  const [tagError, setTagError] = useState("");

  // Mở note khác thì đồng bộ lại tag (cùng editor, khác id).
  useEffect(() => {
    setTags(note.tags);
  }, [note.id]);

  // Rời editor thì hủy lịch lưu đang chờ: ref đã tháo, lưu lúc này sẽ ghi đè
  // tiêu đề/nội dung bằng chuỗi rỗng. Đánh đổi: mất tối đa 800ms gõ cuối.
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const save = async (override?: Partial<NewNote>) => {
    const input: NewNote = {
      title: titleRef.current?.value ?? "",
      content: contentRef.current?.value ?? "",
      colour,
      pinned: note.pinned,
      ...override,
    };
    const saved = await updateNote(note.id, input);
    onSaved(saved);
  };

  const scheduleSave = () => {
    if (composingRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void save();
    }, 800);
  };

  const pickColour = (c: string) => {
    setColour(c);
    void save({ colour: c });
  };

  const flipPin = async () => {
    const saved = await togglePin(note.id);
    onSaved(saved);
  };

  // Tag lưu ngay khi thêm/gỡ (lấy kết quả từ Rust làm chuẩn, không đoán).
  // Lưu lỗi thì báo chữ và giữ nguyên chữ đã gõ (không xóa ô nhập trước khi
  // lưu xong như bản cũ — lỗi là mất luôn tag vừa gõ mà không ai biết).
  const saveTags = async (next: string[]) => {
    try {
      const saved = await setNoteTags(note.id, next);
      setTags(saved.tags);
      setTagError("");
      onSaved(saved);
      return true;
    } catch (e) {
      setTagError(e instanceof Error ? e.message : String(e));
      return false;
    }
  };

  const addTag = async () => {
    const name = tagInput.trim();
    if (!name || tags.some((t) => t.toLowerCase() === name.toLowerCase())) {
      setTagInput("");
      return;
    }
    if (await saveTags([...tags, name])) setTagInput("");
  };

  const removeTag = (name: string) => {
    void saveTags(tags.filter((t) => t !== name));
  };

  const remove = async () => {
    if (!window.confirm("Xóa ghi chú này?")) return;
    await deleteNote(note.id);
    onClose();
  };

  return (
    <main className="page editor-page">
      <header className="toolbar">
        <button onClick={onClose} aria-label="Quay lại danh sách">
          Quay lại
        </button>
        <button onClick={() => void flipPin()}>{note.pinned ? "Bỏ ghim" : "Ghim"}</button>
        <button className="danger" onClick={() => void remove()}>
          Xóa
        </button>
      </header>
      <div className="colours">
        {COLOURS.map((c) => (
          <button
            key={c}
            className={`colour-dot colour-${c}${colour === c ? " selected" : ""}`}
            aria-label={`Màu ${c}`}
            onClick={() => pickColour(c)}
          />
        ))}
      </div>
      <input
        ref={titleRef}
        className="title-input"
        type="text"
        placeholder="Tiêu đề"
        defaultValue={note.title}
        onChange={scheduleSave}
      />
      <div className="tag-editor">
        <div className="tag-chips">
          {tags.map((t) => (
            <span key={t} className="tag-chip">
              {t}
              <button type="button" aria-label={`Gỡ tag ${t}`} onClick={() => removeTag(t)}>
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="tag-input-row">
          <input
            className="tag-input"
            type="text"
            placeholder="Thêm tag..."
            value={tagInput}
            onChange={(e) => setTagInput(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void addTag();
              }
            }}
          />
          <button type="button" className="tag-add" onClick={() => void addTag()}>
            Thêm
          </button>
        </div>
        {tagError ? <p className="error tag-error">{tagError}</p> : null}
      </div>
      <textarea
        ref={contentRef}
        className="content-input"
        placeholder="Viết ghi chú..."
        defaultValue={note.content}
        onChange={scheduleSave}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={() => {
          composingRef.current = false;
          scheduleSave();
        }}
      />
      <p className="autosave-hint">Tự lưu sau khi bạn ngừng gõ.</p>
    </main>
  );
}
