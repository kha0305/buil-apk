import { useState } from "react";
import { exportBackup, importBackup } from "../services/notesApi";

type Props = {
  onClose: () => void;
  onChanged: () => void;
};

export default function BackupPage({ onClose, onChanged }: Props) {
  const [exported, setExported] = useState("");
  const [importText, setImportText] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  // Xuất: chia sẻ bản sao lưu nếu máy hỗ trợ share, không thì hiện JSON
  // trong ô chỉ đọc để sao chép tay. Hủy chia sẻ thì im lặng, không báo lỗi.
  const doExport = async () => {
    try {
      const text = await exportBackup();
      setExported(text);
      setMessage("");
      setError("");
      if (typeof navigator.share === "function") {
        try {
          await navigator.share({ text });
        } catch (e) {
          if ((e as Error)?.name !== "AbortError") throw e;
        }
      }
    } catch (e) {
      fail(e);
    }
  };

  const copyExported = async () => {
    try {
      await navigator.clipboard.writeText(exported);
      setMessage("Đã sao chép bản sao lưu.");
    } catch (e) {
      fail(e);
    }
  };

  // Nhập: thay thế TOÀN BỘ note hiện tại nên phải xác nhận trước.
  const doImport = async () => {
    if (!importText.trim()) {
      setError("Dán bản sao lưu vào ô trước.");
      return;
    }
    if (!window.confirm("Nhập sẽ thay thế toàn bộ ghi chú hiện tại. Tiếp tục?")) return;
    try {
      const count = await importBackup(importText);
      setMessage(`Đã nhập ${count} ghi chú.`);
      setError("");
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
        <h1>Sao lưu</h1>
      </header>
      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="backup-ok">{message}</p> : null}
      <section className="backup-section">
        <h2>Xuất sao lưu</h2>
        <p className="backup-note">
          Lưu toàn bộ ghi chú, tag và cài đặt (kể cả ghi chú trong thùng rác) ra một bản sao.
        </p>
        <button onClick={() => void doExport()}>Chia sẻ bản sao lưu</button>
        {exported ? (
          <>
            <textarea className="backup-json" value={exported} readOnly aria-label="Bản sao lưu đã xuất" />
            <button onClick={() => void copyExported()}>Sao chép</button>
          </>
        ) : null}
      </section>
      <section className="backup-section">
        <h2>Nhập sao lưu</h2>
        <p className="backup-note">
          Dán bản sao lưu đã xuất vào đây rồi bấm Nhập. Toàn bộ ghi chú hiện tại sẽ bị thay thế.
        </p>
        <textarea
          className="backup-json"
          value={importText}
          onChange={(e) => setImportText(e.currentTarget.value)}
          placeholder="Dán bản sao lưu vào đây..."
          aria-label="Bản sao lưu để nhập"
        />
        <button onClick={() => void doImport()}>Nhập bản sao lưu</button>
      </section>
    </main>
  );
}
