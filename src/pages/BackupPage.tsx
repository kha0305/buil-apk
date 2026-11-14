import { useState } from "react";
import type { CSSProperties } from "react";
import { toast } from "../lib/toast";
import ConfirmDialog from "../components/ConfirmDialog";
import { exportBackup, importBackup, listNotes } from "../services/notesApi";

type Props = {
  onClose: () => void;
  onChanged: () => void;
};

// Bản sao lưu mẫu, đúng định dạng xuất (version 1, notes, tags, settings),
// in đẹp một trường một dòng để dán thử ngay: bấm Nhập luôn là nhập được
// (2 ghi chú, tag "Mẫu" có trong cả notes lẫn tags).
const SAMPLE_BACKUP = {
  version: 1,
  notes: [
    {
      id: 1,
      title: "Ghi chú mẫu 1",
      content: "Đây là bản sao lưu mẫu để thử tính năng nhập.",
      colour: "yellow",
      pinned: false,
      updatedAt: 1794700000000,
      deletedAt: null,
      remindAt: null,
      tags: ["Mẫu"],
    },
    {
      id: 2,
      title: "Ghi chú mẫu 2",
      content: "Nhập bản này sẽ thay thế toàn bộ ghi chú hiện tại.",
      colour: "mint",
      pinned: false,
      updatedAt: 1794700001000,
      deletedAt: null,
      remindAt: null,
      tags: [],
    },
  ],
  tags: [{ id: 1, name: "Mẫu", count: 1 }],
  settings: { collapsed_groups: "[]" },
};
const SAMPLE_TEXT = JSON.stringify(SAMPLE_BACKUP, null, 2);

const ACCENT = "#b3261e";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Kiểm tra hình dạng bản sao lưu trước khi hỏi xác nhận: đúng version 1,
// đủ 3 trường notes / tags / settings thì mới tính là đúng định dạng.
const parseBackup = (text: string): { noteCount: number } | null => {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const { version, notes, tags, settings } = data as Record<string, unknown>;
  if (version !== 1 || !Array.isArray(notes) || !Array.isArray(tags)) return null;
  if (typeof settings !== "object" || settings === null || Array.isArray(settings)) return null;
  return { noteCount: notes.length };
};

const solidRedBtn: CSSProperties = {
  background: ACCENT,
  borderColor: ACCENT,
  color: "#fffdf7",
  fontWeight: 700,
};

const outlineRedBtn: CSSProperties = {
  background: "#fffdf7",
  borderColor: ACCENT,
  color: ACCENT,
  fontWeight: 700,
};

export default function BackupPage({ onClose, onChanged }: Props) {
  const [exported, setExported] = useState("");
  const [importText, setImportText] = useState(SAMPLE_TEXT);
  const [confirmImport, setConfirmImport] = useState<{
    noteCount: number;
    currentCount: number;
  } | null>(null);

  // Xuất: bảng chia sẻ của máy nếu có, không thì hiện JSON để sao chép tay.
  // Hủy chia sẻ thì im lặng, không báo lỗi.
  const doExport = async () => {
    try {
      const text = await exportBackup();
      setExported(text);
      if (typeof navigator.share === "function") {
        try {
          await navigator.share({ text });
        } catch (e) {
          if ((e as Error)?.name !== "AbortError") throw e;
        }
      }
    } catch (e) {
      toast(errMsg(e), "error");
    }
  };

  const copyExported = async () => {
    try {
      await navigator.clipboard.writeText(exported);
      toast("Đã sao chép bản sao lưu.");
    } catch (e) {
      toast(errMsg(e), "error");
    }
  };

  // Nhập: kiểm tra rỗng / sai định dạng rồi mới hỏi xác nhận, số lượng
  // trong dialog lấy từ dữ liệu thật (số note hiện tại + số note trong JSON).
  const doImport = async () => {
    if (!importText.trim()) {
      toast("Chưa dán bản sao lưu.", "error");
      return;
    }
    const parsed = parseBackup(importText);
    if (!parsed) {
      toast("Bản JSON không đúng định dạng.", "error");
      return;
    }
    try {
      const current = await listNotes();
      setConfirmImport({ noteCount: parsed.noteCount, currentCount: current.length });
    } catch (e) {
      toast(errMsg(e), "error");
    }
  };

  const runImport = async () => {
    if (!confirmImport) return;
    setConfirmImport(null);
    try {
      const count = await importBackup(importText);
      toast(`Đã nhập ${count} ghi chú.`);
      onChanged();
    } catch (e) {
      toast(errMsg(e), "error");
    }
  };

  return (
    <main className="page">
      <header className="toolbar">
        <button type="button" onClick={onClose} aria-label="Quay lại danh sách">
          ‹
        </button>
        <h1>Sao lưu</h1>
      </header>
      <section className="backup-section">
        <h2>Xuất bản sao lưu</h2>
        <p className="backup-note">
          Lưu toàn bộ ghi chú, tag, màu sắc, nhắc hẹn và thùng rác thành 1 bản JSON để chuyển
          máy hoặc phòng khi mất.
        </p>
        <button type="button" style={solidRedBtn} onClick={() => void doExport()}>
          Xuất bản sao lưu
        </button>
        {exported ? (
          <>
            <textarea className="backup-json" value={exported} readOnly aria-label="Bản sao lưu đã xuất" />
            <button type="button" onClick={() => void copyExported()}>
              Sao chép
            </button>
          </>
        ) : null}
      </section>
      <section className="backup-section">
        <h2>Nhập bản sao lưu</h2>
        <p className="backup-note" style={{ color: ACCENT, fontWeight: 600 }}>
          Nhập sẽ thay thế toàn bộ ghi chú hiện tại, kể cả thùng rác.
        </p>
        <textarea
          className="backup-json"
          style={{ minHeight: 160 }}
          value={importText}
          onChange={(e) => setImportText(e.currentTarget.value)}
          aria-label="Bản sao lưu để nhập"
        />
        <p className="backup-note">Bản mẫu — xóa rồi dán bản của bạn vào, hoặc bấm Nhập luôn để thử.</p>
        <button type="button" style={outlineRedBtn} onClick={() => void doImport()}>
          Nhập bản sao lưu
        </button>
      </section>
      {confirmImport ? (
        <ConfirmDialog
          open
          title="Nhập bản sao lưu?"
          body={
            <>
              <p style={{ margin: "0 0 8px" }}>
                Hành động này sẽ xóa toàn bộ{" "}
                <strong style={{ color: ACCENT }}>{confirmImport.currentCount} ghi chú</strong> hiện
                tại.
              </p>
              <p style={{ margin: 0 }}>
                <strong>Bản sao lưu có {confirmImport.noteCount} ghi chú.</strong>
              </p>
            </>
          }
          confirmLabel="Nhập"
          danger
          onConfirm={() => void runImport()}
          onCancel={() => setConfirmImport(null)}
        />
      ) : null}
    </main>
  );
}
