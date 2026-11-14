// Editor v18: một giao diện cho cả tạo mới và sửa.
// Chế độ chỉ khác nội dung ban đầu: note mới thì tiêu đề/nội dung trống,
// màu trắng, không tag, không nhắc hẹn, không ghim.
// App.tsx đã tạo sẵn dòng note trong DB trước khi mở editor, nên "bỏ bản
// nháp trống" ở đây phải xóa luôn dòng đó thì danh sách mới không còn note
// trống (xem discardDraft).
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  COLOURS,
  COLOUR_HEX,
  TAG_COLOURS,
  TAG_COLOUR_HEX,
  type NewNote,
  type Note,
  type Tag,
  type TagColourId,
} from "../lib/types";
import { fromLocalInput, toLocalInput } from "../lib/dates";
import { toast } from "../lib/toast";
import {
  cancelNativeReminder,
  scheduleNativeReminder,
} from "../lib/reminderNotify";
import {
  deleteNoteForever,
  isNotFoundError,
  listTags,
  renameTag,
  setNoteTags,
  setReminder,
  togglePin,
  updateNote,
} from "../services/notesApi";
import BottomSheet from "../components/BottomSheet";
import ConfirmDialog from "../components/ConfirmDialog";
import TagIcon, { TAG_ICON_IDS } from "../components/TagIcon";

type Props = {
  note: Note;
  onClose: () => void;
  onSaved: (note: Note) => void;
  // Bản nháp bị bỏ (hoặc note đã mất khỏi DB): App gỡ note khỏi danh sách.
  onDiscarded?: (id: number) => void;
  onTagsChanged: () => void;
  onTrash: (note: Note) => void;
};

// Bảng màu và màu tag lấy từ lib/types (nhóm Home sở hữu, đã chốt v18):
// COLOURS 15 màu cầu vồng + COLOUR_HEX, TAG_COLOURS kem đứng đầu +
// TAG_COLOUR_HEX. Note lưu màu bằng TÊN (vd "white"), thẻ nội dung và chip
// tag tô bằng mã hex tra từ bảng. Tag lưu màu bằng tên trong TAG_COLOURS.
const DEFAULT_TAG_ICON = "tag";
const CREAM: TagColourId = "cream";

// Mã hex của màu tag (tên -> hex), có fallback kem khi backend cũ chưa trả màu.
const tagHex = (colour: string): string =>
  (TAG_COLOUR_HEX as Record<string, string>)[colour] ?? TAG_COLOUR_HEX.cream;

type SheetKind = "colour" | "tag" | "reminder" | null;
type ConfirmKind = "discard" | "trash" | null;
type QuickKind = "15m" | "1h" | "tonight" | "tomorrow" | null;

const RED = "#b3261e";
const RED_PILL = "#fbe3e0";
const INK = "#2b2620";
const MUTED = "#6b6156";

const isPristine = (n: Note): boolean =>
  n.title === "" &&
  n.content === "" &&
  n.colour === "white" &&
  n.tags.length === 0 &&
  n.remindAt == null &&
  !n.pinned;

const countWords = (text: string): number =>
  text.trim() === "" ? 0 : text.trim().split(/\s+/).length;

const pad = (n: number): string => String(n).padStart(2, "0");

