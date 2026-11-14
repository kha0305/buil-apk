import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Note, Tag } from "../lib/types";
import {
  blendHex,
  COLOUR_HEX,
  TAG_COLOURS,
  TAG_COLOUR_HEX,
} from "../lib/types";
import TagIcon, { TAG_ICON_IDS } from "../components/TagIcon";
import { getSetting, renameTag, setSetting } from "../services/notesApi";
import { toast } from "../lib/toast";
import NoteCard from "../components/NoteCard";

type Props = {
  notes: Note[];
  tags: Tag[];
  query: string;
  onQuery: (q: string) => void;
  onOpen: (note: Note) => void;
  onTogglePin: (note: Note) => void;
  onOpenTrash: () => void;
  onAssignTags: (notes: Note[], tag: string | null) => void;
  onTrashNotes: (notes: Note[]) => void;
  onReorder: (tagId: number, orderedIds: number[]) => void;
  onTagsChanged: () => void;
  onRefresh: () => Promise<void>;
  onVisibleChange: (ids: number[]) => void;
  onToggleSelectMany: (ids: number[], select: boolean) => void;
  deletingIds: ReadonlySet<number>;
  selectMode: boolean;
  selectedIds: ReadonlySet<number>;
  onToggleSelect: (note: Note) => void;
  onEnterSelectMode: () => void;
  homeReset: number;
  allSelected: boolean;
  onToggleSelectAll: () => void;
};

type Group = {
  tag: Tag;
  notes: Note[];
};

// `notes` là tập note đang kéo: 1 note khi kéo đơn, N note khi kéo nhiều
// trong chế độ chọn. `overTagId` = nhóm đang ở dưới con trỏ (id tag, 0 là
// nhóm Chưa gắn tag). `insertIndex` chỉ có nghĩa khi kéo 1 note trong
// cùng một nhóm (xếp lại thứ tự).
type DragState = {
  notes: Note[];
  x: number;
  y: number;
  fromTagId: number;
  overTagId: number | null;
  overTrash: boolean;
  moved: boolean;
  insertIndex: number | null;
};

// Phần trạng thái kéo mà giao diện cần vẽ lại: chỉ đổi khi qua nhóm khác,
// vào/ra vùng thùng rác, hoặc bắt đầu di chuyển — KHÔNG đổi theo từng
// điểm chạm (tọa độ con trỏ chỉ đẩy transform của bản sao qua ref, xem
// positionClone; render lại cả danh sách mỗi lần di chuyển là giật).
type DragUi = {
  notes: Note[];
  fromTagId: number;
  overTagId: number | null;
  overTrash: boolean;
  moved: boolean;
};

type RenameDraft = {
  id: number;
  name: string;
  icon: string;
  colour: string;
};

// Nhấn giữ ~400ms mới nhấc note/tag lên: cuộn trang bằng tay vẫn bình
// thường, chỉ khi giữ yên mới bắt đầu kéo. HTML5 drag-and-drop không dùng
// được trên cảm ứng nên kéo thả viết bằng Pointer Events, chạy cả chuột
// lẫn tay. Kéo đi >12px trước khi đủ 400ms thì hủy hẹn giờ (đó là cuộn).
const LONG_PRESS_MS = 400;
const MOVE_PX = 12;
const PAGE_BG = "#f7f1e5";
const TAGBOX_BORDER = "#d8cfba";

// Gộp vị trí mới của note đang kéo vào thứ tự đầy đủ của nhóm: note không
// hiện trên màn hình (đang lọc/tìm kiếm) giữ nguyên chỗ cũ — chỉ mỗi note
// đang kéo là đổi chỗ. `full` là Tag.noteIds, `visible` là id các note đang
// hiện (đã ghim trước), newIndex là chỗ thả trong danh sách đang hiện
// (đã trừ note đang kéo ra): chèn trước note hiện đứng sau chỗ thả, hoặc
// ngay sau note hiện đứng trước nếu thả ở cuối danh sách đang hiện.
export function mergeReorder(
  full: number[],
  visible: number[],
  draggedId: number,
  newIndex: number,
): number[] {
  const shown = visible.filter((id) => id !== draggedId);
  if (shown.length === 0) {
    // Note đang kéo là note duy nhất đang hiện: thả đâu trong nhóm cũng
    // không đổi thứ tự (chỉ thêm vào cuối nếu note thiếu trong full).
    return full.includes(draggedId) ? [...full] : [...full, draggedId];
  }
  const at = Math.max(0, Math.min(newIndex, shown.length));
  const rest = full.filter((id) => id !== draggedId);
  let pos: number;
  if (at < shown.length) {
    const next = rest.indexOf(shown[at]);
    pos = next === -1 ? rest.length : next;
  } else if (at > 0) {
    const prev = rest.indexOf(shown[at - 1]);
    pos = prev === -1 ? rest.length : prev + 1;
  } else {
    pos = rest.length;
  }
  rest.splice(pos, 0, draggedId);
  return rest;
}

