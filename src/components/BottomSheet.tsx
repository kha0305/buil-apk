// Sheet trượt lên từ đáy màn hình, trên nền mờ.
// Bấm nền mờ hoặc nút ✕ thì đóng. Chỉ làm hiệu ứng mở (trượt lên);
// đóng thì biến mất ngay để state của màn cha luôn là chuẩn duy nhất.
import { useEffect, useState, type ReactNode } from "react";

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

const SHEET_BG = "#fffdf7";
const TEXT = "#2b2620";

export default function BottomSheet({ open, title, onClose, children }: Props) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => {
      cancelAnimationFrame(raf);
      setEntered(false);
    };
  }, [open ]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "rgba(43, 38, 32, 0.45)",
        opacity: entered ? 1 : 0,
        transition: "opacity 200ms ease",
      }}
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-label={title}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: "78dvh",
          overflowY: "auto",
          background: SHEET_BG,
          color: TEXT,
          borderRadius: "22px 22px 0 0",
          padding: "10px 20px calc(20px + env(safe-area-inset-bottom, 0px))",
          boxShadow: "0 -4px 24px rgba(43, 38, 32, 0.25)",
          transform: entered ? "translateY(0)" : "translateY(100%)",
          transition: "transform 220ms ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          aria-hidden="true"
          style={{
            width: 40,
            height: 4,
            borderRadius: 999,
            background: "#d8cdb8",
            margin: "0 auto 8px",
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
          <button
            type="button"
            aria-label="Đóng"
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              color: TEXT,
              fontSize: 22,
              lineHeight: 1,
              padding: "4px 8px",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