const fmtMetaTime = (ms: number): string => {
  const d = new Date(ms);
  const now = new Date();
  const today =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  return today
    ? `${pad(d.getHours())}:${pad(d.getMinutes())}`
    : `${d.getDate()}/${d.getMonth() + 1} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const fmtRemind = (ms: number): string =>
  `Nhắc lúc ${pad(new Date(ms).getHours())}:${pad(new Date(ms).getMinutes())} ngày ${new Date(ms).getDate()}/${new Date(ms).getMonth() + 1}`;

// Giờ hẹn nhanh, tính theo giờ địa phương (không dùng toISOString).
const quickTime = (kind: Exclude<QuickKind, null>): string => {
  const now = new Date();
  if (kind === "15m") return toLocalInput(now.getTime() + 15 * 60_000);
  if (kind === "1h") return toLocalInput(now.getTime() + 60 * 60_000);
  if (kind === "tonight") {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 20, 0);
    // Đã quá 20:00 thì hẹn 20:00 ngày mai (không hẹn vào quá khứ — nhắc
    // trong quá khứ sẽ nổ ngay khi đặt).
    if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
    return toLocalInput(d.getTime());
  }
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 8, 0);
  return toLocalInput(d.getTime());
};

// Đổi tên/icon/màu tag qua notesApi.renameTag(id, name, icon, colour)
// (Backend đã nâng lệnh rename_tag lên 4 tham số).
export default function EditorPage({ note, onClose, onSaved, onDiscarded, onTagsChanged, onTrash }: Props) {
  const titleRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const composingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leavingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const colourRef = useRef(note.colour);
  // Chế độ tạo/sửa chốt lúc mở editor (sau khi gõ thì bản nháp không còn
  // trống nhưng vẫn đang ở chế độ tạo cho tới khi bấm Tạo).
  const [isNew] = useState(() => isPristine(note));
  const [colour, setColourState] = useState(note.colour);
  const [tags, setTags] = useState<string[]>(note.tags);
  const [tagMeta, setTagMeta] = useState<Tag[]>([]);
  const [wordCount, setWordCount] = useState(() => countWords(note.content));
  const [justSaved, setJustSaved] = useState(false);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [confirm, setConfirm] = useState<ConfirmKind>(null);
  const [leaving, setLeaving] = useState(false);
  // Sheet tag: tag đang sửa (null = đang thêm mới).
  const [tagInput, setTagInput] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editIcon, setEditIcon] = useState(DEFAULT_TAG_ICON);
  const [editColour, setEditColour] = useState<TagColourId>(CREAM);
  // Sheet nhắc hẹn.
  const [remindInput, setRemindInput] = useState(
    note.remindAt != null ? toLocalInput(note.remindAt) : "",
  );
  const [quick, setQuick] = useState<QuickKind>(null);

  const setColour = (c: string) => {
    colourRef.current = c;
    setColourState(c);
  };

  const reloadTagMeta = async () => {
    try {
      setTagMeta(await listTags());
    } catch {
      // Lấy meta tag lỗi thì chip vẫn hiện bằng tên + màu/icon mặc định.
    }
  };

  useEffect(() => {
    void reloadTagMeta();
  }, []);

  // Mở note khác thì đồng bộ lại tag và giờ hẹn (cùng editor, khác id).
  useEffect(() => {
    setTags(note.tags);
    setRemindInput(note.remindAt != null ? toLocalInput(note.remindAt) : "");
  }, [note.id, note.remindAt]);

  // Rời editor thì hủy lịch lưu và lịch chuyển màn đang chờ.
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (leavingTimerRef.current) clearTimeout(leavingTimerRef.current);
    },
    [],
  );

  const readDraft = () => ({
    title: titleRef.current?.value ?? "",
    content: contentRef.current?.value ?? "",
  });

  // Ô nội dung tự giãn theo nội dung gõ (không cuộn trong ô).
  const autoResizeContent = () => {
    const el = contentRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  // Mở editor / đổi note: cho ô nội dung giãn đúng theo nội dung sẵn có.
  useEffect(() => {
    autoResizeContent();
  }, [note.id]);

  const draftEmpty = (): boolean => {
    const d = readDraft();
    return (
      d.title.trim() === "" &&
      d.content.trim() === "" &&
      tags.length === 0 &&
      note.remindAt == null &&
      remindInput.trim() === ""
    );
  };

  const save = async (override?: Partial<NewNote>): Promise<Note | null> => {
    const d = readDraft();
    try {
      const saved = await updateNote(note.id, {
        title: d.title,
        content: d.content,
        colour: colourRef.current,
        pinned: note.pinned,
        ...override,
      });
      onSaved(saved);
      setJustSaved(true);
      return saved;
    } catch (e) {
      if (!handleGhost(e)) toast(e instanceof Error ? e.message : String(e), "error");
      return null;
    }
  };

  // Ô nhập dùng <textarea> uncontrolled + guard composition: đang gõ Telex/VNI
  // thì không autosave, không ghi đè value, chỉ lưu sau khi composition kết thúc.
  const scheduleSave = () => {
    if (composingRef.current) return;
    setJustSaved(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void save();
    }, 800);
  };

  const flushSave = async (): Promise<Note | null> => {
    if (timerRef.current) clearTimeout(timerRef.current);
    return save();
  };

  // Xóa hẳn dòng note đã tạo sẵn cho bản nháp (kèm nhắc hẹn native nếu có).
  // Chỉ dùng cho bản nháp bị bỏ, không dùng cho note đã lưu thật.
  // Trả về true khi dòng đã mất khỏi DB — khi đó phải báo App gỡ note
  // khỏi danh sách, nếu không note còn hiện ở trang chính dù DB đã mất
  // (note ma: mọi thao tác sau đó đều báo đỏ "Note not found"). Lỗi xóa
  // khác thì trả false để note ở lại danh sách (dòng có thể vẫn còn).
  const discardDraft = async (): Promise<boolean> => {
    try {
      await cancelNativeReminder(note.id);
    } catch {
      // Hủy nhắc lỗi thì vẫn xóa note.
    }
    try {
      await deleteNoteForever(note.id);
      onDiscarded?.(note.id);
      return true;
    } catch (e) {
      if (isNotFoundError(e)) {
        // Dòng đã mất khỏi DB từ trước — cũng gỡ khỏi danh sách.
        onDiscarded?.(note.id);
        return true;
      }
      return false;
    }
  };

  // Lỗi "Note not found" khi đang sửa một note ma: note đã mất khỏi DB,
  // báo đỏ rồi gỡ khỏi danh sách và đóng editor (không để sửa một note
  // không tồn tại). Trả về true nếu đã xử lý trường hợp này.
  const handleGhost = (e: unknown): boolean => {
    if (!isNotFoundError(e)) return false;
    toast("Note not found", "error");
    onDiscarded?.(note.id);
    onClose();
    return true;
  };

  // Nút Tạo/Lưu ở đầu trang. Tạo trên bản nháp trống thì báo đỏ và ở lại,
  // không tạo thêm note nào; Lưu thì lưu ngay (không chờ debounce) rồi về.
  const handlePrimary = async () => {
    const d = readDraft();
    if (isNew && d.title.trim() === "" && d.content.trim() === "") {
      toast("Chưa nhập nội dung.", "error");
      return;
    }
    const saved = await flushSave();
    if (!saved) return;
    toast(isNew ? "Đã tạo ghi chú." : "Đã lưu.");
    onClose();
  };

  const handleBack = async () => {
    if (isNew && draftEmpty()) await discardDraft();
    onClose();
  };

  // Mục Bỏ (chế độ tạo): nháp trống thì về im lặng, có nội dung thì hỏi.
  const handleDiscard = async () => {
    if (draftEmpty()) {
      await discardDraft();
      onClose();
      return;
    }
    setConfirm("discard");
  };

  const confirmDiscard = async () => {
    setConfirm(null);
    await discardDraft();
    onClose();
  };

  // Mục Thùng rác (chế độ sửa): xác nhận rồi hai thẻ mờ + co lại, báo
  // toast, hủy nhắc native, rồi mới về danh sách.
  const confirmTrash = () => {
    setConfirm(null);
    setLeaving(true);
    void cancelNativeReminder(note.id);
    toast("Đã cho ghi chú vào thùng rác.");
    leavingTimerRef.current = setTimeout(() => onTrash(note), 280);
  };

  const pickColour = (c: string) => {
    setColour(c);
    setSheet(null);
    void save({ colour: c });
  };

  const flipPin = async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    try {
      onSaved(await togglePin(note.id));
    } catch (e) {
      if (!handleGhost(e)) toast(e instanceof Error ? e.message : String(e), "error");
    }
  };

  // --- Sheet tag ---

  const tagMetaFor = (name: string): Tag | undefined =>
    tagMeta.find((t) => t.name.toLowerCase() === name.toLowerCase());

  const resetTagForm = () => {
    setTagInput("");
    setEditingId(null);
    setEditIcon(DEFAULT_TAG_ICON);
    setEditColour(CREAM);
  };

  const startEditTag = (name: string) => {
    const meta = tagMetaFor(name);
    setTagInput(name);
    setEditingId(meta?.id ?? null);
    setEditIcon(meta?.icon || DEFAULT_TAG_ICON);
    setEditColour((meta?.colour as TagColourId) || CREAM);
  };

  const saveTags = async (next: string[]): Promise<Note | null> => {
    try {
      const saved = await setNoteTags(note.id, next);
      setTags(saved.tags);
      onSaved(saved);
      onTagsChanged();
      return saved;
    } catch (e) {
      if (!handleGhost(e)) toast(e instanceof Error ? e.message : String(e), "error");
      return null;
    }
  };

  // Thêm tag mới (gắn vào note rồi đặt icon/màu đã chọn) hoặc Lưu tag đang sửa.
  // Sheet vẫn mở để sửa tiếp nhiều tag. Trùng tên tag khác -> báo đỏ, ở lại.
  const submitTag = async () => {
    const name = tagInput.trim();
    if (!name) {
      toast("Gõ tên tag trước đã.", "error");
      return;
    }
    if (tagMeta.some((t) => t.id !== editingId && t.name.toLowerCase() === name.toLowerCase())) {
      toast("Tên tag này đã có rồi.", "error");
      return;
    }
    try {
      if (editingId != null) {
        const old = tagMeta.find((t) => t.id === editingId);
        await renameTag(editingId, name, editIcon, editColour);
        if (old && old.name.toLowerCase() !== name.toLowerCase()) {
          await saveTags(tags.map((t) => (t.toLowerCase() === old.name.toLowerCase() ? name : t)));
        }
        await reloadTagMeta();
        onTagsChanged();
        resetTagForm();
        return;
      }
      const saved = await saveTags([...tags, name]);
      if (!saved) return;
      const created = (await listTags()).find(
        (t) => t.name.toLowerCase() === name.toLowerCase(),
      );
      if (created) await renameTag(created.id, name, editIcon, editColour);
      await reloadTagMeta();
      onTagsChanged();
      resetTagForm();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    }
  };

  const removeTag = async (name: string) => {
    const meta = tagMetaFor(name);
    if (editingId != null && meta && meta.id === editingId) resetTagForm();
    await saveTags(tags.filter((t) => t !== name));
  };

  // --- Sheet nhắc hẹn ---

  const pickQuick = (kind: Exclude<QuickKind, null>) => {
    setQuick(kind);
    setRemindInput(quickTime(kind));
  };

  const saveReminder = async () => {
    if (!remindInput) {
      toast("Chưa chọn thời gian.", "error");
      return;
    }
    const ms = fromLocalInput(remindInput);
    if (ms == null) {
      toast("Ngày giờ nhắc hẹn không đúng dạng.", "error");
      return;
    }
    try {
      const saved = await setReminder(note.id, ms);
      onSaved(saved);
      const d = readDraft();
      await scheduleNativeReminder(note.id, d.title, d.content, ms);
      toast("Đã đặt nhắc hẹn.");
    } catch (e) {
      if (!handleGhost(e)) toast(e instanceof Error ? e.message : String(e), "error");
    }
  };

  const clearReminder = async () => {
    try {
      const saved = await setReminder(note.id, null);
      onSaved(saved);
      setRemindInput("");
      setQuick(null);
      await cancelNativeReminder(note.id);
      toast("Đã gỡ nhắc hẹn.");
    } catch (e) {
      if (!handleGhost(e)) toast(e instanceof Error ? e.message : String(e), "error");
    }
  };

  const contentBg = (COLOUR_HEX as Record<string, string>)[colour] ?? COLOUR_HEX.white;
  const quickChips: { key: Exclude<QuickKind, null>; label: string }[] = [
    { key: "15m", label: "15 phút nữa" },
    { key: "1h", label: "1 giờ nữa" },
    { key: "tonight", label: "Tối nay 20:00" },
    { key: "tomorrow", label: "Sáng mai 8:00" },
  ];

  return (
    <main style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", background: "#f7f1e5", padding: "calc(env(safe-area-inset-top, 0px) + 12px) calc(env(safe-area-inset-right, 0px) + 16px) 118px calc(env(safe-area-inset-left, 0px) + 16px)", color: INK }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <button
          type="button"
          onClick={() => void handleBack()}
          aria-label="Quay lại danh sách"
          style={{
            border: "none",
            background: "transparent",
            color: INK,
            fontSize: 18,
            minHeight: 44,
            padding: "10px 8px",
            cursor: "pointer",
          }}
        >
          ‹ Quay lại
        </button>
        <button
          type="button"
          onClick={() => void handlePrimary()}
          style={{
            border: "none",
            background: RED,
            color: "#fffdf7",
            fontWeight: 700,
            fontSize: 15,
            borderRadius: 999,
            padding: "9px 20px",
            cursor: "pointer",
          }}
        >
          {isNew ? "Tạo" : "Lưu"}
        </button>
      </header>

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          opacity: leaving ? 0 : 1,
          transform: leaving ? "scale(0.96)" : "scale(1)",
          transition: "opacity 220ms ease, transform 220ms ease",
        }}
      >
        <div
          style={{
            background: "#fffdf7",
            borderRadius: 22,
            boxShadow: "0 2px 10px rgba(43, 38, 32, 0.12)",
            padding: "12px 16px",
          }}
        >
          <input
            ref={titleRef}
            type="text"
            placeholder="Tiêu đề"
            defaultValue={note.title}
            aria-label="Tiêu đề"
            onChange={() => scheduleSave()}
            onCompositionStart={() => {
              composingRef.current = true;
            }}
            onCompositionEnd={() => {
              composingRef.current = false;
              scheduleSave();
            }}
            style={{
              width: "100%",
              border: "none",
              outline: "none",
              background: "transparent",
              color: INK,
              fontSize: 20,
              fontWeight: 700,
              padding: 0,
            }}
          />
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            background: contentBg,
            borderRadius: 22,
            boxShadow: "0 2px 10px rgba(43, 38, 32, 0.12)",
            padding: "12px 16px",
            marginTop: 12,
          }}
        >
          <textarea
            ref={contentRef}
            placeholder="Viết ghi chú..."
            defaultValue={note.content}
            aria-label="Nội dung"
            onChange={(e) => {
              setWordCount(countWords(e.currentTarget.value));
              autoResizeContent();
              scheduleSave();
            }}
            onCompositionStart={() => {
              composingRef.current = true;
            }}
            onCompositionEnd={() => {
              composingRef.current = false;
              scheduleSave();
            }}
            style={{
              width: "100%",
              flex: 1,
              minHeight: 140,
              border: "none",
              outline: "none",
              resize: "none",
              overflow: "hidden",
              background: "transparent",
              color: INK,
              fontSize: 16,
              lineHeight: 1.7,
              padding: 0,
            }}
          />
        </div>
      </div>

      <p style={{ color: MUTED, fontSize: 13, margin: "10px 4px 0", lineHeight: 1.5 }}>
        {justSaved ? "Đã lưu" : `Đã sửa ${fmtMetaTime(note.updatedAt)}`}
      </p>
      <p style={{ color: MUTED, fontSize: 13, margin: "2px 4px 0" }}>
        {wordCount} từ
      </p>

      <nav
        aria-label="Tùy chọn ghi chú"
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 40,
          display: "flex",
          background: "rgba(247, 241, 229, 0.94)",
          boxShadow: "0 -2px 12px rgba(43, 38, 32, 0.12)",
          padding: "8px 4px calc(8px + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <MenuItem
          label="Màu"
          active={sheet === "colour"}
          onClick={() => setSheet(sheet === "colour" ? null : "colour")}
        >
          <PaletteIcon />
        </MenuItem>
        <MenuItem
          label="Tag"
          active={sheet === "tag"}
          onClick={() => {
            void reloadTagMeta();
            setSheet(sheet === "tag" ? null : "tag");
          }}
        >
          <TagIcon id="tag" size={22} />
        </MenuItem>
        <MenuItem
          label="Nhắc hẹn"
          active={sheet === "reminder"}
          onClick={() => setSheet(sheet === "reminder" ? null : "reminder")}
        >
          <TagIcon id="bell" size={22} />
        </MenuItem>
        <MenuItem
          label="Ghim"
          active={note.pinned}
          pinned={note.pinned}
          onClick={() => void flipPin()}
        >
          <PinIcon filled={note.pinned} />
        </MenuItem>
        {isNew ? (
          <MenuItem label="Bỏ" onClick={() => void handleDiscard()}>
            <CrossIcon />
          </MenuItem>
        ) : (
          <MenuItem label="Thùng rác" onClick={() => setConfirm("trash")}>
            <TrashIcon />
          </MenuItem>
        )}
      </nav>

      <BottomSheet open={sheet === "colour"} title="Màu" onClose={() => setSheet(null)}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {COLOURS.map((name) => (
            <button
              key={name}
              type="button"
              aria-label={`Màu ${name}`}
              onClick={() => pickColour(name)}
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                border:
                  colour === name ? `3px solid ${RED}` : "1px solid rgba(43, 38, 32, 0.25)",
                background: COLOUR_HEX[name],
                padding: 0,
                cursor: "pointer",
              }}
            />
          ))}
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === "tag"} title="Tag" onClose={() => setSheet(null)}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {tags.map((t) => {
            const meta = tagMetaFor(t);
            return (
              <span
                key={t}
                onClick={() => startEditTag(t)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: meta ? tagHex(meta.colour) : TAG_COLOUR_HEX.cream,
                  color: INK,
                  borderRadius: 999,
                  padding: "6px 6px 6px 10px",
                  fontSize: 14,
                  cursor: "pointer",
                  border:
                    editingId != null && meta?.id === editingId
                      ? `2px solid ${RED}`
                      : "2px solid transparent",
                }}
              >
                <TagIcon id={meta?.icon ?? DEFAULT_TAG_ICON} size={14} />
                {t}
                <button
                  type="button"
                  aria-label={`Gỡ tag ${t}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    void removeTag(t);
                  }}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: INK,
                    fontSize: 15,
                    lineHeight: 1,
                    padding: "2px 4px",
                    cursor: "pointer",
                  }}
                >
                  ×
                </button>
              </span>
            );
          })}
          {tags.length === 0 ? (
            <span style={{ color: MUTED, fontSize: 14 }}>Chưa gắn tag nào.</span>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input
            type="text"
            placeholder="Thêm tag..."
            value={tagInput}
            aria-label="Tên tag"
            onChange={(e) => setTagInput(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void submitTag();
              }
            }}
            style={{
              flex: 1,
              minWidth: 0,
              border: "1px solid #e6dcc8",
              borderRadius: 12,
              background: "#fffdf7",
              color: INK,
              fontSize: 15,
              padding: "10px 12px",
              outline: "none",
            }}
          />
          <button
            type="button"
            onClick={() => void submitTag()}
            style={{
              border: "none",
              background: RED,
              color: "#fffdf7",
              fontWeight: 700,
              borderRadius: 999,
              padding: "10px 18px",
              cursor: "pointer",
            }}
          >
            {editingId != null ? "Lưu" : "Thêm"}
          </button>
        </div>
        <p style={{ margin: "0 0 8px", fontWeight: 700, fontSize: 14 }}>Icon</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          {TAG_ICON_IDS.map((id) => (
            <button
              key={id}
              type="button"
              aria-label={id === "none" ? "Không dùng icon" : `Icon ${id}`}
              onClick={() => setEditIcon(id)}
              style={{
                width: 38,
                height: 38,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 10,
                border: editIcon === id ? `2px solid ${RED}` : "1px solid #e6dcc8",
                background: editIcon === id ? RED_PILL : "#fffdf7",
                color: INK,
                padding: 0,
                cursor: "pointer",
              }}
            >
              {id === "none" ? <NoneIcon /> : <TagIcon id={id} size={20} />}
            </button>
          ))}
        </div>
        <p style={{ margin: "0 0 8px", fontWeight: 700, fontSize: 14 }}>Màu</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {TAG_COLOURS.map((id) => (
            <button
              key={id}
              type="button"
              aria-label={`Màu tag ${id}`}
              onClick={() => setEditColour(id)}
              style={{
                width: 30,
                height: 30,
                borderRadius: "50%",
                border: editColour === id ? `3px solid ${RED}` : "1px solid rgba(43, 38, 32, 0.25)",
                background: TAG_COLOUR_HEX[id],
                padding: 0,
                cursor: "pointer",
              }}
            />
          ))}
        </div>
      </BottomSheet>

      <BottomSheet
        open={sheet === "reminder"}
        title="Nhắc hẹn"
        onClose={() => setSheet(null)}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {quickChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => pickQuick(chip.key)}
              style={{
                border: `1px solid ${quick === chip.key ? RED : "#e6dcc8"}`,
                background: quick === chip.key ? RED_PILL : "#fffdf7",
                color: quick === chip.key ? RED : INK,
                fontWeight: quick === chip.key ? 700 : 400,
                borderRadius: 999,
                padding: "8px 14px",
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              {chip.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            type="datetime-local"
            value={remindInput}
            aria-label="Ngày giờ nhắc hẹn"
            onChange={(e) => {
              setRemindInput(e.currentTarget.value);
              setQuick(null);
            }}
            style={{
              width: 216,
              flexShrink: 0,
              border: "1px solid #e6dcc8",
              borderRadius: 12,
              background: "#fffdf7",
              color: INK,
              fontSize: 15,
              padding: "10px 12px",
              outline: "none",
            }}
          />
          <button
            type="button"
            onClick={() => void saveReminder()}
            style={{
              border: "none",
              background: RED,
              color: "#fffdf7",
              fontWeight: 700,
              borderRadius: 999,
              padding: "10px 18px",
              cursor: "pointer",
            }}
          >
            Đặt
          </button>
        </div>
        {note.remindAt != null ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <span style={{ fontSize: 14 }}>{fmtRemind(note.remindAt)}</span>
            <button
              type="button"
              onClick={() => void clearReminder()}
              style={{
                border: `1px solid ${RED}`,
                background: "transparent",
                color: RED,
                fontWeight: 700,
                borderRadius: 999,
                padding: "7px 16px",
                cursor: "pointer",
              }}
            >
              Gỡ
            </button>
          </div>
        ) : null}
        <p style={{ color: MUTED, fontSize: 13, margin: 0 }}>
          Tới giờ sẽ hiện thông báo dù app có đóng. Bấm thông báo là mở đúng ghi chú đó.
        </p>
      </BottomSheet>

      <ConfirmDialog
        open={confirm === "discard"}
        title="Bỏ ghi chú này?"
        body={
          <>
            Nội dung vừa nhập <strong style={{ color: RED }}>không được lưu</strong>.
          </>
        }
        confirmLabel="Bỏ ghi chú"
        cancelLabel="Ở lại"
        danger
        onConfirm={() => void confirmDiscard()}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === "trash"}
        title="Cho ghi chú vào thùng rác?"
        body={
          <>
            <strong>{note.title.trim() || "Ghi chú mới"}</strong> sẽ được giữ trong thùng rác
            30 ngày.
          </>
        }
        confirmLabel="Cho vào thùng rác"
        cancelLabel="Hủy"
        danger
        onConfirm={confirmTrash}
        onCancel={() => setConfirm(null)}
      />
    </main>
  );
}

// --- Icon và mục menu của editor (SVG nét mảnh, không emoji) ---

function MenuItem({
  label,
  active = false,
  pinned = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  pinned?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 3,
        border: "none",
        background: active ? RED_PILL : "transparent",
        color: pinned ? RED : INK,
        borderRadius: 16,
        padding: "6px 2px",
        fontSize: 12,
        fontWeight: pinned || active ? 700 : 400,
        cursor: "pointer",
      }}
    >
      {children}
      {label}
    </button>
  );
}

function PaletteIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-.9 2-1.9 0-1-.8-1.6-.8-2.6 0-1.2 1-2 2.2-2H17a4 4 0 0 0 4-4c0-4.2-4-7.5-9-7.5z" />
      <circle cx="7.5" cy="11.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="11" cy="7.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function PinIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 4h6l1 7 3 3v2H5v-2l3-3 1-7z" />
      <path d="M12 16v5" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6" />
    </svg>
  );
}

function NoneIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8" />
      <path d="M6 6l12 12" />
    </svg>
  );
}