// Kẹp chỗ thả vào đúng tầng ghim của note đang kéo: note ghim chỉ xếp
// giữa các note ghim, note thường chỉ xếp giữa các note thường.
function clampToTier(index: number, visible: Note[], dragged: Note): number {
  const shown = visible.filter((n) => n.id !== dragged.id);
  const pinnedCount = shown.filter((n) => n.pinned).length;
  if (dragged.pinned) return Math.max(0, Math.min(index, pinnedCount));
  return Math.max(pinnedCount, Math.min(index, shown.length));
}

// Chỗ sẽ thả trong nhóm, tính theo điểm (x, y): đếm ô nào có tâm nằm trước
// con trỏ theo thứ tự đọc (hàng trên trước, cùng hàng thì ô trái trước).
function insertIndexAt(
  x: number,
  y: number,
  groupTagId: number,
  draggedIds: ReadonlySet<number>,
): number {
  const tiles = Array.from(
    document.querySelectorAll(`[data-tag-group="${groupTagId}"] [data-note-id]`),
  ).filter((el) => !draggedIds.has(Number(el.getAttribute("data-note-id"))));
  let idx = 0;
  for (const el of tiles) {
    const r = (el as HTMLElement).getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    if (cy < y - r.height / 2) idx += 1;
    else if (Math.abs(cy - y) <= r.height / 2 && cx < x) idx += 1;
  }
  return idx;
}

// Màu tag lưu bằng tên ("pink", "cream"); tag nào editor đã lưu bằng mã
// hex thì dùng thẳng mã đó (hợp đồng chưa thống nhất hai dạng này).
const tagHex = (colour: string): string =>
  colour.startsWith("#")
    ? colour
    : ((TAG_COLOUR_HEX as Record<string, string>)[colour] ?? TAG_COLOUR_HEX.cream);

const noteHex = (colour: string): string =>
  (COLOUR_HEX as Record<string, string>)[colour] ?? "#e6e6e6";

const gridIcon = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="7" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
    <rect x="13" y="13" width="7" height="7" rx="1.5" />
  </svg>
);

const listIcon = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 6h11M9 12h11M9 18h11" />
    <circle cx="4.5" cy="6" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="18" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);

const trashIcon = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6" />
  </svg>
);

const checkCircleIcon = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="8.5" />
    <path d="M8.5 12.2l2.4 2.4 4.6-5" />
  </svg>
);

const pencilIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17 3l4 4L8 20l-5 1 1-5L17 3z" />
  </svg>
);

export default function ListPage({
  notes,
  tags,
  query,
  onQuery,
  onOpen,
  onTogglePin,
  onOpenTrash,
  onAssignTags,
  onTrashNotes,
  onReorder,
  onTagsChanged,
  onRefresh,
  onVisibleChange,
  onToggleSelectMany,
  deletingIds,
  selectMode,
  selectedIds,
  onToggleSelect,
  onEnterSelectMode,
  homeReset,
  allSelected,
  onToggleSelectAll,
}: Props) {
  const [dragUi, setDragUi] = useState<DragUi | null>(null);
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const [tagOrder, setTagOrder] = useState<string[]>([]);
  const [filterId, setFilterId] = useState<number | null>(null);
  const homeResetFirstRef = useRef(true);

  // Bấm tab Ghi chú khi đang ở trang chính: về lại "Tất cả" (bỏ lọc).
  useEffect(() => {
    if (homeResetFirstRef.current) {
      homeResetFirstRef.current = false;
      return;
    }
    setFilterId(null);
  }, [homeReset]);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [editingTag, setEditingTag] = useState<RenameDraft | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const dragUiRef = useRef<DragUi | null>(null);
  const cloneRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef({ x: 0, y: 0, note: null as Note | null, tagId: 0 });
  const pillTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pillStartRef = useRef({ x: 0, y: 0, tagId: null as number | null });
  const suppressPillClickRef = useRef(false);
  const suppressClickUntilRef = useRef(0);
  // Kéo xuống làm mới (pull-to-refresh): chỉ khi đang ở đầu trang, chưa
  // kéo note, chưa đang làm mới. Kéo đủ ngưỡng (~70px) rồi thả thì tải lại
  // danh sách (ghi chú + tag). Chỉ báo xoay theo độ kéo qua ref (không
  // render lại danh sách mỗi lần chạm di chuyển).
  const PULL_THRESHOLD = 70;
  const PULL_MAX = 90;
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);
  const pullRef = useRef<HTMLDivElement | null>(null);
  const pullSpinRef = useRef<HTMLSpanElement | null>(null);
  const pullStateRef = useRef({ startY: 0, active: false, ready: false });
  const setPullHeight = (h: number) => {
    const el = pullRef.current;
    if (el) {
      el.style.height = `${h}px`;
      el.style.opacity = h > 4 ? "1" : "0";
    }
  };
  const cbRef = useRef({ onOpen, onAssignTags, onTrashNotes, onReorder, onRefresh });
  cbRef.current = { onOpen, onAssignTags, onTrashNotes, onReorder, onRefresh };
  // endDrag chạy từ listener đăng ký một lần nên đọc chế độ chọn qua ref,
  // không đọc state trực tiếp (closure cũ sẽ thấy giá trị cũ).
  const modeRef = useRef({ selectMode, selectedIds });
  modeRef.current = { selectMode, selectedIds };

  // Đặt lại state kéo chỉ khi giá trị rời rạc đổi (qua nhóm, vào/ra thùng
  // rác, bắt đầu di chuyển); tọa độ con trỏ không đi qua đây.
  const setDragUiBoth = (next: DragUi | null) => {
    const prev = dragUiRef.current;
    if (
      prev === next ||
      (prev !== null &&
        next !== null &&
        prev.notes === next.notes &&
        prev.fromTagId === next.fromTagId &&
        prev.overTagId === next.overTagId &&
        prev.overTrash === next.overTrash &&
        prev.moved === next.moved)
    ) {
      return;
    }
    dragUiRef.current = next;
    setDragUi(next);
  };

  // Bản sao kéo bay theo tay bằng transform (GPU) — ghi thẳng vào DOM,
  // không qua React state, nên kéo không render lại danh sách.
  const positionClone = (x: number, y: number) => {
    const el = cloneRef.current;
    if (el) el.style.transform = `translate3d(${x + 12}px, ${y - 20}px, 0)`;
  };

  // Khi drag mới bắt đầu thì đặt vị trí đầu của bản sao trước khi vẽ
  // (tránh chớp một khung ở góc màn hình).
  useLayoutEffect(() => {
    const d = dragRef.current;
    if (dragUi && d) positionClone(d.x, d.y);
  }, [dragUi]);

  // Nhóm + thứ tự note trong nhóm chỉ tính lại khi notes/tags/tagOrder
  // đổi (không tính lại mỗi lần render — kéo thả render lại nhiều lần).
  const groups: Group[] = useMemo(() => {
    const noteById = new Map(notes.map((n) => [n.id, n]));
    // Nhóm xếp theo thứ tự đã lưu; tag chưa có trong danh sách thì xếp cuối
    // theo tên; nhóm "Chưa gắn tag" (id 0) luôn cuối cùng.
    const sorted = [...tags].sort((a, b) => {
      if (a.id === 0) return 1;
      if (b.id === 0) return -1;
      const ai = tagOrder.indexOf(a.name);
      const bi = tagOrder.indexOf(b.name);
      if (ai === -1 && bi === -1) return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
    // Note trong nhóm xếp theo Tag.noteIds (ghim trước, rồi position).
    // Phòng hờ: note mang tên tag nhưng thiếu trong noteIds thì xếp cuối.
    return sorted.map((t) => {
      const picked = t.noteIds
        .map((id) => noteById.get(id))
        .filter((n): n is Note => n !== undefined);
      const seen = new Set(picked.map((n) => n.id));
      const extra = notes.filter(
        (n) =>
          !seen.has(n.id) &&
          (t.id === 0 ? n.tags.length === 0 : n.tags.includes(t.name)),
      );
      return { tag: t, notes: [...picked, ...extra] };
    });
  }, [notes, tags, tagOrder]);
  const groupsRef = useRef<Group[]>([]);
  groupsRef.current = groups;
  const tagsById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);
  const tagsRef = useRef(tagsById);
  tagsRef.current = tagsById;

  // Màu nền khung nhóm (blendHex) cũng cache theo tags, không tính lại
  // mỗi lần render.
  const tints = useMemo(() => {
    const m = new Map<number, CSSProperties | undefined>();
    for (const t of tags) {
      m.set(
        t.id,
        t.id === 0
          ? undefined
          : {
              background: blendHex(tagHex(t.colour), PAGE_BG, 0.25),
              borderColor: blendHex(tagHex(t.colour), TAGBOX_BORDER, 0.45),
            },
      );
    }
    return m;
  }, [tags]);

  const shownGroups = filterId === null ? groups : groups.filter((g) => g.tag.id === filterId);
  // Id note đang hiện trên màn hình (đã lọc chip + tìm kiếm): App dùng để
  // tính "Chọn tất cả" và nút chọn theo nhóm.
  const visibleIds = shownGroups.flatMap((g) => g.notes.map((n) => n.id));
  const visibleKey = visibleIds.join(",");
  useEffect(() => {
    onVisibleChange(visibleIds);
    // Chỉ chạy lại khi tập note hiện đổi (chuỗi id), không chạy mỗi lần render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKey]);

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const clearPillTimer = () => {
    if (pillTimerRef.current) clearTimeout(pillTimerRef.current);
    pillTimerRef.current = null;
  };

  // Nhóm tag nằm dưới điểm (x, y); 0 là nhóm Chưa gắn tag, null là ngoài nhóm.
  const groupAt = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y)?.closest("[data-tag-group]");
    if (!el) return null;
    const v = Number(el.getAttribute("data-tag-group"));
    return Number.isNaN(v) ? null : v;
  };

  // Con trỏ/chạm có đang ở trên vùng thùng rác (chỉ hiện khi đang kéo).
  const trashAt = (x: number, y: number): boolean =>
    document.elementFromPoint(x, y)?.closest("[data-trash-zone]") != null;

  const beginDrag = (note: Note, fromTagId: number, x: number, y: number) => {
    // Chế độ chọn mà note đã chọn thì kéo cả tập đã chọn (giữ thứ tự danh
    // sách); còn lại kéo đúng 1 note như cũ.
    const picked =
      modeRef.current.selectMode && modeRef.current.selectedIds.has(note.id)
        ? notes.filter((n) => modeRef.current.selectedIds.has(n.id))
        : [note];
    const d: DragState = {
      notes: picked,
      x,
      y,
      fromTagId,
      overTagId: groupAt(x, y),
      overTrash: false,
      moved: false,
      insertIndex: null,
    };
    dragRef.current = d;
    setDragUiBoth({
      notes: d.notes,
      fromTagId: d.fromTagId,
      overTagId: d.overTagId,
      overTrash: false,
      moved: false,
    });
  };

  const endDrag = () => {
    const d = dragRef.current;
    dragRef.current = null;
    setDragUiBoth(null);
    if (!d) return;
    if (d.moved) {
      // Bấm thả sau khi kéo thì chặn click mở note chừng 600ms.
      suppressClickUntilRef.current = Date.now() + 600;
      if (d.overTrash) {
        cbRef.current.onTrashNotes(d.notes);
        return;
      }
      if (d.overTagId !== null) {
        const single = d.notes.length === 1 && !modeRef.current.selectMode;
        if (single && d.overTagId === d.fromTagId && d.insertIndex !== null) {
          // Kéo trong cùng một nhóm: xếp lại thứ tự, note không hiện vẫn
          // giữ chỗ cũ (gộp bằng mergeReorder).
          const g = groupsRef.current.find((gr) => gr.tag.id === d.overTagId);
          if (g) {
            const visible = g.notes.map((n) => n.id);
            const at = clampToTier(d.insertIndex, g.notes, d.notes[0]);
            const merged = mergeReorder(g.tag.noteIds, visible, d.notes[0].id, at);
            if (merged.join(",") !== g.tag.noteIds.join(",")) {
              cbRef.current.onReorder(d.overTagId, merged);
            }
          }
        } else if (d.overTagId === 0) {
          cbRef.current.onAssignTags(d.notes, null);
        } else {
          const target = tagsRef.current.get(d.overTagId);
          if (target) cbRef.current.onAssignTags(d.notes, target.name);
        }
        return;
      }
      // Thả vào khoảng trống (không nằm trên nhóm nào, không phải thùng
      // rác): gỡ tag của các note đang kéo, cho về "Chưa gắn tag" — giống
      // hệt như thả vào nhóm "Chưa gắn tag" (overTagId === 0).
      cbRef.current.onAssignTags(d.notes, null);
      return;
    }
    if (!modeRef.current.selectMode) cbRef.current.onOpen(d.notes[0]);
  };

  const onCardPointerDown = (note: Note, groupTagId: number, e: ReactPointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // Chế độ chọn: chỉ note đã chọn mới kéo được (kéo cả tập đã chọn);
    // bấm note chưa chọn thì để click xử lý chọn/bỏ chọn.
    if (modeRef.current.selectMode && !modeRef.current.selectedIds.has(note.id)) return;
    startRef.current = { x: e.clientX, y: e.clientY, note, tagId: groupTagId };
    if (e.pointerType === "mouse") {
      beginDrag(note, groupTagId, e.clientX, e.clientY);
    } else {
      clearTimer();
      timerRef.current = setTimeout(
        () => beginDrag(note, groupTagId, e.clientX, e.clientY),
        LONG_PRESS_MS,
      );
    }
  };

  const handleCardClick = (note: Note) => {
    if (Date.now() < suppressClickUntilRef.current) return;
    if (selectMode) onToggleSelect(note);
    else onOpen(note);
  };

  useEffect(() => () => clearTimer(), []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (d) {
        const moved =
          d.moved ||
          Math.hypot(e.clientX - startRef.current.x, e.clientY - startRef.current.y) > MOVE_PX;
        const overTagId = groupAt(e.clientX, e.clientY);
        const overTrash = trashAt(e.clientX, e.clientY);
        // Chỉ tính chỗ chèn khi kéo 1 note trong cùng nhóm (xếp lại);
        // kéo sang nhóm khác hoặc kéo nhiều thì không cần.
        let insertIndex: number | null = null;
        if (
          moved &&
          !overTrash &&
          overTagId !== null &&
          overTagId === d.fromTagId &&
          d.notes.length === 1 &&
          !modeRef.current.selectMode
        ) {
          insertIndex = insertIndexAt(
            e.clientX,
            e.clientY,
            overTagId,
            new Set([d.notes[0].id]),
          );
        }
        const next: DragState = {
          ...d,
          x: e.clientX,
          y: e.clientY,
          overTagId,
          overTrash,
          moved,
          insertIndex,
        };
        dragRef.current = next;
        // Bản sao bay theo tay bằng transform, không render lại danh sách;
        // chỉ cập nhật state khi giá trị rời rạc đổi (qua nhóm, vào/ra
        // thùng rác, bắt đầu di chuyển).
        positionClone(e.clientX, e.clientY);
        setDragUiBoth({ notes: d.notes, fromTagId: d.fromTagId, overTagId, overTrash, moved });
        return;
      }
      // Chưa nhấc lên mà tay đã trượt đi: đó là cuộn trang, hủy hẹn giờ.
      const s = startRef.current;
      if (s.note && Math.hypot(e.clientX - s.x, e.clientY - s.y) > MOVE_PX) {
        clearTimer();
        startRef.current = { x: 0, y: 0, note: null, tagId: 0 };
      }
      const p = pillStartRef.current;
      if (p.tagId !== null && Math.hypot(e.clientX - p.x, e.clientY - p.y) > MOVE_PX) {
        clearPillTimer();
        pillStartRef.current = { x: 0, y: 0, tagId: null };
      }
    };
    const onUp = () => {
      clearTimer();
      clearPillTimer();
      startRef.current = { x: 0, y: 0, note: null, tagId: 0 };
      pillStartRef.current = { x: 0, y: 0, tagId: null };
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
    // Listener đăng ký một lần, đọc mọi trạng thái qua ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Đang kéo thì chặn cuộn trang bằng tay; chưa kéo thì cuộn bình thường.
  useEffect(() => {
    if (!dragUi) return;
    const block = (e: TouchEvent) => e.preventDefault();
    window.addEventListener("touchmove", block, { passive: false });
    return () => window.removeEventListener("touchmove", block);
  }, [dragUi]);

  // Kéo xuống làm mới (pull-to-refresh): vuốt xuống nhanh ở đầu trang thì
  // tải lại danh sách. Kéo note cần nhấn giữ ~400ms mới nhấc lên, còn kéo
  // làm mới là vuốt xuống ngay không giữ — hai cử chỉ không chạm nhau:
  // đang kéo note thì bỏ qua, và vuốt đi >12px thì hẹn giờ nhấc note đã
  // bị hủy bởi handler pointermove.
  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current) return;
      if (dragRef.current || dragUiRef.current) return;
      if (window.scrollY > 0) return;
      const t = e.touches[0];
      if (!t) return;
      pullStateRef.current = { startY: t.clientY, active: true, ready: false };
    };
    const onTouchMove = (e: TouchEvent) => {
      const p = pullStateRef.current;
      if (!p.active) return;
      if (dragRef.current || dragUiRef.current) {
        pullStateRef.current = { startY: 0, active: false, ready: false };
        setPullHeight(0);
        return;
      }
      const t = e.touches[0];
      if (!t) return;
      const dy = t.clientY - p.startY;
      if (dy <= 0) {
        setPullHeight(0);
        p.ready = false;
        return;
      }
      // Đang kéo xuống ở đầu trang: chặn kéo làm mới mặc định của trình
      // duyệt và hiện chỉ báo.
      e.preventDefault();
      const h = Math.min(dy, PULL_MAX);
      setPullHeight(h);
      if (pullSpinRef.current) pullSpinRef.current.style.transform = `rotate(${dy * 3}deg)`;
      p.ready = dy >= PULL_THRESHOLD;
    };
    const onTouchEnd = () => {
      const p = pullStateRef.current;
      if (!p.active) return;
      pullStateRef.current = { startY: 0, active: false, ready: false };
      if (!p.ready) {
        setPullHeight(0);
        return;
      }
      refreshingRef.current = true;
      setRefreshing(true);
      setPullHeight(48);
      if (pullSpinRef.current) pullSpinRef.current.style.transform = "";
      void cbRef.current.onRefresh().finally(() => {
        refreshingRef.current = false;
        setRefreshing(false);
        setPullHeight(0);
        if (pullSpinRef.current) pullSpinRef.current.style.transform = "";
      });
    };
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchEnd);
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
    // Listener đăng ký một lần, đọc mọi trạng thái qua ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleGroup = (tagId: number) => {
    const next = { ...collapsed };
    if (next[tagId]) delete next[tagId];
    else next[tagId] = true;
    setCollapsed(next);
    // Ghi xuống DB ngay để tắt app mở lại vẫn giữ trạng thái nhóm.
    void setSetting("collapsed_groups", JSON.stringify(Object.keys(next).map(Number))).catch(
      () => undefined,
    );
  };

  // Nhóm nào đang thu gọn được lưu trong DB (ListPage unmount mỗi lần mở
  // editor nên state trong bộ nhớ không giữ được qua lần mở note).
  // Thứ tự nhóm cũng vậy: đọc tag_order cùng lúc.
  useEffect(() => {
    getSetting("collapsed_groups")
      .then((v) => {
        if (!v) return;
        try {
          const ids = JSON.parse(v) as unknown[];
          setCollapsed(
            Object.fromEntries(ids.filter((n) => typeof n === "number").map((n) => [n, true])),
          );
        } catch {
          // Giá trị cũ (tên tag, bản v17 trở về trước) thì bỏ qua, mặc định mở hết.
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

  // --- Đổi tên tag ngay trên tiêu đề nhóm (nhấn giữ tên tag) ---

  const startRename = (tag: Tag) =>
    setEditingTag({ id: tag.id, name: tag.name, icon: tag.icon, colour: tag.colour });

  const saveRename = async () => {
    if (!editingTag) return;
    const name = editingTag.name.trim();
    if (!name) {
      toast("Tên tag không được để trống.", "error");
      return;
    }
    // Tên cũ (trước khi đổi) để giữ đúng vị trí nhóm trong tagOrder.
    const oldName = tags.find((t) => t.id === editingTag.id)?.name;
    try {
      // Lưu tên + icon + màu trong MỘT lần gọi; trùng tên thì backend báo
      // lỗi ("Tên tag này đã có rồi.") và hiện toast đỏ, ở lại form sửa.
      await renameTag(editingTag.id, name, editingTag.icon, editingTag.colour);
      // Giữ vị trí nhóm: tagOrder lưu theo tên nên đổi tên xong phải thay
      // tên cũ bằng tên mới (cùng vị trí), không thì nhóm rơi xuống cuối
      // vì tên mới không có trong tagOrder.
      if (oldName && oldName !== name && tagOrder.includes(oldName)) {
        const next = tagOrder.map((n) => (n === oldName ? name : n));
        setTagOrder(next);
        void setSetting("tag_order", JSON.stringify(next)).catch(() => undefined);
      }
      setEditingTag(null);
      onTagsChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    }
  };

  const onPillPointerDown = (tag: Tag, e: ReactPointerEvent) => {
    // Nhóm Chưa gắn tag không đổi được; chế độ chọn thì tắt đổi tên.
    if (tag.id === 0 || selectMode) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pillStartRef.current = { x: e.clientX, y: e.clientY, tagId: tag.id };
    clearPillTimer();
    pillTimerRef.current = setTimeout(() => {
      suppressPillClickRef.current = true;
      pillStartRef.current = { x: 0, y: 0, tagId: null };
      startRename(tag);
    }, LONG_PRESS_MS);
  };

  const onPillClick = (tagId: number) => {
    // Nhấn giữ rồi thả thì click nổ ngay sau đó: chặn để khỏi thu gọn/mở
    // nhóm hai lần. Bấm thường thì để click thu gọn/mở như cũ.
    if (suppressPillClickRef.current) {
      suppressPillClickRef.current = false;
      return;
    }
    toggleGroup(tagId);
  };

  return (
    <main className="page">
      <div ref={pullRef} className="pull-refresh" aria-hidden="true">
        <span
          ref={pullSpinRef}
          className={`pull-spinner${refreshing ? " spinning" : ""}`}
        />
      </div>
      {selectMode ? (
        <header className="toolbar">
          <h1>Đã chọn {selectedIds.size}</h1>
          <button type="button" onClick={onToggleSelectAll}>
            {allSelected ? "Bỏ chọn hết" : "Chọn tất cả"}
          </button>
        </header>
      ) : (
        <header className="toolbar">
          <h1>Ghi chú</h1>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}
            aria-label={viewMode === "grid" ? "Xem dạng danh sách" : "Xem dạng lưới"}
          >
            {viewMode === "grid" ? listIcon : gridIcon}
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={onOpenTrash}
            aria-label="Thùng rác"
          >
            {trashIcon}
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={onEnterSelectMode}
            aria-label="Chọn nhiều ghi chú"
          >
            {checkCircleIcon}
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
        query.trim() ? (
          <div className="empty-state">
            <p>
              <strong>Không tìm thấy ghi chú nào</strong>
            </p>
            <p>Thử từ khóa khác nhé.</p>
          </div>
        ) : (
          <div className="empty-state">
            <p>
              <strong>Chưa có ghi chú nào</strong>
            </p>
            <p>Bấm + để tạo ghi chú đầu tiên.</p>
          </div>
        )
      ) : (
        <>
          <div className="filter-chips" aria-label="Lọc theo tag">
            <button
              type="button"
              className={`filter-chip${filterId === null ? " selected" : ""}`}
              onClick={() => setFilterId(null)}
            >
              Tất cả
            </button>
            {/* list_tags đã trả nhóm id 0 ở cuối nên chip "Chưa gắn tag"
                chỉ hiện 1 lần, và chỉ khi nhóm đó đang có note. */}
            {tags
              .filter((t) => t.id !== 0)
              .map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`filter-chip${filterId === t.id ? " selected" : ""}`}
                  onClick={() => setFilterId(t.id)}
                >
                  <TagIcon id={t.icon} size={14} />
                  {t.name}
                </button>
              ))}
            {tags.some((t) => t.id === 0) ? (
              <button
                type="button"
                className={`filter-chip${filterId === 0 ? " selected" : ""}`}
                onClick={() => setFilterId(0)}
              >
                Chưa gắn tag
              </button>
            ) : null}
          </div>
          {shownGroups.length === 0 ? (
            <div className="empty-state">
              <p>
                <strong>Nhóm này chưa có ghi chú</strong>
              </p>
              <p>Kéo ghi chú vào nhóm để thêm.</p>
            </div>
          ) : null}
          {shownGroups.map((g) => {
            const tag = g.tag;
            // Tag có màu thì khung nhóm nhuộm nhạt theo màu tag (đã cache
            // trong `tints`); nhóm Chưa gắn tag dùng nền mặc định của .tagbox.
            // Chấm màu khi nhóm thu gọn: một chấm cho mỗi màu note khác nhau
            // trong nhóm, theo đúng thứ tự note xuất hiện (thứ tự hiển thị)
            // để thu gọn rồi mở ra, chấm màu khớp với các ô note.
            const dots = [...new Set(g.notes.map((n) => n.colour))];
            // Chế độ chọn: nút "N note" ở đầu nhóm chọn/bỏ chọn cả nhóm.
            const groupIds = g.notes.map((n) => n.id);
            const groupAllSelected =
              groupIds.length > 0 && groupIds.every((id) => selectedIds.has(id));
            const editing = editingTag !== null && editingTag.id === tag.id;
            return (
              <section
                key={tag.id}
                className={`tag-group tagbox${dragUi && dragUi.overTagId === tag.id ? " drop-target" : ""}`}
                data-tag-group={tag.id}
                style={tints.get(tag.id)}
              >
                <div className="group-head" onClick={() => onPillClick(tag.id)}>
                  <button
                    type="button"
                    className="tag-pill"
                    style={tag.id === 0 ? undefined : { background: tagHex(tag.colour) }}
                    aria-expanded={!collapsed[tag.id]}
                    onPointerDown={(e) => onPillPointerDown(tag, e)}
                  >
                    <TagIcon id={tag.icon} size={14} />
                    {tag.name}
                  </button>
                  {collapsed[tag.id] && dots.length > 0 ? (
                    <span className="colour-dots" aria-hidden="true">
                      {dots.map((c) => (
                        <span
                          key={c}
                          className="dot"
                          style={{ background: noteHex(c) }}
                        />
                      ))}
                    </span>
                  ) : null}
                  {filterId !== null && filterId === tag.id && tag.id !== 0 && !selectMode ? (
                    <button
                      type="button"
                      className="icon-btn small"
                      onClick={(e) => {
                        e.stopPropagation();
                        startRename(tag);
                      }}
                      aria-label={`Đổi tên tag ${tag.name}`}
                    >
                      {pencilIcon}
                    </button>
                  ) : null}
                  {selectMode ? (
                    <button
                      type="button"
                      className={`group-count count-btn${groupAllSelected ? " all" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleSelectMany(groupIds, !groupAllSelected);
                      }}
                      aria-label={
                        groupAllSelected
                          ? `Bỏ chọn ${groupIds.length} ghi chú trong nhóm ${tag.name}`
                          : `Chọn ${groupIds.length} ghi chú trong nhóm ${tag.name}`
                      }
                    >
                      {groupAllSelected ? "✓ " : ""}
                      {g.notes.length} note
                    </button>
                  ) : (
                    <span className="group-count">{g.notes.length} note</span>
                  )}
                </div>
                {editing && editingTag ? (
                  <div className="rename-editor">
                    <div className="rename-row">
                      <input
                        className="rename-input"
                        value={editingTag.name}
                        autoFocus
                        aria-label="Tên tag"
                        onChange={(e) =>
                          setEditingTag({ ...editingTag, name: e.currentTarget.value })
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                            e.preventDefault();
                            void saveRename();
                          }
                          if (e.key === "Escape") setEditingTag(null);
                        }}
                      />
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => void saveRename()}
                        aria-label="Lưu tên tag"
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => setEditingTag(null)}
                        aria-label="Hủy đổi tên"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="icon-picker" role="group" aria-label="Icon của tag">
                      {TAG_ICON_IDS.map((id) => (
                        <button
                          key={id}
                          type="button"
                          className={`icon-pick${editingTag.icon === id ? " selected" : ""}`}
                          onClick={() => setEditingTag({ ...editingTag, icon: id })}
                          aria-label={
                            id === "none" ? "Không dùng icon" : `Icon ${id}`
                          }
                          aria-pressed={editingTag.icon === id}
                        >
                          {id === "none" ? (
                            <span className="icon-none">Không</span>
                          ) : (
                            <TagIcon id={id} size={20} />
                          )}
                        </button>
                      ))}
                    </div>
                    <div className="swatch-row" role="group" aria-label="Màu của tag">
                      {TAG_COLOURS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className={`colour-dot colour-${c}${tagHex(editingTag.colour) === TAG_COLOUR_HEX[c] ? " selected" : ""}`}
                          onClick={() =>
                            setEditingTag({ ...editingTag, colour: c })
                          }
                          aria-label={`Màu ${c}`}
                          aria-pressed={tagHex(editingTag.colour) === TAG_COLOUR_HEX[c]}
                        >
                          {tagHex(editingTag.colour) === TAG_COLOUR_HEX[c] ? "✓" : ""}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {!collapsed[tag.id] &&
                  (g.notes.length === 0 ? (
                    <p className="group-empty">
                      {tag.id === 0
                        ? "Kéo ghi chú vào đây để gỡ hết tag."
                        : "Kéo ghi chú vào đây để gắn tag này."}
                    </p>
                  ) : (
                    <div className={`note-list${viewMode === "list" ? " list-view" : ""}`}>
                      {g.notes.map((n) => (
                        <NoteCard
                          key={n.id}
                          note={n}
                          onOpen={handleCardClick}
                          onTogglePin={onTogglePin}
                          onPointerDown={(note, e) => onCardPointerDown(note, tag.id, e)}
                          dragging={
                            dragUi !== null &&
                            dragUi.fromTagId === tag.id &&
                            dragUi.notes.some((d) => d.id === n.id)
                          }
                          deleting={deletingIds.has(n.id)}
                          selectMode={selectMode}
                          selected={selectedIds.has(n.id)}
                        />
                      ))}
                    </div>
                  ))}
              </section>
            );
          })}
        </>
      )}
      {dragUi ? (
        <div className={`trash-zone${dragUi.overTrash ? " drop-target" : ""}`} data-trash-zone>
          Thùng rác — thả vào đây để xóa
        </div>
      ) : null}
      {dragUi ? (
        <div ref={cloneRef} className="drag-clone-pos" aria-hidden="true">
          <div className="drag-clone">
            {dragUi.notes.length > 1
              ? `${dragUi.notes.length} ghi chú`
              : dragUi.notes[0].title.trim() || "Ghi chú mới"}
          </div>
        </div>
      ) : null}
    </main>
  );
}
